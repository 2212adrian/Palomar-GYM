// src/pages/system/components/DatabaseMigrationManager.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Database,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Package,
  Users,
  History,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { useAuthStore } from '../../../stores/authStore';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { isSuperAdmin } from '../../../constants/auth';
import { downloadExportFile } from '../../../utils/fileDownloader';
import googleIcon from '../../../assets/Google_Icon.webp';
import {
  MAX_CSV_FILE_BYTES,
  PRODUCT_HEADERS,
  MEMBER_HEADERS,
  type ExistingDbSnapshot,
  type ParsedMigrationResult,
  type SealedMigrationBatch,
  type MigrationExecutionSummary,
  type MigrationAuditLogEntry,
  computeSha256Hex,
  generateUnifiedMigrationCsvTemplate,
  fetchMigrationDbSnapshot,
  verifyLiveCashSessionClosed,
  parseAndValidateMigrationCsv,
  sealMigrationBatch,
  clearEphemeralSeal,
  executeSecuredCsvMigration,
  recordMigrationAttempt,
  fetchMigrationAuditLogs,
} from '../utils/csvDataMigration';

export interface DatabaseMigrationManagerProps {
  onSuccess?: () => void;
  onClose?: () => void;
  embedded?: boolean;
}

export const DatabaseMigrationManager: React.FC<
  DatabaseMigrationManagerProps
