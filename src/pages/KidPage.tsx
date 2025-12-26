import { useEffect, useMemo, useState } from 'react'
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
  const [error, setError] = useState<string>('')
  const [recent, setRecent] = useState<RequestRow[]>([])
  const [balance, setBalance] = useState<number | null>(null)

  async function refresh() {
    setError('')
    const s = await apiSummary({ token, limit: 80 })
    if (!s.ok) {
      setError(s.error || 'summary failed')
      return
    }
    setRecent(s.recent.filter((r) => r.kid_id === kidId))
    setBalance(s.balances?.[kidId] ?? 0)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    setBusy(true)
    setError('')
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
      await refresh()
      setDescription('')
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
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

      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Balance (approved): <b>{balance === null ? '…' : balance.toFixed(2)}</b>
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
          disabled={busy}
          style={{ marginTop: 12, padding: 12, width: '100%', fontWeight: 700 }}
        >
          {busy ? 'Submitting…' : 'Submit (creates pending request)'}
        </button>

        {error && <div style={{ marginTop: 10, color: 'crimson' }}>{error}</div>}
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Recent</h2>
        <button onClick={refresh}>Refresh</button>
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
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
          {!recent.length && <div style={{ opacity: 0.7 }}>No entries yet.</div>}
        </div>
      </section>
    </div>
  )
}
