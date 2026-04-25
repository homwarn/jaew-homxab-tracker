import { useState, useRef } from 'react'
import { Camera, ImagePlus, X, Loader2 } from 'lucide-react'
import { uploadImage } from '../lib/supabase'

export default function ImageUpload({ bucket, onUpload, label = 'ອັບໂຫລດຮູບ', accept = 'image/*' }) {
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const cameraRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('ຮູບໃຫຍ່ເກີນໄປ (ສູງສຸດ 10MB)')
      return
    }
    setError('')

    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(file)

    // Upload to Supabase Storage
    setUploading(true)
    try {
      const path = await uploadImage(bucket, file)
      onUpload(path)
    } catch (err) {
      setError('ອັບໂຫລດຜິດພາດ: ' + err.message)
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  function clear() {
    setPreview(null)
    setError('')
    onUpload(null)
    if (inputRef.current)  inputRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {label && <label className="field-label">{label}</label>}

      {preview ? (
        <div className="relative">
          <img src={preview} alt="preview" className="img-preview" />
          {uploading && (
            <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
              <Loader2 size={28} className="text-brand-yellow animate-spin" />
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              onClick={clear}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Camera capture (mobile) */}
          <label className="cursor-pointer">
            <input
              ref={cameraRef}
              type="file"
              accept={accept}
              capture="environment"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
            <div className="flex flex-col items-center justify-center gap-2 bg-dark-600 border-2 border-dashed border-dark-400 rounded-2xl py-5 hover:border-brand-yellow transition-colors active:scale-95">
              <Camera size={28} className="text-brand-yellow" />
              <span className="text-sm text-gray-300">ຖ່າຍຮູບ</span>
            </div>
          </label>

          {/* Gallery upload */}
          <label className="cursor-pointer">
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
            <div className="flex flex-col items-center justify-center gap-2 bg-dark-600 border-2 border-dashed border-dark-400 rounded-2xl py-5 hover:border-brand-yellow transition-colors active:scale-95">
              <ImagePlus size={28} className="text-brand-yellow" />
              <span className="text-sm text-gray-300">ຈາກ Gallery</span>
            </div>
          </label>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
