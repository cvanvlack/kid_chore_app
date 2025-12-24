import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CONFIG } from '../config'
import { clearAll, getKidId, getRole, getToken, setKidId, setRole, setToken } from '../storage'

export default function SetupPage() {
  const nav = useNavigate()
  const [token, setTokenState] = useState(getToken())
  const [role, setRoleState] = useState<'kid' | 'parent'>(getRole() ?? 'kid')
  const [kidId, setKidIdState] = useState(getKidId() || CONFIG.KIDS[0]?.id || 'k1')

  const kidOptions = useMemo(() => CONFIG.KIDS, [])

  function save() {
    clearAll()
    setToken(token)
    setRole(role)
    if (role === 'kid') setKidId(kidId)
    nav(role === 'kid' ? '/kid' : '/parent')
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1>Family Ledger Setup</h1>

      <label style={{ display: 'block', marginTop: 12 }}>
        Role
        <select
          value={role}
          onChange={(e) => setRoleState(e.target.value as any)}
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
            onChange={(e) => setKidIdState(e.target.value)}
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
          onChange={(e) => setTokenState(e.target.value)}
          placeholder="paste long token"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
        />
      </label>

      <button
        onClick={save}
        style={{ marginTop: 16, padding: 12, width: '100%', fontWeight: 600 }}
      >
        Save
      </button>

      <p style={{ opacity: 0.7, marginTop: 16 }}>
        Tip: install to Home Screen in Safari for the best iOS PWA experience.
      </p>
    </div>
  )
}
