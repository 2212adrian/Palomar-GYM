// src/pages/members/components/SubscriptionPlan.tsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Award, Smartphone, CheckCircle, X, Eye, Check, Lock, 
  FileSignature, ChevronLeft, Eraser, UserCheck, ShieldAlert, Search,
  Download, Printer, ChevronDown, ChevronUp, Info, Loader2, SwitchCamera,
  RefreshCw, WifiOff, Users, UserPlus, Trash2, Ban
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  memberService, 
  subscriptionService, 
  cardService, 
  registrationService, 
  settingsService, 
  DEFAULT_SETTINGS
} from '../memberService';
import { OfficialReceipt, type OfficialReceiptRef } from '../../../components/ui/OfficialReceipt';
import { AgreementDocumentViewer, type AgreementDocument } from '../../../components/ui/AgreementDocumentViewer';
import type { OnlineRegistration, PaymentMethod, Member, Subscription, MembershipSettings } from '../../../types/members';
import type { HybridScanResult, HybridMemberResult, HybridProductResult } from '../../scanner/scannerService';
export type { HybridScanResult, HybridMemberResult, HybridProductResult };

const INTAKE_DRAFT_STORAGE_KEY = 'palomar_frontdesk_intake_draft_v2';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 Hours Auto-Expiry

interface IntakeDraft {
  enrollmentType: 'existing' | 'new';
  selectedMemberId?: string;
  lastName: string;
  firstName: string;
  middleInitials: string;
  suffix: string;
  email: string;
  phone: string;
  gender: string;
  birthday: string;
  address: string;
  emergencyName: string;
  relationship: string;
  emergencyPhone: string;
  parentName: string;
  parentRelationship: string;
  parentPhone: string;
  parentEmail: string;
  sameAsParent: boolean;
  applicantSig: string | null;
  parentSig: string | null;
  waiverAgreed: boolean;
  savedAt: number;
}

