// src/pages/logbook/components/LogbookRecordAttendance.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  X,
  AlertTriangle,
  Check,
  UserCheck,
  QrCode,
  Coins,
  CreditCard,
  ChevronRight,
  User,
  GraduationCap,
  Ticket,
  Users,
  Eye,
  SwitchCamera,
  UserPlus,
  ArrowRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../stores/authStore';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { useSessionLock } from '../../../hooks/useSessionLock';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { getServerNow } from '../../../lib/serverTime';
import { createPortal } from 'react-dom';
import beepSoundUrl from '../../../assets/beep-scanner.mp3';

// Dynamic Members Engine Integration
import {
  memberService,
  subscriptionService,
  cardService,
  settingsService,
} from '../../members/memberService';
import type { Member, Subscription, MemberCard } from '../../../types/members';

interface LogbookRecordAttendanceProps {
  isOpen: boolean;
  initialSearch?: string;
  onClose: () => void;
  onCheckInSuccess: (newRecord: any) => void;
}

interface MemberProfile {
  id: string;
  name: string;
  memberId: string;
  membership: string;
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  phone: string;
  email: string;
  address: string;
  regDate: string;
  expDate: string;
  lastVisit: string;
  todayVisits: number;
  cardNumbers: string[];
  avatarUrl?: string | null;
}

interface SelectedClient {
  id?: string;
  name: string;
  memberId?: string | null;
  phone?: string;
  regDate?: string;
  membership?: string;
  status?: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  isWalkIn: boolean;
  avatarUrl?: string | null;
}

const resolveAvatarUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  try {
    const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const { data } = supabase.storage
      .from('member-avatars')
      .getPublicUrl(cleanPath);
    return data?.publicUrl || trimmed;
  } catch {
    return trimmed;
  }
};

const playBeepSound = () => {
  try {
    const audio = new Audio(beepSoundUrl);
    audio.currentTime = 0;
    audio.play().catch((err) => {
      console.warn('Audio playback prevented or failed:', err);
    });
  } catch (err) {
    console.warn('Audio creation error:', err);
  }
};

const getCameraErrorMessage = (err: any): string => {
  const msg = typeof err === 'string' ? err : err?.message || String(err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('notallowederror') || lower.includes('permission'))
    return 'Permission denied by browser';
  if (lower.includes('notreadableerror') || lower.includes('in use'))
    return 'Camera is busy or in use';
  if (lower.includes('notfounderror')) return 'Camera hardware not found';
  return msg || 'Camera initialization failed';
};

const extractCleanMemberId = (rawCode: string): string => {
  let cleaned = (rawCode || '').trim();

  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      cleaned =
        parsed.memberId ||
        parsed.member_id ||
        parsed.id ||
        parsed.code ||
        parsed.cardNumber ||
        cleaned;
    } catch (_) {}
  }

  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    try {
      const url = new URL(cleaned);
      const queryId =
        url.searchParams.get('id') ||
        url.searchParams.get('memberId') ||
        url.searchParams.get('token');
      if (queryId) return queryId.trim();
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) return segments[segments.length - 1].trim();
    } catch (_) {}
  }

  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    const memPart = parts.find(
      (p) =>
        p.toUpperCase().startsWith('MEM-') ||
        p.toUpperCase().startsWith('MEM') ||
        p.toUpperCase().startsWith('REG-') ||
        p.toUpperCase().startsWith('REC-')
    );
    if (memPart) return memPart.trim();
    return parts[0].trim();
  }

  return cleaned;
};

const generateUniqueWalkInName = (
  baseName: string,
  existingLogs: any[]
): string => {
  const cleanBase = (baseName || '')
    .replace(/\s*\(\d+\)$/, '')
    .trim()
    .toUpperCase();

  if (!cleanBase) return 'WALK-IN GUEST';

  const matchingWalkIns = existingLogs.filter((log: any) => {
    const isWalkIn = (log.customer_type || '').toLowerCase() === 'walk-in';
    if (!isWalkIn) return false;
    const name = (log.customer_name || '').toUpperCase().trim();
    const logCleanBase = name.replace(/\s*\(\d+\)$/, '').trim();
    return logCleanBase === cleanBase;
  });

  if (matchingWalkIns.length === 0) {
    return cleanBase;
  }

  const existingNumbers = new Set<number>();
  let hasBaseWithoutNumber = false;

  for (const log of matchingWalkIns) {
    const name = (log.customer_name || '').toUpperCase().trim();
    const match = name.match(/\((\d+)\)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        existingNumbers.add(num);
      }
    } else {
      hasBaseWithoutNumber = true;
    }
  }

  if (!hasBaseWithoutNumber) {
    return cleanBase;
  }

  let nextNumber = 1;
  while (existingNumbers.has(nextNumber)) {
    nextNumber++;
  }

  return `${cleanBase} (${nextNumber})`;
};

export const LogbookRecordAttendance: React.FC<
  LogbookRecordAttendanceProps
