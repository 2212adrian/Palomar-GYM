// src/pages/members/components/SubscriptionPlan.tsx
import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award,
  Smartphone,
  CheckCircle,
  X,
  Eye,
  Check,
  Lock,
  FileSignature,
  ChevronLeft,
  Eraser,
  Tag,
  ShieldAlert,
  Search,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  SwitchCamera,
  RefreshCw,
  WifiOff,
  Users,
  UserPlus,
  Trash2,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../../../lib/supabase/client';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import {
  memberService,
  subscriptionService,
  cardService,
  registrationService,
  settingsService,
  DEFAULT_SETTINGS,
} from '../memberService';
import {
  OfficialReceipt,
  type OfficialReceiptRef,
} from '../../../components/ui/OfficialReceipt';
import { type AgreementDocument } from '../../../components/ui/AgreementDocumentViewer';
import { SideNavTab } from '../../../components/ui/SideNavTab';
import type {
  OnlineRegistration,
  PaymentMethod,
  Member,
  Subscription,
  MembershipSettings,
} from '../../../types/members';
import type {
  HybridScanResult,
  HybridMemberResult,
  HybridProductResult,
} from '../../scanner/scannerService';
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
  readOnly = false,
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

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
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

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
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
          <label className="text-[10px] font-bold text-(--color-text)/80 uppercase tracking-wider flex items-center gap-1.5">
            <FileSignature className="w-3.5 h-3.5 text-(--color-primary)" />
            <span>{label}</span>
          </label>
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Lock className="w-2.5 h-2.5" /> Pre-Registered (Locked)
          </span>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-(--border-color) bg-(--bg-card) p-2 h-20 flex items-center justify-center">
          {value ? (
            showImage ? (
              <img
                src={value}
                alt={label}
                className="max-h-full max-w-full object-contain pointer-events-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowImage(true)}
                className="px-3 py-1.5 bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) border border-(--border-color) rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-(--color-primary)" />
                <span>Show Signature</span>
              </button>
            )
          ) : (
            <span className="text-[10px] text-(--color-text)/40 font-mono italic">
              No signature on file
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 select-none text-left">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-(--color-text)/80 uppercase tracking-wider flex items-center gap-1.5">
          <FileSignature className="w-3.5 h-3.5 text-(--color-primary)" />
          <span>{label}</span>
        </label>
        {hasDrawn && (
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Check className="w-3 h-3 stroke-3" /> Signed
          </span>
        )}
      </div>

      <div
        className={`relative rounded-xl overflow-hidden border bg-white transition-colors ${
          error
            ? 'border-rose-500 bg-rose-500/5'
            : hasDrawn
              ? 'border-emerald-500'
              : 'border-(--border-color)'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 2v20M2 12h20' stroke='%230f172a' stroke-width='2' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='12' r='2.5' fill='%232563eb'/%3E%3C/svg%3E") 12 12, crosshair`,
          }}
          className="w-full h-24 block touch-none bg-white"
        />
        <span className="absolute bottom-1.5 left-2.5 text-[8px] font-mono font-semibold text-slate-400 pointer-events-none uppercase tracking-widest">
          Draw signature inside box
        </span>
      </div>

      {error ? (
        <p className="text-[9px] text-rose-500 font-bold leading-none">
          {error}
        </p>
      ) : (
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={clearCanvas}
            className="px-2 py-0.5 bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer border border-(--border-color)"
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
  initialPlan?:
    'Monthly Membership' | 'Yearly Membership' | 'No Subscription' | null;
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
  prefillMember,
}) => {
  const { isSessionOpen, loadActiveSession, subscribeRealtime } =
    useCashSessionStore();

  const [step, setStep] = useState<number>(() =>
    initialStep !== undefined ? initialStep : 1
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showStatusDetails, setShowStatusDetails] = useState<boolean>(false);
  const [intakeMode, setIntakeMethod] = useState<'Import' | 'Manual' | null>(
    initialIntakeMode || 'Manual'
  );
  const [selectedPlan, setSelectedPlan] = useState<
    'Monthly Membership' | 'Yearly Membership' | 'No Subscription'
  >(initialPlan || 'Monthly Membership');

  const [enrollmentType, setEnrollmentType] = useState<'existing' | 'new'>(
    'existing'
  );

  const [settings, setSettings] =
    useState<MembershipSettings>(DEFAULT_SETTINGS);
  const [, setIsLoadingSettings] = useState<boolean>(false);
  const [, setSettingsError] = useState<string | null>(null);
  const [, setIsUsingSettingsFallback] = useState<boolean>(false);

  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);

  // Draft Auto-saving State
  const [draftState, setDraftState] = useState<'saved' | 'saving' | 'idle'>(
    'idle'
  );
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
      console.warn(
        'Failed to load settings from Supabase in IntakeWizardModal:',
        err
      );
      setSettings(DEFAULT_SETTINGS);
      setSettingsError(
        'Could not fetch pricing parameters from Supabase. Default pricing applied.'
      );
      setIsUsingSettingsFallback(true);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadActiveSession();
      const unsub = subscribeRealtime();
      fetchWizardSettings();
      memberService.getAll().then(setAllMembers).catch(console.error);
      subscriptionService
        .getAll()
        .then(setAllSubscriptions)
        .catch(console.error);

      return () => {
        unsub();
      };
    }
  }, [isOpen, loadActiveSession, subscribeRealtime]);

  const cardFee = settings.card_printing_fee || 50;
  const gcashFee = settings.gcash_fee || 10;

  const [selectedExistingMember, setSelectedExistingMember] =
    useState<Member | null>(null);
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
  const [, setSubscriptionAgreement] = useState(false);
  const [, setAgreementDocument] = useState<AgreementDocument | null>(null);

  const [manualIdInput, setManualIdInput] = useState('');
  const [isScanning, setIsScanning] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const receiptRef = useRef<OfficialReceiptRef | null>(null);
  const qrRegionId = 'fast-intake-qr-reader';

  const lastScanTimeRef = useRef<number>(0);
  const lastScannedIdRef = useRef<string>('');

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
    []
  );
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
          console.warn('Could not retrieve camera list:', err);
        });
    }
  }, [isOpen, intakeMode, isScanning]);

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [gcashReference, setGcashReference] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [addIdCard, setAddIdCard] = useState(false);
  const [importedQueueReg, setImportedQueueReg] =
    useState<OnlineRegistration | null>(null);
  const [finishedIds, setFinishedIds] = useState<{
    member_id: string;
    sub_id: string;
    receipt_no: string;
    transaction_date: string;
  } | null>(null);

  const activeMember = selectedExistingMember || prefillMember;
  const isNameLocked = Boolean(activeMember?.full_name?.trim());
  const isPhoneLocked = Boolean(
    activeMember?.phone &&
    activeMember.phone.trim() &&
    activeMember.phone.toLowerCase() !== 'no phone'
  );
  const isBirthdayLocked = Boolean(activeMember?.birthday?.trim());
  const isAddressLocked = Boolean(activeMember?.address?.trim());
  const isEmergencyNameLocked = Boolean(
    activeMember?.emergency_contact_name?.trim()
  );
  const isRelationshipLocked = Boolean(activeMember?.relationship?.trim());
  const isEmergencyPhoneLocked = Boolean(
    activeMember?.emergency_contact_phone &&
    activeMember.emergency_contact_phone.trim() &&
    activeMember.emergency_contact_phone.toLowerCase() !== 'no phone'
  );

  const isMissing = (val: string) =>
    Boolean(activeMember) &&
    (!val || !val.trim() || val.trim().toLowerCase() === 'no phone');

  const matchingSearchMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return [];
    const q = memberSearchQuery.toLowerCase().trim();
    return allMembers.filter(
      (m: Member) =>
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
        const isSuffix = ['JR.', 'SR.', 'III', 'II', 'IV', 'JR', 'SR'].includes(
          lastPart.toUpperCase()
        );

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
        const isSuffix = ['JR.', 'SR.', 'III', 'II', 'IV', 'JR', 'SR'].includes(
          lastPart.toUpperCase()
        );
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
    if (!isOpen || prefillData || prefillMember || intakeMode === 'Import')
      return;

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
          toast.info('Restored saved intake draft (valid for 24h).', {
            toastId: 'intake-draft-restored',
          });
        }
      }
    } catch {
      localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
    } finally {
      setTimeout(() => {
        isRestoringDraftRef.current = false;
      }, 100);
    }
  }, [isOpen, prefillData, prefillMember, intakeMode]);

  // Real-time character auto-save listener
  useEffect(() => {
    if (
      !isOpen ||
      isRestoringDraftRef.current ||
      isSubmitting ||
      intakeMode !== 'Manual' ||
      prefillData ||
      prefillMember
    )
      return;

    const draftData: IntakeDraft = {
      enrollmentType,
      selectedMemberId: selectedExistingMember?.id,
      lastName,
      firstName,
      middleInitials,
      suffix,
      email,
      phone,
      gender,
      birthday,
      address,
      emergencyName,
      relationship,
      emergencyPhone,
      parentName,
      parentRelationship,
      parentPhone,
      parentEmail,
      sameAsParent,
      applicantSig,
      parentSig,
      waiverAgreed,
      savedAt: Date.now(),
    };

    const currentSnapshot = JSON.stringify(draftData);
    if (currentSnapshot === lastDraftSnapshotRef.current) return;
    lastDraftSnapshotRef.current = currentSnapshot;

    const hasAnyContent = [
      lastName,
      firstName,
      phone,
      email,
      birthday,
      address,
      emergencyName,
      emergencyPhone,
      parentName,
      parentPhone,
    ].some((val) => val.trim() !== '');

    if (!hasAnyContent && !selectedExistingMember) {
      localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
      setDraftState('idle');
      return;
    }

    setDraftState('saving');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          INTAKE_DRAFT_STORAGE_KEY,
          JSON.stringify(draftData)
        );
        setDraftState('saved');
      } catch (e) {
        console.warn('Could not save intake draft:', e);
        setDraftState('idle');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    isSubmitting,
    intakeMode,
    prefillData,
    prefillMember,
    enrollmentType,
    selectedExistingMember,
    lastName,
    firstName,
    middleInitials,
    suffix,
    email,
    phone,
    gender,
    birthday,
    address,
    emergencyName,
    relationship,
    emergencyPhone,
    parentName,
    parentRelationship,
    parentPhone,
    parentEmail,
    sameAsParent,
    applicantSig,
    parentSig,
    waiverAgreed,
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

    return (
      allMembers.find((m: Member) => {
        if (selectedExistingMember && m.id === selectedExistingMember.id)
          return false;
        if (prefillMember && m.id === prefillMember.id) return false;
        const flatFullName = m.full_name.toLowerCase();
        return (
          flatFullName.includes(targetFirst) &&
          flatFullName.includes(targetLast)
        );
      }) || null
    );
  }, [firstName, lastName, selectedExistingMember, prefillMember, allMembers]);

  const phoneMatchMember = useMemo<Member | null>(() => {
    const cleanPhone = phone.trim();
    if (
      !cleanPhone ||
      cleanPhone.length < 7 ||
      cleanPhone.toLowerCase() === 'no phone'
    )
      return null;

    return (
      allMembers.find((m: Member) => {
        if (selectedExistingMember && m.id === selectedExistingMember.id)
          return false;
        if (prefillMember && m.id === prefillMember.id) return false;
        return m.phone && m.phone.trim() === cleanPhone;
      }) || null
    );
  }, [phone, selectedExistingMember, prefillMember, allMembers]);

  const calculatedAge = useMemo(() => {
    if (!birthday) return 0;
    const birthDate = new Date(birthday);
    const today = new Date();
    let calculated = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      calculated--;
    }
    return calculated >= 0 ? calculated : 0;
  }, [birthday]);

  const isRestrictedUnder12 = useMemo(
    () => !!birthday && calculatedAge < 12,
    [birthday, calculatedAge]
  );
  const isMinor = useMemo(
    () => !!birthday && calculatedAge >= 12 && calculatedAge < 18,
    [birthday, calculatedAge]
  );

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

  const getMemberSubscriptionMeta = useCallback(
    (m: Member) => {
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
      const isSuspended =
        statusStr === 'Suspended' ||
        statusStr === 'Inactive' ||
        statusStr === 'Banned';

      let remainingDays = 0;
      let isOver30Days = false;
      let isWithin30Days = false;

      if (activeSub) {
        const endMs = new Date(activeSub.end_date).getTime();
        remainingDays = Math.max(
          0,
          Math.ceil((endMs - now) / (1000 * 60 * 60 * 24))
        );
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
        isBlockedFromRenewing,
      };
    },
    [allSubscriptions]
  );

  const applicantStatusSummary = useMemo(() => {
    const notices: { type: 'success' | 'info' | 'warning'; text: string }[] =
      [];

    const loadedTicketId = importedQueueReg?.id || prefillData?.id;
    if (loadedTicketId) {
      notices.push({
        type: 'info',
        text: `Information imported from pre-registration ticket (${loadedTicketId}).`,
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
          notices: [
            {
              type: 'warning' as const,
              text: 'Member account is currently suspended.',
            },
          ],
        };
      }

      if (meta?.hasTwoSubs) {
        return {
          level: 'red' as const,
          title: 'Maximum Subscriptions Reached',
          description: `Member already has an active contract (${meta.activeSub?.plan_name}) and a queued renewal (${meta.queuedSub?.plan_name}). Adding more renewals is not allowed.`,
          actionMember: null,
          notices: [
            {
              type: 'warning' as const,
              text: '2 active/queued subscriptions detected.',
            },
          ],
        };
      }

      if (meta?.isOver30Days) {
        return {
          level: 'red' as const,
          title: 'Renewal Not Allowed Yet',
          description: `Active contract (${meta.activeSub?.plan_name}) has ${meta.remainingDays} days remaining. Renewals or plan adjustments are only permitted within 30 days of expiration.`,
          actionMember: null,
          notices: [
            {
              type: 'warning' as const,
              text: `${meta.remainingDays} days remaining on active plan.`,
            },
          ],
        };
      }

      if (meta?.isWithin30Days && meta.activeSub) {
        notices.push({
          type: 'info',
          text: `Active contract (${meta.activeSub.plan_name}) has ${meta.remainingDays} days left. Ready for renewal extension.`,
        });
        return {
          level: 'amber' as const,
          title: 'Eligible for Renewal Extension',
          description: `Member's active ${meta.activeSub.plan_name} contract expires in ${meta.remainingDays} days. Enrolling will queue the renewal to start upon expiration.`,
          actionMember: null,
          notices,
        };
      }

      notices.push({
        type: 'info',
        text: `Attached to existing member profile: ${active?.full_name} (${active?.member_id}).`,
      });
    }

    if (!selectedExistingMember && phoneMatchMember) {
      notices.push({
        type: 'warning',
        text: `This phone number is already used by ${phoneMatchMember.full_name} (${phoneMatchMember.member_id}).`,
      });
      return {
        level: 'amber' as const,
        title: 'Please Review',
        description: `This phone number is already used by ${phoneMatchMember.full_name} (${phoneMatchMember.member_id}). If this is a family member or shared contact, you may continue.`,
        actionMember: phoneMatchMember,
        notices,
      };
    }

    if (loadedTicketId) {
      return {
        level: 'blue' as const,
        title: 'Information Loaded',
        description: `Applicant details imported from pre-registration.`,
        actionMember: null,
        notices,
      };
    }

    return {
      level: 'green' as const,
      title: 'Ready to Register',
      description: 'This applicant is ready to be registered.',
      actionMember: null,
      notices,
    };
  }, [
    importedQueueReg,
    prefillData,
    selectedExistingMember,
    prefillMember,
    phoneMatchMember,
    getMemberSubscriptionMeta,
  ]);

  const membershipStatusSummary = useMemo(() => {
    if (selectedPlan === 'No Subscription') {
      return {
        level: 'amber' as const,
        isBlocked: false,
        title: 'Profile Registration Only',
        description:
          'No active membership plan selected. Profile will be saved without a subscription contract.',
      };
    }

    const target =
      selectedExistingMember || prefillMember || existingMemberMatch;
    if (target) {
      const meta = getMemberSubscriptionMeta(target);

      if (meta.isSuspended) {
        return {
          level: 'red' as const,
          isBlocked: true,
          title: 'Account Suspended',
          description: `This member profile is suspended. Please reinstate their account before processing subscription enrollment.`,
        };
      }

      if (meta.hasTwoSubs) {
        const queueStartDate = meta.queuedSub?.start_date
          ? new Date(meta.queuedSub.start_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'N/A';

        return {
          level: 'red' as const,
          isBlocked: true,
          title: 'Maximum Subscriptions Queued',
          description: `This member already has an ongoing plan (${meta.activeSub?.plan_name}) and a queued renewal (${meta.queuedSub?.plan_name}) starting on ${queueStartDate}. Multiple queued renewals are not allowed.`,
        };
      }

      if (meta.isOver30Days && meta.activeSub) {
        const expDate = new Date(meta.activeSub.end_date).toLocaleDateString(
          'en-US',
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }
        );
        return {
          level: 'red' as const,
          isBlocked: true,
          title: 'Renewal Blocked (>30 Days Remaining)',
          description: `This member currently has an active ${meta.activeSub.plan_name} contract expiring on ${expDate} (${meta.remainingDays} days remaining). Renewal or plan change is only permitted within 30 days of expiration.`,
        };
      }

      if (meta.isWithin30Days && meta.activeSub) {
        const expDate = new Date(meta.activeSub.end_date).toLocaleDateString(
          'en-US',
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }
        );
        const isSamePlan = selectedPlan === meta.activeSub.plan_name;
        const actionText = isSamePlan ? 'extend' : 'queue';

        return {
          level: 'amber' as const,
          isBlocked: false,
          title: 'Subscription Extension Notice',
          description: `Member currently has an active ${meta.activeSub.plan_name} contract expiring on ${expDate} (${meta.remainingDays} days left). Confirming checkout will ${actionText} the new ${selectedPlan} to activate automatically on ${expDate}.`,
        };
      }
    }

    return {
      level: 'green' as const,
      isBlocked: false,
      title: 'Membership Ready',
      description: `${selectedPlan} selected. This member is eligible for registration.`,
    };
  }, [
    selectedPlan,
    selectedExistingMember,
    prefillMember,
    existingMemberMatch,
    getMemberSubscriptionMeta,
  ]);

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
      const startingStep =
        initialStep !== undefined ? initialStep : prefillData ? 2 : 1;
      setStep(startingStep);
      setShowStatusDetails(false);
      setErrors({});
      setMemberSearchQuery('');
      lastScannedIdRef.current = '';
      lastScanTimeRef.current = 0;
      setIntakeMethod(
        initialIntakeMode ||
          (prefillData || prefillMember ? 'Manual' : 'Manual')
      );

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
  }, [
    isOpen,
    prefillMember,
    prefillData,
    initialPlan,
    initialIntakeMode,
    initialStep,
  ]);

  const handleModalClose = () => {
    forceStopCamera();
    setIsScanning(false);
    onClose();
  };

  const forceStopCamera = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current
            .stop()
            .then(() => scannerRef.current?.clear())
            .catch(() => {});
        } else {
          scannerRef.current.clear();
        }
      } catch (e) {}
    }

    const qrRegion = document.getElementById(qrRegionId);
    const videoElements = qrRegion
      ? qrRegion.querySelectorAll('video')
      : document.querySelectorAll('video');

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
        cleanId =
          parsed.registrationId ||
          parsed.memberId ||
          parsed.member_id ||
          cleanId;
      }
    } catch {}

    cleanId = cleanId.toUpperCase().trim();
    const now = Date.now();
    if (
      lastScannedIdRef.current === cleanId &&
      now - lastScanTimeRef.current < 2500
    )
      return;

    lastScannedIdRef.current = cleanId;
    lastScanTimeRef.current = now;

    const list = await registrationService.getQueue();
    const foundReg = list.find(
      (q: OnlineRegistration) => q.id.toUpperCase() === cleanId
    );

    if (foundReg) {
      if (foundReg.status !== 'Pending') {
        toast.warning(
          `Registration ID ${cleanId} has already been ${foundReg.status.toLowerCase()}.`
        );
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
      (m: Member) =>
        m.member_id.toUpperCase() === cleanId || m.id.toUpperCase() === cleanId
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

    toast.error(
      `ID "${cleanId}" not found in pre-registrations or existing member profiles.`
    );
  };

  const getCameraErrorMessage = (err: any): string => {
    const msg =
      typeof err === 'string' ? err : err?.message || String(err || '');
    const lower = msg.toLowerCase();
    if (lower.includes('notallowederror') || lower.includes('permission'))
      return 'Permission denied by browser';
    if (lower.includes('notreadableerror') || lower.includes('in use'))
      return 'Camera is busy or in use';
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
          const cameraConfig = selectedCameraId
            ? selectedCameraId
            : { facingMode: 'environment' };

          html5QrCode
            .start(
              cameraConfig,
              { fps: 25, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
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
                  const currentIndex = selectedCameraId
                    ? cameras.findIndex((c) => c.id === selectedCameraId)
                    : -1;
                  const nextCamera =
                    cameras[(currentIndex + 1) % cameras.length];
                  forceStopCamera();
                  setSelectedCameraId(nextCamera.id);
                  toast.info(
                    `Switching camera: ${nextCamera.label || 'Next Camera'}`
                  );
                } else {
                  toast.error(`Camera Error: ${reason}`);
                  setIsScanning(false);
                }
              }
            });
        } catch (e) {
          console.error('Scanner setup error', e);
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
        toast.error(
          'This member account is suspended. Enrollment cannot proceed.'
        );
        return false;
      }
      if (meta.hasTwoSubs) {
        toast.error('This member already has two active/queued subscriptions.');
        return false;
      }
      if (meta.isOver30Days) {
        toast.error(
          `Member has ${meta.remainingDays} days remaining on their active plan. Renewals only allowed within 30 days.`
        );
        return false;
      }
    }

    const newErrors: Record<string, string> = {};

    if (!lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!phone.trim() || phone.trim().toLowerCase() === 'no phone')
      newErrors.phone = 'Phone number is required.';
    if (!birthday.trim()) newErrors.birthday = 'Birthday is required.';

    if (isMinor) {
      if (!parentName.trim())
        newErrors.parentName =
          'Parent / Legal Guardian name is required for minors.';
      if (!parentRelationship.trim())
        newErrors.parentRelationship = 'Relationship to minor is required.';
      if (!parentPhone.trim())
        newErrors.parentPhone = 'Parent contact phone is required.';
      if (!applicantSig)
        newErrors.applicantSig = 'Applicant digital signature is required.';
      if (!parentSig)
        newErrors.parentSig =
          'Parent / Guardian digital signature is required.';

      if (!sameAsParent) {
        if (!emergencyName.trim())
          newErrors.emergencyName = 'Emergency contact name is required.';
        if (!emergencyPhone.trim())
          newErrors.emergencyPhone = 'Emergency phone is required.';
      }
    }

    if (!waiverAgreed) {
      newErrors.waiverAgreed =
        'You must acknowledge the Terms & Conditions and Privacy Policy.';
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
      toast.error(
        'Registration is restricted for individuals under 12 years old.'
      );
      return;
    }

    setStep(2);
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleExecuteCheckout = async () => {
    if (isSubmitting) return;

    // Strict guard: if cash session is closed, strictly prevent financial actions
    const isPaidPlan = selectedPlan !== 'No Subscription';
    const isPaidCard = addIdCard && cardFee > 0;
    if (!isSessionOpen && (isPaidPlan || isPaidCard)) {
      toast.error(
        'Cash drawer session is closed. Paid subscriptions and cards cannot be transacted.'
      );
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
          toast.error(
            'Network connection unstable. Could not verify live pricing with database.'
          );
          setIsSubmitting(false);
          return;
        }

        if (!liveSettings) {
          toast.error(
            'Unable to verify live rates from Supabase. Please retry once online.'
          );
          setIsSubmitting(false);
          return;
        }

        const livePrice =
          selectedPlan === 'Monthly Membership'
            ? liveSettings.monthly_plan_price
            : liveSettings.yearly_plan_price;

        if (typeof livePrice !== 'number' || livePrice <= 0) {
          toast.error(
            'Invalid live pricing returned from database. Subscription cannot be processed.'
          );
          setIsSubmitting(false);
          return;
        }

        setSettings(liveSettings);
        livePlanBasePrice = livePrice;
        liveGcashFee =
          paymentMethod === 'GCash' ? liveSettings.gcash_fee || 10 : 0;
        liveCardFee = addIdCard ? liveSettings.card_printing_fee || 50 : 0;
        liveTotalPrice = livePlanBasePrice + liveGcashFee + liveCardFee;
      } else {
        liveCardFee = addIdCard ? settings.card_printing_fee || 50 : 0;
        liveTotalPrice = liveCardFee;
      }

      if (membershipStatusSummary.isBlocked) {
        toast.error(membershipStatusSummary.description);
        setIsSubmitting(false);
        return;
      }

      let targetMember: Member;
      const combinedName = getCombinedFullName();
      const existingByPhone = phone.trim()
        ? allMembers.find((m: Member) => m.phone === phone.trim())
        : null;
      const activeMemberToUse =
        prefillMember ||
        selectedExistingMember ||
        existingMemberMatch ||
        existingByPhone;

      const finalEmergencyName =
        isMinor && sameAsParent ? parentName.trim() : emergencyName.trim();
      const finalRelationship =
        isMinor && sameAsParent
          ? parentRelationship.trim()
          : relationship.trim();
      const finalEmergencyPhone =
        isMinor && sameAsParent ? parentPhone.trim() : emergencyPhone.trim();

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
        consent_date: isMinor ? consentDate || new Date().toISOString() : null,
      };

      if (activeMemberToUse) {
        targetMember = await memberService.update(
          activeMemberToUse.id,
          memberFields,
          'Admin Staff'
        );
      } else {
        targetMember = await memberService.create(
          { ...memberFields, status: 'Active' },
          'Admin Staff'
        );
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
            gcashRefNo: gcashReference.trim(),
          }
        );
      }

      const receiptNo =
        createdSub?.receipt_number || `REG-${Date.now().toString().slice(-6)}`;

      // Record standalone card purchase receipt if registering profile-only with card
      if (selectedPlan === 'No Subscription' && addIdCard && liveCardFee > 0) {
        await supabase.from('receipts').insert([
          {
            id: receiptNo,
            member_id: targetMember.member_id,
            customer_name: targetMember.full_name,
            customer_type: 'Physical Card',
            amount: liveCardFee,
            base_price: 0,
            gcash_fee: 0,
            card_fee: liveCardFee,
            gcash_ref_no: gcashReference.trim() || null,
            payment_method: mappedPayment,
            payment_status: 'Paid',
            item_description: 'Physical Membership Card Fee',
          },
        ]);
      }

      const isEnrolled = selectedPlan !== 'No Subscription';

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
      } else if (isEnrolled) {
        // Automatically create membership card when new enrolled member has been added
        const existingCard = await cardService.getByMemberId(
          targetMember.member_id
        );
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
      // Fresh created member without enrollment and without card selection has no card created

      if (importedQueueReg) {
        await registrationService.approve(importedQueueReg.id, 'Admin Staff');
      }

      const now = new Date();
      const formattedDate =
        now.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }) +
        ', ' +
        now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });

      setFinishedIds({
        member_id: targetMember.member_id,
        sub_id: createdSub?.id || 'PROFILE-ONLY',
        receipt_no: receiptNo,
        transaction_date: formattedDate,
      });

      window.dispatchEvent(new Event('palomar_logbook_updated'));

      localStorage.removeItem(INTAKE_DRAFT_STORAGE_KEY);
      setDraftState('idle');

      toast.success(
        selectedPlan === 'No Subscription'
          ? 'Member Profile enrolled.'
          : 'Subscription enrollment complete.'
      );
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || 'System error during wizard checkout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const planBasePrice =
    selectedPlan === 'Monthly Membership'
      ? settings.monthly_plan_price
      : selectedPlan === 'Yearly Membership'
        ? settings.yearly_plan_price
        : 0;

  const appliedGcashFee =
    paymentMethod === 'GCash' && selectedPlan !== 'No Subscription'
      ? gcashFee
      : 0;
  const appliedCardFee = addIdCard ? cardFee : 0;
  const totalPrice = planBasePrice + appliedGcashFee + appliedCardFee;

  // Cash calculations
  const numericCashTendered = parseFloat(cashTendered) || 0;
  const cashChange = Math.max(0, numericCashTendered - totalPrice);

  // Automatically sync Cash Received to Total Price whenever plan or add-ons change
  useEffect(() => {
    if (step === 2 && paymentMethod === 'Cash') {
      setCashTendered(totalPrice > 0 ? String(totalPrice) : '');
    }
  }, [step, paymentMethod, totalPrice]);

  const isPlanLocked =
    intakeMode === 'Import' || !!importedQueueReg || !!prefillData;

  // STRICT SESSION ENFORCEMENT:
  // If session is closed, paid transactions (Monthly, Yearly, physical card purchase) are prohibited.
  const isPaidTransaction = selectedPlan !== 'No Subscription' || addIdCard;
  const isSessionBlocked = !isSessionOpen && isPaidTransaction;

  const isConfirmDisabled =
    isSessionBlocked ||
    (paymentMethod === 'GCash' &&
      selectedPlan !== 'No Subscription' &&
      !isGcashValid) ||
    (paymentMethod === 'Cash' &&
      totalPrice > 0 &&
      (!cashTendered || numericCashTendered < totalPrice)) ||
    isRestrictedUnder12 ||
    membershipStatusSummary.isBlocked;

  const shouldShowDetailsForm =
    enrollmentType === 'new' ||
    Boolean(selectedExistingMember) ||
    Boolean(prefillMember) ||
    Boolean(prefillData);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans select-none">
      <form
        onSubmit={handleFormSubmit}
        className={`relative bg-(--bg-card) text-(--color-text) border border-(--border-color) rounded-3xl w-full shadow-2xl overflow-hidden text-xs max-h-[92vh] flex flex-col transition-all duration-300 ${
          step === 3
            ? 'max-w-md'
            : step === 1 && intakeMode === 'Import'
              ? 'max-w-lg'
              : 'max-w-2xl'
        }`}
      >
        {/* CSS RESET FOR QR CAMERA STREAM */}
        <style>{`
          #fast-intake-qr-reader {
            width: 100% !important;
            height: 100% !important;
            border: none !important;
            background: transparent !important;
            position: relative !important;
            overflow: hidden !important;
          }
          #fast-intake-qr-reader__scan_region {
            width: 100% !important;
            height: 100% !important;
            position: absolute !important;
            inset: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
            background: transparent !important;
          }
          #fast-intake-qr-reader video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            position: absolute !important;
            inset: 0 !important;
            border-radius: 1rem !important;
          }
          #qr-shaded-region,
          #fast-intake-qr-reader__scan_region svg,
          #fast-intake-qr-reader__scan_region img,
          #fast-intake-qr-reader__dashboard,
          #fast-intake-qr-reader__dashboard_section,
          #fast-intake-qr-reader__header_message {
            display: none !important;
          }
        `}</style>

        {/* TOP ACCENT PROGRESS BAR */}
        <div className="w-full h-1 bg-(--bg-input) relative select-none shrink-0">
          <div
            className="absolute top-0 left-0 h-full bg-(--color-primary) transition-all duration-300 shadow-sm shadow-[var(--color-primary)]/50"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* TOP HEADER */}
        <div className="px-5 py-4 border-b border-(--border-color) flex items-center justify-between bg-(--bg-card) shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-(--color-primary)/10 border border-(--color-primary)/20 text-(--color-primary) flex items-center justify-center shadow-xs shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm uppercase tracking-wide text-(--color-text)">
                  Step {step} of 3:{' '}
                  {step === 1
                    ? intakeMode === 'Import'
                      ? 'Scan Pre-Registration'
                      : 'Enroll Member & Details'
                    : step === 2
                      ? 'Choose Plan & Checkout'
                      : 'Enrollment Complete'}
                </h3>
                {step === 1 &&
                  intakeMode === 'Manual' &&
                  draftState !== 'idle' && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-(--bg-input) text-(--color-text)/70 border border-(--border-color)">
                      {draftState === 'saving' ? (
                        <>
                          <RefreshCw className="w-2.5 h-2.5 text-amber-500 animate-spin" />{' '}
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-500" />{' '}
                          Draft saved
                        </>
                      )}
                    </span>
                  )}
              </div>
              <p className="text-[11px] text-(--color-text)/60">
                Frontdesk Member Registration & Subscription Console
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 1 && intakeMode === 'Manual' && draftState !== 'idle' && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="px-2.5 py-1.5 rounded-xl bg-(--bg-input) hover:bg-rose-500/10 text-(--color-text)/60 hover:text-rose-500 border border-(--border-color) text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                title="Clear saved draft"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleModalClose}
              className="w-8 h-8 rounded-xl bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text)/60 hover:text-(--color-text) border border-(--border-color) flex items-center justify-center transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(92vh-140px)] text-left">
          {/* STEP 1: IMPORT QR VIEW */}
          {step === 1 && intakeMode === 'Import' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="flex p-1 bg-(--bg-input) border border-(--border-color) rounded-2xl max-w-xs mx-auto shadow-inner">
                <button
                  type="button"
                  onClick={() => setIsScanning(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    isScanning
                      ? 'bg-(--color-primary) text-white shadow-md'
                      : 'text-(--color-text)/60 hover:text-(--color-text)'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Camera Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsScanning(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    !isScanning
                      ? 'bg-(--color-primary) text-white shadow-md'
                      : 'text-(--color-text)/60 hover:text-(--color-text)'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Type Code</span>
                </button>
              </div>

              {!isScanning ? (
                <div className="max-w-sm mx-auto py-4 space-y-3">
                  <div className="p-5 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl shadow-xs space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-(--color-text)/80 tracking-wider block">
                        Registration Ticket ID *
                      </label>
                      <input
                        type="text"
                        value={manualIdInput}
                        onChange={(e) => setManualIdInput(e.target.value)}
                        placeholder="e.g. REG-000001"
                        className="w-full px-3.5 py-2.5 border border-(--border-color) bg-(--bg-card) text-(--color-text) rounded-xl text-xs font-mono uppercase tracking-widest placeholder:text-(--color-text)/30 outline-none focus:border-(--color-primary)"
                        onKeyDown={(e) => {
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
                      className="w-full py-3 bg-(--color-primary) hover:bg-(--color-primary-hover) disabled:opacity-40 text-white font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Verify & Retrieve Ticket</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-2 space-y-3">
                  <div className="relative w-full max-w-sm h-64 rounded-2xl overflow-hidden bg-(--bg-page) border-2 border-(--color-primary)/50 shadow-2xl flex items-center justify-center">
                    <div id={qrRegionId} className="w-full h-full" />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                      <div className="w-48 h-48 border border-(--color-primary)/40 rounded-2xl relative">
                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-3 border-l-3 border-(--color-primary) rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-3 border-r-3 border-(--color-primary) rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-3 border-l-3 border-(--color-primary) rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-3 border-r-3 border-(--color-primary) rounded-br-lg" />
                      </div>
                    </div>

                    {cameras.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const currentIndex = cameras.findIndex(
                            (c) => c.id === selectedCameraId
                          );
                          const nextIndex = (currentIndex + 1) % cameras.length;
                          forceStopCamera();
                          setSelectedCameraId(cameras[nextIndex].id);
                        }}
                        className="absolute bottom-3 right-3 px-3 py-1.5 bg-(--bg-card)/80 hover:bg-(--bg-card) backdrop-blur-md text-(--color-text) border border-(--border-color) rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-(--color-primary)" />
                        <span>Flip</span>
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] text-(--color-text)/50 font-medium">
                    Point camera at client's mobile screen or QR badge
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: MANUAL INTAKE */}
          {step === 1 && intakeMode === 'Manual' && (
            <div className="space-y-4 animate-fade-in">
              {/* ACTION TILES: EXISTING VS NEW */}
              {!prefillMember && !prefillData && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-(--color-text)/60 uppercase tracking-widest block">
                    Select Intake Mode
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* EXISTING MEMBER */}
                    <div
                      onClick={handleChooseExistingMember}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3.5 relative overflow-hidden shadow-xs active:scale-98 ${
                        enrollmentType === 'existing'
                          ? 'bg-blue-500/10 border-blue-500 ring-4 ring-blue-500/10'
                          : 'bg-(--bg-input)/50 border-(--border-color) hover:border-blue-500/40'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                          enrollmentType === 'existing'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                            : 'bg-(--bg-card) text-(--color-text)/60 border border-(--border-color)'
                        }`}
                      >
                        <Users className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs uppercase font-black text-(--color-text)">
                            Select Existing Member
                          </span>
                          {enrollmentType === 'existing' && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          )}
                        </div>
                        <span className="text-[11px] text-(--color-text)/60 leading-snug block mt-0.5">
                          Search profile to renew contract or add plan
                        </span>
                      </div>
                    </div>

                    {/* CREATE NEW MEMBER */}
                    <div
                      onClick={handleChooseCreateNewMember}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3.5 relative overflow-hidden shadow-xs active:scale-98 ${
                        enrollmentType === 'new'
                          ? 'bg-emerald-500/10 border-emerald-500 ring-4 ring-emerald-500/10'
                          : 'bg-(--bg-input)/50 border-(--border-color) hover:border-emerald-500/40'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                          enrollmentType === 'new'
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-(--bg-card) text-(--color-text)/60 border border-(--border-color)'
                        }`}
                      >
                        <UserPlus className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs uppercase font-black text-(--color-text)">
                            Create New Member
                          </span>
                          {enrollmentType === 'new' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                        </div>
                        <span className="text-[11px] text-(--color-text)/60 leading-snug block mt-0.5">
                          Register a fresh profile & agreement waiver
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SEARCH BOX FOR EXISTING MEMBER */}
              {enrollmentType === 'existing' &&
                !selectedExistingMember &&
                !prefillData && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-(--color-text)/60 uppercase tracking-wider block">
                        Search Existing Profile
                      </label>

                      <div className="relative">
                        <Search className="w-4 h-4 text-(--color-text)/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          placeholder="Search by Name, Phone, or Member ID..."
                          className="w-full pl-10 pr-10 py-3 border border-(--border-color) bg-(--bg-card) text-(--color-text) placeholder:text-(--color-text)/30 rounded-2xl text-xs outline-none focus:border-white focus:ring-2 focus:ring-white/20 font-bold shadow-xs uppercase transition-all"
                          autoFocus
                        />

                        {memberSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setMemberSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-(--color-text)/40 hover:text-(--color-text) cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {memberSearchQuery.trim().length > 0 ? (
                      <div className="p-2 bg-(--bg-card) border border-(--border-color) rounded-2xl shadow-xl max-h-60 overflow-y-auto space-y-1">
                        {matchingSearchMembers.length > 0 ? (
                          matchingSearchMembers.map((m: Member) => {
                            const meta = getMemberSubscriptionMeta(m);

                            return (
                              <div
                                key={m.id}
                                onClick={() => {
                                  if (meta.isSuspended) {
                                    toast.error(
                                      `Member "${m.full_name}" is currently Suspended.`
                                    );
                                    return;
                                  }
                                  if (meta.hasTwoSubs) {
                                    toast.error(
                                      `Member "${m.full_name}" already has two active subscriptions.`
                                    );
                                    return;
                                  }
                                  handleSelectExistingMember(m);
                                  setMemberSearchQuery('');
                                }}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                                  meta.isSuspended
                                    ? 'bg-rose-500/10 border-rose-500/30 opacity-70'
                                    : 'bg-(--bg-input)/50 border-(--border-color) hover:border-blue-500/50'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-black text-xs shrink-0">
                                    {m.full_name[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0 text-left">
                                    <span className="font-black text-xs text-(--color-text) truncate block uppercase">
                                      {m.full_name}
                                    </span>
                                    <span className="text-[10px] text-(--color-text)/60 font-mono block mt-0.5">
                                      {m.member_id} • {m.phone || 'No Phone'}
                                      {meta.activeSub &&
                                        ` • Active: ${meta.activeSub.plan_name}`}
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={`text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                                    meta.isSuspended
                                      ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                                      : meta.isWithin30Days && meta.activeSub
                                        ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                                        : 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                                  }`}
                                >
                                  {meta.isSuspended ? 'Suspended' : 'Select'}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-8 px-4 border-2 border-dashed border-(--border-color) rounded-xl text-center space-y-1.5">
                            <p className="text-xs font-bold text-(--color-text) uppercase">
                              No Profiles Found
                            </p>
                            <p className="text-[11px] text-(--color-text)/50">
                              No member matches &ldquo;{memberSearchQuery}
                              &rdquo;.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 px-4 border-2 border-dashed border-(--border-color) rounded-2xl bg-(--bg-input)/30 text-center flex flex-col items-center justify-center space-y-2.5 select-none">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shadow-xs">
                          <Users className="w-6 h-6 stroke-[2.2]" />
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-xs sm:text-sm text-(--color-text) uppercase tracking-wider">
                            Search Member Records
                          </h4>
                          <p className="text-[11px] text-(--color-text)/60 font-medium max-w-xs leading-relaxed">
                            Type a member name, phone number, or Member ID above
                            to retrieve their profile.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* ATTACHED EXISTING MEMBER BADGE */}
              {selectedExistingMember && (
                <div className="p-3.5 bg-(--color-primary)/10 border-2 border-(--color-primary)/40 rounded-2xl text-(--color-text) flex items-center justify-between gap-3 shadow-xs animate-fade-in">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-(--color-primary) text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                      {selectedExistingMember.full_name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-black text-xs text-(--color-text) uppercase block truncate">
                        {selectedExistingMember.full_name}
                      </span>
                      <span className="text-[10px] font-mono text-(--color-text)/60 block">
                        ID: {selectedExistingMember.member_id} • Phone:{' '}
                        {selectedExistingMember.phone || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {!prefillMember && (
                    <button
                      type="button"
                      onClick={handleClearSelectedExistingMember}
                      className="px-3 py-1.5 bg-(--bg-card) text-(--color-text) border border-(--border-color) hover:bg-(--bg-input) rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer shrink-0 shadow-xs"
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              {/* FORM FIELDS SECTIONS */}
              {shouldShowDetailsForm && (
                <div className="space-y-4 animate-fade-in pt-1">
                  {/* STATUS NOTIFICATION CARD */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2 ${
                      applicantStatusSummary.level === 'red'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                        : applicantStatusSummary.level === 'amber'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                          : applicantStatusSummary.level === 'blue'
                            ? 'bg-(--color-primary)/10 border-(--color-primary)/30 text-(--color-primary-light)'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {applicantStatusSummary.level === 'red' ? (
                          <Ban className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        ) : applicantStatusSummary.level === 'amber' ? (
                          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        ) : applicantStatusSummary.level === 'blue' ? (
                          <Info className="w-4 h-4 text-(--color-primary-light) shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5">
                          <h4 className="text-xs uppercase font-black text-(--color-text)">
                            {applicantStatusSummary.title}
                          </h4>
                          <p className="text-[11px] leading-relaxed opacity-90">
                            {applicantStatusSummary.description}
                          </p>
                        </div>
                      </div>

                      {applicantStatusSummary.actionMember && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectExistingMember(
                              applicantStatusSummary.actionMember!
                            )
                          }
                          className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer border-none shadow-xs shrink-0 transition-colors bg-amber-500 hover:bg-amber-400 text-slate-950"
                        >
                          Attach Member
                        </button>
                      )}
                    </div>

                    {applicantStatusSummary.notices.length > 1 && (
                      <div className="pt-2 border-t border-(--border-color) select-none">
                        <button
                          type="button"
                          onClick={() =>
                            setShowStatusDetails(!showStatusDetails)
                          }
                          className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer text-(--color-text)"
                        >
                          <span>
                            {showStatusDetails
                              ? 'Hide Status Details'
                              : 'View Status Details'}
                          </span>
                          {showStatusDetails ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>

                        {showStatusDetails && (
                          <div className="mt-2 space-y-1 text-[9px] font-mono">
                            {applicantStatusSummary.notices.map((n, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1.5 text-(--color-text)/80"
                              >
                                <span>
                                  {n.type === 'warning'
                                    ? '⚠'
                                    : n.type === 'info'
                                      ? 'ℹ'
                                      : '✓'}
                                </span>
                                <span>{n.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 1: PERSONAL INFORMATION */}
                  <div className="p-4 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl space-y-3.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-(--color-text)/60 block">
                      Personal Details
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Last Name */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-(--color-text)/80 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-(--color-primary)" />
                          <span>Last Name</span>
                          <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          disabled={isNameLocked}
                          onChange={(e) => {
                            setLastName(e.target.value);
                            if (errors.lastName)
                              setErrors((prev) => ({ ...prev, lastName: '' }));
                          }}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold uppercase transition-all outline-none ${
                            isMissing(lastName) || errors.lastName
                              ? 'border-rose-500 bg-rose-500/10 text-rose-500 focus:border-white focus:bg-(--bg-card) focus:text-(--color-text) focus:ring-2 focus:ring-white/20'
                              : isNameLocked
                                ? 'border-(--border-color) bg-(--bg-input) text-(--color-text)/40 cursor-not-allowed'
                                : 'border-(--border-color) bg-(--bg-card) text-(--color-text) focus:border-white focus:ring-2 focus:ring-white/20'
                          }`}
                          placeholder="e.g. Angeles"
                        />
                        {errors.lastName && (
                          <span className="text-[9px] text-rose-500 font-bold block">
                            {errors.lastName}
                          </span>
                        )}
                      </div>

                      {/* First Name */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-(--color-text)/80 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-(--color-primary)" />
                          <span>First Name</span>
                          <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={firstName}
                          disabled={isNameLocked}
                          onChange={(e) => {
                            setFirstName(e.target.value);
                            if (errors.firstName)
                              setErrors((prev) => ({ ...prev, firstName: '' }));
                          }}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold uppercase transition-all outline-none ${
                            isMissing(firstName) || errors.firstName
                              ? 'border-rose-500 bg-rose-500/10 text-rose-500 focus:border-white focus:bg-(--bg-card) focus:text-(--color-text) focus:ring-2 focus:ring-white/20'
                              : isNameLocked
                                ? 'border-(--border-color) bg-(--bg-input) text-(--color-text)/40 cursor-not-allowed'
                                : 'border-(--border-color) bg-(--bg-card) text-(--color-text) focus:border-white focus:ring-2 focus:ring-white/20'
                          }`}
                          placeholder="e.g. Adrian"
                        />
                        {errors.firstName && (
                          <span className="text-[9px] text-rose-500 font-bold block">
                            {errors.firstName}
                          </span>
                        )}
                      </div>

                      {/* M.I. & Suffix */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-(--color-text)/80 uppercase block">
                            M.I.
                          </label>
                          <input
                            type="text"
                            value={middleInitials}
                            disabled={isNameLocked}
                            maxLength={2}
                            onChange={(e) => setMiddleInitials(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) uppercase outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                            placeholder="R."
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-(--color-text)/80 uppercase block">
                            Suffix
                          </label>
                          <input
                            type="text"
                            value={suffix}
                            disabled={isNameLocked}
                            onChange={(e) => setSuffix(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) uppercase outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                            placeholder="Jr."
                          />
                        </div>
                      </div>

                      {/* Contact Phone */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-(--color-text)/80 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-(--color-primary)" />
                            <span>Contact Phone</span>
                            <span className="text-rose-500">*</span>
                          </span>
                          {isMissing(phone) && (
                            <span className="text-[8px] text-rose-500 font-bold animate-pulse uppercase">
                              ⚠️ Required
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={phone}
                          disabled={isPhoneLocked}
                          maxLength={11}
                          onChange={(e) => {
                            setPhone(e.target.value.replace(/\D/g, ''));
                            if (errors.phone)
                              setErrors((prev) => ({ ...prev, phone: '' }));
                          }}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold transition-all outline-none ${
                            isMissing(phone) || errors.phone
                              ? 'border-rose-500 bg-rose-500/10 text-rose-500 focus:border-white focus:bg-(--bg-card) focus:text-(--color-text) focus:ring-2 focus:ring-white/20'
                              : isPhoneLocked
                                ? 'border-(--border-color) bg-(--bg-input) text-(--color-text)/40 cursor-not-allowed'
                                : 'border-(--border-color) bg-(--bg-card) text-(--color-text) focus:border-white focus:ring-2 focus:ring-white/20'
                          }`}
                          placeholder="0917XXXXXXX"
                        />

                        {phoneMatchMember && !selectedExistingMember && (
                          <div className="flex items-center justify-between text-[9px] text-amber-500 mt-1 font-medium">
                            <span className="truncate">
                              Used by {phoneMatchMember.full_name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleSelectExistingMember(phoneMatchMember)
                              }
                              className="underline font-bold ml-1 cursor-pointer"
                            >
                              Attach
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Gender */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-(--color-text)/80 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-(--color-primary)" />
                          <span>Gender *</span>
                        </label>
                        <select
                          value={gender}
                          disabled={isNameLocked}
                          onChange={(e) => setGender(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) outline-none cursor-pointer focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Non-Binary">Non-Binary</option>
                        </select>
                      </div>

                      {/* Birthday & Age Status */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Birthday *
                          </label>
                          <input
                            type="date"
                            value={birthday}
                            disabled={isBirthdayLocked}
                            onChange={(e) => {
                              setBirthday(e.target.value);
                              if (errors.birthday)
                                setErrors((prev) => ({
                                  ...prev,
                                  birthday: '',
                                }));
                            }}
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-bold transition-all outline-none ${
                              errors.birthday
                                ? 'border-rose-500 bg-rose-500/10 text-rose-500 focus:border-white focus:bg-(--bg-card) focus:text-(--color-text) focus:ring-2 focus:ring-white/20'
                                : isBirthdayLocked
                                  ? 'border-(--border-color) bg-(--bg-input) text-(--color-text)/40 cursor-not-allowed'
                                  : 'border-(--border-color) bg-(--bg-card) text-(--color-text) focus:border-white focus:ring-2 focus:ring-white/20'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Age Status
                          </label>
                          <input
                            type="text"
                            value={
                              birthday
                                ? `${calculatedAge} yrs (${isRestrictedUnder12 ? 'Restricted' : isMinor ? 'Minor' : 'Adult'})`
                                : '--'
                            }
                            disabled
                            className={`w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold outline-none cursor-not-allowed ${
                              isRestrictedUnder12
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                                : isMinor
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                                  : 'bg-(--bg-input) border-(--border-color) text-(--color-text)/70'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Home Address */}
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-(--color-text)/80 block">
                          Home Address{' '}
                          <span className="text-(--color-text)/40 font-normal">
                            (optional)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={address}
                          disabled={isAddressLocked}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                          placeholder="Barangay, City, Province (optional)"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: ADULT EMERGENCY CONTACT OR MINOR PARENT SECTION */}
                  {!isMinor ? (
                    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 block">
                        Emergency Contact (Optional for 18+)
                      </span>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Emergency Contact Name
                          </label>
                          <input
                            type="text"
                            value={emergencyName}
                            disabled={isEmergencyNameLocked}
                            onChange={(e) => setEmergencyName(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) outline-none focus:border-purple-500"
                            placeholder="Contact person's full name"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Relationship
                          </label>
                          <select
                            value={relationship}
                            disabled={isRelationshipLocked}
                            onChange={(e) => setRelationship(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) outline-none cursor-pointer"
                          >
                            <option value="">Select Relationship</option>
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Spouse / Partner">
                              Spouse / Partner
                            </option>
                            <option value="Brother">Brother</option>
                            <option value="Sister">Sister</option>
                            <option value="Friend">Friend</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Emergency Phone
                          </label>
                          <input
                            type="text"
                            maxLength={11}
                            value={emergencyPhone}
                            disabled={isEmergencyPhoneLocked}
                            onChange={(e) =>
                              setEmergencyPhone(
                                e.target.value.replace(/\D/g, '')
                              )
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-mono font-bold text-(--color-text) outline-none focus:border-purple-500"
                            placeholder="0918XXXXXXX"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* MINOR GUARDIAN DETAILS & DUAL SIGNATURE PADS */
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-3.5">
                      <div className="flex items-center gap-2 text-amber-500">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest block">
                          Parent / Legal Guardian & Consent (Minor 12–17)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Parent / Legal Guardian Name{' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={parentName}
                            onChange={(e) => {
                              setParentName(e.target.value);
                              if (sameAsParent)
                                setEmergencyName(e.target.value);
                              if (errors.parentName)
                                setErrors((prev) => ({
                                  ...prev,
                                  parentName: '',
                                }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none transition-all ${
                              errors.parentName
                                ? 'border-rose-500 bg-rose-500/10 text-rose-500 focus:border-white focus:bg-(--bg-card) focus:text-(--color-text) focus:ring-2 focus:ring-white/20'
                                : 'border-(--border-color) bg-(--bg-card) text-(--color-text) focus:border-white focus:ring-2 focus:ring-white/20'
                            }`}
                            placeholder="Parent or legal guardian's full name"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Relationship to Minor{' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={parentRelationship}
                            onChange={(e) => {
                              setParentRelationship(e.target.value);
                              if (sameAsParent) setRelationship(e.target.value);
                              if (errors.parentRelationship)
                                setErrors((prev) => ({
                                  ...prev,
                                  parentRelationship: '',
                                }));
                            }}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold text-(--color-text) cursor-pointer"
                          >
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Legal Guardian">
                              Legal Guardian
                            </option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-(--color-text)/80 block">
                            Parent Phone Number{' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            maxLength={11}
                            value={parentPhone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setParentPhone(val);
                              if (sameAsParent) setEmergencyPhone(val);
                              if (errors.parentPhone)
                                setErrors((prev) => ({
                                  ...prev,
                                  parentPhone: '',
                                }));
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold outline-none transition-all ${
                              errors.parentPhone
                                ? 'border-rose-500 bg-rose-500/10 text-rose-500 focus:border-white focus:bg-(--bg-card) focus:text-(--color-text) focus:ring-2 focus:ring-white/20'
                                : 'border-(--border-color) bg-(--bg-card) text-(--color-text) focus:border-white focus:ring-2 focus:ring-white/20'
                            }`}
                            placeholder="0918XXXXXXX"
                          />
                        </div>

                        <div className="md:col-span-2 p-2.5 bg-(--bg-card) rounded-xl border border-(--border-color) flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-(--color-text) select-none">
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
                              className="w-4 h-4 rounded border-(--border-color) text-(--color-primary) accent-[var(--color-primary)] cursor-pointer"
                            />
                            <span>
                              Use Parent / Guardian as Primary Emergency Contact
                            </span>
                          </label>
                        </div>

                        {/* DIGITAL SIGNATURE PADS */}
                        <div className="md:col-span-2 pt-2 border-t border-amber-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <SignaturePad
                            label="Applicant Signature *"
                            value={applicantSig}
                            onChange={(sig) => {
                              setApplicantSig(sig);
                              if (errors.applicantSig)
                                setErrors((prev) => ({
                                  ...prev,
                                  applicantSig: '',
                                }));
                            }}
                            error={errors.applicantSig}
                          />
                          <SignaturePad
                            label="Parent / Guardian Signature *"
                            value={parentSig}
                            onChange={(sig) => {
                              setParentSig(sig);
                              if (errors.parentSig)
                                setErrors((prev) => ({
                                  ...prev,
                                  parentSig: '',
                                }));
                            }}
                            error={errors.parentSig}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* WAIVER AGREEMENT CHECKBOX */}
                  <div className="p-3 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waiverAgreed}
                        onChange={(e) => {
                          setWaiverAgreed(e.target.checked);
                          if (errors.waiverAgreed)
                            setErrors((prev) => ({
                              ...prev,
                              waiverAgreed: '',
                            }));
                        }}
                        className="mt-0.5 w-4 h-4 rounded border-(--border-color) text-(--color-primary) accent-[var(--color-primary)] cursor-pointer shrink-0"
                      />
                      <span className="text-[11px] text-(--color-text)/80 leading-snug font-medium">
                        {isMinor ? (
                          <>
                            I certify that I am the lawful parent/guardian and
                            voluntarily grant permission for this minor to
                            enroll, accepting full responsibility under the{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAgreementDocument('terms');
                              }}
                              className="text-(--color-primary-light) underline font-bold"
                            >
                              Terms &amp; Conditions
                            </button>{' '}
                            and{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAgreementDocument('privacy');
                              }}
                              className="text-(--color-primary-light) underline font-bold"
                            >
                              Privacy Policy
                            </button>
                            . *
                          </>
                        ) : (
                          <>
                            I certify that all information provided is accurate
                            and that the member agrees to abide by the{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAgreementDocument('terms');
                              }}
                              className="text-(--color-primary-light) underline font-bold"
                            >
                              Terms &amp; Conditions
                            </button>{' '}
                            and{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAgreementDocument('privacy');
                              }}
                              className="text-(--color-primary-light) underline font-bold"
                            >
                              Privacy Policy
                            </button>
                            . *
                          </>
                        )}
                      </span>
                    </label>
                    {errors.waiverAgreed && (
                      <span className="text-[9px] text-rose-500 font-bold block mt-1">
                        {errors.waiverAgreed}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CHECKOUT INVOICE & PLAN SELECTION */}
          {step === 2 && (
            <div className="p-4 sm:p-5 bg-(--bg-input)/50 rounded-2xl border border-(--border-color) text-left space-y-4 animate-fade-in">
              {/* CASH SESSION CLOSED WARNING NOTICE */}
              {!isSessionOpen && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-xs font-black uppercase tracking-wider block">
                      Cash Register Session Is Closed
                    </span>
                    <p className="text-[11px] text-amber-500/90 leading-relaxed font-medium">
                      Paid transactions (Monthly/Yearly subscriptions &amp;
                      physical cards) cannot be transacted or logged while the
                      cash session is closed. You can still modify and save
                      member profile records using <strong>Profile Only</strong>
                      .
                    </p>
                  </div>
                </div>
              )}

              {/* Member Summary Header */}
              <div className="flex justify-between items-center border-b border-(--border-color) pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-(--color-text)/50">
                    Client Profile
                  </span>
                  <h4 className="font-black text-sm uppercase text-(--color-text) mt-0.5">
                    {getCombinedFullName()}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono bg-(--color-primary)/15 text-(--color-primary-light) border border-(--color-primary)/30 px-2.5 py-1 rounded-full font-bold">
                    {isMinor
                      ? `MINOR (${calculatedAge} YRS)`
                      : `ADULT (${calculatedAge} YRS)`}
                  </span>
                  <span className="text-xs font-mono font-bold block mt-1 text-(--color-text)/60">
                    {phone || 'No Phone'}
                  </span>
                </div>
              </div>

              {/* Plan Cards */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-(--color-text)/50 block">
                  Select Membership Option
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* MONTHLY PLAN OPTION */}
                  <div
                    onClick={() => {
                      if (!isSessionOpen) {
                        toast.warning(
                          'Cash drawer is closed. Open a session before selecting paid subscriptions.'
                        );
                        return;
                      }
                      if (!isPlanLocked) setSelectedPlan('Monthly Membership');
                    }}
                    className={`p-3.5 rounded-2xl border-2 transition-all relative ${
                      !isSessionOpen
                        ? 'opacity-60 border-(--border-color) bg-(--bg-card) cursor-not-allowed'
                        : selectedPlan === 'Monthly Membership'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-sm ring-2 ring-emerald-500/20 cursor-pointer'
                          : 'border-(--border-color) bg-(--bg-card) text-(--color-text) hover:border-emerald-500/40 cursor-pointer'
                    }`}
                  >
                    {!isSessionOpen && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                        <Lock className="w-2.5 h-2.5" /> Closed
                      </span>
                    )}
                    <span className="text-xs uppercase font-black block">
                      Monthly Plan
                    </span>
                    <span className="text-base font-mono font-black block mt-1">
                      ₱{settings.monthly_plan_price.toLocaleString()}
                    </span>
                  </div>

                  {/* YEARLY PLAN OPTION */}
                  <div
                    onClick={() => {
                      if (!isSessionOpen) {
                        toast.warning(
                          'Cash drawer is closed. Open a session before selecting paid subscriptions.'
                        );
                        return;
                      }
                      if (!isPlanLocked) setSelectedPlan('Yearly Membership');
                    }}
                    className={`p-3.5 rounded-2xl border-2 transition-all relative ${
                      !isSessionOpen
                        ? 'opacity-60 border-(--border-color) bg-(--bg-card) cursor-not-allowed'
                        : selectedPlan === 'Yearly Membership'
                          ? 'border-(--color-primary) bg-(--color-primary)/10 text-(--color-primary-light) shadow-sm ring-2 ring-[var(--color-primary)]/20 cursor-pointer'
                          : 'border-(--border-color) bg-(--bg-card) text-(--color-text) hover:border-(--color-primary)/40 cursor-pointer'
                    }`}
                  >
                    {!isSessionOpen && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                        <Lock className="w-2.5 h-2.5" /> Closed
                      </span>
                    )}
                    <span className="text-xs uppercase font-black block">
                      Yearly Plan
                    </span>
                    <span className="text-base font-mono font-black block mt-1">
                      ₱{settings.yearly_plan_price.toLocaleString()}
                    </span>
                  </div>

                  {/* PROFILE ONLY OPTION */}
                  <div
                    onClick={() =>
                      !isPlanLocked && setSelectedPlan('No Subscription')
                    }
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                      selectedPlan === 'No Subscription'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-500 shadow-sm ring-2 ring-amber-500/20'
                        : 'border-(--border-color) bg-(--bg-card) text-(--color-text) hover:border-amber-500/40'
                    }`}
                  >
                    {!isSessionOpen && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                        Available
                      </span>
                    )}
                    <span className="text-xs uppercase font-black block">
                      Profile Only
                    </span>
                    <span className="text-base font-mono font-black block mt-1">
                      ₱0
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Method Gateway */}
              {selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-(--border-color)">
                  <span className="text-[10px] font-black uppercase tracking-wider text-(--color-text)/50 block">
                    Payment Gateway
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('Cash')}
                      className={`py-2.5 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 cursor-pointer border transition-all ${
                        paymentMethod === 'Cash'
                          ? 'bg-(--color-primary) text-white border-(--color-primary) shadow-sm'
                          : 'bg-(--bg-card) border-(--border-color) text-(--color-text)/70 hover:text-(--color-text)'
                      }`}
                    >
                      <span>💵 Cash</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('GCash')}
                      className={`py-2.5 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 cursor-pointer border transition-all ${
                        paymentMethod === 'GCash'
                          ? 'bg-(--color-primary) text-white border-(--color-primary) shadow-sm'
                          : 'bg-(--bg-card) border-(--border-color) text-(--color-text)/70 hover:text-(--color-text)'
                      }`}
                    >
                      <span>📱 GCash</span>
                    </button>
                  </div>
                </div>
              )}

              {/* GCash Reference Input */}
              {paymentMethod === 'GCash' &&
                selectedPlan !== 'No Subscription' && (
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] uppercase font-bold text-(--color-text)/80 block">
                      {isGcashValid
                        ? '✓ GCash Reference Validated'
                        : 'GCash Reference Number *'}
                    </label>
                    <input
                      type="text"
                      maxLength={13}
                      value={gcashReference}
                      onChange={(e) =>
                        setGcashReference(e.target.value.replace(/\D/g, ''))
                      }
                      placeholder="Enter 10 to 13-digit Reference Code"
                      className="w-full px-3 py-2 border border-(--border-color) bg-(--bg-card) text-(--color-text) placeholder:text-(--color-text)/30 rounded-xl font-mono text-xs font-bold outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                    />
                  </div>
                )}

              {/* Cash Amount Tendered Input */}
              {paymentMethod === 'Cash' && totalPrice > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase font-bold text-(--color-text)/80 block">
                      Amount Tendered (Cash Received) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(totalPrice))}
                      className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 cursor-pointer transition-colors"
                    >
                      Exact (₱{totalPrice.toLocaleString()})
                    </button>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-(--color-text)/40 pointer-events-none">
                      ₱
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={totalPrice.toLocaleString()}
                      className="w-full pl-7 pr-3.5 py-2 border border-(--border-color) bg-(--bg-card) text-(--color-text) placeholder:text-(--color-text)/30 rounded-xl font-mono text-xs font-bold outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
                    />
                  </div>

                  {/* Change or Shortfall Notice */}
                  {cashTendered !== '' && (
                    <div className="flex justify-between items-center text-[10px] font-mono font-bold pt-0.5 px-0.5">
                      {numericCashTendered >= totalPrice ? (
                        <span className="text-emerald-500">
                          Change: ₱
                          {cashChange.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      ) : (
                        <span className="text-rose-500">
                          Short by: ₱
                          {(totalPrice - numericCashTendered).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Membership Card Option */}
              <div className="pt-2 border-t border-(--border-color) flex items-center justify-between">
                <div>
                  <span className="font-bold text-(--color-text) block text-xs">
                    Issue Physical Entry Card (+₱{cardFee})
                    {!isSessionOpen && (
                      <span className="ml-2 text-[9px] text-amber-500 font-mono font-bold uppercase">
                        (Disabled - Session Closed)
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-(--color-text)/50">
                    Printed RFID / QR membership card
                  </span>
                </div>
                <label
                  className={`relative inline-flex items-center ${
                    !isSessionOpen
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={addIdCard}
                    disabled={!isSessionOpen}
                    onChange={(e) => {
                      if (!isSessionOpen) {
                        toast.warning(
                          'Cash drawer is closed. Cannot issue physical card.'
                        );
                        return;
                      }
                      setAddIdCard(e.target.checked);
                    }}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors duration-200 flex items-center p-0.5 ${
                      addIdCard
                        ? 'bg-(--color-primary)'
                        : 'bg-slate-300 dark:bg-zinc-700 border border-slate-400/60 dark:border-zinc-600'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                        addIdCard ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </label>
              </div>

              {/* Fee Breakdown */}
              {totalPrice > 0 && (
                <div className="border-t border-(--border-color) pt-3 space-y-1 font-mono text-xs">
                  <div className="flex justify-between text-(--color-text)/60">
                    <span>Base Plan:</span>
                    <span className="text-(--color-text) font-bold">
                      ₱{planBasePrice.toLocaleString()}.00
                    </span>
                  </div>
                  {paymentMethod === 'GCash' && (
                    <div className="flex justify-between text-(--color-text)/60">
                      <span>GCash Fee:</span>
                      <span className="text-amber-500 font-bold">
                        +₱{gcashFee}.00
                      </span>
                    </div>
                  )}
                  {addIdCard && (
                    <div className="flex justify-between text-(--color-text)/60">
                      <span>Card Printing:</span>
                      <span className="text-(--color-primary-light) font-bold">
                        +₱{cardFee}.00
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm pt-2 border-t border-(--border-color)">
                    <span className="text-(--color-text)">TOTAL PAYABLE:</span>
                    <span className="text-emerald-500 text-base font-black">
                      ₱{totalPrice.toLocaleString()}.00
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SUCCESS & RECEIPT */}
          {step === 3 && finishedIds && (
            <div className="py-4 space-y-4 animate-scale-up text-center">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-sm uppercase text-(--color-text)">
                  Enrollment Successful
                </h4>
                <p className="text-[11px] text-(--color-text)/60 font-mono mt-0.5">
                  Receipt: {finishedIds.receipt_no} • ID:{' '}
                  {finishedIds.member_id}
                </p>
              </div>

              {selectedPlan !== 'No Subscription' || addIdCard ? (
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
                      processedBy: 'FRONTDESK STAFF',
                      qrValue: finishedIds.receipt_no,
                    }}
                  />
                </div>
              ) : (
                <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl max-w-xs mx-auto text-center space-y-1">
                  <span className="text-xs font-black uppercase text-(--color-text) block">
                    Profile Registered
                  </span>
                  <p className="text-[11px] text-(--color-text)/60 font-mono">
                    {finishedIds.member_id}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STICKY FOOTER */}
        <div className="p-4 sm:px-6 border-t border-(--border-color) bg-(--bg-card) flex justify-between items-center shrink-0">
          {step < 3 ? (
            <>
              <button
                type="button"
                disabled={step === 1 || isSubmitting}
                onClick={handleBack}
                className="px-4 py-2.5 border border-(--border-color) bg-(--bg-input) text-(--color-text) hover:bg-(--bg-card) rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                Back
              </button>

              {step === 2 ? (
                <button
                  type="button"
                  onClick={handleExecuteCheckout}
                  disabled={isConfirmDisabled || isSubmitting}
                  className={`px-6 py-2.5 font-black rounded-xl uppercase tracking-wider text-xs shadow-lg transition-all flex items-center gap-2 active:scale-95 ${
                    isSessionBlocked
                      ? 'bg-neutral-800 text-neutral-400 border border-neutral-700 cursor-not-allowed opacity-60'
                      : 'bg-(--color-primary) hover:bg-(--color-primary-hover) text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : isSessionBlocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Session Closed (Payment Blocked)</span>
                    </>
                  ) : (
                    <span>
                      {selectedPlan === 'No Subscription'
                        ? 'Save Profile'
                        : 'Confirm Checkout'}
                    </span>
                  )}
                </button>
              ) : step === 1 && intakeMode === 'Manual' ? (
                <button
                  type="button"
                  onClick={handleStep1Next}
                  className="px-6 py-2.5 bg-(--color-primary) hover:bg-(--color-primary-hover) text-white font-black rounded-xl uppercase tracking-wider text-xs cursor-pointer shadow-lg transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <span>Next: Choose Plan</span>
                  <ChevronLeft className="w-4 h-4 rotate-180" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIntakeMethod('Manual')}
                  className="px-4 py-2.5 border border-(--border-color) bg-(--bg-input) text-(--color-text) rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs"
                >
                  Manual Intake
                </button>
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-between gap-3">
              {selectedPlan !== 'No Subscription' || addIdCard ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => receiptRef.current?.handleDownloadJpg()}
                    className="px-3.5 py-2 bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) border border-(--border-color) rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-(--color-primary)" />
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => receiptRef.current?.handlePrint()}
                    className="px-3.5 py-2 bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) border border-(--border-color) rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Print</span>
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
                className="px-6 py-2.5 bg-(--color-primary) hover:bg-(--color-primary-hover) text-white font-black rounded-xl uppercase tracking-wider text-xs cursor-pointer shadow-md transition-all"
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

export const StaffPlansConsole: React.FC<StaffPlansConsoleProps> = ({
  onOnboardingSuccess,
}) => {
  const navigate = useNavigate();

  const { isSessionOpen, loadActiveSession, subscribeRealtime } =
    useCashSessionStore();

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    mode: 'Import' | 'Manual' | null;
    plan: 'Monthly Membership' | 'Yearly Membership' | 'No Subscription' | null;
    step?: number;
    prefillData?: OnlineRegistration;
  }>({ isOpen: false, mode: null, plan: null });

  // 1. SETTINGS MUST BE DECLARED FIRST
  const [settings, setSettings] =
    useState<MembershipSettings>(DEFAULT_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState<boolean>(false);

  const regularWalkInRate: number =
    typeof (settings as any)?.regular_walk_in === 'number'
      ? (settings as any).regular_walk_in
      : typeof (settings as any)?.walkin_regular_fee === 'number'
        ? (settings as any).walkin_regular_fee
        : typeof (settings as any)?.walkin_fee === 'number'
          ? (settings as any).walkin_fee
          : 100;

  const yearlyCheckInFee: number =
    typeof (settings as any)?.yearly_walk_in === 'number'
      ? (settings as any).yearly_walk_in
      : typeof (settings as any)?.yearly_member_checkin_fee === 'number'
        ? (settings as any).yearly_member_checkin_fee
        : 50;

  // 3. DYNAMIC DISCOUNT CALCULATION
  const yearlyDiscountPercentage: number = useMemo(() => {
    if (regularWalkInRate <= 0) return 0;
    const diff = regularWalkInRate - yearlyCheckInFee;
    const discount = Math.round((diff / regularWalkInRate) * 100);
    return discount > 0 ? discount : 0;
  }, [regularWalkInRate, yearlyCheckInFee]);

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
      console.warn('Error fetching Supabase pricing settings:', err);
      setSettings(DEFAULT_SETTINGS);
      setSettingsError(
        'Supabase pricing rates unavailable. Displaying standard fallback pricing.'
      );
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
    loadActiveSession();
    const unsub = subscribeRealtime();
    fetchSettings();
    return () => {
      unsub();
    };
  }, [loadActiveSession, subscribeRealtime]);

  return (
    <div className="relative space-y-6">
      {/* DESKTOP LEFT SIDE VERTICAL ARROW */}
      <SideNavTab
        side="left"
        label="MEMBERS"
        title="View Member Directory"
        sidebarOffset={true}
        onClick={() => navigate('/members/list')}
      />

      {/* CONNECTION FALLBACK ALERT BANNER */}
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
                  Unable to sync live subscription rates from Supabase. Default
                  fallback pricing is active for intake operations.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchSettings}
              disabled={isLoadingSettings}
              className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-heading text-[9px] font-bold uppercase tracking-wider rounded-xl transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-xs disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoadingSettings ? 'animate-spin' : ''}`}
              />
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
          setModalConfig({
            isOpen: true,
            mode: 'Import',
            plan: isSessionOpen ? 'Monthly Membership' : 'No Subscription',
          });
        }}
        className="p-5 rounded-3xl bg-linear-to-r from-blue-50 to-slate-100 dark:from-blue-900/30 dark:to-slate-900/40 border border-blue-200 dark:border-blue-500/30 hover:border-blue-400 transition-all cursor-pointer flex items-center justify-between shadow-lg max-w-2xl mx-auto select-none"
      >
        <div className="flex items-center gap-4 text-left">
          <div className="p-3 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/30 shrink-0">
            <Smartphone className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest leading-none block">
              Scan QR Code
            </span>
            <h4 className="font-heading text-base text-slate-900 dark:text-white uppercase leading-none font-bold">
              use camera to scan qr code
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold leading-tight">
              Scan the lobby QR code to quickly import pre-registered member
              data.
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none max-w-3xl mx-auto pt-2 text-left">
          {/* MONTHLY PLAN CARD */}
          <motion.div
            whileHover={
              isMonthlyValid && isSessionOpen ? { y: -4, scale: 1.01 } : {}
            }
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={() => {
              if (!isSessionOpen) {
                toast.warning(
                  'Cannot enroll member: Cash drawer session is closed. Open a cash session in Cash Management first.'
                );
                return;
              }
              setModalConfig({
                isOpen: true,
                mode: 'Import',
                plan: 'Monthly Membership',
              });
            }}
            className={`group relative rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg ${
              !isSessionOpen
                ? 'border-amber-500/30 bg-(--bg-card) opacity-70 cursor-not-allowed'
                : isMonthlyValid
                  ? 'bg-gradient-to-b from-emerald-500/[0.07] via-(--bg-card) to-(--bg-card) border-emerald-500/30 hover:border-emerald-500/70 hover:shadow-emerald-500/10 cursor-pointer'
                  : 'border-rose-500/30 bg-rose-500/5 cursor-not-allowed opacity-75 select-none'
            }`}
          >
            {/* Ambient Glow */}
            <div className="absolute -top-16 -right-16 w-36 h-36 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/25 transition-all" />

            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-start">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                      <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      100% Free Check-Ins
                    </span>
                    {!isSessionOpen && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-500/15 text-amber-600 border border-amber-500/30">
                        <Lock className="w-2.5 h-2.5" /> Session Closed
                      </span>
                    )}
                  </div>

                  <h4 className="font-heading text-xl text-slate-900 dark:text-white uppercase tracking-wider font-extrabold">
                    Monthly Membership
                  </h4>
                </div>

                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm shrink-0">
                  <Award className="w-5 h-5" />
                </div>
              </div>

              {/* Rate Comparison Box */}
              <div className="rounded-2xl p-3 bg-slate-900/5 dark:bg-black/30 border border-slate-200/80 dark:border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    Regular Walk-In Rate:
                  </span>
                  <span className="font-mono line-through text-slate-400 dark:text-slate-500">
                    {regularWalkInRate !== null
                      ? `₱${regularWalkInRate.toLocaleString()} / visit`
                      : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold pt-1.5 border-t border-slate-200 dark:border-white/10">
                  <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-3" /> Daily Check-In Fee:
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 text-sm font-black">
                    ₱0 / FREE
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                Ideal for frequent gym goers. Enjoy unlimited entrance and ₱0
                daily door fee for 30 consecutive days.
              </p>
            </div>

            {/* Price Footer & CTA Button */}
            <div className="flex justify-between items-end border-t border-slate-200/80 dark:border-white/10 pt-4 mt-4 relative z-10">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                  Recurring Fee
                </span>
                <span
                  className={`text-2xl font-mono font-black tracking-tight ${
                    isMonthlyValid
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-zinc-500'
                  }`}
                >
                  {isMonthlyValid
                    ? `₱${settings.monthly_plan_price.toLocaleString()}`
                    : '₱ --'}
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 font-body ml-1">
                    / 30 Days
                  </span>
                </span>
              </div>

              <button
                type="button"
                disabled={!isMonthlyValid || !isSessionOpen}
                onClick={() => {
                  if (!isSessionOpen) {
                    toast.warning(
                      'Cannot enroll subscription: Cash drawer session is closed. Open a cash session in Cash Management first.'
                    );
                    return;
                  }
                  if (isMonthlyValid) {
                    setModalConfig({
                      isOpen: true,
                      mode: 'Manual',
                      plan: 'Monthly Membership',
                    });
                  }
                }}
                className={`py-2.5 px-4 font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none transition-all shadow-md ${
                  !isSessionOpen
                    ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed opacity-60'
                    : isMonthlyValid
                      ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white cursor-pointer shadow-emerald-600/20'
                      : 'bg-neutral-800 text-neutral-400 cursor-not-allowed opacity-60'
                }`}
              >
                {!isSessionOpen
                  ? 'Session Closed'
                  : isMonthlyValid
                    ? 'Select Monthly'
                    : 'Unavailable'}
              </button>
            </div>
          </motion.div>

          {/* YEARLY PLAN CARD */}
          <motion.div
            whileHover={
              isYearlyValid && isSessionOpen ? { y: -4, scale: 1.01 } : {}
            }
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={() => {
              if (!isSessionOpen) {
                toast.warning(
                  'Cannot enroll subscription: Cash drawer session is closed. Open a cash session in Cash Management first.'
                );
                return;
              }
              if (isYearlyValid) {
                setModalConfig({
                  isOpen: true,
                  mode: 'Manual',
                  plan: 'Yearly Membership',
                });
              }
            }}
            className={`group relative rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg ${
              !isSessionOpen
                ? 'border-amber-500/30 bg-(--bg-card) opacity-70 cursor-not-allowed'
                : isYearlyValid
                  ? 'bg-gradient-to-b from-blue-500/[0.07] via-(--bg-card) to-(--bg-card) border-blue-500/30 hover:border-blue-500/70 hover:shadow-blue-500/10 cursor-pointer'
                  : 'border-rose-500/30 bg-rose-500/5 cursor-not-allowed opacity-75 select-none'
            }`}
          >
            {/* Ambient Glow */}
            <div className="absolute -top-16 -right-16 w-36 h-36 bg-blue-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/25 transition-all" />

            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                      <CheckCircle className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      365-Day VIP Tier
                    </span>
                    {!isSessionOpen && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-500/15 text-amber-600 border border-amber-500/30">
                        <Lock className="w-2.5 h-2.5" /> Session Closed
                      </span>
                    )}
                  </div>
                  <h4 className="font-heading text-xl text-slate-900 dark:text-white uppercase tracking-wider font-extrabold mt-2">
                    Yearly Membership
                  </h4>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm shrink-0">
                  <Award className="w-5 h-5" />
                </div>
              </div>

              {/* Rate Comparison Box */}
              <div className="rounded-2xl p-3 bg-slate-900/5 dark:bg-black/30 border border-slate-200/80 dark:border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    Regular Walk-In Rate:
                  </span>
                  <span className="font-mono line-through text-slate-400 dark:text-slate-500">
                    ₱{regularWalkInRate?.toLocaleString()} / visit
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold pt-1.5 border-t border-slate-200 dark:border-white/10">
                  <span className="text-blue-700 dark:text-blue-400 flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-3" /> Member Daily Rate:
                  </span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 text-sm font-black">
                    ₱{yearlyCheckInFee?.toLocaleString()} / visit
                    {yearlyDiscountPercentage !== null &&
                      yearlyDiscountPercentage > 0 && (
                        <span className="ml-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                          {yearlyDiscountPercentage}% OFF
                        </span>
                      )}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                Pay an annual registration fee once, then slash all daily
                walk-in check-in costs
                {yearlyDiscountPercentage !== null &&
                yearlyDiscountPercentage > 0
                  ? ` by ${yearlyDiscountPercentage}%`
                  : ''}{' '}
                for an entire year.
              </p>
            </div>

            {/* Price Footer & CTA Button */}
            <div className="flex justify-between items-end border-t border-slate-200/80 dark:border-white/10 pt-4 mt-4 relative z-10">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                  Annual Pass Fee
                </span>
                <span
                  className={`text-2xl font-mono font-black tracking-tight ${
                    isYearlyValid
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 dark:text-zinc-500'
                  }`}
                >
                  {isYearlyValid
                    ? `₱${settings.yearly_plan_price.toLocaleString()}`
                    : '₱ --'}
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 font-body ml-1">
                    / 1 Year
                  </span>
                </span>
              </div>

              <button
                type="button"
                disabled={!isYearlyValid || !isSessionOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isSessionOpen) {
                    toast.warning(
                      'Cash drawer is closed. Paid subscriptions cannot be transacted.'
                    );
                    return;
                  }
                  if (isYearlyValid) {
                    setModalConfig({
                      isOpen: true,
                      mode: 'Manual',
                      plan: 'Yearly Membership',
                    });
                  }
                }}
                className={`py-2.5 px-4 font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none transition-all shadow-md ${
                  !isSessionOpen
                    ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed opacity-60'
                    : isYearlyValid
                      ? 'bg-[#123c73] dark:bg-[#bf0202] hover:bg-[#0c2950] dark:hover:bg-[#9c0202] active:scale-95 text-white cursor-pointer'
                      : 'bg-neutral-800 text-neutral-400 cursor-not-allowed opacity-60'
                }`}
              >
                {!isSessionOpen
                  ? 'Session Closed'
                  : isYearlyValid
                    ? 'Select Yearly'
                    : 'Unavailable'}
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
        onClose={() =>
          setModalConfig({ isOpen: false, mode: null, plan: null })
        }
        onComplete={() => {
          setModalConfig({ isOpen: false, mode: null, plan: null });
          onOnboardingSuccess?.();
        }}
      />
    </div>
  );
};
