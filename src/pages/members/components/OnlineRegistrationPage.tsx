// src/pages/members/components/OnlineRegistrationPage.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2,
  Clock,
  Download,
  Copy,
  RefreshCw,
  Sparkles,
  User,
  Phone,
  Mail,
  Calendar,
  MapPin,
  HeartHandshake,
  ShieldCheck,
  CreditCard,
  Check,
  Sun,
  Moon,
  FileSignature,
  Eraser,
  Users,
  ChevronLeft,
  ChevronRight,
  Ban,
  ShieldAlert,
  PlusCircle,
  Ticket,
  AlertCircle,
  AlertTriangle,
  Scale,
} from 'lucide-react';
import { toast } from 'react-toastify';

import type {
  OnlineRegistration,
  MembershipSettings,
} from '../../../types/members';
import {
  registrationService,
  settingsService,
  DEFAULT_SETTINGS,
} from '../memberService';
import {
  AgreementDocumentViewer,
  type AgreementDocument,
} from '../../../components/ui/AgreementDocumentViewer';

import gymLogoDark from '../../../assets/landscape-logo-dark.webp';
import gymLogoLight from '../../../assets/landscape-logo-light.webp';
import gymLogoFallback from '../../../assets/landscape-logo.webp';

const LOCAL_STORAGE_LIST_KEY = 'palomar-online-registrations-list';
const OLD_LOCAL_STORAGE_KEY = 'palomar-online-registration';
const ONLINE_REGISTRATION_DRAFT_KEY = 'palomar_online_registration_draft_v1';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 Hours Auto-Expiry

// Maximum allowed active tickets per user session
const MAX_ACTIVE_TICKETS = 3;

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

const getNextManilaMidnightMs = (): number => {
  const now = new Date();
  const manilaDateStr = now.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
  });
  const [month, day, year] = manilaDateStr.split('/').map(Number);

  const midnightUtcMs =
    Date.UTC(year, month - 1, day + 1, 0, 0, 0) - 8 * 60 * 60 * 1000;
  return midnightUtcMs;
};

