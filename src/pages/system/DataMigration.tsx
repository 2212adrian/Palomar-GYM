// src/pages/system/DataMigration.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { ShieldAlert, FileSpreadsheet } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { logAudit } from '../../lib/supabase/audit';
import { DatabaseMigrationManager } from './components/DatabaseMigrationManager';

export const DataMigration: React.FC = () => {
  const { user, profile } = useAuthStore() as any;
  const actorEmail = user?.email || profile?.email || null;

  const isSuperAdminOnly = useMemo(() => {
    return isSuperAdmin(actorEmail);
  }, [actorEmail]);

  const loggedUnauthorizedRef = useRef(false);

  useEffect(() => {
    if (user && !isSuperAdminOnly && !loggedUnauthorizedRef.current) {
      loggedUnauthorizedRef.current = true;
      logAudit(
        'UNAUTHORIZED_DATA_MIGRATION_ACCESS',
        `Non-SuperAdmin account (${actorEmail || 'unknown'}) attempted to access Data Migration page.`
      ).catch(() => {});
    }
  }, [user, isSuperAdminOnly, actorEmail]);

  if (!isSuperAdminOnly) {
    return (
      <div className="p-6 sm:p-8 rounded-2xl bg-(--bg-card) border border-rose-500/30 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-heading font-black text-base uppercase tracking-wider text-(--color-text)">
          SuperAdmin Clearance Required
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          Data Migration belongs exclusively to the Superadmin Console. Regular
          Admin and Staff accounts do not have permission to view or execute
          migrations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-7 font-body text-(--color-text) rounded-3xl pb-24 sm:pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
              DATA MIGRATION
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 font-medium">
            SuperAdmin-exclusive two-group CSV migration for Products &amp;
            Members with duplicate detection, strict schema validation, and
            24-hour rollback recovery.
          </p>
        </div>
      </div>

      {/* Embedded SuperAdmin CSV Migration Manager */}
      <DatabaseMigrationManager embedded />
    </div>
  );
};

export default DataMigration;
