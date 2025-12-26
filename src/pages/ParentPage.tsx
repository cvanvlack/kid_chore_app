import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiReview, apiSummary, type RequestRow } from '../api'
import { CONFIG } from '../config'
import { clearAll, getToken } from '../storage'

export default function ParentPage() {
  const nav = useNavigate()
  const token = getToken()

  const [busy, setBusy] = useState<{ request_id: string; action: 'approved' | 'denied' } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [recent, setRecent] = useState<RequestRow[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const slowTimer = useRef<number | null>(null)

  const pending = useMemo(() => recent.filter((r) => r.status === 'pending'), [recent])

  function kidName(id: string) {
    return CONFIG.KIDS.find((k) => k.id === id)?.name ?? id
  }

  function formatMaybeDate(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (!isFinite(d.getTime())) return iso
    return d.toLocaleString()
  }

  async function refresh(opts?: { reason?: 'initial' | 'manual' | 'afterReview'; silent?: boolean }) {
    if (refreshing) return
    setError('')
    setSuccess('')
    if (!opts?.silent) {
      setStatus(opts?.reason === 'initial' ? 'Loading Parent dashboard…' : 'Refreshing…')
    }

    setRefreshing(true)
    if (slowTimer.current) window.clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => {
      setStatus((s) => (s ? `${s} (still working…)` : 'Still working…'))
    }, 2500)

    try {
      const s = await apiSummary({ token, limit: 200 })
      if (!s.ok) {
        setError(s.error || 'summary failed')
        return
      }
      setRecent(s.recent)
      setBalances(s.balances || {})
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

  async function review(request_id: string, status: 'approved' | 'denied') {
    if (busy) return
    setBusy({ request_id, action: status })
    setError('')
    setSuccess('')
    setStatus(status === 'approved' ? 'Approving…' : 'Denying…')

    if (slowTimer.current) window.clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => {
      setStatus((s) => (s ? `${s} (still working…)` : 'Still working…'))
    }, 2500)
    try {
      const resp = await apiReview({ token, request_id, status })
      if (!resp.ok) throw new Error(resp.error || 'review failed')
      setSuccess(status === 'approved' ? 'Approved.' : 'Denied.')
      setStatus('')
      await refresh({ reason: 'afterReview', silent: true })
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      if (slowTimer.current) window.clearTimeout(slowTimer.current)
      slowTimer.current = null
      setStatus('')
      setBusy(null)
    }
  }

  function logout() {
    clearAll()
    nav('/setup')
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Parent</h1>
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
              disabled={refreshing || !!busy}
              style={{ marginLeft: 8, padding: '6px 10px', fontWeight: 600 }}
            >
              {refreshing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
      </div>

      <section style={{ marginTop: 8, padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Balances (approved)</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <button
            onClick={() => refresh({ reason: 'manual' })}
            disabled={loading || refreshing || !!busy}
            style={{ fontWeight: 600, opacity: loading || refreshing || !!busy ? 0.7 : 1 }}
          >
            {loading ? 'Loading…' : refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Last updated: <b>{formatMaybeDate(lastUpdatedAt)}</b>
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {CONFIG.KIDS.map((k) => (
            <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{k.name}</span>
              <b>{loading ? '…' : (balances[k.id] ?? 0).toFixed(2)}</b>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Pending approvals</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {loading && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 12, opacity: 0.8 }}>
              Loading pending requests…
            </div>
          )}
          {pending.map((r) => (
            <div
              key={r.request_id}
              style={{ padding: 12, border: '1px solid #eee', borderRadius: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>
                  {kidName(r.kid_id)} — {Number(r.amount).toFixed(2)}
                </b>
                <span style={{ opacity: 0.7, fontSize: 12 }}>{r.created_at}</span>
              </div>
              <div style={{ marginTop: 6 }}>{r.description}</div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  onClick={() => review(r.request_id, 'approved')}
                  disabled={loading || refreshing || busy?.request_id === r.request_id}
                  style={{
                    padding: 10,
                    fontWeight: 700,
                    opacity: loading || refreshing || busy?.request_id === r.request_id ? 0.7 : 1,
                  }}
                >
                  {busy?.request_id === r.request_id && busy.action === 'approved' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => review(r.request_id, 'denied')}
                  disabled={loading || refreshing || busy?.request_id === r.request_id}
                  style={{
                    padding: 10,
                    opacity: loading || refreshing || busy?.request_id === r.request_id ? 0.7 : 1,
                  }}
                >
                  {busy?.request_id === r.request_id && busy.action === 'denied' ? 'Denying…' : 'Deny'}
                </button>
                {busy?.request_id === r.request_id && (
                  <span style={{ alignSelf: 'center', fontSize: 12, opacity: 0.7 }}>
                    Sending update…
                  </span>
                )}
              </div>
            </div>
          ))}
          {!loading && !pending.length && <div style={{ opacity: 0.7 }}>No pending requests.</div>}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Recent (all)</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {loading && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 12, opacity: 0.8 }}>
              Loading recent activity…
            </div>
          )}
          {recent.slice(0, 40).map((r) => (
            <div
              key={r.request_id}
              style={{ padding: 12, border: '1px solid #f2f2f2', borderRadius: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>
                  {kidName(r.kid_id)} — {Number(r.amount).toFixed(2)}
                </b>
                <span style={{ opacity: 0.7 }}>{r.status}</span>
              </div>
              <div style={{ marginTop: 4 }}>{r.description}</div>
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>{r.created_at}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
