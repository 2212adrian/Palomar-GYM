import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { email, username, password, full_name, role, auth_method } = JSON.parse(event.body || '{}');

    // 1. Email Invitation Method (triggers your Supabase SMTP template)
    if (auth_method === 'email') {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
        redirectTo: `${process.env.VITE_APP_URL || 'http://localhost:9999'}/forgot-password`,
        data: {
          full_name: full_name.trim(),
          role: role
        }
      });
      if (error) throw error;

      // Upsert profile record explicitly to establish status parameters
      const userId = data.user.id;
      await supabase.from('profiles').upsert({
        id: userId,
        username: full_name.trim(),
        role: role,
        status: 'pending'
      });

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, user: data.user }),
      };
    }

    // 2. Local Username Method (configured on-site with manual keys)
    if (auth_method === 'username') {
      const pseudoEmail = `${username.trim().toLowerCase()}@palomargym.noemail`; // Use a pseudo-email to satisfy Supabase's email requirement
      const { data, error } = await supabase.auth.admin.createUser({
        email: pseudoEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name.trim(),
          role: role
        }
      });
      if (error) throw error;

      const userId = data.user.id;
      await supabase.from('profiles').upsert({
        id: userId,
        username: full_name.trim(),
        role: role,
        status: 'active'
      });

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, user: data.user }),
      };
    }

    return { statusCode: 400, body: 'Invalid registration parameters' };
  } catch (error) {
    console.error('Registration serverless execution failure:', error);
    return {
      statusCode: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message || 'System error processing request.' }),
    };
  }
};