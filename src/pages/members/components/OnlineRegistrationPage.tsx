// src/pages/members/components/OnlineRegistrationPage.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  CheckCircle2, Clock, Download, Copy, RefreshCw, Sparkles, 
  User, Phone, Mail, Calendar, MapPin, HeartHandshake, ShieldCheck, 
  CreditCard, Check, Sun, Moon, FileSignature, Eraser, Info, Users,
  ChevronLeft, ChevronRight, Ban, ShieldAlert, PlusCircle, Ticket
} from 'lucide-react';
import { toast } from 'react-toastify';

import type { OnlineRegistration } from '../../../types/members';
import { registrationService, settingsService } from '../memberService';

import gymLogoDark from '../../../assets/landscape-logo-dark.webp';
import gymLogoLight from '../../../assets/landscape-logo-light.webp';
import gymLogoFallback from '../../../assets/landscape-logo.webp';

const LOCAL_STORAGE_LIST_KEY = 'palomar-online-registrations-list';
const OLD_LOCAL_STORAGE_KEY = 'palomar-online-registration';

const calculateAge = (birthdayStr: string): number => {
  if (!birthdayStr) return 0;
  const birthDate = new Date(birthdayStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
};

// Zod Validation Schema with Optional Home Address
const registrationSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  first_name: z.string().min(1, 'First name is required'),
  middle_initial: z.string().optional(),
  suffix: z.string().optional(),

  phone: z
  .string()
  .min(7, 'Please enter a valid phone number')
  .regex(/^[0-9]+$/, 'Phone number must contain numbers only'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  gender: z.string().min(1, 'Please select your gender'),
  birthday: z.string().min(1, 'Please select your birthday'),
  
  // Home Address is optional
  address: z.string().optional().or(z.literal('')),
  
  same_as_parent: z.boolean().optional(),
  emergency_contact_name: z.string().min(2, 'Emergency contact name is required'),
  emergency_contact_relationship: z.string().min(2, 'Relationship is required'),
  emergency_contact_phone: z
  .string()
  .min(7, 'Emergency contact phone is required')
  .regex(/^[0-9]+$/, 'Emergency phone must contain numbers only'),
  
  preferred_plan: z.enum(['Monthly Membership', 'Yearly Membership'], {
    message: 'Please select a membership plan',
  }),
  
  agreement: z.boolean().refine((val) => val === true, {
    message: 'You must certify and agree to the waiver terms before proceeding',
  }),

  // Minor Fields (12-17 Yrs)
  parent_name: z.string().optional(),
  parent_relationship: z.string().optional(),
  parent_relationship_other: z.string().optional(),
  parent_phone: z
  .string()
  .optional()
  .refine((val) => !val || /^[0-9]+$/.test(val), {
    message: 'Parent phone must contain numbers only',
  }),
  parent_email: z.string().email('Invalid parent email address').optional().or(z.literal('')),
  applicant_signature: z.string().nullable().optional(),
  parent_signature: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  const age = calculateAge(data.birthday);
  
  // Under 12 Policy
  if (data.birthday && age < 12) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Regular online membership is restricted for individuals under 12 years old.',
      path: ['birthday'],
    });
  }

  // Minor Policy (12-17 Yrs)
  if (data.birthday && age >= 12 && age < 18) {
    if (!data.parent_name || data.parent_name.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Parent / Legal Guardian full name is required for minor applicants',
        path: ['parent_name'],
      });
    }

    if (!data.parent_relationship || data.parent_relationship.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Relationship to applicant is required',
        path: ['parent_relationship'],
      });
    }

    if (!data.parent_phone || data.parent_phone.trim().length < 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Parent / Legal Guardian phone number is required',
        path: ['parent_phone'],
      });
    }

    if (!data.applicant_signature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Applicant signature is required for minor applicants',
        path: ['applicant_signature'],
      });
    }

    if (!data.parent_signature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Parent / Legal Guardian signature is required for minor applicants',
        path: ['parent_signature'],
      });
    }
  }
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

