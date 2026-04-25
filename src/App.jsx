import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import ProducerDashboard from './pages/ProducerDashboard'
import DistributorDashboard from './pages/DistributorDashboard'
import SellerDashboard from './pages/SellerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import logoImg from './assets/logo.png'

// ─── Auth Context ──────────────────────────────────────────────────────────
export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// ─── Loader ───────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4">
      <img src={logoImg} alt="Logo" className="w-20 h-20 rounded-2xl object-cover animate-pulse" />
      <div className="text-brand-yellow text-lg font-medium animate-pulse">ກຳລັງໂຫລດ...</div>
    </div>
  )
}

// ─── Protected Route ───────────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to={`/${profile.role}`} replace />
  }
  return children
}

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(data)
    } catch (e) {
      console.error('fetchProfile error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setProfile(null)
  }

  const roleRedirect = profile ? `/${profile.role}` : '/login'

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, fetchProfile }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            loading ? <Loader /> :
            user && profile ? <Navigate to={roleRedirect} replace /> : <Login />
          } />

          <Route path="/producer/*" element={
            <ProtectedRoute allowedRoles={['producer']}>
              <ProducerDashboard />
            </ProtectedRoute>
          } />

          <Route path="/distributor/*" element={
            <ProtectedRoute allowedRoles={['distributor']}>
              <DistributorDashboard />
            </ProtectedRoute>
          } />

          <Route path="/seller/*" element={
            <ProtectedRoute allowedRoles={['seller']}>
              <SellerDashboard />
            </ProtectedRoute>
          } />

          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/" element={
            loading ? <Loader /> :
            user && profile ? <Navigate to={roleRedirect} replace /> :
            <Navigate to="/login" replace />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
