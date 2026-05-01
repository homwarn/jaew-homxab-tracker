import { useAuth, useTheme } from '../App'
import { LogOut, Sun, Moon } from 'lucide-react'
import logoImg from '../assets/logo.png'

// ─── Top Header ───────────────────────────────────────────────────────────
export function Header({ title, subtitle, middleActions }) {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <header
      className="sticky top-0 z-40 safe-top"
      style={{
        background: 'rgba(7,7,7,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(242,183,5,0.12)',
        boxShadow: '0 1px 24px rgba(0,0,0,0.6)',
      }}
    >
      <div className="flex items-center justify-between max-w-screen-2xl mx-auto px-4 md:px-6 py-3 gap-2">

        {/* Logo + Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="rounded-xl overflow-hidden shrink-0"
            style={{
              boxShadow: '0 0 0 1px rgba(242,183,5,0.25), 0 4px 16px rgba(242,183,5,0.15)',
              padding: '1px',
              background: 'linear-gradient(135deg, rgba(242,183,5,0.3) 0%, rgba(212,146,10,0.2) 100%)',
            }}
          >
            <img src={logoImg} alt="Logo" className="h-8 w-8 rounded-[10px] object-cover block" />
          </div>
          <div>
            <h1
              className="font-bold text-base leading-none"
              style={{
                color: '#F2B705',
                textShadow: '0 0 20px rgba(242,183,5,0.35)',
                letterSpacing: '0.01em',
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: '#666' }}>{subtitle}</p>
            )}
          </div>
        </div>

        {/* Middle slot */}
        {middleActions && (
          <div className="flex items-center gap-1 flex-1 justify-center overflow-x-auto px-1 no-scrollbar">
            {middleActions}
          </div>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium leading-none" style={{ color: '#e0d8c8' }}>{profile?.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#555' }}>{ROLE_LABELS[profile?.role]}</p>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            style={{
              padding: '8px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#888',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.color='#F2B705'; e.currentTarget.style.borderColor='rgba(242,183,5,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color='#888'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; }}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Sign out */}
          <button
            onClick={signOut}
            title="ອອກຈາກລະບົບ"
            style={{
              padding: '8px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#888',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.color='#f87171'; e.currentTarget.style.borderColor='rgba(239,68,68,0.25)'; e.currentTarget.style.background='rgba(153,27,27,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color='#888'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; e.currentTarget.style.background='rgba(255,255,255,0.05)'; }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>

      {/* Thin gold shimmer line */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(242,183,5,0.4) 30%, rgba(242,183,5,0.7) 50%, rgba(242,183,5,0.4) 70%, transparent)',
          opacity: 0.7,
        }}
      />
    </header>
  )
}

// ─── Page Wrapper ─────────────────────────────────────────────────────────
export function Page({ children, className = '' }) {
  return (
    <main className={`max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8 py-5 md:py-6 pb-24 lg:pb-12 ${className}`}>
      {children}
      <p
        className="text-center text-[10px] mt-8 select-none tracking-widest uppercase"
        style={{ color: 'rgba(242,183,5,0.2)' }}
      >
        version 1.0 · dev by soulixay insixiengmai
      </p>
    </main>
  )
}

// ─── Section Title ────────────────────────────────────────────────────────
export function SectionTitle({ children }) {
  return (
    <h2
      className="font-semibold text-base mb-3 flex items-center gap-2"
      style={{ color: '#e0d8c8', letterSpacing: '0.02em' }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '3px',
          height: '16px',
          background: 'linear-gradient(180deg, #F2B705 0%, #D4920A 100%)',
          borderRadius: '2px',
          flexShrink: 0,
        }}
      />
      {children}
    </h2>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'yellow', icon }) {
  const colors = {
    yellow: '#F2B705',
    green:  '#4ade80',
    red:    '#f87171',
    blue:   '#60a5fa',
    orange: '#fb923c',
    white:  '#f0e8d8',
  }
  const c = colors[color] ?? '#f0e8d8'
  return (
    <div
      className="stat-card"
      style={{
        background: 'linear-gradient(145deg, #181818 0%, #0f0f0f 100%)',
        border: `1px solid rgba(${hexToRgb(c)},0.14)`,
        borderRadius: '20px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        boxShadow: `0 4px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(${hexToRgb(c)},0.06)`,
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium" style={{ color: '#666', letterSpacing: '0.02em' }}>{label}</p>
        {icon && <span className="text-xl leading-none">{icon}</span>}
      </div>
      <p className="text-2xl font-bold mt-1 leading-none" style={{ color: c }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: '#555' }}>{sub}</p>}
    </div>
  )
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}` : '242,183,5'
}

// ─── Loading Spinner ──────────────────────────────────────────────────────
export function Spinner({ size = 20, className = '' }) {
  return (
    <div
      className={`rounded-full border-2 border-transparent animate-spin ${className}`}
      style={{
        width: size,
        height: size,
        borderTopColor: '#F2B705',
      }}
    />
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────
export function Empty({ icon = '📋', message = 'ຍັງບໍ່ມີຂໍ້ມູນ' }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-14 gap-3"
      style={{ color: '#3d3d3d' }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '20px',
          background: 'rgba(242,183,5,0.06)',
          border: '1px solid rgba(242,183,5,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}
      >
        {icon}
      </div>
      <p className="text-sm" style={{ color: '#555' }}>{message}</p>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────
// Mobile: full-width bottom sheet. Desktop: centered dialog.
export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg animate-slide-up max-h-[92dvh] overflow-y-auto"
        style={{
          background: 'linear-gradient(160deg, #141414 0%, #0d0d0d 100%)',
          borderRadius: '28px 28px 0 0',
          border: '1px solid rgba(242,183,5,0.12)',
          borderBottom: 'none',
          boxShadow: '0 -8px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
          padding: '20px 20px 32px',
        }}
        // desktop: full rounded
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div
          className="md:hidden mx-auto mb-4"
          style={{
            width: 36,
            height: 4,
            borderRadius: '4px',
            background: 'rgba(242,183,5,0.25)',
          }}
        />

        {/* Title */}
        <h3
          className="font-bold text-lg mb-5 flex items-center gap-2"
          style={{ color: '#f0e8d8', letterSpacing: '0.01em' }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '3px',
              height: '18px',
              background: 'linear-gradient(180deg, #F2B705 0%, #D4920A 100%)',
              borderRadius: '2px',
              flexShrink: 0,
            }}
          />
          {title}
        </h3>

        {children}
      </div>
    </div>
  )
}

// Override Modal for desktop — full rounded
// We inject a style tag approach via onMount in the component above.
// For desktop: add a CSS rule to override border-radius at md+
// (handled via tailwind md: class injection in parent as needed)

// ─── Confirm Dialog ───────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'ຢືນຢັນ', danger = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-sm animate-scale-in"
        style={{
          background: 'linear-gradient(145deg, #181818 0%, #0d0d0d 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(242,183,5,0.15)',
          boxShadow: '0 16px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
          padding: '24px',
        }}
      >
        {/* Icon strip */}
        <div
          style={{
            width: '100%',
            height: '2px',
            background: danger
              ? 'linear-gradient(90deg, transparent, rgba(239,68,68,0.6), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(242,183,5,0.6), transparent)',
            borderRadius: '2px',
            marginBottom: '16px',
          }}
        />

        <h4
          className="font-bold mb-2 text-base"
          style={{ color: '#f0e8d8' }}
        >
          {title}
        </h4>
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: '#666' }}
        >
          {message}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="btn-secondary" style={{ minHeight: 44, fontSize: '0.875rem' }}>
            ຍົກເລີກ
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={danger ? 'btn-danger' : 'btn-primary'}
            style={{ minHeight: 44, fontSize: '0.875rem' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────
export const ROLE_LABELS = {
  producer:    'ຜູ້ຜະລິດ',
  distributor: 'ຜູ້ກະຈາຍ',
  seller:      'ຜູ້ຂາຍ',
  admin:       'ແອດມິນ',
  cashier:     'ແຄຊຽ',
}

export const PRODUCTS_LIST = [
  { label: 'ເຂັ້ມຂຸ້ນ 550ml', type: 'ເຂັ້ມຂຸ້ນ', size: '550ml' },
  { label: 'ເຂັ້ມຂຸ້ນ 250ml', type: 'ເຂັ້ມຂຸ້ນ', size: '250ml' },
  { label: 'ນຸ້ມນວນ 550ml',   type: 'ນຸ້ມນວນ',   size: '550ml' },
  { label: 'ນຸ້ມນວນ 250ml',   type: 'ນຸ້ມນວນ',   size: '250ml' },
]
