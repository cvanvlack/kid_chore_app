const KEY = {
  token: 'ledger_token',
  role: 'ledger_role',
  kidId: 'ledger_kid_id',
  setupUpdatedAt: 'ledger_setup_updated_at',
} as const

export function getToken() {
  return localStorage.getItem(KEY.token) ?? ''
}
export function setToken(v: string) {
  localStorage.setItem(KEY.token, v.trim())
}

export function getRole() {
  return (localStorage.getItem(KEY.role) as 'kid' | 'parent' | null) ?? null
}
export function setRole(v: 'kid' | 'parent') {
  localStorage.setItem(KEY.role, v)
}

export function getKidId() {
  return localStorage.getItem(KEY.kidId) ?? ''
}
export function setKidId(v: string) {
  localStorage.setItem(KEY.kidId, v)
}

export function getSetupUpdatedAt() {
  return localStorage.getItem(KEY.setupUpdatedAt)
}
export function setSetupUpdatedAt(v: string) {
  localStorage.setItem(KEY.setupUpdatedAt, v)
}

export function clearAll() {
  localStorage.removeItem(KEY.token)
  localStorage.removeItem(KEY.role)
  localStorage.removeItem(KEY.kidId)
  localStorage.removeItem(KEY.setupUpdatedAt)
}
