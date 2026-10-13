import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * POST /api/sync-superadmin-email
 *
 * Pushes the Vercel-side SUPERADMIN_EMAIL secret into the database so that every
 * Postgres RLS policy picks it up immediately.
 *
 * WHY THIS EXISTS:
 *   Supabase SQL runs inside the Postgres instance and cannot read Vercel
 *   environment variables. The database must own the value, so this endpoint
 *   acts as the bridge from Vercel (control plane) to Postgres (source of truth).
 *
 * AUTH:
 *   Requires a bearer token matching SUPERADMIN_SYNC_TOKEN. This is essential
 *   because the endpoint writes with the service role key, which bypasses RLS.
 *
 * USAGE:
 *   curl -X POST https://<your-app>/api/sync-superadmin-email \
 *     -H "Authorization: Bearer $SUPERADMIN_SYNC_TOKEN"
 *
 *   Optionally override the address for a single call:
 *   ... -H "Content-Type: application/json" -d '{"email":"new@example.com"}'
 */
export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // --- 1. AUTHENTICATE ---
    const expectedToken = process.env.SUPERADMIN_SYNC_TOKEN;

    if (!expectedToken) {
      console.error('SUPERADMIN_SYNC_TOKEN is not configured in the environment.');
      return res.status(500).json({
        error:
          '[ERR_500] CONFIG_INVALID: Sync token is not configured on the server.',
      });
    }

    const authHeader = req.headers.authorization || '';
    const providedToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';

    if (providedToken !== expectedToken) {
      return res
        .status(401)
        .json({ error: '[ERR_401] UNAUTHORIZED: Invalid sync token.' });
    }

    // --- 2. RESOLVE THE TARGET ADDRESS ---
    // Body value wins (allows one-off manual overrides), otherwise fall back to
    // the Vercel environment variable.
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    const rawEmail = body.email || process.env.SUPERADMIN_EMAIL;

    if (!rawEmail) {
      return res.status(400).json({
        error:
          '[ERR_400] REQUEST_INVALID: No address supplied. Set SUPERADMIN_EMAIL in Vercel or pass { "email": "..." } in the body.',
      });
    }

    const email = String(rawEmail).trim().toLowerCase();

    // Reject anything that is obviously not an email address, so a typo cannot
    // silently lock the Superadmin out of every RLS policy at once.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: `[ERR_400] REQUEST_INVALID: "${email}" is not a valid email address.`,
      });
    }

    // --- 3. WRITE TO THE DATABASE ---
    // service_role bypasses RLS, which is what permits this write at all.
    const { error } = await supabase.from('system_config').upsert(
      {
        key: 'superadmin_email',
        value: email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (error) throw error;

    return res.status(200).json({
      success: true,
      superadmin_email: email,
      message:
        'Superadmin email updated. All Postgres RLS policies now use this address.',
    });
  } catch (error) {
    console.error('Superadmin email sync failure:', error);
    return res
      .status(500)
      .json({ error: error.message || 'System error processing request.' });
  }
}