interface StoredRegistration {
  registrationId: string;
  qrData: string;
  fullName: string;
  preferredPlan: string;
  submittedAt: string;
  expiresAt: number;
}

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
    <div className="space-y-1.5 select-none">
      <div className="flex justify-between items-center">
        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <FileSignature className="w-3.5 h-3.5 text-blue-500" />
          <span>{label}</span> <span className="text-red-500">*</span>
        </label>
        {hasDrawn && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Check className="w-3 h-3 stroke-3" /> Signed
          </span>
        )}
      </div>

      <div className={`relative rounded-xl overflow-hidden border-2 bg-white transition-colors ${
        error ? 'border-red-500' : hasDrawn ? 'border-emerald-500' : 'border-slate-300 dark:border-zinc-700'
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
          className="w-full h-28 block cursor-crosshair touch-none bg-white"
        />
        <span className="absolute bottom-2 left-3 text-[9px] font-mono font-semibold text-slate-400 pointer-events-none uppercase tracking-widest">
          Draw signature inside box
        </span>
      </div>

      <div className="flex justify-between items-center pt-0.5">
        {error ? (
          <p className="text-[10px] text-red-500 font-medium">{error}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={clearCanvas}
          className="px-2.5 py-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer border-none"
        >
          <Eraser className="w-3 h-3" /> Clear
        </button>
      </div>
    </div>
  );
};

export const OnlineRegistrationPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });

  const [activeRegistrations, setActiveRegistrations] = useState<StoredRegistration[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<StoredRegistration | null>(null);
  const [viewMode, setViewMode] = useState<'form' | 'ticket' | 'list'>('form');

  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const settings = useMemo(() => settingsService.load(), []);

  // Sync Theme on Mount
  useEffect(() => {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDomDark = document.documentElement.classList.contains('dark');
    const isDomLight = document.documentElement.classList.contains('light');

    const shouldBeDark = isDomDark || (!isDomLight && isSystemDark);

    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
  }, []);

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    if (isCurrentlyDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setIsDarkMode(true);
    }
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      last_name: '',
      first_name: '',
      middle_initial: '',
      suffix: '',
      phone: '',
      email: '',
      gender: 'Male',
      birthday: '',
      address: '',
      same_as_parent: true,
      emergency_contact_name: '',
      emergency_contact_relationship: '',
      emergency_contact_phone: '',
      preferred_plan: 'Monthly Membership',
      agreement: false,
      parent_name: '',
      parent_relationship: 'Father',
      parent_relationship_other: '',
      parent_phone: '',
      parent_email: '',
      applicant_signature: null,
      parent_signature: null,
    },
    mode: 'onChange',
  });

  const selectedPlan = watch('preferred_plan');
  const isAgreed = watch('agreement');
  const watchedBirthday = watch('birthday');
  const watchedParentName = watch('parent_name');
  const watchedParentRelationship = watch('parent_relationship');
  const watchedParentPhone = watch('parent_phone');
  const watchedSameAsParent = watch('same_as_parent');
  const watchedApplicantSignature = watch('applicant_signature');
  const watchedParentSignature = watch('parent_signature');

  // Calculated Age & Policy Categories
  const applicantAge = useMemo(() => calculateAge(watchedBirthday), [watchedBirthday]);
  const isRestrictedUnder12 = useMemo(() => !!watchedBirthday && applicantAge < 12, [watchedBirthday, applicantAge]);
  const isMinor = useMemo(() => !!watchedBirthday && applicantAge >= 12 && applicantAge < 18, [watchedBirthday, applicantAge]);

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // Helper to load and validate active registrations created within 24 hours
  const loadRecentRegistrations = () => {
    try {
      let list: StoredRegistration[] = [];

      // Migration check for single stored registration
      const singleRaw = localStorage.getItem(OLD_LOCAL_STORAGE_KEY);
      if (singleRaw) {
        try {
          const parsed = JSON.parse(singleRaw);
          if (parsed && parsed.registrationId) {
            list.push(parsed);
          }
        } catch {}
      }

      const listRaw = localStorage.getItem(LOCAL_STORAGE_LIST_KEY);
      if (listRaw) {
        try {
          const parsedList = JSON.parse(listRaw);
          if (Array.isArray(parsedList)) {
            list = [...list, ...parsedList];
          }
        } catch {}
      }

      // Deduplicate by registrationId
      const uniqueMap = new Map<string, StoredRegistration>();
      list.forEach((item) => uniqueMap.set(item.registrationId, item));

      const now = Date.now();
      const dbQueue = registrationService.getQueue();

      // Filter: Keep only registrations created < 24 Hours ago and still Pending in DB
      const validRecent = Array.from(uniqueMap.values()).filter((item) => {
        const isNotExpiredTime = now < item.expiresAt;
        const submitTime = new Date(item.submittedAt).getTime();
        const isWithin24Hours = (now - submitTime) < (24 * 60 * 60 * 1000);

        const dbRecord = dbQueue.find((q) => q.id === item.registrationId);
        const isPendingInDb = !dbRecord || dbRecord.status === 'Pending';

        return isNotExpiredTime && isWithin24Hours && isPendingInDb;
      });

      // Update storage with cleaned list
      localStorage.setItem(LOCAL_STORAGE_LIST_KEY, JSON.stringify(validRecent));
      if (singleRaw) {
        localStorage.removeItem(OLD_LOCAL_STORAGE_KEY);
      }

      return validRecent;
    } catch {
      return [];
    }
  };

  // Initial Sync of Recent Active Registrations
  useEffect(() => {
    const recent = loadRecentRegistrations();
    setActiveRegistrations(recent);

    if (recent.length > 0) {
      setSelectedTicket(recent[0]);
      setViewMode('ticket');
    } else {
      // Force redirect to registration form if no active registrations < 24h exist
      setViewMode('form');
    }
  }, []);

  // Live Timer Update Interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
      const recent = loadRecentRegistrations();
      setActiveRegistrations(recent);

      if (recent.length === 0 && viewMode !== 'form') {
        setViewMode('form');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [viewMode]);

  // Auto-sync Emergency Contact if "Same as Parent" is checked for Minors
  useEffect(() => {
    if (isMinor && watchedSameAsParent) {
      if (watchedParentName) {
        setValue('emergency_contact_name', watchedParentName, { shouldValidate: true });
      }
      if (watchedParentRelationship) {
        setValue('emergency_contact_relationship', watchedParentRelationship, { shouldValidate: true });
      }
      if (watchedParentPhone) {
        setValue('emergency_contact_phone', watchedParentPhone, { shouldValidate: true });
      }
    }
  }, [isMinor, watchedSameAsParent, watchedParentName, watchedParentRelationship, watchedParentPhone, setValue]);

  // Wizard Step Validation Handler
  const handleNextStep = async () => {
    if (currentStep === 1) {
      const valid = await trigger(['last_name', 'first_name', 'middle_initial', 'suffix', 'phone', 'email', 'gender', 'birthday', 'address']);
      if (!valid) return;

      if (isRestrictedUnder12) {
        toast.error("Registration is not allowed for applicants under 12 years old.");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (isMinor) {
        const validParent = await trigger(['parent_name', 'parent_relationship', 'parent_phone', 'parent_email']);
        if (!validParent) return;

        if (!watchedSameAsParent) {
          const validEmergency = await trigger(['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone']);
          if (!validEmergency) return;
        }
      } else {
        const validEmergency = await trigger(['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone']);
        if (!validEmergency) return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const validPlan = await trigger(['preferred_plan']);
      if (!validPlan) return;
      setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const onSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    try {
      const randStr = Math.random().toString(36).substring(2, 10).toUpperCase();
      const registrationId = `REG-${randStr}`;

      const qrPayload = registrationId;

      // Construct Standardized Full Name: "Last, First M. Suffix"
      const mi = data.middle_initial?.trim() ? ` ${data.middle_initial.trim().replace('.', '')}.` : '';
      const suff = data.suffix?.trim() ? ` ${data.suffix.trim()}` : '';
      const combinedFullName = `${data.last_name.trim()}, ${data.first_name.trim()}${mi}${suff}`;

      const finalParentRelationship = data.parent_relationship === 'Other'
        ? (data.parent_relationship_other?.trim() || 'Other')
        : data.parent_relationship;

      const newReg: OnlineRegistration = {
        id: registrationId,
        full_name: combinedFullName,
        phone: data.phone,
        email: data.email || undefined,
        gender: data.gender,
        birthday: data.birthday,
        address: data.address || '',
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        relationship: data.emergency_contact_relationship,
        preferred_plan: data.preferred_plan,
        status: 'Pending',
        submitted_at: new Date().toISOString(),
        notes: isMinor ? `Minor Applicant (${applicantAge} yrs old) - Parent Consent Verified` : '',

        parent_consent_required: isMinor,
        parent_name: isMinor ? data.parent_name : null,
        parent_relationship: isMinor ? finalParentRelationship : null,
        parent_phone: isMinor ? data.parent_phone : null,
        parent_email: isMinor ? (data.parent_email || null) : null,
        applicant_signature: isMinor ? data.applicant_signature : null,
        parent_signature: isMinor ? data.parent_signature : null,
        consent_date: isMinor ? new Date().toISOString() : null,
        guardian_consent: isMinor ? true : null,
      };

      registrationService.submit(newReg);

      const expiryHours = settings.registration_expiry_hours || 24;
      const expiresAt = Date.now() + expiryHours * 60 * 60 * 1000;

      const storedPayload: StoredRegistration = {
        registrationId,
        qrData: qrPayload,
        fullName: combinedFullName,
        preferredPlan: data.preferred_plan,
        submittedAt: newReg.submitted_at,
        expiresAt,
      };

      // Save to recent active registrations array
      const existingList = loadRecentRegistrations();
      const updatedList = [storedPayload, ...existingList.filter(item => item.registrationId !== registrationId)];
      
      localStorage.setItem(LOCAL_STORAGE_LIST_KEY, JSON.stringify(updatedList));
      setActiveRegistrations(updatedList);
      setSelectedTicket(storedPayload);
      setViewMode('ticket');

      // Reset form data and step back to Step 1 for new entries
      setCurrentStep(1);
      reset();

      toast.success('Pre-registration submitted successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    toast.info('Registration code copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleStartNewRegistration = () => {
    setCurrentStep(1);
    reset();
    setViewMode('form');
  };

  const handleDownloadQR = (targetTicket: StoredRegistration) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(targetTicket.qrData)}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = qrUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 600, 800);

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#123c73';
      ctx.strokeRect(20, 20, 560, 760);

      ctx.fillStyle = '#bf0202';
      ctx.fillRect(20, 20, 560, 12);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#123c73';
      ctx.font = '900 26px sans-serif';
      ctx.fillText('WOLF PALOMAR FITNESS', 300, 75);

      ctx.fillStyle = '#64748b';
      ctx.font = '600 13px sans-serif';
      ctx.fillText('OFFICIAL PRE-REGISTRATION TICKET', 300, 100);

      ctx.drawImage(img, 125, 140, 350, 350);

      ctx.fillStyle = '#0f172a';
      ctx.font = '900 28px monospace';
      ctx.fillText(targetTicket.registrationId, 300, 535);

      ctx.fillStyle = '#123c73';
      ctx.font = '700 18px sans-serif';
      ctx.fillText(targetTicket.fullName, 300, 575);

      const expDate = new Date(targetTicket.expiresAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      ctx.fillStyle = '#bf0202';
      ctx.font = '600 13px sans-serif';
      ctx.fillText(`Expires: ${expDate}`, 300, 620);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(50, 650, 500, 90);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(50, 650, 500, 90);

      ctx.fillStyle = '#475569';
      ctx.font = '500 12px sans-serif';
      ctx.fillText('Present this QR code or Registration Code to the desk staff', 300, 685);
      ctx.fillText('upon arrival at Wolf Palomar Gym to activate membership.', 300, 705);

      const link = document.createElement('a');
      link.download = `Palomar_Registration_${targetTicket.registrationId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Registration QR downloaded!');
    };

    img.onerror = () => {
      toast.error('Failed to prepare QR image download.');
    };
  };

  const getTimeRemaining = (expiresAt: number) => {
    const diff = expiresAt - currentTimeMs;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  };

  const isSubmitDisabled = isSubmitting || !isAgreed || isRestrictedUnder12 || (isMinor && (!watchedApplicantSignature || !watchedParentSignature));

  const wizardSteps = [
    { id: 1, label: 'Personal' },
    { id: 2, label: 'Contacts' },
    { id: 3, label: 'Plan' },
    { id: 4, label: 'Waiver' },
  ];

  return (
    <div className="min-h-screen w-full bg-(--bg-page) text-(--color-text) py-8 px-4 sm:px-6 flex flex-col items-center justify-center transition-colors duration-300">
      
      {/* Top Utility Bar */}
      <div className="w-full max-w-2xl flex justify-between items-center mb-6 px-2 select-none">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
          <span className="text-[11px] font-heading tracking-widest text-slate-500 uppercase font-bold">Self-Service Portal</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Registration Switcher */}
          {activeRegistrations.length > 0 && (
            <div className="flex items-center bg-(--bg-card) border border-(--border-color) p-1 rounded-xl">
              <button
                type="button"
                onClick={handleStartNewRegistration}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
                  viewMode === 'form' 
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Form</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeRegistrations.length === 1) {
                    setSelectedTicket(activeRegistrations[0]);
                    setViewMode('ticket');
                  } else {
                    setViewMode('list');
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
                  viewMode !== 'form' 
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                <span>Active Tickets ({activeRegistrations.length})</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) hover:border-slate-400 text-slate-400 hover:text-slate-200 transition-all cursor-pointer shadow-xs"
            title="Toggle Dark/Light Mode"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>

      {/* Top Hero Header */}
      <div className="text-center max-w-lg mb-6 space-y-2 select-none animate-fade-in">
        <img 
          src={isDarkMode ? (gymLogoDark || gymLogoFallback) : (gymLogoLight || gymLogoFallback)} 
          alt="Wolf Palomar Fitness Gym" 
          className="h-14 sm:h-16 mx-auto object-contain drop-shadow-md"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        <h1 className="font-heading text-lg sm:text-2xl tracking-wider text-slate-900 dark:text-white uppercase font-black leading-tight">
          Join Wolf Palomar Fitness Gym
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium">
          {viewMode === 'form' ? 'Complete your membership pre-registration setup.' : 'Manage your recent membership registration tickets.'}
        </p>
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-2xl bg-(--bg-card) border border-(--border-color) rounded-3xl p-5 sm:p-8 shadow-2xl transition-all duration-300">
        
        {/* ================= VIEW 1: ACTIVE TICKETS LIST ================= */}
        {viewMode === 'list' && activeRegistrations.length > 0 && (
          <div className="space-y-5 animate-fade-in text-left select-none">
            <div className="flex justify-between items-center border-b border-(--border-color) pb-3">
              <div>
                <h2 className="font-heading text-sm uppercase tracking-wider font-bold text-slate-900 dark:text-white">
                  Recent Active Pre-Registrations ({activeRegistrations.length})
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Tickets created within the last 24 hours ready for desk checkout.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartNewRegistration}
                className="py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border-none"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Registration</span>
              </button>
            </div>

            <div className="space-y-3">
              {activeRegistrations.map((ticket) => (
                <div
                  key={ticket.registrationId}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    setViewMode('ticket');
                  }}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 hover:border-blue-500/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                      {ticket.fullName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 dark:text-white block group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {ticket.fullName}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
                        {ticket.registrationId} • {ticket.preferredPlan}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-zinc-800">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-[10px] font-mono font-bold">
                      <Clock className="w-3 h-3" />
                      <span>{getTimeRemaining(ticket.expiresAt)}</span>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-300 dark:border-zinc-700 group-hover:border-blue-500 transition-colors"
                    >
                      View QR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= VIEW 2: TICKET DETAILED VIEW ================= */}
        {viewMode === 'ticket' && selectedTicket && (
          <div className="space-y-6 text-center animate-fade-in select-none py-2">
            
            {activeRegistrations.length > 1 && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to All Tickets ({activeRegistrations.length})
                </button>
              </div>
            )}

            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 inline-block mb-1">
                Active Registration Ticket
              </span>
              <h2 className="font-heading text-lg sm:text-xl uppercase tracking-wider text-slate-900 dark:text-white font-black">
                {selectedTicket.fullName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Please present the QR code below or registration ID to reception desk staff to activate your subscription.
              </p>
            </div>

            <div className="p-5 bg-white rounded-2xl max-w-xs mx-auto border border-slate-200 shadow-inner space-y-3">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(selectedTicket.qrData)}`} 
                alt="Registration QR Code" 
                className="w-52 h-52 sm:w-60 sm:h-60 mx-auto block object-contain"
              />
              <div className="border-t border-slate-100 pt-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase tracking-widest">Manual Registration Code</span>
                <span className="text-lg font-mono font-black text-[#123c73] block tracking-wider mt-0.5">
                  {selectedTicket.registrationId}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-mono font-bold">
              <Clock className="w-4 h-4" />
              <span>
                Registration expires in: {getTimeRemaining(selectedTicket.expiresAt)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDownloadQR(selectedTicket)}
                className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/10 border-none"
              >
                <Download className="w-4 h-4" /> Download QR
              </button>

              <button
                type="button"
                onClick={() => handleCopyCode(selectedTicket.registrationId)}
                className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/10"
              >
                {copiedId === selectedTicket.registrationId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedId === selectedTicket.registrationId ? 'Copied!' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={handleStartNewRegistration}
                className="py-3 px-4 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border-none"
              >
                <PlusCircle className="w-4 h-4" /> Register Another
              </button>
            </div>

          </div>
        )}

        {/* ================= VIEW 3: WIZARD FORM ================= */}
        {viewMode === 'form' && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 text-left">
            
            {/* Visual Stepper Progress Bar */}
            <div className="select-none">
              <div className="flex items-center justify-between relative mb-2">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-zinc-800 -translate-y-1/2 z-0" />
                <div 
                  className="absolute top-1/2 left-0 h-0.5 bg-[#123c73] dark:bg-[#bf0202] -translate-y-1/2 z-0 transition-all duration-300"
                  style={{ width: `${((currentStep - 1) / (wizardSteps.length - 1)) * 100}%` }}
                />

                {wizardSteps.map((step) => {
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;

                  return (
                    <div key={step.id} className="relative z-10 flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-heading text-xs transition-all ${
                        isCompleted
                          ? 'bg-emerald-500 text-white shadow-md'
                          : isActive
                          ? 'bg-[#123c73] dark:bg-[#bf0202] text-white ring-4 ring-blue-500/20 dark:ring-red-500/20'
                          : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                      }`}>
                        {isCompleted ? <Check className="w-4 h-4 stroke-3" /> : step.id}
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${
                        isActive ? 'text-[#123c73] dark:text-[#bf0202]' : 'text-slate-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* STEP 1: PERSONAL INFORMATION */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-2 select-none">
                  <User className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    Step 1: Personal Details
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Last Name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        {...register('last_name')}
                        placeholder="e.g. Dela Cruz"
                        className={`w-full pl-10 pr-4 py-3 bg-(--bg-input) border ${errors.last_name ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors`}
                      />
                    </div>
                    {errors.last_name && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">{errors.last_name.message}</p>
                    )}
                  </div>

                  {/* First Name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        {...register('first_name')}
                        placeholder="e.g. Juan"
                        className={`w-full pl-10 pr-4 py-3 bg-(--bg-input) border ${errors.first_name ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors`}
                      />
                    </div>
                    {errors.first_name && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">{errors.first_name.message}</p>
                    )}
                  </div>

                  {/* Middle Initial & Suffix */}
                  <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        M.I. <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        {...register('middle_initial')}
                        placeholder="e.g. M."
                        className="w-full px-4 py-3 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Suffix <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        {...register('suffix')}
                        placeholder="e.g. Jr."
                        className="w-full px-4 py-3 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors"
                      />
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        maxLength={11}
                        {...register('phone', {
                          onChange: (e) => {
                            e.target.value = e.target.value.replace(/\D/g, '');
                          }
                        })}
                        placeholder="09171234567"
                        className={`w-full pl-10 pr-4 py-3 bg-(--bg-input) border ${errors.phone ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors`}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">{errors.phone.message}</p>
                    )}
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Email Address <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        {...register('email')}
                        placeholder="juan@example.com"
                        className={`w-full pl-10 pr-4 py-3 bg-(--bg-input) border ${errors.email ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors`}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  {/* Gender */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Gender <span className="text-red-500">*</span>
                    </label>
                    <select
                      {...register('gender')}
                      className={`w-full px-4 py-3 bg-(--bg-input) border ${errors.gender ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors cursor-pointer`}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-Binary">Non-Binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    {errors.gender && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">{errors.gender.message}</p>
                    )}
                  </div>

                  {/* Birthday & Age Policy Calculation */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Birthday <span className="text-red-500">*</span>
                      </label>
                      {watchedBirthday && (
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          isRestrictedUnder12
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                            : isMinor 
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        }`}>
                          Age: {applicantAge} {isRestrictedUnder12 ? '(Restricted)' : isMinor ? '(Minor)' : '(Adult)'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        {...register('birthday')}
                        className={`w-full pl-10 pr-4 py-3 bg-(--bg-input) border ${errors.birthday || isRestrictedUnder12 ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors`}
                      />
                    </div>
                    {errors.birthday && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">{errors.birthday.message}</p>
                    )}
                  </div>

                  {/* RESTRICTED AGE POLICY BANNER (0-11 YEARS OLD) */}
                  {isRestrictedUnder12 && (
                    <div className="sm:col-span-2 p-4 rounded-2xl bg-red-500/10 border-2 border-red-500/30 text-red-600 dark:text-red-400 flex items-start gap-3 shadow-xs animate-shake">
                      <Ban className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-left">
                        <span className="font-heading text-xs uppercase tracking-wider font-black block text-red-500">
                          ❌ Registration Prohibited: Age {applicantAge} Years Old
                        </span>
                        <p className="text-[11px] font-medium leading-relaxed">
                          Regular online membership is strictly not permitted for children under 12 years old. Gym access for ages 0–11 is allowed only in supervised youth programs with management approval and continuous parent/legal guardian presence on site.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* MINOR AGE POLICY BANNER (12-17 YEARS OLD) */}
                  {isMinor && (
                    <div className="sm:col-span-2 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-2.5 text-left">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-[11px] font-medium leading-relaxed">
                        <span className="font-bold block">Minor Applicant Policy (Age: {applicantAge} Yrs)</span>
                        Registration is permitted with parent/legal guardian consent, signed waiver, and parent/guardian e-signatures required in the next steps.
                      </div>
                    </div>
                  )}

                  {/* Home Address (Optional) */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Home Address <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <textarea
                        rows={2}
                        {...register('address')}
                        placeholder="Barangay, City, Province (optional)..."
                        className="w-full pl-10 pr-4 py-2.5 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) transition-colors resize-none"
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* STEP 2: EMERGENCY & PARENT/GUARDIAN CONTACTS */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-2 select-none">
                  <HeartHandshake className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    {isMinor ? 'Step 2: Parent / Legal Guardian Details' : 'Step 2: Emergency Contact'}
                  </h2>
                </div>

                {/* Parent Fields (Rendered for Minors 12-17 Yrs) */}
                {isMinor ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Parent / Legal Guardian Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        {...register('parent_name')}
                        placeholder="e.g. Roberto Dela Cruz"
                        className={`w-full px-4 py-3 bg-(--bg-input) border ${errors.parent_name ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)`}
                      />
                      {errors.parent_name && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">{errors.parent_name.message}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Relationship to Applicant <span className="text-red-500">*</span>
                      </label>
                      <select
                        {...register('parent_relationship')}
                        className={`w-full px-4 py-3 bg-(--bg-input) border ${errors.parent_relationship ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary) cursor-pointer`}
                      >
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                        <option value="Legal Guardian">Legal Guardian</option>
                        <option value="Other">Other (specify)</option>
                      </select>
                      {errors.parent_relationship && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">{errors.parent_relationship.message}</p>
                      )}
                    </div>

                    {watchedParentRelationship === 'Other' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Specify Relationship <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          {...register('parent_relationship_other')}
                          placeholder="e.g. Uncle / Aunt / Step-parent"
                          className="w-full px-4 py-3 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Parent Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        {...register('parent_phone')}
                        placeholder="09170000000"
                        className={`w-full px-4 py-3 bg-(--bg-input) border ${errors.parent_phone ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)`}
                      />
                      {errors.parent_phone && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">{errors.parent_phone.message}</p>
                      )}
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Parent Email Address <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="email"
                        {...register('parent_email')}
                        placeholder="parent@example.com"
                        className="w-full px-4 py-3 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)"
                      />
                    </div>

                    {/* Auto-sync Checkbox */}
                    <div className="sm:col-span-2 p-3.5 bg-(--bg-input) rounded-2xl border border-(--border-color) flex items-center justify-between">
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          {...register('same_as_parent')}
                          className="w-4 h-4 rounded border-slate-300 text-[#123c73] dark:text-[#bf0202] focus:ring-0 cursor-pointer"
                        />
                        <span>Use Parent / Legal Guardian as Primary Emergency Contact</span>
                      </label>
                      <Users className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                ) : null}

                {/* Emergency Contact Fields (Adults or Unsynced Minors) */}
                {(!isMinor || !watchedSameAsParent) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Emergency Contact Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        {...register('emergency_contact_name')}
                        placeholder="e.g. Maria Dela Cruz"
                        className={`w-full px-4 py-3 bg-(--bg-input) border ${errors.emergency_contact_name ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)`}
                      />
                      {errors.emergency_contact_name && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">{errors.emergency_contact_name.message}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Relationship <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        {...register('emergency_contact_relationship')}
                        placeholder="e.g. Spouse / Parent / Sibling"
                        className={`w-full px-4 py-3 bg-(--bg-input) border ${errors.emergency_contact_relationship ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)`}
                      />
                      {errors.emergency_contact_relationship && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">{errors.emergency_contact_relationship.message}</p>
                      )}
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Emergency Contact Phone <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          {...register('emergency_contact_phone')}
                          placeholder="09189876543"
                          className={`w-full pl-10 pr-4 py-3 bg-(--bg-input) border ${errors.emergency_contact_phone ? 'border-red-500' : 'border-(--border-color)'} rounded-xl text-xs font-semibold focus:outline-none focus:border-(--color-primary)`}
                        />
                      </div>
                      {errors.emergency_contact_phone && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">{errors.emergency_contact_phone.message}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: MEMBERSHIP PLAN SELECTION */}
            {currentStep === 3 && (
              <div className="space-y-4 select-none animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-2">
                  <CreditCard className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    Step 3: Select Membership Plan
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setValue('preferred_plan', 'Monthly Membership', { shouldValidate: true })}
                    className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                      selectedPlan === 'Monthly Membership'
                        ? 'bg-blue-500/5 dark:bg-red-500/10 border-[#123c73] dark:border-[#bf0202] shadow-md'
                        : 'bg-(--bg-input) border-(--border-color) opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-heading text-xs uppercase tracking-wider font-bold block text-slate-900 dark:text-white">
                          Monthly Membership
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-medium block mt-0.5">
                          30 Consecutive Days
                        </span>
                      </div>
                      {selectedPlan === 'Monthly Membership' && (
                        <span className="w-5 h-5 rounded-full bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-2xl font-heading font-black text-[#123c73] dark:text-[#bf0202]">
                        ₱{settings.monthly_plan_price.toLocaleString()}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-1">
                        Unlimited gym entry for 30 days with ₱0 check-in fee. Ideal for active lifters.
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setValue('preferred_plan', 'Yearly Membership', { shouldValidate: true })}
                    className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                      selectedPlan === 'Yearly Membership'
                        ? 'bg-blue-500/5 dark:bg-red-500/10 border-[#123c73] dark:border-[#bf0202] shadow-md'
                        : 'bg-(--bg-input) border-(--border-color) opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-heading text-xs uppercase tracking-wider font-bold block text-slate-900 dark:text-white">
                          Yearly Membership
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-medium block mt-0.5">
                          365 Days Access Key
                        </span>
                      </div>
                      {selectedPlan === 'Yearly Membership' && (
                        <span className="w-5 h-5 rounded-full bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-2xl font-heading font-black text-[#123c73] dark:text-[#bf0202]">
                        ₱{settings.yearly_plan_price.toLocaleString()}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-1">
                        Access valid for 365 days. Reduced entry check-in fee (₱{settings.yearly_member_checkin_fee.toLocaleString()}/visit).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: WAIVER, DIGITAL SIGNATURES & FINAL SUBMISSION */}
            {currentStep === 4 && (
              <div className="space-y-4 select-none animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-2">
                  <ShieldCheck className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    Step 4: Waiver & Final Certification
                  </h2>
                </div>

                <div className="p-5 rounded-3xl bg-(--bg-input) border border-(--border-color) space-y-4 text-left">
                  
                  {isMinor && (
                    <>
                      {/* Dual Canvas Signatures */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SignaturePad
                          label="Applicant Signature"
                          value={watchedApplicantSignature || null}
                          onChange={(dataUrl) => setValue('applicant_signature', dataUrl, { shouldValidate: true })}
                          error={errors.applicant_signature?.message}
                        />

                        <SignaturePad
                          label="Parent / Guardian Signature"
                          value={watchedParentSignature || null}
                          onChange={(dataUrl) => setValue('parent_signature', dataUrl, { shouldValidate: true })}
                          error={errors.parent_signature?.message}
                        />
                      </div>

                      <div className="flex justify-between items-center text-xs font-semibold pt-1 border-t border-(--border-color)">
                        <span className="text-slate-400 uppercase text-[10px]">Consent Date</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{todayFormatted}</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-(--bg-card) border border-(--border-color) text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                        "I am the parent or legal guardian of the applicant named above. I have carefully read and fully understand the Gym Membership Waiver, Assumption of Risk & Privacy Agreement. I voluntarily give permission for the applicant to participate in activities conducted by Wolf Palomar Fitness Gym. I acknowledge the inherent risks involved and accept responsibility for the applicant's participation."
                      </div>
                    </>
                  )}

                  {/* MASTER CERTIFICATION CHECKBOX */}
                  <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('agreement')}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#123c73] dark:text-[#bf0202] focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                        {isMinor ? (
                          <>
                            I certify that I am the lawful parent/guardian of the applicant, all provided information is accurate, and I voluntarily consent to the applicant's participation under the Gym Waiver. <span className="text-red-500">*</span>
                          </>
                        ) : (
                          <>
                            I certify that all information provided is accurate and true, and I agree to the Wolf Palomar Gym Membership Waiver & Terms. <span className="text-red-500">*</span>
                          </>
                        )}
                      </span>
                    </label>
                    {errors.agreement && (
                      <p className="text-[10px] text-red-500 font-medium mt-2">{errors.agreement.message}</p>
                    )}
                  </div>

                  {/* RA 8792 E-Signature Legal Note */}
                  {isMinor && (
                    <div className="flex items-start gap-2 text-[10px] text-slate-400 leading-relaxed italic">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                      <span>
                        Electronic signatures provided here carry the same legal standing as physical handwritten signatures under Philippine Law (Republic Act No. 8792 - Electronic Commerce Act).
                      </span>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* WIZARD NAVIGATION CONTROL BUTTONS */}
            <div className="flex justify-between items-center pt-4 border-t border-(--border-color) select-none">
              
              {/* Previous Button */}
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="py-3 px-5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 font-heading text-[10px] tracking-wider uppercase font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border-none"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
              ) : (
                <div />
              )}

              {/* Next or Submit Button */}
              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={isRestrictedUnder12}
                  className={`py-3 px-6 rounded-xl font-heading text-[10px] tracking-wider uppercase font-black transition-all flex items-center gap-1.5 border-none shadow-md ${
                    !isRestrictedUnder12
                      ? 'bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white cursor-pointer shadow-blue-500/10 dark:shadow-red-500/10'
                      : 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Next Step <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className={`py-3 px-6 rounded-xl font-heading text-[10px] tracking-wider uppercase font-black transition-all shadow-lg min-h-12 flex items-center justify-center gap-2 border-none ${
                    !isSubmitDisabled
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer shadow-emerald-500/20'
                      : 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Submit Pre-Registration</span>
                    </>
                  )}
                </button>
              )}

            </div>

          </form>
        )}

      </div>

      <footer className="mt-8 text-center text-[10px] text-slate-400 font-mono select-none uppercase tracking-widest">
        Wolf Palomar Fitness Management • Public Self-Service Portal
      </footer>

    </div>
  );
};

export default OnlineRegistrationPage;