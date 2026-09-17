import { createClient } from '@supabase/supabase-js';

const CANONICAL_APP_URL = 'https://dev-wolfpalomar.vercel.app';

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
    const { email, username, password, full_name, role, auth_method } = body;

    const appUrl = resolveAppUrl(req);

    // 1. Email Invitation Method
    if (auth_method === 'email') {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${appUrl}/confirm-signup`,
          data: {
            full_name: full_name.trim(),
            role: role,
          },
        }
      );
      if (error) throw error;

      const userId = data.user.id;
      await supabase.from('profiles').upsert({
        id: userId,
        username: full_name.trim(),
        role: role,
        status: 'pending',
      });

      return res.status(200).json({ success: true, user: data.user });
    }

    // 2. Local Username Method
    if (auth_method === 'username') {
      const pseudoEmail = `${username.trim().toLowerCase()}@palomargym.noemail`;
      const { data, error } = await supabase.auth.admin.createUser({
        email: pseudoEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          role: role,
        },
      });
      if (error) throw error;

      const userId = data.user.id;
      await supabase.from('profiles').upsert({
        id: userId,
        username: full_name.trim(),
        role: role,
        status: 'active',
      });

      return res.status(200).json({ success: true, user: data.user });
    }

    return res.status(400).json({ error: 'Invalid registration parameters' });
  } catch (error) {
    console.error('Registration serverless execution failure:', error);
    return res
      .status(500)
      .json({ error: error.message || 'System error processing request.' });
  }
}