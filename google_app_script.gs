/**
 * Family Allowance Ledger - Apps Script Web App backend
 *
 * Endpoints (POST):
 *   action=submit  -> kid submits a pending transaction
 *   action=review  -> parent approves/denies an existing request
 *   action=summary -> balances + recent requests (for UI)
 *   action=health  -> basic sanity info
 *
 * IMPORTANT CORS NOTE:
 * - Prefer x-www-form-urlencoded payloads (simple requests) to avoid browser preflight issues.  [oai_citation:2‡Google Groups](https://groups.google.com/g/google-apps-script-community/c/zJpevovcFLA?utm_source=chatgpt.com)
 */

const SHEET_REQUESTS = "Requests";
const SHEET_CONFIG = "Config";

// Request statuses
const STATUS_PENDING = "pending";
const STATUS_APPROVED = "approved";
const STATUS_DENIED = "denied";

// --- Public entry points ---

function doGet(e) {
  // Provide a minimal GET for quick testing / basic liveness.
  // Also helps some clients that probe with GET.  [oai_citation:3‡Google for Developers](https://developers.google.com/apps-script/guides/web?utm_source=chatgpt.com)
  const action = (e && e.parameter && e.parameter.action) || "health";
  return handleAction_(action, e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  const params = parseParams_(e);
  const action = (params.action || "health").toLowerCase();
  return handleAction_(action, params);
}

// --- Core routing ---

function handleAction_(action, params) {
  try {
    if (action === "health") return json_({ ok: true, service: "family-ledger", now: new Date().toISOString() });

    // Load sheets & header maps once per request
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const reqSheet = ss.getSheetByName(SHEET_REQUESTS);
    const cfgSheet = ss.getSheetByName(SHEET_CONFIG);
    if (!reqSheet) return json_({ ok: false, error: `Missing sheet: ${SHEET_REQUESTS}` }, 500);
    if (!cfgSheet) return json_({ ok: false, error: `Missing sheet: ${SHEET_CONFIG}` }, 500);

    const reqMap = headerMap_(reqSheet);
    const cfgKids = loadKids_(cfgSheet);

    if (action === "submit") {
      const auth = requireAuth_(params.token);
      if (auth.role !== "kid") return json_({ ok: false, error: "Only kid tokens can submit." }, 403);

      const kid_id = (params.kid_id || auth.kid_id || "").trim();
      if (!kid_id) return json_({ ok: false, error: "kid_id required." }, 400);
      if (!cfgKids.has(kid_id)) return json_({ ok: false, error: `Unknown kid_id: ${kid_id}` }, 400);
      if (auth.kid_id && auth.kid_id !== kid_id) return json_({ ok: false, error: "Token not valid for that kid_id." }, 403);

      const amount = parseAmount_(params.amount);
      if (amount === null) return json_({ ok: false, error: "amount must be a number (signed)." }, 400);

      const description = (params.description || "").trim();
      if (!description) return json_({ ok: false, error: "description required." }, 400);

      const source = (params.source || "unknown").trim().toLowerCase();
      const nonce = (params.nonce || "").trim();
      if (!nonce) return json_({ ok: false, error: "nonce required (idempotency key)." }, 400);

      // Idempotency: reject duplicates per (token_hash + nonce)
      const tokenHash = sha256Hex_(params.token);
      const idemKey = `nonce:${tokenHash}:${nonce}`;
      const cache = CacheService.getScriptCache();
      if (cache.get(idemKey)) {
        return json_({ ok: true, deduped: true });
      }

      // Concurrency-safe append
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        // Double-check cache inside lock for extra safety
        if (cache.get(idemKey)) {
          return json_({ ok: true, deduped: true });
        }

        const request_id = Utilities.getUuid();
        const created_at = new Date();

        const rowObj = {
          request_id,
          created_at,
          kid_id,
          amount,
          description,
          status: STATUS_PENDING,
          reviewed_at: "",
          reviewed_by: "",
          review_note: "",
          source,
          nonce
        };

        appendByHeaders_(reqSheet, reqMap, rowObj);

        // Cache idempotency key for 6 hours
        cache.put(idemKey, "1", 6 * 60 * 60);

        return json_({ ok: true, request_id, status: STATUS_PENDING });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "review") {
      const auth = requireAuth_(params.token);
      if (auth.role !== "parent") return json_({ ok: false, error: "Only parent tokens can review." }, 403);

      const request_id = (params.request_id || "").trim();
      if (!request_id) return json_({ ok: false, error: "request_id required." }, 400);

      const status = (params.status || "").trim().toLowerCase();
      if (![STATUS_APPROVED, STATUS_DENIED].includes(status)) {
        return json_({ ok: false, error: "status must be approved or denied." }, 400);
      }

      const review_note = (params.review_note || "").trim();
      const reviewed_by = (params.reviewed_by || auth.parent_id || "parent").trim();

      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        const rowIndex = findRowByRequestId_(reqSheet, reqMap, request_id);
        if (rowIndex === null) return json_({ ok: false, error: "request_id not found." }, 404);

        const currentStatus = String(reqSheet.getRange(rowIndex, reqMap.status).getValue() || "").toLowerCase();
        if (currentStatus !== STATUS_PENDING) {
          return json_({ ok: false, error: `Cannot review; current status is ${currentStatus}.` }, 409);
        }

        const now = new Date();
        reqSheet.getRange(rowIndex, reqMap.status).setValue(status);
        reqSheet.getRange(rowIndex, reqMap.reviewed_at).setValue(now);
        reqSheet.getRange(rowIndex, reqMap.reviewed_by).setValue(reviewed_by);
        reqSheet.getRange(rowIndex, reqMap.review_note).setValue(review_note);

        return json_({ ok: true, request_id, status });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "summary") {
      // Either kid or parent can read summary, but scope differs.
      const auth = requireAuth_(params.token);
      const requestedKid = (params.kid_id || "").trim();

      let kidScope = null;
      if (auth.role === "kid") {
        kidScope = auth.kid_id; // kid can only see own data
      } else if (auth.role === "parent") {
        kidScope = requestedKid || null; // parent can filter by kid or see all
      }

      const data = readRequests_(reqSheet, reqMap, kidScope);
      const balances = computeBalances_(data);

      // Return last N requests (approved/pending/denied) for UI convenience
      const limit = Math.max(1, Math.min(200, parseInt(params.limit || "50", 10) || 50));
      const recent = data
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);

      return json_({ ok: true, scope: kidScope || "all", balances, recent });
    }

    return json_({ ok: false, error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) }, 500);
  }
}