// Canvas Signature Pad Component
interface SignaturePadProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  error?: string;
  readOnly?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ 
  label, 
  value, 
  onChange, 
  error, 
  readOnly = false 
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(!!value);

  useEffect(() => {
    if (readOnly) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (value) {
      const img = new Image();
      img.src = value;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
        setHasDrawn(true);
      };
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  }, [value, readOnly]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    if (!isDrawing || readOnly) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  if (readOnly) {
    const [showImage, setShowImage] = useState(false);

    return (
      <div className="space-y-1 select-none text-left">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <FileSignature className="w-3.5 h-3.5 text-blue-500" />
            <span>{label}</span>
          </label>
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
            <Lock className="w-2.5 h-2.5" /> Pre-Registered (Locked)
          </span>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 h-20 flex items-center justify-center">
          {value ? (
            showImage ? (
              <img src={value} alt={label} className="max-h-full max-w-full object-contain pointer-events-none" />
            ) : (
              <button
                type="button"
                onClick={() => setShowImage(true)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-zinc-700 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-blue-500" />
                <span>Show Signature</span>
              </button>
            )
          ) : (
            <span className="text-[10px] text-slate-400 font-mono italic">No signature on file</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 select-none text-left">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <FileSignature className="w-3.5 h-3.5 text-blue-500" />
          <span>{label}</span>
        </label>
        {hasDrawn && (
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
            <Check className="w-3 h-3 stroke-3" /> Signed
          </span>
        )}
      </div>

      <div className={`relative rounded-xl overflow-hidden border bg-white transition-colors ${
        error ? 'border-red-500 bg-red-500/5' : hasDrawn ? 'border-emerald-500' : 'border-slate-300 dark:border-zinc-700'
      }`}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-24 block cursor-crosshair touch-none bg-white"
        />
        <span className="absolute bottom-1.5 left-2.5 text-[8px] font-mono font-semibold text-slate-400 pointer-events-none uppercase tracking-widest">
          Draw signature inside box
        </span>
      </div>

      {error ? (
        <p className="text-[9px] text-red-500 font-bold leading-none">{error}</p>
      ) : (
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={clearCanvas}
            className="px-2 py-0.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer border-none"
          >
            <Eraser className="w-3 h-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );
};

export interface IntakeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  initialPlan?: 'Monthly Membership' | 'Yearly Membership' | 'No Subscription' | null;
  initialIntakeMode?: 'Import' | 'Manual' | null;
  initialStep?: number;
  prefillData?: OnlineRegistration;
  prefillMember?: Member;
}

export const IntakeWizardModal: React.FC<IntakeWizardModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  initialPlan,
  initialIntakeMode,
  initialStep,
  prefillData,
  prefillMember
}) => {
  const [step, setStep] = useState<number>(() => initialStep !== undefined ? initialStep : 1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showStatusDetails, setShowStatusDetails] = useState<boolean>(false);
  const [intakeMode, setIntakeMethod] = useState<'Import' | 'Manual' | null>(initialIntakeMode || 'Manual');
  const [selectedPlan, setSelectedPlan] = useState<'Monthly Membership' | 'Yearly Membership' | 'No Subscription'>(
    initialPlan || 'Monthly Membership'
  );

  const [enrollmentType, setEnrollmentType] = useState<'existing' | 'new'>('existing');

  const [settings, setSettings] = useState<MembershipSettings>(DEFAULT_SETTINGS);
  const [, setIsLoadingSettings] = useState<boolean>(false);
  const [, setSettingsError] = useState<string | null>(null);
  const [, setIsUsingSettingsFallback] = useState<boolean>(false);

  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);

  // Draft Auto-saving State
  const [draftState, setDraftState] = useState<'saved' | 'saving' | 'idle'>('idle');
  const isRestoringDraftRef = useRef(false);
  const lastDraftSnapshotRef = useRef<string>('');

  const fetchWizardSettings = async () => {
    setIsLoadingSettings(true);
    setSettingsError(null);
    try {
      const data = await settingsService.load();
      if (data) {
        setSettings(data);
        setIsUsingSettingsFallback(false);
      } else {
        setSettings(DEFAULT_SETTINGS);
        setIsUsingSettingsFallback(true);
      }
    } catch (err: any) {
      console.warn("Failed to load settings from Supabase in IntakeWizardModal:", err);
      setSettings(DEFAULT_SETTINGS);
      setSettingsError("Could not fetch pricing parameters from Supabase. Default pricing applied.");
      setIsUsingSettingsFallback(true);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWizardSettings();
      memberService.getAll().then(setAllMembers).catch(console.error);
      subscriptionService.getAll().then(setAllSubscriptions).catch(console.error);
    }
  }, [isOpen]);

  const cardFee = settings.card_printing_fee || 50;
  const gcashFee = settings.gcash_fee || 10;

  const [selectedExistingMember, setSelectedExistingMember] = useState<Member | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Personal Fields
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleInitials, setMiddleInitials] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [birthday, setBirthday] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Minor Parent & Signature Fields
  const [parentName, setParentName] = useState('');
  const [parentRelationship, setParentRelationship] = useState('Father');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [sameAsParent, setSameAsParent] = useState(true);
  const [applicantSig, setApplicantSig] = useState<string | null>(null);
  const [parentSig, setParentSig] = useState<string | null>(null);
  const [consentDate, setConsentDate] = useState<string | null>(null);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [subscriptionAgreement, setSubscriptionAgreement] = useState(false);
  const [agreementDocument, setAgreementDocument] = useState<AgreementDocument | null>(null);

  const [manualIdInput, setManualIdInput] = useState('');
  const [isScanning, setIsScanning] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const receiptRef = useRef<OfficialReceiptRef | null>(null);
  const qrRegionId = "fast-intake-qr-reader";

  const lastScanTimeRef = useRef<number>(0);
  const lastScannedIdRef = useRef<string>('');
  
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  useEffect(() => {
    if (isOpen && intakeMode === 'Import' && isScanning) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            const backCam = devices.find((d) => {
              const label = d.label.toLowerCase();
              return (
                label.includes('back') ||
                label.includes('rear') ||
                label.includes('environment') ||
                label.includes('facing back')
              );
            });
            const defaultCameraId = backCam ? backCam.id : devices[0].id;
            setSelectedCameraId(defaultCameraId);
          }
        })
        .catch((err) => {
          console.warn("Could not retrieve camera list:", err);
        });
    }
  }, [isOpen, intakeMode, isScanning]);

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [gcashReference, setGcashReference] = useState('');
  const [addIdCard, setAddIdCard] = useState(false);
  const [importedQueueReg, setImportedQueueReg] = useState<OnlineRegistration | null>(null);
  const [finishedIds, setFinishedIds] = useState<{ member_id: string; sub_id: string; receipt_no: string; transaction_date: string } | null>(null);

  const activeMember = selectedExistingMember || prefillMember;
  const isNameLocked = Boolean(activeMember?.full_name?.trim());
  const isPhoneLocked = Boolean(activeMember?.phone && activeMember.phone.trim() && activeMember.phone.toLowerCase() !== 'no phone');
  const isBirthdayLocked = Boolean(activeMember?.birthday?.trim());
  const isAddressLocked = Boolean(activeMember?.address?.trim());
  const isEmergencyNameLocked = Boolean(activeMember?.emergency_contact_name?.trim());
  const isRelationshipLocked = Boolean(activeMember?.relationship?.trim());
  const isEmergencyPhoneLocked = Boolean(activeMember?.emergency_contact_phone && activeMember.emergency_contact_phone.trim() && activeMember.emergency_contact_phone.toLowerCase() !== 'no phone');

  const isMissing = (val: string) => Boolean(activeMember) && (!val || !val.trim() || val.trim().toLowerCase() === 'no phone');

  const matchingSearchMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return [];
    const q = memberSearchQuery.toLowerCase().trim();
    return allMembers.filter((m: Member) => 
      m.full_name.toLowerCase().includes(q) ||
      m.member_id.toLowerCase().includes(q) ||
      (m.phone && m.phone.includes(q))
    );
  }, [memberSearchQuery, allMembers]);

  const getCombinedFullName = () => {
    const mi = middleInitials.trim() ? ` ${middleInitials.trim()}.` : '';
    const suff = suffix.trim() ? ` ${suffix.trim()}` : '';
    return `${lastName.trim()}, ${firstName.trim()}${mi}${suff}`;
  };

  const parseAndSetFullNameFields = (flatName: string) => {
    const trimmed = flatName.trim();
    if (!trimmed) {
      setLastName('');
      setFirstName('');
      setMiddleInitials('');
      setSuffix('');
      return;
    }

    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      const lName = parts[0].trim();
      const rest = parts[1].trim().split(/\s+/);
      
      setLastName(lName);
      if (rest.length > 0) {
        const lastPart = rest[rest.length - 1];
        const isSuffix = ['JR.', 'SR.', 'III', 'II', 'IV', 'JR', 'SR'].includes(lastPart.toUpperCase());
        
        if (isSuffix && rest.length > 1) {
          setSuffix(lastPart);
          rest.pop();
        } else {
          setSuffix('');
        }

        if (rest.length > 1) {
          const cleanMI = rest[rest.length - 1].replace('.', '');
          if (cleanMI.length <= 2) {
            setMiddleInitials(cleanMI);
            rest.pop();
          } else {
            setMiddleInitials('');
          }
        } else {
          setMiddleInitials('');
        }
        setFirstName(rest.join(' '));
      }
    } else {
      const parts = trimmed.split(/\s+/);
      if (parts.length === 1) {
        setFirstName(parts[0]);
        setLastName('');
        setMiddleInitials('');
        setSuffix('');
      } else {
        const lastPart = parts[parts.length - 1];
        const isSuffix = ['JR.', 'SR.', 'III', 'II', 'IV', 'JR', 'SR'].includes(lastPart.toUpperCase());
        let suffVal = '';
        if (isSuffix) {
          suffVal = lastPart;
          parts.pop();
        }
        setSuffix(suffVal);

        if (parts.length > 1) {
          const lName = parts.pop() || '';
          setLastName(lName);
          if (parts.length > 1) {
            const cleanMI = parts[parts.length - 1].replace('.', '');
            if (cleanMI.length <= 2) {
              setMiddleInitials(cleanMI);
              parts.pop();
            } else {
              setMiddleInitials('');
            }
          } else {
            setMiddleInitials('');
          }
          setFirstName(parts.join(' '));
        } else {
          setFirstName(parts[0]);
          setLastName('');
        }
      }
    }
  };

  const handleSelectExistingMember = (m: Member) => {
    setSelectedExistingMember(m);
    setEnrollmentType('existing');
    parseAndSetFullNameFields(m.full_name);
    setEmail(m.email || '');
    setPhone(m.phone || '');
    setGender(m.gender || 'Male');
    setBirthday(m.birthday || '');
    setAddress(m.address || '');
    setEmergencyName(m.emergency_contact_name || m.full_name);
    setRelationship(m.relationship || 'Guardian / Family');
    setEmergencyPhone(m.emergency_contact_phone || m.phone || '');
    setParentName(m.parent_name || '');
    setParentRelationship(m.parent_relationship || 'Father');
    setParentPhone(m.parent_phone || '');
    setParentEmail(m.parent_email || '');
    setApplicantSig(m.applicant_signature || null);
    setParentSig(m.parent_signature || null);
    setConsentDate(m.consent_date || null);
    setWaiverAgreed(false);
    setErrors({});
  };

  const handleClearSelectedExistingMember = () => {
    setSelectedExistingMember(null);
    setMemberSearchQuery('');
    setLastName('');
    setFirstName('');
    setMiddleInitials('');
    setSuffix('');
    setEmail('');
    setPhone('');
    setGender('Male');
    setBirthday('');
    setAddress('');
    setEmergencyName('');
    setRelationship('');
    setEmergencyPhone('');
    setParentName('');
    setParentRelationship('Father');
    setParentPhone('');
    setParentEmail('');
    setApplicantSig(null);
    setParentSig(null);
    setWaiverAgreed(false);
    setSubscriptionAgreement(false);
    setErrors({});
  };

  const handleChooseCreateNewMember = () => {
    setEnrollmentType('new');
    handleClearSelectedExistingMember();
  };

  const handleChooseExistingMember = () => {
    setEnrollmentType('existing');
    handleClearSelectedExistingMember();
  };

  // Auto-Save Draft System with 24-Hour TTL
  useEffect(() => {
    if (!isOpen || prefillData || prefillMember || intakeMode === 'Import') return;

    isRestoringDraftRef.current = true;
    try {
      const saved = localStorage.getItem(INTAKE_DRAFT_STORAGE_KEY);
      if (saved) {
        const draft: IntakeDraft = JSON.parse(saved);
        const isExpired = Date.now() - (draft.savedAt || 0) > DRAFT_MAX_AGE_MS;

        if (isExpired) {
          localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
        } else {
          setEnrollmentType(draft.enrollmentType || 'new');
          setLastName(draft.lastName || '');
          setFirstName(draft.firstName || '');
          setMiddleInitials(draft.middleInitials || '');
          setSuffix(draft.suffix || '');
          setEmail(draft.email || '');
          setPhone(draft.phone || '');
          setGender(draft.gender || 'Male');
          setBirthday(draft.birthday || '');
          setAddress(draft.address || '');
          setEmergencyName(draft.emergencyName || '');
          setRelationship(draft.relationship || '');
          setEmergencyPhone(draft.emergencyPhone || '');
          setParentName(draft.parentName || '');
          setParentRelationship(draft.parentRelationship || 'Father');
          setParentPhone(draft.parentPhone || '');
          setParentEmail(draft.parentEmail || '');
          setSameAsParent(draft.sameAsParent ?? true);
          setApplicantSig(draft.applicantSig || null);
          setParentSig(draft.parentSig || null);
          setWaiverAgreed(Boolean(draft.waiverAgreed));
          setDraftState('saved');
          toast.info('Restored saved intake draft (valid for 24h).', { toastId: 'intake-draft-restored' });
        }
      }
    } catch {
      localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
    } finally {
      setTimeout(() => { isRestoringDraftRef.current = false; }, 100);
    }
  }, [isOpen, prefillData, prefillMember, intakeMode]);

  // Real-time character auto-save listener
  useEffect(() => {
    if (!isOpen || isRestoringDraftRef.current || isSubmitting || intakeMode !== 'Manual' || prefillData || prefillMember) return;

    const draftData: IntakeDraft = {
      enrollmentType,
      selectedMemberId: selectedExistingMember?.id,
      lastName, firstName, middleInitials, suffix, email, phone, gender, birthday, address,
      emergencyName, relationship, emergencyPhone, parentName, parentRelationship, parentPhone, parentEmail,
      sameAsParent, applicantSig, parentSig, waiverAgreed,
      savedAt: Date.now()
    };

    const currentSnapshot = JSON.stringify(draftData);
    if (currentSnapshot === lastDraftSnapshotRef.current) return;
    lastDraftSnapshotRef.current = currentSnapshot;

    const hasAnyContent = [lastName, firstName, phone, email, birthday, address, emergencyName, emergencyPhone, parentName, parentPhone]
      .some(val => val.trim() !== '');

    if (!hasAnyContent && !selectedExistingMember) {
      localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
      setDraftState('idle');
      return;
    }

    setDraftState('saving');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(INTAKE_DRAFT_STORAGE_KEY, JSON.stringify(draftData));
        setDraftState('saved');
      } catch (e) {
        console.warn("Could not save intake draft:", e);
        setDraftState('idle');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    isOpen, isSubmitting, intakeMode, prefillData, prefillMember, enrollmentType, selectedExistingMember,
    lastName, firstName, middleInitials, suffix, email, phone, gender, birthday, address,
    emergencyName, relationship, emergencyPhone, parentName, parentRelationship, parentPhone, parentEmail,
    sameAsParent, applicantSig, parentSig, waiverAgreed
  ]);

  const handleClearDraft = () => {
    localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
    setSelectedExistingMember(null);
    setMemberSearchQuery('');
    setLastName('');
    setFirstName('');
    setMiddleInitials('');
    setSuffix('');
    setEmail('');
    setPhone('');
    setGender('Male');
    setBirthday('');
    setAddress('');
    setEmergencyName('');
    setRelationship('');
    setEmergencyPhone('');
    setParentName('');
    setParentRelationship('Father');
    setParentPhone('');
    setParentEmail('');
    setSameAsParent(true);
    setApplicantSig(null);
    setParentSig(null);
    setWaiverAgreed(false);
    setDraftState('idle');
    setErrors({});
    toast.info('Intake draft cleared.', { toastId: 'draft-cleared-toast' });
  };

  const existingMemberMatch = useMemo<Member | null>(() => {
    if (!firstName.trim() || !lastName.trim()) return null;
    const targetFirst = firstName.trim().toLowerCase();
    const targetLast = lastName.trim().toLowerCase();

    return allMembers.find((m: Member) => {
      if (selectedExistingMember && m.id === selectedExistingMember.id) return false;
      if (prefillMember && m.id === prefillMember.id) return false;
      const flatFullName = m.full_name.toLowerCase();
      return flatFullName.includes(targetFirst) && flatFullName.includes(targetLast);
    }) || null;
  }, [firstName, lastName, selectedExistingMember, prefillMember, allMembers]);

  const phoneMatchMember = useMemo<Member | null>(() => {
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 7 || cleanPhone.toLowerCase() === 'no phone') return null;

    return allMembers.find((m: Member) => {
      if (selectedExistingMember && m.id === selectedExistingMember.id) return false;
      if (prefillMember && m.id === prefillMember.id) return false;
      return m.phone && m.phone.trim() === cleanPhone;
    }) || null;
  }, [phone, selectedExistingMember, prefillMember, allMembers]);

  const calculatedAge = useMemo(() => {
    if (!birthday) return 0;
    const birthDate = new Date(birthday);
    const today = new Date();
    let calculated = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculated--;
    }
    return calculated >= 0 ? calculated : 0;
  }, [birthday]);

  const isRestrictedUnder12 = useMemo(() => !!birthday && calculatedAge < 12, [birthday, calculatedAge]);
  const isMinor = useMemo(() => !!birthday && calculatedAge >= 12 && calculatedAge < 18, [birthday, calculatedAge]);

  // Auto-sync parent fields to emergency contact for minors when sameAsParent is enabled
  useEffect(() => {
    if (isMinor && sameAsParent) {
      if (parentName) setEmergencyName(parentName);
      if (parentPhone) setEmergencyPhone(parentPhone);
      if (parentRelationship) setRelationship(parentRelationship);
    }
  }, [isMinor, sameAsParent, parentName, parentPhone, parentRelationship]);

  const isGcashValid = useMemo(() => {
    const clean = gcashReference.trim();
    return clean.length >= 10 && /^\d+$/.test(clean);
  }, [gcashReference]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1 && intakeMode === 'Manual') {
      handleStep1Next();
    } else if (step === 2 && !isConfirmDisabled && !isSubmitting) {
      handleExecuteCheckout();
    }
  };

  const getMemberSubscriptionMeta = useCallback((m: Member) => {
    const now = Date.now();
    const activeSub = allSubscriptions.find((s: Subscription) => {
      if (s.member_id !== m.member_id || s.status === 'Voided') return false;
      const startMs = new Date(s.start_date).getTime();
      const endMs = new Date(s.end_date).getTime();
      return startMs <= now && endMs >= now;
    });

    const queuedSub = allSubscriptions.find((s: Subscription) => {
      if (s.member_id !== m.member_id || s.status === 'Voided') return false;
      const startMs = new Date(s.start_date).getTime();
      return startMs > now;
    });

    const statusStr = String(m.status || '');
    const isSuspended = statusStr === 'Suspended' || statusStr === 'Inactive' || statusStr === 'Banned';

    let remainingDays = 0;
    let isOver30Days = false;
    let isWithin30Days = false;

    if (activeSub) {
      const endMs = new Date(activeSub.end_date).getTime();
      remainingDays = Math.max(0, Math.ceil((endMs - now) / (1000 * 60 * 60 * 24)));
      isOver30Days = remainingDays > 30;
      isWithin30Days = remainingDays <= 30;
    }

    const hasTwoSubs = Boolean(activeSub && queuedSub);
    const isBlockedFromRenewing = isSuspended || hasTwoSubs || isOver30Days;

    return {
      activeSub,
      queuedSub,
      hasTwoSubs,
      isSuspended,
      remainingDays,
      isOver30Days,
      isWithin30Days,
      isBlockedFromRenewing
    };
  }, [allSubscriptions]);

  // STEP 1: APPLICANT VALIDATION STATUS SUMMARY
  const applicantStatusSummary = useMemo(() => {
    const notices: { type: 'success' | 'info' | 'warning'; text: string }[] = [];

    const loadedTicketId = importedQueueReg?.id || prefillData?.id;
    if (loadedTicketId) {
      notices.push({
        type: 'info',
        text: `Information imported from pre-registration ticket (${loadedTicketId}).`
      });
    }

    if (selectedExistingMember || prefillMember) {
      const active = selectedExistingMember || prefillMember;
      const meta = active ? getMemberSubscriptionMeta(active) : null;

      if (meta?.isSuspended) {
        return {
          level: 'red' as const,
          title: 'Account Suspended',
          description: `This member profile is currently marked as Suspended/Inactive. Membership enrollment is blocked until account status is resolved.`,
          actionMember: null,
          notices: [{ type: 'warning' as const, text: 'Member account is currently suspended.' }]
        };
      }

      if (meta?.hasTwoSubs) {
        return {
          level: 'red' as const,
          title: 'Maximum Subscriptions Reached',
          description: `Member already has an active contract (${meta.activeSub?.plan_name}) and a queued renewal (${meta.queuedSub?.plan_name}). Adding more renewals is not allowed.`,
          actionMember: null,
          notices: [{ type: 'warning' as const, text: '2 active/queued subscriptions detected.' }]
        };
      }

      if (meta?.isOver30Days) {
        return {
          level: 'red' as const,
          title: 'Renewal Not Allowed Yet',
          description: `Active contract (${meta.activeSub?.plan_name}) has ${meta.remainingDays} days remaining. Renewals or plan adjustments are only permitted within 30 days of expiration.`,
          actionMember: null,
          notices: [{ type: 'warning' as const, text: `${meta.remainingDays} days remaining on active plan.` }]
        };
      }

      if (meta?.isWithin30Days && meta.activeSub) {
        notices.push({
          type: 'info',
          text: `Active contract (${meta.activeSub.plan_name}) has ${meta.remainingDays} days left. Ready for renewal extension.`
        });
        return {
          level: 'amber' as const,
          title: 'Eligible for Renewal Extension',
          description: `Member's active ${meta.activeSub.plan_name} contract expires in ${meta.remainingDays} days. Enrolling will queue the renewal to start upon expiration.`,
          actionMember: null,
          notices
        };
      }

      notices.push({
        type: 'info',
        text: `Attached to existing member profile: ${active?.full_name} (${active?.member_id}).`
      });
    }

    if (!selectedExistingMember && phoneMatchMember) {
      notices.push({
        type: 'warning',
        text: `This phone number is already used by ${phoneMatchMember.full_name} (${phoneMatchMember.member_id}).`
      });
      return {
        level: 'amber' as const,
        title: 'Please Review',
        description: `This phone number is already used by ${phoneMatchMember.full_name} (${phoneMatchMember.member_id}). If this is a family member or shared contact, you may continue.`,
        actionMember: phoneMatchMember,
        notices
      };
    }

    if (loadedTicketId) {
      return {
        level: 'blue' as const,
        title: 'Information Loaded',
        description: `Applicant details imported from pre-registration.`,
        actionMember: null,
        notices
      };
    }

    return {
      level: 'green' as const,
      title: 'Ready to Register',
      description: 'This applicant is ready to be registered.',
      actionMember: null,
      notices
    };
  }, [importedQueueReg, prefillData, selectedExistingMember, prefillMember, phoneMatchMember, getMemberSubscriptionMeta]);

  // STEP 2: MEMBERSHIP VALIDATION STATUS SUMMARY
  const membershipStatusSummary = useMemo(() => {
    if (selectedPlan === 'No Subscription') {
      return {
        level: 'amber' as const,
        isBlocked: false,
        title: 'Profile Registration Only',
        description: 'No active membership plan selected. Profile will be saved without a subscription contract.'
      };
    }

    const target = selectedExistingMember || prefillMember || existingMemberMatch;
    if (target) {
      const meta = getMemberSubscriptionMeta(target);

      if (meta.isSuspended) {
        return {
          level: 'red' as const,
          isBlocked: true,
          title: 'Account Suspended',
          description: `This member profile is suspended. Please reinstate their account before processing subscription enrollment.`
        };
      }

      if (meta.hasTwoSubs) {
        const queueStartDate = meta.queuedSub?.start_date 
          ? new Date(meta.queuedSub.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'N/A';

        return {
          level: 'red' as const,
          isBlocked: true,
          title: 'Maximum Subscriptions Queued',
          description: `This member already has an ongoing plan (${meta.activeSub?.plan_name}) and a queued renewal (${meta.queuedSub?.plan_name}) starting on ${queueStartDate}. Multiple queued renewals are not allowed.`
        };
      }

      if (meta.isOver30Days && meta.activeSub) {
        const expDate = new Date(meta.activeSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return {
          level: 'red' as const,
          isBlocked: true,
          title: 'Renewal Blocked (>30 Days Remaining)',
          description: `This member currently has an active ${meta.activeSub.plan_name} contract expiring on ${expDate} (${meta.remainingDays} days remaining). Renewal or plan change is only permitted within 30 days of expiration.`
        };
      }

      if (meta.isWithin30Days && meta.activeSub) {
        const expDate = new Date(meta.activeSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const isSamePlan = selectedPlan === meta.activeSub.plan_name;
        const actionText = isSamePlan ? 'extend' : 'queue';

        return {
          level: 'amber' as const,
          isBlocked: false,
          title: 'Subscription Extension Notice',
          description: `Member currently has an active ${meta.activeSub.plan_name} contract expiring on ${expDate} (${meta.remainingDays} days left). Confirming checkout will ${actionText} the new ${selectedPlan} to activate automatically on ${expDate}.`
        };
      }
    }

    return {
      level: 'green' as const,
      isBlocked: false,
      title: 'Membership Ready',
      description: `${selectedPlan} selected. This member is eligible for registration.`
    };
  }, [selectedPlan, selectedExistingMember, prefillMember, existingMemberMatch, getMemberSubscriptionMeta]);

  const populateRegistrationData = (reg: OnlineRegistration) => {
    setImportedQueueReg(reg);
    parseAndSetFullNameFields(reg.full_name);
    setEmail(reg.email || '');
    setPhone(reg.phone);
    setGender(reg.gender || 'Male');
    setBirthday(reg.birthday || '');
    setAddress(reg.address || '');
    setEmergencyName(reg.emergency_contact_name || '');
    setRelationship(reg.relationship || 'Guardian');
    setEmergencyPhone(reg.emergency_contact_phone || '');

    setParentName(reg.parent_name || '');
    setParentRelationship(reg.parent_relationship || 'Father');
    setParentPhone(reg.parent_phone || '');
    setParentEmail(reg.parent_email || '');
    setApplicantSig(reg.applicant_signature || null);
    setParentSig(reg.parent_signature || null);
    setConsentDate(reg.consent_date || null);
    setWaiverAgreed(true);

    const rawPlan = reg.preferred_plan;
    if (rawPlan) {
      const isYearly = String(rawPlan).toLowerCase().includes('yearly');
      setSelectedPlan(isYearly ? 'Yearly Membership' : 'Monthly Membership');
    }
  };

  useEffect(() => {
    if (isOpen) {
      const startingStep = initialStep !== undefined ? initialStep : (prefillData ? 2 : 1);
      setStep(startingStep);
      setShowStatusDetails(false);
      setErrors({});
      setMemberSearchQuery('');
      lastScannedIdRef.current = '';
      lastScanTimeRef.current = 0;
      setIntakeMethod(initialIntakeMode || (prefillData || prefillMember ? 'Manual' : 'Manual'));
      
      if (initialPlan) {
        setSelectedPlan(initialPlan);
      }

      if (prefillMember) {
        handleSelectExistingMember(prefillMember);
        setSelectedPlan('Monthly Membership');
      } else if (prefillData) {
        populateRegistrationData(prefillData);
      }
    }
  }, [isOpen, prefillMember, prefillData, initialPlan, initialIntakeMode, initialStep]);

  const handleModalClose = () => {
    forceStopCamera();
    setIsScanning(false);
    onClose();
  };

  const forceStopCamera = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().then(() => {
            scannerRef.current?.clear();
          }).catch(() => {});
        } else {
          scannerRef.current.clear();
        }
      } catch (e) {
        // Cleanup ignore
      }
    }

    const qrRegion = document.getElementById(qrRegionId);
    const videoElements = qrRegion ? qrRegion.querySelectorAll('video') : document.querySelectorAll('video');

    videoElements.forEach((video) => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => track.stop());
        }
        video.srcObject = null;
      }
    });
  };

  const handleValidateId = async (input: string) => {
    let cleanId = input.trim();
    try {
      if (cleanId.startsWith('{')) {
        const parsed = JSON.parse(cleanId);
        cleanId = parsed.registrationId || parsed.memberId || parsed.member_id || cleanId;
      }
    } catch {}

    cleanId = cleanId.toUpperCase().trim();
    const now = Date.now();
    if (lastScannedIdRef.current === cleanId && (now - lastScanTimeRef.current) < 2500) return;

    lastScannedIdRef.current = cleanId;
    lastScanTimeRef.current = now;

    const list = await registrationService.getQueue();
    const foundReg = list.find((q: OnlineRegistration) => q.id.toUpperCase() === cleanId);

    if (foundReg) {
      if (foundReg.status !== 'Pending') {
        toast.warning(`Registration ID ${cleanId} has already been ${foundReg.status.toLowerCase()}.`);
        return;
      }
      forceStopCamera();
      setIsScanning(false);
      populateRegistrationData(foundReg);
      toast.success(`Validated Profile: ${foundReg.full_name}`);
      setIntakeMethod('Manual');
      setStep(2);
      return;
    }

    const foundMember = allMembers.find(
      (m: Member) => m.member_id.toUpperCase() === cleanId || m.id.toUpperCase() === cleanId
    );

    if (foundMember) {
      forceStopCamera();
      setIsScanning(false);
      handleSelectExistingMember(foundMember);
      toast.success(`Attached Existing Member: ${foundMember.full_name}`);
      setIntakeMethod('Manual');
      setStep(2);
      return;
    }

    toast.error(`ID "${cleanId}" not found in pre-registrations or existing member profiles.`);
  };

  const getCameraErrorMessage = (err: any): string => {
    const msg = typeof err === 'string' ? err : err?.message || String(err || '');
    const lower = msg.toLowerCase();
    if (lower.includes('notallowederror') || lower.includes('permission')) return 'Permission denied by browser';
    if (lower.includes('notreadableerror') || lower.includes('in use')) return 'Camera is busy or in use';
    if (lower.includes('notfounderror')) return 'Camera hardware not found';
    return msg || 'Camera initialization failed';
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let isCancelled = false;

    if (isOpen && isScanning && step === 1 && intakeMode === 'Import') {
      const timer = setTimeout(() => {
        const element = document.getElementById(qrRegionId);
        if (!element || isCancelled) return;

        try {
          html5QrCode = new Html5Qrcode(qrRegionId);
          scannerRef.current = html5QrCode;
          const cameraConfig = selectedCameraId ? selectedCameraId : { facingMode: "environment" };

          html5QrCode.start(
            cameraConfig,
            { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
            (decodedText) => handleValidateId(decodedText.trim()),
            () => {}
          )
          .then(() => {
            if (isCancelled) forceStopCamera();
          })
          .catch((err) => {
            if (!isCancelled) {
              const reason = getCameraErrorMessage(err);
              if (cameras.length > 1) {
                const currentIndex = selectedCameraId ? cameras.findIndex(c => c.id === selectedCameraId) : -1;
                const nextCamera = cameras[(currentIndex + 1) % cameras.length];
                forceStopCamera();
                setSelectedCameraId(nextCamera.id);
                toast.info(`Switching camera: ${nextCamera.label || 'Next Camera'}`);
              } else {
                toast.error(`Camera Error: ${reason}`);
                setIsScanning(false);
              }
            }
          });
        } catch (e) {
          console.error("Scanner setup error", e);
        }
      }, 300);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
        forceStopCamera();
      };
    }
  }, [isOpen, isScanning, step, intakeMode, selectedCameraId, cameras]);

  const validateStep1 = () => {
    if (enrollmentType === 'existing' && !selectedExistingMember) {
      toast.error('Please search and select an existing member profile first.');
      return false;
    }

    if (selectedExistingMember) {
      const meta = getMemberSubscriptionMeta(selectedExistingMember);
      if (meta.isSuspended) {
        toast.error('This member account is suspended. Enrollment cannot proceed.');
        return false;
      }
      if (meta.hasTwoSubs) {
        toast.error('This member already has two active/queued subscriptions.');
        return false;
      }
      if (meta.isOver30Days) {
        toast.error(`Member has ${meta.remainingDays} days remaining on their active plan. Renewals only allowed within 30 days.`);
        return false;
      }
    }

    const newErrors: Record<string, string> = {};

    if (!lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!phone.trim() || phone.trim().toLowerCase() === 'no phone') newErrors.phone = 'Phone number is required.';
    if (!birthday.trim()) newErrors.birthday = 'Birthday is required.';

    if (isMinor) {
      if (!parentName.trim()) newErrors.parentName = 'Parent / Legal Guardian name is required for minors.';
      if (!parentRelationship.trim()) newErrors.parentRelationship = 'Relationship to minor is required.';
      if (!parentPhone.trim()) newErrors.parentPhone = 'Parent contact phone is required.';
      if (!applicantSig) newErrors.applicantSig = 'Applicant digital signature is required.';
      if (!parentSig) newErrors.parentSig = 'Parent / Guardian digital signature is required.';

      if (!sameAsParent) {
        if (!emergencyName.trim()) newErrors.emergencyName = 'Emergency contact name is required.';
        if (!emergencyPhone.trim()) newErrors.emergencyPhone = 'Emergency phone is required.';
      }
    }

    if (!waiverAgreed) {
      newErrors.waiverAgreed = 'You must acknowledge the Terms & Conditions and Privacy Policy.';   
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStep1Next = () => {
    if (!validateStep1()) {
      const missingList: string[] = [];
      if (!lastName.trim()) missingList.push('Last Name');
      if (!firstName.trim()) missingList.push('First Name');
      if (!phone.trim()) missingList.push('Phone Number');
      if (!birthday.trim()) missingList.push('Birthday');
      if (isMinor) {
        if (!parentName.trim()) missingList.push('Parent Name');
        if (!parentPhone.trim()) missingList.push('Parent Phone');
        if (!applicantSig) missingList.push('Applicant Signature');
        if (!parentSig) missingList.push('Parent Signature');
      }
      if (!waiverAgreed) missingList.push('Terms Agreement');

      if (missingList.length > 0) {
        toast.error(`Please complete missing items: ${missingList.join(', ')}`);
      }
      return;
    }

    if (isRestrictedUnder12) {
      toast.error('Registration is restricted for individuals under 12 years old.');
      return;
    }

    setStep(2);
  };

  const handleBack = () => {
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleExecuteCheckout = async () => {
    if (isSubmitting) return;

    // Validation: Checkbox required for paid subscriptions
    if (selectedPlan !== 'No Subscription' && !subscriptionAgreement) {
      setErrors(prev => ({
        ...prev,
        subscriptionAgreement: 'You must acknowledge the Terms & Conditions and Privacy Policy.'
      }));
      return;
    }

    setIsSubmitting(true);

    try {
      let livePlanBasePrice = 0;
      let liveGcashFee = 0;
      let liveCardFee = 0;
      let liveTotalPrice = 0;

      if (selectedPlan !== 'No Subscription') {
        let liveSettings: MembershipSettings | null = null;
        try {
          liveSettings = await settingsService.load();
        } catch {
          toast.error("Network connection unstable. Could not verify live pricing with database.");
          setIsSubmitting(false);
          return;
        }

        if (!liveSettings) {
          toast.error("Unable to verify live rates from Supabase. Please retry once online.");
          setIsSubmitting(false);
          return;
        }

        const livePrice = selectedPlan === 'Monthly Membership' 
          ? liveSettings.monthly_plan_price 
          : liveSettings.yearly_plan_price;

        if (typeof livePrice !== 'number' || livePrice <= 0) {
          toast.error("Invalid live pricing returned from database. Subscription cannot be processed.");
          setIsSubmitting(false);
          return;
        }

        setSettings(liveSettings);
        livePlanBasePrice = livePrice;
        liveGcashFee = paymentMethod === 'GCash' ? (liveSettings.gcash_fee || 10) : 0;
        liveCardFee = addIdCard ? (liveSettings.card_printing_fee || 50) : 0;
        liveTotalPrice = livePlanBasePrice + liveGcashFee + liveCardFee;
      } else {
        liveCardFee = addIdCard ? (settings.card_printing_fee || 50) : 0;
        liveTotalPrice = liveCardFee;
      }

      if (membershipStatusSummary.isBlocked) {
        toast.error(membershipStatusSummary.description);
        setIsSubmitting(false);
        return;
      }

      let targetMember: Member;
      const combinedName = getCombinedFullName();
      const existingByPhone = phone.trim() ? allMembers.find((m: Member) => m.phone === phone.trim()) : null;
      const activeMemberToUse = prefillMember || selectedExistingMember || existingMemberMatch || existingByPhone;

      const finalEmergencyName = isMinor && sameAsParent ? parentName.trim() : emergencyName.trim();
      const finalRelationship = isMinor && sameAsParent ? parentRelationship.trim() : relationship.trim();
      const finalEmergencyPhone = isMinor && sameAsParent ? parentPhone.trim() : emergencyPhone.trim();

      const memberFields = {
        full_name: combinedName,
        email: email.trim(),
        phone: phone.trim(),
        gender,
        birthday,
        address: address.trim(),
        emergency_contact_name: finalEmergencyName,
        relationship: finalRelationship,
        emergency_contact_phone: finalEmergencyPhone,
        parent_name: isMinor ? parentName.trim() : null,
        parent_relationship: isMinor ? parentRelationship.trim() : null,
        parent_phone: isMinor ? parentPhone.trim() : null,
        parent_email: isMinor ? parentEmail.trim() : null,
        applicant_signature: isMinor ? applicantSig : null,
        parent_signature: isMinor ? parentSig : null,
        consent_date: isMinor ? (consentDate || new Date().toISOString()) : null,
      };

      if (activeMemberToUse) {
        targetMember = await memberService.update(activeMemberToUse.id, memberFields, 'Admin Staff');
      } else {
        targetMember = await memberService.create({
          ...memberFields,
          status: 'Active'
        }, 'Admin Staff');
      }

      const mappedPayment: PaymentMethod = paymentMethod as PaymentMethod;
      let createdSub: Subscription | null = null;
      if (selectedPlan !== 'No Subscription') {
        createdSub = await subscriptionService.create(
          targetMember.member_id,
          selectedPlan,
          mappedPayment,
          'Admin Staff',
          liveTotalPrice,
          {
            basePrice: livePlanBasePrice,
            gcashFee: liveGcashFee,
            cardFee: liveCardFee,
            gcashRefNo: gcashReference.trim()
          }
        );
      }

      const receiptNo = createdSub?.receipt_number || `REG-${Date.now().toString().slice(-6)}`;

      if (addIdCard) {
        await cardService.issue(
          targetMember.member_id, 
          'QR', 
          'Admin Staff',
          undefined,
          'PAID',
          'UNCLAIMED',
          liveCardFee,
          receiptNo
        );
      } else {
        const existingCard = await cardService.getByMemberId(targetMember.member_id);
        if (!existingCard) {
          await cardService.issue(
            targetMember.member_id,
            'QR',
            'Admin Staff',
            undefined,
            'NONE',
            'NOT_APPLICABLE',
            0
          );
        }
      }

      if (importedQueueReg) {
        await registrationService.approve(importedQueueReg.id, 'Admin Staff');
      }

      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + 
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

      setFinishedIds({
        member_id: targetMember.member_id,
        sub_id: createdSub?.id || 'PROFILE-ONLY',
        receipt_no: receiptNo,
        transaction_date: formattedDate
      });

      window.dispatchEvent(new Event('palomar_logbook_updated'));
      
      localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
      setDraftState('idle');

      toast.success(selectedPlan === 'No Subscription' ? 'Member Profile enrolled.' : 'Subscription enrollment complete.');
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || 'System error during wizard checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const planBasePrice = selectedPlan === 'Monthly Membership' 
    ? settings.monthly_plan_price 
    : selectedPlan === 'Yearly Membership'
    ? settings.yearly_plan_price
    : 0;
    
  const appliedGcashFee = (paymentMethod === 'GCash' && selectedPlan !== 'No Subscription') ? gcashFee : 0;
  const appliedCardFee = addIdCard ? cardFee : 0;
  const totalPrice = planBasePrice + appliedGcashFee + appliedCardFee;

  const isPlanLocked = intakeMode === 'Import' || !!importedQueueReg || !!prefillData;
  const isConfirmDisabled = (paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && !isGcashValid) || isRestrictedUnder12 || membershipStatusSummary.isBlocked;

  const shouldShowDetailsForm = enrollmentType === 'new' || Boolean(selectedExistingMember) || Boolean(prefillMember) || Boolean(prefillData);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <form 
        onSubmit={handleFormSubmit} 
        className={`relative bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl w-full shadow-2xl overflow-hidden font-body text-xs text-(--color-text) max-h-[92vh] flex flex-col transition-all duration-300 ${
          step === 3 ? 'max-w-md' : 'max-w-2xl'
        }`}
      >
        {/* Progress Bar Header */}
        <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 relative select-none shrink-0">
          <div 
            className="absolute top-0 left-0 h-full bg-[#123c73] dark:bg-[#bf0202] transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Fixed Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center select-none shrink-0 bg-slate-50 dark:bg-[#161920]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none block">
                Frontdesk Intake Console
              </span>
              {step === 1 && intakeMode === 'Manual' && draftState !== 'idle' && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[8px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-zinc-700">
                  {draftState === 'saving' ? (
                    <><RefreshCw className="w-2.5 h-2.5 text-amber-500 animate-spin" /> Saving...</>
                  ) : (
                    <><Check className="w-2.5 h-2.5 text-emerald-500" /> Draft saved (24h)</>
                  )}
                </span>
              )}
            </div>
            <h3 className="font-heading text-xs sm:text-sm text-slate-900 dark:text-white mt-1 uppercase tracking-wider">
              Step {step} of 3: {
                step === 1 ? (intakeMode === 'Import' ? 'Scan Lobby Pre-Registration' : 'Enroll a Member & Details') :
                step === 2 ? 'Checkout Invoice & Membership Plan' : 'Enrollment Complete'
              }
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {step === 1 && intakeMode === 'Manual' && draftState !== 'idle' && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="p-1.5 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-red-500/20 hover:text-red-500 text-slate-500 transition-colors cursor-pointer border border-slate-300 dark:border-zinc-700 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1"
                title="Clear Draft"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
            <button 
              type="button"
              onClick={handleModalClose} 
              className="p-1.5 rounded-xl bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-300 dark:border-neutral-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">

          {/* STEP 1: SCAN / IMPORT PRE-REGISTRATION */}
          {step === 1 && intakeMode === 'Import' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="flex border border-slate-300 dark:border-white/10 rounded-xl overflow-hidden p-1 bg-slate-200 dark:bg-zinc-950">
                <button
                  type="button"
                  onClick={() => { setIsScanning(true); }}
                  className={`flex-1 py-2 text-center rounded-lg font-bold text-[10px] uppercase tracking-wide transition-colors ${isScanning ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  📷 Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => { setIsScanning(false); }}
                  className={`flex-1 py-2 text-center rounded-lg font-bold text-[10px] uppercase tracking-wide transition-colors ${!isScanning ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  ⌨️ Type Registration ID
                </button>
              </div>

              {!isScanning ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">Registration ID *</label>
                    <input 
                      type="text" 
                      value={manualIdInput} 
                      onChange={e => setManualIdInput(e.target.value)} 
                      placeholder="e.g. REG-000001" 
                      className="w-full p-2.5 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white rounded-xl outline-none text-xs font-mono uppercase tracking-widest placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-blue-500" 
                      onKeyDown={e => {
                        if (e.key === 'Enter' && manualIdInput.trim()) {
                          handleValidateId(manualIdInput);
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleValidateId(manualIdInput)}
                    disabled={!manualIdInput.trim()}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider font-heading cursor-pointer border-none shadow-md transition-colors"
                  >
                    Verify & Retrieve Profile
                  </button>
                </div>
              ) : (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="relative w-full aspect-square max-w-65 rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
                    <div id={qrRegionId} className="w-full h-full" />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-36 h-36 border-2 border-dashed border-blue-500 rounded-xl opacity-80 animate-pulse relative">
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-blue-400 rounded-tl" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-blue-400 rounded-tr" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-blue-400 rounded-bl" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-blue-400 rounded-br" />
                      </div>
                    </div>
                  </div>

                  {cameras.length > 1 && (
                    <div className="flex items-center justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
                          const nextIndex = (currentIndex + 1) % cameras.length;
                          forceStopCamera();
                          setSelectedCameraId(cameras[nextIndex].id);
                        }}
                        className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-blue-400 border border-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
                      >
                        <SwitchCamera className="w-4 h-4" />
                        <span>Switch Camera</span>
                      </button>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-600 dark:text-slate-400 text-center font-semibold animate-pulse leading-none">
                    Position the lobby QR badge within camera frame
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: ENROLL A MEMBER (MANUAL INTAKE) */}
          {step === 1 && intakeMode === 'Manual' && (
            <div className="space-y-4 text-left font-semibold animate-fade-in">
              
              {!prefillMember && !prefillData && (
                <div className="space-y-2 select-none">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
                    Enroll a Member • Select Action
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={handleChooseExistingMember}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3.5 shadow-sm group ${
                        enrollmentType === 'existing'
                          ? 'bg-blue-500/10 border-blue-600 dark:border-blue-500 ring-2 ring-blue-500/20'
                          : 'bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-500/50'
                      }`}
                    >
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        enrollmentType === 'existing'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 group-hover:text-blue-500'
                      }`}>
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-heading text-xs uppercase tracking-wider font-bold block text-slate-900 dark:text-white">
                          Select Existing Member
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                          Search and attach an existing profile to subscribe or renew
                        </span>
                      </div>
                    </div>

                    <div
                      onClick={handleChooseCreateNewMember}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3.5 shadow-sm group ${
                        enrollmentType === 'new'
                          ? 'bg-emerald-500/10 border-emerald-600 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                          : 'bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 hover:border-emerald-400 dark:hover:border-emerald-500/50'
                      }`}
                    >
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        enrollmentType === 'new'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 group-hover:text-emerald-500'
                      }`}>
                        <UserPlus className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-heading text-xs uppercase tracking-wider font-bold block text-slate-900 dark:text-white">
                          Create New Member
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight block mt-0.5">
                          Register a fresh client profile and setup agreement waiver
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {enrollmentType === 'existing' && !selectedExistingMember && !prefillData && (
                <div className="space-y-2 select-none relative animate-fade-in">
                  <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    SEARCH EXISTING MEMBER PROFILE TO SUBSCRIBE
                  </label>
                  
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Type Name, Phone, or Member ID to lookup existing profile..."
                      className="w-full pl-10 pr-10 py-3 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:border-blue-500 font-medium shadow-xs"
                    />
                    {memberSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setMemberSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {memberSearchQuery.trim().length > 0 && (
                    <div className="p-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-h-56 overflow-y-auto space-y-1 z-30 relative">
                      {matchingSearchMembers.length > 0 ? (
                        matchingSearchMembers.map((m: Member) => {
                          const meta = getMemberSubscriptionMeta(m);

                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                if (meta.isSuspended) {
                                  toast.error(`Member "${m.full_name}" is currently Suspended/Inactive.`);
                                  return;
                                }
                                if (meta.hasTwoSubs) {
                                  toast.error(`Member "${m.full_name}" already has two active/queued subscriptions.`);
                                  return;
                                }
                                if (meta.isOver30Days) {
                                  toast.warning(`Member "${m.full_name}" active plan has ${meta.remainingDays} days left. Renewals only allowed within 30 days.`);
                                }
                                handleSelectExistingMember(m);
                                setMemberSearchQuery('');
                              }}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                meta.isSuspended
                                  ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 opacity-70'
                                  : meta.isBlockedFromRenewing
                                  ? 'bg-slate-50 dark:bg-zinc-950 border-amber-300/40 hover:border-amber-400'
                                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:border-blue-500/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                                  meta.isSuspended
                                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                                    : 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                }`}>
                                  {m.full_name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-slate-900 dark:text-white truncate block uppercase">
                                      {m.full_name}
                                    </span>
                                    {meta.isSuspended && (
                                      <span className="text-[8px] font-mono font-bold bg-rose-500/20 text-rose-600 px-1.5 py-0.2 rounded">
                                        SUSPENDED
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">
                                    {m.member_id} • {m.phone || 'No Phone'}
                                    {meta.activeSub && ` • Active: ${meta.activeSub.plan_name} (${meta.remainingDays}d left)`}
                                    {meta.queuedSub && ` • Queued Renewal: ${meta.queuedSub.plan_name}`}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0">
                                <span className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider border ${
                                  meta.isSuspended
                                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                    : meta.hasTwoSubs
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    : meta.isWithin30Days && meta.activeSub
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                }`}>
                                  {meta.isSuspended ? 'Suspended' : meta.isWithin30Days && meta.activeSub ? 'Renew Extension' : 'Select Profile'}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-500 font-mono">
                          No existing profiles match "{memberSearchQuery}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedExistingMember && (
                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl text-blue-900 dark:text-blue-300 text-[10px] font-bold flex items-center justify-between gap-2 shadow-xs animate-fade-in">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <span className="font-heading text-xs text-slate-900 dark:text-white uppercase block">
                        Enrolling Existing Member: {selectedExistingMember.full_name}
                      </span>
                      <span className="text-[9px] font-mono text-slate-600 dark:text-slate-300">
                        ID: {selectedExistingMember.member_id} • Phone: {selectedExistingMember.phone || 'N/A'}
                      </span>
                    </div>
                  </div>
                  {!prefillMember && (
                    <button
                      type="button"
                      onClick={handleClearSelectedExistingMember}
                      className="px-2.5 py-1 bg-blue-100 dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30 text-blue-800 dark:text-blue-300 rounded-lg text-[9px] uppercase font-bold tracking-wider cursor-pointer border border-blue-300 dark:border-blue-400/30"
                    >
                      Clear / Change Profile
                    </button>
                  )}
                </div>
              )}

              {shouldShowDetailsForm && (
                <div className="space-y-4 animate-fade-in pt-1">
                  
                  {/* Status Banner */}
                  <div className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2 ${
                    applicantStatusSummary.level === 'red'
                      ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/30 text-rose-900 dark:text-rose-300'
                      : applicantStatusSummary.level === 'amber'
                      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300'
                      : applicantStatusSummary.level === 'blue'
                      ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-900 dark:text-blue-300'
                      : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {applicantStatusSummary.level === 'red' ? (
                          <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        ) : applicantStatusSummary.level === 'amber' ? (
                          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        ) : applicantStatusSummary.level === 'blue' ? (
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        )}

                        <div className="space-y-0.5">
                          <h4 className="font-heading text-xs uppercase tracking-wider font-bold text-slate-900 dark:text-white">
                            {applicantStatusSummary.title}
                          </h4>
                          <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed">
                            {applicantStatusSummary.description}
                          </p>
                        </div>
                      </div>

                      {applicantStatusSummary.actionMember && (
                        <button
                          type="button"
                          onClick={() => handleSelectExistingMember(applicantStatusSummary.actionMember!)}
                          className="px-3 py-1.5 rounded-xl text-[9px] font-heading font-bold uppercase tracking-wider cursor-pointer border-none shadow-xs shrink-0 transition-colors bg-amber-500 hover:bg-amber-400 text-slate-950"
                        >
                          Attach Member
                        </button>
                      )}
                    </div>

                    {applicantStatusSummary.notices.length > 1 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 select-none">
                        <button
                          type="button"
                          onClick={() => setShowStatusDetails(!showStatusDetails)}
                          className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer text-slate-700 dark:text-slate-300"
                        >
                          <span>{showStatusDetails ? 'Hide Status Details' : 'View Status Details'}</span>
                          {showStatusDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {showStatusDetails && (
                          <div className="mt-2 space-y-1 text-[9px] font-mono">
                            {applicantStatusSummary.notices.map((n, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                                <span>{n.type === 'warning' ? '⚠' : n.type === 'info' ? 'ℹ' : '✓'}</span>
                                <span>{n.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Input Fields Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                    <div className="md:col-span-2 border-b border-slate-200 dark:border-white/10 pb-1 select-none">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Personal Details</span>
                    </div>

                    {/* Last Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        value={lastName} 
                        disabled={isNameLocked}
                        onChange={e => {
                          setLastName(e.target.value);
                          if (errors.lastName) setErrors(prev => ({ ...prev, lastName: '' }));
                        }} 
                        className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                          isMissing(lastName) || errors.lastName 
                            ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400' 
                            : isNameLocked
                            ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                            : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                        }`} 
                        placeholder="e.g. Angeles" 
                      />
                      {errors.lastName && <span className="text-[9px] text-red-500 font-bold block">{errors.lastName}</span>}
                    </div>

                    {/* First Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        value={firstName} 
                        disabled={isNameLocked}
                        onChange={e => {
                          setFirstName(e.target.value);
                          if (errors.firstName) setErrors(prev => ({ ...prev, firstName: '' }));
                        }} 
                        className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                          isMissing(firstName) || errors.firstName 
                            ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400' 
                            : isNameLocked
                            ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                            : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                        }`} 
                        placeholder="e.g. Adrian" 
                      />
                      {errors.firstName && <span className="text-[9px] text-red-500 font-bold block">{errors.firstName}</span>}
                    </div>

                    {/* Middle Initial & Suffix */}
                    <div className="grid grid-cols-2 gap-2 col-span-1">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">M.I.</label>
                        <input 
                          type="text" 
                          value={middleInitials} 
                          disabled={isNameLocked}
                          onChange={e => setMiddleInitials(e.target.value)} 
                          maxLength={2}
                          className={`w-full p-2.5 rounded-xl text-xs outline-none ${
                            isNameLocked
                              ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                              : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                          }`} 
                          placeholder="R." 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">Suffix</label>
                        <input 
                          type="text" 
                          value={suffix} 
                          disabled={isNameLocked}
                          onChange={e => setSuffix(e.target.value)} 
                          className={`w-full p-2.5 rounded-xl text-xs outline-none ${
                            isNameLocked
                              ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                              : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                          }`} 
                          placeholder="e.g. Jr." 
                        />
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                        <span>Contact Phone <span className="text-red-500">*</span></span>
                        {isMissing(phone) && (
                          <span className="text-[8px] text-red-500 font-bold uppercase animate-pulse">⚠️ Missing Phone</span>
                        )}
                      </label>
                      <input 
                        type="text" 
                        value={phone} 
                        disabled={isPhoneLocked}
                        maxLength={11}
                        onChange={e => {
                          setPhone(e.target.value.replace(/\D/g, ''));
                          if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
                        }} 
                        className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                          isMissing(phone) || errors.phone 
                            ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400 placeholder:text-red-400/60' 
                            : isPhoneLocked
                            ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                            : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                        }`} 
                        placeholder="0917XXXXXXX" 
                      />
                      
                      {phoneMatchMember && !selectedExistingMember && (
                        <div className="flex items-center justify-between text-[9px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                          <span className="flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Already used by {phoneMatchMember.full_name} ({phoneMatchMember.member_id})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectExistingMember(phoneMatchMember)}
                            className="text-amber-700 dark:text-amber-300 underline font-bold hover:text-amber-600 cursor-pointer ml-2"
                          >
                            Attach
                          </button>
                        </div>
                      )}

                      {errors.phone && <span className="text-[9px] text-red-500 font-bold block">{errors.phone}</span>}
                    </div>

                    {/* Gender */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">Gender *</label>
                      <select 
                        value={gender} 
                        disabled={isNameLocked}
                        onChange={e => setGender(e.target.value)} 
                        className={`w-full p-2.5 rounded-xl text-xs outline-none ${
                          isNameLocked
                            ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                            : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white cursor-pointer'
                        }`}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-Binary">Non-Binary</option>
                      </select>
                    </div>

                    {/* Birthday */}
                    <div className="grid grid-cols-2 gap-2 col-span-1">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                          <span>Birthday *</span>
                          {isMissing(birthday) && (
                            <span className="text-[8px] text-red-500 font-bold uppercase animate-pulse">⚠️ Missing Birthday</span>
                          )}
                        </label>
                        <input 
                          type="date" 
                          value={birthday} 
                          disabled={isBirthdayLocked}
                          onChange={e => {
                            setBirthday(e.target.value);
                            if (errors.birthday) setErrors(prev => ({ ...prev, birthday: '' }));
                          }} 
                          className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                            isMissing(birthday) || errors.birthday 
                              ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400' 
                              : isBirthdayLocked
                              ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                              : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                          }`} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">Age Status</label>
                        <input 
                          type="text" 
                          value={birthday ? `${calculatedAge} yrs (${isRestrictedUnder12 ? 'Restricted' : isMinor ? 'Minor' : 'Adult'})` : '--'} 
                          disabled 
                          className={`w-full p-2.5 border rounded-xl text-xs font-mono font-bold outline-none cursor-not-allowed ${
                            isRestrictedUnder12 ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-500' :
                            isMinor ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-500' : 'bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-slate-300'
                          }`} 
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                        Home Address <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input 
                        type="text" 
                        value={address} 
                        disabled={isAddressLocked}
                        onChange={e => setAddress(e.target.value)} 
                        className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                          isAddressLocked
                            ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                            : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                        }`} 
                        placeholder="Barangay, City, Province (optional)" 
                      />
                    </div>

                    {/* ─── 1. ADULT SECTION (18+) ─── */}
                    {!isMinor && (
                      <>
                        <div className="md:col-span-2 border-b border-slate-200 dark:border-white/10 pb-1 mt-2 select-none">
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            Emergency Contact <span className="text-slate-400 font-normal">(optional for 18+)</span>
                          </span>
                        </div>

                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                            Emergency Contact Name <span className="text-slate-400 font-normal">(optional)</span>
                          </label>
                          <input 
                            type="text" 
                            value={emergencyName} 
                            disabled={isEmergencyNameLocked}
                            onChange={e => setEmergencyName(e.target.value)} 
                            className="w-full p-2.5 rounded-xl text-xs outline-none border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white"
                            placeholder="Contact person's full name" 
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                            Relationship <span className="text-slate-400 font-normal">(optional)</span>
                          </label>
                          <select 
                            value={relationship} 
                            disabled={isRelationshipLocked}
                            onChange={e => setRelationship(e.target.value)} 
                            className="w-full p-2.5 rounded-xl text-xs outline-none font-medium border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white cursor-pointer"
                          >
                            <option value="">Select Relationship (optional)</option>
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Spouse / Partner">Spouse / Partner</option>
                            <option value="Brother">Brother</option>
                            <option value="Sister">Sister</option>
                            <option value="Friend">Friend</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                            Emergency Phone <span className="text-slate-400 font-normal">(optional)</span>
                          </label>
                          <input 
                            type="text" 
                            maxLength={11}
                            value={emergencyPhone} 
                            disabled={isEmergencyPhoneLocked}
                            onChange={e => setEmergencyPhone(e.target.value.replace(/\D/g, ''))}
                            className="w-full p-2.5 rounded-xl text-xs outline-none border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white" 
                            placeholder="0918XXXXXXX" 
                          />
                        </div>
                      </>
                    )}

                    {/* ─── 2. MINOR SECTION (12–17 YRS) ─── */}
                    {isMinor && (
                      <>
                        <div className="md:col-span-2 border-b border-slate-200 dark:border-white/10 pb-1 mt-2 select-none">
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            Parent / Legal Guardian Details <span className="text-red-500">*</span>
                          </span>
                        </div>

                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                            Parent / Legal Guardian Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={parentName}
                            onChange={(e) => {
                              setParentName(e.target.value);
                              if (sameAsParent) setEmergencyName(e.target.value);
                              if (errors.parentName) setErrors(prev => ({ ...prev, parentName: '' }));
                            }}
                            className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                              errors.parentName
                                ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                            }`}
                            placeholder="Parent or legal guardian's full name"
                          />
                          {errors.parentName && <span className="text-[9px] text-red-500 font-bold block">{errors.parentName}</span>}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                            Relationship to Minor <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={parentRelationship}
                            onChange={(e) => {
                              setParentRelationship(e.target.value);
                              if (sameAsParent) setRelationship(e.target.value);
                              if (errors.parentRelationship) setErrors(prev => ({ ...prev, parentRelationship: '' }));
                            }}
                            className="w-full p-2.5 rounded-xl text-xs outline-none font-medium border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white cursor-pointer"
                          >
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Legal Guardian">Legal Guardian</option>
                            <option value="Other">Other</option>
                          </select>
                          {errors.parentRelationship && <span className="text-[9px] text-red-500 font-bold block">{errors.parentRelationship}</span>}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                            Parent Phone Number <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            maxLength={11}
                            value={parentPhone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setParentPhone(val);
                              if (sameAsParent) setEmergencyPhone(val);
                              if (errors.parentPhone) setErrors(prev => ({ ...prev, parentPhone: '' }));
                            }}
                            className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                              errors.parentPhone
                                ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                            }`}
                            placeholder="0918XXXXXXX"
                          />
                          {errors.parentPhone && <span className="text-[9px] text-red-500 font-bold block">{errors.parentPhone}</span>}
                        </div>

                        <div className="md:col-span-2 p-2.5 bg-slate-100 dark:bg-zinc-800/60 rounded-xl border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                            <input
                              type="checkbox"
                              checked={sameAsParent}
                              onChange={(e) => {
                                setSameAsParent(e.target.checked);
                                if (e.target.checked) {
                                  setEmergencyName(parentName);
                                  setRelationship(parentRelationship);
                                  setEmergencyPhone(parentPhone);
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600 cursor-pointer"
                            />
                            <span>Use Parent / Legal Guardian as Primary Emergency Contact</span>
                          </label>
                        </div>

                        {!sameAsParent && (
                          <>
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                                Alternate Emergency Contact Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={emergencyName}
                                onChange={(e) => setEmergencyName(e.target.value)}
                                className="w-full p-2.5 rounded-xl text-xs outline-none border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white"
                                placeholder="Alternate contact name"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                                Relationship <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={relationship}
                                onChange={(e) => setRelationship(e.target.value)}
                                className="w-full p-2.5 rounded-xl text-xs outline-none border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white"
                                placeholder="e.g. Aunt, Grandparent"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">
                                Emergency Phone <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                maxLength={11}
                                value={emergencyPhone}
                                onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, ''))}
                                className="w-full p-2.5 rounded-xl text-xs outline-none border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white"
                                placeholder="0918XXXXXXX"
                              />
                            </div>
                          </>
                        )}

                        {/* Minor Signatures */}
                        <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-white/10 space-y-3">
                          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200">
                            <FileSignature className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider">Required Minor Consent</p>
                              <p className="text-[10px] leading-relaxed mt-0.5">
                                Both applicant and parent/guardian must sign before registration can proceed.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <SignaturePad
                              label="Applicant Signature *"
                              value={applicantSig}
                              onChange={(sig) => {
                                setApplicantSig(sig);
                                if (errors.applicantSig) setErrors(prev => ({ ...prev, applicantSig: '' }));
                              }}
                              error={errors.applicantSig}
                            />
                            <SignaturePad
                              label="Parent / Guardian Signature *"
                              value={parentSig}
                              onChange={(sig) => {
                                setParentSig(sig);
                                if (errors.parentSig) setErrors(prev => ({ ...prev, parentSig: '' }));
                              }}
                              error={errors.parentSig}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Waiver & Guardian Responsibility Checkbox */}
                    <div className="md:col-span-2 pt-2 border-t border-slate-200 dark:border-white/10">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={waiverAgreed} 
                          onChange={e => {
                            setWaiverAgreed(e.target.checked);
                            if (errors.waiverAgreed) setErrors(prev => ({ ...prev, waiverAgreed: '' }));
                          }} 
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-blue-600 accent-blue-600 cursor-pointer shrink-0" 
                        />
                        <span className="text-[10px] text-slate-700 dark:text-slate-300 font-medium leading-tight">
                          {isMinor ? (
                            <>
                              I certify that I am the lawful parent/legal guardian, all information is true and correct, and I voluntarily grant permission for this minor to enroll and use the facility, accepting full responsibility for their safety, compliance, and conduct under the{' '}
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreementDocument('terms'); }} className="text-blue-700 dark:text-red-400 underline font-bold cursor-pointer">
                                Terms &amp; Conditions
                              </button>{' '}
                              and{' '}
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreementDocument('privacy'); }} className="text-blue-700 dark:text-red-400 underline font-bold cursor-pointer">
                                Privacy Policy
                              </button>. *
                            </>
                          ) : (
                            <>
                              I certify that all information provided is accurate and that the member agrees to abide by the{' '}
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreementDocument('terms'); }} className="text-blue-700 dark:text-red-400 underline font-bold cursor-pointer">
                                Terms &amp; Conditions
                              </button>{' '}
                              and{' '}
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreementDocument('privacy'); }} className="text-blue-700 dark:text-red-400 underline font-bold cursor-pointer">
                                Privacy Policy
                              </button>. *
                            </>
                          )}
                        </span>
                      </label>
                      {errors.waiverAgreed && <span className="text-[9px] text-red-500 font-bold block mt-1">{errors.waiverAgreed}</span>}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          <AgreementDocumentViewer isOpen={agreementDocument !== null} onClose={() => setAgreementDocument(null)} initialDocument={agreementDocument || 'terms'} />

          {/* STEP 2: CHECKOUT INVOICE & MEMBERSHIP PLAN SELECTION */}
          {step === 2 && (
            <div className="p-4 sm:p-5 bg-slate-100/90 dark:bg-zinc-900/80 rounded-2xl border border-slate-200 dark:border-zinc-800 text-left space-y-5 animate-fade-in">
              <div className="border-b border-slate-200 dark:border-zinc-800 pb-3 space-y-3">
                <div className="flex justify-between items-center select-none font-bold">
                  <div className="flex items-center gap-2">
                    <h4 className="font-heading text-xs tracking-wider uppercase text-slate-900 dark:text-white">Checkout Invoice & Profile Audit</h4>
                    {isMinor ? (
                      <span className="text-[9px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                        MINOR ({calculatedAge} YRS)
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        ADULT ({calculatedAge} YRS)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-start pt-1">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Client Name</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white block mt-0.5">{getCombinedFullName()}</span>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Client Contact</span>
                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-white block mt-0.5">{phone || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Membership Plan Options */}
              <div className="space-y-1.5">
                <span className="text-slate-500 dark:text-slate-400 uppercase text-[9px] font-bold tracking-wider block">Select Membership Option</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div 
                    onClick={() => { if (!isPlanLocked) setSelectedPlan('Monthly Membership'); }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'Monthly Membership' 
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-bold shadow-md shadow-emerald-500/5' 
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">Monthly Plan</span>
                    <span className="font-mono text-sm font-black block mt-1">₱{settings.monthly_plan_price.toLocaleString()}</span>
                  </div>

                  <div 
                    onClick={() => { if (!isPlanLocked) setSelectedPlan('Yearly Membership'); }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'Yearly Membership' 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 font-bold shadow-md shadow-blue-500/5' 
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">Yearly Plan</span>
                    <span className="font-mono text-sm font-black block mt-1">₱{settings.yearly_plan_price.toLocaleString()}</span>
                  </div>

                  <div 
                    onClick={() => { if (!isPlanLocked) setSelectedPlan('No Subscription'); }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'No Subscription' 
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 font-bold shadow-md shadow-amber-500/5' 
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">No Subscription</span>
                    <span className="font-mono text-sm font-black block mt-1">₱0 (Profile Only)</span>
                  </div>
                </div>
              </div>

              {/* PAYMENT METHOD GATEWAY */}
              {selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <span className="text-slate-500 dark:text-slate-400 uppercase text-[9px] font-bold tracking-wider block">
                    Select Payment Gateway
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Cash Option */}
                    <div 
                      onClick={() => setPaymentMethod('Cash')} 
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-center flex items-center justify-center gap-2 ${
                        paymentMethod === 'Cash' 
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-bold shadow-xs' 
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-sm">💰</span>
                      <span className="text-xs font-bold uppercase">Cash</span>
                    </div>

                    {/* GCash Option */}
                    <div 
                      onClick={() => setPaymentMethod('GCash')} 
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-center flex items-center justify-center gap-2 ${
                        paymentMethod === 'GCash' 
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-bold shadow-xs' 
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-sm">📱</span>
                      <span className="text-xs font-bold uppercase">GCash</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription Terms & Privacy Agreement Checkbox */}
              {selectedPlan !== 'No Subscription' && (
                <div className="pt-3 border-t border-slate-200 dark:border-zinc-800">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={subscriptionAgreement} 
                      onChange={(e) => {
                        setSubscriptionAgreement(e.target.checked);
                        if (errors.subscriptionAgreement) {
                          setErrors(prev => ({ ...prev, subscriptionAgreement: '' }));
                        }
                      }} 
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-blue-600 accent-blue-600 cursor-pointer shrink-0" 
                    />
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 font-medium leading-tight">
                      I verify that payment has been received and the member agrees to strictly obey and follow all gym rules, facility regulations, and policies stated in the{' '}
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreementDocument('terms'); }} 
                        className="text-blue-700 dark:text-blue-400 underline font-bold cursor-pointer"
                      >
                        Terms &amp; Conditions
                      </button>{' '}
                      and{' '}
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreementDocument('privacy'); }} 
                        className="text-blue-700 dark:text-blue-400 underline font-bold cursor-pointer"
                      >
                        Privacy Policy
                      </button>. *
                    </span>
                  </label>
                  {errors.subscriptionAgreement && (
                    <span className="text-[9px] text-red-500 font-bold block mt-1">
                      {errors.subscriptionAgreement}
                    </span>
                  )}
                </div>
              )}

              {/* GCash Reference */}
              {paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800 text-xs font-semibold animate-fade-in">
                  <label className={`uppercase text-[9px] font-bold ${isGcashValid ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isGcashValid ? '✓ GCash Reference Code Validated' : 'GCash Transaction Reference No. *'}
                  </label>
                  <input 
                    type="text" 
                    maxLength={13}
                    value={gcashReference} 
                    onChange={e => setGcashReference(e.target.value.replace(/\D/g, ''))} 
                    placeholder="Enter 10 to 13-digit Reference Code" 
                    className={`w-full p-2.5 border rounded-xl outline-none font-mono text-xs ${
                      isGcashValid ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300' : 'border-slate-300 dark:border-rose-500/50 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white'
                    }`} 
                  />
                </div>
              )}

              {/* Printed ID Option */}
              <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between select-none font-semibold">
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-200 block">Add Membership Card for Entry (3 Years Expiry)</span>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">A membership card for check-in.</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={addIdCard} 
                    onChange={e => setAddIdCard(e.target.checked)} 
                    className="w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-blue-600 accent-blue-600 cursor-pointer" 
                  />
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Add Card (+₱{cardFee})</span>
                </label>
              </div>

              {/* Fee Breakdown (Only shown when Total Price > 0) */}
              {totalPrice > 0 && (
                <div className="border-t border-dashed border-slate-300 dark:border-zinc-800 pt-3 space-y-1 font-mono text-xs">
                  {planBasePrice > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Plan Base Price:</span>
                      <span className="text-slate-900 dark:text-slate-200">₱{planBasePrice.toLocaleString()}.00</span>
                    </div>
                  )}
                  {paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                      <span>GCash Fee:</span>
                      <span>+₱{gcashFee}.00</span>
                    </div>
                  )}
                  {addIdCard && (
                    <div className="flex justify-between text-blue-700 dark:text-blue-400 font-bold">
                      <span>Card Printing Fee:</span>
                      <span>+₱{cardFee}.00</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-zinc-800">
                    <span>Invoice Total:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 text-base">₱{totalPrice.toLocaleString()}.00</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: ENROLLMENT COMPLETE */}
          {step === 3 && finishedIds && (
            <div className="py-2 space-y-4 animate-scale-up">
              <div className="text-center space-y-1">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <h4 className="font-heading text-sm tracking-wider text-emerald-600 dark:text-emerald-400 uppercase leading-none font-bold">
                  {selectedPlan === 'No Subscription' && !addIdCard ? 'Profile Saved Successfully' : 'Intake Successful'}
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-[10px] font-medium leading-none">
                  {selectedPlan === 'No Subscription' && !addIdCard
                    ? 'Member profile registered and verified in database without an active subscription.'
                    : 'The member subscription and payment have been verified and recorded.'}
                </p>
              </div>

              {/* Render Receipt ONLY for paid plans / paid card issuance */}
              {(selectedPlan !== 'No Subscription' || addIdCard) ? (
                <div className="w-full flex justify-center pt-2">
                  <OfficialReceipt
                    ref={receiptRef}
                    variant="inline"
                    data={{
                      receiptType: 'subscription',
                      receiptNo: finishedIds.receipt_no,
                      customerName: getCombinedFullName(),
                      planType: selectedPlan,
                      basePrice: planBasePrice,
                      gcashFee: appliedGcashFee,
                      cardFee: appliedCardFee,
                      paymentMethod: paymentMethod,
                      gcashRefNo: gcashReference,
                      transactionDate: finishedIds.transaction_date,
                      processedBy: 'WOLF PALOMAR STAFF',
                      qrValue: finishedIds.receipt_no
                    }}
                  />
                </div>
              ) : (
                /* Clean Summary Card for Profile-Only */
                <div className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-center space-y-2 max-w-sm mx-auto shadow-sm">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Member Profile Created</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white block">{getCombinedFullName()}</span>
                  </div>
                  <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Assigned Member ID</span>
                    <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400 block mt-0.5">{finishedIds.member_id}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">No subscription invoice generated for this profile.</p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* PINNED FOOTER BAR */}
        <div className="p-4 sm:px-6 border-t border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-[#12141a] flex justify-between items-center shrink-0 select-none">
          {step < 3 ? (
            <>
              <button 
                type="button"
                disabled={step === 1 || isSubmitting} 
                onClick={handleBack} 
                className="px-4 py-2.5 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer disabled:opacity-40 disabled:pointer-events-none transition-colors bg-white dark:bg-transparent flex items-center gap-1.5"
              >
                {step === 2 ? (
                  <>
                    <ChevronLeft className="w-4 h-4 text-blue-500" />
                    <span>Edit Information</span>
                  </>
                ) : (
                  'Back'
                )}
              </button>
              
              {step === 2 ? (
                <button 
                  type="button"
                  onClick={handleExecuteCheckout} 
                  disabled={isConfirmDisabled || isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none shadow-md shadow-emerald-500/10 transition-all flex items-center gap-2 justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>{selectedPlan === 'No Subscription' ? 'Saving...' : 'Processing...'}</span>
                    </>
                  ) : (
                    <span>{selectedPlan === 'No Subscription' ? 'Save Profile' : 'Confirm Checkout'}</span>
                  )}
                </button>
              ) : step === 1 && intakeMode === 'Manual' ? (
                <button 
                  type="button"
                  onClick={handleStep1Next} 
                  className="px-6 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:bg-[#0c2950] dark:hover:bg-[#9c0202] text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none shadow-md transition-all"
                >
                  Next
                </button>
              ) : (
                <div />
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-between gap-3">
              {(selectedPlan !== 'No Subscription' || addIdCard) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => receiptRef.current?.handleDownloadJpg()}
                    className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-zinc-700 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-500" />
                    <span>Download Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => receiptRef.current?.handlePrint()}
                    className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-zinc-700 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Print Receipt</span>
                  </button>
                </div>
              ) : (
                <div />
              )}

              <button 
                type="button"
                onClick={() => {
                  handleModalClose();
                  onComplete?.();
                }} 
                className="px-6 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:bg-[#0c2950] dark:hover:bg-[#9c0202] text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none shadow-md transition-all"
              >
                Close
              </button>
            </div>
          )}
        </div>

      </form>
    </div>,
    document.body
  );
};

export interface StaffPlansConsoleProps {
  onOnboardingSuccess?: () => void;
}

export const StaffPlansConsole: React.FC<StaffPlansConsoleProps> = ({ onOnboardingSuccess }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    mode: 'Import' | 'Manual' | null;
    plan: 'Monthly Membership' | 'Yearly Membership' | 'No Subscription' | null;
    step?: number;
    prefillData?: OnlineRegistration;
  }>({ isOpen: false, mode: null, plan: null });

  useEffect(() => {
    if (location.state?.openWizard) {
      setModalConfig({
        isOpen: true,
        mode: location.state.initialIntakeMode || 'Manual',
        plan: location.state.initialPlan || 'Monthly Membership',
        step: location.state.initialStep ?? 1,
        prefillData: location.state.prefillData
      });
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [settings, setSettings] = useState<MembershipSettings>(DEFAULT_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState<boolean>(false);

  const fetchSettings = async () => {
    setIsLoadingSettings(true);
    setSettingsError(null);
    try {
      const data = await settingsService.load();
      if (data) {
        setSettings(data);
        setIsUsingFallback(false);
      } else {
        setSettings(DEFAULT_SETTINGS);
        setIsUsingFallback(true);
      }
    } catch (err: any) {
      console.warn("Error fetching Supabase pricing settings:", err);
      setSettings(DEFAULT_SETTINGS);
      setSettingsError("Supabase pricing rates unavailable. Displaying standard fallback pricing.");
      setIsUsingFallback(true);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const isMonthlyValid = 
    !isLoadingSettings && 
    !settingsError && 
    typeof settings?.monthly_plan_price === 'number' && 
    settings.monthly_plan_price > 0;

  const isYearlyValid = 
    !isLoadingSettings && 
    !settingsError && 
    typeof settings?.yearly_plan_price === 'number' && 
    settings.yearly_plan_price > 0;

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <div className="relative space-y-6">
      
      {/* DESKTOP LEFT SIDE VERTICAL ARROW */}
      <div className="hidden lg:block">
        <AnimatePresence>
          <motion.button
            key="left-arrow-plans"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 0.9, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            whileHover={{ scale: 1.05, opacity: 1 }}
            onClick={() => navigate('/members/list')}
            title="View Member Directory"
            className="group fixed left-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-r border-(--border-color) py-6 px-3.5 rounded-r-3xl shadow-2xl cursor-pointer flex flex-col items-center gap-3.5 z-45 transition-all hover:border-(--color-primary-light)/50 hover:bg-(--bg-card)"
          >
            <motion.div 
              animate={{ x: [0, -4, 0] }} 
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <ChevronLeft className="w-5 h-5 text-(--color-primary-light)" />
            </motion.div>
            <span className="[writing-mode:vertical-rl] rotate-180 font-heading text-xs font-black tracking-widest uppercase text-slate-400 group-hover:text-(--color-primary-light) transition-colors select-none">
              MEMBERS
            </span>
          </motion.button>
        </AnimatePresence>
      </div>

      {/* SUPABASE CONNECTION FALLBACK ALERT BANNER */}
      <AnimatePresence>
        {(settingsError || isUsingFallback) && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="p-4 rounded-3xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300 max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg backdrop-blur-md"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 shrink-0">
                <WifiOff className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h5 className="font-heading text-xs uppercase tracking-wider font-bold text-slate-900 dark:text-white">
                    Supabase Rates Offline / Fallback Active
                  </h5>
                  <span className="text-[8px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-800 dark:text-amber-300">
                    Default Pricing
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mt-0.5 leading-tight">
                  Unable to sync live subscription rates from Supabase. Default fallback pricing is active for intake operations.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchSettings}
              disabled={isLoadingSettings}
              className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-heading text-[9px] font-bold uppercase tracking-wider rounded-xl transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSettings ? 'animate-spin' : ''}`} />
              <span>{isLoadingSettings ? 'Syncing...' : 'Retry Sync'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHOICE 1: SCAN LOBBY QR / SEARCH PRE-REGISTRATION */}
      <motion.div 
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.2 }}
        onClick={() => { 
          setModalConfig({ isOpen: true, mode: 'Import', plan: 'Monthly Membership' });
        }}
        className="p-5 rounded-3xl bg-linear-to-r from-blue-50 to-slate-100 dark:from-blue-900/30 dark:to-slate-900/40 border border-blue-200 dark:border-blue-500/30 hover:border-blue-400 transition-all cursor-pointer flex items-center justify-between shadow-lg max-w-2xl mx-auto select-none"
      >
        <div className="flex items-center gap-4 text-left">
          <div className="p-3 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/30 shrink-0">
            <Smartphone className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest leading-none block">Intake Choice 1</span>
            <h4 className="font-heading text-base text-slate-900 dark:text-white uppercase leading-none font-bold">Scan Lobby QR / Search Pre-Registration</h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold leading-tight">
              Retrieve client pre-registration profiles via live QR scanner or Registration ID search.
            </p>
          </div>
        </div>
        <button className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none shrink-0 cursor-pointer shadow-md">
          Scan Lobby QR
        </button>
      </motion.div>

      {/* CHOICE 2: MANUAL PLAN CATALOG */}
      {isLoadingSettings ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none max-w-2xl mx-auto pt-2">
          {[1, 2].map((idx) => (
            <div 
              key={idx} 
              className="p-6 rounded-3xl bg-(--bg-card) border border-(--border-color) animate-pulse flex flex-col justify-between h-64 shadow-md text-left"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-3 w-32 bg-slate-300 dark:bg-zinc-800 rounded-md" />
                  <div className="h-5 w-5 bg-slate-300 dark:bg-zinc-800 rounded-full" />
                </div>
                <div className="h-6 w-48 bg-slate-300 dark:bg-zinc-800 rounded-lg" />
                <div className="space-y-1.5 pt-1">
                  <div className="h-3 w-full bg-slate-300 dark:bg-zinc-800 rounded" />
                  <div className="h-3 w-4/5 bg-slate-300 dark:bg-zinc-800 rounded" />
                  <div className="h-3 w-2/3 bg-slate-300 dark:bg-zinc-800 rounded" />
                </div>
              </div>
              <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
                <div className="h-8 w-24 bg-slate-300 dark:bg-zinc-800 rounded-lg" />
                <div className="h-9 w-28 bg-slate-300 dark:bg-zinc-800 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none max-w-2xl mx-auto pt-2 text-left">
          {/* MONTHLY PLAN CARD */}
          <motion.div 
            whileHover={isMonthlyValid ? { scale: 1.01 } : {}}
            transition={{ duration: 0.2 }}
            onClick={() => { 
              if (isMonthlyValid) {
                setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Monthly Membership' });
              }
            }}
            className={`p-6 rounded-3xl bg-(--bg-card) border transition-all flex flex-col justify-between h-64 shadow-md relative overflow-hidden ${
              isMonthlyValid 
                ? 'border-(--border-color) hover:border-emerald-500/40 cursor-pointer' 
                : 'border-rose-500/30 bg-rose-500/5 cursor-not-allowed opacity-75 select-none'
            }`}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Intake Choice 2 • Standard Plan</span>
                <Award className={`w-5 h-5 ${isMonthlyValid ? 'text-emerald-500' : 'text-slate-400'}`} />
              </div>
              
              <div className="flex items-center justify-between">
                <h4 className="font-heading text-lg text-slate-900 dark:text-white uppercase leading-none">Monthly Membership</h4>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold leading-relaxed">
                Provides unlimited facility access with standard lobby card scanning. Daily entry fee is calculated as ₱0 per check-in visit.
              </p>
            </div>

            <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
              <span className={`text-2xl font-mono font-black ${isMonthlyValid ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-400 dark:text-zinc-500'}`}>
                {isMonthlyValid ? `₱${settings.monthly_plan_price.toLocaleString()}` : '₱ --'}
              </span>
              
              <button 
                type="button"
                disabled={!isMonthlyValid}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMonthlyValid) {
                    setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Monthly Membership' });
                  }
                }}
                className="py-2.5 px-5 bg-[#123c73] dark:bg-[#bf0202] disabled:bg-slate-300 dark:disabled:bg-zinc-800 disabled:text-slate-500 dark:disabled:text-zinc-500 text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none hover:bg-[#0c2950] dark:hover:bg-[#9c0202] transition-colors shadow-md"
              >
                {isMonthlyValid ? 'Select Monthly' : 'Unavailable'}
              </button>
            </div>
          </motion.div>

          {/* YEARLY PLAN CARD */}
          <motion.div 
            whileHover={isYearlyValid ? { scale: 1.01 } : {}}
            transition={{ duration: 0.2 }}
            onClick={() => { 
              if (isYearlyValid) {
                setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Yearly Membership' });
              }
            }}
            className={`p-6 rounded-3xl bg-(--bg-card) border transition-all flex flex-col justify-between h-64 shadow-md relative overflow-hidden ${
              isYearlyValid 
                ? 'border-(--border-color) hover:border-blue-500/40 cursor-pointer' 
                : 'border-rose-500/30 bg-rose-500/5 cursor-not-allowed opacity-75 select-none'
            }`}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Intake Choice 2 • Discount Plan</span>
                <Award className={`w-5 h-5 ${isYearlyValid ? 'text-blue-500' : 'text-slate-400'}`} />
              </div>

              <div className="flex items-center justify-between">
                <h4 className="font-heading text-lg text-slate-900 dark:text-white uppercase leading-none">Yearly Membership</h4>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold leading-relaxed">
                Enables discounted facility access key card. Walk-in daily rates are reduced to ₱{isYearlyValid ? settings.yearly_member_checkin_fee.toLocaleString() : '--'} per visit.
              </p>
            </div>

            <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
              <span className={`text-2xl font-mono font-black ${isYearlyValid ? 'text-blue-600 dark:text-blue-500' : 'text-slate-400 dark:text-zinc-500'}`}>
                {isYearlyValid ? `₱${settings.yearly_plan_price.toLocaleString()}` : '₱ --'}
              </span>
              
              <button 
                type="button"
                disabled={!isYearlyValid}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isYearlyValid) {
                    setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Yearly Membership' });
                  }
                }}
                className="py-2.5 px-5 bg-[#123c73] dark:bg-[#bf0202] disabled:bg-slate-300 dark:disabled:bg-zinc-800 disabled:text-slate-500 dark:disabled:text-zinc-500 text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none hover:bg-[#0c2950] dark:hover:bg-[#9c0202] transition-colors shadow-md"
              >
                {isYearlyValid ? 'Select Yearly' : 'Unavailable'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <IntakeWizardModal
        isOpen={modalConfig.isOpen}
        initialIntakeMode={modalConfig.mode}
        initialPlan={modalConfig.plan}
        initialStep={modalConfig.step}
        prefillData={modalConfig.prefillData}
        onClose={() => setModalConfig({ isOpen: false, mode: null, plan: null })}
        onComplete={() => {
          setModalConfig({ isOpen: false, mode: null, plan: null });
          onOnboardingSuccess?.();
        }}
      />
    </div>
  );
};
