import { createClient } from '@supabase/supabase-js';
import {
  applySecurityCorsHeaders,
  resolveSafeAppUrl,
  verifyAdminCaller,
} from './_security.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ROLES = new Set(['admin', 'staff']);
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
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
    const authCheck = await verifyAdminCaller(req, supabase);
    if (!authCheck.ok) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    const body =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { email, username, password, full_name, role, auth_method } = body;

    const cleanName = String(full_name || '').trim();
    const cleanRole = String(role || 'staff').trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 80) {
      return res
        .status(400)
        .json({ error: 'Please enter a full name between 2 and 80 characters.' });
    }

    if (!ALLOWED_ROLES.has(cleanRole)) {
      return res
        .status(400)
        .json({ error: 'Selected role must be either admin or staff.' });
    }

    const appUrl = resolveSafeAppUrl(req);

    // 1. Email Invitation Method
    if (auth_method === 'email') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return res
          .status(400)
          .json({ error: 'Please provide a valid email address.' });
      }

      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        cleanEmail,
        {
          redirectTo: `${appUrl}/confirm-signup`,
          data: {
            full_name: cleanName,
            role: cleanRole,
          },
        }
      );
      if (error) {
        return res
          .status(400)
          .json({ error: error.message || 'Could not send email invitation.' });
      }

      const userId = data.user.id;
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: userId,
        username: cleanName,
        role: cleanRole,
        status: 'pending',
      });
      if (upsertError) throw upsertError;

      return res.status(200).json({ success: true, user: data.user });
    }

    // 2. Local Username Method
    if (auth_method === 'username') {
      const cleanUsername = String(username || '').trim().toLowerCase();
      if (!USERNAME_REGEX.test(cleanUsername)) {
        return res.status(400).json({
          error:
            'Username must be 3 to 32 characters using only letters, numbers, dots, underscores, or hyphens.',
        });
      }

      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({
          error: 'Password must be at least 8 characters long.',
        });
      }

      const pseudoEmail = `${cleanUsername}@palomargym.noemail`;
      const { data, error } = await supabase.auth.admin.createUser({
        email: pseudoEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          role: cleanRole,
        },
      });
      if (error) {
        return res
          .status(400)
          .json({ error: error.message || 'Could not create staff account.' });
      }

      const userId = data.user.id;
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: userId,
        username: cleanName,
        role: cleanRole,
        status: 'active',
      });
      if (upsertError) throw upsertError;

      return res.status(200).json({ success: true, user: data.user });
    }

    return res.status(400).json({ error: 'Please choose an email or username sign-in method.' });
  } catch (error) {
    console.error('Registration handler error:', error);
    return res
      .status(500)
      .json({ error: 'Unable to complete account creation right now. Please try again.' });
  }
}