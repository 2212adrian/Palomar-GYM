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
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { action, email, otp, new_password } = JSON.parse(event.body || '{}');

    if (!email) {
      return {
        statusCode: 400,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: '[ERR_400] REQUEST_INVALID: Email is required.' }),
      };
    }

    // 1. Fetch user by email securely (Preserved to maintain your custom 404 notification on frontend)
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const targetUser = users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());

    if (!targetUser) {
      return {
        statusCode: 404,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: '[ERR_404] NOT_FOUND: This email is not registered on Wolf OS.' }),
      };
    }

    // --- ACTION A: SEND OTP VIA SUPABASE SMTP ---
    if (action === 'send-otp') {
      // Trigger Supabase's native reset flow, which routes directly through your Dashboard SMTP
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);

      if (resetError) {
        return {
          statusCode: 400,
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: `[ERR_400] REQUEST_FAILED: ${resetError.message}` }),
        };
      }

      return {
        statusCode: 200,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ success: true, message: 'OTP transmitted.' }),
      };
    }

    // --- ACTION B: VERIFY OTP AND CHANGE PASSWORD ---
    if (action === 'verify-otp') {
      if (!otp || !new_password) {
        return {
          statusCode: 400,
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: '[ERR_400] REQUEST_INVALID: Email, OTP, and new password required.' }),
        };
      }

      // 1. Validate the incoming 6-digit OTP directly with Supabase Auth
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery', // Natively validates recovery OTPs
      });

      if (verifyError) {
        return {
          statusCode: 400,
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: `[ERR_400] REQUEST_INVALID: ${verifyError.message}` }),
        };
      }

      // 2. Since validation succeeded, update password securely using the admin client
      const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
        password: new_password,
      });

      if (updateError) throw updateError;

      return {
        statusCode: 200,
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: true, message: 'Access restored.' }),
      };
    }

    return { statusCode: 400, body: 'Bad Request' };
  } catch (error) {
    console.error('Recovery error:', error);
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