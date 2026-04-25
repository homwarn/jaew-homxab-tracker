import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import logoImg from '../assets/logo.png'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) throw authErr

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', data.user.id).single()

      if (!profile) throw new Error('ບໍ່ພົບຂໍ້ມູນ Profile — ຕິດຕໍ່ Admin')
      navigate(`/${profile.role}`, { replace: true })
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        setError('ອີເມລ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ')
      } else {
        setError(msg || 'ເກີດຂໍ້ຜິດພາດ ກະລຸນາລອງໃໝ່')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 safe-top">
      {/* Hero */}
      <div className="mb-10 text-center">
        <img
          src={logoImg}
          alt="ແຈ່ວຫອມແຊບ"
          className="w-28 h-28 rounded-3xl object-cover mx-auto mb-5 shadow-2xl border-4 border-brand-yellow/40"
        />
        <h1 className="text-brand-yellow font-bold text-3xl leading-tight">ຕິດຕາມ</h1>
        <h1 className="text-white font-bold text-2xl">ແຈ່ວຫອມແຊບ</h1>
        <p className="text-gray-500 text-sm mt-2">ຜະລິດ · ກະຈາຍ · ຂາຍ</p>
      </div>

      {/* Form Card */}
      <div className="w-full max-w-sm bg-dark-700 rounded-3xl p-6 shadow-2xl border border-dark-500">
        <h2 className="text-white font-bold text-xl mb-6 text-center">ເຂົ້າສູ່ລະບົບ</h2>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-2xl px-4 py-3 text-sm mb-4 flex items-center gap-2">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="field-label">ອີເມລ</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              autoComplete="email"
              className="input-field"
            />
          </div>

          <div>
            <label className="field-label">ລະຫັດຜ່ານ</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="input-field pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading
              ? <><div className="spinner border-dark-900" />ກຳລັງເຂົ້າ...</>
              : <><LogIn size={20} />ເຂົ້າສູ່ລະບົບ</>
            }
          </button>
        </form>
      </div>

      <p className="text-gray-600 text-xs mt-6">ຕິດຕໍ່ Admin ຫາກຍັງບໍ່ມີບັນຊີ</p>
    </div>
  )
}
