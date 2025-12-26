import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiSubmit, apiSummary, type RequestRow } from '../api'
import { CONFIG } from '../config'
import { clearAll, getKidId, getToken } from '../storage'

function nonce() {
  // good enough unique for this use
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function KidPage() {
  const nav = useNavigate()
  const token = getToken()
  const kidId = getKidId()
  const kidName = useMemo(() => CONFIG.KIDS.find((k) => k.id === kidId)?.name ?? kidId, [kidId])

  const [amount, setAmount] = useState<string>('5')
  const [description, setDescription] = useState<string>('dishwasher')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [recent, setRecent] = useState<RequestRow[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const slowTimer = useRef<number | null>(null)

  function formatMaybeDate(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (!isFinite(d.getTime())) return iso
    return d.toLocaleString()
  }

  async function refresh(opts?: { reason?: 'initial' | 'manual' | 'afterSubmit'; silent?: boolean }) {
    if (refreshing) return
    setError('')
    setSuccess('')
    if (!opts?.silent) {
      setStatus(opts?.reason === 'initial' ? 'Loading your dashboard…' : 'Refreshing…')
    }

    setRefreshing(true)
    if (slowTimer.current) window.clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => {
      setStatus((s) => (s ? `${s} (still working…)` : 'Still working…'))
    }, 2500)

    try {
      const s = await apiSummary({ token, limit: 80 })
      if (!s.ok) {
        setError(s.error || 'summary failed')
        return
      }
      setRecent(s.recent.filter((r) => r.kid_id === kidId))
      setBalance(s.balances?.[kidId] ?? 0)
      setLastUpdatedAt(new Date().toISOString())
    } catch (e: any) {
      setError(`Could not refresh (network error): ${String(e?.message || e)}`)
    } finally {
      if (!opts?.silent) setStatus('')
      setRefreshing(false)
      setLoading(false)
      if (slowTimer.current) window.clearTimeout(slowTimer.current)
      slowTimer.current = null
    }
  }

  useEffect(() => {
    refresh({ reason: 'initial' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    setBusy(true)
    setError('')
    setSuccess('')
    setStatus('Submitting…')

    if (slowTimer.current) window.clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => {
      setStatus((s) => (s ? `${s} (still working…)` : 'Still working…'))
    }, 2500)
    try {
      const amt = Number(amount)
      if (!isFinite(amt) || amt === 0) throw new Error('Amount must be a non-zero number (signed).')
      if (!description.trim()) throw new Error('Description required.')

      const resp = await apiSubmit({
        token,
        kid_id: kidId,
        amount: Math.round(amt * 100) / 100,
        description: description.trim(),
        source: 'pwa',
        nonce: nonce(),
      })
      if (!resp.ok) throw new Error(resp.error || 'submit failed')
      setSuccess('Submitted (pending approval).')
      setStatus('')
      await refresh({ reason: 'afterSubmit', silent: true })
      setDescription('')
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      if (slowTimer.current) window.clearTimeout(slowTimer.current)
      slowTimer.current = null
      setStatus('')
      setBusy(false)
    }
  }

  function logout() {
    clearAll()
    nav('/setup')
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>{kidName}</h1>
        <button onClick={logout}>Change setup</button>
      </header>

      {/* Status area (screen-reader friendly) */}
      <div aria-live="polite" style={{ marginTop: 10 }}>
        {status && (
          <div style={{ padding: 10, borderRadius: 10, background: '#f3f6ff', color: '#123' }}>{status}</div>
        )}
        {success && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#e9fff1', color: '#103' }}>
            {success}
          </div>
        )}
        {error && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              background: '#ffe6e6',
              color: 'crimson',
            }}
          >
            {error}{' '}
            <button
              onClick={() => refresh({ reason: 'manual' })}
              disabled={refreshing || busy}
              style={{ marginLeft: 8, padding: '6px 10px', fontWeight: 600 }}
            >
              {refreshing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Balance (approved): <b>{loading ? '…' : balance === null ? '…' : balance.toFixed(2)}</b>
      </div>

      <section style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>New entry</h2>

        <label style={{ display: 'block', marginTop: 10 }}>
          Amount (use + for earned, - for spent)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. dishwasher, spent on pokemon cards"
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <button
          onClick={submit}
          disabled={busy || refreshing}
          style={{ marginTop: 12, padding: 12, width: '100%', fontWeight: 700 }}
        >
          {busy ? 'Submitting…' : refreshing ? 'Refreshing…' : 'Submit (creates pending request)'}
        </button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Recent</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <button
            onClick={() => refresh({ reason: 'manual' })}
            disabled={loading || refreshing || busy}
            style={{ fontWeight: 600, opacity: loading || refreshing || busy ? 0.7 : 1 }}
          >
            {loading ? 'Loading…' : refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Last updated: <b>{formatMaybeDate(lastUpdatedAt)}</b>
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {loading && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 12, opacity: 0.8 }}>
              Loading recent activity…
            </div>
          )}
          {recent.slice(0, 30).map((r) => (
            <div
              key={r.request_id}
              style={{ padding: 12, border: '1px solid #eee', borderRadius: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{Number(r.amount).toFixed(2)}</b>
                <span style={{ opacity: 0.7 }}>{String(r.status)}</span>
              </div>
              <div style={{ marginTop: 4 }}>{r.description}</div>
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>{r.created_at}</div>
            </div>
          ))}
          {!loading && !recent.length && <div style={{ opacity: 0.7 }}>No entries yet.</div>}
        </div>
      </section>
    </div>
  )
}