> = ({ onSuccess, onClose, embedded = true }) => {
  const { user, profile } = useAuthStore() as any;
  const actorEmail = user?.email || profile?.email || null;
  const actorId = user?.id || profile?.id || null;
  const isSuper = isSuperAdmin(actorEmail);
  const { isSessionOpen, activeSession } = useCashSessionStore();

  // Security & Cash Session Verification States
  const [liveSessionClosed, setLiveSessionClosed] = useState<boolean>(true);
  const [checkingLiveGate, setCheckingLiveGate] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState<boolean>(false);
  const [authPassword, setAuthPassword] = useState<string>('');
  const [oauthConfirmPhrase, setOauthConfirmPhrase] = useState<string>('');
  const [showAuthPassword, setShowAuthPassword] = useState<boolean>(false);
  const [hasPassword, setHasPassword] = useState<boolean>(true);

  // Portal Top View Tab: 'workspace' | 'audit_logs'
  const [portalTab, setPortalTab] = useState<'workspace' | 'audit_logs'>(
    'workspace'
  );

  // DB Pre-Flight Snapshot
  const [dbSnapshot, setDbSnapshot] = useState<ExistingDbSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState<boolean>(false);
  const [nonEmptyOverrideAck, setNonEmptyOverrideAck] =
    useState<boolean>(false);

  // Template Guide & File Import States
  const [showSchemaGuide, setShowSchemaGuide] = useState<boolean>(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] =
    useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedFileBytes, setSelectedFileBytes] = useState<number>(0);
  const [isValidatingFile, setIsValidatingFile] = useState<boolean>(false);
  const [parsedResult, setParsedResult] =
    useState<ParsedMigrationResult | null>(null);
  const [sealedBatch, setSealedBatch] = useState<SealedMigrationBatch | null>(
    null
  );
  const [inspectTab, setInspectTab] = useState<
    'issues' | 'products' | 'members'
  >('issues');

  // Execution States
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationProgress, setMigrationProgress] = useState<number>(0);
  const [migrationStage, setMigrationStage] = useState<string>('');
  const [executionSummary, setExecutionSummary] =
    useState<MigrationExecutionSummary | null>(null);

  // Dedicated `migration_audit_logs` History States
  const [auditLogs, setAuditLogs] = useState<MigrationAuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [auditTableUnavailable, setAuditTableUnavailable] =
    useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sealedIdRef = useRef<string | null>(null);

  const effectiveSessionOpen =
    isSessionOpen || Boolean(activeSession) || !liveSessionClosed;

  const loadMigrationHistory = useCallback(async () => {
    if (!isSuper) return;
    setLoadingLogs(true);
    try {
      const res = await fetchMigrationAuditLogs(50);
      setAuditLogs(res.logs);
      setAuditTableUnavailable(res.tableUnavailable);
    } finally {
      setLoadingLogs(false);
    }
  }, [isSuper]);

  // Initialize gates on mount / user change
  useEffect(() => {
    let isMounted = true;
    const initGates = async () => {
      if (!isSuper) {
        if (actorEmail) {
          await logAudit(
            'LEGACY_CSV_MIGRATION_BLOCKED',
            `Unauthorized access attempt to DatabaseMigrationManager by ${actorEmail}.`,
            actorId || undefined
          );
        }
        return;
      }

      setCheckingLiveGate(true);
      try {
        const [sessionRes, hasPwdRes] = await Promise.all([
          verifyLiveCashSessionClosed(),
          (async () => {
            try {
              const { data, error } = await supabase.rpc(
                'check_user_has_password'
              );
              if (!error && typeof data === 'boolean') return data;
            } catch {}
            const rawProviders = user?.app_metadata?.providers || [];
            const isGoogleOnly =
              rawProviders.includes('google') &&
              !rawProviders.includes('email');
            return !isGoogleOnly;
          })(),
        ]);

        if (isMounted) {
          setLiveSessionClosed(sessionRes.isClosed);
          setHasPassword(hasPwdRes);
        }
      } finally {
        if (isMounted) setCheckingLiveGate(false);
      }
    };

    initGates();

    return () => {
      isMounted = false;
      if (sealedIdRef.current) {
        clearEphemeralSeal(sealedIdRef.current);
        sealedIdRef.current = null;
      }
    };
  }, [isSuper, actorEmail, actorId, user]);

  const refreshDbReadiness = async () => {
    setLoadingSnapshot(true);
    try {
      const [sessionRes, snapshot] = await Promise.all([
        verifyLiveCashSessionClosed(),
        fetchMigrationDbSnapshot(),
      ]);
      setLiveSessionClosed(sessionRes.isClosed);
      setDbSnapshot(snapshot);
      return snapshot;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to inspect live database counts.');
      return null;
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const verifyCurrentPassword = async (password: string): Promise<boolean> => {
    try {
      const { data: isValidPassword, error: authError } = await supabase.rpc(
        'verify_user_password',
        { entered_password: password }
      );
      if (!authError && typeof isValidPassword === 'boolean') {
        return isValidPassword;
      }
    } catch {
      // Fallback to direct signIn check
    }

    if (actorEmail) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: actorEmail,
        password,
      });
      return !signInError;
    }

    return false;
  };

  const handleAuthorizeAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuper) {
      toast.error('Access denied. SuperAdmin privileges required.');
      return;
    }

    setIsVerifyingAuth(true);
    try {
      const sessionRes = await verifyLiveCashSessionClosed();
      setLiveSessionClosed(sessionRes.isClosed);

      if (isSessionOpen || Boolean(activeSession) || !sessionRes.isClosed) {
        await recordMigrationAttempt({
          superadminId: actorId,
          superadminEmail: actorEmail,
          fileHash: 'PRE_AUTH_SESSION_OPEN',
          status: 'blocked',
          errorMessage:
            'Blocked migration portal unlock while cash drawer session is open.',
        });
        toast.warning(
          'Cash drawer session is currently open. Close the session in Cash Management first.'
        );
        return;
      }

      if (hasPassword) {
        if (!authPassword.trim()) {
          toast.error('Please enter your SuperAdmin password.');
          return;
        }
        const valid = await verifyCurrentPassword(authPassword.trim());
        if (!valid) {
          await logAudit(
            'LEGACY_CSV_MIGRATION_AUTH_FAILED',
            `Incorrect SuperAdmin password entered during DatabaseMigrationManager unlock (${actorEmail}).`,
            actorId || undefined
          );
          toast.error('Authorization failed. Incorrect SuperAdmin password.');
          return;
        }
      } else {
        if (oauthConfirmPhrase.trim().toUpperCase() !== 'AUTHORIZE MIGRATION') {
          toast.error('Type "AUTHORIZE MIGRATION" to verify authorization.');
          return;
        }
      }

      setAuthPassword('');
      setOauthConfirmPhrase('');
      setIsAuthenticated(true);
      await logAudit(
        'LEGACY_CSV_MIGRATION_UNLOCKED',
        `SuperAdmin (${actorEmail}) unlocked DatabaseMigrationManager portal.`,
        actorId || undefined
      );
      await Promise.all([refreshDbReadiness(), loadMigrationHistory()]);
      toast.success(
        'SuperAdmin credentials verified. Migration portal unlocked.'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to verify authorization.');
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!isSuper) return;
    try {
      setIsDownloadingTemplate(true);
      const csvContent = generateUnifiedMigrationCsvTemplate();
      await downloadExportFile(
        csvContent,
        'wolf_palomar_migration_template.csv',
        'text/csv;charset=utf-8'
      );
      await logAudit(
        'LEGACY_CSV_TEMPLATE_DOWNLOADED',
        'SuperAdmin downloaded unified two-group CSV migration template (wolf_palomar_migration_template.csv).',
        actorId || undefined
      );
      toast.success(
        'Unified CSV template (Products + Members) downloaded successfully.'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download CSV template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const processCsvFile = async (file: File) => {
    if (!isSuper || !isAuthenticated) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && file.type !== 'text/csv') {
      const errMsg = 'Invalid file type. Upload a valid .csv template file.';
      await recordMigrationAttempt({
        superadminId: actorId,
        superadminEmail: actorEmail,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileHash: 'INVALID_FILE_TYPE',
        status: 'failure',
        errorCount: 1,
        errorMessage: errMsg,
      });
      await loadMigrationHistory();
      toast.error(errMsg);
      return;
    }

    if (file.size === 0) {
      const errMsg = 'Uploaded CSV file is empty.';
      const emptyHash = await computeSha256Hex('');
      await recordMigrationAttempt({
        superadminId: actorId,
        superadminEmail: actorEmail,
        fileName: file.name,
        fileSizeBytes: 0,
        fileHash: emptyHash,
        status: 'failure',
        errorCount: 1,
        errorMessage: errMsg,
      });
      await loadMigrationHistory();
      toast.error(errMsg);
      return;
    }

    if (file.size > MAX_CSV_FILE_BYTES) {
      const errMsg = 'CSV file exceeds 5 MB security limit.';
      await recordMigrationAttempt({
        superadminId: actorId,
        superadminEmail: actorEmail,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileHash: 'EXCEEDS_MAX_SIZE',
        status: 'failure',
        errorCount: 1,
        errorMessage: errMsg,
      });
      await loadMigrationHistory();
      toast.error(errMsg);
      return;
    }

    if (sealedIdRef.current) {
      clearEphemeralSeal(sealedIdRef.current);
      sealedIdRef.current = null;
    }
    setSealedBatch(null);
    setParsedResult(null);
    setExecutionSummary(null);
    setSelectedFileName(file.name);
    setSelectedFileBytes(file.size);
    setIsValidatingFile(true);

    try {
      const freshSnapshot = await refreshDbReadiness();
      if (!freshSnapshot) return;

      const text = await file.text();
      const result = await parseAndValidateMigrationCsv(text, freshSnapshot);
      setParsedResult(result);

      if (result.errorCount > 0) {
        setInspectTab('issues');
        const validationErrorList = result.issues.filter(
          (i) => i.severity === 'error'
        );
        await recordMigrationAttempt({
          superadminId: actorId,
          superadminEmail: actorEmail,
          fileName: file.name,
          fileSizeBytes: file.size,
          fileHash: result.rawCsvSha256,
          payloadHash: result.canonicalSha256,
          status: 'failure',
          productsCount: result.products.length,
          membersCount: result.members.length,
          subscriptionsCount: result.subscriptionCount,
          cardsCount: result.cardCount,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
          validationErrors: validationErrorList,
          errorMessage: `Schema/integrity validation failed with ${result.errorCount} error(s) before batch insert.`,
        });
        await loadMigrationHistory();
        toast.error(
          `Validation stopped: Found ${result.errorCount} error(s). Logged attempt and blocked insert.`
        );
      } else {
        const sealed = await sealMigrationBatch(result);
        sealedIdRef.current = sealed.sealId;
        setSealedBatch(sealed);
        setInspectTab(result.warningCount > 0 ? 'issues' : 'products');
        toast.success(
          `CSV validated & AES-GCM sealed! Ready to import ${result.products.length} product(s) and ${result.members.length} member(s).`
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to parse CSV migration file.';
      await recordMigrationAttempt({
        superadminId: actorId,
        superadminEmail: actorEmail,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileHash: 'PARSE_EXCEPTION',
        status: 'failure',
        errorCount: 1,
        errorMessage: msg,
      });
      await loadMigrationHistory();
      toast.error(msg);
    } finally {
      setIsValidatingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processCsvFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (isValidatingFile || isMigrating) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processCsvFile(file);
  };

  const isDbClean = useMemo(() => {
    if (!dbSnapshot) return false;
    return (
      dbSnapshot.activeProductCount === 0 && dbSnapshot.activeMemberCount === 0
    );
  }, [dbSnapshot]);

  const canExecuteMigration = useMemo(() => {
    if (!isSuper || !isAuthenticated || effectiveSessionOpen) return false;
    if (!parsedResult || !parsedResult.isValid || !sealedBatch) return false;
    if (isMigrating || isValidatingFile) return false;
    if (!isDbClean && !nonEmptyOverrideAck) return false;
    return true;
  }, [
    isSuper,
    isAuthenticated,
    effectiveSessionOpen,
    parsedResult,
    sealedBatch,
    isMigrating,
    isValidatingFile,
    isDbClean,
    nonEmptyOverrideAck,
  ]);

  const handleExecuteMigration = async () => {
    if (!canExecuteMigration || !sealedBatch || !parsedResult) return;

    try {
      setIsMigrating(true);
      setMigrationProgress(3);
      setMigrationStage('Validating SuperAdmin & closed cash session...');

      const summary = await executeSecuredCsvMigration({
        sealedBatch,
        actorEmail,
        actorId,
        nonEmptyOverride: nonEmptyOverrideAck,
        onProgress: (pct, label) => {
          setMigrationProgress(pct);
          setMigrationStage(label);
        },
      });

      await recordMigrationAttempt({
        superadminId: actorId,
        superadminEmail: actorEmail,
        fileName: selectedFileName || 'csv_batch.csv',
        fileSizeBytes: selectedFileBytes,
        fileHash: summary.rawCsvSha256,
        payloadHash: summary.canonicalSha256,
        status: 'success',
        productsCount: summary.productsInserted,
        membersCount: summary.membersInserted,
        subscriptionsCount: summary.subscriptionsInserted,
        cardsCount: summary.cardsIssued,
        errorCount: 0,
        warningCount: parsedResult.warningCount,
        validationErrors: parsedResult.issues.filter(
          (i) => i.severity === 'warning'
        ),
        nonEmptyOverride: nonEmptyOverrideAck,
        notes: 'Batch migration committed and verified cleanly.',
      });

      sealedIdRef.current = null;
      setSealedBatch(null);
      setExecutionSummary(summary);
      toast.success(
        `Migration complete! Imported ${summary.productsInserted} product(s) and ${summary.membersInserted} member(s).`
      );
      await Promise.all([refreshDbReadiness(), loadMigrationHistory()]);
      onSuccess?.();
    } catch (err: any) {
      const errMsg = err?.message || 'Migration execution failed.';
      await recordMigrationAttempt({
        superadminId: actorId,
        superadminEmail: actorEmail,
        fileName: selectedFileName || 'csv_batch.csv',
        fileSizeBytes: selectedFileBytes,
        fileHash: sealedBatch.rawCsvSha256,
        payloadHash: sealedBatch.canonicalSha256,
        status: 'failure',
        productsCount: parsedResult.products.length,
        membersCount: parsedResult.members.length,
        errorCount: 1,
        warningCount: parsedResult.warningCount,
        errorMessage: errMsg,
        nonEmptyOverride: nonEmptyOverrideAck,
      });
      await loadMigrationHistory();
      toast.error(errMsg);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleCopyHash = async (id: string, hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHashId(id);
      setTimeout(() => setCopiedHashId(null), 1500);
    } catch {
      toast.info(`SHA-256: ${hash}`);
    }
  };

  if (!isSuper) {
    return (
      <div className="p-6 rounded-2xl bg-(--bg-card) border border-rose-500/30 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto" />
        <h4 className="font-heading font-black text-sm uppercase tracking-wider text-(--color-text)">
          SuperAdmin Clearance Required
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          DatabaseMigrationManager is strictly restricted to the assigned SuperAdmin account.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`bg-(--bg-card) text-(--color-text) flex flex-col overflow-hidden ${
        embedded
          ? 'border border-(--border-color) rounded-2xl shadow-xs'
          : 'border border-(--border-color) rounded-2xl sm:rounded-3xl w-full shadow-2xl max-h-[94vh] max-w-5xl'
      }`}
    >
      {/* TOP BRAND STRIP */}
      <div className="w-full h-1.5 bg-blue-600 shrink-0" />

      {/* HEADER */}
      <div className="p-4 sm:p-5 border-b border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-(--bg-card) shrink-0">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-black text-sm sm:text-base uppercase tracking-wider text-(--color-text)">
                Database Migration Manager
              </h3>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                • SuperAdmin Exclusive
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              Unified two-group CSV migration (Products + Members) with SHA-256 verification, AES-GCM seal, and{' '}
              <code className="font-mono text-(--color-text)">
                migration_audit_logs
              </code>{' '}
              accountability.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {isAuthenticated && !effectiveSessionOpen && (
            <div className="flex items-center p-1 rounded-xl bg-(--bg-page) border border-(--border-color)">
              <button
                type="button"
                onClick={() => setPortalTab('workspace')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                  portalTab === 'workspace'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                }`}
              >
                Import CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setPortalTab('audit_logs');
                  loadMigrationHistory();
                }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                  portalTab === 'audit_logs'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Audit Logs ({auditLogs.length})</span>
              </button>
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={() => !isMigrating && onClose()}
              disabled={isMigrating}
              className="w-8 h-8 rounded-xl bg-(--bg-input) hover:bg-(--bg-page) text-slate-500 dark:text-slate-400 hover:text-(--color-text) border border-(--border-color) flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              title="Close Migration Console"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      {checkingLiveGate ? (
        <div className="p-10 flex flex-col items-center justify-center gap-3 text-xs text-slate-500 font-mono">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span>Checking live cash session &amp; SuperAdmin clearance...</span>
        </div>
      ) : effectiveSessionOpen ? (
        /* GATE 1: CLOSED CASH SESSION REQUIRED */
        <div className="p-6 sm:p-8 space-y-5 max-w-md mx-auto my-auto text-center w-full">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h4 className="font-heading font-black text-sm uppercase tracking-wider text-(--color-text)">
              Cash Drawer Session Is Open
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              CSV Data Migration is strictly disabled while a cash drawer session is active. Close the cash session in Cash Management first to protect inventory and ledger integrity.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={refreshDbReadiness}
              className="px-4 py-2 rounded-xl border border-(--border-color) bg-(--bg-page) hover:bg-(--bg-input) text-(--color-text) font-heading text-xs font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Recheck Session</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-heading text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Close
              </button>
            )}
          </div>
        </div>
      ) : !isAuthenticated ? (
        /* GATE 2: SUPERADMIN PASSWORD / OAUTH AUTHORIZATION */
        <div className="p-5 sm:p-8 space-y-5 max-w-md mx-auto my-auto text-left w-full overflow-y-auto">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-heading text-[10px] font-extrabold uppercase tracking-wider block text-amber-700 dark:text-amber-400">
                Restricted SuperAdmin Authentication
              </span>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300 font-medium">
                Every CSV migration attempt (success or validation failure) is permanently recorded with your SuperAdmin ID, SHA-256 file hash, and timestamp.
              </p>
            </div>
          </div>

          <form onSubmit={handleAuthorizeAccess} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Assigned SuperAdmin Identity
              </label>
              <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color) text-xs font-mono font-bold text-(--color-text) flex items-center justify-between gap-2">
                <span className="truncate">{actorEmail || 'SuperAdmin'}</span>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-sans font-extrabold shrink-0">
                  Env Assigned
                </span>
              </div>
            </div>

            {hasPassword ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-500" />
                  <span>SuperAdmin Password *</span>
                </label>
                <div className="relative">
                  <input
                    type={showAuthPassword ? 'text' : 'password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Enter your SuperAdmin password..."
                    autoComplete="off"
                    spellCheck={false}
                    autoCorrect="off"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-(--border-color) bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-blue-500 transition-colors font-mono"
                    autoFocus={!embedded}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) cursor-pointer p-0.5"
                  >
                    {showAuthPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center gap-2.5 text-xs">
                  <img
                    src={googleIcon}
                    alt="Google"
                    className="w-4 h-4 object-contain shrink-0"
                  />
                  <span>
                    Signed in via Google OAuth (no local password set).
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Type "AUTHORIZE MIGRATION" to Confirm *
                  </label>
                  <input
                    type="text"
                    value={oauthConfirmPhrase}
                    onChange={(e) => setOauthConfirmPhrase(e.target.value)}
                    placeholder="AUTHORIZE MIGRATION"
                    autoComplete="off"
                    spellCheck={false}
                    autoCorrect="off"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-page) text-xs font-mono font-bold uppercase text-(--color-text) outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={
                isVerifyingAuth ||
                (hasPassword
                  ? !authPassword.trim()
                  : oauthConfirmPhrase.trim().toUpperCase() !==
                    'AUTHORIZE MIGRATION')
              }
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white font-heading font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isVerifyingAuth ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Verify &amp; Unlock Portal</span>
                </>
              )}
            </button>
          </form>
        </div>
      ) : portalTab === 'audit_logs' ? (
        /* PORTAL TAB 2: MIGRATION AUDIT LOGS (`migration_audit_logs`) */
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h4 className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-(--color-text)">
                Migration Attempt Audit Trail
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Append-only Supabase ledger (
                <code className="font-mono text-(--color-text)">
                  migration_audit_logs
                </code>
                ) recording every validation failure, block, and completed batch.
              </p>
            </div>
            <button
              type="button"
              onClick={loadMigrationHistory}
              disabled={loadingLogs}
              className="self-start sm:self-auto px-3 py-2 rounded-xl border border-(--border-color) bg-(--bg-page) hover:bg-(--bg-input) text-xs font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`}
              />
              <span>Refresh Logs</span>
            </button>
          </div>

          {auditTableUnavailable && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-heading uppercase text-[10px] tracking-wider">
                  Dedicated Table Pending Migration
                </strong>
                <span>
                  The SQL migration for{' '}
                  <code className="font-mono">public.migration_audit_logs</code>{' '}
                  has not yet been pushed to this Supabase project. Attempts are still mirrored in general{' '}
                  <code className="font-mono">audit_logs</code>.
                </span>
              </div>
            </div>
          )}

          {loadingLogs ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs font-mono text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Loading migration audit logs...</span>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-10 text-center rounded-2xl border border-(--border-color) bg-(--bg-page) text-xs text-slate-500 font-mono">
              No migration attempts recorded yet in migration_audit_logs.
            </div>
          ) : (
            <div className="space-y-2.5">
              {auditLogs.map((entry) => {
                const isExpanded = expandedLogId === entry.id;
                const valErrors = Array.isArray(entry.validation_errors)
                  ? entry.validation_errors
                  : [];

                return (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-2xl border border-(--border-color) bg-(--bg-page) space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black uppercase text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            Success
                          </span>
                        ) : entry.status === 'blocked' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black uppercase text-amber-600 dark:text-amber-400">
                            <Lock className="w-4 h-4" />
                            Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black uppercase text-rose-600 dark:text-rose-400">
                            <XCircle className="w-4 h-4" />
                            Failure
                          </span>
                        )}

                        <span className="text-slate-300 dark:text-zinc-700">
                          •
                        </span>
                        <span className="text-xs font-bold text-(--color-text) truncate max-w-[220px]">
                          {entry.file_name || 'N/A'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {new Date(entry.created_at).toLocaleString('en-US', {
                            timeZone: 'Asia/Manila',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}{' '}
                          PHT
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyHash(entry.id, entry.file_hash)
                          }
                          className="px-2 py-1 rounded-lg bg-(--bg-card) border border-(--border-color) text-slate-600 dark:text-slate-300 hover:text-(--color-text) cursor-pointer inline-flex items-center gap-1"
                          title={`Copy full SHA-256: ${entry.file_hash}`}
                        >
                          {copiedHashId === entry.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            Hash: {entry.file_hash.slice(0, 12).toUpperCase()}...
                          </span>
                        </button>

                        {(valErrors.length > 0 || entry.error_message) && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLogId(isExpanded ? null : entry.id)
                            }
                            className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-bold cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>
                              Details ({valErrors.length || 1})
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span>
                        Actor: <strong className="text-(--color-text)">{entry.superadmin_email}</strong>
                      </span>
                      {entry.superadmin_id && (
                        <span>ID: {entry.superadmin_id.slice(0, 8)}...</span>
                      )}
                      <span>Products: {entry.products_count}</span>
                      <span>Members: {entry.members_count}</span>
                      <span>Errors: {entry.error_count}</span>
                      <span>Warnings: {entry.warning_count}</span>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 border-t border-(--border-color) space-y-2">
                        {entry.error_message && (
                          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300 font-medium">
                            {entry.error_message}
                          </div>
                        )}
                        {valErrors.length > 0 && (
                          <div className="max-h-48 overflow-y-auto space-y-1.5">
                            {valErrors.map((err, eIdx) => (
                              <div
                                key={eIdx}
                                className="p-2 rounded-lg bg-(--bg-card) border border-(--border-color) text-[11px] font-mono"
                              >
                                <span className="font-bold text-rose-600 dark:text-rose-400">
                                  [{err.group}] Line {err.line}
                                  {err.field ? ` • ${err.field}` : ''}:
                                </span>{' '}
                                <span className="text-(--color-text) font-sans">
                                  {err.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* PORTAL TAB 1: AUTHENTICATED TWO-GROUP CSV MIGRATION WORKSPACE */
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 text-left">
          {/* COMPLETION BANNER (IF JUST EXECUTED) */}
          {executionSummary && (
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h4 className="font-heading font-black text-sm uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    CSV Migration Executed &amp; Audited
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Successfully imported{' '}
                    <strong className="font-mono tabular-nums text-(--color-text)">
                      {executionSummary.productsInserted}
                    </strong>{' '}
                    product(s),{' '}
                    <strong className="font-mono tabular-nums text-(--color-text)">
                      {executionSummary.membersInserted}
                    </strong>{' '}
                    member(s),{' '}
                    <strong className="font-mono tabular-nums text-(--color-text)">
                      {executionSummary.subscriptionsInserted}
                    </strong>{' '}
                    subscription(s), and{' '}
                    <strong className="font-mono tabular-nums text-(--color-text)">
                      {executionSummary.cardsIssued}
                    </strong>{' '}
                    member card(s).
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
                    File SHA-256: {executionSummary.rawCsvSha256}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 1. DATABASE READINESS & EMPTY-TABLE RECOMMENDATION CHECK */}
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDbClean
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              {isDbClean ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-heading text-xs font-black uppercase tracking-wider ${
                      isDbClean
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {isDbClean
                      ? 'Empty Database Verified — Ideal for Migration'
                      : 'Non-Empty Database Detected — Caution Advised'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isDbClean
                    ? 'Both Products and Members tables currently have 0 active records. Clean-slate CSV migration is optimal.'
                    : 'CSV Legacy Data Migration is highly recommended when Products and Members tables are empty. Existing records are cross-checked to block duplicates, and explicit acknowledgement is required below.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-(--bg-card) border border-(--border-color) text-xs font-mono tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">
                  Products:{' '}
                </span>
                <strong className="text-(--color-text)">
                  {loadingSnapshot
                    ? '...'
                    : (dbSnapshot?.activeProductCount ?? 0)}
                </strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-(--bg-card) border border-(--border-color) text-xs font-mono tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">
                  Members:{' '}
                </span>
                <strong className="text-(--color-text)">
                  {loadingSnapshot
                    ? '...'
                    : (dbSnapshot?.activeMemberCount ?? 0)}
                </strong>
              </div>
              <button
                type="button"
                onClick={refreshDbReadiness}
                disabled={loadingSnapshot || isMigrating}
                className="p-2 rounded-xl bg-(--bg-card) border border-(--border-color) text-slate-500 hover:text-(--color-text) cursor-pointer disabled:opacity-40"
                title="Refresh database counts"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingSnapshot ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* 2. STEP 1 (TEMPLATE) & STEP 2 (CSV IMPORT DROPZONE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* STEP 1: DOWNLOAD UNIFIED TWO-GROUP CSV TEMPLATE */}
            <div className="p-4 rounded-2xl bg-(--bg-page) border border-(--border-color) flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Step 1 • Download CSV Template
                  </span>
                  <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Download the official single-file CSV containing both{' '}
                  <code className="font-mono text-(--color-text)">[PRODUCTS]</code>{' '}
                  and{' '}
                  <code className="font-mono text-(--color-text)">[MEMBERS]</code>{' '}
                  groups. Open in Excel or Google Sheets, replace sample rows, and save as CSV UTF-8.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={isDownloadingTemplate || isMigrating}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-heading font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDownloadingTemplate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Download CSV Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSchemaGuide((s) => !s)}
                  className="px-3 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) hover:bg-(--bg-input) text-(--color-text) font-heading font-bold text-[11px] uppercase tracking-wider cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Schema Guide</span>
                  {showSchemaGuide ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* STEP 2: DRAG & DROP / FILE-INPUT CSV HANDLER */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-colors ${
                isDraggingOver
                  ? 'bg-blue-500/10 border-blue-500'
                  : 'bg-(--bg-page) border-(--border-color)'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Step 2 • Import &amp; Validate CSV
                  </span>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Drop a CSV file here or browse. Every row is checked against Supabase constraints; validation failures are logged automatically.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isValidatingFile || isMigrating}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-blue-500/40 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 text-(--color-text) font-heading font-bold text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isValidatingFile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Deep-Validating CSV &amp; Sealing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-blue-500" />
                      <span className="truncate">
                        {selectedFileName
                          ? `Selected: ${selectedFileName} (${(selectedFileBytes / 1024).toFixed(1)} KB)`
                          : 'Choose or Drop Completed CSV File'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* EXPANDABLE SCHEMA REFERENCE GUIDE */}
          {showSchemaGuide && (
            <div className="p-4 rounded-2xl bg-(--bg-page) border border-(--border-color) space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-heading font-black text-[11px] uppercase tracking-wider text-(--color-text)">
                    <Package className="w-3.5 h-3.5 text-blue-500" />
                    <span>Group 1: [PRODUCTS] Columns</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) font-mono text-[11px] text-slate-600 dark:text-slate-300 break-words leading-relaxed">
                    {PRODUCT_HEADERS.join(', ')}
                  </div>
                  <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 list-disc pl-4">
                    <li>selling_price: positive number (&gt; 0, max 2 decimals)</li>
                    <li>has_stock_limit: true / false; integer stock_quantity if true</li>
                    <li>manufacturer_barcode: optional, max 32 chars, unique</li>
                    <li>status: Active or Inactive</li>
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-heading font-black text-[11px] uppercase tracking-wider text-(--color-text)">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Group 2: [MEMBERS] Columns</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) font-mono text-[11px] text-slate-600 dark:text-slate-300 break-words leading-relaxed">
                    {MEMBER_HEADERS.join(', ')}
                  </div>
                  <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 list-disc pl-4">
                    <li>plan_type: monthly (max 31d), yearly (max 366d), or none</li>
                    <li>start_date / end_date: YYYY-MM-DD required if plan != none</li>
                    <li>issue_card: true / false; card_type: QR or Manual if true</li>
                    <li>gender: Male / Female / Other; status: Active / Suspended</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 3. VALIDATION TELEMETRY & CRYPTOGRAPHIC SEAL STATUS */}
          {parsedResult && (
            <div className="space-y-3.5">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Products
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-(--color-text)">
                    {parsedResult.products.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Members
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-(--color-text)">
                    {parsedResult.members.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Plans
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-blue-600 dark:text-blue-400">
                    {parsedResult.subscriptionCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Cards
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-sky-600 dark:text-sky-400">
                    {parsedResult.cardCount}
                  </span>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    parsedResult.errorCount > 0
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-emerald-500/10 border-emerald-500/30'
                  }`}
                >
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Errors
                  </span>
                  <span
                    className={`text-lg font-mono font-black tabular-nums ${
                      parsedResult.errorCount > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {parsedResult.errorCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Warnings
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-amber-600 dark:text-amber-400">
                    {parsedResult.warningCount}
                  </span>
                </div>
              </div>

              {/* Cryptographic Integrity Strip */}
              <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono">
                <div className="flex items-center gap-2 min-w-0">
                  {sealedBatch ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span className="font-bold text-(--color-text) truncate">
                    {sealedBatch
                      ? 'AES-GCM-256 Sealed & SHA-256 Verified'
                      : 'Integrity Seal Blocked (Attempt Logged)'}
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  File SHA-256: {parsedResult.rawCsvSha256.slice(0, 20).toUpperCase()}...
                </div>
              </div>

              {/* Inspector Tabs */}
              <div className="border border-(--border-color) rounded-2xl overflow-hidden bg-(--bg-page)">
                <div className="p-2 border-b border-(--border-color) bg-(--bg-card) flex items-center gap-1.5 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setInspectTab('issues')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider cursor-pointer shrink-0 transition-colors ${
                      inspectTab === 'issues'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                    }`}
                  >
                    Validation Log ({parsedResult.issues.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectTab('products')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider cursor-pointer shrink-0 transition-colors ${
                      inspectTab === 'products'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                    }`}
                  >
                    Products ({parsedResult.products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectTab('members')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider cursor-pointer shrink-0 transition-colors ${
                      inspectTab === 'members'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                    }`}
                  >
                    Members ({parsedResult.members.length})
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                  {inspectTab === 'issues' && (
                    <>
                      {parsedResult.issues.length === 0 ? (
                        <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            Zero errors and zero warnings. All records passed strict schema &amp; collision validation.
                          </span>
                        </div>
                      ) : (
                        parsedResult.issues.map((iss, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                              iss.severity === 'error'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {iss.severity === 'error' ? (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="font-mono text-[11px] font-bold flex flex-wrap items-center gap-x-2">
                                <span>[{iss.group}]</span>
                                <span>Line {iss.line}</span>
                                {iss.field && <span>• {iss.field}</span>}
                                {iss.identifier && (
                                  <span className="truncate max-w-[200px]">
                                    • {iss.identifier}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs leading-snug">
                                {iss.message}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {inspectTab === 'products' && (
                    <div className="overflow-x-auto">
                      {parsedResult.products.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          No valid products in CSV batch.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-(--border-color) text-[10px] font-heading uppercase text-slate-500">
                              <th className="py-2 pr-3">Line</th>
                              <th className="py-2 pr-3">Product Name</th>
                              <th className="py-2 pr-3">Price</th>
                              <th className="py-2 pr-3">Stock</th>
                              <th className="py-2 pr-3">Barcode</th>
                              <th className="py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-(--border-color)">
                            {parsedResult.products.map((p) => (
                              <tr key={p.lineNumber}>
                                <td className="py-2 pr-3 font-mono text-slate-400">
                                  {p.lineNumber}
                                </td>
                                <td className="py-2 pr-3 font-bold text-(--color-text)">
                                  {p.product_name}
                                </td>
                                <td className="py-2 pr-3 font-mono tabular-nums">
                                  ₱{p.selling_price.toFixed(2)}
                                </td>
                                <td className="py-2 pr-3 font-mono tabular-nums">
                                  {p.has_stock_limit
                                    ? `${p.stock_quantity} (Alert: ${p.low_stock_alert ?? 'None'})`
                                    : 'Unlimited'}
                                </td>
                                <td className="py-2 pr-3 font-mono text-slate-500">
                                  {p.manufacturer_barcode || 'Auto PR-XXXX'}
                                </td>
                                <td className="py-2 font-mono">{p.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {inspectTab === 'members' && (
                    <div className="overflow-x-auto">
                      {parsedResult.members.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          No valid members in CSV batch.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-(--border-color) text-[10px] font-heading uppercase text-slate-500">
                              <th className="py-2 pr-3">Line</th>
                              <th className="py-2 pr-3">Full Name</th>
                              <th className="py-2 pr-3">Phone</th>
                              <th className="py-2 pr-3">Plan</th>
                              <th className="py-2 pr-3">Term</th>
                              <th className="py-2">Card</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-(--border-color)">
                            {parsedResult.members.map((m) => (
                              <tr key={m.lineNumber}>
                                <td className="py-2 pr-3 font-mono text-slate-400">
                                  {m.lineNumber}
                                </td>
                                <td className="py-2 pr-3 font-bold text-(--color-text)">
                                  {m.full_name}
                                </td>
                                <td className="py-2 pr-3 font-mono">
                                  {m.phone}
                                </td>
                                <td className="py-2 pr-3 font-mono uppercase">
                                  {m.plan_type}
                                </td>
                                <td className="py-2 pr-3 font-mono tabular-nums text-slate-500">
                                  {m.plan_type !== 'none'
                                    ? `${m.start_date} -> ${m.end_date}`
                                    : 'Profile Only'}
                                </td>
                                <td className="py-2 font-mono">
                                  {m.issue_card ? m.card_type : 'None'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Explicit Confirmation Checkbox when DB is non-empty */}
              {!isDbClean && parsedResult.isValid && !executionSummary && (
                <label className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={nonEmptyOverrideAck}
                    onChange={(e) => setNonEmptyOverrideAck(e.target.checked)}
                    disabled={isMigrating}
                    className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                    I understand this database already has{' '}
                    <strong>{dbSnapshot?.activeProductCount} product(s)</strong> and{' '}
                    <strong>{dbSnapshot?.activeMemberCount} member(s)</strong>, and I confirm importing this verified CSV batch anyway.
                  </span>
                </label>
              )}

              {/* Progress Indicator */}
              {isMigrating && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      {migrationStage}
                    </span>
                    <span className="tabular-nums font-bold">
                      {migrationProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-(--bg-input) overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${migrationProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FOOTER (Shown on CSV Import Workspace tab) */}
      {isAuthenticated &&
        !effectiveSessionOpen &&
        !checkingLiveGate &&
        portalTab === 'workspace' && (
          <div className="p-4 border-t border-(--border-color) bg-(--bg-card) flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                disabled={isMigrating}
                className="px-4 py-2.5 bg-(--bg-input) hover:bg-(--bg-page) text-(--color-text) rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border border-(--border-color) transition-colors disabled:opacity-40 text-center"
              >
                {executionSummary ? 'Done' : 'Close'}
              </button>
            ) : (
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Audited via public.migration_audit_logs
              </span>
            )}

            <button
              type="button"
              onClick={handleExecuteMigration}
              disabled={!canExecuteMigration}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-heading font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isMigrating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Executing Secured Migration...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    Execute Verified Migration
                    {parsedResult && parsedResult.isValid
                      ? ` (${parsedResult.products.length} Products, ${parsedResult.members.length} Members)`
                      : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
    </div>
  );
};

export default DatabaseMigrationManager;
