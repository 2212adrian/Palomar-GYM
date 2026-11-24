import { createClient } from '@supabase/supabase-js';
import {
  applySecurityCorsHeaders,
  compareTokensConstantTime,
} from './_security.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  applySecurityCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const expectedToken = process.env.SUPERADMIN_SYNC_TOKEN;

    if (!expectedToken) {
      console.error('SUPERADMIN_SYNC_TOKEN is not configured in the environment.');
      return res.status(500).json({
        error: 'Sync token is not configured on the server.',
      });
    }

    const authHeader = req.headers.authorization || '';
    const providedToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!compareTokensConstantTime(providedToken, expectedToken)) {
      return res.status(401).json({ error: 'Unauthorized sync request.' });
    }

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    const rawEmail = body.email || process.env.SUPERADMIN_EMAIL;

    if (!rawEmail) {
      return res.status(400).json({
        error: 'No superadmin email address was supplied.',
      });
    }

    const email = String(rawEmail).trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: `"${email}" is not a valid email address.`,
      });
    }

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
      message: 'Superadmin email updated across system settings.',
    });
  } catch (error) {
    console.error('Superadmin email sync failure:', error);
    return res
      .status(500)
      .json({ error: 'Unable to update superadmin email right now. Please try again.' });
  }
}
