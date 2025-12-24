import { Navigate, Route, Routes } from 'react-router-dom'
import { getRole, getToken } from './storage'
import SetupPage from './pages/SetupPage'
import KidPage from './pages/KidPage'
import ParentPage from './pages/ParentPage'

function requireSetup() {
  return !!getToken() && !!getRole()
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/kid"
        element={requireSetup() ? <KidPage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/parent"
        element={requireSetup() ? <ParentPage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/"
        element={requireSetup() ? <RoleRedirect /> : <Navigate to="/setup" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RoleRedirect() {
  const role = getRole()
  if (role === 'kid') return <Navigate to="/kid" replace />
  return <Navigate to="/parent" replace />
}
