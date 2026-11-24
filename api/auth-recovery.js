import { createClient } from '@supabase/supabase-js';
import { applySecurityCorsHeaders, resolveSafeAppUrl } from './_security.js';

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
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { action, email, otp, new_password } = body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res
        .status(400)
        .json({ error: 'Please enter a valid email address.' });
    }

    // --- ACTION A: SEND RECOVERY EMAIL / CODE (NON-ENUMERATING) ---
    if (action === 'send-otp') {
      const appUrl = resolveSafeAppUrl(req);

      // Dispatch without leaking whether the email address exists
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: `${appUrl}/forgot-password`,
        }
      );

      if (resetError && resetError.status === 429) {
        return res.status(429).json({
          error: 'Too many reset requests. Please wait a minute and try again.',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'If an account matches this email, recovery instructions have been sent.',
      });
    }

    // --- ACTION B: VERIFY OTP AND UPDATE PASSWORD ---
    if (action === 'verify-otp') {
      const cleanOtp = String(otp || '').trim();
      if (!cleanOtp || typeof new_password !== 'string') {
        return res.status(400).json({
          error: 'Email, recovery code, and new password are required.',
        });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          error: 'New password must be at least 8 characters long.',
        });
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: cleanOtp,
        type: 'recovery',
      });

      if (verifyError || !data?.user) {
        return res.status(400).json({
          error: 'The recovery code is invalid or has expired. Please request a new one.',
        });
      }

      const verifiedEmail = String(data.user.email || '').trim().toLowerCase();
      if (verifiedEmail !== normalizedEmail) {
        return res.status(403).json({
          error: 'Recovery verification did not match this email address.',
        });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        data.user.id,
        {
          password: new_password,
        }
      );

      if (updateError) {
        return res.status(400).json({
          error: 'Could not update password. Please choose a stronger password and try again.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Your password has been updated. You can sign in now.',
      });
    }

    return res.status(400).json({ error: 'Invalid password recovery action.' });
  } catch (error) {
    console.error('Recovery error:', error);
    return res.status(500).json({
      error: 'Unable to process your password recovery request right now. Please try again.',
    });
  }
}