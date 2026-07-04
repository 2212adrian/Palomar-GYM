import { supabase } from './client';
import { useAuthStore } from '../../stores/authStore';

/**
 * Automatically logs a system action to the Supabase database.
 * Fetches the currently active user session and username from the Zustand store.
 * 
 * @param action - Type of action (e.g., 'SYSTEM_RATES_UPDATED', 'USER_DELETED')
 * @param details - Human-readable explanation of what happened
 * @param targetId - Optional ID of the resource affected (e.g., modified user's UUID)
 */
export const logAudit = async (action: string, details: string, targetId?: string) => {
  try {
    // 1. Fetch current session state directly from Zustand
    const { user, profile } = useAuthStore.getState() as any;
    
    const actorUsername = profile?.username || user?.user_metadata?.full_name || user?.email || 'System';
    const userId = user?.id || null;

    // 2. Call the database RPC function we created in the migration
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
    console.warn('Failed to dispatch audit log telemetry:', err);
  }
};