// Zod Validation Schema
const registrationSchema = z
  .object({
    last_name: z.string().min(1, 'Last name is required'),
    first_name: z.string().min(1, 'First name is required'),
    middle_initial: z.string().optional(),
    suffix: z.string().optional(),

    phone: z
      .string()
      .min(7, 'Please enter a valid phone number')
      .regex(/^[0-9]+$/, 'Phone number must contain numbers only'),
    email: z
      .string()
      .email('Invalid email address')
      .optional()
      .or(z.literal('')),
    gender: z.string().min(1, 'Please select your gender'),
    birthday: z.string().min(1, 'Please select your birthday'),

    address: z.string().optional().or(z.literal('')),

    same_as_parent: z.boolean().optional(),
    emergency_contact_name: z.string().optional().or(z.literal('')),
    emergency_contact_relationship: z.string().optional().or(z.literal('')),
    emergency_contact_phone: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => !val || /^[0-9]+$/.test(val), {
        message: 'Emergency phone must contain numbers only',
      })
      .refine((val) => !val || val.length >= 7, {
        message: 'Emergency contact phone must be at least 7 digits',
      }),

    preferred_plan: z.enum(['Monthly Membership', 'Yearly Membership'], {
      message: 'Please select a membership plan',
    }),

    agreement: z.boolean().refine((val) => val === true, {
      message:
        'You must certify and agree to the waiver terms before proceeding',
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
    parent_email: z
      .string()
      .email('Invalid parent email address')
      .optional()
      .or(z.literal('')),
    applicant_signature: z.string().nullable().optional(),
    parent_signature: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.birthday) return;

    const birthDate = new Date(data.birthday);
    const today = new Date();
    const currentYear = today.getFullYear();
    const birthYear = birthDate.getFullYear();

    if (isNaN(birthDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please enter a valid date',
        path: ['birthday'],
      });
      return;
    }

    if (birthDate > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Birthday cannot be in the future',
        path: ['birthday'],
      });
      return;
    }

    const age = calculateAge(data.birthday);
    const MIN_BIRTH_YEAR = currentYear - 120;

    if (age > 120 || birthYear < MIN_BIRTH_YEAR) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Please enter a valid birth year (between ${MIN_BIRTH_YEAR} and ${currentYear})`,
        path: ['birthday'],
      });
      return;
    }

    if (age < 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Regular online membership is restricted for individuals under 12 years old.',
        path: ['birthday'],
      });
      return;
    }

    if (age >= 12 && age < 18) {
      if (!data.parent_name || data.parent_name.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Parent / Legal Guardian full name is required for minor applicants',
          path: ['parent_name'],
        });
      }

      if (
        !data.parent_relationship ||
        data.parent_relationship.trim().length < 2
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Relationship to applicant is required',
          path: ['parent_relationship'],
        });
      }

      if (
        data.parent_relationship === 'Other' &&
        (!data.parent_relationship_other ||
          data.parent_relationship_other.trim().length < 2)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please specify your relationship to the applicant',
          path: ['parent_relationship_other'],
        });
      }

      if (!data.parent_phone || data.parent_phone.trim().length < 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Parent / Legal Guardian phone number is required',
          path: ['parent_phone'],
        });
      }

      if (!data.same_as_parent) {
        if (
          !data.emergency_contact_name ||
          data.emergency_contact_name.trim().length < 2
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Emergency contact name is required',
            path: ['emergency_contact_name'],
          });
        }

        if (
          !data.emergency_contact_relationship ||
          data.emergency_contact_relationship.trim().length < 2
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Relationship is required',
            path: ['emergency_contact_relationship'],
          });
        }

        if (
          !data.emergency_contact_phone ||
          data.emergency_contact_phone.trim().length < 7
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Emergency contact phone is required',
            path: ['emergency_contact_phone'],
          });
        }
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
          message:
            'Parent / Legal Guardian signature is required for minor applicants',
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

interface RegistrationDraftPayload {
  data: Partial<RegistrationFormData>;
  step: number;
  savedAt: number;
}

// Canvas Signature Pad Component
interface SignaturePadProps {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  error?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  value,
  onChange,
  error,
}) => {
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
  }, [value]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
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

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
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
        {hasDrawn ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Check className="w-3 h-3 stroke-3" /> Signed
          </span>
        ) : isDrawing ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            Signing...
          </span>
        ) : null}
      </div>

      <div
        className={`relative rounded-xl overflow-hidden border-2 bg-white transition-colors ${
          error
            ? 'border-red-500 ring-1 ring-red-500/50'
            : hasDrawn
              ? 'border-emerald-500 ring-1 ring-emerald-500/30'
              : isDrawing
                ? 'border-amber-400 ring-1 ring-amber-400/50'
                : 'border-slate-300 dark:border-zinc-700 hover:border-amber-400'
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
  const INITIAL_FORM_VALUES: RegistrationFormData = {
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
  };

  const [agreementDocument, setAgreementDocument] =
    useState<AgreementDocument | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return (
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark')
    );
  });

  // Step 4 Mandatory 3-Second Review Timer
  const [step4Countdown, setStep4Countdown] = useState<number>(3);

  const [activeRegistrations, setActiveRegistrations] = useState<
    StoredRegistration[]
  >([]);
  const [selectedTicket, setSelectedTicket] =
    useState<StoredRegistration | null>(null);
  const [viewMode, setViewMode] = useState<'form' | 'ticket' | 'list'>('form');
  const lastDraftJsonRef = useRef<string>(JSON.stringify(INITIAL_FORM_VALUES));

  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Draft Auto-saving states
  const [draftState, setDraftState] = useState<'saved' | 'saving' | 'idle'>(
    'idle'
  );
  const isRestoringDraft = useRef(false);

  const [settings, setSettings] =
    useState<MembershipSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    settingsService.load().then(setSettings).catch(console.warn);
  }, []);

  // 3-Second Timer Trigger on Entering Step 4
  useEffect(() => {
    if (currentStep === 4) {
      setStep4Countdown(3);
      const timer = setInterval(() => {
        setStep4Countdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setStep4Countdown(3);
    }
  }, [currentStep]);

  // Sync Theme on Mount
  useEffect(() => {
    const isSystemDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
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
    getValues,
    watch,
    trigger,
    reset,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: INITIAL_FORM_VALUES,
    mode: 'onTouched',
  });

  // Character-by-character Draft Auto-Save
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout>;

    const subscription = watch((formValues, { type }) => {
      if (!type || isRestoringDraft.current || isSubmitting) return;

      const currentJson = JSON.stringify(formValues);
      if (currentJson === lastDraftJsonRef.current) return;

      if (currentJson === JSON.stringify(INITIAL_FORM_VALUES)) {
        localStorage.removeItem(ONLINE_REGISTRATION_DRAFT_KEY);
        lastDraftJsonRef.current = currentJson;
        setDraftState('idle');
        return;
      }

      lastDraftJsonRef.current = currentJson;
      setDraftState('saving');

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const payload: RegistrationDraftPayload = {
            data: formValues,
            step: currentStep,
            savedAt: Date.now(),
          };
          localStorage.setItem(
            ONLINE_REGISTRATION_DRAFT_KEY,
            JSON.stringify(payload)
          );
          setDraftState('saved');
        } catch (err) {
          console.warn('Could not write draft to localStorage:', err);
          setDraftState('idle');
        }
      }, 400);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(saveTimer);
    };
  }, [watch, currentStep, isSubmitting]);

  // Restore Draft with 24h Auto-Expiry Check
  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(ONLINE_REGISTRATION_DRAFT_KEY);
      if (!rawDraft) {
        lastDraftJsonRef.current = JSON.stringify(getValues());
        return;
      }

      const parsed: RegistrationDraftPayload = JSON.parse(rawDraft);
      const isExpired = Date.now() - (parsed.savedAt || 0) > DRAFT_MAX_AGE_MS;

      if (isExpired) {
        localStorage.removeItem(ONLINE_REGISTRATION_DRAFT_KEY);
        lastDraftJsonRef.current = JSON.stringify(getValues());
      } else if (parsed.data) {
        isRestoringDraft.current = true;
        reset({ ...parsed.data });
        lastDraftJsonRef.current = JSON.stringify(parsed.data);
        if (parsed.step && parsed.step >= 1 && parsed.step <= 4) {
          setCurrentStep(parsed.step);
        }
        setDraftState('saved');
        toast.info('Registration draft restored.', {
          toastId: 'draft-restored',
        });
        setTimeout(() => {
          isRestoringDraft.current = false;
        }, 100);
      }
    } catch {
      localStorage.removeItem(ONLINE_REGISTRATION_DRAFT_KEY);
    }
  }, [reset, getValues]);

  const watchedValues = watch();
  const selectedPlan = watchedValues.preferred_plan;
  const isAgreed = watchedValues.agreement;
  const watchedBirthday = watchedValues.birthday;
  const watchedParentName = watchedValues.parent_name;
  const watchedParentRelationship = watchedValues.parent_relationship;
  const watchedParentPhone = watchedValues.parent_phone;
  const watchedSameAsParent = watchedValues.same_as_parent;
  const watchedApplicantSignature = watchedValues.applicant_signature;
  const watchedParentSignature = watchedValues.parent_signature;

  const todayStr = new Date().toISOString().split('T')[0];
  const minDateStr = `${new Date().getFullYear() - 120}-01-01`;

  const applicantAge = useMemo(
    () => calculateAge(watchedBirthday),
    [watchedBirthday]
  );
  const isRestrictedUnder12 = useMemo(
    () => !!watchedBirthday && applicantAge < 12,
    [watchedBirthday, applicantAge]
  );
  const isMinor = useMemo(
    () => !!watchedBirthday && applicantAge >= 12 && applicantAge < 18,
    [watchedBirthday, applicantAge]
  );

  const isTicketLimitReached = useMemo(
    () => activeRegistrations.length >= MAX_ACTIVE_TICKETS,
    [activeRegistrations]
  );

  // Mathematically Accurate Live Calculations
  const regularWalkInPrice = 100;
  const yearlyCheckinFee = settings.yearly_member_checkin_fee ?? 70;
  const yearlyDiscountPercent = useMemo(() => {
    if (regularWalkInPrice <= 0) return 0;
    const diff = regularWalkInPrice - yearlyCheckinFee;
    return Math.max(0, Math.round((diff / regularWalkInPrice) * 100));
  }, [yearlyCheckinFee]);

  const yearlySavingsPerVisit = useMemo(() => {
    return Math.max(0, regularWalkInPrice - yearlyCheckinFee);
  }, [yearlyCheckinFee]);

  const getFieldBorderClass = (
    fieldName: keyof RegistrationFormData,
    isWarning?: boolean
  ) => {
    const val = watchedValues[fieldName];
    const err = errors[fieldName];
    const isTouched = touchedFields[fieldName];

    if (err && (isTouched || isSubmitted)) {
      return 'border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 text-slate-900 dark:text-white';
    }

    if (isWarning) {
      return 'border-amber-400 dark:border-amber-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 text-slate-900 dark:text-white';
    }

    if (
      !err &&
      val !== undefined &&
      val !== null &&
      String(val).trim() !== ''
    ) {
      return 'border-emerald-500 dark:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 text-slate-900 dark:text-white';
    }

    return 'border-slate-300 dark:border-zinc-700 focus:border-amber-400 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 text-slate-900 dark:text-white';
  };

  const renderStatusBadge = (
    fieldName: keyof RegistrationFormData,
    isWarning?: boolean
  ) => {
    const val = watchedValues[fieldName];
    const err = errors[fieldName];
    const isTouched = touchedFields[fieldName];

    if (err && (isTouched || isSubmitted)) {
      return <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    }
    if (isWarning) {
      return <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    }
    if (
      !err &&
      val !== undefined &&
      val !== null &&
      String(val).trim() !== ''
    ) {
      return (
        <Check className="w-3.5 h-3.5 text-emerald-500 stroke-3 shrink-0" />
      );
    }
    return null;
  };

  const loadRecentRegistrations = (): StoredRegistration[] => {
    try {
      let list: StoredRegistration[] = [];

      const singleRaw = localStorage.getItem(OLD_LOCAL_STORAGE_KEY);
      if (singleRaw) {
        try {
          const parsed = JSON.parse(singleRaw);
          if (parsed && parsed.registrationId) {
            list.push(parsed);
          }
        } catch {}
        localStorage.removeItem(OLD_LOCAL_STORAGE_KEY);
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

      const uniqueMap = new Map<string, StoredRegistration>();
      list.forEach((item) => uniqueMap.set(item.registrationId, item));

      const now = Date.now();
      const validRecent = Array.from(uniqueMap.values()).filter((item) => {
        return now < item.expiresAt;
      });

      localStorage.setItem(LOCAL_STORAGE_LIST_KEY, JSON.stringify(validRecent));
      return validRecent;
    } catch {
      return [];
    }
  };

  const syncActiveTickets = useCallback(async (showToastNotice = false) => {
    const localTickets = loadRecentRegistrations();
    if (localTickets.length === 0) {
      setActiveRegistrations([]);
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    try {
      const serverQueue = await registrationService.getQueue();

      const serverPendingIds = new Set(
        serverQueue
          .filter(
            (item: OnlineRegistration) =>
              item.status === 'Pending' && !(item as any).is_archived
          )
          .map((item: OnlineRegistration) => item.id)
      );

      const validTickets = localTickets.filter((t) =>
        serverPendingIds.has(t.registrationId)
      );

      if (validTickets.length !== localTickets.length) {
        const removedCount = localTickets.length - validTickets.length;
        localStorage.setItem(
          LOCAL_STORAGE_LIST_KEY,
          JSON.stringify(validTickets)
        );
        setActiveRegistrations(validTickets);

        toast.info(
          removedCount === 1
            ? 'An active registration ticket was processed, archived, or removed by staff.'
            : `${removedCount} tickets were processed, archived, or removed by staff.`
        );

        setSelectedTicket((prevSelected) => {
          if (
            prevSelected &&
            !validTickets.some(
              (vt) => vt.registrationId === prevSelected.registrationId
            )
          ) {
            if (validTickets.length > 0) {
              return validTickets[0];
            } else {
              setViewMode('form');
              return null;
            }
          }
          return prevSelected;
        });
      } else {
        setActiveRegistrations(validTickets);
        if (showToastNotice) {
          toast.success('Active tickets synchronized with server.');
        }
      }
    } catch (err) {
      console.warn('Failed to sync active tickets with server:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const recent = loadRecentRegistrations();
    setActiveRegistrations(recent);

    if (recent.length > 0) {
      setSelectedTicket(recent[0]);
      setViewMode('ticket');
    } else {
      setViewMode('form');
    }

    syncActiveTickets();
  }, [syncActiveTickets]);

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

  useEffect(() => {
    const syncTimer = setInterval(() => {
      syncActiveTickets();
    }, 10000);

    return () => clearInterval(syncTimer);
  }, [syncActiveTickets]);

  useEffect(() => {
    if (isMinor && watchedSameAsParent) {
      if (watchedParentName) {
        setValue('emergency_contact_name', watchedParentName, {
          shouldValidate: true,
        });
      }
      if (watchedParentRelationship) {
        setValue('emergency_contact_relationship', watchedParentRelationship, {
          shouldValidate: true,
        });
      }
      if (watchedParentPhone) {
        setValue('emergency_contact_phone', watchedParentPhone, {
          shouldValidate: true,
        });
      }
    }
  }, [
    isMinor,
    watchedSameAsParent,
    watchedParentName,
    watchedParentRelationship,
    watchedParentPhone,
    setValue,
  ]);

  const handleNextStep = async () => {
    if (currentStep === 1) {
      const valid = await trigger([
        'last_name',
        'first_name',
        'middle_initial',
        'suffix',
        'phone',
        'email',
        'gender',
        'birthday',
        'address',
      ]);
      if (!valid) return;

      if (isRestrictedUnder12) {
        toast.error(
          'Registration is not allowed for applicants under 12 years old.'
        );
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (isMinor) {
        const validParent = await trigger([
          'parent_name',
          'parent_relationship',
          'parent_relationship_other',
          'parent_phone',
          'parent_email',
        ]);
        if (!validParent) return;

        if (!watchedSameAsParent) {
          const validEmergency = await trigger([
            'emergency_contact_name',
            'emergency_contact_relationship',
            'emergency_contact_phone',
          ]);
          if (!validEmergency) return;
        }
      } else {
        const validEmergency = await trigger([
          'emergency_contact_name',
          'emergency_contact_relationship',
          'emergency_contact_phone',
        ]);
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
    if (isTicketLimitReached) {
      toast.error(
        `Limit reached! You can only have up to ${MAX_ACTIVE_TICKETS} active pre-registration tickets at a time.`
      );
      return;
    }

    if (step4Countdown > 0) {
      toast.info(`Please take ${step4Countdown}s to review gym rules.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const randStr = Math.random().toString(36).substring(2, 10).toUpperCase();
      const registrationId = `REG-${randStr}`;
      const qrPayload = registrationId;

      const mi = data.middle_initial?.trim()
        ? ` ${data.middle_initial.trim().replace('.', '')}.`
        : '';
      const suff = data.suffix?.trim() ? ` ${data.suffix.trim()}` : '';
      const combinedFullName = `${data.last_name.trim()}, ${data.first_name.trim()}${mi}${suff}`;

      const finalParentRelationship =
        data.parent_relationship === 'Other'
          ? data.parent_relationship_other?.trim() || 'Other'
          : data.parent_relationship;

      const newReg: OnlineRegistration = {
        id: registrationId,
        full_name: combinedFullName,
        phone: data.phone,
        email: data.email || undefined,
        gender: data.gender,
        birthday: data.birthday,
        address: data.address || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        relationship: data.emergency_contact_relationship || '',
        preferred_plan: data.preferred_plan,
        status: 'Pending',
        submitted_at: new Date().toISOString(),
        notes: `${isMinor ? `Minor Applicant (${applicantAge} yrs old) - Parent Consent Verified. ` : ''}Terms & Conditions and Privacy Policy acknowledged on ${new Date().toISOString()}.`,

        parent_consent_required: isMinor,
        parent_name: isMinor ? data.parent_name : null,
        parent_relationship: isMinor ? finalParentRelationship : null,
        parent_phone: isMinor ? data.parent_phone : null,
        parent_email: isMinor ? data.parent_email || null : null,
        applicant_signature: isMinor ? data.applicant_signature : null,
        parent_signature: isMinor ? data.parent_signature : null,
        consent_date: isMinor ? new Date().toISOString() : null,
        guardian_consent: isMinor ? true : null,
      };

      await registrationService.submit(newReg);
      localStorage.removeItem(ONLINE_REGISTRATION_DRAFT_KEY);

      const expiresAt = getNextManilaMidnightMs();

      const storedPayload: StoredRegistration = {
        registrationId,
        qrData: qrPayload,
        fullName: combinedFullName,
        preferredPlan: data.preferred_plan,
        submittedAt: newReg.submitted_at,
        expiresAt,
      };

      const existingList = loadRecentRegistrations();
      const updatedList = [
        storedPayload,
        ...existingList.filter(
          (item) => item.registrationId !== registrationId
        ),
      ];

      localStorage.setItem(LOCAL_STORAGE_LIST_KEY, JSON.stringify(updatedList));
      setActiveRegistrations(updatedList);
      setSelectedTicket(storedPayload);
      setViewMode('ticket');

      setCurrentStep(1);
      reset();
      setDraftState('idle');

      toast.success('Pre-registration submitted successfully!');
    } catch (err: any) {
      const errorMsg = err?.message || '';
      if (errorMsg.includes('Maximum limit of 3 pending registrations')) {
        toast.error(
          'Limit Reached: You already have 3 pending registrations associated with this phone number.'
        );
      } else {
        toast.error(errorMsg || 'Submission failed. Please try again.');
      }
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
    if (isTicketLimitReached) {
      toast.warning(
        `Maximum of ${MAX_ACTIVE_TICKETS} active tickets reached. Please present your existing tickets at the reception desk.`
      );
      setViewMode('list');
      return;
    }
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
        timeZone: 'Asia/Manila',
      });
      ctx.fillStyle = '#bf0202';
      ctx.font = '600 13px sans-serif';
      ctx.fillText(`Expires: ${expDate} (Manila Time)`, 300, 620);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(50, 650, 500, 90);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(50, 650, 500, 90);

      ctx.fillStyle = '#475569';
      ctx.font = '500 12px sans-serif';
      ctx.fillText(
        'Present this QR code or Registration Code to the desk staff',
        300,
        685
      );
      ctx.fillText(
        'upon arrival at Wolf Palomar Gym to activate membership.',
        300,
        705
      );

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

  const isSubmitDisabled =
    isSubmitting ||
    !isAgreed ||
    step4Countdown > 0 ||
    isRestrictedUnder12 ||
    isTicketLimitReached ||
    (isMinor && (!watchedApplicantSignature || !watchedParentSignature));

  const wizardSteps = [
    { id: 1, label: 'Personal' },
    { id: 2, label: 'Contacts' },
    { id: 3, label: 'Plan' },
    { id: 4, label: 'Waiver' },
  ];

  return (
    <div className="min-h-screen w-full bg-(--bg-page) text-(--color-text) py-6 sm:py-10 px-3 sm:px-6 lg:px-8 flex flex-col items-center justify-start sm:justify-center transition-colors duration-300">
      {/* Top Utility Bar (Fluid Max-w-4xl) */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 sm:mb-6 px-1 sm:px-2 select-none">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse shrink-0" />
          <span className="text-[10px] sm:text-[11px] font-heading tracking-widest text-slate-500 uppercase font-bold">
            Self-Service Portal
          </span>

          {/* Real-time Draft Saving Status Indicator */}
          {viewMode === 'form' && draftState !== 'idle' && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-zinc-700 animate-fade-in">
              {draftState === 'saving' ? (
                <>
                  <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                  <span>Saving draft...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-500 stroke-3" />
                  <span>Draft saved (24h)</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeRegistrations.length > 0 && (
            <div className="flex items-center bg-(--bg-card) border border-(--border-color) p-1 rounded-xl">
              <button
                type="button"
                onClick={handleStartNewRegistration}
                disabled={isTicketLimitReached}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
                  viewMode === 'form'
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                } ${isTicketLimitReached ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  isTicketLimitReached
                    ? `Maximum limit of ${MAX_ACTIVE_TICKETS} tickets reached`
                    : ''
                }
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Form</span>
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
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
                  viewMode !== 'form'
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Tickets ({activeRegistrations.length}/{MAX_ACTIVE_TICKETS})
                </span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 sm:p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) hover:border-slate-400 text-slate-400 hover:text-slate-200 transition-all cursor-pointer shadow-xs shrink-0"
            title="Toggle Dark/Light Mode"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>

      {/* Top Hero Header */}
      <div className="text-center max-w-lg mb-5 sm:mb-6 space-y-2 select-none animate-fade-in px-2">
        <img
          src={
            isDarkMode
              ? gymLogoDark || gymLogoFallback
              : gymLogoLight || gymLogoFallback
          }
          alt="Wolf Palomar Fitness Gym"
          className="h-12 sm:h-16 mx-auto object-contain drop-shadow-md"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        <h1 className="font-heading text-base sm:text-xl md:text-2xl tracking-wider text-slate-900 dark:text-white uppercase font-black leading-tight">
          Join Wolf Palomar Fitness Gym
        </h1>
        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium">
          {viewMode === 'form'
            ? 'Complete your membership pre-registration setup.'
            : 'Manage your recent membership registration tickets.'}
        </p>
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-4xl bg-(--bg-card) border border-(--border-color) rounded-3xl p-4 sm:p-7 lg:p-9 shadow-2xl transition-all duration-300">
        {/* ================= VIEW 1: ACTIVE TICKETS LIST ================= */}
        {viewMode === 'list' && activeRegistrations.length > 0 && (
          <div className="space-y-5 animate-fade-in text-left select-none">
            <div className="flex justify-between items-center border-b border-(--border-color) pb-3">
              <div>
                <h2 className="font-heading text-sm uppercase tracking-wider font-bold text-slate-900 dark:text-white">
                  Recent Active Pre-Registrations ({activeRegistrations.length}/
                  {MAX_ACTIVE_TICKETS})
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Tickets active until 12:00 AM Manila Time ready for desk
                  checkout.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => syncActiveTickets(true)}
                  disabled={isSyncing}
                  className="p-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 dark:border-white/5"
                  title="Check ticket status from server"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-500' : ''}`}
                  />
                  <span>Sync</span>
                </button>

                {!isTicketLimitReached && (
                  <button
                    type="button"
                    onClick={handleStartNewRegistration}
                    className="py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border-none"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>New Registration</span>
                  </button>
                )}
              </div>
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
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to All Tickets (
                  {activeRegistrations.length})
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
                Please present the QR code below or registration ID to reception
                desk staff to activate your subscription.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-white rounded-2xl max-w-xs mx-auto border border-slate-200 shadow-inner space-y-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(selectedTicket.qrData)}`}
                alt="Registration QR Code"
                className="w-48 h-48 sm:w-56 sm:h-56 mx-auto block object-contain"
              />
              <div className="border-t border-slate-100 pt-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase tracking-widest">
                  Manual Registration Code
                </span>
                <span className="text-lg font-mono font-black text-[#123c73] block tracking-wider mt-0.5">
                  {selectedTicket.registrationId}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-mono font-bold">
              <Clock className="w-4 h-4" />
              <span>
                Ticket valid for: {getTimeRemaining(selectedTicket.expiresAt)}{' '}
                (Until 12 AM Manila)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              <button
                type="button"
                onClick={() => syncActiveTickets(true)}
                disabled={isSyncing}
                className="py-2.5 sm:py-3 px-3 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-300 dark:border-zinc-700"
                title="Sync with server"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-500' : ''}`}
                />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadQR(selectedTicket)}
                className="py-2.5 sm:py-3 px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-500/10 border-none"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>

              <button
                type="button"
                onClick={() => handleCopyCode(selectedTicket.registrationId)}
                className="py-2.5 sm:py-3 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/10"
              >
                {copiedId === selectedTicket.registrationId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedId === selectedTicket.registrationId
                    ? 'Copied!'
                    : 'Copy'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleStartNewRegistration}
                disabled={isTicketLimitReached}
                className={`py-2.5 sm:py-3 px-3 rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold flex items-center justify-center gap-1.5 transition-all border-none ${
                  !isTicketLimitReached
                    ? 'bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 cursor-pointer'
                    : 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed opacity-60'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" /> New Form
              </button>
            </div>
          </div>
        )}

        {/* ================= VIEW 3: WIZARD FORM ================= */}
        {viewMode === 'form' && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6 text-left"
          >
            {/* Limit Banner Alert */}
            {isTicketLimitReached && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-start gap-3 shadow-xs">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1 text-left">
                  <span className="font-heading text-xs uppercase tracking-wider font-black block text-amber-500">
                    ⚠️ Maximum Active Ticket Limit Reached ({MAX_ACTIVE_TICKETS}
                    /{MAX_ACTIVE_TICKETS})
                  </span>
                  <p className="text-[11px] font-medium leading-relaxed">
                    You currently have 3 active pre-registration tickets. New
                    registration submissions are locked until your current
                    tickets expire at midnight (12:00 AM Manila Time) or are
                    processed at the front desk.
                  </p>
                </div>
              </div>
            )}

            {/* Visual Stepper Progress Bar */}
            <div className="select-none px-2">
              <div className="flex items-center justify-between relative mb-2">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-zinc-800 -translate-y-1/2 z-0" />
                <div
                  className="absolute top-1/2 left-0 h-0.5 bg-[#123c73] dark:bg-[#bf0202] -translate-y-1/2 z-0 transition-all duration-300"
                  style={{
                    width: `${((currentStep - 1) / (wizardSteps.length - 1)) * 100}%`,
                  }}
                />

                {wizardSteps.map((step) => {
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;

                  return (
                    <div
                      key={step.id}
                      className="relative z-10 flex flex-col items-center"
                    >
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-heading text-xs transition-all ${
                          isCompleted
                            ? 'bg-emerald-500 text-white shadow-md'
                            : isActive
                              ? 'bg-[#123c73] dark:bg-[#bf0202] text-white ring-4 ring-blue-500/20 dark:ring-red-500/20'
                              : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-3" />
                        ) : (
                          step.id
                        )}
                      </div>
                      <span
                        className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-1 ${
                          isActive
                            ? 'text-[#123c73] dark:text-[#bf0202]'
                            : 'text-slate-400'
                        }`}
                      >
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* Last Name */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      {renderStatusBadge('last_name')}
                    </div>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        {...register('last_name')}
                        placeholder="e.g. Dela Cruz"
                        className={`w-full pl-10 pr-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('last_name')}`}
                      />
                    </div>
                    {errors.last_name && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.last_name.message}
                      </p>
                    )}
                  </div>

                  {/* First Name */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      {renderStatusBadge('first_name')}
                    </div>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        {...register('first_name')}
                        placeholder="e.g. Juan"
                        className={`w-full pl-10 pr-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('first_name')}`}
                      />
                    </div>
                    {errors.first_name && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.first_name.message}
                      </p>
                    )}
                  </div>

                  {/* Middle Initial & Suffix */}
                  <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          M.I.{' '}
                          <span className="text-slate-400 font-normal">
                            (optional)
                          </span>
                        </label>
                        {renderStatusBadge('middle_initial')}
                      </div>
                      <input
                        type="text"
                        maxLength={2}
                        {...register('middle_initial')}
                        placeholder="e.g. M."
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('middle_initial')}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Suffix{' '}
                          <span className="text-slate-400 font-normal">
                            (optional)
                          </span>
                        </label>
                        {renderStatusBadge('suffix')}
                      </div>
                      <input
                        type="text"
                        {...register('suffix')}
                        placeholder="e.g. Jr."
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('suffix')}`}
                      />
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      {renderStatusBadge('phone')}
                    </div>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        maxLength={11}
                        {...register('phone', {
                          onChange: (e) => {
                            e.target.value = e.target.value.replace(/\D/g, '');
                          },
                        })}
                        placeholder="09171234567"
                        className={`w-full pl-10 pr-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('phone')}`}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Email Address{' '}
                        <span className="text-slate-400 font-normal">
                          (optional)
                        </span>
                      </label>
                      {renderStatusBadge('email')}
                    </div>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        {...register('email')}
                        placeholder="juan@example.com"
                        className={`w-full pl-10 pr-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('email')}`}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* Gender */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      {renderStatusBadge('gender')}
                    </div>
                    <select
                      {...register('gender')}
                      className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors cursor-pointer ${getFieldBorderClass('gender')}`}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-Binary">Non-Binary</option>
                      <option value="Prefer not to say">
                        Prefer not to say
                      </option>
                    </select>
                    {errors.gender && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.gender.message}
                      </p>
                    )}
                  </div>

                  {/* Birthday */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Birthday <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        {renderStatusBadge('birthday', isMinor)}
                        {watchedBirthday && (
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              isRestrictedUnder12
                                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                : isMinor
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            }`}
                          >
                            Age: {applicantAge}{' '}
                            {isRestrictedUnder12
                              ? '(Restricted)'
                              : isMinor
                                ? '(Minor)'
                                : '(Adult)'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        min={minDateStr}
                        max={todayStr}
                        {...register('birthday')}
                        className={`w-full pl-10 pr-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('birthday', isMinor)}`}
                      />
                    </div>
                    {errors.birthday && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.birthday.message}
                      </p>
                    )}
                  </div>

                  {isRestrictedUnder12 && (
                    <div className="sm:col-span-2 p-4 rounded-2xl bg-red-500/10 border-2 border-red-500/30 text-red-600 dark:text-red-400 flex items-start gap-3 shadow-xs animate-shake">
                      <Ban className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-left">
                        <span className="font-heading text-xs uppercase tracking-wider font-black block text-red-500">
                          ❌ Registration Prohibited: Age {applicantAge} Years
                          Old
                        </span>
                        <p className="text-[11px] font-medium leading-relaxed">
                          Regular online membership is strictly not permitted
                          for children under 12 years old.
                        </p>
                      </div>
                    </div>
                  )}

                  {isMinor && (
                    <div className="sm:col-span-2 p-3.5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-start gap-2.5 text-left">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-[11px] font-medium leading-relaxed">
                        <span className="font-bold block">
                          Minor Applicant Policy (Age: {applicantAge} Yrs)
                        </span>
                        Registration is permitted with parent/legal guardian
                        consent, signed waiver, and parent/guardian e-signatures
                        required in the next steps.
                      </div>
                    </div>
                  )}

                  {/* Home Address */}
                  <div className="space-y-1 sm:col-span-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                        Home Address{' '}
                        <span className="text-slate-400 font-normal">
                          (optional)
                        </span>
                      </label>
                      {renderStatusBadge('address')}
                    </div>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <textarea
                        rows={2}
                        {...register('address')}
                        placeholder="Barangay, City, Province (optional)..."
                        className={`w-full pl-10 pr-4 py-2.5 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors resize-none ${getFieldBorderClass('address')}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: CONTACTS */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-2 select-none">
                  <HeartHandshake className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    {isMinor
                      ? 'Step 2: Parent / Legal Guardian Details'
                      : 'Step 2: Emergency Contact'}
                  </h2>
                </div>

                {isMinor ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Parent / Legal Guardian Full Name{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        {renderStatusBadge('parent_name')}
                      </div>
                      <input
                        type="text"
                        {...register('parent_name')}
                        placeholder="e.g. Roberto Dela Cruz"
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('parent_name')}`}
                      />
                      {errors.parent_name && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">
                          {errors.parent_name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Relationship to Applicant{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        {renderStatusBadge('parent_relationship')}
                      </div>
                      <select
                        {...register('parent_relationship')}
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors cursor-pointer ${getFieldBorderClass('parent_relationship')}`}
                      >
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                        <option value="Legal Guardian">Legal Guardian</option>
                        <option value="Other (specify)">Other (specify)</option>
                      </select>
                      {errors.parent_relationship && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">
                          {errors.parent_relationship.message}
                        </p>
                      )}
                    </div>

                    {watchedParentRelationship === 'Other (specify)' && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                            Specify Relationship{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          {renderStatusBadge('parent_relationship_other')}
                        </div>
                        <input
                          type="text"
                          {...register('parent_relationship_other')}
                          placeholder="e.g. Aunt / Uncle / Grandparent"
                          className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('parent_relationship_other')}`}
                        />
                        {errors.parent_relationship_other && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">
                            {errors.parent_relationship_other.message}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Parent Phone Number{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        {renderStatusBadge('parent_phone')}
                      </div>
                      <input
                        type="tel"
                        {...register('parent_phone', {
                          onChange: (e) => {
                            e.target.value = e.target.value.replace(/\D/g, '');
                          },
                        })}
                        placeholder="09170000000"
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('parent_phone')}`}
                      />
                      {errors.parent_phone && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">
                          {errors.parent_phone.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Parent Email Address{' '}
                          <span className="text-slate-400 font-normal">
                            (optional)
                          </span>
                        </label>
                        {renderStatusBadge('parent_email')}
                      </div>
                      <input
                        type="email"
                        {...register('parent_email')}
                        placeholder="parent@example.com"
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('parent_email')}`}
                      />
                    </div>

                    <div className="sm:col-span-2 p-3 sm:p-3.5 bg-(--bg-input) rounded-2xl border-2 border-slate-300 dark:border-zinc-700 flex items-center justify-between">
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          {...register('same_as_parent')}
                          className="w-4 h-4 rounded border-slate-300 text-[#123c73] dark:text-[#bf0202] focus:ring-0 cursor-pointer"
                        />
                        <span>
                          Use Parent / Legal Guardian as Primary Emergency
                          Contact
                        </span>
                      </label>
                      <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </div>
                ) : null}

                {(!isMinor || !watchedSameAsParent) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Emergency Contact Name{' '}
                          {isMinor ? (
                            <span className="text-red-500">*</span>
                          ) : (
                            <span className="text-slate-400 font-normal">
                              (optional)
                            </span>
                          )}
                        </label>
                        {renderStatusBadge('emergency_contact_name')}
                      </div>
                      <input
                        type="text"
                        {...register('emergency_contact_name')}
                        placeholder="e.g. Maria Dela Cruz"
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('emergency_contact_name')}`}
                      />
                      {errors.emergency_contact_name && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">
                          {errors.emergency_contact_name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Relationship{' '}
                          {isMinor ? (
                            <span className="text-red-500">*</span>
                          ) : (
                            <span className="text-slate-400 font-normal">
                              (optional)
                            </span>
                          )}
                        </label>
                        {renderStatusBadge('emergency_contact_relationship')}
                      </div>
                      <input
                        type="text"
                        {...register('emergency_contact_relationship')}
                        placeholder="e.g. Spouse / Parent / Sibling"
                        className={`w-full px-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('emergency_contact_relationship')}`}
                      />
                      {errors.emergency_contact_relationship && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">
                          {errors.emergency_contact_relationship.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                          Emergency Contact Phone{' '}
                          {isMinor ? (
                            <span className="text-red-500">*</span>
                          ) : (
                            <span className="text-slate-400 font-normal">
                              (optional)
                            </span>
                          )}
                        </label>
                        {renderStatusBadge('emergency_contact_phone')}
                      </div>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          {...register('emergency_contact_phone', {
                            onChange: (e) => {
                              e.target.value = e.target.value.replace(
                                /\D/g,
                                ''
                              );
                            },
                          })}
                          placeholder="09189876543"
                          className={`w-full pl-10 pr-4 py-2.5 sm:py-3 bg-(--bg-input) border-2 rounded-xl text-xs font-semibold focus:outline-none transition-colors ${getFieldBorderClass('emergency_contact_phone')}`}
                        />
                      </div>
                      {errors.emergency_contact_phone && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">
                          {errors.emergency_contact_phone.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: MEMBERSHIP PLAN (FLUID RESPONSIVE CARDS) */}
            {currentStep === 3 && (
              <div className="space-y-5 sm:space-y-6 select-none animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-3">
                  <CreditCard className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    Step 3: Select Membership Plan
                  </h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {/* MONTHLY MEMBERSHIP CARD */}
                  <div
                    onClick={() =>
                      setValue('preferred_plan', 'Monthly Membership', {
                        shouldValidate: true,
                      })
                    }
                    className={`relative p-5 sm:p-6 lg:p-7 rounded-3xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm ${
                      selectedPlan === 'Monthly Membership'
                        ? 'bg-emerald-500/[0.05] dark:bg-emerald-950/20 border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-500/10'
                        : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-4 sm:space-y-5">
                      {/* Card Header & Radio */}
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          Unlimited Passes
                        </span>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            selectedPlan === 'Monthly Membership'
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-300 dark:border-zinc-600'
                          }`}
                        >
                          {selectedPlan === 'Monthly Membership' && (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                        </div>
                      </div>

                      {/* Title & Price Header */}
                      <div>
                        <h3 className="font-heading text-base sm:text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
                          Monthly Membership
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-2xl sm:text-3xl lg:text-4xl font-heading font-black text-slate-900 dark:text-white tracking-tight">
                            ₱{settings.monthly_plan_price.toLocaleString()}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            / 30 Days
                          </span>
                        </div>
                      </div>

                      {/* Comparison Box */}
                      <div className="rounded-2xl p-3.5 sm:p-4 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">
                            Regular Non-Member Walk-In:
                          </span>
                          <span className="font-mono text-slate-400 line-through shrink-0">
                            ₱{regularWalkInPrice} / visit
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200 dark:border-zinc-700/60 text-xs font-bold">
                          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />{' '}
                            Your Check-In Fee:
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 text-sm font-black shrink-0">
                            ₱0 FREE
                          </span>
                        </div>
                      </div>

                      {/* Benefits */}
                      <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>
                            Unlimited gym visits for 30 consecutive days
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>Zero daily check-in door fees</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* YEARLY MEMBERSHIP CARD */}
                  <div
                    onClick={() =>
                      setValue('preferred_plan', 'Yearly Membership', {
                        shouldValidate: true,
                      })
                    }
                    className={`relative p-5 sm:p-6 lg:p-7 rounded-3xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm ${
                      selectedPlan === 'Yearly Membership'
                        ? 'bg-blue-500/[0.05] dark:bg-blue-950/20 border-blue-600 ring-2 ring-blue-500/20 shadow-blue-500/10'
                        : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-4 sm:space-y-5">
                      {/* Card Header & Radio */}
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          365-Day Access Key
                        </span>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            selectedPlan === 'Yearly Membership'
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 dark:border-zinc-600'
                          }`}
                        >
                          {selectedPlan === 'Yearly Membership' && (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                        </div>
                      </div>

                      {/* Title & Price Header */}
                      <div>
                        <h3 className="font-heading text-base sm:text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
                          Yearly Membership
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-2xl sm:text-3xl lg:text-4xl font-heading font-black text-slate-900 dark:text-white tracking-tight">
                            ₱{settings.yearly_plan_price.toLocaleString()}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            / 1 Year
                          </span>
                        </div>
                      </div>

                      {/* Comparison Box */}
                      <div className="rounded-2xl p-3.5 sm:p-4 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-medium">
                            Regular Non-Member Walk-In:
                          </span>
                          <span className="font-mono text-slate-400 line-through shrink-0">
                            ₱{regularWalkInPrice} / visit
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200 dark:border-zinc-700/60 text-xs font-bold">
                          <span className="text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />{' '}
                            Your Check-In Fee:
                          </span>
                          <div className="flex items-center gap-1.5 font-mono shrink-0">
                            <span className="text-blue-600 dark:text-blue-400 text-sm font-black">
                              ₱{yearlyCheckinFee.toLocaleString()} / visit
                            </span>
                            {yearlyDiscountPercent > 0 && (
                              <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {yearlyDiscountPercent}% OFF
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Benefits & Dynamic Description */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                          Pay once for 365-day access and enjoy a{' '}
                          <strong className="text-slate-900 dark:text-white font-bold">
                            {yearlyDiscountPercent}% discount
                          </strong>{' '}
                          (Save ₱{yearlySavingsPerVisit.toLocaleString()} per
                          visit) on every walk-in gym session.
                        </p>
                        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium pt-1">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <span>Full 365-day access key card privileges</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <span>
                              Save ₱{yearlySavingsPerVisit.toLocaleString()}{' '}
                              every single day you train
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: RULES AS A MEMBER, WAIVER & SUBMISSION */}
            {currentStep === 4 && (
              <div className="space-y-4 select-none animate-fade-in">
                <div className="flex items-center gap-2 border-b border-(--border-color) pb-2">
                  <ShieldCheck className="w-4 h-4 text-(--color-primary-light)" />
                  <h2 className="font-heading text-xs tracking-widest text-slate-900 dark:text-white uppercase font-bold">
                    Step 4: Rules & Final Acknowledgment
                  </h2>
                </div>

                <div className="p-4 sm:p-5 rounded-3xl bg-(--bg-input) border border-(--border-color) space-y-3.5 text-left">
                  {/* Top Bar with Document Trigger */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Member Code & Policies</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAgreementDocument('terms')}
                      className="text-[10px] text-blue-600 dark:text-red-400 font-bold uppercase tracking-wider underline hover:opacity-80 cursor-pointer"
                    >
                      Read Full Terms
                    </button>
                  </div>

                  {/* 📜 COMPACT INTERNAL SCROLLABLE CONTAINER */}
                  <div className="max-h-56 sm:max-h-60 overflow-y-auto pr-2 space-y-2.5 rounded-2xl bg-(--bg-card) p-3 border border-slate-200/80 dark:border-zinc-800 text-xs shadow-inner">
                    {/* Non-refundable Rule Banner */}
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <div>
                        <strong className="font-bold text-amber-800 dark:text-amber-300">
                          Strict Non-Refundable Policy:{' '}
                        </strong>
                        Once paid at the front desk, all membership passes and
                        card fees are final and non-refundable, except as
                        provided by Philippine Consumer Law (RA 7394) [cite: 7,
                        8].
                      </div>
                    </div>

                    {/* Compact Rules List */}
                    <div className="space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800">
                        <strong className="text-slate-900 dark:text-white block font-semibold mb-0.5">
                          🏋️ Equipment Care & Racking
                        </strong>
                        Always return dumbbells, plates, and attachments to
                        their racks. Dropping weights carelessly or mishandling
                        equipment is strictly prohibited.
                      </div>

                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800">
                        <strong className="text-slate-900 dark:text-white block font-semibold mb-0.5">
                          🤝 Respect & Safe Spaces (RA 11313)
                        </strong>
                        Treat all members and staff with respect. Harassment,
                        intimidation, foul language, or filming others without
                        consent leads to immediate revocation [cite: 1, 2].
                      </div>

                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800">
                        <strong className="text-slate-900 dark:text-white block font-semibold mb-0.5">
                          🛡️ Safety, Staff Guidance & Health
                        </strong>
                        Follow floor instructions and posted notices. Stop
                        immediately and inform staff if you feel sharp pain,
                        shortness of breath, or dizziness.
                      </div>
                    </div>
                  </div>

                  {/* Minor Consent Signatures (If applicant is minor) */}
                  {isMinor && (
                    <div className="pt-2 border-t border-(--border-color) space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <SignaturePad
                          label="Applicant Signature *"
                          value={watchedApplicantSignature || null}
                          onChange={(dataUrl) =>
                            setValue('applicant_signature', dataUrl, {
                              shouldValidate: true,
                            })
                          }
                          error={errors.applicant_signature?.message}
                        />

                        <SignaturePad
                          label="Parent / Guardian Signature *"
                          value={watchedParentSignature || null}
                          onChange={(dataUrl) =>
                            setValue('parent_signature', dataUrl, {
                              shouldValidate: true,
                            })
                          }
                          error={errors.parent_signature?.message}
                        />
                      </div>
                    </div>
                  )}

                  {/* NARROWED & SIMPLIFIED AGREEMENT CHECKBOX */}
                  <div
                    className={`p-3 sm:p-3.5 rounded-2xl border-2 transition-all ${
                      errors.agreement
                        ? 'bg-red-500/5 border-red-500'
                        : isAgreed
                          ? 'bg-emerald-500/10 border-emerald-500'
                          : 'bg-amber-500/5 border-amber-400'
                    }`}
                  >
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('agreement')}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#123c73] dark:text-[#bf0202] focus:ring-0 cursor-pointer shrink-0"
                      />
                      <span className="text-[11px] sm:text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug">
                        {isMinor ? (
                          <>
                            As lawful guardian, I verify all details are
                            accurate, accept the non-refundable policy, and
                            consent to the{' '}
                            <button
                              type="button"
                              onClick={() => setAgreementDocument('terms')}
                              className="text-[#123c73] dark:text-red-400 underline font-bold cursor-pointer"
                            >
                              Terms
                            </button>{' '}
                            &amp;{' '}
                            <button
                              type="button"
                              onClick={() => setAgreementDocument('privacy')}
                              className="text-[#123c73] dark:text-red-400 underline font-bold cursor-pointer"
                            >
                              Privacy Policy
                            </button>
                            . <span className="text-red-500">*</span>
                          </>
                        ) : (
                          <>
                            I verify all details are accurate, acknowledge fees
                            are non-refundable, and agree to obey gym rules
                            under the{' '}
                            <button
                              type="button"
                              onClick={() => setAgreementDocument('terms')}
                              className="text-[#123c73] dark:text-red-400 underline font-bold cursor-pointer"
                            >
                              Terms
                            </button>{' '}
                            &amp;{' '}
                            <button
                              type="button"
                              onClick={() => setAgreementDocument('privacy')}
                              className="text-[#123c73] dark:text-red-400 underline font-bold cursor-pointer"
                            >
                              Privacy Policy
                            </button>
                            . <span className="text-red-500">*</span>
                          </>
                        )}
                      </span>
                    </label>
                    {errors.agreement && (
                      <p className="text-[10px] text-red-500 font-medium mt-1">
                        {errors.agreement.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <AgreementDocumentViewer
              isOpen={agreementDocument !== null}
              onClose={() => setAgreementDocument(null)}
              initialDocument={agreementDocument || 'terms'}
            />

            {/* WIZARD BUTTONS */}
            <div className="flex justify-between items-center pt-4 border-t border-(--border-color) select-none">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="py-2.5 sm:py-3 px-4 sm:px-5 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 font-heading text-[10px] tracking-wider uppercase font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border-none"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
              ) : (
                <div />
              )}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={isRestrictedUnder12 || isTicketLimitReached}
                  className={`py-2.5 sm:py-3 px-5 sm:px-6 rounded-xl font-heading text-[10px] tracking-wider uppercase font-black transition-all flex items-center gap-1.5 border-none shadow-md ${
                    !isRestrictedUnder12 && !isTicketLimitReached
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
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer shadow-emerald-500/20 active:scale-95'
                      : 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed opacity-80'
                  }`}
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : step4Countdown > 0 ? (
                    <>
                      <Clock className="w-4 h-4 animate-pulse text-amber-500 dark:text-amber-400" />
                      <span>Review Rules ({step4Countdown}s)</span>
                    </>
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

      <footer className="mt-6 sm:mt-8 text-center text-[10px] text-slate-400 font-mono select-none uppercase tracking-widest">
        Wolf Palomar Fitness Management • Public Self-Service Portal
      </footer>
    </div>
  );
};

export default OnlineRegistrationPage;
