import { useAuth } from '../App'
import { LogOut } from 'lucide-react'
import logoImg from '../assets/logo.png'

// ─── Top Header ───────────────────────────────────────────────────────────
export function Header({ title, subtitle }) {
  const { profile, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-40 bg-dark-900/95 backdrop-blur-sm border-b border-dark-500 px-4 py-3 safe-top">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="Logo" className="h-9 w-9 rounded-xl object-cover" />
          <div>
            <h1 className="text-brand-yellow font-bold text-base leading-none">{title}</h1>
            {subtitle && <p className="text-gray-400 text-xs mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-white text-xs font-medium leading-none">{profile?.name}</p>
            <p className="text-gray-500 text-xs mt-0.5">{ROLE_LABELS[profile?.role]}</p>
          </div>
          <button
            onClick={signOut}
            className="p-2 rounded-xl bg-dark-600 text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── Page Wrapper ─────────────────────────────────────────────────────────
export function Page({ children, className = '' }) {
  return (
    <main className={`max-w-lg mx-auto px-4 py-4 pb-24 ${className}`}>
      {children}
    </main>
  )
}

// ─── Section Title ────────────────────────────────────────────────────────
export function SectionTitle({ children }) {
  return (
    <h2 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
      {children}
    </h2>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'yellow', icon }) {
  const colors = {
    yellow: 'text-brand-yellow',
    green:  'text-green-400',
    red:    'text-red-400',
    blue:   'text-blue-400',
    white:  'text-white',
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <p className="text-gray-400 text-xs">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold mt-1 ${colors[color]}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs">{sub}</p>}
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────
export function Spinner({ size = 20, className = '' }) {
  return (
    <div
      className={`rounded-full border-2 border-transparent border-t-brand-yellow animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────
export function Empty({ icon = '📋', message = 'ຍັງບໍ່ມີຂໍ້ມູນ' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-dark-800 rounded-t-3xl border-t border-dark-500 p-5 pb-8 animate-slide-up max-h-[90dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-dark-400 rounded-full mx-auto mb-4" />
        <h3 className="text-white font-bold text-lg mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'ຢືນຢັນ', danger = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-dark-700 rounded-2xl p-5 w-full max-w-sm border border-dark-500 animate-fade-in">
        <h4 className="text-white font-bold mb-2">{title}</h4>
        <p className="text-gray-400 text-sm mb-5">{message}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="btn-secondary py-2.5 text-sm">ຍົກເລີກ</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`${danger ? 'btn-danger' : 'btn-primary'} py-2.5 text-sm`}
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
}

export const PRODUCTS_LIST = [
  { label: 'ເຂັ້ມຂຸ້ນ 550ml', type: 'ເຂັ້ມຂຸ້ນ', size: '550ml' },
  { label: 'ເຂັ້ມຂຸ້ນ 250ml', type: 'ເຂັ້ມຂຸ້ນ', size: '250ml' },
  { label: 'ນຸ້ມນວນ 550ml',   type: 'ນຸ້ມນວນ',   size: '550ml' },
  { label: 'ນຸ້ມນວນ 250ml',   type: 'ນຸ້ມນວນ',   size: '250ml' },
]
