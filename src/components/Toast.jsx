import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const icons = {
    success: <CheckCircle size={18} className="text-green-400 flex-shrink-0" />,
    error:   <XCircle    size={18} className="text-red-400   flex-shrink-0" />,
    info:    <Info       size={18} className="text-blue-400  flex-shrink-0" />,
  }

  return (
    <ToastContext.Provider value={{ success: m => show(m,'success'), error: m => show(m,'error'), info: m => show(m,'info') }}>
      {children}
      <div className="toast-container pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type} flex items-center gap-3 pointer-events-auto`}>
            {icons[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