// --- Helpers: parsing & response ---

function parseParams_(e) {
  // For x-www-form-urlencoded, Apps Script exposes fields in e.parameter.  [oai_citation:4‡Stack Overflow](https://stackoverflow.com/questions/59993027/unable-to-parse-x-www-form-urlencoded-using-apps-script-webhooks?utm_source=chatgpt.com)
  const p = (e && e.parameter) ? { ...e.parameter } : {};

  // Support Shortcuts / curl sending text/plain JSON (optional)
  if (e && e.postData && e.postData.contents && typeof e.postData.contents === "string") {
    const ct = (e.postData.type || "").toLowerCase();
    if (ct.includes("application/json") || ct.includes("text/plain")) {
      const raw = e.postData.contents.trim();
      if (raw.startsWith("{") && raw.endsWith("}")) {
        try {
          const obj = JSON.parse(raw);
          Object.assign(p, obj);
        } catch (_) {
          // ignore JSON parse errors; rely on e.parameter
        }
      }
    }
  }
  return p;
}

function json_(obj, status) {
  // Apps Script Web Apps return TextOutput.  [oai_citation:5‡Google for Developers](https://developers.google.com/apps-script/guides/web?utm_source=chatgpt.com)
  const out = ContentService.createTextOutput(JSON.stringify({ ...obj, _status: status || 200 }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function parseAmount_(v) {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).trim());
  if (!isFinite(n)) return null;
  // Keep to cents; store as a number in Sheets
  return Math.round(n * 100) / 100;
}

// --- Helpers: sheet access ---

function headerMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = {};
  headers.forEach((h, i) => {
    const key = h.trim();
    if (key) map[key] = i + 1; // 1-based column
  });

  // Validate required headers
  const required = [
    "request_id","created_at","kid_id","amount","description","status",
    "reviewed_at","reviewed_by","review_note","source","nonce"
  ];
  const missing = required.filter(r => !map[r]);
  if (missing.length) throw new Error(`Requests sheet missing headers: ${missing.join(", ")}`);

  return map;
}

function appendByHeaders_(sheet, map, rowObj) {
  const row = new Array(sheet.getLastColumn()).fill("");
  Object.keys(rowObj).forEach(k => {
    if (map[k]) row[map[k] - 1] = rowObj[k];
  });
  sheet.appendRow(row);
}

