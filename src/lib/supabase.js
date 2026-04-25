import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️  Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'jaew-auth',
  },
})

// Helper: get public URL for storage files
export function getPublicUrl(bucket, path) {
  if (!path) return null
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data?.publicUrl || null
}

// Helper: upload image to storage
export async function uploadImage(bucket, file, folder = '') {
  const ext = file.name.split('.').pop()
  const filename = `${folder}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage.from(bucket).upload(filename, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return data.path
}

// Helper: get signed URL (for private buckets)
export async function getSignedUrl(bucket, path) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}
