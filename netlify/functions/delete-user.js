// Netlify Function: delete-user
// Called by Admin Dashboard to delete users using service role key
// Env vars needed: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js')

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server configuration error' }) }
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing Authorization header')

    const adminClient  = createClient(SUPABASE_URL, SERVICE_KEY)
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !caller) throw new Error('Unauthorized')

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role').eq('id', caller.id).single()
    if (callerProfile?.role !== 'admin') throw new Error('Admin role required')

    const { user_id } = JSON.parse(event.body || '{}')
    if (!user_id) throw new Error('user_id is required')
    if (user_id === caller.id) throw new Error('ທ່ານບໍ່ສາມາດລຶບ Account ຂອງຕົນເອງໄດ້')

    // Delete profile first (foreign key constraint) then auth user
    await adminClient.from('profiles').delete().eq('id', user_id)
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id)
    if (deleteErr) throw deleteErr

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true }),
    }
  } catch (err) {
    console.error('[delete-user]', err.message)
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