> = ({ isOpen, initialSearch = '', onClose, onCheckInSuccess }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore() as any;
  const { activeSession, isSessionOpen } = useCashSessionStore();
  const { isLocked, getLockReason } = useSessionLock();
  const isSubmittingRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [dynamicMembers, setDynamicMembers] = useState<MemberProfile[]>([]);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);

  const [memberSearch, setMemberSearch] = useState('');
  const [suggestions, setSuggestions] = useState<MemberProfile[]>([]);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(
    null
  );

  const [filterMode, setFilterMode] = useState<'non-member' | 'member'>(
    'non-member'
  );
  const [walkInPassType, setWalkInPassType] = useState<
    'walkin_regular' | 'walkin_student'
  >('walkin_regular');

  const [photoModal, setPhotoModal] = useState<{
    name: string;
    memberId?: string;
    url: string | null;
  } | null>(null);
  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [selectedEntry, setSelectedEntry] = useState<
    'walkin_regular' | 'walkin_student' | 'member_entry' | null
  >(null);

  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  const [adminOverride, setAdminOverride] = useState(false);

  // Dynamic rates state: Never initialized with hardcoded values
  const [walkinRegularFee, setWalkinRegularFee] = useState<number | null>(null);
  const [walkinStudentFee, setWalkinStudentFee] = useState<number | null>(null);
  const [yearlyMemberFee, setYearlyMemberFee] = useState<number | null>(null);
  const [gcashFeeRate, setGcashFeeRate] = useState<number | null>(null);

  const [isRatesLoading, setIsRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const stopAllCameraTracks = () => {
    if (scannerRef.current) {
      if (scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .then(() => {
            try {
              scannerRef.current?.clear();
            } catch (e) {}
          })
          .catch(() => {});
      } else {
        try {
          scannerRef.current.clear();
        } catch (e) {}
      }
      scannerRef.current = null;
    }

    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video) => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        video.srcObject = null;
      }
    });
  };

  useEffect(() => {
    if (selectedClient) {
      if (selectedClient.isWalkIn) {
        setAdminOverride(true);
      } else {
        setAdminOverride(false);
      }
    }
  }, [selectedClient]);

  const loadRates = useCallback(async () => {
    setIsRatesLoading(true);
    setRatesError(null);

    try {
      const { data: ratesData, error } = await supabase
        .from('rates_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (
        ratesData &&
        ratesData.regular_walk_in !== null &&
        ratesData.regular_walk_in !== undefined &&
        ratesData.student_walk_in !== null &&
        ratesData.student_walk_in !== undefined
      ) {
        setWalkinRegularFee(Number(ratesData.regular_walk_in));
        setWalkinStudentFee(Number(ratesData.student_walk_in));
        setYearlyMemberFee(Number(ratesData.yearly_walk_in ?? 0));
        setGcashFeeRate(Number(ratesData.gcash_fee ?? 0));
      } else {
        // Fallback to settings service from database
        const activeSettings = await settingsService.load();
        if (
          activeSettings?.regular_walkin_fee == null ||
          activeSettings?.student_walkin_fee == null
        ) {
          throw new Error('Pricing data is missing or incomplete in Supabase.');
        }

        setWalkinRegularFee(Number(activeSettings.regular_walkin_fee));
        setWalkinStudentFee(Number(activeSettings.student_walkin_fee));
        setYearlyMemberFee(
          Number(activeSettings.yearly_member_checkin_fee ?? 0)
        );
        setGcashFeeRate(Number(activeSettings.gcash_fee ?? 0));
      }
    } catch (err: any) {
      console.error('Failed to load rates configuration:', err);
      setWalkinRegularFee(null);
      setWalkinStudentFee(null);
      setYearlyMemberFee(null);
      setGcashFeeRate(null);
      setRatesError(
        'Unable to fetch live pricing from the server. Please verify your internet connection, close this window, and reopen it.'
      );
      toast.error('Failed to load live pricing rates from Supabase.');
    } finally {
      setIsRatesLoading(false);
    }
  }, []);

  const loadDynamicMembers = useCallback(async () => {
    try {
      const [members, subscriptions, cards, { data: dbAttendance }] =
        await Promise.all([
          memberService.getAll(),
          subscriptionService.getAll(),
          cardService.getAll(),
          supabase
            .from('attendance')
            .select('id, member_id, check_in_time')
            .is('deleted_at', null)
            .order('check_in_time', { ascending: false })
            .limit(2000),
        ]);

      const attendanceList = dbAttendance || [];
      const now = getServerNow();

      const mappedProfiles: MemberProfile[] = members.map((m: Member) => {
        const activeSub = subscriptions.find(
          (s: Subscription) =>
            s.member_id === m.member_id && s.status === 'Active'
        );

        let membershipName = activeSub ? activeSub.plan_name : 'No Active Plan';
        let expDateStr = activeSub
          ? new Date(activeSub.end_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'N/A';

        let calculatedStatus: MemberProfile['status'] = 'Expired';
        if (m.status === 'Suspended') {
          calculatedStatus = 'Suspended';
        } else if (activeSub) {
          const endDate = new Date(activeSub.end_date);
          const diffDays = Math.ceil(
            (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays <= 0) {
            calculatedStatus = 'Expired';
          } else if (diffDays <= 7) {
            calculatedStatus = 'Expires Soon';
          } else {
            calculatedStatus = 'Active';
          }
        }

        const memberCards = cards
          .filter((c: MemberCard) => c.member_id === m.member_id)
          .map((c: MemberCard) => c.card_number);

        const memberVisits = attendanceList.filter(
          (a: any) => a.member_id === m.member_id
        );
        const lastVisitRecord = memberVisits[0];
        const lastVisitStr = lastVisitRecord
          ? new Date(lastVisitRecord.check_in_time).toLocaleDateString(
              'en-US',
              { month: 'short', day: 'numeric', year: 'numeric' }
            )
          : 'First Visit';

        const todayVisits = memberVisits.filter((a: any) => {
          const d = new Date(a.check_in_time);
          return (
            d.getDate() === now.getDate() &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        }).length;

        const resolvedPhoto = resolveAvatarUrl(m.image_url || m.avatar_url);

        return {
          id: m.id,
          name: m.full_name,
          memberId: m.member_id,
          membership: membershipName,
          status: calculatedStatus,
          phone: m.phone || '',
          email: m.email || '',
          address: m.address || '',
          regDate: m.created_at
            ? new Date(m.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'N/A',
          expDate: expDateStr,
          lastVisit: lastVisitStr,
          todayVisits,
          cardNumbers: memberCards,
          avatarUrl: resolvedPhoto,
        };
      });

      setDynamicMembers(mappedProfiles);
    } catch (e) {
      console.error('Failed to load dynamic member records:', e);
    }
  }, []);

  const loadTodayLogs = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .is('deleted_at', null)
        .gte('check_in_time', `${todayStr}T00:00:00Z`);

      setTodayLogs(data || []);
    } catch (e) {
      console.warn('Failed to load today logs:', e);
    }
  }, []);

  const duplicateLog = useMemo(() => {
    if (!selectedClient || selectedClient.isWalkIn) return null;
    return todayLogs.find(
      (log: any) => log.member_id === selectedClient.memberId
    );
  }, [selectedClient, todayLogs]);

  const isLockedByDuplicate = Boolean(
    duplicateLog && !adminOverride && !selectedClient?.isWalkIn
  );

  const walkInPreviewName = useMemo(() => {
    if (!memberSearch.trim()) return '';
    return generateUniqueWalkInName(memberSearch.trim(), todayLogs);
  }, [memberSearch, todayLogs]);

  const handleSelectMember = useCallback((member: MemberProfile) => {
    const client: SelectedClient = {
      id: member.id,
      name: member.name.toUpperCase(),
      memberId: member.memberId,
      phone: member.phone,
      regDate: member.regDate,
      membership: member.membership,
      status: member.status,
      isWalkIn: false,
      avatarUrl: member.avatarUrl || null,
    };
    setSelectedClient(client);
    setMemberSearch('');
    setSuggestions([]);
    setAdminOverride(false);

    if (member.status === 'Active' || member.status === 'Expires Soon') {
      setSelectedEntry('member_entry');
    } else if (member.status === 'Expired') {
      setSelectedEntry('walkin_regular');
    } else {
      setSelectedEntry(null);
    }
  }, []);

  const handleBarcodeOrQrScanned = useCallback(
    async (scannedText: string) => {
      const raw = scannedText.trim();
      if (!raw) return;

      const cleanId = extractCleanMemberId(raw);
      const cleanIdUpper = cleanId.toUpperCase();
      const rawUpper = raw.toUpperCase();

      if (cleanIdUpper.startsWith('REG-') || rawUpper.startsWith('REG-')) {
        try {
          const { data: regData } = await supabase
            .from('online_registrations')
            .select('*')
            .is('deleted_at', null)
            .or(`id.ilike.${cleanIdUpper},id.ilike.${rawUpper}`)
            .maybeSingle();

          if (regData) {
            playBeepSound();
            stopAllCameraTracks();
            setShowLiveScanner(false);
            onClose();
            navigate('/members/plans', {
              state: {
                openWizard: true,
                initialStep: 1,
                initialIntakeMode: 'Manual',
                prefillData: regData,
              },
            });
            return;
          }
        } catch (err) {
          console.warn('Registration lookup error:', err);
        }
      }

      const matchedMember = dynamicMembers.find((m) => {
        const mid = (m.memberId || '').toUpperCase();
        const dbId = (m.id || '').toUpperCase();
        const mName = (m.name || '').toUpperCase();
        const mPhone = (m.phone || '').trim();

        return (
          mid === cleanIdUpper ||
          mid === rawUpper ||
          dbId === cleanIdUpper ||
          dbId === rawUpper ||
          mName === cleanIdUpper ||
          (mPhone && mPhone === cleanId) ||
          m.cardNumbers.some(
            (c) =>
              c.toUpperCase() === cleanIdUpper || c.toUpperCase() === rawUpper
          )
        );
      });

      if (matchedMember) {
        playBeepSound();
        stopAllCameraTracks();
        setShowLiveScanner(false);
        setFilterMode('member');
        handleSelectMember(matchedMember);
        toast.success(
          `Verified: ${matchedMember.name} (${matchedMember.memberId})`
        );
        return;
      }

      try {
        const [members, subscriptions] = await Promise.all([
          memberService.getAll(),
          subscriptionService.getAll(),
        ]);

        const freshMatch = members.find(
          (m: Member) =>
            m.member_id.toUpperCase() === cleanIdUpper ||
            m.member_id.toUpperCase() === rawUpper ||
            m.full_name.toUpperCase() === cleanIdUpper ||
            (m.phone && m.phone.trim() === cleanId)
        );

        if (freshMatch) {
          playBeepSound();
          stopAllCameraTracks();
          setShowLiveScanner(false);
          setFilterMode('member');

          const activeSub = subscriptions.find(
            (s: Subscription) =>
              s.member_id === freshMatch.member_id && s.status === 'Active'
          );
          const planName = activeSub ? activeSub.plan_name : 'No Active Plan';

          const resolvedPhoto = resolveAvatarUrl(
            freshMatch.image_url || freshMatch.avatar_url
          );

          handleSelectMember({
            id: freshMatch.id,
            name: freshMatch.full_name,
            memberId: freshMatch.member_id,
            membership: planName,
            status: activeSub ? 'Active' : 'Expired',
            phone: freshMatch.phone || '',
            email: freshMatch.email || '',
            address: freshMatch.address || '',
            regDate: freshMatch.created_at || 'N/A',
            expDate: activeSub
              ? new Date(activeSub.end_date).toLocaleDateString()
              : 'N/A',
            lastVisit: 'Recent',
            todayVisits: 0,
            cardNumbers: [],
            avatarUrl: resolvedPhoto,
          });

          toast.success(`Verified: ${freshMatch.full_name}`);
          return;
        }
      } catch (err) {
        console.warn('Fallback member lookup error:', err);
      }

      stopAllCameraTracks();
      setShowLiveScanner(false);
      setFilterMode('non-member');
      setMemberSearch(cleanId);
      toast.info(`Scanned: "${cleanId}". Select pass type to proceed.`);
    },
    [dynamicMembers, handleSelectMember, navigate, onClose]
  );

  const resetForm = () => {
    setMemberSearch('');
    setSuggestions([]);
    setSelectedClient(null);
    setSelectedEntry(null);
    setWalkInPassType('walkin_regular');
    setPaymentMethod('Cash');
    setAmountReceived('');
    setReferenceNumber('');
    setAdminOverride(false);
    setShowLiveScanner(false);
    setPhotoModal(null);
    setFilterMode('non-member');
    stopAllCameraTracks();
  };

  useEffect(() => {
    if (isOpen) {
      loadRates();
      loadDynamicMembers();
      loadTodayLogs();
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      resetForm();
    } else {
      stopAllCameraTracks();
    }
  }, [isOpen, loadRates, loadDynamicMembers, loadTodayLogs]);

  useEffect(() => {
    if (!isOpen || !initialSearch || !initialSearch.trim()) return;

    const query = initialSearch.trim().toLowerCase();
    const cleanQuery = extractCleanMemberId(query).toLowerCase();

    if (dynamicMembers.length > 0) {
      const matchedMember = dynamicMembers.find(
        (m) =>
          m.memberId.toLowerCase() === cleanQuery ||
          m.memberId.toLowerCase() === query ||
          m.name.toLowerCase() === query ||
          m.name.toLowerCase().includes(query) ||
          m.phone === query ||
          m.cardNumbers.some(
            (c) => c.toLowerCase() === query || c.toLowerCase() === cleanQuery
          )
      );

      if (matchedMember) {
        setFilterMode('member');
        handleSelectMember(matchedMember);
      } else {
        setFilterMode('non-member');
        setMemberSearch(initialSearch.trim().toUpperCase());
      }
    }
  }, [isOpen, initialSearch, dynamicMembers, handleSelectMember]);

  useEffect(() => {
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
      .catch((err) => console.warn('Camera list error:', err));
  }, []);

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    stopAllCameraTracks();
    setSelectedCameraId(cameras[nextIndex].id);
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let isCancelled = false;

    if (showLiveScanner) {
      const timer = setTimeout(() => {
        const element = document.getElementById('live-qr-reader');
        if (!element || isCancelled) return;

        try {
          html5QrCode = new Html5Qrcode('live-qr-reader');
          scannerRef.current = html5QrCode;
          const cameraConfig = selectedCameraId
            ? { deviceId: { exact: selectedCameraId } }
            : { facingMode: 'environment' };

          html5QrCode
            .start(
              cameraConfig,
              {
                fps: 25,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                  const edgeSize = Math.floor(minEdge * 0.72);
                  return { width: edgeSize, height: edgeSize };
                },
                videoConstraints: {
                  ...cameraConfig,
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: 'environment',
                },
              },
              (decodedText) => {
                handleBarcodeOrQrScanned(decodedText);
              },
              () => {}
            )
            .catch((err) => {
              if (!isCancelled) {
                const reason = getCameraErrorMessage(err);
                if (cameras.length > 1) {
                  const currentIndex = selectedCameraId
                    ? cameras.findIndex((c) => c.id === selectedCameraId)
                    : -1;
                  const nextCamera =
                    cameras[(currentIndex + 1) % cameras.length];
                  stopAllCameraTracks();
                  setSelectedCameraId(nextCamera.id);
                  toast.info(
                    `Switching camera: ${nextCamera.label || 'Next Camera'}`
                  );
                } else {
                  toast.error(`Camera Error: ${reason}`);
                  setShowLiveScanner(false);
                  stopAllCameraTracks();
                }
              }
            });
        } catch (e) {
          console.error('Attendance scanner init error:', e);
        }
      }, 250);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
        stopAllCameraTracks();
      };
    }
  }, [showLiveScanner, selectedCameraId, handleBarcodeOrQrScanned, cameras]);

  const handleMemberSearchChange = (val: string) => {
    setMemberSearch(val);
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }
    const query = val.toLowerCase().trim();
    const filtered = dynamicMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.memberId.toLowerCase().includes(query) ||
        m.phone.includes(query) ||
        m.cardNumbers.some((card) => card.toLowerCase().includes(query))
    );
    setSuggestions(filtered);

    const exactMatch = dynamicMembers.find(
      (m) =>
        m.memberId.toLowerCase() === query ||
        m.phone === query ||
        m.cardNumbers.some((c) => c.toLowerCase() === query)
    );
    if (exactMatch && filterMode === 'member') {
      handleSelectMember(exactMatch);
    }
  };

  const handleContinueAsWalkIn = () => {
    const query = memberSearch.trim();
    if (!query) {
      toast.warning('Please enter a guest name.');
      return;
    }

    const uniqueName = generateUniqueWalkInName(query, todayLogs);
    const client: SelectedClient = {
      name: uniqueName,
      isWalkIn: true,
    };
    setSelectedClient(client);
    setMemberSearch('');
    setSuggestions([]);
    setAdminOverride(true);
    setSelectedEntry(walkInPassType);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!memberSearch.trim()) return;

      if (filterMode === 'member') {
        if (suggestions.length > 0) {
          handleSelectMember(suggestions[0]);
        }
      } else {
        handleContinueAsWalkIn();
      }
    }
  };

  const handleRedirectToSubscription = () => {
    stopAllCameraTracks();
    onClose();
    navigate('/members/plans');
  };

  const handleStartScan = () => {
    setMemberSearch('');
    setSuggestions([]);
    setShowLiveScanner((prev) => !prev);
  };

  const derivedBilling = useMemo(() => {
    if (
      walkinRegularFee === null ||
      walkinStudentFee === null ||
      yearlyMemberFee === null ||
      gcashFeeRate === null
    ) {
      return {
        subtotal: 0,
        title: 'Pricing Unavailable',
        convenienceFee: 0,
        totalDue: 0,
        calculatedChange: 0,
      };
    }

    let subtotal = 0;
    let title = 'None Selected';

    if (selectedEntry === 'walkin_regular') {
      subtotal = walkinRegularFee;
      title = 'Walk-In Regular Pass';
    } else if (selectedEntry === 'walkin_student') {
      subtotal = walkinStudentFee;
      title = 'Walk-In Student Pass';
    } else if (
      selectedEntry === 'member_entry' &&
      selectedClient &&
      !selectedClient.isWalkIn
    ) {
      const isYearly = selectedClient.membership
        ?.toLowerCase()
        .includes('year');
      if (isYearly) {
        subtotal = yearlyMemberFee;
        title = 'Yearly Member Entry';
      } else {
        subtotal = 0;
        title = 'Monthly Member Entry';
      }
    }

    const convenienceFee =
      paymentMethod === 'GCash' && subtotal > 0 ? gcashFeeRate : 0;
    const totalDue = Math.max(0, subtotal + convenienceFee);
    const calculatedChange = Math.max(
      0,
      (Number(amountReceived) || 0) - totalDue
    );

    return {
      subtotal,
      title,
      convenienceFee,
      totalDue,
      calculatedChange,
    };
  }, [
    selectedEntry,
    selectedClient,
    paymentMethod,
    amountReceived,
    walkinRegularFee,
    walkinStudentFee,
    yearlyMemberFee,
    gcashFeeRate,
  ]);

  useEffect(() => {
    if (paymentMethod === 'Cash') {
      setAmountReceived(
        derivedBilling.totalDue > 0 ? derivedBilling.totalDue.toString() : ''
      );
    } else {
      setAmountReceived('');
    }
  }, [paymentMethod, derivedBilling.totalDue]);

  const handleCompleteCheckIn = async () => {
    if (
      isSubmittingRef.current ||
      isSuccess ||
      !selectedClient ||
      ratesError ||
      walkinRegularFee === null ||
      walkinStudentFee === null
    ) {
      return;
    }

    if (isLocked || !isSessionOpen) {
      toast.error(
        'Cannot record check-in: Cash drawer session is closed. Please open a cash session first in Cash Management.'
      );
      return;
    }

    if (
      derivedBilling.totalDue > 0 &&
      paymentMethod === 'Cash' &&
      !isSessionOpen
    ) {
      toast.error(
        'Cannot accept Cash: No active cash drawer session is open. Please open a cash session first in Cash Management.'
      );
      return;
    }

    if (duplicateLog && !adminOverride && !selectedClient.isWalkIn) {
      toast.error('Duplicate attendance requires override confirmation.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const gcashFeeVal =
      paymentMethod === 'GCash' && derivedBilling.totalDue > 0
        ? derivedBilling.convenienceFee
        : 0;
    const gcashRefVal =
      paymentMethod === 'GCash' && derivedBilling.totalDue > 0
        ? referenceNumber.trim()
        : undefined;

    let finalCustomerName = selectedClient.name;
    if (selectedClient.isWalkIn) {
      finalCustomerName = generateUniqueWalkInName(
        selectedClient.name,
        todayLogs
      );
    }

    try {
      const { data: inserted, error } = await supabase
        .from('attendance')
        .insert([
          {
            member_id: selectedClient.isWalkIn
              ? null
              : selectedClient.memberId || null,
            customer_name: finalCustomerName,
            customer_type: selectedClient.isWalkIn
              ? 'Walk-In'
              : 'Existing Member',
            plan_name: derivedBilling.title,
            entry_fee: derivedBilling.totalDue,
            base_price: derivedBilling.subtotal,
            gcash_fee: gcashFeeVal,
            card_fee: 0,
            gcash_ref_no: gcashRefVal || null,
            payment_method:
              derivedBilling.totalDue > 0 ? paymentMethod : 'Cash',
            staff_name: user?.email || 'Counter Staff',
            cash_session_id: activeSession?.id || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      try {
        await logAudit(
          'ATTENDANCE_CHECKIN',
          `Recorded check-in for "${finalCustomerName}" (${selectedClient.isWalkIn ? 'Walk-In' : 'Member'} - ${derivedBilling.title}): Entry Fee ₱${derivedBilling.totalDue.toFixed(2)} via ${derivedBilling.totalDue > 0 ? paymentMethod : 'Promo/Free'}.`,
          inserted.id
        );
      } catch (auditErr) {
        console.warn('Background logbook audit failed:', auditErr);
      }

      const checkInRecord = {
        id: String(inserted.id),
        timestamp: inserted.check_in_time,
        memberId: selectedClient.isWalkIn ? null : selectedClient.memberId,
        customerName: finalCustomerName,
        customerType: selectedClient.isWalkIn ? 'Walk-In' : 'Existing Member',
        categoryOrPlan: derivedBilling.title,
        paymentMethod: derivedBilling.totalDue > 0 ? paymentMethod : 'Promo',
        amountPaid: derivedBilling.totalDue,
        basePrice: derivedBilling.subtotal,
        gcashFee: gcashFeeVal,
        cardFee: 0,
        gcashRefNo: gcashRefVal,
        referenceNumber: gcashRefVal,
        paymentRef: gcashRefVal,
        paymentStatus: derivedBilling.totalDue > 0 ? 'Paid' : 'Promo',
        status: selectedClient.isWalkIn
          ? 'Active'
          : selectedClient.status || 'Active',
        cash_session_id: inserted.cash_session_id || activeSession?.id || null,
      };

      setIsSuccess(true);
      stopAllCameraTracks();

      setTimeout(() => {
        onCheckInSuccess(checkInRecord);
        setIsSuccess(false);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Check-in error:', err);
      toast.error(err.message || 'Failed to complete check-in.');
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isFormValid = useMemo(() => {
    if (!isSessionOpen || isLocked) return false;
    if (ratesError || walkinRegularFee === null || walkinStudentFee === null) {
      return false;
    }
    if (!selectedClient || !selectedEntry) return false;
    if (duplicateLog && !adminOverride && !selectedClient.isWalkIn)
      return false;

    if (selectedEntry === 'member_entry' && selectedClient.status) {
      if (
        selectedClient.status === 'Expired' ||
        selectedClient.status === 'Suspended'
      ) {
        return false;
      }
    }

    if (derivedBilling.totalDue === 0) return true;

    if (paymentMethod === 'Cash') {
      return (Number(amountReceived) || 0) >= derivedBilling.totalDue;
    } else {
      return referenceNumber.trim().length >= 6;
    }
  }, [
    isSessionOpen,
    isLocked,
    ratesError,
    walkinRegularFee,
    walkinStudentFee,
    selectedClient,
    selectedEntry,
    duplicateLog,
    adminOverride,
    paymentMethod,
    amountReceived,
    referenceNumber,
    derivedBilling.totalDue,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selectedClient && selectedEntry) {
        e.preventDefault();
        if (isFormValid && !isSubmitting) {
          handleCompleteCheckIn();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, selectedClient, selectedEntry, isFormValid, isSubmitting]);

  if (!isOpen) return null;

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopAllCameraTracks();
        onClose();
      }}
      title={isSuccess ? 'CHECK-IN CONFIRMED' : 'Reception Check-In'}
      className={`w-full mx-auto my-auto ${
        isSuccess ? 'max-w-md p-6 sm:p-8' : 'max-w-lg p-4 sm:p-5'
      } bg-(--bg-card) text-(--color-text) border border-(--border-color) overflow-visible transition-all duration-300 relative text-left`}
    >
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => {
          stopAllCameraTracks();
          onClose();
        }}
        className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-(--color-text)/50 hover:text-(--color-text) hover:bg-(--bg-input) transition-colors cursor-pointer z-50"
        aria-label="Close Dialog"
      >
        <X className="w-5 h-5" />
      </button>

      <AnimatePresence mode="wait">
        {/* CASE 1: FETCHING ERROR - STRICTLY FORBID ATTENDANCE ACTION */}
        {ratesError ? (
          <motion.div
            key="attendance-rates-error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="py-6 px-4 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-sm mx-auto">
              <h3 className="text-base font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Unable to Retrieve Rates
              </h3>
              <p className="text-xs text-(--color-text)/70 leading-relaxed">
                {ratesError}
              </p>
            </div>

            <div className="pt-3 space-y-2">
              <Button
                type="button"
                variant="primary"
                onClick={loadRates}
                className="w-full py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Rate Connection</span>
              </Button>

              <button
                type="button"
                onClick={() => {
                  stopAllCameraTracks();
                  onClose();
                }}
                className="w-full py-2.5 bg-(--bg-input) hover:bg-(--bg-card) border border-(--border-color) rounded-xl text-xs font-bold text-(--color-text)/80 hover:text-(--color-text) uppercase tracking-wider cursor-pointer transition-colors"
              >
                Close Window
              </button>
            </div>
          </motion.div>
        ) : isRatesLoading ? (
          /* CASE 2: LOADING SPINNER FOR LIVE RATES */
          <motion.div
            key="attendance-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-16 flex flex-col items-center justify-center space-y-3"
          >
            <Loader2 className="w-8 h-8 text-(--color-primary) animate-spin" />
            <p className="text-xs font-bold uppercase tracking-wider text-(--color-text)/60">
              Fetching pricing rates from the Database...
            </p>
          </motion.div>
        ) : !isSuccess ? (
          /* CASE 3: STANDARD ATTENDANCE FORM */
          <motion.div
            key="attendance-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
            className="max-h-[80vh] overflow-y-auto pr-1 pb-12 space-y-3 font-sans"
          >
            {/* FILTER MODE TOGGLE SWITCH */}
            {!selectedClient && (
              <div className="flex bg-(--bg-input) p-1 rounded-xl border border-(--border-color)">
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('non-member');
                    setMemberSearch('');
                    setSuggestions([]);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    filterMode === 'non-member'
                      ? 'bg-(--color-primary) text-white shadow-md'
                      : 'text-(--color-text)/60 hover:text-(--color-text)'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Non-Members</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('member');
                    setMemberSearch('');
                    setSuggestions([]);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    filterMode === 'member'
                      ? 'bg-(--color-primary) text-white shadow-md'
                      : 'text-(--color-text)/60 hover:text-(--color-text)'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Members Only</span>
                </button>
              </div>
            )}

            {/* SEARCH INPUT & CAMERA TRIGGER */}
            {!selectedClient && (
              <div className="space-y-1.5">
                <label className="text-[11px] sm:text-xs font-bold text-(--color-text) block uppercase tracking-wider">
                  {filterMode === 'non-member'
                    ? 'ENTER WALK-IN GUEST NAME'
                    : 'SEARCH MEMBER OR SCAN BADGE'}
                </label>

                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-(--color-text)/40 group-focus-within:text-(--color-primary)" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => handleMemberSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    disabled={showLiveScanner}
                    placeholder={
                      showLiveScanner
                        ? 'CAMERA SCANNER ACTIVE...'
                        : filterMode === 'non-member'
                          ? 'TYPE GUEST NAME...'
                          : 'TYPE NAME, PHONE, CARD CODE OR ID...'
                    }
                    className={`w-full pl-10 pr-20 py-2.5 sm:py-3 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs sm:text-sm font-bold uppercase transition-all ${
                      showLiveScanner
                        ? 'opacity-50 cursor-not-allowed text-(--color-text)/40'
                        : 'text-(--color-text) placeholder:text-(--color-text)/30 focus:border-(--color-primary) focus:ring-2 focus:ring-[var(--color-primary)]/20'
                    }`}
                    autoFocus
                  />

                  {memberSearch && !showLiveScanner && (
                    <button
                      type="button"
                      onClick={() => setMemberSearch('')}
                      className="absolute right-11 top-1/2 -translate-y-1/2 p-1 hover:bg-(--bg-card) rounded-full text-(--color-text)/40 hover:text-(--color-text) transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStartScan}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                      showLiveScanner
                        ? 'bg-(--color-primary) text-white shadow-lg ring-2 ring-[var(--color-primary)]/50 animate-pulse'
                        : 'text-(--color-text)/60 hover:text-(--color-primary) hover:bg-(--bg-card)'
                    }`}
                  >
                    <QrCode className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* LIVE CAMERA VIEWFINDER */}
                {showLiveScanner && (
                  <div className="mt-2 p-3 bg-(--bg-page) border border-(--border-color) rounded-2xl relative text-center animate-fade-in z-30 shadow-2xl space-y-2">
                    <style>{`
                      #live-qr-reader {
                        width: 100% !important;
                        height: 100% !important;
                        border: none !important;
                        background: transparent !important;
                        position: relative !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: hidden !important;
                      }
                      #live-qr-reader__scan_region {
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
                      #live-qr-reader video {
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                        position: absolute !important;
                        inset: 0 !important;
                        border-radius: 1rem !important;
                      }
                      #qr-shaded-region,
                      #live-qr-reader__scan_region svg,
                      #live-qr-reader__scan_region img,
                      #live-qr-reader__dashboard,
                      #live-qr-reader__dashboard_section,
                      #live-qr-reader__header_message {
                        display: none !important;
                      }
                    `}</style>

                    <div className="flex items-center justify-between border-b border-(--border-color) pb-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        LIVE CAMERA ACTIVE
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLiveScanner(false);
                          stopAllCameraTracks();
                        }}
                        className="text-xs text-(--color-text)/60 hover:text-(--color-text) p-1 rounded cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="relative w-full h-56 sm:h-64 rounded-2xl overflow-hidden bg-(--bg-page) border border-(--border-color) flex items-center justify-center shadow-inner">
                      <div id="live-qr-reader" className="w-full h-full" />
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                        <div className="w-44 h-44 border border-(--color-primary)/40 rounded-2xl relative">
                          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-3 border-l-3 border-(--color-primary) rounded-tl-lg" />
                          <div className="absolute -top-1 -right-1 w-5 h-5 border-t-3 border-r-3 border-(--color-primary) rounded-tr-lg" />
                          <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-3 border-l-3 border-(--color-primary) rounded-bl-lg" />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-3 border-r-3 border-(--color-primary) rounded-br-lg" />
                        </div>
                      </div>
                    </div>

                    {cameras.length > 1 && (
                      <div className="flex items-center justify-center pt-2">
                        <button
                          type="button"
                          onClick={handleCycleCamera}
                          className="px-4 py-1.5 bg-(--bg-input) hover:bg-(--bg-card) text-(--color-primary-light) border border-(--border-color) rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md transition-all"
                        >
                          <SwitchCamera className="w-4 h-4" />
                          <span>Switch Camera</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* DEFAULT EMPTY STATE BANNER */}
                {!memberSearch.trim() && !showLiveScanner && (
                  <div className="py-7 px-4 border-2 border-dashed border-(--border-color) rounded-2xl bg-slate-50/50 dark:bg-zinc-900/40 text-center flex flex-col items-center justify-center space-y-2.5 animate-fade-in select-none">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                      {filterMode === 'non-member' ? (
                        <User className="w-6 h-6 stroke-[2.2]" />
                      ) : (
                        <Users className="w-6 h-6 stroke-[2.2]" />
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        {filterMode === 'non-member'
                          ? 'Process Non-Member Walk-In'
                          : 'Search Member Record'}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium max-w-xs leading-relaxed">
                        {filterMode === 'non-member'
                          ? 'Type the guest name above to choose a regular or student daily pass.'
                          : 'Type a member name, phone number, card code, or scan a badge to verify.'}
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      <QrCode className="w-3 h-3 text-blue-500" />
                      Barcode / QR Ready
                    </span>
                  </div>
                )}

                {/* MEMBERS ONLY TAB SEARCH RESULTS */}
                {filterMode === 'member' && memberSearch.trim().length > 0 && (
                  <div className="mt-3 space-y-3 animate-fade-in">
                    {suggestions.length > 0 ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white block uppercase tracking-wider px-0.5">
                          REGISTERED MEMBERS FOUND ({suggestions.length})
                        </span>

                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {suggestions.map((m) => {
                            const isSuspended = m.status === 'Suspended';
                            const isLocked = isSuspended;
                            const isNonActive = m.status !== 'Active';

                            return (
                              <div
                                key={m.id}
                                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all ${
                                  isLocked
                                    ? 'bg-slate-50/50 dark:bg-zinc-900/40 border-(--border-color) opacity-60'
                                    : 'bg-(--bg-card) border-(--border-color) hover:border-slate-300 dark:hover:border-zinc-700 shadow-xs'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPhotoModal({
                                        name: m.name,
                                        memberId: m.memberId,
                                        url: m.avatarUrl || null,
                                      })
                                    }
                                    className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-zinc-800 border border-(--border-color) overflow-hidden flex items-center justify-center font-black text-slate-900 dark:text-white text-xs shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group relative"
                                    title="Click to verify member photo"
                                  >
                                    {m.avatarUrl ? (
                                      <img
                                        src={m.avatarUrl}
                                        alt={m.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span>{m.name[0]?.toUpperCase()}</span>
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                      <Eye className="w-3.5 h-3.5 text-white" />
                                    </div>
                                  </button>

                                  <div className="min-w-0 flex-1 text-left">
                                    <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate uppercase leading-snug">
                                      {m.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                      {m.membership} •{' '}
                                      <span className="font-mono text-[10px]">
                                        {m.memberId}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {isNonActive && (
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        isSuspended
                                          ? 'bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30'
                                          : m.status === 'Expired'
                                            ? 'bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30'
                                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                      }`}
                                    >
                                      {m.status}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    disabled={isLocked}
                                    onClick={() => handleSelectMember(m)}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-slate-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    Select
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="py-7 px-4 border-2 border-dashed border-(--border-color) rounded-2xl bg-slate-50/50 dark:bg-zinc-900/40 text-center flex flex-col items-center justify-center space-y-3 animate-fade-in select-none">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
                          <UserPlus className="w-6 h-6 stroke-[2.2]" />
                        </div>

                        <div className="space-y-0.5">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                            No Registered Members Found
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium max-w-xs leading-relaxed">
                            No registered members match &ldquo;
                            <strong className="text-slate-800 dark:text-slate-200">
                              {memberSearch.toUpperCase()}
                            </strong>
                            &rdquo;. You can enroll them into a plan below.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleRedirectToSubscription}
                          className="w-full max-w-xs py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                        >
                          <span>ENROLL IN SUBSCRIPTION PLANS</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* NON-MEMBERS TAB WALK-IN PROCESSOR CARD */}
                {filterMode === 'non-member' &&
                  memberSearch.trim().length > 0 && (
                    <div className="mt-3 p-4 bg-slate-50 dark:bg-zinc-900/80 border-2 border-dashed border-(--border-color) rounded-2xl flex flex-col items-center justify-center text-center space-y-3 shadow-sm animate-fade-in">
                      <div className="flex items-center justify-center gap-2 text-slate-800 dark:text-slate-200 font-black text-sm uppercase tracking-wide">
                        <User className="w-4 h-4 text-blue-500" />
                        <span>
                          NAME:{' '}
                          <span className="text-blue-600 dark:text-blue-400 font-mono underline underline-offset-4">
                            {walkInPreviewName}
                          </span>
                        </span>
                      </div>

                      <div className="w-full space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          SELECT WALK-IN PASS TYPE
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setWalkInPassType('walkin_regular')}
                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                              walkInPassType === 'walkin_regular'
                                ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/50'
                                : 'border-(--border-color) bg-(--bg-card) hover:border-slate-400 dark:hover:border-zinc-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  walkInPassType === 'walkin_regular'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                <Ticket className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 text-left">
                                <div className="text-[11px] font-bold text-slate-900 dark:text-white uppercase truncate">
                                  Regular
                                </div>
                                <div className="text-[9px] text-slate-500 truncate">
                                  Standard
                                </div>
                              </div>
                            </div>
                            <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0 ml-1">
                              {walkinRegularFee !== null
                                ? `₱${walkinRegularFee.toFixed(2)}`
                                : '...'}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setWalkInPassType('walkin_student')}
                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                              walkInPassType === 'walkin_student'
                                ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/50'
                                : 'border-(--border-color) bg-(--bg-card) hover:border-slate-400 dark:hover:border-zinc-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  walkInPassType === 'walkin_student'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                <GraduationCap className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 text-left">
                                <div className="text-[11px] font-bold text-slate-900 dark:text-white uppercase truncate">
                                  Student
                                </div>
                                <div className="text-[9px] text-amber-500 font-bold truncate">
                                  ID Req.
                                </div>
                              </div>
                            </div>
                            <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0 ml-1">
                              {walkinStudentFee !== null
                                ? `₱${walkinStudentFee.toFixed(2)}`
                                : '...'}
                            </div>
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={
                          !memberSearch.trim() ||
                          walkinRegularFee === null ||
                          walkinStudentFee === null
                        }
                        onClick={handleContinueAsWalkIn}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-slate-500 disabled:opacity-40 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>PROCESS WALK-IN</span>
                        <ChevronRight className="w-5 h-5" />
                      </button>

                      {memberSearch.trim() && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                          Press{' '}
                          <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-zinc-800 rounded font-mono text-[9px]">
                            Enter
                          </kbd>{' '}
                          or click button to proceed
                        </p>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* DUPLICATE CHECK-IN ALERT */}
            {duplicateLog && !selectedClient?.isWalkIn && (
              <div className="p-3.5 bg-amber-500/10 border-2 border-amber-500/40 text-amber-700 dark:text-amber-400 rounded-2xl flex flex-col items-center text-center space-y-2 animate-fade-in shadow-md">
                <div className="flex items-center justify-center gap-2 font-black text-xs sm:text-sm">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                  <span>Member already checked in today.</span>
                </div>

                <label className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-xl cursor-pointer transition-all shadow-xs">
                  <input
                    type="checkbox"
                    checked={adminOverride}
                    onChange={(e) => setAdminOverride(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-500 text-blue-600 focus:ring-amber-500 accent-blue-600"
                  />
                  <span className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                    PROCEED ANYWAY (OVERRIDE)
                  </span>
                </label>
              </div>
            )}

            {/* VERIFIED CUSTOMER CARD */}
            {selectedClient && (
              <div className="p-3 bg-(--bg-input) border border-(--border-color) rounded-xl flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPhotoModal({
                        name: selectedClient.name,
                        memberId: selectedClient.memberId || undefined,
                        url: selectedClient.avatarUrl || null,
                      })
                    }
                    className="w-11 h-11 rounded-xl bg-(--color-primary) text-white overflow-hidden flex items-center justify-center font-black text-base shrink-0 cursor-pointer hover:ring-2 hover:ring-(--color-primary)/50 transition-all shadow-md"
                  >
                    {selectedClient.avatarUrl ? (
                      <img
                        src={selectedClient.avatarUrl}
                        alt={selectedClient.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{selectedClient.name[0]?.toUpperCase()}</span>
                    )}
                  </button>

                  <div className="min-w-0 text-left space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-xs sm:text-sm text-(--color-text) truncate uppercase">
                        {selectedClient.name}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30">
                        {selectedClient.isWalkIn
                          ? 'WALK-IN GUEST'
                          : 'REGISTERED MEMBER'}
                      </span>
                    </div>
                    <p className="text-[11px] text-(--color-text)/60 truncate">
                      {selectedClient.isWalkIn
                        ? 'Non-Member Visitor'
                        : `${selectedClient.membership} • ID: ${selectedClient.memberId}`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetForm}
                  className="px-2.5 py-1.5 rounded-lg bg-(--bg-card) hover:bg-(--bg-input) text-xs font-bold uppercase tracking-wider text-(--color-text) border border-(--border-color) transition-colors shrink-0 cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}

            {/* PASS SELECTION, BILLING & CHECKOUT */}
            {selectedClient && (
              <div
                className={`space-y-3 transition-all duration-300 ${
                  isLockedByDuplicate
                    ? 'opacity-25 pointer-events-none grayscale select-none'
                    : 'opacity-100'
                }`}
              >
                {/* CHOOSE TODAY'S ENTRY PASS */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-900 dark:text-slate-100 block uppercase tracking-wider">
                    SELECT ENTRY PASS
                  </label>

                  {!selectedClient.isWalkIn &&
                    (selectedClient.status === 'Expired' ||
                      selectedClient.membership === 'No Active Plan') && (
                      <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase text-center mb-1">
                        ⚠️ MEMBERSHIP PLAN EXPIRED — DAILY ENTRY REQUIRED
                      </div>
                    )}

                  {selectedClient.isWalkIn ||
                  selectedClient.status === 'Expired' ||
                  selectedClient.membership === 'No Active Plan' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry('walkin_regular')}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          selectedEntry === 'walkin_regular'
                            ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/50'
                            : 'border-(--border-color) bg-(--bg-card) hover:border-slate-400 dark:hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              selectedEntry === 'walkin_regular'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <Ticket className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate">
                              Regular Pass
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              Daily pass
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0 ml-1">
                          {walkinRegularFee !== null
                            ? `₱${walkinRegularFee.toFixed(2)}`
                            : '...'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedEntry('walkin_student')}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          selectedEntry === 'walkin_student'
                            ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/50'
                            : 'border-(--border-color) bg-(--bg-card) hover:border-slate-400 dark:hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              selectedEntry === 'walkin_student'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <GraduationCap className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate">
                              Student Pass
                            </div>
                            <div className="text-[10px] text-amber-500 font-bold truncate">
                              ID required
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0 ml-1">
                          {walkinStudentFee !== null
                            ? `₱${walkinStudentFee.toFixed(2)}`
                            : '...'}
                        </div>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedEntry('member_entry')}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/50 cursor-pointer`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <UserCheck className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white uppercase">
                            Member Plan Entry
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {selectedClient.membership}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0">
                        {selectedClient.membership
                          ?.toLowerCase()
                          .includes('year')
                          ? yearlyMemberFee !== null
                            ? `₱${yearlyMemberFee.toFixed(2)}`
                            : '...'
                          : '₱0.00'}
                      </div>
                    </button>
                  )}
                </div>

                {/* BILLING & PAYMENT SUMMARY */}
                {selectedEntry && (
                  <div className="p-3.5 bg-(--bg-input) border border-(--border-color) rounded-2xl space-y-3 shadow-xs text-xs">
                    <span className="text-xs font-bold uppercase tracking-wider text-(--color-text) block">
                      BILLING & SETTLEMENT
                    </span>

                    {derivedBilling.totalDue === 0 ? (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl flex items-center gap-2 font-bold">
                        <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        <p className="text-xs leading-tight uppercase">
                          NO PAYMENT REQUIRED. ACTIVE SUBSCRIPTION COVERS
                          TODAY'S ENTRY.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {/* PAYMENT METHOD SWITCHER */}
                        <div className="grid grid-cols-2 bg-(--bg-card) p-1 rounded-xl border border-(--border-color)">
                          {(['Cash', 'GCash'] as const).map((method) => {
                            const isActive = paymentMethod === method;
                            return (
                              <button
                                key={method}
                                type="button"
                                onClick={() => setPaymentMethod(method)}
                                className={`py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                  isActive
                                    ? 'bg-(--color-primary) text-white shadow-sm'
                                    : 'text-(--color-text)/60 hover:text-(--color-text)'
                                }`}
                              >
                                {method === 'Cash' ? (
                                  <>
                                    <Coins className="w-3.5 h-3.5" /> Cash
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="w-3.5 h-3.5" /> GCash
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* INPUTS: CASH AMOUNT OR GCASH REFERENCE NUMBER */}
                        {paymentMethod === 'Cash' ? (
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-(--color-text)/80 uppercase">
                              Amount Received
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text)/40 font-bold font-mono text-sm">
                                ₱
                              </span>
                              <input
                                type="number"
                                value={amountReceived}
                                onChange={(e) =>
                                  setAmountReceived(e.target.value)
                                }
                                placeholder="0.00"
                                className="w-full pl-8 pr-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl outline-none text-(--color-text) font-mono font-bold text-sm focus:border-(--color-primary)"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-(--color-text)/80 uppercase">
                              GCash Reference Number
                            </label>
                            <input
                              type="text"
                              value={referenceNumber}
                              onChange={(e) =>
                                setReferenceNumber(e.target.value)
                              }
                              placeholder="ENTER 6+ DIGIT REFERENCE CODE..."
                              className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl outline-none text-(--color-text) placeholder:text-(--color-text)/30 font-mono font-bold text-xs uppercase focus:border-(--color-primary)"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* RECEIPT BREAKDOWN */}
                    <div className="p-2.5 rounded-xl bg-(--bg-card) border border-(--border-color) space-y-1 text-xs text-(--color-text)/80 font-medium">
                      <div className="flex justify-between">
                        <span>Pass Type:</span>
                        <span className="font-bold text-(--color-text) truncate max-w-45 uppercase">
                          {derivedBilling.title}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Entry Fee:</span>
                        <span className="font-bold text-(--color-text)">
                          ₱{derivedBilling.subtotal.toFixed(2)}
                        </span>
                      </div>
                      {paymentMethod === 'GCash' &&
                        derivedBilling.convenienceFee > 0 && (
                          <div className="flex justify-between">
                            <span>GCash Fee:</span>
                            <span className="text-rose-500 font-bold">
                              +₱{derivedBilling.convenienceFee.toFixed(2)}
                            </span>
                          </div>
                        )}
                      {amountReceived &&
                        paymentMethod === 'Cash' &&
                        derivedBilling.totalDue > 0 && (
                          <div className="flex justify-between text-emerald-500 font-bold">
                            <span>Calculated Change:</span>
                            <span>
                              ₱{derivedBilling.calculatedChange.toFixed(2)}
                            </span>
                          </div>
                        )}
                    </div>

                    {/* TOTAL COST BANNER */}
                    <div className="p-3 bg-(--bg-card) border-2 border-(--color-primary) rounded-2xl space-y-0.5 text-center shadow-lg">
                      <span className="text-[10px] font-black uppercase tracking-widest text-(--color-text)/60 block">
                        TOTAL AMOUNT TO PAY
                      </span>
                      <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-500">
                        ₱{derivedBilling.totalDue.toFixed(2)}
                      </div>
                    </div>

                    {/* SUBMIT BUTTON */}
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleCompleteCheckIn}
                        disabled={
                          !isFormValid ||
                          isSubmitting ||
                          isLockedByDuplicate ||
                          isLocked ||
                          !isSessionOpen
                        }
                        title={
                          isLocked || !isSessionOpen
                            ? getLockReason('record check-ins')
                            : undefined
                        }
                        className={`w-full py-3.5 bg-(--color-primary) hover:bg-(--color-primary-hover) text-white text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg transition-all duration-200 disabled:opacity-50 ${
                          isLocked || !isSessionOpen
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer'
                        }`}
                      >
                        {isSubmitting
                          ? 'RECORDING CHECK-IN...'
                          : isLocked || !isSessionOpen
                            ? 'SESSION CLOSED (LOCKED)'
                            : 'COMPLETE CHECK-IN'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          /* CASE 4: ATTENDANCE CONFIRMED BANNER */
          <motion.div
            key="attendance-success"
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: {
                type: 'spring',
                damping: 24,
                stiffness: 280,
                duration: 0.4,
              },
            }}
            exit={{
              opacity: 0,
              scale: 0.9,
              y: -16,
              transition: { duration: 0.25, ease: 'easeInOut' },
            }}
            className="py-12 flex flex-col items-center justify-center space-y-4"
          >
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                damping: 18,
                stiffness: 300,
                delay: 0.08,
              }}
              className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl shadow-emerald-500/25 ring-4 ring-emerald-500/20"
            >
              <Check className="w-8 h-8 stroke-[3]" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="font-black text-xl text-(--color-text) uppercase tracking-wider font-heading text-center"
            >
              CHECK-IN AUTHORIZED
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.3 }}
              className="text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-xs text-center uppercase tracking-wide"
            >
              Attendance record filed in the gym logbook.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MEMBER PHOTO VERIFICATION LIGHTBOX MODAL */}
      {photoModal && (
        <Modal
          isOpen={!!photoModal}
          onClose={() => setPhotoModal(null)}
          title="MEMBER PHOTO VERIFICATION"
          className="w-full max-w-xs mx-auto p-5 text-center relative bg-(--bg-card) border border-(--border-color) text-(--color-text) z-120"
        >
          <button
            type="button"
            onClick={() => setPhotoModal(null)}
            className="absolute top-3 right-3 p-1 rounded-lg text-(--color-text)/60 hover:text-(--color-text) bg-(--bg-input) cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="space-y-3 pt-2">
            <div className="w-48 h-48 mx-auto rounded-2xl overflow-hidden bg-(--bg-input) border-2 border-(--color-primary)/40 shadow-xl flex items-center justify-center relative">
              {photoModal.url ? (
                <img
                  src={photoModal.url}
                  alt={photoModal.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-16 h-16 text-(--color-text)/30" />
              )}
            </div>

            <div className="space-y-0.5">
              <h3 className="font-black text-sm text-(--color-text) uppercase">
                {photoModal.name}
              </h3>
              {photoModal.memberId && (
                <p className="text-xs font-mono font-bold text-(--color-primary-light)">
                  {photoModal.memberId}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </Modal>,
    document.body
  );
};
