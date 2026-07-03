import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

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

    // 1. Fetch user by email securely
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

    // --- ACTION A: GENERATE AND SEND OTP ---
    if (action === 'send-otp') {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

      // Save OTP into user's app metadata securely
      const { error: updateError } = await supabase.auth.admin.updateUserById(targetUser.id, {
        user_metadata: {
          ...targetUser.user_metadata,
          recovery_otp: otpCode,
          recovery_otp_expires_at: otpExpiresAt,
        },
      });

      if (updateError) throw updateError;

      // Send the email via SMTP
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const mailOptions = {
        from: `"Wolf Palomar Gym" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'WOLF OS - SECURITY PROTOCOL KEY',
        html: `
          <div style="font-family: sans-serif; padding: 30px; background-color: #0f1012; color: #ffffff; border-radius: 12px; max-width: 500px; margin: auto; border: 1px solid #bf0202;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #bf0202; margin: 0; font-size: 24px; tracking: 2px;">WOLF OS RECOVERY</h2>
              <p style="color: #a1a1a1; font-size: 11px; margin: 5px 0 0 0;">CONNECTED SECURITY PROTOCOL</p>
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #e1e1e1;">
              An administrator terminal recovery sequence was initiated. Use the secure 6-digit key below to complete verification:
            </p>
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #ffffff; background-color: #1a1c1f; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0; border: 1px solid #333;">
              ${otpCode}
            </div>
            <p style="font-size: 11px; color: #a1a1a1; line-height: 1.5; margin: 0;">
              * This code is valid for exactly 10 minutes. If you did not request this, please ignore this communication.
            </p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);

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

      const savedOtp = targetUser.user_metadata?.recovery_otp;
      const expiresAt = targetUser.user_metadata?.recovery_otp_expires_at;

      // Validation
      if (!savedOtp || savedOtp !== otp) {
        return {
          statusCode: 400,
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: '[ERR_400] REQUEST_INVALID: Security OTP verification failed.' }),
        };
      }

      if (!expiresAt || Date.now() > expiresAt) {
        return {
          statusCode: 400,
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: '[ERR_400] REQUEST_INVALID: Security OTP has expired.' }),
        };
      }

      // Update password and erase the single-use OTP
      const { error: updateError } = await supabase.auth.admin.updateUserById(targetUser.id, {
        password: new_password,
        user_metadata: {
          ...targetUser.user_metadata,
          recovery_otp: null,
          recovery_otp_expires_at: null,
        },
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