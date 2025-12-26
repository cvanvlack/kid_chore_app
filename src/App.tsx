import { Navigate, Route, Routes } from 'react-router-dom'
import { getRole, getToken } from './storage'
import SetupPage from './pages/SetupPage'
import KidPage from './pages/KidPage'
import ParentPage from './pages/ParentPage'

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/kid"
        element={
          <RequireSetup>
            <KidPage />
          </RequireSetup>
        }
      />
      <Route
        path="/parent"
        element={
          <RequireSetup>
            <ParentPage />
          </RequireSetup>
        }
      />
      <Route
        path="/"
        element={
          <RequireSetup>
            <RoleRedirect />
          </RequireSetup>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RequireSetup({ children }: { children: React.ReactNode }) {
  // IMPORTANT: this must run during route render, not at App() render time.
  // localStorage changes won't re-render App, but they will be reflected here
  // as soon as the user navigates to a guarded route.
  const ok = !!getToken() && !!getRole()
  if (!ok) return <Navigate to="/setup" replace />
  return <>{children}</>
}

function RoleRedirect() {
  const role = getRole()
  if (role === 'kid') return <Navigate to="/kid" replace />
  return <Navigate to="/parent" replace />
}
