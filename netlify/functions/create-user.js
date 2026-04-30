// Netlify Function: create-user
// Called by Admin Dashboard to create new users with service role key
// Env vars needed: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js')

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error: missing env vars' }) }
  }

  try {
    // ── 1. Verify caller is logged-in admin ──────────────────────────────
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header')
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY)

    // Verify the caller's JWT directly using the admin client — this is the only
    // reliable way in a serverless context (no localStorage / cookie session).
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !caller) throw new Error('Unauthorized: invalid session')

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role').eq('id', caller.id).single()
    if (callerProfile?.role !== 'admin') throw new Error('Forbidden: admin role required')

    // ── 2. Parse and validate body ────────────────────────────────────────
    const { email, password, name, role, store_name, phone } = JSON.parse(event.body || '{}')
    if (!email)    throw new Error('email is required')
    if (!password) throw new Error('password is required')
    if (!name)     throw new Error('name is required')
    if (!role)     throw new Error('role is required')
    if (!['producer', 'distributor', 'seller', 'admin', 'cashier'].includes(role)) {
      throw new Error('Invalid role value')
    }

    // ── 3. Create auth user ───────────────────────────────────────────────
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation
    })
    if (createErr) {
      if (createErr.message?.includes('already registered')) {
        throw new Error('ອີເມລນີ້ຖືກໃຊ້ແລ້ວ')
      }
      throw createErr
    }

    // ── 4. Create profile ─────────────────────────────────────────────────
    const { error: profileErr } = await adminClient.from('profiles').insert({
      id:         newUser.user.id,
      name:       name.trim(),
      role,
      store_name: store_name?.trim() || null,
      phone:      phone?.trim()      || null,
    })
    if (profileErr) {
      // Rollback: delete the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      throw profileErr
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, user_id: newUser.user.id }),
    }
  } catch (err) {
    console.error('[create-user]', err.message)
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
