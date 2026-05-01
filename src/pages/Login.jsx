import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import logoImg from '../assets/logo.png'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

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
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
        setError('ອີເມລ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ')
      else
        setError(msg || 'ເກີດຂໍ້ຜິດພາດ ກະລຸນາລອງໃໝ່')
    } finally { setLoading(false) }
  }

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row safe-top"
      style={{
        background: '#070707',
        backgroundImage: `
          radial-gradient(ellipse 90% 50% at 50% -5%, rgba(242,183,5,0.07) 0%, transparent 65%),
          radial-gradient(ellipse 50% 30% at 80% 100%, rgba(212,146,10,0.04) 0%, transparent 60%)
        `,
      }}
    >

      {/* ── Left branding panel — desktop only ── */}
      <div
        className="hidden lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center lg:px-16"
        style={{
          background: 'linear-gradient(160deg, #0d0d0d 0%, #080808 100%)',
          borderRight: '1px solid rgba(242,183,5,0.1)',
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '6px',
            borderRadius: '40px',
            background: 'linear-gradient(135deg, rgba(242,183,5,0.3), rgba(212,146,10,0.15))',
            boxShadow: '0 0 60px rgba(242,183,5,0.2), 0 0 0 1px rgba(242,183,5,0.15)',
            marginBottom: '36px',
          }}
        >
          <img
            src={logoImg}
            alt="ແຈ່ວຫອມແຊບ"
            style={{ width: 160, height: 160, borderRadius: 34, objectFit: 'cover', display: 'block' }}
          />
        </div>

        <h1
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: '3.5rem',
            fontWeight: 700,
            color: '#F2B705',
            lineHeight: 1.1,
            textShadow: '0 0 32px rgba(242,183,5,0.3)',
          }}
        >
          ຕິດຕາມ
        </h1>
        <h1
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: '2.75rem',
            fontWeight: 600,
            color: '#f0e8d8',
            marginTop: 4,
          }}
        >
          ແຈ່ວຫອມແຊບ
        </h1>
        <p style={{ color: '#555', fontSize: '1.125rem', marginTop: 16, letterSpacing: '0.1em' }}>
          ຜະລິດ · ກະຈາຍ · ຂາຍ
        </p>

        {/* Divider */}
        <div
          style={{
            width: 120,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(242,183,5,0.4), transparent)',
            margin: '32px 0',
          }}
        />

        <div style={{ display: 'flex', gap: 32, color: '#444', fontSize: '0.9rem' }}>
          <span>🏭 ຜູ້ຜະລິດ</span>
          <span>🚚 ຜູ້ກະຈາຍ</span>
          <span>🛒 ຜູ້ຂາຍ</span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-12 lg:px-12 lg:max-w-[520px] lg:mx-auto">

        {/* Mobile hero */}
        <div className="mb-10 text-center lg:hidden">
          <div
            style={{
              display: 'inline-block',
              padding: '4px',
              borderRadius: '28px',
              background: 'linear-gradient(135deg, rgba(242,183,5,0.25), rgba(212,146,10,0.12))',
              boxShadow: '0 0 40px rgba(242,183,5,0.18)',
              marginBottom: 20,
            }}
          >
            <img
              src={logoImg}
              alt="ແຈ່ວຫອມແຊບ"
              style={{ width: 100, height: 100, borderRadius: 24, objectFit: 'cover', display: 'block' }}
            />
          </div>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: '2.25rem',
              fontWeight: 700,
              color: '#F2B705',
              textShadow: '0 0 24px rgba(242,183,5,0.3)',
              lineHeight: 1.1,
            }}
          >
            ຕິດຕາມ
          </h1>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: '1.875rem',
              fontWeight: 600,
              color: '#f0e8d8',
              marginTop: 2,
            }}
          >
            ແຈ່ວຫອມແຊບ
          </h1>
          <p style={{ color: '#555', fontSize: '0.875rem', marginTop: 8, letterSpacing: '0.08em' }}>
            ຜະລິດ · ກະຈາຍ · ຂາຍ
          </p>
        </div>

        {/* Form Card */}
        <div
          className="w-full max-w-sm"
          style={{
            background: 'linear-gradient(160deg, #151515 0%, #0d0d0d 100%)',
            borderRadius: '28px',
            border: '1px solid rgba(242,183,5,0.14)',
            boxShadow: '0 16px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.04)',
            padding: '28px 24px 32px',
          }}
        >
          {/* Card top accent */}
          <div
            style={{
              height: '2px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(242,183,5,0.5) 30%, rgba(242,183,5,0.8) 50%, rgba(242,183,5,0.5) 70%, transparent 100%)',
              borderRadius: '2px',
              marginBottom: '24px',
            }}
          />

          <h2
            className="text-center mb-6 font-bold text-lg"
            style={{ color: '#f0e8d8', letterSpacing: '0.03em' }}
          >
            ເຂົ້າສູ່ລະບົບ
          </h2>

          {error && (
            <div
              className="text-sm mb-5 flex items-center gap-2"
              style={{
                background: 'rgba(153,27,27,0.25)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#fca5a5',
                borderRadius: '14px',
                padding: '12px 14px',
              }}
            >
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
                  className="input-field"
                  style={{ paddingRight: '48px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#555' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#F2B705'}
                  onMouseLeave={e => e.currentTarget.style.color = '#555'}
                >
                  {showPass ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading
                ? <><div className="spinner" style={{ borderTopColor: '#050505' }} />ກຳລັງເຂົ້າ...</>
                : <><LogIn size={19} />ເຂົ້າສູ່ລະບົບ</>
              }
            </button>
          </form>
        </div>

        <p className="text-xs mt-6" style={{ color: '#383838' }}>ຕິດຕໍ່ Admin ຫາກຍັງບໍ່ມີບັນຊີ</p>
        <p
          className="text-[10px] mt-2 select-none tracking-widest uppercase"
          style={{ color: 'rgba(242,183,5,0.18)' }}
        >
          version 1.0 · dev by soulixay insixiengmai
        </p>
      </div>
    </div>
  )
}
