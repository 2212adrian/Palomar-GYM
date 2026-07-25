import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Award, Smartphone, CheckCircle, X, Eye, Check, Lock, ShieldCheck, 
  FileSignature, ChevronLeft, Eraser, UserCheck, ShieldAlert
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  memberService, 
  subscriptionService, 
  cardService, 
  registrationService, 
  settingsService, 
  prototypeStorage, 
  STORAGE_KEYS 
} from '../memberService';
import { OfficialReceipt } from '../../../components/ui/OfficialReceipt';
import type { OnlineRegistration, PaymentMethod, Member } from '../../../types/members';

// Canvas Signature Pad Component
interface SignaturePadProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  error?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ label, value, onChange, error }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(!!value);

  useEffect(() => {
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

    if (!value) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
    if (!isDrawing) return;
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
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  };

  return (
    <div className="space-y-1 select-none text-left">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <FileSignature className="w-3.5 h-3.5 text-blue-500" />
          <span>{label}</span>
        </label>
        {hasDrawn && (
          <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
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
            className="px-2 py-0.5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer border-none"
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
  prefillData?: OnlineRegistration;
  prefillMember?: Member;
}

export const IntakeWizardModal: React.FC<IntakeWizardModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  initialPlan,
  initialIntakeMode,
  prefillData,
  prefillMember
}) => {
  const [step, setStep] = useState<number>(1);
  const [showClientDetails, setShowClientDetails] = useState<boolean>(true);
  const [intakeMode, setIntakeMethod] = useState<'Import' | 'Manual' | null>(initialIntakeMode || 'Manual');
  const [selectedPlan, setSelectedPlan] = useState<'Monthly Membership' | 'Yearly Membership' | 'No Subscription'>(
    initialPlan || 'Monthly Membership'
  );

  const settings = useMemo(() => settingsService.load(), []);
  const cardFee = settings.card_printing_fee || 50;
  const gcashFee = settings.gcash_fee || 10;

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
  const qrRegionId = "fast-intake-qr-reader";

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [gcashReference, setGcashReference] = useState('');
  const [addIdCard, setAddIdCard] = useState(false);

  const [importedQueueReg, setImportedQueueReg] = useState<OnlineRegistration | null>(null);
  const [finishedIds, setFinishedIds] = useState<{ member_id: string; sub_id: string; receipt_no: string; transaction_date: string } | null>(null);

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

  // Duplicate Check Engine
  const existingMemberMatch = useMemo<Member | null>(() => {
    if (!firstName.trim() || !lastName.trim()) return null;

    const membersList = memberService.getAll();
    const targetFirst = firstName.trim().toLowerCase();
    const targetLast = lastName.trim().toLowerCase();
    const targetPhone = phone.trim();

    return membersList.find((m) => {
      const flatFullName = m.full_name.toLowerCase();
      const nameMatch = flatFullName.includes(targetFirst) && flatFullName.includes(targetLast);
      const phoneMatch = targetPhone && m.phone === targetPhone;
      return nameMatch || phoneMatch;
    }) || null;
  }, [firstName, lastName, phone]);

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
      setStep(1);
      setShowClientDetails(true);
      setErrors({});
      setIntakeMethod(initialIntakeMode || (prefillData || prefillMember ? 'Manual' : 'Manual'));
      
      if (initialPlan) {
        setSelectedPlan(initialPlan);
      }

      if (prefillMember) {
        parseAndSetFullNameFields(prefillMember.full_name);
        setEmail(prefillMember.email || '');
        setPhone(prefillMember.phone || '');
        setGender(prefillMember.gender || 'Male');
        setBirthday(prefillMember.birthday || '');
        setAddress(prefillMember.address || '');
        setEmergencyName(prefillMember.emergency_contact_name || prefillMember.full_name);
        setRelationship(prefillMember.relationship || 'Guardian / Family');
        setEmergencyPhone(prefillMember.emergency_contact_phone || prefillMember.phone || '');
        setSelectedPlan('Monthly Membership');
        setWaiverAgreed(true);
      } else if (prefillData) {
        populateRegistrationData(prefillData);
      } else {
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
  }, [isOpen, prefillMember, prefillData, initialPlan, initialIntakeMode]);

const handleModalClose = () => {
  forceStopCamera();
  setIsScanning(false);
  onClose();
};

const forceStopCamera = () => {
  // 1. Stop & clear HTML5Qrcode instance
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
      // Ignore cleanup error if already destroyed
    }
  }

  // 2. Hardware Kill Switch: Forcefully stop all active camera tracks in the DOM
  const qrRegion = document.getElementById(qrRegionId);
  const videoElements = qrRegion ? qrRegion.querySelectorAll('video') : document.querySelectorAll('video');

  videoElements.forEach((video) => {
    if (video.srcObject) {
      const stream = video.srcObject as MediaStream;
      if (stream && stream.getTracks) {
        stream.getTracks().forEach((track) => {
          track.stop(); // Immediately releases camera hardware
        });
      }
      video.srcObject = null;
    }
  });
};

  const handleValidateId = (input: string) => {
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

    const list = registrationService.getQueue();
    const found = list.find((q: OnlineRegistration) => q.id.toUpperCase() === cleanId);

    if (!found) {
      toast.error(`Registration ID ${cleanId} not found.`);
      return;
    }

    if (found.status !== 'Pending') {
      toast.warning(`Registration ID ${cleanId} has already been ${found.status.toLowerCase()}.`);
      return;
    }

    populateRegistrationData(found);
    toast.success(`Validated Profile: ${found.full_name}`);
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
          // If modal was closed while start() was initializing
          if (isCancelled) {
            forceStopCamera();
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error("Camera access failed", err);
            toast.error("Camera access denied or device is busy.");
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
      forceStopCamera(); // Force kill hardware on unmount/tab switch
    };
  }
}, [isOpen, isScanning, step, intakeMode]);
  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};

    if (!lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!phone.trim()) newErrors.phone = 'Phone number is required.';
    if (!gender.trim()) newErrors.gender = 'Gender is required.';
    if (!birthday.trim()) newErrors.birthday = 'Birthday is required.';
    if (!address.trim()) newErrors.address = 'Address is required.';

    if (!emergencyName.trim()) newErrors.emergencyName = 'Emergency contact name is required.';
    if (!relationship.trim()) newErrors.relationship = 'Relationship is required.';
    if (!emergencyPhone.trim()) newErrors.emergencyPhone = 'Emergency phone is required.';

    // Duplicate Check Validation (Only for NEW Member Intakes)
    if (!prefillMember && existingMemberMatch) {
      newErrors.firstName = `Duplicate: Profile for "${existingMemberMatch.full_name}" is already registered.`;
      newErrors.lastName = `Member ID ${existingMemberMatch.member_id} already exists in database.`;
    }

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

  const handleExecuteCheckout = () => {
    try {
      let targetMember: Member;
      const combinedName = getCombinedFullName();

      if (prefillMember) {
        targetMember = prefillMember;
      } else {
        targetMember = memberService.create({
          full_name: combinedName,
          email: email.trim(),
          phone: phone.trim(),
          gender,
          birthday,
          address: address.trim(),
          emergency_contact_name: emergencyName.trim(),
          relationship: relationship.trim(),
          emergency_contact_phone: emergencyPhone.trim(),
          status: 'Active'
        }, 'Admin Staff');
      }

      const mappedPayment: PaymentMethod = paymentMethod as PaymentMethod;

      let createdSub = null;
      if (selectedPlan !== 'No Subscription') {
        createdSub = subscriptionService.create(
          targetMember.member_id,
          selectedPlan,
          mappedPayment,
          'Admin Staff'
        );
      }

      if (addIdCard) {
        cardService.issue(targetMember.member_id, 'QR', 'Admin Staff');
      }

      if (importedQueueReg) {
        const queue = registrationService.getQueue();
        const index = queue.findIndex((r: OnlineRegistration) => r.id === importedQueueReg.id);
        if (index !== -1) {
          queue[index].status = 'Approved';
          prototypeStorage.save(STORAGE_KEYS.REGISTRATIONS, queue);
        }
      }

      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + 
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

      setFinishedIds({
        member_id: targetMember.member_id,
        sub_id: createdSub?.id || 'PROFILE-ONLY',
        receipt_no: createdSub?.receipt_number || `REG-${Date.now().toString().slice(-6)}`,
        transaction_date: formattedDate
      });

      toast.success(selectedPlan === 'No Subscription' ? 'Member Profile enrolled (No subscription).' : 'Onboarding complete.');
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || 'System error during wizard checkout.');
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
  const isConfirmDisabled = (paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && !isGcashValid) || isRestrictedUnder12;

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-120 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden font-body text-xs text-(--color-text)">
        
        <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 relative select-none">
          <div 
            className="absolute top-0 left-0 h-full bg-[#123c73] dark:bg-[#bf0202] transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="p-6 md:p-8 space-y-5 max-h-[85vh] overflow-y-auto">
          <div className="flex justify-between items-center border-b border-(--border-color) pb-3 select-none">
            <div>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none block">Frontdesk Intake Console</span>
              <h3 className="font-heading text-sm text-(--color-text) mt-1 uppercase tracking-wider">
                Step {step} of 3: {
                  step === 1 ? (intakeMode === 'Import' ? 'Scan Lobby Pre-Registration' : 'Personal Details & Legal Consent') :
                  step === 2 ? 'Checkout Invoice & Membership Plan' : 'Enrollment Complete'
                }
              </h3>
            </div>
            {step < 3 && (
              <button onClick={handleModalClose} className="p-1 rounded bg-slate-100 dark:bg-neutral-900 border text-slate-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            )}
          </div>

          {/* STEP 1: SCAN / IMPORT PRE-REGISTRATION */}
          {step === 1 && intakeMode === 'Import' && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="flex border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden p-1 bg-zinc-950">
                <button
                  type="button"
                  onClick={() => { setIsScanning(true); }}
                  className={`flex-1 py-2 text-center rounded-lg font-bold text-[10px] uppercase tracking-wide transition-colors ${isScanning ? 'bg-zinc-800 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  📷 Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => { setIsScanning(false); }}
                  className={`flex-1 py-2 text-center rounded-lg font-bold text-[10px] uppercase tracking-wide transition-colors ${!isScanning ? 'bg-zinc-800 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  ⌨️ Type Registration ID
                </button>
              </div>

              {!isScanning ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase text-slate-400">Registration ID *</label>
                    <input 
                      type="text" 
                      value={manualIdInput} 
                      onChange={e => setManualIdInput(e.target.value)} 
                      placeholder="e.g. REG-000001" 
                      className="w-full p-2.5 border border-(--border-color) bg-zinc-900 text-white rounded-xl outline-none text-xs font-mono uppercase tracking-widest placeholder:text-zinc-600" 
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
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider font-heading cursor-pointer border-none"
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
                  <p className="text-[10px] text-slate-400 text-center font-semibold animate-pulse leading-none">
                    Position the lobby QR badge within camera frame
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: MANUAL PERSONAL DETAILS WITH INLINE HIGHLIGHT VALIDATION & SIGNATURES */}
          {step === 1 && intakeMode === 'Manual' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-left font-semibold animate-fade-in">
              {prefillMember && (
                <div className="md:col-span-2 p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] rounded-lg mb-1 font-bold select-none uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Renewing Subscription for Member: {prefillMember.full_name} ({prefillMember.member_id})</span>
                </div>
              )}

              {prefillData && !prefillMember && (
                <div className="md:col-span-2 p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg mb-1 font-bold select-none uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Pre-Registered Applicant Loaded: {prefillData.id}</span>
                </div>
              )}

              <div className="md:col-span-2 border-b border-slate-200 dark:border-white/10 pb-1 select-none">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Personal Details</span>
              </div>

              {/* Last Name */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={lastName} 
                  onChange={e => {
                    setLastName(e.target.value);
                    if (errors.lastName) setErrors(prev => ({ ...prev, lastName: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.lastName 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="e.g. Angeles" 
                />
                {errors.lastName && <span className="text-[9px] text-red-500 font-bold block">{errors.lastName}</span>}
              </div>

              {/* First Name */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={firstName} 
                  onChange={e => {
                    setFirstName(e.target.value);
                    if (errors.firstName) setErrors(prev => ({ ...prev, firstName: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.firstName 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="e.g. Adrian" 
                />
                {errors.firstName && <span className="text-[9px] text-red-500 font-bold block">{errors.firstName}</span>}
              </div>

              {/* Middle Initial & Suffix */}
              <div className="grid grid-cols-2 gap-2 col-span-1">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-slate-400 block">M.I.</label>
                  <input 
                    type="text" 
                    value={middleInitials} 
                    onChange={e => setMiddleInitials(e.target.value)} 
                    maxLength={2}
                    className="w-full p-2.5 border border-(--border-color) bg-slate-100 dark:bg-zinc-900 rounded-xl text-xs text-(--color-text) outline-none" 
                    placeholder="R." 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-slate-400 block">Suffix</label>
                  <input 
                    type="text" 
                    value={suffix} 
                    onChange={e => setSuffix(e.target.value)} 
                    className="w-full p-2.5 border border-(--border-color) bg-slate-100 dark:bg-zinc-900 rounded-xl text-xs text-(--color-text) outline-none" 
                    placeholder="e.g. Jr." 
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">
                  Contact Phone <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={phone} 
                  onChange={e => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.phone 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="0917XXXXXXX" 
                />
                {errors.phone && <span className="text-[9px] text-red-500 font-bold block">{errors.phone}</span>}
              </div>

              {/* Gender */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">Gender *</label>
                <select 
                  value={gender} 
                  onChange={e => setGender(e.target.value)} 
                  className="w-full p-2.5 border border-(--border-color) bg-slate-100 dark:bg-zinc-900 rounded-xl text-xs text-(--color-text) outline-none cursor-pointer"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary</option>
                </select>
              </div>

              {/* Birthday & Age Policy */}
              <div className="grid grid-cols-2 gap-2 col-span-1">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-slate-400 block">Birthday *</label>
                  <input 
                    type="date" 
                    value={birthday} 
                    onChange={e => {
                      setBirthday(e.target.value);
                      if (errors.birthday) setErrors(prev => ({ ...prev, birthday: '' }));
                    }} 
                    className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                      errors.birthday 
                        ? 'border-red-500 bg-red-500/10 text-red-400' 
                        : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-slate-400 block">Age Status</label>
                  <input 
                    type="text" 
                    value={birthday ? `${calculatedAge} yrs (${isRestrictedUnder12 ? 'Restricted' : isMinor ? 'Minor' : 'Adult'})` : '--'} 
                    disabled 
                    className={`w-full p-2.5 border rounded-xl text-xs font-mono font-bold outline-none cursor-not-allowed ${
                      isRestrictedUnder12 ? 'bg-red-500/10 border-red-500/30 text-red-500' :
                      isMinor ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-slate-200 dark:bg-zinc-800 text-slate-300'
                    }`} 
                  />
                </div>
              </div>

              {/* Address */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">Home Address *</label>
                <input 
                  type="text" 
                  value={address} 
                  onChange={e => {
                    setAddress(e.target.value);
                    if (errors.address) setErrors(prev => ({ ...prev, address: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.address 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="Barangay, City, Province" 
                />
                {errors.address && <span className="text-[9px] text-red-500 font-bold block">{errors.address}</span>}
              </div>

              {/* Emergency Contact */}
              <div className="md:col-span-2 border-b border-slate-200 dark:border-white/10 pb-1 mt-2 select-none">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Emergency Contact</span>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">Emergency Contact Name *</label>
                <input 
                  type="text" 
                  value={emergencyName} 
                  onChange={e => {
                    setEmergencyName(e.target.value);
                    if (errors.emergencyName) setErrors(prev => ({ ...prev, emergencyName: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.emergencyName 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="Contact person's full name" 
                />
                {errors.emergencyName && <span className="text-[9px] text-red-500 font-bold block">{errors.emergencyName}</span>}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">Relationship *</label>
                <input 
                  type="text" 
                  value={relationship} 
                  onChange={e => {
                    setRelationship(e.target.value);
                    if (errors.relationship) setErrors(prev => ({ ...prev, relationship: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.relationship 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="e.g. Parent, Spouse" 
                />
                {errors.relationship && <span className="text-[9px] text-red-500 font-bold block">{errors.relationship}</span>}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-slate-400 block">Emergency Phone *</label>
                <input 
                  type="text" 
                  value={emergencyPhone} 
                  onChange={e => {
                    setEmergencyPhone(e.target.value);
                    if (errors.emergencyPhone) setErrors(prev => ({ ...prev, emergencyPhone: '' }));
                  }} 
                  className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                    errors.emergencyPhone 
                      ? 'border-red-500 bg-red-500/10 text-red-400' 
                      : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                  }`} 
                  placeholder="0918XXXXXXX" 
                />
                {errors.emergencyPhone && <span className="text-[9px] text-red-500 font-bold block">{errors.emergencyPhone}</span>}
              </div>

              {/* MINOR CONSENT & SIGNATURE SECTION */}
              {isMinor && (
                <div className="md:col-span-2 space-y-3 pt-2 border-t border-amber-500/30">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[10px] font-bold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>Minor Applicant ({calculatedAge} Yrs): Parent/Guardian consent and dual digital signatures are required.</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] uppercase text-slate-400 block">Parent / Guardian Name *</label>
                      <input 
                        type="text" 
                        value={parentName} 
                        onChange={e => {
                          setParentName(e.target.value);
                          if (errors.parentName) setErrors(prev => ({ ...prev, parentName: '' }));
                        }} 
                        className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                          errors.parentName ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                        }`} 
                        placeholder="Parent or Guardian's Full Name" 
                      />
                      {errors.parentName && <span className="text-[9px] text-red-500 font-bold block">{errors.parentName}</span>}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-400 block">Parent Phone *</label>
                      <input 
                        type="text" 
                        value={parentPhone} 
                        onChange={e => {
                          setParentPhone(e.target.value);
                          if (errors.parentPhone) setErrors(prev => ({ ...prev, parentPhone: '' }));
                        }} 
                        className={`w-full p-2.5 border rounded-xl text-xs outline-none transition-colors ${
                          errors.parentPhone ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-(--border-color) bg-slate-100 dark:bg-zinc-900 text-(--color-text)'
                        }`} 
                        placeholder="0917XXXXXXX" 
                      />
                      {errors.parentPhone && <span className="text-[9px] text-red-500 font-bold block">{errors.parentPhone}</span>}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-400 block">Parent Relationship *</label>
                      <select 
                        value={parentRelationship} 
                        onChange={e => setParentRelationship(e.target.value)} 
                        className="w-full p-2.5 border border-(--border-color) bg-slate-100 dark:bg-zinc-900 rounded-xl text-xs text-(--color-text) outline-none cursor-pointer"
                      >
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                        <option value="Legal Guardian">Legal Guardian</option>
                      </select>
                    </div>

                    {/* Digital Signature Pads */}
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <SignaturePad
                        label="Applicant Digital Signature *"
                        value={applicantSig}
                        onChange={sig => {
                          setApplicantSig(sig);
                          if (errors.applicantSig) setErrors(prev => ({ ...prev, applicantSig: '' }));
                        }}
                        error={errors.applicantSig}
                      />

                      <SignaturePad
                        label="Parent / Guardian Digital Signature *"
                        value={parentSig}
                        onChange={sig => {
                          setParentSig(sig);
                          if (errors.parentSig) setErrors(prev => ({ ...prev, parentSig: '' }));
                        }}
                        error={errors.parentSig}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Master Waiver Checkbox */}
              <div className="md:col-span-2 pt-2 border-t border-(--border-color)">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={waiverAgreed} 
                    onChange={e => {
                      setWaiverAgreed(e.target.checked);
                      if (errors.waiverAgreed) setErrors(prev => ({ ...prev, waiverAgreed: '' }));
                    }} 
                    className="mt-0.5 w-4 h-4 rounded border-zinc-700 text-blue-600 accent-blue-600 cursor-pointer shrink-0" 
                  />
                  <span className="text-[10px] text-slate-300 font-medium leading-tight">
                    I certify that all information provided is accurate and true, and agree to the Wolf Palomar Gym Membership Waiver & Terms. *
                  </span>
                </label>
                {errors.waiverAgreed && <span className="text-[9px] text-red-500 font-bold block mt-1">{errors.waiverAgreed}</span>}
              </div>

            </div>
          )}

          {/* STEP 2: CHECKOUT INVOICE & MEMBERSHIP PLAN SELECTION */}
          {step === 2 && (
            <div className="p-5 bg-zinc-900/80 rounded-2xl border border-zinc-800 text-left space-y-5 animate-fade-in">
              
              <div className="border-b border-zinc-800 pb-3 space-y-3">
                <div className="flex justify-between items-center select-none font-bold">
                  <div className="flex items-center gap-2">
                    <h4 className="font-heading text-xs tracking-wider uppercase text-white">Checkout Invoice & Profile Audit</h4>
                    {isMinor ? (
                      <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                        MINOR APPLICANT ({calculatedAge} YRS)
                      </span>
                    ) : isRestrictedUnder12 ? (
                      <span className="text-[9px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">
                        RESTRICTED (&lt;12 YRS)
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        ADULT APPLICANT ({calculatedAge} YRS)
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 px-2.5 py-0.5 rounded-full border border-blue-500/20">DRAFT</span>
                </div>

                <div className="flex justify-between items-start pt-1">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Client Name</span>
                    <span className="text-sm font-bold text-white block mt-0.5">{getCombinedFullName()}</span>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Client Contact</span>
                    <div className="flex items-center justify-end gap-2 mt-0.5">
                      <span className="text-sm font-mono font-bold text-white">{phone || 'N/A'}</span>
                      <button 
                        type="button"
                        onClick={() => setShowClientDetails(!showClientDetails)}
                        className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {showClientDetails ? 'Hide Full Audit' : 'View Full Audit'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* COMPREHENSIVE CLIENT AUDIT DRAWER */}
                {showClientDetails && (
                  <div className="p-4 bg-zinc-950/90 border border-blue-500/20 rounded-2xl space-y-4 animate-fade-in text-[11px] text-slate-300 font-medium">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Gender / Age</span>
                        <span className="text-white font-bold">{gender} • {calculatedAge ? `${calculatedAge} yrs old` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Birthday</span>
                        <span className="text-white font-mono">{birthday || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Email Address</span>
                        <span className="text-white truncate block">{email || 'N/A'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Home Address</span>
                        <span className="text-white truncate block">{address || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Emergency Contact</span>
                        <span className="text-white">{emergencyName || 'N/A'} ({relationship || 'N/A'})</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold block">Emergency Phone</span>
                        <span className="font-mono text-white">{emergencyPhone || 'N/A'}</span>
                      </div>
                    </div>

                    {isMinor && (
                      <div className="pt-3 border-t border-zinc-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                            Parent / Legal Guardian Legal Verification
                          </span>
                          <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                            ✓ E-Consent Verified
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-zinc-900/90 rounded-xl border border-zinc-800">
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Parent / Guardian Name</span>
                            <span className="text-amber-300 font-bold">{parentName || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Relationship</span>
                            <span className="text-slate-200">{parentRelationship || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 uppercase font-bold block">Parent Contact Phone</span>
                            <span className="text-amber-300 font-mono font-bold">{parentPhone || 'N/A'}</span>
                          </div>
                          {parentEmail && (
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-500 uppercase font-bold block">Parent Email</span>
                              <span className="text-slate-200 truncate block">{parentEmail}</span>
                            </div>
                          )}
                          {consentDate && (
                            <div>
                              <span className="text-[9px] text-slate-500 uppercase font-bold block">Consent Timestamp</span>
                              <span className="text-slate-400 font-mono text-[10px]">
                                {new Date(consentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected Membership Plan Selector (INCLUDES "NO SUBSCRIPTION" OPTION) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider block">Select Membership Option</span>
                  {isPlanLocked && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider select-none">
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
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold shadow-md shadow-emerald-500/5' 
                        : 'border-zinc-800 bg-zinc-950/50 text-slate-500 hover:text-slate-300'
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
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-bold shadow-md shadow-blue-500/5' 
                        : 'border-zinc-800 bg-zinc-950/50 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">Yearly Plan</span>
                    <span className="font-mono text-sm font-black block mt-1">₱{settings.yearly_plan_price.toLocaleString()}</span>
                  </div>

                  {/* OPTION TO SKIP SUBSCRIPTION FOR NOW */}
                  <div 
                    onClick={() => {
                      if (!isPlanLocked) setSelectedPlan('No Subscription');
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPlanLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      selectedPlan === 'No Subscription' 
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400 font-bold shadow-md shadow-amber-500/5' 
                        : 'border-zinc-800 bg-zinc-950/50 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <span className="block text-xs uppercase font-heading">No Subscription</span>
                    <span className="font-mono text-sm font-black block mt-1">₱0 (Profile Only)</span>
                  </div>
                </div>
              </div>

              {/* Payment Gateway */}
              {selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                  <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider block">Select Payment Gateway</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div 
                      onClick={() => setPaymentMethod('Cash')} 
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-center flex items-center justify-center gap-2 ${paymentMethod === 'Cash' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' : 'border-zinc-800 bg-zinc-950/50 text-slate-400 hover:text-white'}`}
                    >
                      <span className="text-sm">💰</span>
                      <span className="text-xs font-bold uppercase">Cash</span>
                    </div>
                    <div 
                      onClick={() => setPaymentMethod('GCash')} 
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-center flex items-center justify-center gap-2 ${paymentMethod === 'GCash' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' : 'border-zinc-800 bg-zinc-950/50 text-slate-400 hover:text-white'}`}
                    >
                      <span className="text-sm">📱</span>
                      <span className="text-xs font-bold uppercase">GCash</span>
                    </div>
                  </div>
                </div>
              )}

              {/* GCash Reference Field */}
              {paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && (
                <div className="space-y-1.5 pt-2 border-t border-zinc-800 text-xs font-semibold animate-fade-in">
                  <div className="flex justify-between items-center">
                    <label className={`uppercase text-[9px] font-bold transition-colors ${isGcashValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isGcashValid ? '✓ GCash Reference Code Validated' : 'GCash Transaction Reference No. *'}
                    </label>
                  </div>
                  
                  <input 
                    type="text" 
                    value={gcashReference} 
                    onChange={e => setGcashReference(e.target.value)} 
                    placeholder="Enter 10 to 13-digit Reference Code" 
                    className={`w-full p-2.5 border rounded-xl outline-none font-mono text-xs ${
                      isGcashValid ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300' : 'border-rose-500/50 bg-zinc-950 text-white'
                    }`} 
                  />
                </div>
              )}

              {/* Printed Laminated Card Option */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between select-none font-semibold">
                <div>
                  <span className="font-bold text-slate-200 block">Issue Printed Laminated Card</span>
                  <span className="text-[9px] text-slate-400 font-medium">Laminated QR membership card for check-in scanning.</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={addIdCard} 
                    onChange={e => setAddIdCard(e.target.checked)} 
                    className="w-4 h-4 rounded border-zinc-700 text-blue-600 accent-blue-600 cursor-pointer" 
                  />
                  <span className="text-[10px] font-bold text-slate-300">Add Card (+₱{cardFee})</span>
                </label>
              </div>

              {/* Fee Calculation Breakdown */}
              <div className="border-t border-dashed border-zinc-800 pt-3 space-y-1 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Plan Base Price:</span>
                  <span>₱{planBasePrice.toLocaleString()}.00</span>
                </div>
                {paymentMethod === 'GCash' && selectedPlan !== 'No Subscription' && (
                  <div className="flex justify-between text-emerald-400 font-bold">
                    <span>GCash Convenience Fee:</span>
                    <span>+₱{gcashFee}.00</span>
                  </div>
                )}
                {addIdCard && (
                  <div className="flex justify-between text-blue-400 font-bold">
                    <span>Printed Card Fee:</span>
                    <span>+₱{cardFee}.00</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-white pt-1.5 border-t border-zinc-800">
                  <span>Invoice Total:</span>
                  <span className="text-emerald-400 text-base">₱{totalPrice.toLocaleString()}.00</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: ENROLLMENT COMPLETE & OFFICIAL RECEIPT */}
          {step === 3 && finishedIds && (
            <div className="py-4 space-y-4 animate-scale-up">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h4 className="font-heading text-base tracking-wider text-emerald-500 uppercase leading-none font-bold">Intake Successful</h4>
                <p className="text-slate-400 text-[10px] font-medium leading-none">The member profile has been enrolled in the database.</p>
              </div>

              {selectedPlan !== 'No Subscription' ? (
                <OfficialReceipt
                  variant="inline"
                  data={{
                    receiptType: 'subscription',
                    receiptNo: finishedIds.receipt_no,
                    paymentRef: paymentMethod === 'GCash' ? gcashReference : undefined,
                    customerName: getCombinedFullName(),
                    planType: selectedPlan,
                    basePrice: planBasePrice,
                    gcashFee: paymentMethod === 'GCash' ? gcashFee : 0,
                    cardFee: addIdCard ? cardFee : 0,
                    paymentMethod: paymentMethod,
                    transactionDate: finishedIds.transaction_date,
                    processedBy: 'WOLF PALOMAR STAFF',
                    qrValue: finishedIds.receipt_no
                  }}
                />
              ) : (
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-center space-y-1">
                  <UserCheck className="w-8 h-8 text-amber-400 mx-auto" />
                  <span className="font-heading text-xs uppercase text-white block">Profile Registered (No Subscription)</span>
                  <span className="text-[10px] font-mono text-slate-400 block">Member ID: {finishedIds.member_id}</span>
                </div>
              )}

              <div className="flex justify-center pt-1 select-none">
                <button 
                  onClick={() => {
                    handleModalClose();
                    onComplete?.();
                  }} 
                  className="px-6 py-2.5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl uppercase tracking-wider text-[10px] font-heading cursor-pointer border-none shadow-md"
                >
                  Finish Intake
                </button>
              </div>
            </div>
          )}

          {/* MODAL FOOTER ACTION BUTTONS */}
          {step < 3 && (
            <div className="flex justify-between gap-3 pt-4 border-t border-(--border-color) select-none">
              <button 
                disabled={step === 1} 
                onClick={handleBack} 
                className="px-4 py-2.5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-300 rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer disabled:opacity-40 disabled:pointer-events-none bg-transparent"
              >
                Back
              </button>
              
              {step === 2 ? (
                <button 
                  onClick={handleExecuteCheckout} 
                  disabled={isConfirmDisabled}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none shadow-md shadow-emerald-500/10"
                >
                  Confirm Checkout
                </button>
              ) : step === 1 && intakeMode === 'Manual' ? (
                <button 
                  onClick={handleStep1Next} 
                  className="px-6 py-2.5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl uppercase tracking-wider text-[9px] font-heading cursor-pointer border-none"
                >
                  Next
                </button>
              ) : (
                <div />
              )}
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

  const settings = useMemo(() => settingsService.load(), []);

  return (
    <div className="relative space-y-6">
      
      {/* ─── DESKTOP LEFT SIDE ARROW: NAVIGATE TO MEMBER LIST / LOGBOOK ─── */}
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
        className="p-5 rounded-3xl bg-linear-to-r from-blue-900/30 to-slate-900/40 border border-blue-500/30 hover:border-blue-400 hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-between shadow-lg max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-4 text-left">
          <div className="p-3 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-500/30 shrink-0">
            <Smartphone className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest leading-none block">Intake Choice 1</span>
            <h4 className="font-heading text-base text-black uppercase dark:text-white leading-none font-bold">Scan Lobby QR / Search Pre-Registration</h4>
            <p className="text-[11px] text-slate-900 dark:text-slate-400 font-semibold leading-tight">
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
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Intake Choice 2 • Standard Plan</span>
              <Award className="w-5 h-5 text-emerald-500" />
            </div>
            <h4 className="font-heading text-lg text-slate-900 dark:text-white uppercase leading-none">Monthly Membership</h4>
            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
              Provides unlimited facility access with standard lobby card scanning. Daily entry fee is calculated as ₱0 per check-in visit.
            </p>
          </div>
          <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
            <span className="text-2xl font-mono font-black text-emerald-500">₱{settings.monthly_plan_price.toLocaleString()}</span>
            <button 
              onClick={() => { 
                setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Monthly Membership' });
              }}
              className="py-2.5 px-5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none cursor-pointer hover:bg-[#9c0202]"
            >
              Select Monthly
            </button>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-(--bg-card) border border-(--border-color) hover:scale-[1.01] transition-transform flex flex-col justify-between h-64 shadow-md">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Intake Choice 2 • Discount Plan</span>
              <Award className="w-5 h-5 text-blue-500" />
            </div>
            <h4 className="font-heading text-lg text-slate-900 dark:text-white uppercase leading-none">Yearly Membership</h4>
            <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
              Enables discounted facility access key card. Walk-in daily rates are reduced to ₱{settings.yearly_member_checkin_fee.toLocaleString()} per visit.
            </p>
          </div>
          <div className="flex justify-between items-end border-t border-(--border-color) pt-4">
            <span className="text-2xl font-mono font-black text-blue-500">₱{settings.yearly_plan_price.toLocaleString()}</span>
            <button 
              onClick={() => { 
                setModalConfig({ isOpen: true, mode: 'Manual', plan: 'Yearly Membership' });
              }}
              className="py-2.5 px-5 bg-[#123c73] dark:bg-[#bf0202] text-white font-bold rounded-xl text-[9px] font-heading tracking-wider uppercase border-none cursor-pointer hover:bg-[#9c0202]"
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