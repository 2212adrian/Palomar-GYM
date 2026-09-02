// src/lib/supabase/audit.ts
import { supabase } from './client';

/**
 * Strips technical noise, raw UUIDs, brackets, and JSON artifacts from strings to ensure
 * logs are clear, professional, and readable for non-technical gym staff/owners.
 */
export function sanitizeLogDetails(text: string): string {
  if (!text) return '';
  return (
    text
      // Replace raw UUID patterns (e.g. 550e8400-e29b-41d4-a716-446655440000) with a cleaner label if present
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ''
      )
      // Remove isolated bracket artifacts like [] or {}
      .replace(/\[\s*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export async function logAudit(
  action: string,
  details: string,
  targetId?: string
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let actorUsername = 'System';
    let userId: string | null = null;

    if (user) {
      userId = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, email')
        .eq('id', user.id)
        .maybeSingle();

      actorUsername =
        profile?.username ||
        user.user_metadata?.full_name ||
        user.email ||
        'System';
    }

    const cleanedDetails = sanitizeLogDetails(details);

    // 1. First attempt the stored procedure RPC
    const { error: rpcError } = await supabase.rpc('log_audit_entry', {
      p_user_id: userId,
      p_actor_username: actorUsername,
      p_action: action,
      p_target_id: targetId || null,
      p_details: cleanedDetails,
    });

    if (rpcError) {
      // 2. Direct fallback to audit_logs table insert
      const { error: insertError } = await supabase.from('audit_logs').insert([
        {
          user_id: userId,
          actor_username: actorUsername,
          action: action,
          target_id: targetId || null,
          details: cleanedDetails,
          created_at: new Date().toISOString(),
        },
      ]);

      if (insertError) {
        console.warn('Direct audit log fallback skipped:', insertError.message);
      }
    }
  } catch (err) {
    console.error('Audit logger error:', err);
  }
}
