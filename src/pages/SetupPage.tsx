import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiSummary } from '../api'
import { CONFIG } from '../config'
import {
  clearAll,
  getKidId,
  getRole,
  getSetupUpdatedAt,
  getToken,
  setKidId,
  setRole,
  setSetupUpdatedAt,
  setToken,
} from '../storage'

function maskToken(raw: string) {
  const t = (raw ?? '').trim()
  if (!t) return '(empty)'
  if (t.length <= 8) return `${'•'.repeat(t.length)} (${t.length} chars)`
  return `${t.slice(0, 4)}…${t.slice(-4)} (${t.length} chars)`
}

function formatMaybeDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!isFinite(d.getTime())) return iso
  return d.toLocaleString()
}

export default function SetupPage() {
  const nav = useNavigate()
  const [token, setTokenState] = useState(getToken())
  const [role, setRoleState] = useState<'kid' | 'parent'>(getRole() ?? 'kid')
  const [kidId, setKidIdState] = useState(getKidId() || CONFIG.KIDS[0]?.id || 'k1')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validateBeforeSave, setValidateBeforeSave] = useState(true)

  const [stored, setStored] = useState(() => ({
    token: getToken(),
    role: getRole(),
    kidId: getKidId(),
    updatedAt: getSetupUpdatedAt(),
  }))

  const slowTimer = useRef<number | null>(null)

  const kidOptions = useMemo(() => CONFIG.KIDS, [])

  const currentToken = token.trim()
  const isSetupComplete = !!stored.token.trim() && !!stored.role
  const hasUnsavedChanges =
    currentToken !== stored.token.trim() ||
    role !== (stored.role ?? 'kid') ||
    (role === 'kid' ? kidId !== (stored.kidId || '') : stored.kidId !== '')

  async function validateToken() {
    setError('')
    setSuccess('')
    setStatus('')
    if (!currentToken) {
      setError('Please enter a token')
      return false
    }

    setValidating(true)
    setStatus('Validating token…')

    // If validation takes a while, make that explicit (feels better on mobile).
    if (slowTimer.current) window.clearTimeout(slowTimer.current)
    slowTimer.current = window.setTimeout(() => {
      setStatus('Still validating… (network may be slow)')
    }, 2500)

    try {
      const s = await apiSummary({
        token: currentToken,
        kid_id: role === 'kid' ? kidId : undefined,
        limit: 1,
      })

      if (!s.ok) {
        setError(s.error || 'Token validation failed')
        setStatus('')
        return false
      }

      setSuccess('Token looks valid.')
      setStatus('')
      return true
    } catch (e: any) {
      setError(`Could not validate (network error): ${String(e?.message || e)}`)
      setStatus('')
      return false
    } finally {
      if (slowTimer.current) window.clearTimeout(slowTimer.current)
      slowTimer.current = null
      setValidating(false)
    }
  }

  async function save() {
    if (saving) return
    setError('')
    setSuccess('')
    setStatus('')

    if (!currentToken) {
      setError('Please enter a token')
      return
    }

    setSaving(true)
    setStatus(validateBeforeSave ? 'Saving… (validating token first)' : 'Saving…')

    try {
      if (validateBeforeSave) {
        const ok = await validateToken()
        if (!ok) {
          setStatus('Save cancelled (token not validated). You can uncheck validation and try again.')
          return
        }
      }

      clearAll()
      setToken(currentToken)
      setRole(role)
      if (role === 'kid') setKidId(kidId)

      const now = new Date().toISOString()
      setSetupUpdatedAt(now)
      setStored({
        token: currentToken,
        role,
        kidId: role === 'kid' ? kidId : '',
        updatedAt: now,
      })

      setSuccess(`Saved. Redirecting to ${role === 'kid' ? 'Kid' : 'Parent'}…`)
      setStatus('')
      nav(role === 'kid' ? '/kid' : '/parent')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1>Family Ledger Setup</h1>

      <section style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <b>Current stored setup</b>
          <span
            style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid #ddd',
              background: isSetupComplete ? '#e9fff1' : '#fff7e6',
            }}
          >
            {isSetupComplete ? 'Ready' : 'Incomplete'}
          </span>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 13 }}>
          <div>
            <span style={{ opacity: 0.7 }}>Role:</span> <b>{stored.role ?? '—'}</b>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Kid:</span> <b>{stored.kidId || '—'}</b>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Token:</span> <b>{maskToken(stored.token)}</b>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Last saved:</span> <b>{formatMaybeDate(stored.updatedAt)}</b>
          </div>
          <div style={{ marginTop: 4, opacity: 0.75 }}>
            {hasUnsavedChanges ? 'You have unsaved changes.' : 'No unsaved changes.'}
          </div>
        </div>
      </section>

      <label style={{ display: 'block', marginTop: 12 }}>
        Role
        <select
          value={role}
          onChange={(e) => {
            setRoleState(e.target.value as 'kid' | 'parent')
            setError('')
            setSuccess('')
            setStatus('')
          }}
          style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
        >
          <option value="kid">Kid</option>
          <option value="parent">Parent</option>
        </select>
      </label>

      {role === 'kid' && (
        <label style={{ display: 'block', marginTop: 12 }}>
          Kid
          <select
            value={kidId}
            onChange={(e) => {
              setKidIdState(e.target.value)
              setError('')
              setSuccess('')
              setStatus('')
            }}
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
          >
            {kidOptions.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({k.id})
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={{ display: 'block', marginTop: 12 }}>
        Token
        <input
          value={token}
          onChange={(e) => {
            setTokenState(e.target.value)
            setError('')
            setSuccess('')
            setStatus('')
          }}
          placeholder="paste long token"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
        />
      </label>

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={validateBeforeSave}
          onChange={(e) => setValidateBeforeSave(e.target.checked)}
        />
        <span style={{ fontSize: 13, opacity: 0.85 }}>
          Validate token on Save (recommended; uncheck if you’re offline)
        </span>
      </label>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={validateToken}
          disabled={saving || validating || !currentToken}
          style={{ padding: 10, fontWeight: 600, flex: 1 }}
        >
          {validating ? 'Validating…' : 'Validate token'}
        </button>
        <button
          onClick={() => {
            clearAll()
            setStored({ token: '', role: null, kidId: '', updatedAt: null })
            setTokenState('')
            setRoleState('kid')
            setKidIdState(CONFIG.KIDS[0]?.id || 'k1')
            setError('')
            setSuccess('Cleared saved setup.')
            setStatus('')
          }}
          disabled={saving || validating}
          style={{ padding: 10 }}
        >
          Clear saved setup
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#f3f6ff', color: '#123' }}>
          {status}
        </div>
      )}

      {success && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#e9fff1', color: '#103' }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{ color: 'crimson', marginTop: 8, padding: 8, background: '#ffe6e6', borderRadius: 4 }}>
          {error}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || validating}
        style={{ marginTop: 16, padding: 12, width: '100%', fontWeight: 700, opacity: saving || validating ? 0.7 : 1 }}
      >
        {saving ? 'Saving…' : validating ? 'Validating…' : 'Save & Continue'}
      </button>

      <p style={{ opacity: 0.7, marginTop: 16 }}>
        Tip: install to Home Screen in Safari for the best iOS PWA experience.
      </p>
    </div>
  )
}
