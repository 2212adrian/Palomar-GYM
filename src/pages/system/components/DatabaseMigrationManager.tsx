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
  GitCompare,
  RotateCcw,
  Clock,
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
  type DuplicateAction,
  type ExistingDbSnapshot,
  type ParsedMigrationResult,
  type ResolvedMigrationPlan,
  type SealedMigrationBatch,
  type MigrationExecutionSummary,
  type MigrationAuditLogEntry,
  computeSha256Hex,
  generateUnifiedMigrationCsvTemplate,
  fetchMigrationDbSnapshot,
  verifyLiveCashSessionClosed,
  parseAndValidateMigrationCsv,
  resolveMigrationBatch,
  sealMigrationBatch,
  clearEphemeralSeal,
  executeSecuredCsvMigration,
  recordMigrationAttempt,
  fetchMigrationAuditLogs,
  fetchRecentRevertibleMigrations,
  getUndoRemainingMs,
  formatRemainingUndoTime,
  revertMigrationByBatchId,
  normalizeDateWithFlexibleRegex,
} from '../utils/csvDataMigration';

/**
 * Utility helper exposed directly from DatabaseMigrationManager that normalizes
 * varied date string formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.) into
 * a validated standard UTC JS Date object before schema validation.
 */
export function normalizeDateInputToJsDate(
  rawInput: string | Date
): Date | null {
  return normalizeDateWithFlexibleRegex(rawInput).date;
}

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
  const [duplicateResolutions, setDuplicateResolutions] = useState<
    Record<string, DuplicateAction>
  >({});
  const [resolvedPlan, setResolvedPlan] =
    useState<ResolvedMigrationPlan | null>(null);
  const [sealedBatch, setSealedBatch] = useState<SealedMigrationBatch | null>(
    null
  );
  const [isResealing, setIsResealing] = useState<boolean>(false);
  const [inspectTab, setInspectTab] = useState<
    'issues' | 'duplicates' | 'products' | 'members'
  >('issues');
  const [issueFilter, setIssueFilter] = useState<'all' | 'error' | 'warning'>(
    'all'
  );

  // Execution States
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationProgress, setMigrationProgress] = useState<number>(0);
  const [migrationStage, setMigrationStage] = useState<string>('');
  const [executionSummary, setExecutionSummary] =
    useState<MigrationExecutionSummary | null>(null);
  const [lastCompletedLog, setLastCompletedLog] =
    useState<MigrationAuditLogEntry | null>(null);

  // Audit Logs & 24h Undo/Revert States
  const [auditLogs, setAuditLogs] = useState<MigrationAuditLogEntry[]>([]);
  const [recentRevertibleBatches, setRecentRevertibleBatches] = useState<
    MigrationAuditLogEntry[]
  >([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [auditTableUnavailable, setAuditTableUnavailable] =
    useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);
  const [confirmUndoLogId, setConfirmUndoLogId] = useState<string | null>(null);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const [undoStage, setUndoStage] = useState<string>('');
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sealedIdRef = useRef<string | null>(null);

  const effectiveSessionOpen =
    isSessionOpen || Boolean(activeSession) || !liveSessionClosed;

  // Live ticker for 24-hour undo countdown windows
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTickMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const loadMigrationHistory = useCallback(async () => {
    if (!isSuper) return;
    setLoadingLogs(true);
    try {
      const [res, revertibleRes] = await Promise.all([
        fetchMigrationAuditLogs(50),
        fetchRecentRevertibleMigrations(),
      ]);
      setAuditLogs(res.logs);
      setRecentRevertibleBatches(revertibleRes);
      setAuditTableUnavailable(res.tableUnavailable);
      return res.logs;
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
    } catch {}

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

  // Recomputes resolved plan and refreshes the AES-GCM-256 cryptographic seal whenever duplicate choices change
  const applyResolutionsAndReseal = async (
    result: ParsedMigrationResult,
    nextResolutions: Record<string, DuplicateAction>
  ) => {
    setDuplicateResolutions(nextResolutions);
    if (!result.isValid || result.errorCount > 0) return;

    setIsResealing(true);
    try {
      if (sealedIdRef.current) {
        clearEphemeralSeal(sealedIdRef.current);
        sealedIdRef.current = null;
      }
      const [plan, sealed] = await Promise.all([
        resolveMigrationBatch(result, nextResolutions),
        sealMigrationBatch(result, nextResolutions),
      ]);
      sealedIdRef.current = sealed.sealId;
      setResolvedPlan(plan);
      setSealedBatch(sealed);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update migration seal.');
    } finally {
      setIsResealing(false);
    }
  };

  const handleConflictResolutionChange = async (
    conflictKey: string,
    action: DuplicateAction
  ) => {
    if (!parsedResult || isMigrating || isResealing) return;
    const next = { ...duplicateResolutions, [conflictKey]: action };
    await applyResolutionsAndReseal(parsedResult, next);
  };

  const handleResolveAllConflicts = async (action: DuplicateAction) => {
    if (!parsedResult || isMigrating || isResealing) return;
    const next: Record<string, DuplicateAction> = {};
    parsedResult.conflicts.forEach((c) => {
      next[c.conflictKey] = action;
    });
    await applyResolutionsAndReseal(parsedResult, next);
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
    setResolvedPlan(null);
    setDuplicateResolutions({});
    setExecutionSummary(null);
    setLastCompletedLog(null);
    setSelectedFileName(file.name);
    setSelectedFileBytes(file.size);
    setIsValidatingFile(true);

    try {
      const freshSnapshot = await refreshDbReadiness();
      if (!freshSnapshot) return;

      const text = await file.text();
      const result = await parseAndValidateMigrationCsv(text, freshSnapshot);
      setParsedResult(result);
      setDuplicateResolutions(result.defaultResolutions);

      if (result.errorCount > 0) {
        setInspectTab('issues');
        setIssueFilter('error');
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
        const [plan, sealed] = await Promise.all([
          resolveMigrationBatch(result, result.defaultResolutions),
          sealMigrationBatch(result, result.defaultResolutions),
        ]);
        sealedIdRef.current = sealed.sealId;
        setResolvedPlan(plan);
        setSealedBatch(sealed);

        if (result.conflicts.length > 0) {
          setInspectTab('duplicates');
          toast.info(
            `Detected ${result.conflicts.length} duplicate(s) in CSV/Database. Choose Overwrite or Ignore before executing.`
          );
        } else if (result.warningCount > 0) {
          setInspectTab('issues');
          setIssueFilter('all');
          toast.success(
            `CSV validated & AES-GCM sealed! Ready to import ${plan.productsToInsert.length} product(s) and ${plan.membersToInsert.length} member(s).`
          );
        } else {
          setInspectTab('products');
          toast.success(
            `CSV validated & AES-GCM sealed! Ready to import ${plan.productsToInsert.length} product(s) and ${plan.membersToInsert.length} member(s).`
          );
        }
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

  const totalActionableOps = useMemo(() => {
    if (!resolvedPlan) return 0;
    return (
      resolvedPlan.productsToInsert.length +
      resolvedPlan.productsToOverwrite.length +
      resolvedPlan.membersToInsert.length +
      resolvedPlan.membersToOverwrite.length
    );
  }, [resolvedPlan]);

  const canExecuteMigration = useMemo(() => {
    if (!isSuper || !isAuthenticated || effectiveSessionOpen) return false;
    if (!parsedResult || !parsedResult.isValid || !sealedBatch || !resolvedPlan)
      return false;
    if (totalActionableOps === 0) return false;
    if (isMigrating || isValidatingFile || isResealing) return false;
    if (!isDbClean && !nonEmptyOverrideAck) return false;
    return true;
  }, [
    isSuper,
    isAuthenticated,
    effectiveSessionOpen,
    parsedResult,
    sealedBatch,
    resolvedPlan,
    totalActionableOps,
    isMigrating,
    isValidatingFile,
    isResealing,
    isDbClean,
    nonEmptyOverrideAck,
  ]);

  const handleExecuteMigration = async () => {
    if (!canExecuteMigration || !sealedBatch || !parsedResult || !resolvedPlan)
      return;

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

      const attemptRes = await recordMigrationAttempt({
        batchId: summary.batchId,
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
        overwrittenCount:
          summary.productsOverwritten + summary.membersOverwritten,
        ignoredCount: summary.ignoredCount,
        errorCount: 0,
        warningCount: parsedResult.warningCount,
        validationErrors: parsedResult.issues.filter(
          (i) => i.severity === 'warning'
        ),
        nonEmptyOverride: nonEmptyOverrideAck,
        notes: `Batch ${summary.batchId} committed: ${summary.productsInserted} new / ${summary.productsOverwritten} overwritten product(s), ${summary.membersInserted} new / ${summary.membersOverwritten} overwritten member(s), ${summary.ignoredCount} ignored.`,
        rollbackManifest: summary.rollbackManifest,
        rollbackExpiresAt: summary.rollbackExpiresAt,
      });

      sealedIdRef.current = null;
      setSealedBatch(null);
      setExecutionSummary(summary);
      setNowTickMs(Date.now());

      const synthesizedLogEntry: MigrationAuditLogEntry = {
        id: attemptRes.auditLogId || `local_${Date.now()}`,
        batch_id: summary.batchId,
        created_at: summary.executedAt,
        superadmin_id: actorId,
        superadmin_email: actorEmail || 'SuperAdmin',
        file_name: selectedFileName || 'csv_batch.csv',
        file_size_bytes: selectedFileBytes,
        file_hash: summary.rawCsvSha256,
        payload_hash: summary.canonicalSha256,
        status: 'success',
        products_count: summary.productsInserted,
        members_count: summary.membersInserted,
        subscriptions_count: summary.subscriptionsInserted,
        cards_count: summary.cardsIssued,
        overwritten_count:
          summary.productsOverwritten + summary.membersOverwritten,
        ignored_count: summary.ignoredCount,
        error_count: 0,
        warning_count: parsedResult.warningCount,
        validation_errors: [],
        error_message: null,
        non_empty_override: nonEmptyOverrideAck,
        notes: null,
        rollback_manifest: summary.rollbackManifest,
        rollback_expires_at: summary.rollbackExpiresAt,
      };
      setLastCompletedLog(synthesizedLogEntry);

      toast.success(
        `Migration complete! +${summary.productsInserted} new / ${summary.productsOverwritten} updated products, +${summary.membersInserted} new / ${summary.membersOverwritten} updated members.`
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

  const handleConfirmUndo = async (entry: MigrationAuditLogEntry) => {
    if (!isSuper || undoingLogId) return;
    setUndoingLogId(entry.id);
    setUndoStage('Verifying 24h rollback window & batch_id...');
    try {
      const res = await revertMigrationByBatchId({
        batchId: entry.batch_id || null,
        logEntry: entry,
        actorEmail,
        actorId,
        onProgress: (_pct, label) => setUndoStage(label),
      });

      setConfirmUndoLogId(null);
      if (lastCompletedLog && lastCompletedLog.id === entry.id) {
        setLastCompletedLog({
          ...lastCompletedLog,
          status: 'REVERTED',
          reverted_at: new Date().toISOString(),
          reverted_by_email: actorEmail,
        });
      }

      toast.success(
        `Migration${res.batchId ? ` (${res.batchId})` : ''} reverted! Removed ${res.deletedProducts} product(s), ${res.deletedMembers} member(s), ${res.deletedSubscriptions} subscription(s), ${res.deletedCards} card(s), and restored ${res.restoredProducts + res.restoredMembers} overwritten record(s).`
      );
      await Promise.all([refreshDbReadiness(), loadMigrationHistory()]);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revert migration batch.');
    } finally {
      setUndoingLogId(null);
      setUndoStage('');
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

  const filteredIssues = useMemo(() => {
    if (!parsedResult) return [];
    if (issueFilter === 'all') return parsedResult.issues;
    return parsedResult.issues.filter((i) => i.severity === issueFilter);
  }, [parsedResult, issueFilter]);

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
              Smart CSV validation, Duplicate Detector (Overwrite / Ignore), SHA-256 AES-GCM sealing, and 24-hour safe Undo/Revert.
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
              onClick={() => !isMigrating && !undoingLogId && onClose()}
              disabled={isMigrating || Boolean(undoingLogId)}
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
              CSV Data Migration and 24-hour Rollback are strictly disabled while a cash drawer session is active. Close the cash session in Cash Management first.
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
                Every migration, duplicate resolution, and 24-hour revert is permanently recorded with your SuperAdmin ID, SHA-256 hash, and timestamp.
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
        /* PORTAL TAB 2: MIGRATION AUDIT LOGS + 24H UNDO CONTROLS */
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h4 className="font-heading font-black text-xs sm:text-sm uppercase tracking-wider text-(--color-text)">
                Migration Audit Trail &amp; 24-Hour Undo Window
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Executed migrations remain reversible for strictly 24 hours via{' '}
                <code className="font-mono text-(--color-text)">
                  migration_audit_logs
                </code>
                . Once 24 hours elapse, undo closes permanently.
              </p>
            </div>
            <button
              type="button"
              onClick={loadMigrationHistory}
              disabled={loadingLogs || Boolean(undoingLogId)}
              className="self-start sm:self-auto px-3 py-2 rounded-xl border border-(--border-color) bg-(--bg-page) hover:bg-(--bg-input) text-xs font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40"
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
                  Push the SQL files in{' '}
                  <code className="font-mono">
                    src/lib/supabase/migrations/ready/
                  </code>{' '}
                  to enable full multi-device audit &amp; rollback tracking.
                </span>
              </div>
            </div>
          )}

          {recentRevertibleBatches.length > 0 && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <h5 className="font-heading font-black text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Revert Migration (Last 24h Active Batches)
                  </h5>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400 uppercase">
                  {recentRevertibleBatches.length} Reversible Batch(es)
                </span>
              </div>

              <div className="space-y-2">
                {recentRevertibleBatches.map((batch) => {
                  const batchRemainingMs = getUndoRemainingMs(batch, nowTickMs);
                  const isBatchConfirming = confirmUndoLogId === batch.id;
                  const isBatchUndoing = undoingLogId === batch.id;
                  return (
                    <div
                      key={`quick_${batch.id}`}
                      className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
                          <strong className="text-blue-600 dark:text-blue-400">
                            {batch.batch_id || `ID:${batch.id.slice(0, 8)}`}
                          </strong>
                          <span className="text-(--color-text) font-sans font-semibold truncate max-w-[200px]">
                            {batch.file_name || 'CSV Batch'}
                          </span>
                          <span className="text-amber-600 dark:text-amber-400 font-bold">
                            • {formatRemainingUndoTime(batchRemainingMs)} left
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          +{batch.products_count} Products, +{batch.members_count} Members,{' '}
                          {batch.subscriptions_count} Plans, {batch.cards_count} Cards
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isBatchConfirming ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmUndoLogId(null)}
                              disabled={isBatchUndoing}
                              className="px-2.5 py-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-[11px] font-bold cursor-pointer disabled:opacity-40"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmUndo(batch)}
                              disabled={isBatchUndoing}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {isBatchUndoing ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{undoStage || 'Reverting...'}</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Confirm Revert</span>
                                </>
                              )}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmUndoLogId(batch.id)}
                            disabled={Boolean(undoingLogId)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Revert Migration</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                const statusUpper = String(entry.status || '').toUpperCase();
                const remainingMs = getUndoRemainingMs(entry, nowTickMs);
                const canUndoEntry =
                  statusUpper === 'SUCCESS' && remainingMs > 0;
                const isUndoClosed =
                  statusUpper === 'SUCCESS' && remainingMs <= 0;
                const isConfirmingThisUndo = confirmUndoLogId === entry.id;
                const isUndoingThis = undoingLogId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-2xl border border-(--border-color) bg-(--bg-page) space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusUpper === 'SUCCESS' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black uppercase text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            Success
                          </span>
                        ) : statusUpper === 'REVERTED' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black uppercase text-amber-600 dark:text-amber-400">
                            <RotateCcw className="w-4 h-4" />
                            REVERTED
                          </span>
                        ) : statusUpper === 'BLOCKED' ? (
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

                      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                        {canUndoEntry && !isConfirmingThisUndo && (
                          <button
                            type="button"
                            onClick={() => setConfirmUndoLogId(entry.id)}
                            disabled={Boolean(undoingLogId)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40"
                            title="Revert this migration batch within the 24-hour rollback window"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>
                              Undo ({formatRemainingUndoTime(remainingMs)})
                            </span>
                          </button>
                        )}

                        {isUndoClosed && (
                          <span className="px-2.5 py-1 rounded-lg bg-(--bg-card) border border-(--border-color) text-slate-400 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>24h Undo Closed</span>
                          </span>
                        )}

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
                      {entry.batch_id && (
                        <span>
                          Batch:{' '}
                          <strong className="text-blue-600 dark:text-blue-400">
                            {entry.batch_id}
                          </strong>
                        </span>
                      )}
                      <span>
                        Actor:{' '}
                        <strong className="text-(--color-text)">
                          {entry.superadmin_email}
                        </strong>
                      </span>
                      <span>Products: {entry.products_count}</span>
                      <span>Members: {entry.members_count}</span>
                      {(entry.overwritten_count ?? 0) > 0 && (
                        <span className="text-blue-600 dark:text-blue-400 font-bold">
                          Overwritten: {entry.overwritten_count}
                        </span>
                      )}
                      {(entry.ignored_count ?? 0) > 0 && (
                        <span>Ignored: {entry.ignored_count}</span>
                      )}
                      <span>Errors: {entry.error_count}</span>
                      <span>Warnings: {entry.warning_count}</span>
                      {entry.reverted_at && (
                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                          Reverted:{' '}
                          {new Date(entry.reverted_at).toLocaleString('en-US', {
                            timeZone: 'Asia/Manila',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    {isConfirmingThisUndo && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                        <div className="space-y-0.5">
                          <strong className="font-heading uppercase text-[11px] text-rose-600 dark:text-rose-400 block">
                            Confirm 24-Hour Migration Revert
                          </strong>
                          <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                            Deletes newly inserted items from this batch and restores overwritten products/members to their exact pre-migration state.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmUndoLogId(null)}
                            disabled={isUndoingThis}
                            className="px-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg-card) text-xs font-bold cursor-pointer disabled:opacity-40"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmUndo(entry)}
                            disabled={isUndoingThis}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isUndoingThis ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{undoStage || 'Reverting...'}</span>
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Confirm Undo</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

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
          {/* COMPLETION BANNER + IMMEDIATE 24-HOUR UNDO/REVERT CONTROL */}
          {executionSummary && (
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <h4 className="font-heading font-black text-sm uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      CSV Migration Executed &amp; Audited
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Products:{' '}
                      <strong className="font-mono text-(--color-text)">
                        +{executionSummary.productsInserted} new
                      </strong>
                      {executionSummary.productsOverwritten > 0 && (
                        <strong className="font-mono text-blue-600 dark:text-blue-400">
                          {' '}
                          / {executionSummary.productsOverwritten} overwritten
                        </strong>
                      )}
                      {' • '}Members:{' '}
                      <strong className="font-mono text-(--color-text)">
                        +{executionSummary.membersInserted} new
                      </strong>
                      {executionSummary.membersOverwritten > 0 && (
                        <strong className="font-mono text-blue-600 dark:text-blue-400">
                          {' '}
                          / {executionSummary.membersOverwritten} overwritten
                        </strong>
                      )}
                      {executionSummary.ignoredCount > 0 && (
                        <span>
                          {' • '}Ignored:{' '}
                          <strong className="font-mono">
                            {executionSummary.ignoredCount}
                          </strong>
                        </span>
                      )}
                      {' • '}Plans:{' '}
                      <strong className="font-mono text-(--color-text)">
                        {executionSummary.subscriptionsInserted}
                      </strong>
                      {' • '}Cards:{' '}
                      <strong className="font-mono text-(--color-text)">
                        {executionSummary.cardsIssued}
                      </strong>
                      .
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
                      Batch ID:{' '}
                      <strong className="text-blue-600 dark:text-blue-400">
                        {executionSummary.batchId}
                      </strong>{' '}
                      • File SHA-256: {executionSummary.rawCsvSha256}
                    </p>
                  </div>
                </div>

                {lastCompletedLog && (
                  <div className="shrink-0">
                    {String(lastCompletedLog.status || '').toUpperCase() ===
                    'REVERTED' ? (
                      <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-mono font-bold inline-flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Batch REVERTED</span>
                      </span>
                    ) : getUndoRemainingMs(lastCompletedLog, nowTickMs) > 0 ? (
                      confirmUndoLogId !== lastCompletedLog.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmUndoLogId(lastCompletedLog.id)
                          }
                          disabled={Boolean(undoingLogId)}
                          className="px-3.5 py-2 rounded-xl bg-(--bg-card) hover:bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>
                            Revert Migration (
                            {formatRemainingUndoTime(
                              getUndoRemainingMs(lastCompletedLog, nowTickMs)
                            )}
                            )
                          </span>
                        </button>
                      )
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl bg-(--bg-card) border border-(--border-color) text-slate-400 text-xs font-mono inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>24h Revert Window Closed</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {lastCompletedLog &&
                confirmUndoLogId === lastCompletedLog.id &&
                String(lastCompletedLog.status || '').toUpperCase() ===
                  'SUCCESS' && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <span className="text-slate-700 dark:text-slate-200 font-medium">
                      Confirm reverting this migration? All inserted products, members, subscriptions, and cards will be removed, and overwritten records restored.
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmUndoLogId(null)}
                        disabled={undoingLogId === lastCompletedLog.id}
                        className="px-3 py-1.5 rounded-lg border border-(--border-color) bg-(--bg-card) text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmUndo(lastCompletedLog)}
                        disabled={undoingLogId === lastCompletedLog.id}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {undoingLogId === lastCompletedLog.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{undoStage || 'Reverting...'}</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Confirm Undo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
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
                      : 'Non-Empty Database Detected — Duplicate Detector Active'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isDbClean
                    ? 'Both Products and Members tables currently have 0 active records. Clean-slate CSV migration is optimal.'
                    : 'Matching Products or Members already in Supabase will be flagged by the Duplicate Detector so you can Overwrite or Ignore each item.'}
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
                  <code className="font-mono text-(--color-text)">
                    [PRODUCTS]
                  </code>{' '}
                  and{' '}
                  <code className="font-mono text-(--color-text)">
                    [MEMBERS]
                  </code>{' '}
                  groups. Supports YYYY-MM-DD and Excel MM/DD/YYYY dates cleanly.
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
                  Smart validation catches subtle errors (Excel scientific barcodes, swapped dates) while auto-normalizing safe formats to keep logs clean.
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
                      <span>Smart-Validating &amp; Detecting Duplicates...</span>
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
                    <li>selling_price: positive amount (₱ / commas normalized)</li>
                    <li>has_stock_limit: true / false; integer stock_quantity if true</li>
                    <li>manufacturer_barcode: format as Text in Excel to avoid E+12</li>
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
                    <li>birthday / start_date / end_date: normalized automatically to JS Date from YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, or named months</li>
                    <li>issue_card: true / false; card_type: QR or Manual if true</li>
                    <li>gender: Male / Female / Other; status: Active / Suspended</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 3. VALIDATION TELEMETRY, DUPLICATE DETECTOR & SEAL STATUS */}
          {parsedResult && (
            <div className="space-y-3.5">
              {/* Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    New Inserts
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                    {resolvedPlan
                      ? resolvedPlan.insertedCount
                      : parsedResult.products.length +
                        parsedResult.members.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Overwrites
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-blue-600 dark:text-blue-400">
                    {resolvedPlan ? resolvedPlan.overwrittenCount : 0}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Ignored Dups
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-slate-500 dark:text-slate-300">
                    {resolvedPlan ? resolvedPlan.ignoredCount : 0}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 block">
                    Plans / Cards
                  </span>
                  <span className="text-lg font-mono font-black tabular-nums text-sky-600 dark:text-sky-400">
                    {resolvedPlan
                      ? `${resolvedPlan.subscriptionCount} / ${resolvedPlan.cardCount}`
                      : `${parsedResult.subscriptionCount} / ${parsedResult.cardCount}`}
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
                  {isResealing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                  ) : sealedBatch ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span className="font-bold text-(--color-text) truncate">
                    {isResealing
                      ? 'Re-computing SHA-256 & AES-GCM-256 seal...'
                      : sealedBatch
                        ? 'AES-GCM-256 Sealed & SHA-256 Verified'
                        : 'Integrity Seal Blocked (Fix Errors & Re-Upload)'}
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 truncate">
                  File SHA-256:{' '}
                  {parsedResult.rawCsvSha256.slice(0, 20).toUpperCase()}...
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
                    onClick={() => setInspectTab('duplicates')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider cursor-pointer shrink-0 transition-colors inline-flex items-center gap-1.5 ${
                      inspectTab === 'duplicates'
                        ? 'bg-blue-600 text-white'
                        : parsedResult.conflicts.length > 0
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                          : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                    }`}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>Duplicates ({parsedResult.conflicts.length})</span>
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

                <div className="max-h-72 overflow-y-auto p-3 space-y-2.5">
                  {inspectTab === 'issues' && (
                    <>
                      {parsedResult.issues.length > 0 && (
                        <div className="flex items-center gap-1.5 pb-1">
                          {(['all', 'error', 'warning'] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setIssueFilter(f)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer border ${
                                issueFilter === f
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-(--bg-card) text-slate-500 dark:text-slate-400 border-(--border-color)'
                              }`}
                            >
                              {f === 'all'
                                ? `All (${parsedResult.issues.length})`
                                : f === 'error'
                                  ? `Errors (${parsedResult.errorCount})`
                                  : `Warnings (${parsedResult.warningCount})`}
                            </button>
                          ))}
                        </div>
                      )}

                      {filteredIssues.length === 0 ? (
                        <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {parsedResult.issues.length === 0
                              ? 'Zero errors and zero warnings. All records passed smart schema validation.'
                              : 'No matching issues in this filter.'}
                          </span>
                        </div>
                      ) : (
                        filteredIssues.map((iss, idx) => (
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

                  {inspectTab === 'duplicates' && (
                    <>
                      {parsedResult.conflicts.length === 0 ? (
                        <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            No duplicate products or members detected inside this CSV or against the live Supabase database.
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {/* Bulk Duplicate Controls */}
                          <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              Detected{' '}
                              <strong className="font-mono text-(--color-text)">
                                {parsedResult.conflicts.length}
                              </strong>{' '}
                              duplicate match(es). Choose <strong>Ignore</strong> (keep existing) or <strong>Overwrite</strong> (update with CSV).
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleResolveAllConflicts('ignore')
                                }
                                disabled={isResealing || isMigrating}
                                className="px-2.5 py-1.5 rounded-lg bg-(--bg-page) hover:bg-(--bg-input) border border-(--border-color) text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                              >
                                Ignore All
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleResolveAllConflicts('overwrite')
                                }
                                disabled={isResealing || isMigrating}
                                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                              >
                                Overwrite All
                              </button>
                            </div>
                          </div>

                          {/* Individual Duplicate Cards */}
                          {parsedResult.conflicts.map((c) => {
                            const action =
                              duplicateResolutions[c.conflictKey] ??
                              c.defaultResolution;
                            return (
                              <div
                                key={c.conflictKey}
                                className="p-3 rounded-xl bg-(--bg-card) border border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-1 text-xs">
                                  <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] font-bold">
                                    <span className="text-blue-600 dark:text-blue-400">
                                      [{c.group}]
                                    </span>
                                    <span className="text-amber-600 dark:text-amber-400 uppercase">
                                      {c.scope === 'database'
                                        ? '• Exists in Supabase DB'
                                        : `• Duplicate inside CSV (Line ${c.earlierCsvLine})`}
                                    </span>
                                    <span className="text-slate-400">
                                      • Matched on {c.matchedBy} (Line {c.line})
                                    </span>
                                  </div>
                                  <div className="font-bold text-(--color-text) truncate">
                                    {c.identifier}
                                  </div>
                                  <div className="grid grid-cols-1 gap-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    <div>
                                      <span className="font-mono uppercase text-[10px] text-slate-400">
                                        Existing:{' '}
                                      </span>
                                      <span>{c.existingSummary}</span>
                                    </div>
                                    <div>
                                      <span className="font-mono uppercase text-[10px] text-blue-500">
                                        Incoming CSV:{' '}
                                      </span>
                                      <span className="text-(--color-text)">
                                        {c.incomingSummary}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center p-1 rounded-xl bg-(--bg-page) border border-(--border-color) shrink-0 self-start sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleConflictResolutionChange(
                                        c.conflictKey,
                                        'ignore'
                                      )
                                    }
                                    disabled={isResealing || isMigrating}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                                      action === 'ignore'
                                        ? 'bg-slate-700 text-white shadow-xs'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                                    }`}
                                  >
                                    Ignore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleConflictResolutionChange(
                                        c.conflictKey,
                                        'overwrite'
                                      )
                                    }
                                    disabled={isResealing || isMigrating}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                                      action === 'overwrite'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-(--color-text)'
                                    }`}
                                  >
                                    Overwrite
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
                              <th className="py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-(--border-color)">
                            {parsedResult.products.map((p) => {
                              const conflict = parsedResult.conflicts.find(
                                (c) =>
                                  c.group === 'PRODUCTS' &&
                                  c.line === p.lineNumber
                              );
                              const action = conflict
                                ? (duplicateResolutions[
                                    conflict.conflictKey
                                  ] ?? conflict.defaultResolution)
                                : 'insert';
                              return (
                                <tr
                                  key={p.lineNumber}
                                  className={
                                    action === 'ignore' ? 'opacity-50' : ''
                                  }
                                >
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
                                  <td className="py-2 font-mono text-[11px] font-bold uppercase">
                                    {action === 'insert' ? (
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        Insert
                                      </span>
                                    ) : action === 'overwrite' ? (
                                      <span className="text-blue-600 dark:text-blue-400">
                                        Overwrite
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">
                                        Ignored
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
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
                              <th className="py-2 pr-3">Card</th>
                              <th className="py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-(--border-color)">
                            {parsedResult.members.map((m) => {
                              const conflict = parsedResult.conflicts.find(
                                (c) =>
                                  c.group === 'MEMBERS' &&
                                  c.line === m.lineNumber
                              );
                              const action = conflict
                                ? (duplicateResolutions[
                                    conflict.conflictKey
                                  ] ?? conflict.defaultResolution)
                                : 'insert';
                              return (
                                <tr
                                  key={m.lineNumber}
                                  className={
                                    action === 'ignore' ? 'opacity-50' : ''
                                  }
                                >
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
                                  <td className="py-2 pr-3 font-mono">
                                    {m.issue_card ? m.card_type : 'None'}
                                  </td>
                                  <td className="py-2 font-mono text-[11px] font-bold uppercase">
                                    {action === 'insert' ? (
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        Insert
                                      </span>
                                    ) : action === 'overwrite' ? (
                                      <span className="text-blue-600 dark:text-blue-400">
                                        Overwrite
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">
                                        Ignored
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Explicit Confirmation Checkbox when DB is non-empty */}
              {!isDbClean &&
                parsedResult.isValid &&
                totalActionableOps > 0 &&
                !executionSummary && (
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
                      <strong>
                        {dbSnapshot?.activeProductCount} product(s)
                      </strong>{' '}
                      and{' '}
                      <strong>
                        {dbSnapshot?.activeMemberCount} member(s)
                      </strong>
                      , and I confirm executing{' '}
                      <strong>
                        {resolvedPlan?.insertedCount ?? 0} insert(s)
                      </strong>
                      ,{' '}
                      <strong>
                        {resolvedPlan?.overwrittenCount ?? 0} overwrite(s)
                      </strong>
                      , and skipping{' '}
                      <strong>
                        {resolvedPlan?.ignoredCount ?? 0} ignored duplicate(s)
                      </strong>
                      .
                    </span>
                  </label>
                )}

              {/* Zero-action hint if all rows were ignored */}
              {parsedResult.isValid &&
                totalActionableOps === 0 &&
                !executionSummary && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 font-medium">
                    Every row in this file matched an existing record and is currently set to Ignore. Switch at least one duplicate to Overwrite or upload new records to run migration.
                  </div>
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
                disabled={isMigrating || Boolean(undoingLogId)}
                className="px-4 py-2.5 bg-(--bg-input) hover:bg-(--bg-page) text-(--color-text) rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border border-(--border-color) transition-colors disabled:opacity-40 text-center"
              >
                {executionSummary ? 'Done' : 'Close'}
              </button>
            ) : (
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Audited via public.migration_audit_logs • 24h Undo enabled
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
                    {resolvedPlan && parsedResult?.isValid
                      ? ` (${resolvedPlan.insertedCount} Insert, ${resolvedPlan.overwrittenCount} Overwrite, ${resolvedPlan.ignoredCount} Ignored)`
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
