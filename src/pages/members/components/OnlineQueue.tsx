import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Clock, CheckSquare, XSquare, Eye, RefreshCw, X, Printer, ExternalLink, 
  ShieldCheck, FileSignature, User, HeartHandshake 
} from 'lucide-react';
import { toast } from 'react-toastify';

// Import Shared UI Components & Hooks
import { Table } from '../../../components/ui/Table';
import type { Column } from '../../../components/ui/Table';
import { UndoToast } from '../../../components/ui/UndoToast';
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
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
};

export const OnlineQueue: React.FC<OnlineQueueProps> = ({ onApproveLaunchWizard }) => {
  const [queue, setQueue] = useState<OnlineRegistration[]>([]);
  const [selectedReg, setSelectedReg] = useState<OnlineRegistration | null>(null);
  const [activePosterToken, setActivePosterToken] = useState<string>('');

  // Pending soft-hidden IDs during UndoToast countdown
  const [pendingRejectIds, setPendingRejectIds] = useState<string[]>([]);

  // UndoToast Rejection State
  const [undoState, setUndoState] = useState<{
    isOpen: boolean;
    targetReg: OnlineRegistration | null;
    message: string;
  }>({
    isOpen: false,
    targetReg: null,
    message: '',
  });

  const itemsPerPage = useResponsiveItemsPerPage();

  const fetchQueue = () => {
    setQueue(registrationService.getQueue());
  };

  useEffect(() => {
    fetchQueue();
    const token = localStorage.getItem('palomar_active_poster_token') || 'None Generated';
    setActivePosterToken(token);
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter pending tickets excluding those currently in the Undo countdown
  const pendingQueue = useMemo(() => {
    return queue.filter(
      (q: OnlineRegistration) => 
        q.status === 'Pending' && !pendingRejectIds.includes(q.id)
    );
  }, [queue, pendingRejectIds]);

  // Initiate Rejection with Optimistic UI Hide + Undo Toast
  const handleInitiateReject = (reg: OnlineRegistration) => {
    // 1. Instantly soft-hide row from table UI
    setPendingRejectIds((prev) => [...prev, reg.id]);

    // 2. Open UndoToast countdown
    setUndoState({
      isOpen: true,
      targetReg: reg,
      message: `Rejected pre-registration ticket for ${reg.full_name} (${reg.id}).`,
    });
  };

  // Confirm Final Rejection when timer ends
  const handleConfirmReject = () => {
    if (!undoState.targetReg) return;
    const targetId = undoState.targetReg.id;

    try {
      registrationService.reject(targetId, 'Staff Rejected via Queue', 'Admin Staff');
      toast.info(`Registration ${targetId} rejected.`);
      fetchQueue();
      if (selectedReg?.id === targetId) {
        setSelectedReg(null);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject registration.');
    } finally {
      setPendingRejectIds((prev) => prev.filter((id) => id !== targetId));
      setUndoState({ isOpen: false, targetReg: null, message: '' });
    }
  };

  // Cancel Rejection (Restore item to table UI)
  const handleUndoReject = () => {
    if (undoState.targetReg) {
      const targetId = undoState.targetReg.id;
      setPendingRejectIds((prev) => prev.filter((id) => id !== targetId));
    }
    toast.success('Ticket rejection cancelled.');
    setUndoState({ isOpen: false, targetReg: null, message: '' });
  };

  const handleOpenRegistrationPortal = () => {
    window.open('/register', '_blank');
  };

  const handlePrintPoster = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const settings = settingsService.load();
    const tokenTimestamp = Date.now();
    const newToken = `POSTER-${tokenTimestamp}-${new Date().getFullYear()}`;
    localStorage.setItem('palomar_active_poster_token', newToken);
    setActivePosterToken(newToken);

    const portalUrl = `${window.location.origin}/register-online?token=${newToken}`;
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
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
            <div className="w-8 h-8 rounded-lg bg-zinc-800 text-slate-350 flex items-center justify-center font-heading text-xs font-bold shadow-inner">
              {item.full_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs block text-slate-900 dark:text-white">{item.full_name}</span>
                {isRestricted ? (
                  <span className="text-[8px] font-mono bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.2 rounded font-bold">
                    RESTRICTED (&lt;12 YRS)
                  </span>
                ) : isMinor ? (
                  <span className="text-[8px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded font-bold">
                    MINOR ({age} YRS)
                  </span>
                ) : (
                  <span className="text-[8px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-bold">
                    ADULT ({age} YRS)
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 font-mono block mt-0.5 leading-none">
                {item.id} • {item.gender}
              </span>
            </div>
          </div>
        );
      }
    },
    {
      key: 'phone',
      header: 'Contact Details',
      render: (item) => (
        <div className="text-left leading-tight">
          <span className="font-mono text-xs font-bold block text-slate-800 dark:text-slate-200">{item.phone}</span>
          <span className="text-[10px] text-slate-400 block truncate max-w-44 mt-0.5">{item.email || 'No Email'}</span>
        </div>
      )
    },
    {
      key: 'preferred_plan',
      header: 'Preferred Plan',
      sortable: true,
      render: (item) => (
        <span className="font-sans font-bold text-xs text-emerald-500 block">
          {item.preferred_plan}
        </span>
      )
    },
    {
      key: 'parent_consent',
      header: 'Legal Verification',
      render: (item) => {
        if (item.parent_consent_required) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-3 h-3 text-amber-400" /> Parent E-Consent
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-slate-400 border border-white/5">
            Self-Certified
          </span>
        );
      }
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-[10px] text-slate-400">
          {new Date(item.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[160px]',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5 select-none">
          <button 
            onClick={() => setSelectedReg(item)} 
            className="p-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-white rounded-lg cursor-pointer transition-colors border border-(--border-color)" 
            title="Preview full ticket metadata"
          >
            <Eye className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => handleInitiateReject(item)} 
            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg border border-red-500/20 cursor-pointer transition-colors" 
            title="Reject submission"
          >
            <XSquare className="w-4 h-4" />
          </button>

          <button 
            onClick={() => onApproveLaunchWizard(item)} 
            className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg font-heading text-[9px] tracking-wider uppercase flex items-center gap-1 border-none cursor-pointer transition-all shadow-xs"
          >
            <CheckSquare className="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      
      {/* Queue Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none">
        <div>
          <h3 className="font-heading text-xs tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase font-bold">Online Pre-Registrations Queue</h3>
          <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">Active Lobby Poster Signature: <span className="font-bold text-slate-300">{activePosterToken}</span></span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleOpenRegistrationPortal} 
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            title="Open Anonymous Self-Service Pre-Registration Page in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-500" /> Test Registration Form
          </button>

          <button 
            onClick={handlePrintPoster} 
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            title="Print Physical QR registration Poster with Dynamic Token Expiration"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500" /> Print QR Poster
          </button>
          
          <button 
            onClick={fetchQueue} 
            className="p-2 border border-(--border-color) bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Sync Queue
          </button>
        </div>
      </div>

      {/* Main Table View */}
      {pendingQueue.length === 0 ? (
        <div className="p-12 text-center bg-(--bg-card) border border-(--border-color) rounded-3xl space-y-3 shadow-xs">
          <Clock className="w-8 h-8 text-slate-400 mx-auto animate-pulse" />
          <h4 className="font-heading text-xs uppercase tracking-wider text-slate-500">Queue is Clear</h4>
          <p className="text-[10px] text-slate-400 max-w-xs mx-auto">No pending self-service tickets require validation at this time.</p>
        </div>
      ) : (
        <div className="p-1 bg-(--bg-card) border border-(--border-color) rounded-3xl overflow-hidden shadow-xs">
          <Table<OnlineRegistration>
            data={pendingQueue}
            columns={columns}
            searchKeys={['full_name', 'id', 'phone', 'email', 'parent_name', 'emergency_contact_name']}
            searchPlaceholder="Search pre-registrations by name, ID, phone, email..."
            itemsPerPage={itemsPerPage}
            loading={false}
          />
        </div>
      )}

      {/* Undo Toast Notification for Rejection */}
      <div className="fixed bottom-6 right-6 z-150 pointer-events-none">
        <UndoToast
          isOpen={undoState.isOpen}
          message={undoState.message}
          duration={5}
          onConfirm={handleConfirmReject}
          onUndo={handleUndoReject}
          onClose={handleUndoReject}
        />
      </div>

      {/* DETAILED PREVIEW MODAL */}
      {selectedReg && createPortal(
        <div className="fixed inset-0 z-130 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-(--bg-card) border border-(--border-color) p-6 rounded-3xl w-full max-w-xl shadow-2xl space-y-4 text-left max-h-[85vh] overflow-y-auto font-body">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-(--border-color) pb-3 select-none">
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full font-bold">
                  {selectedReg.id}
                </span>
                <h4 className="font-heading text-sm tracking-wider uppercase font-bold text-slate-900 dark:text-white">
                  Submission Registry Ticket
                </h4>
              </div>
              <button onClick={() => setSelectedReg(null)} className="p-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-400 hover:text-white cursor-pointer">
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
                  <span className="text-slate-400 uppercase text-[9px] block">Full Name</span>
                  <span className="text-slate-900 dark:text-white font-bold">{selectedReg.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block">Phone Number</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selectedReg.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block">Gender / Age</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {selectedReg.gender} • {calculateAge(selectedReg.birthday)} Yrs Old
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block">Birthday</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selectedReg.birthday}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block">Email Address</span>
                  <span className="text-slate-800 dark:text-slate-200 truncate block">{selectedReg.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block">Preferred Plan</span>
                  <span className="text-emerald-500 font-bold">{selectedReg.preferred_plan}</span>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-slate-400 uppercase text-[9px] block">Home Address</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedReg.address}</span>
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
                  <span className="text-slate-400 uppercase text-[9px] block">Contact Name</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedReg.emergency_contact_name} ({selectedReg.relationship || 'Contact'})</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block">Emergency Phone</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selectedReg.emergency_contact_phone}</span>
                </div>
              </div>
            </div>

            {/* Minor & Parent Consent Section */}
            {selectedReg.parent_consent_required && (
              <div className="space-y-3 pt-2 border-t border-(--border-color)">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-heading text-[10px] tracking-widest uppercase font-bold text-amber-500">
                      Parent / Legal Guardian Legal Verification
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded font-bold border border-emerald-500/20">
                    ✓ E-Consent Verified
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-zinc-900/60 dark:bg-zinc-900/90 rounded-2xl border border-(--border-color) text-xs font-semibold">
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">Parent Name</span>
                    <span className="text-amber-400 font-bold">{selectedReg.parent_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">Relationship</span>
                    <span className="text-slate-200">{selectedReg.parent_relationship || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[9px] block">Parent Phone</span>
                    <span className="font-mono text-amber-400">{selectedReg.parent_phone || 'N/A'}</span>
                  </div>
                  {selectedReg.parent_email && (
                    <div className="col-span-2">
                      <span className="text-slate-400 uppercase text-[9px] block">Parent Email</span>
                      <span className="text-slate-200 truncate block">{selectedReg.parent_email}</span>
                    </div>
                  )}
                  {selectedReg.consent_date && (
                    <div>
                      <span className="text-slate-400 uppercase text-[9px] block">Consent Timestamp</span>
                      <span className="text-slate-300 font-mono text-[10px]">
                        {new Date(selectedReg.consent_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* E-Signatures Display */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                      <FileSignature className="w-3 h-3 text-blue-400" /> Applicant Signature
                    </span>
                    {selectedReg.applicant_signature ? (
                      <div className="p-1 bg-white rounded-xl border border-slate-300 h-16 flex items-center justify-center">
                        <img src={selectedReg.applicant_signature} alt="Applicant Signature" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="p-2 bg-zinc-900/50 rounded-xl border border-zinc-800 text-[10px] text-slate-500 italic text-center">
                        No signature attached
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1 flex items-center gap-1">
                      <FileSignature className="w-3 h-3 text-amber-400" /> Parent/Guardian Signature
                    </span>
                    {selectedReg.parent_signature ? (
                      <div className="p-1 bg-white rounded-xl border border-slate-300 h-16 flex items-center justify-center">
                        <img src={selectedReg.parent_signature} alt="Parent Signature" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="p-2 bg-zinc-900/50 rounded-xl border border-zinc-800 text-[10px] text-slate-500 italic text-center">
                        No signature attached
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* Submission Footer Metadata */}
            <div className="pt-2 border-t border-(--border-color) text-[10px] text-slate-400 flex justify-between items-center font-mono">
              <span>Submitted: {new Date(selectedReg.submitted_at).toLocaleString('en-US')}</span>
              <span className="italic">{selectedReg.notes || 'No extra notes'}</span>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
};