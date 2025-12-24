# Family Allowance & Chore Ledger

## Purpose

A low-friction system for tracking kids’ money using:

- NFC tags at chore locations (near-zero click)
- iOS Shortcuts automations
- A simple PWA for kids and parents
- Google Sheets as the durable backend

The core design goal is **logging beats perfection**: any action should be recordable in seconds, with approval handled later.

## Core principles

- **Everything is a transaction**: money earned or spent is a signed number with a free-text description.
- **Append-only history**: no edits to amounts or descriptions; corrections are new entries.
- **Centralized intake**: all writes go through a single API endpoint.
- **Human-readable first**: per-kid ledgers are meant to be reviewed together.
- **Good-enough security**: long random tokens; no personal data; compromise is non-fatal.

## Architecture overview

### Backend

- Google Apps Script Web App
- Public HTTPS endpoint
- Token-based auth (per kid, per parent)
- Appends rows to Google Sheets
- Handles approval workflow

### Storage

- Google Sheet as the source of truth
- One append-only table (`Requests`)
- Computed views for kids and parents

### Clients

- iOS Shortcuts
  - NFC-triggered automations for chores
  - Optional group chat notifications
- PWA
  - Kid view: recent activity
  - Parent view: approval inbox + balances

## Data model (Google Sheets)

### `Config` tab

Static configuration.

| kid_id | kid_name |
| --- | --- |
| k1 | Alice |
| k2 | Bob |
| k3 | Charlie |

### `Requests` tab (source of truth)

Every submission appends exactly one row.

| column | meaning |
| --- | --- |
| request_id | UUID |
| created_at | Timestamp (server-generated) |
| kid_id | `k1`, `k2`, etc |
| amount | Signed number (`+5.00`, `-3.50`) |
| description | Free-text (`"dishwasher"`, `"spent on pokemon cards"`) |
| status | `pending`, `approved`, `denied` |
| reviewed_at | Timestamp |
| reviewed_by | Parent identifier |
| review_note | Optional |
| source | `nfc`, `pwa`, `parent` |
| nonce | Idempotency key |

#### Rules

- `amount > 0` → earned
- `amount < 0` → spent
- No row is deleted or edited for correction; corrections are new rows.

### Per-kid tabs (`Kid - Alice`, etc.)

Read-only filtered views for reviewing together.

Columns:

- `timestamp`
- `amount`
- `description`
- `running_balance`

Derived from `Requests` where:

- `kid_id` matches
- `status == approved`

### `Parent - Inbox` tab

Filtered view of pending requests:

- `timestamp`
- kid name
- `amount`
- `description`
- `request_id`

Used for manual review or as a debugging fallback.

## API contract (Apps Script Web App)

### Endpoint

`POST /exec`

### Authentication

- Long random bearer token (128+ bits)
- Token provided in **request body** (not headers) to avoid CORS preflight issues
- Kid tokens: submit only
- Parent tokens: approve / deny

### Submit transaction

Creates a pending request.

Body (form-encoded or `text/plain`):

```text
token=...
kid_id=k1
amount=5
description=dishwasher
nonce=abc123
source=nfc
```

Server behavior:

- Validate token + kid scope
- De-duplicate by nonce
- Append to `Requests` with:
  - `status=pending`
  - `created_at=now()`

### Review transaction (parent only)

Approves or denies an existing request.

Body:

```text
token=...
request_id=...
status=approved|denied
review_note=optional
```

Server behavior:

- Update status + review metadata
- No mutation of amount or description

## NFC + Shortcuts design

### NFC tags

- One tag per chore per kid (cheap + zero friction)
- Tag identity maps to a specific automation

### Shortcut automation flow

1. Triggered by NFC scan
2. Get Contents of URL (POST → Apps Script)
3. (Optional) Send iMessage to family group:
   - `"Dishwasher: Alice (+$5)"`

The notification logic lives entirely in Shortcuts (iMessage has no webhook API).

## PWA responsibilities

### Kid view

- Read-only recent activity
- Manual entry fallback (non-NFC cases)

### Parent view

- Pending approvals
- One-tap approve / deny
- Balances per kid

No writes happen directly to Sheets; everything goes through the API.

## Idempotency & safety

- Each request includes a nonce
- Server stores recent nonces per token
- Duplicate submissions are ignored
- Simple rate limiting (per token) prevents accidental spam

## Explicit non-goals

- No chore database
- No predefined categories
- No reconciliation logic
- No strong security guarantees
- No financial correctness beyond “good enough”

This is a family habit system, not accounting software.

## Future extensions (non-binding)

- Push notifications to parent PWA
- Offline PWA queue + retry
- Weekly summaries
- Allowance auto-posts
- Export to CSV / yearly archive

## Summary

This system optimizes for:

- minimal friction
- transparency
- explainability to kids
- durability over years

If the logging is easy, the behavior sticks.
