import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiReview, apiSummary, type RequestRow } from '../api'
import { CONFIG } from '../config'
import { clearAll, getToken } from '../storage'

export default function ParentPage() {
  const nav = useNavigate()
  const token = getToken()

  const [busyId, setBusyId] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [recent, setRecent] = useState<RequestRow[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})

  const pending = useMemo(() => recent.filter((r) => r.status === 'pending'), [recent])

  function kidName(id: string) {
    return CONFIG.KIDS.find((k) => k.id === id)?.name ?? id
  }

  async function refresh() {
    setError('')
    const s = await apiSummary({ token, limit: 200 })
    if (!s.ok) {
      setError(s.error || 'summary failed')
      return
    }
    setRecent(s.recent)
    setBalances(s.balances || {})
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function review(request_id: string, status: 'approved' | 'denied') {
    setBusyId(request_id)
    setError('')
    try {
      const resp = await apiReview({ token, request_id, status })
      if (!resp.ok) throw new Error(resp.error || 'review failed')
      await refresh()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusyId('')
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

      <section style={{ marginTop: 8, padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Balances (approved)</h2>
        <button onClick={refresh}>Refresh</button>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {CONFIG.KIDS.map((k) => (
            <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{k.name}</span>
              <b>{(balances[k.id] ?? 0).toFixed(2)}</b>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Pending approvals</h2>
        {error && <div style={{ color: 'crimson', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'grid', gap: 10 }}>
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
                  disabled={busyId === r.request_id}
                  style={{ padding: 10, fontWeight: 700 }}
                >
                  Approve
                </button>
                <button
                  onClick={() => review(r.request_id, 'denied')}
                  disabled={busyId === r.request_id}
                  style={{ padding: 10 }}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
          {!pending.length && <div style={{ opacity: 0.7 }}>No pending requests.</div>}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Recent (all)</h2>
        <div style={{ display: 'grid', gap: 10 }}>
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
