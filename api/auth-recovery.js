import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
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
    // Vercel auto-parses the body if the Content-Type is application/json.
    // We add a fallback in case it arrives as a raw string.
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { action, email, otp, new_password } = body;

    if (!email) {
      return res.status(400).json({ error: '[ERR_400] REQUEST_INVALID: Email is required.' });
    }

    // 1. Fetch user by email securely
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const targetUser = users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());

    if (!targetUser) {
      return res.status(404).json({ error: '[ERR_404] NOT_FOUND: This email is not registered on Wolf OS.' });
    }

    // --- ACTION A: SEND OTP VIA SUPABASE SMTP ---
    if (action === 'send-otp') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);

      if (resetError) {
        return res.status(400).json({ error: `[ERR_400] REQUEST_FAILED: ${resetError.message}` });
      }

      return res.status(200).json({ success: true, message: 'OTP transmitted.' });
    }

    // --- ACTION B: VERIFY OTP AND CHANGE PASSWORD ---
    if (action === 'verify-otp') {
      if (!otp || !new_password) {
        return res.status(400).json({ error: '[ERR_400] REQUEST_INVALID: Email, OTP, and new password required.' });
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery',
      });

      if (verifyError) {
        return res.status(400).json({ error: `[ERR_400] REQUEST_INVALID: ${verifyError.message}` });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
        password: new_password,
      });

      if (updateError) throw updateError;

      return res.status(200).json({ success: true, message: 'Access restored.' });
    }

    return res.status(400).json({ error: 'Bad Request' });
  } catch (error) {
    console.error('Recovery error:', error);
    return res.status(500).json({ error: error.message || 'System error processing request.' });
  }
}