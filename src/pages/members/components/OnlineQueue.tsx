// src/pages/members/components/OnlineQueue.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  CheckSquare,
  XSquare,
  Eye,
  RefreshCw,
  X,
  Printer,
  ExternalLink,
  ShieldCheck,
  FileSignature,
  User,
  HeartHandshake,
  UserCheck,
  CheckCircle,
  Archive,
  RotateCcw,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'react-toastify';

// Import Shared UI Components & Hooks
import { Table } from '../../../components/ui/Table';
import type { Column } from '../../../components/ui/Table';
import { UndoToast, type UndoItem } from '../../../components/ui/UndoToast';
import { useResponsiveItemsPerPage } from '../../../lib/useResponsiveItemsPerPage';

// Import Types & Services
import { registrationService, settingsService } from '../memberService';
import type { OnlineRegistration } from '../../../types/members';

interface OnlineQueueProps {
  onApproveLaunchWizard: (reg: OnlineRegistration) => void;
}

// Helper Function: Calculate Age from Birthday
const calculateAge = (birthdayStr: string): number => {
  if (!birthdayStr) return 0;
  const birthDate = new Date(birthdayStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age >= 0 ? age : 0;
};

export const OnlineQueue: React.FC<OnlineQueueProps> = ({
  onApproveLaunchWizard,
}) => {
  const [queue, setQueue] = useState<OnlineRegistration[]>([]);
  const [archivedQueue, setArchivedQueue] = useState<OnlineRegistration[]>([]);
  const [selectedReg, setSelectedReg] = useState<OnlineRegistration | null>(
    null
  );
  const [activePosterToken, setActivePosterToken] = useState<string>('');
  const [showModalSignatures, setShowModalSignatures] =
    useState<boolean>(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Consolidated Multi-Stacked Rejection State
  const [stagedRejections, setStagedRejections] = useState<
    OnlineRegistration[]
  >([]);
  const stagedRejectionsRef = useRef<OnlineRegistration[]>([]);
  stagedRejectionsRef.current = stagedRejections;

  const itemsPerPage = useResponsiveItemsPerPage();

  const fetchQueue = useCallback(async () => {
    setIsSyncing(true);
    try {
      const q = await registrationService.getQueue();
      setQueue(q);
    } catch (err: any) {
      console.error('Failed to fetch online queue:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const fetchArchived = useCallback(async () => {
    try {
      const arch = await registrationService.getArchived();
      setArchivedQueue(arch);
    } catch (err: any) {
      console.error('Failed to fetch archived queue:', err);
    }
  }, []);

  useEffect(() => {
    if (!selectedReg) {
      setShowModalSignatures(false);
    }
  }, [selectedReg]);

  useEffect(() => {
    fetchQueue();
    const token =
      localStorage.getItem('palomar_active_poster_token') || 'None Generated';
    setActivePosterToken(token);
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Filter pending tickets excluding those currently staged in the Undo countdown
  const pendingRejectIds = useMemo(() => {
    return stagedRejections.map((r) => r.id);
  }, [stagedRejections]);

  const pendingQueue = useMemo(() => {
    return queue.filter(
      (q: OnlineRegistration) =>
        q.status === 'Pending' && !pendingRejectIds.includes(q.id)
    );
  }, [queue, pendingRejectIds]);

  // Handle Archive Action (Exempts ticket from daily midnight purge)
  const handleArchiveRegistration = async (reg: OnlineRegistration) => {
    try {
      await registrationService.archive(
        reg.id,
        'Archived by staff to prevent daily purge',
        'Admin Staff'
      );
      toast.success(
        `Archived ${reg.full_name} (${reg.id}). Exempt from daily purges.`
      );
      if (selectedReg?.id === reg.id) {
        setSelectedReg(null);
      }
      await fetchQueue();
    } catch (err: any) {
      toast.error(err.message || 'Failed to archive ticket.');
    }
  };

  // Handle Restore Action from Archived Tickets Modal
  const handleRestoreRegistration = async (reg: OnlineRegistration) => {
    try {
      await registrationService.restore(reg.id, 'Admin Staff');
      toast.success(`Restored ${reg.full_name} (${reg.id}) to active queue.`);
      await Promise.all([fetchQueue(), fetchArchived()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore ticket.');
    }
  };

  // ─── STACKABLE MULTI-UNDO REJECTION CONTROLLERS ───
  const handleInitiateReject = (reg: OnlineRegistration) => {
    setStagedRejections((prev) => [...prev, reg]);
    if (selectedReg?.id === reg.id) {
      setSelectedReg(null);
    }
  };

  const handleConfirmReject = useCallback(
    async (id: string) => {
      const targetReg = stagedRejectionsRef.current.find((r) => r.id === id);
      if (!targetReg) return;

      try {
        await registrationService.reject(
          targetReg.id,
          'Staff Rejected via Queue',
          'Admin Staff'
        );
        toast.info(`Registration ticket for ${targetReg.full_name} rejected.`);
        await fetchQueue();
        if (selectedReg?.id === targetReg.id) {
          setSelectedReg(null);
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to reject registration.');
      } finally {
        setStagedRejections((prev) => prev.filter((r) => r.id !== id));
      }
    },
    [fetchQueue, selectedReg?.id]
  );

  const handleUndoReject = (id: string) => {
    const targetReg = stagedRejectionsRef.current.find((r) => r.id === id);
    if (!targetReg) return;

    setStagedRejections((prev) => prev.filter((r) => r.id !== id));
    toast.success(`Restored ticket for ${targetReg.full_name} to queue.`);
  };

  const handleConfirmAll = () => {
    if (stagedRejectionsRef.current.length === 0) return;
    const itemsToCommit = [...stagedRejectionsRef.current];
    itemsToCommit.forEach((reg) => handleConfirmReject(reg.id));
  };

  const handleUndoAll = () => {
    if (stagedRejectionsRef.current.length === 0) return;
    const count = stagedRejectionsRef.current.length;
    setStagedRejections([]);
    toast.success(`Restored all ${count} pre-registration tickets to queue.`);
  };

  // Commit any pending rejections on unmount
  useEffect(() => {
    return () => {
      if (stagedRejectionsRef.current.length > 0) {
        stagedRejectionsRef.current.forEach((reg) => {
          registrationService
            .reject(reg.id, 'Staff Rejected via Queue', 'Admin Staff')
            .catch(console.error);
        });
      }
    };
  }, []);

  const ORIGINAL_REGISTRATION_URL = 'https://wolfpalomar.vercel.app/register';

  const [copiedLink, setCopiedLink] = useState(false);

  const handleOpenRegistrationPortal = () => {
    window.open(ORIGINAL_REGISTRATION_URL, '_blank');
  };

  const handleCopyRegistrationLink = async () => {
    try {
      await navigator.clipboard.writeText(ORIGINAL_REGISTRATION_URL);
      setCopiedLink(true);
      toast.success(`Copied: ${ORIGINAL_REGISTRATION_URL}`);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handlePrintPoster = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const settings = await settingsService.load();
    const tokenTimestamp = Date.now();
    const newToken = `POSTER-${tokenTimestamp}-${new Date().getFullYear()}`;
    localStorage.setItem('palomar_active_poster_token', newToken);
    setActivePosterToken(newToken);

    const portalUrl = `https://wolfpalomar.vercel.app/register-online?token=${newToken}`;
    const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(portalUrl)}`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Lobby Pre-Registration Poster - Wolf Palomar Gym</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; background-color: #ffffff !important; }
              @page { size: portrait; margin: 0; }
            }
            body {
              margin: 0;
              padding: 40px;
              background-color: #ffffff;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: calc(100vh - 80px);
              color: #0b1a30;
              text-align: center;
            }
            .border-wrap {
              border: 12px double #123c73;
              border-radius: 24px;
              padding: 45px 30px;
              max-width: 600px;
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            }
            .logo-header {
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 5px;
              color: #bf0202;
              margin-bottom: 5px;
              text-transform: uppercase;
            }
            .headline {
              font-size: 30px;
              font-weight: 900;
              color: #123c73;
              margin: 0 0 10px 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .sub-headline {
              font-size: 12px;
              color: #64748b;
              margin: 0 0 25px 0;
              font-weight: 500;
              line-height: 1.5;
            }
            .qr-frame {
              border: 2px solid #e2e8f0;
              border-radius: 20px;
              padding: 15px;
              background: #f8fafc;
              margin-bottom: 25px;
              box-shadow: inset 0 2px 8px rgba(0,0,0,0.02);
            }
            .qr-frame img {
              width: 220px;
              height: 220px;
              display: block;
            }
            .pricing-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              width: 100%;
              max-width: 500px;
              margin-bottom: 30px;
            }
            .plan-card {
              border: 1.5px solid rgba(18, 60, 115, 0.15);
              border-radius: 16px;
              padding: 15px;
              background-color: #fafbfc;
              text-align: center;
            }
            .plan-title {
              font-size: 10px;
              font-weight: 900;
              letter-spacing: 1px;
              color: #123c73;
              margin-bottom: 5px;
              text-transform: uppercase;
            }
            .plan-price {
              font-size: 24px;
              font-weight: 900;
              color: #bf0202;
              font-family: monospace;
            }
            .plan-benefits {
              font-size: 10px;
              color: #475569;
              margin-top: 5px;
              line-height: 1.4;
              font-weight: 500;
            }
            .instructions {
              text-align: left;
              max-width: 420px;
              width: 100%;
              margin: 0 auto;
              font-size: 11px;
              font-weight: 600;
              color: #334155;
            }
            .step {
              display: flex;
              align-items: center;
              gap: 12px;
              margin-bottom: 8px;
            }
            .step-number {
              width: 20px;
              height: 20px;
              background-color: #123c73;
              color: #ffffff;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              flex-shrink: 0;
            }
            .footer-tag {
              font-size: 9px;
              color: #94a3b8;
              margin-top: 30px;
              text-transform: uppercase;
              letter-spacing: 2px;
              font-weight: 700;
            }
            .token-indicator {
              font-size: 8px;
              font-family: monospace;
              color: #cbd5e1;
              margin-top: 5px;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="border-wrap">
            <div class="logo-header">WOLF PALOMAR FITNESS</div>
            <h1 class="headline">JOIN THE MEMBERSHIP!</h1>
            <p class="sub-headline">Pre-register using your own smartphone and proceed directly to payment checkout upon arrival.</p>
            
            <div class="qr-frame">
              <img src="${qrImageSrc}" alt="Registration QR Code" />
            </div>

            <div class="pricing-grid">
              <div class="plan-card">
                <div class="plan-title">Monthly Plan</div>
                <div class="plan-price">₱${settings.monthly_plan_price.toLocaleString()}</div>
                <div class="plan-benefits">Unlimited gym entry<br>Valid for 30 consecutive days<br>₱0 Check-In fee</div>
              </div>
              <div class="plan-card">
                <div class="plan-title">Yearly Plan</div>
                <div class="plan-price">₱${settings.yearly_plan_price.toLocaleString()}</div>
                <div class="plan-benefits">Access key valid for 365 days<br>Reduced entry fee: ₱${settings.yearly_member_checkin_fee.toLocaleString()} per visit<br>Ideal for casual lifters</div>
              </div>
            </div>

            <div class="instructions">
              <div class="step">
                <div class="step-number">1</div>
                <div>Scan this QR code using your smartphone camera.</div>
              </div>
              <div class="step">
                <div class="step-number">2</div>
                <div>Fill out and submit your membership details.</div>
              </div>
              <div class="step">
                <div class="step-number">3</div>
                <div>Approach the desk to confirm payment and activate your subscription.</div>
              </div>
            </div>

            <div class="footer-tag">WOLF PALOMAR FITNESS • EST. 2026</div>
            <div class="token-indicator">Security Sign Verification Token: ${newToken}</div>
            <div style="margin-top: 14px; font-size: 11px; font-family: monospace; color: #123c73; font-weight: bold; letter-spacing: 0.5px;">
              Portal Link: ${ORIGINAL_REGISTRATION_URL}
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const undoToastItems: UndoItem[] = useMemo(() => {
    return stagedRejections.map((reg) => ({
      id: reg.id,
      title: `${reg.full_name} (${reg.preferred_plan})`,
      type: 'general',
      customerName: reg.full_name,
      categoryOrPlan: reg.preferred_plan,
      extraInfo: `Ticket: ${reg.id} • ${reg.phone} • Age ${calculateAge(reg.birthday)}`,
      timestamp: reg.submitted_at,
    }));
  }, [stagedRejections]);

  // Table Columns Definition
  const columns: Column<OnlineRegistration>[] = [
    {
      key: 'full_name',
      header: 'Applicant / Ticket ID',
      sortable: true,
      render: (item) => {
        const age = calculateAge(item.birthday);
        const isMinor = age >= 12 && age < 18;
        const isRestricted = age < 12;

        return (
          <div className="flex items-center gap-3 py-1 text-left">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-heading text-xs font-bold border border-slate-200 dark:border-white/5">
              {item.full_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs block text-slate-900 dark:text-white">
                  {item.full_name}
                </span>
                {isRestricted ? (
                  <span className="text-[8px] font-mono bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 px-1.5 py-0.2 rounded font-bold">
                    RESTRICTED (&lt;12 YRS)
                  </span>
                ) : isMinor ? (
                  <span className="text-[8px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded font-bold">
                    MINOR ({age} YRS)
                  </span>
                ) : (
                  <span className="text-[8px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-bold">
                    ADULT ({age} YRS)
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block mt-0.5 leading-none">
                {item.id} • {item.gender}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'phone',
      header: 'Contact Details',
      render: (item) => (
        <div className="text-left leading-tight">
          <span className="font-mono text-xs font-bold block text-slate-800 dark:text-slate-200">
            {item.phone}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-44 mt-0.5">
            {item.email || 'No Email'}
          </span>
        </div>
      ),
    },
    {
      key: 'preferred_plan',
      header: 'Preferred Plan',
      sortable: true,
      render: (item) => (
        <span className="font-sans font-bold text-xs text-emerald-600 dark:text-emerald-400 block">
          {item.preferred_plan}
        </span>
      ),
    },
    {
      key: 'parent_consent',
      header: 'Legal Verification',
      render: (item) => {
        if (item.parent_consent_required) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-3 h-3 text-amber-500 dark:text-amber-400" />{' '}
              Parent E-Consent
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5">
            Self-Certified
          </span>
        );
      },
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
          {new Date(item.submitted_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[200px]',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5 select-none">
          <button
            onClick={() => setSelectedReg(item)}
            className="p-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer transition-colors border border-slate-200 dark:border-white/5"
            title="Preview full ticket metadata"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleArchiveRegistration(item)}
            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/20 cursor-pointer transition-colors"
            title="Archive ticket (Exempts from daily 12:00 AM purge)"
          >
            <Archive className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleInitiateReject(item)}
            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-500 rounded-lg border border-red-500/20 cursor-pointer transition-colors"
            title="Reject submission"
          >
            <XSquare className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              onApproveLaunchWizard(item);
            }}
            className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg font-heading text-[9px] tracking-wider uppercase flex items-center gap-1 border-none cursor-pointer transition-all shadow-xs"
          >
            <CheckSquare className="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      ),
    },
  ];

  // Archived Tickets Columns Definition
  const archivedColumns: Column<OnlineRegistration>[] = [
    {
      key: 'full_name',
      header: 'Archived Applicant / ID',
      render: (item) => (
        <div className="text-left font-bold text-xs text-slate-900 dark:text-white">
          <span>{item.full_name}</span>
          <span className="text-[10px] text-slate-400 font-mono block font-normal">
            {item.id} • {item.phone}
          </span>
        </div>
      ),
    },
    {
      key: 'preferred_plan',
      header: 'Plan',
      render: (item) => (
        <span className="font-bold text-xs text-emerald-600">
          {item.preferred_plan}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: () => (
        <span className="text-[9px] font-mono font-bold bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded border border-amber-500/20">
          ARCHIVED (Exempt from Purge)
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right',
      render: (item) => (
        <button
          onClick={() => handleRestoreRegistration(item)}
          className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-lg font-heading text-[9px] font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1 justify-end ml-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restore to Queue
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4 pb-28 sm:pb-0">
      {/* Queue Header & Actions (Desktop / Tablet Header) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none">
        <div>
          <h3 className="font-heading text-xs tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase font-bold">
            Online Pre-Registrations Queue
          </h3>
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 block">
            Active Lobby Poster Signature:{' '}
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {activePosterToken}
            </span>
          </span>
        </div>

        {/* Desktop Buttons */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => {
              fetchArchived();
              setIsArchiveModalOpen(true);
            }}
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            title="View Archived Pre-Registration Tickets (Exempt from Daily Midnight Purges)"
          >
            <Archive className="w-3.5 h-3.5 text-amber-500" /> Archived Tickets
          </button>

          <button
            onClick={handleOpenRegistrationPortal}
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            title="Open Anonymous Self-Service Pre-Registration Page in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-500" /> Open Form
          </button>

          <button
            onClick={handleCopyRegistrationLink}
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            title="Copy Public Pre-Registration URL"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-500" />
            )}
            {copiedLink ? 'Copied' : 'Copy Link'}
          </button>

          <button
            onClick={handlePrintPoster}
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            title="Print Physical QR registration Poster with Dynamic Token Expiration"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500" /> Print Poster
          </button>

          <button
            onClick={fetchQueue}
            disabled={isSyncing}
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />{' '}
            Sync
          </button>
        </div>
      </div>

      {/* Main Table View */}
      {pendingQueue.length === 0 ? (
        <div className="p-12 text-center bg-(--bg-card) border border-(--border-color) rounded-3xl space-y-3 shadow-xs">
          <Clock className="w-8 h-8 text-slate-400 mx-auto animate-pulse" />
          <h4 className="font-heading text-xs uppercase tracking-wider text-slate-500">
            Queue is Clear
          </h4>
          <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
            No pending self-service tickets require validation at this time.
          </p>
        </div>
      ) : (
        <div className="p-1 bg-(--bg-card) border border-(--border-color) rounded-3xl overflow-hidden shadow-xs">
          <Table<OnlineRegistration>
            data={pendingQueue}
            columns={columns}
            searchKeys={[
              'full_name',
              'id',
              'phone',
              'email',
              'parent_name',
              'emergency_contact_name',
            ]}
            searchPlaceholder="Search pre-registrations by name, ID, phone, email..."
            itemsPerPage={itemsPerPage}
            loading={false}
          />
        </div>
      )}

      {/* MOBILE FLOATING ACTION DOCK */}
      {createPortal(
        <div className="sm:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3 z-[190] shadow-2xl">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
            <Clock className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-[11px] truncate">
              {pendingQueue.length} Pending
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                fetchArchived();
                setIsArchiveModalOpen(true);
              }}
              className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="Archived Tickets"
            >
              <Archive className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleOpenRegistrationPortal}
              className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="Open Online Form"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleCopyRegistrationLink}
              className="w-9 h-9 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 hover:bg-slate-500/20 border border-slate-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="Copy Registration Link"
            >
              {copiedLink ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={handlePrintPoster}
              className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="Print Poster"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={fetchQueue}
              disabled={isSyncing}
              className="w-9 h-9 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center cursor-pointer transition-transform active:scale-95 shadow-md disabled:opacity-50"
              title="Sync Queue"
            >
              <RefreshCw
                className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Consolidated Multi-Stacked Undo Toast Notification */}
      <UndoToast
        items={undoToastItems}
        duration={5}
        onUndoItem={handleUndoReject}
        onConfirmItem={handleConfirmReject}
        onUndoAll={handleUndoAll}
        onConfirmAll={handleConfirmAll}
      />

      {/* ARCHIVED TICKETS RECYCLE BIN MODAL */}
      {isArchiveModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-130 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-body text-xs text-(--color-text)">
            <div className="relative bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-2xl sm:max-w-3xl shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto text-left">
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-(--border-color) pb-3 select-none">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm font-bold tracking-wider uppercase text-(--color-text)">
                      Archived Pre-Registration Tickets
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      Permanent Ticket Storage • Exempt from Daily Purges
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsArchiveModalOpen(false)}
                  className="p-2 rounded-xl bg-(--bg-page) border border-(--border-color) text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Caution Banner */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-2.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  Archived tickets are permanently exempt from the daily 12:00
                  AM Manila Time automated purges.
                </span>
              </div>

              {/* Tickets Table / Empty State */}
              {archivedQueue.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-(--border-color) rounded-2xl space-y-2">
                  <Archive className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
                  <p className="font-semibold text-(--color-text)">
                    No archived pre-registration tickets found.
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Tickets manually archived by staff will appear here.
                  </p>
                </div>
              ) : (
                <div className="p-1 bg-(--bg-card) border border-(--border-color) rounded-2xl overflow-hidden shadow-xs">
                  <Table<OnlineRegistration>
                    data={archivedQueue}
                    columns={archivedColumns}
                    itemsPerPage={5}
                    loading={false}
                    searchKeys={['full_name', 'id', 'phone', 'email']}
                    searchPlaceholder="Search archived tickets by name, ID, phone..."
                  />
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* DETAILED PREVIEW MODAL */}
      {selectedReg &&
        createPortal(
          <div className="fixed inset-0 z-130 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/75 backdrop-blur-md">
            <div className="bg-(--bg-card) border border-(--border-color) p-6 rounded-3xl w-full max-w-xl shadow-2xl space-y-4 text-left max-h-[85vh] overflow-y-auto font-body">
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-(--border-color) pb-3 select-none">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-mono text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full font-bold">
                    {selectedReg.id}
                  </span>
                  <h4 className="font-heading text-sm tracking-wider uppercase font-bold text-slate-900 dark:text-white">
                    Submission Registry Ticket
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedReg(null)}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Applicant Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-1">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-heading text-[10px] tracking-widest uppercase font-bold text-slate-500">
                    Applicant Personal Information
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-semibold">
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Full Name
                    </span>
                    <span className="text-slate-900 dark:text-white font-bold">
                      {selectedReg.full_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Phone Number
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {selectedReg.phone}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Gender / Age
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {selectedReg.gender} •{' '}
                      {calculateAge(selectedReg.birthday)} Yrs Old
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Birthday
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {selectedReg.birthday}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Email Address
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 truncate block">
                      {selectedReg.email || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Preferred Plan
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-500 font-bold">
                      {selectedReg.preferred_plan}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Home Address
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {selectedReg.address}
                    </span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="space-y-2 pt-2 border-t border-(--border-color)">
                <div className="flex items-center gap-2 pb-1">
                  <HeartHandshake className="w-3.5 h-3.5 text-rose-500" />
                  <span className="font-heading text-[10px] tracking-widest uppercase font-bold text-slate-500">
                    Emergency Contact
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Contact Name
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {selectedReg.emergency_contact_name} (
                      {selectedReg.relationship || 'Contact'})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">
                      Emergency Phone
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {selectedReg.emergency_contact_phone}
                    </span>
                  </div>
                </div>
              </div>

              {(selectedReg.parent_consent_required ||
                selectedReg.applicant_signature ||
                selectedReg.parent_signature) && (
                <div className="pt-2 border-t border-(--border-color)">
                  <div className="w-full p-4 rounded-2xl bg-slate-100/60 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-white/10 space-y-3.5 shadow-xs select-none">
                    <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200/60 dark:border-white/10">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white leading-tight truncate">
                            Parent / Legal Guardian Verification
                          </h5>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal leading-none mt-0.5">
                            E-Consent digitally verified and linked
                          </p>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        Verified
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-white/5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Parent / Guardian
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate mt-0.5">
                          {selectedReg.parent_name || 'N/A'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-white/5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Relationship
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate mt-0.5">
                          {selectedReg.parent_relationship || 'N/A'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-white/5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Contact Phone
                        </span>
                        <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 block truncate mt-0.5">
                          {selectedReg.parent_phone || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>
                          Verified on{' '}
                          {selectedReg.consent_date
                            ? new Date(
                                selectedReg.consent_date
                              ).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : new Date().toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                        </span>
                      </span>
                      {selectedReg.parent_email && (
                        <span className="truncate max-w-45 text-[9px] text-slate-400">
                          {selectedReg.parent_email}
                        </span>
                      )}
                    </div>

                    {/* Render Digital Signatures ONLY if at least one signature exists */}
                    {Boolean(
                      selectedReg.applicant_signature ||
                      selectedReg.parent_signature
                    ) && (
                      <div className="pt-3 border-t border-(--border-color) space-y-2 select-none">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <FileSignature className="w-3.5 h-3.5 text-blue-500" />
                            <span>Digital Signatures</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setShowModalSignatures(!showModalSignatures)
                            }
                            className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors border border-slate-200 dark:border-white/5"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-500" />
                            <span>
                              {showModalSignatures
                                ? 'Hide Signatures'
                                : 'Show Signatures'}
                            </span>
                          </button>
                        </div>

                        {showModalSignatures && (
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div>
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                                <FileSignature className="w-3 h-3 text-blue-500" />{' '}
                                Applicant Signature
                              </span>
                              {selectedReg.applicant_signature ? (
                                <div className="p-1.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-300 dark:border-zinc-700 h-16 flex items-center justify-center">
                                  <img
                                    src={selectedReg.applicant_signature}
                                    alt="Applicant Signature"
                                    className="max-h-full max-w-full object-contain"
                                  />
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">
                                  No signature on file
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                                <FileSignature className="w-3 h-3 text-emerald-500" />{' '}
                                Parent / Guardian Signature
                              </span>
                              {selectedReg.parent_signature ? (
                                <div className="p-1.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-300 dark:border-zinc-700 h-16 flex items-center justify-center">
                                  <img
                                    src={selectedReg.parent_signature}
                                    alt="Parent Signature"
                                    className="max-h-full max-w-full object-contain"
                                  />
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">
                                  No signature on file
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Submission Footer Metadata */}
              <div className="pt-2 border-t border-(--border-color) text-[10px] text-slate-500 dark:text-slate-400 flex justify-between items-center font-mono">
                <span>
                  Submitted:{' '}
                  {new Date(selectedReg.submitted_at).toLocaleString('en-US')}
                </span>
                <span className="italic">
                  {selectedReg.notes || 'No extra notes'}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default OnlineQueue;
