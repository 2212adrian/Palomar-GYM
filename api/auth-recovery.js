import { createClient } from '@supabase/supabase-js';

const CANONICAL_APP_URL = 'https://dev-wolfpalomar.vercel.app';

/**
 * Resolves the target app URL:
 * 1. Prioritizes VITE_APP_URL or APP_URL environment variables.
 * 2. If called from a valid non-preview origin (e.g. dev-wolfpalomar.vercel.app), uses that.
 * 3. Falls back to CANONICAL_APP_URL.
 */
const resolveAppUrl = (req) => {
  const configured = String(process.env.VITE_APP_URL || process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (configured) return configured;

  const origin = req?.headers?.origin || '';
  if (origin && !origin.includes('-projects.vercel.app')) {
    return origin.replace(/\/+$/, '');
  }

  return CANONICAL_APP_URL;
};

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { action, email, otp, new_password } = body;

    if (!email) {
      return res
        .status(400)
        .json({ error: '[ERR_400] REQUEST_INVALID: Email is required.' });
    }

    // 1. Fetch user by email securely
    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const targetUser = users.find(
      (u) => u.email && u.email.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return res.status(404).json({
        error: '[ERR_404] NOT_FOUND: This email is not registered on Wolf OS.',
      });
    }

    // --- ACTION A: SEND OTP VIA SUPABASE SMTP ---
    if (action === 'send-otp') {
      const appUrl = resolveAppUrl(req);

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${appUrl}/forgot-password`,
        }
      );

      if (resetError) {
        return res
          .status(400)
          .json({ error: `[ERR_400] REQUEST_FAILED: ${resetError.message}` });
      }

      return res
        .status(200)
        .json({ success: true, message: 'OTP transmitted.' });
    }

    // --- ACTION B: VERIFY OTP AND CHANGE PASSWORD ---
    if (action === 'verify-otp') {
      if (!otp || !new_password) {
        return res.status(400).json({
          error:
            '[ERR_400] REQUEST_INVALID: Email, OTP, and new password required.',
        });
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'recovery',
      });

      if (verifyError) {
        return res
          .status(400)
          .json({ error: `[ERR_400] REQUEST_INVALID: ${verifyError.message}` });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data.user.id,
        {
          password: new_password,
        }
      );

      if (updateError) throw updateError;

      return res
        .status(200)
        .json({ success: true, message: 'Access restored.' });
    }

    return res.status(400).json({ error: 'Bad Request' });
  } catch (error) {
    console.error('Recovery error:', error);
    return res
      .status(500)
      .json({ error: error.message || 'System error processing request.' });
  }
}