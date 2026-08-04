// src/pages/members/components/SubscriptionPlan.tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Award, Smartphone, CheckCircle, X, Eye, Check, Lock, 
  FileSignature, ChevronLeft, Eraser, UserCheck, ShieldAlert, Search,
  Download, Printer, ChevronDown, ChevronUp, Info
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
import type { OnlineRegistration, PaymentMethod, Member, Subscription, MembershipSettings } from '../../../types/members';

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

  // Load existing signature image onto canvas if interactive mode
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

  // READ-ONLY DISPLAY with On-Demand Image Loading (0 Egress by Default)
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

  // INTERACTIVE DRAWING CANVAS (Used for Manual Entry)
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
  // Directly default to Step 2 when prefillData (Queue Approval) is provided
  const [step, setStep] = useState<number>(() => initialStep !== undefined ? initialStep : (prefillData ? 2 : 1));
  const [, setShowSignatures] = useState<boolean>(false);
  const [showClientDetails, setShowClientDetails] = useState<boolean>(true);
  const [showStatusDetails, setShowStatusDetails] = useState<boolean>(false);
  const [showSignaturesInAudit, setShowSignaturesInAudit] = useState<boolean>(false);
  const [intakeMode, setIntakeMethod] = useState<'Import' | 'Manual' | null>(initialIntakeMode || 'Manual');
  const [selectedPlan, setSelectedPlan] = useState<'Monthly Membership' | 'Yearly Membership' | 'No Subscription'>(
    initialPlan || 'Monthly Membership'
  );
  
  const [settings, setSettings] = useState<MembershipSettings>(DEFAULT_SETTINGS);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [allSubscriptions, setAllSubscriptions] = useState<Subscription[]>([]);

  useEffect(() => {
    if (isOpen) {
      settingsService.load().then(setSettings).catch(console.warn);
      memberService.getAll().then(setAllMembers).catch(console.error);
      subscriptionService.getAll().then(setAllSubscriptions).catch(console.error);
    }
  }, [isOpen]);

  const cardFee = settings.card_printing_fee || 50;
  const gcashFee = settings.gcash_fee || 10;

  // Selected Existing Member State
  const [selectedExistingMember, setSelectedExistingMember] = useState<Member | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');

  // Validation Error State
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
  const [applicantSig, setApplicantSig] = useState<string | null>(null);
  const [parentSig, setParentSig] = useState<string | null>(null);
  const [consentDate, setConsentDate] = useState<string | null>(null);
  const [waiverAgreed, setWaiverAgreed] = useState(false);

  const [manualIdInput, setManualIdInput] = useState('');
  const [isScanning, setIsScanning] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const receiptRef = useRef<OfficialReceiptRef | null>(null);
  const qrRegionId = "fast-intake-qr-reader";

  // SCAN DEBOUNCE REFS
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedIdRef = useRef<string>('');

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [gcashReference, setGcashReference] = useState('');
  const [addIdCard, setAddIdCard] = useState(false);

  const [importedQueueReg, setImportedQueueReg] = useState<OnlineRegistration | null>(null);
  const [finishedIds, setFinishedIds] = useState<{ member_id: string; sub_id: string; receipt_no: string; transaction_date: string } | null>(null);

  // Determine attached active member from DB
  const activeMember = selectedExistingMember || prefillMember;

  // Static locks checking original database state once
  const isNameLocked = Boolean(activeMember?.full_name?.trim());
  const isPhoneLocked = Boolean(activeMember?.phone && activeMember.phone.trim() && activeMember.phone.toLowerCase() !== 'no phone');
  const isBirthdayLocked = Boolean(activeMember?.birthday?.trim());
  const isAddressLocked = Boolean(activeMember?.address?.trim());
  const isEmergencyNameLocked = Boolean(activeMember?.emergency_contact_name?.trim());
  const isEmergencyPhoneLocked = Boolean(activeMember?.emergency_contact_phone && activeMember.emergency_contact_phone.trim() && activeMember.emergency_contact_phone.toLowerCase() !== 'no phone');

  // Check if a field is currently empty for an attached member
  const isMissing = (val: string) => Boolean(activeMember) && (!val || !val.trim() || val.trim().toLowerCase() === 'no phone');

  // Search results for member lookup input
  const matchingSearchMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return [];
    const q = memberSearchQuery.toLowerCase().trim();
    return allMembers.filter((m: Member) => 
      m.full_name.toLowerCase().includes(q) ||
      m.member_id.toLowerCase().includes(q) ||
      (m.phone && m.phone.includes(q))
    );
  }, [memberSearchQuery, allMembers]);

  const getActiveSubscriptionForMember = (memberId: string): Subscription | undefined => {
    return allSubscriptions.find((s: Subscription) => s.member_id === memberId && s.status === 'Active');
  };

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
    setWaiverAgreed(true);
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
    setWaiverAgreed(false);
    setErrors({});
  };

  // Detect matching existing member by name
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

  // Non-blocking helper to detect duplicate contact phone
  const phoneMatchMember = useMemo<Member | null>(() => {
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 7 || cleanPhone.toLowerCase() === 'no phone') return null;

    return allMembers.find((m: Member) => {
      if (selectedExistingMember && m.id === selectedExistingMember.id) return false;
      if (prefillMember && m.id === prefillMember.id) return false;
      return m.phone && m.phone.trim() === cleanPhone;
    }) || null;
  }, [phone, selectedExistingMember, prefillMember, allMembers]);

  const matchActiveSub = useMemo(() => {
    const target = selectedExistingMember || prefillMember || existingMemberMatch;
    if (!target) return undefined;
    return getActiveSubscriptionForMember(target.member_id);
  }, [selectedExistingMember, prefillMember, existingMemberMatch, allSubscriptions]);

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

  const isGcashValid = useMemo(() => {
    const clean = gcashReference.trim();
    return clean.length >= 10 && /^\d+$/.test(clean);
  }, [gcashReference]);

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
    }

    if (!selectedExistingMember && phoneMatchMember) {
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
  }, [importedQueueReg, prefillData, selectedExistingMember, prefillMember, phoneMatchMember]);

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

    if (matchActiveSub) {
      const expDate = matchActiveSub.end_date 
        ? new Date(matchActiveSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'N/A';

      return {
        level: 'red' as const,
        isBlocked: true,
        title: 'Registration Cannot Continue',
        description: `This member already has an active ${matchActiveSub.plan_name} contract (Expires: ${expDate}). A member cannot have two active memberships at the same time.`
      };
    }

    return {
      level: 'green' as const,
      isBlocked: false,
      title: 'Membership Ready',
      description: `${selectedPlan} selected. This member is eligible for registration.`
    };
  }, [selectedPlan, matchActiveSub]);

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
      // Direct to Step 2 if prefilled from Queue Approval
      const startingStep = initialStep !== undefined ? initialStep : (prefillData ? 2 : 1);
      setStep(startingStep);
      setShowClientDetails(true);
      setShowStatusDetails(false);
      setShowSignatures(false);
      setShowSignaturesInAudit(false);
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
      } else {
        setSelectedExistingMember(null);
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
        setConsentDate(null);
        setWaiverAgreed(false);
        setPaymentMethod('Cash');
        setGcashReference('');
        setAddIdCard(false);
        setImportedQueueReg(null);
        setFinishedIds(null);
        setManualIdInput('');
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
        // Ignore cleanup error
      }
    }

    const qrRegion = document.getElementById(qrRegionId);
    const videoElements = qrRegion ? qrRegion.querySelectorAll('video') : document.querySelectorAll('video');

    videoElements.forEach((video) => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
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
        if (parsed.registrationId) {
          cleanId = parsed.registrationId;
        }
      }
    } catch {
      // Raw string fallback
    }

    cleanId = cleanId.toUpperCase().trim();

    // 2.5 second cooldown & deduplication check
    const now = Date.now();
    if (lastScannedIdRef.current === cleanId && (now - lastScanTimeRef.current) < 2500) {
      return;
    }

    lastScannedIdRef.current = cleanId;
    lastScanTimeRef.current = now;

    const list = await registrationService.getQueue();
    const found = list.find((q: OnlineRegistration) => q.id.toUpperCase() === cleanId);

    if (!found) {
      toast.error(`Registration ID ${cleanId} not found.`, {
        toastId: `scan-not-found-${cleanId}`
      });
      return;
    }

    if (found.status !== 'Pending') {
      toast.warning(`Registration ID ${cleanId} has already been ${found.status.toLowerCase()}.`, {
        toastId: `scan-status-${cleanId}`
      });
      return;
    }

    // Stop scanning immediately upon valid ID
    forceStopCamera();
    setIsScanning(false);

    populateRegistrationData(found);
    toast.success(`Validated Profile: ${found.full_name}`, {
      toastId: `scan-success-${cleanId}`
    });
    setIntakeMethod('Manual');
    setStep(2);
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

          html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
            (decodedText) => {
              handleValidateId(decodedText.trim());
            },
            () => {}
          )
          .then(() => {
            if (isCancelled) {
              forceStopCamera();
            }
          })
          .catch((err) => {
            if (!isCancelled) {
              console.error("Camera access failed", err);
              toast.error("Camera access denied or device is busy.", {
                toastId: "camera-denied"
              });
              setIsScanning(false);
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
  }, [isOpen, isScanning, step, intakeMode]);

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};

    if (!lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!phone.trim() || phone.trim().toLowerCase() === 'no phone') newErrors.phone = 'Phone number is required.';
    if (!birthday.trim()) newErrors.birthday = 'Birthday is required.';

    if (!emergencyName.trim()) newErrors.emergencyName = 'Emergency contact name is required.';
    if (!relationship.trim()) newErrors.relationship = 'Relationship is required.';
    if (!emergencyPhone.trim()) newErrors.emergencyPhone = 'Emergency phone is required.';

    if (isMinor) {
      if (!parentName.trim()) newErrors.parentName = 'Parent / Guardian full name is required for minor applicants.';
      if (!parentRelationship.trim()) newErrors.parentRelationship = 'Parent relationship is required.';
      if (!parentPhone.trim()) newErrors.parentPhone = 'Parent contact phone is required.';
      if (!applicantSig) newErrors.applicantSig = 'Applicant digital signature is required.';
      if (!parentSig) newErrors.parentSig = 'Parent / Guardian digital signature is required.';
    }

    if (!waiverAgreed) {
      newErrors.waiverAgreed = 'You must certify and agree to the waiver terms.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStep1Next = () => {
    if (!validateStep1()) {
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
    try {
      if (membershipStatusSummary.isBlocked) {
        toast.error(membershipStatusSummary.description);
        return;
      }

      let targetMember: Member;
      const combinedName = getCombinedFullName();

      const existingByPhone = phone.trim() 
        ? allMembers.find((m: Member) => m.phone === phone.trim()) 
        : null;

      const activeMemberToUse = prefillMember || selectedExistingMember || existingMemberMatch || existingByPhone;

      const memberFields = {
        full_name: combinedName,
        email: email.trim(),
        phone: phone.trim(),
        gender,
        birthday,
        address: address.trim(),
        emergency_contact_name: emergencyName.trim(),
        relationship: relationship.trim(),
        emergency_contact_phone: emergencyPhone.trim(),
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
          totalPrice,
          {
            basePrice: planBasePrice,
            gcashFee: appliedGcashFee,
            cardFee: appliedCardFee,
            gcashRefNo: gcashReference.trim()
          }
        );
      }

      if (addIdCard) {
        await cardService.issue(targetMember.member_id, 'QR', 'Admin Staff');
      }

      if (importedQueueReg) {
        await registrationService.approve(importedQueueReg.id, 'Admin Staff');
      }

      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + 
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

      const receiptNo = createdSub?.receipt_number || `REG-${Date.now().toString().slice(-6)}`;

      setFinishedIds({
        member_id: targetMember.member_id,
        sub_id: createdSub?.id || 'PROFILE-ONLY',
        receipt_no: receiptNo,
        transaction_date: formattedDate
      });

      // Sync Logbook UI
      window.dispatchEvent(new Event('palomar_logbook_updated'));

      toast.success(selectedPlan === 'No Subscription' ? 'Member Profile enrolled (No subscription).' : 'Subscription enrollment complete.');
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || 'System error during wizard checkout.');
    }
  };

  const handleDownloadReceiptImage = () => {
    if (receiptRef.current) {
      receiptRef.current.handleDownloadJpg();
    }
  };

  const handlePrintReceipt = () => {
    if (receiptRef.current) {
      receiptRef.current.handlePrint();
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-120 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="relative bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden font-body text-xs text-(--color-text) max-h-[92vh] flex flex-col">
        
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
            <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none block">Frontdesk Intake Console</span>
            <h3 className="font-heading text-xs sm:text-sm text-slate-900 dark:text-white mt-1 uppercase tracking-wider">
              Step {step} of 3: {
                step === 1 ? (intakeMode === 'Import' ? 'Scan Lobby Pre-Registration' : 'Personal Details & Legal Consent') :
                step === 2 ? 'Checkout Invoice & Membership Plan' : 'Enrollment Complete'
              }
            </h3>
          </div>
          <button 
            onClick={handleModalClose} 
            className="p-1.5 rounded-xl bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-300 dark:border-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
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
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 text-center font-semibold animate-pulse leading-none">
                    Position the lobby QR badge within camera frame
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: MANUAL PERSONAL DETAILS WITH SEARCH LOOKUP */}
          {step === 1 && intakeMode === 'Manual' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-left font-semibold animate-fade-in">
              
              {/* EXISTING MEMBER ATTACHED BANNER */}
              {selectedExistingMember && (
                <div className="md:col-span-2 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl text-blue-900 dark:text-blue-300 text-[10px] font-bold flex items-center justify-between gap-2 shadow-xs">
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
                      Clear / Create New
                    </button>
                  )}
                </div>
              )}

              {/* SEARCH-BASED MEMBER LOOKUP INPUT */}
              {!selectedExistingMember && !prefillData && (
                <div className="md:col-span-2 space-y-2 select-none relative">
                  <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Search Existing Member Profile to Subscribe
                  </label>
                  
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Type Name, Phone, or Member ID to lookup existing profile..."
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:border-blue-500 font-medium"
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

                  {/* AUTOCOMPLETE SUGGESTIONS POPUP LIST */}
                  {memberSearchQuery.trim().length > 0 && (
                    <div className="p-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-h-48 overflow-y-auto space-y-1 z-30 relative">
                      {matchingSearchMembers.length > 0 ? (
                        matchingSearchMembers.map((m: Member) => {
                          const activeSub = getActiveSubscriptionForMember(m.member_id);
                          const isSubscribed = !!activeSub;

                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                if (isSubscribed) {
                                  toast.warning(`"${m.full_name}" already has an active ${activeSub.plan_name} contract.`, {
                                    toastId: `sub-exists-${m.id}`
                                  });
                                  return;
                                }
                                handleSelectExistingMember(m);
                                setMemberSearchQuery('');
                              }}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                isSubscribed 
                                  ? 'bg-slate-100/50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800/60 opacity-60 cursor-not-allowed' 
                                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:border-blue-500/50 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                                  {m.full_name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0 text-left">
                                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate block uppercase">{m.full_name}</span>
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">
                                    {m.member_id} • {m.phone || 'No Phone'}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {isSubscribed ? (
                                  <span className="text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                                    ACTIVE: {activeSub.plan_name}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                    Select Profile
                                  </span>
                                )}
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

              {/* STEP 1: APPLICANT STATUS CARD */}
              <div className={`md:col-span-2 p-3.5 rounded-2xl border transition-all flex flex-col gap-2 ${
                applicantStatusSummary.level === 'amber'
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300'
                  : applicantStatusSummary.level === 'blue'
                  ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-900 dark:text-blue-300'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {applicantStatusSummary.level === 'amber' ? (
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

                {/* COLLAPSIBLE SECONDARY NOTICES */}
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
                            <span>
                              {n.type === 'warning' ? '⚠' : n.type === 'info' ? 'ℹ' : '✓'}
                            </span>
                            <span>{n.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

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

              {/* Phone with Contextual Helper Notice */}
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
                    setPhone(e.target.value.replace(/\D/g, ''))
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
                
                {/* Field-level Notice for Shared Phone */}
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

              {/* Birthday & Age Policy */}
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
                <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Home Address <span className="text-slate-400 font-normal">(optional)</span></span>
                </label>
                <input 
                  type="text" 
                  value={address} 
                  disabled={isAddressLocked}
                  onChange={e => {
                    setAddress(e.target.value);
                    if (errors.address) setErrors(prev => ({ ...prev, address: '' }));
                  }} 
                  className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                    isAddressLocked
                      ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                      : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                  }`} 
                  placeholder="Barangay, City, Province (optional)" 
                />
              </div>

              {/* Emergency Contact */}
              <div className="md:col-span-2 border-b border-slate-200 dark:border-white/10 pb-1 mt-2 select-none">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Emergency Contact</span>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">Emergency Contact Name *</label>
                <input 
                  type="text" 
                  value={emergencyName} 
                  disabled={isEmergencyNameLocked}
                  onChange={e => {
                    setEmergencyName(e.target.value);
                    if (errors.emergencyName) setErrors(prev => ({ ...prev, emergencyName: '' }));
                  }} 
                  className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                    isMissing(emergencyName) || errors.emergencyName 
                      ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400' 
                      : isEmergencyNameLocked
                      ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                      : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                  }`} 
                  placeholder="Contact person's full name" 
                />
                {errors.emergencyName && <span className="text-[9px] text-red-500 font-bold block">{errors.emergencyName}</span>}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">Relationship *</label>
                <select 
                  value={relationship} 
                  disabled={isEmergencyNameLocked}
                  onChange={e => {
                    setRelationship(e.target.value);
                    if (errors.relationship) setErrors(prev => ({ ...prev, relationship: '' }));
                  }} 
                  className="w-full p-2.5 border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl text-xs text-slate-900 dark:text-white outline-none cursor-pointer font-medium"
                >
                  <option value="">Select Relationship *</option>
                  
                  <optgroup label="Immediate Family">
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Spouse / Partner">Spouse / Partner</option>
                    <option value="Husband">Husband</option>
                    <option value="Wife">Wife</option>
                    <option value="Brother">Brother</option>
                    <option value="Sister">Sister</option>
                    <option value="Son">Son</option>
                    <option value="Daughter">Daughter</option>
                  </optgroup>

                  <optgroup label="Extended Family">
                    <option value="Grandmother">Grandmother</option>
                    <option value="Grandfather">Grandfather</option>
                    <option value="Aunt">Aunt</option>
                    <option value="Uncle">Uncle</option>
                    <option value="Cousin">Cousin</option>
                    <option value="Relative">Other Relative</option>
                  </optgroup>

                  <optgroup label="Guardian & Other">
                    <option value="Legal Guardian">Legal Guardian</option>
                    <option value="Friend / Colleague">Friend / Colleague</option>
                    <option value="Other">Other</option>
                  </optgroup>
                </select>
                {errors.relationship && <span className="text-[9px] text-red-500 font-bold block">{errors.relationship}</span>}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 block">Emergency Phone *</label>
                <input 
                  type="text" 
                  value={emergencyPhone} 
                  disabled={isEmergencyPhoneLocked}
                  onChange={e => {
                    setEmergencyPhone(e.target.value.replace(/\D/g, ''));
                    if (errors.emergencyPhone) setErrors(prev => ({ ...prev, emergencyPhone: '' }));
                  }}
                  className={`w-full p-2.5 rounded-xl text-xs outline-none transition-colors ${
                    isMissing(emergencyPhone) || errors.emergencyPhone 
                      ? 'border-2 border-red-500/80 bg-red-500/10 text-red-600 dark:text-red-400' 
                      : isEmergencyPhoneLocked
                      ? 'border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900/60 text-slate-700 dark:text-zinc-400 cursor-not-allowed select-none'
                      : 'border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white'
                  }`} 
                  placeholder="0918XXXXXXX" 
                />
                {errors.emergencyPhone && <span className="text-[9px] text-red-500 font-bold block">{errors.emergencyPhone}</span>}
              </div>

              {/* Digital Signatures (Completely Standalone) */}
              {Boolean(applicantSig || parentSig) && (
                <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-white/10 space-y-2 select-none">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSignature className="w-3.5 h-3.5 text-blue-500" />
                      <span>Digital Signatures</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSignaturesInAudit(!showSignaturesInAudit)}
                      className="px-2.5 py-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors border-none"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                      <span>{showSignaturesInAudit ? 'Hide Signatures' : 'Show Signatures'}</span>
                    </button>
                  </div>

                  {showSignaturesInAudit && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">
                          Applicant Signature
                        </span>
                        {applicantSig ? (
                          <div className="p-1.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-300 dark:border-zinc-700 h-16 flex items-center justify-center">
                            <img src={applicantSig} alt="Applicant Signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic">No signature on file</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">
                          Parent / Guardian Signature
                        </span>
                        {parentSig ? (
                          <div className="p-1.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-300 dark:border-zinc-700 h-16 flex items-center justify-center">
                            <img src={parentSig} alt="Parent Signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic">No signature on file</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Master Waiver Checkbox */}
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
                    I certify that all information provided is accurate and true, and agree to the Wolf Palomar Gym Membership Waiver & Terms. *
                  </span>
                </label>
                {errors.waiverAgreed && <span className="text-[9px] text-red-500 font-bold block mt-1">{errors.waiverAgreed}</span>}
              </div>

            </div>
          )}

          {/* STEP 2: CHECKOUT INVOICE & MEMBERSHIP PLAN SELECTION */}
          {step === 2 && (
            <div className="p-4 sm:p-5 bg-slate-100/90 dark:bg-zinc-900/80 rounded-2xl border border-slate-200 dark:border-zinc-800 text-left space-y-5 animate-fade-in">
              
              <div className="border-b border-slate-200 dark:border-zinc-800 pb-3 space-y-3">
                <div className="flex justify-between items-center select-none font-bold">
                  <div className="flex items-center gap-2">
                    <h4 className="font-heading text-xs tracking-wider uppercase text-slate-900 dark:text-white">Checkout Invoice & Profile Audit</h4>
                    {isMinor ? (
                      <span className="text-[9px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                        MINOR APPLICANT ({calculatedAge} YRS)
                      </span>
                    ) : isRestrictedUnder12 ? (
                      <span className="text-[9px] font-mono bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">
                        RESTRICTED (&lt;12 YRS)
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        ADULT APPLICANT ({calculatedAge} YRS)
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
                    <div className="flex items-center justify-end gap-2 mt-0.5">
                      <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">{phone || 'N/A'}</span>
                      <button 
                        type="button"
                        onClick={() => setShowClientDetails(!showClientDetails)}
                        className="px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {showClientDetails ? 'Hide More Info' : 'Show More Info'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* COMPREHENSIVE CLIENT AUDIT DRAWER */}
                {showClientDetails && (
                  <div className="p-4 bg-white dark:bg-zinc-950/90 border border-slate-200 dark:border-blue-500/20 rounded-2xl space-y-4 animate-fade-in text-[11px] text-slate-700 dark:text-slate-300 font-medium shadow-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Gender / Age</span>
                        <span className="text-slate-900 dark:text-white font-bold">{gender} • {calculatedAge ? `${calculatedAge} yrs old` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Birthday</span>
                        <span className="text-slate-900 dark:text-white font-mono">{birthday || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Email Address</span>
                        <span className="text-slate-900 dark:text-white truncate block">{email || 'N/A'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Home Address</span>
                        <span className="text-slate-900 dark:text-white truncate block">{address || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Emergency Contact</span>
                        <span className="text-slate-900 dark:text-white">{emergencyName || 'N/A'} ({relationship || 'N/A'})</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Emergency Phone</span>
                        <span className="font-mono text-slate-900 dark:text-white">{emergencyPhone || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Digital Signatures */}
                    {Boolean(applicantSig || parentSig) && (
                      <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-white/10 space-y-2 select-none">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <FileSignature className="w-3.5 h-3.5 text-blue-500" />
                            <span>Digital Signatures</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowSignaturesInAudit(!showSignaturesInAudit)}
                            className="px-2.5 py-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors border-none"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-500" />
                            <span>{showSignaturesInAudit ? 'Hide Signatures' : 'Show Signatures'}</span>
                          </button>
                        </div>

                        {showSignaturesInAudit && (
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div>
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">
                                Applicant Signature
                              </span>
                              {applicantSig ? (
                                <div className="p-1.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-300 dark:border-zinc-700 h-16 flex items-center justify-center">
                                  <img src={applicantSig} alt="Applicant Signature" className="max-h-full max-w-full object-contain" />
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">No signature on file</span>
                              )}
                            </div>

                            <div>
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">
                                Parent / Guardian Signature
                              </span>
                              {parentSig ? (
                                <div className="p-1.5 bg-white dark:bg-zinc-950 rounded-xl border border-slate-300 dark:border-zinc-700 h-16 flex items-center justify-center">
                                  <img src={parentSig} alt="Parent Signature" className="max-h-full max-w-full object-contain" />
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-400 italic">No signature on file</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 2 MEMBERSHIP VALIDATION CARD */}
              <div className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                membershipStatusSummary.level === 'red' 
                  ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/30 text-rose-900 dark:text-rose-300' 
                  : membershipStatusSummary.level === 'amber'
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
              }`}>
                {membershipStatusSummary.level === 'red' ? (
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : membershipStatusSummary.level === 'amber' ? (
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}

                <div className="space-y-0.5">
                  <h4 className="font-heading text-xs uppercase tracking-wider font-bold text-slate-900 dark:text-white">
                    {membershipStatusSummary.title}
                  </h4>
                  <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed">
                    {membershipStatusSummary.description}
                  </p>
                </div>
              </div>

              {/* Selected Membership Plan Selector */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 uppercase text-[9px] font-bold tracking-wider block">Select Membership Option</span>
                  {isPlanLocked && (
                    <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider select-none">
                      <Lock className="w-3 h-3" /> Locked for Pre-Registered Applicant
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div 
                    onClick={() => {
                      if (!isPlanLocked) setSelectedPlan('Monthly Membership');
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'Monthly Membership' 
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-bold shadow-md shadow-emerald-500/5' 
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300 dark:hover:text-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">Monthly Plan</span>
                    <span className="font-mono text-sm font-black block mt-1">₱{settings.monthly_plan_price.toLocaleString()}</span>
                  </div>

                  <div 
                    onClick={() => {
                      if (!isPlanLocked) setSelectedPlan('Yearly Membership');
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'Yearly Membership' 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400 font-bold shadow-md shadow-blue-500/5' 
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300 dark:hover:text-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">Yearly Plan</span>
                    <span className="font-mono text-sm font-black block mt-1">₱{settings.yearly_plan_price.toLocaleString()}</span>
                  </div>

                  <div 
                    onClick={() => {
                      if (!isPlanLocked) setSelectedPlan('No Subscription');
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'No Subscription' 
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 font-bold shadow-md shadow-amber-500/5' 
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:border-slate-300 dark:hover:text-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">No Subscription</span>
                    <span className="font-mono text-sm font-black block mt-1">₱0 (Profile Only)</span>
                  </div>
                </div>
              </div>

              {/* Payment Gateway */}
              {selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <span className="text-slate-500 dark:text-slate-400 uppercase text-[9px] font-bold tracking-wider block">Select Payment Gateway</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div 
                      onClick={() => setPaymentMethod('Cash')} 
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-center flex items-center justify-center gap-2 ${paymentMethod === 'Cash' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-bold' : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <span className="text-sm">💰</span>
                      <span className="text-xs font-bold uppercase">Cash</span>
                    </div>
                    <div 
                      onClick={() => setPaymentMethod('GCash')} 
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-center flex items-center justify-center gap-2 ${paymentMethod === 'GCash' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-bold' : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <span className="text-sm">📱</span>
                      <span className="text-xs font-bold uppercase">GCash</span>
                    </div>
                  </div>
                </div>
              )}

              {/* GCash Reference Field */}
              {paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-zinc-800 text-xs font-semibold animate-fade-in">
                  <div className="flex justify-between items-center">
                    <label className={`uppercase text-[9px] font-bold transition-colors ${isGcashValid ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {isGcashValid ? '✓ GCash Reference Code Validated' : 'GCash Transaction Reference No. *'}
                    </label>
                  </div>
                  
                  <input 
                    type="text" 
                    value={gcashReference} 
                    onChange={e => setGcashReference(e.target.value)} 
                    placeholder="Enter 10 to 13-digit Reference Code" 
                    className={`w-full p-2.5 border rounded-xl outline-none font-mono text-xs ${
                      isGcashValid ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300' : 'border-slate-300 dark:border-rose-500/50 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white'
                    }`} 
                  />
                </div>
              )}

              {/* Printed Laminated Card Option */}
              <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between select-none font-semibold">
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-200 block">Issue Printed Laminated Card</span>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">Laminated QR membership card for check-in scanning.</span>
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

              {/* Fee Calculation Breakdown */}
              <div className="border-t border-dashed border-slate-300 dark:border-zinc-800 pt-3 space-y-1 font-mono text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Plan Base Price:</span>
                  <span className="text-slate-900 dark:text-slate-200">₱{planBasePrice.toLocaleString()}.00</span>
                </div>
                {paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span>GCash Convenience Fee:</span>
                    <span>+₱{gcashFee}.00</span>
                  </div>
                )}
                {addIdCard && (
                  <div className="flex justify-between text-blue-700 dark:text-blue-400 font-bold">
                    <span>Printed Card Fee:</span>
                    <span>+₱{cardFee}.00</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-zinc-800">
                  <span>Invoice Total:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-base">₱{totalPrice.toLocaleString()}.00</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: ENROLLMENT COMPLETE */}
          {step === 3 && finishedIds && (
            <div className="py-2 space-y-3 animate-scale-up">
              <div className="text-center space-y-1">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <h4 className="font-heading text-sm tracking-wider text-emerald-600 dark:text-emerald-400 uppercase leading-none font-bold">
                  Intake Successful
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-[10px] font-medium leading-none">
                  The member profile has been enrolled in the database.
                </p>
              </div>

              {/* COMPACT RECEIPT WRAPPER CONTAINER */}
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 max-h-90 overflow-y-auto shadow-inner">
                <OfficialReceipt
                  ref={receiptRef}
                  variant="inline"
                  data={{
                    receiptType: 'subscription',
                    receiptNo: finishedIds.receipt_no,
                    customerName: getCombinedFullName(),
                    planType: selectedPlan === 'No Subscription' ? 'No Subscription (Profile Only)' : selectedPlan,
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
            </div>
          )}

        </div>

        {/* PINNED FIXED FOOTER BAR */}
        <div className="p-4 sm:px-6 border-t border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-[#12141a] flex justify-between items-center shrink-0 select-none">
          {step < 3 ? (
            <>
              <button 
                disabled={step === 1} 
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
                  onClick={handleExecuteCheckout} 
                  disabled={isConfirmDisabled}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none shadow-md shadow-emerald-500/10 transition-all"
                >
                  Confirm Checkout
                </button>
              ) : step === 1 && intakeMode === 'Manual' ? (
                <button 
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadReceiptImage}
                  className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-zinc-700 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-blue-500" />
                  <span>Download Image</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-zinc-700 rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Print Receipt</span>
                </button>
              </div>

              <button 
                onClick={() => {
                  handleModalClose();
                  onComplete?.();
                }} 
                className="px-6 py-2 bg-[#123c73] dark:bg-[#bf0202] hover:bg-[#0c2950] dark:hover:bg-[#9c0202] text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none shadow-md transition-all"
              >
                Close
              </button>
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
};

export interface StaffPlansConsoleProps {
  onOnboardingSuccess?: () => void;
}

export const StaffPlansConsole: React.FC<StaffPlansConsoleProps> = ({ onOnboardingSuccess }) => {
  const navigate = useNavigate();
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    mode: 'Import' | 'Manual' | null;
    plan: 'Monthly Membership' | 'Yearly Membership' | 'No Subscription' | null;
  }>({ isOpen: false, mode: null, plan: null });

  const [settings, setSettings] = useState<MembershipSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    settingsService.load().then(setSettings).catch(console.warn);
  }, []);

  return (
    <div className="relative space-y-6">
      
      {/* DESKTOP LEFT SIDE ARROW */}
      <div className="hidden xl:block">
        <AnimatePresence>
          <motion.button
            key="left-arrow-plans"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 0.9, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => navigate('/members/list')}
            className="group fixed left-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-r border-(--border-color) pl-4 pr-5 py-6 rounded-r-3xl shadow-2xl cursor-pointer flex items-center gap-3 z-45 transition-colors hover:border-(--color-primary-light)/40 hover:bg-(--bg-card)"
          >
            <motion.div 
              animate={{ x: [0, -4, 0] }} 
              transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <ChevronLeft className="w-5 h-5 text-(--color-primary-light)" />
            </motion.div>
            <div className="text-left">
              <span className="text-[8px] font-bold text-slate-400 block tracking-widest uppercase leading-none">View Registry</span>
              <span className="font-heading text-[10px] text-(--color-text) tracking-wider uppercase block mt-1 leading-none group-hover:text-(--color-primary-light) transition-colors">DIRECTORY</span>
            </div>
          </motion.button>
        </AnimatePresence>
      </div>

      {/* CHOICE 1: SCAN LOBBY QR / SEARCH PRE-REGISTRATION */}
      <div 
        onClick={() => { 
          setModalConfig({ isOpen: true, mode: 'Import', plan: 'Monthly Membership' });
        }}
        className="p-5 rounded-3xl bg-linear-to-r from-blue-50 to-slate-100 dark:from-blue-900/30 dark:to-slate-900/40 border border-blue-200 dark:border-blue-500/30 hover:border-blue-400 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between shadow-lg max-w-2xl mx-auto"
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
        <button className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none shrink-0 cursor-pointer">
          Scan Lobby QR
        </button>
      </div>

      {/* CHOICE 2: MANUAL PLAN CATALOG */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none max-w-2xl mx-auto pt-2 text-left">
        <div className="p-6 rounded-3xl bg-(--bg-card) border border-(--border-color) hover:scale-[1.01] transition-transform flex flex-col justify-between h-64 shadow-md">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Intake Choice 2 • Standard Plan</span>
              <Award className="w-5 h-5 text-emerald-500" />
            </div>
            <h4 className="font-heading text-lg text-slate-900 dark:text-white uppercase leading-none">Monthly Membership</h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold leading-relaxed">
              Provides unlimited facility access with standard lobby card scanning. Daily entry fee is calculated as ₱0 per check-in visit.
            </p>
          </div>
          <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
            <span className="text-2xl font-mono font-black text-emerald-600 dark:text-emerald-500">₱{settings.monthly_plan_price.toLocaleString()}</span>
            <button 
              onClick={() => { 
                setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Monthly Membership' });
              }}
              className="py-2.5 px-5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none cursor-pointer hover:bg-[#0c2950] dark:hover:bg-[#9c0202]"
            >
              Select Monthly
            </button>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-(--bg-card) border border-(--border-color) hover:scale-[1.01] transition-transform flex flex-col justify-between h-64 shadow-md">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Intake Choice 2 • Discount Plan</span>
              <Award className="w-5 h-5 text-blue-500" />
            </div>
            <h4 className="font-heading text-lg text-slate-900 dark:text-white uppercase leading-none">Yearly Membership</h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold leading-relaxed">
              Enables discounted facility access key card. Walk-in daily rates are reduced to ₱{settings.yearly_member_checkin_fee.toLocaleString()} per visit.
            </p>
          </div>
          <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
            <span className="text-2xl font-mono font-black text-blue-600 dark:text-blue-500">₱{settings.yearly_plan_price.toLocaleString()}</span>
            <button 
              onClick={() => { 
                setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Yearly Membership' });
              }}
              className="py-2.5 px-5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none cursor-pointer hover:bg-[#0c2950] dark:hover:bg-[#9c0202]"
            >
              Select Yearly
            </button>
          </div>
        </div>
      </div>

      <IntakeWizardModal
        isOpen={modalConfig.isOpen}
        initialIntakeMode={modalConfig.mode}
        initialPlan={modalConfig.plan}
        onClose={() => setModalConfig({ isOpen: false, mode: null, plan: null })}
        onComplete={() => {
          setModalConfig({ isOpen: false, mode: null, plan: null });
          onOnboardingSuccess?.();
        }}
      />
    </div>
  );
};
