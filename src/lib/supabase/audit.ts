// src/lib/supabase/audit.ts
import { supabase } from './client';

export async function logAudit(
  action: string,
  details: string,
  targetId?: string
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let actorUsername = 'System';
    let userId: string | null = null;

    if (user) {
      userId = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      actorUsername = profile?.username || user.email || 'System';
    }

    // Call the database function using exactly 5 parameters
    const { error } = await supabase.rpc('log_audit_entry', {
      p_user_id: userId,
      p_actor_username: actorUsername,
      p_action: action,
      p_target_id: targetId || null,
      p_details: details
    });

    if (error) {
      console.warn('Audit Logging bypassed:', error.message);
    }
  } catch (err) {
    console.error('Audit logger failed:', err);
  }
}