function loadKids_(cfgSheet) {
  const values = cfgSheet.getDataRange().getValues();
  if (values.length < 2) return new Set();

  const headers = values[0].map(String);
  const kidIdCol = headers.findIndex(h => String(h).trim() === "kid_id");
  if (kidIdCol < 0) throw new Error("Config sheet must include a 'kid_id' header.");

  const kids = new Set();
  for (let r = 1; r < values.length; r++) {
    const kid = String(values[r][kidIdCol] || "").trim();
    if (kid) kids.add(kid);
  }
  return kids;
}

function findRowByRequestId_(sheet, map, request_id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const col = map.request_id;
  const ids = sheet.getRange(2, col, lastRow - 1, 1).getValues().map(r => String(r[0] || ""));
  const idx = ids.findIndex(x => x === request_id);
  return (idx >= 0) ? (2 + idx) : null; // convert to sheet row index
}

function readRequests_(sheet, map, kidScopeOrNull) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  const rows = range.getValues();

  const inv = invertHeaderMap_(map);
  const out = [];
  for (const r of rows) {
    const obj = {};
    for (let c = 0; c < r.length; c++) {
      const h = inv[c + 1];
      if (h) obj[h] = r[c];
    }
    if (kidScopeOrNull && String(obj.kid_id).trim() !== kidScopeOrNull) continue;
    // Normalize timestamps to ISO strings for API
    obj.created_at = toIso_(obj.created_at);
    obj.reviewed_at = toIso_(obj.reviewed_at);
    obj.amount = Number(obj.amount);
    out.push(obj);
  }
  return out;
}

function invertHeaderMap_(map) {
  const inv = {};
  Object.keys(map).forEach(k => inv[map[k]] = k);
  return inv;
}

function toIso_(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return v.toISOString();
  // Sheets sometimes stores as string; try parse
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function computeBalances_(requests) {
  // Balance = sum(amount) for approved only
  const balances = {};
  for (const r of requests) {
    const kid = String(r.kid_id || "").trim();
    if (!kid) continue;
    if (!(kid in balances)) balances[kid] = 0;
    if (String(r.status).toLowerCase() === STATUS_APPROVED) {
      const amt = Number(r.amount);
      balances[kid] += isFinite(amt) ? amt : 0;
    }
  }
  // round to cents
  Object.keys(balances).forEach(k => balances[k] = Math.round(balances[k] * 100) / 100);
  return balances;
}

// --- Auth ---

/**
 * Token storage strategy:
 * - Store token hashes in Script Properties:
 *     KID_TOKEN_HASH_k1 = <sha256hex(token)>
 *     KID_TOKEN_HASH_k2 = ...
 *     PARENT_TOKEN_HASH_p1 = <sha256hex(token)>
 *
 * This avoids raw tokens living in the sheet.
 *
 * Hashing uses Utilities.computeDigest.  [oai_citation:6‡Google for Developers](https://developers.google.com/apps-script/reference/utilities/utilities?utm_source=chatgpt.com)
 */
function requireAuth_(token) {
  token = String(token || "").trim();
  if (!token) throw new Error("token required.");

  const tokenHash = sha256Hex_(token);
  const props = PropertiesService.getScriptProperties().getProperties();

  // kids
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("KID_TOKEN_HASH_") && v === tokenHash) {
      const kid_id = k.substring("KID_TOKEN_HASH_".length);
      return { role: "kid", kid_id };
    }
    if (k.startsWith("PARENT_TOKEN_HASH_") && v === tokenHash) {
      const parent_id = k.substring("PARENT_TOKEN_HASH_".length);
      return { role: "parent", parent_id };
    }
  }
  throw new Error("Invalid token.");
}

function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * One-time setup helper.
 * Run this manually in Apps Script to register tokens without storing them in the sheet.
 */
function SET_TOKENS_EXAMPLE() {
  // Replace these with your real long random tokens
  const kidTokens = {
    k1: "REPLACE_ME_KID1_TOKEN",
    k2: "REPLACE_ME_KID2_TOKEN",
    k3: "REPLACE_ME_KID3_TOKEN",
  };
  const parentTokens = {
    p1: "REPLACE_ME_PARENT1_TOKEN",
    // p2: "REPLACE_ME_PARENT2_TOKEN",
  };

  const props = PropertiesService.getScriptProperties();
  for (const [kid, tok] of Object.entries(kidTokens)) {
    props.setProperty(`KID_TOKEN_HASH_${kid}`, sha256Hex_(tok));
  }
  for (const [pid, tok] of Object.entries(parentTokens)) {
    props.setProperty(`PARENT_TOKEN_HASH_${pid}`, sha256Hex_(tok));
  }

  Logger.log("Tokens registered (hashes stored in Script Properties).");
}
