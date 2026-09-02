// src/pages/logbook/components/LogbookRecordAttendance.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
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
  ShieldCheck,
  SwitchCamera,
  UserPlus,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../stores/authStore';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
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

  // Handle JSON
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

  // Handle URL
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

  // Handle Colon Format (e.g. MEM-000015:2029-08-24 or MEMBER:MEM-000015)
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

const generateUniqueWalkInName = (baseName: string, existingLogs: any[]) => {
  const cleanBase = baseName
    .replace(/\s*\(\d+\)$/, '')
    .trim()
    .toUpperCase();

  const matchingWalkIns = existingLogs.filter((log: any) => {
    if (log.customer_type !== 'Walk-In') return false;
    const name = (log.customer_name || '').toUpperCase().trim();
    const logCleanBase = name.replace(/\s*\(\d+\)$/, '').trim();
    return logCleanBase === cleanBase;
  });

  if (matchingWalkIns.length === 0) {
    return cleanBase;
  }

  const nextNumber = matchingWalkIns.length + 1;
  return `${cleanBase} (${nextNumber})`;
};

export const LogbookRecordAttendance: React.FC<
  LogbookRecordAttendanceProps
> = ({ isOpen, initialSearch = '', onClose, onCheckInSuccess }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore() as any;
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

  const [walkinRegularFee, setWalkinRegularFee] = useState(100);
  const [walkinStudentFee, setWalkinStudentFee] = useState(80);
  const [yearlyMemberFee, setYearlyMemberFee] = useState(50);
  const [gcashFeeRate, setGcashFeeRate] = useState(10);

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
    try {
      const { data: ratesData, error } = await supabase
        .from('rates_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (ratesData) {
        setWalkinRegularFee(Number(ratesData.regular_walk_in) || 100);
        setWalkinStudentFee(Number(ratesData.student_walk_in) || 80);
        setYearlyMemberFee(Number(ratesData.yearly_walk_in) || 50);
        setGcashFeeRate(Number(ratesData.gcash_fee) ?? 10);
      } else {
        const activeSettings = await settingsService.load();
        setWalkinRegularFee(activeSettings.regular_walkin_fee || 100);
        setWalkinStudentFee(activeSettings.student_walkin_fee || 80);
        setYearlyMemberFee(activeSettings.yearly_member_checkin_fee || 50);
        setGcashFeeRate(activeSettings.gcash_fee ?? 10);
      }
    } catch (e) {
      console.warn('Failed to load rates configuration:', e);
    }
  }, []);

  const loadDynamicMembers = useCallback(async () => {
    try {
      const [members, subscriptions, cards, { data: dbAttendance }] =
        await Promise.all([
          memberService.getAll(),
          subscriptionService.getAll(),
          cardService.getAll(),
          supabase.from('attendance').select('*').is('deleted_at', null),
        ]);

      const attendanceList = dbAttendance || [];
      const now = new Date();

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
    if (!selectedClient) return null;
    return todayLogs.find((log: any) => {
      if (selectedClient.isWalkIn) {
        const cleanSelected = selectedClient.name
          .replace(/\s*\(\d+\)$/, '')
          .trim()
          .toLowerCase();
        const cleanLogName = (log.customer_name || '')
          .replace(/\s*\(\d+\)$/, '')
          .trim()
          .toLowerCase();
        return (
          cleanLogName === cleanSelected && log.customer_type === 'Walk-In'
        );
      } else {
        return log.member_id === selectedClient.memberId;
      }
    });
  }, [selectedClient, todayLogs]);

  const isLockedByDuplicate = Boolean(duplicateLog && !adminOverride);

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

  // Comprehensive Scan Processing (Direct Member Validation)
  const handleBarcodeOrQrScanned = useCallback(
    async (scannedText: string) => {
      const raw = scannedText.trim();
      if (!raw) return;

      const cleanId = extractCleanMemberId(raw);
      const cleanIdUpper = cleanId.toUpperCase();
      const rawUpper = raw.toUpperCase();

      // 1. Check if it's an online registration ticket
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

      // 2. Lookup in loaded members list
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

      // 3. Fallback: Search online if members list wasn't cached yet
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

      // 4. If code is unrecognized, populate search bar
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
              { fps: 20, qrbox: { width: 220, height: 220 } },
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
    if (query.length < 3) {
      toast.warning('Guest name must be at least 3 characters.');
      return;
    }
    const client: SelectedClient = {
      name: query.toUpperCase(),
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
        if (memberSearch.trim().length >= 3) {
          handleContinueAsWalkIn();
        } else {
          toast.warning('Guest name must be at least 3 characters.');
        }
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
    let subtotal = 0;
    let title = 'None Selected';

    if (selectedEntry === 'walkin_regular') {
      subtotal = Number(walkinRegularFee) || 0;
      title = 'Walk-In Regular Pass';
    } else if (selectedEntry === 'walkin_student') {
      subtotal = Number(walkinStudentFee) || 0;
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
        subtotal = Number(yearlyMemberFee) || 0;
        title = 'Yearly Member Entry';
      } else {
        subtotal = 0;
        title = 'Monthly Member Entry';
      }
    }

    const convenienceFee =
      paymentMethod === 'GCash' && subtotal > 0 ? Number(gcashFeeRate) || 0 : 0;
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
    if (isSubmittingRef.current || isSuccess || !selectedClient) return;

    if (duplicateLog && !adminOverride) {
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
            check_in_time: new Date().toISOString(),
            plan_name: derivedBilling.title,
            entry_fee: derivedBilling.totalDue,
            base_price: derivedBilling.subtotal,
            gcash_fee: gcashFeeVal,
            card_fee: 0,
            gcash_ref_no: gcashRefVal || null,
            payment_method:
              derivedBilling.totalDue > 0 ? paymentMethod : 'Cash',
            staff_name: user?.email || 'Counter Staff',
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
    if (!selectedClient || !selectedEntry) return false;
    if (duplicateLog && !adminOverride) return false;

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
      title="Reception Check-In"
      className="w-full mx-auto my-auto p-4 sm:p-5 overflow-visible transition-all duration-300 relative text-left max-w-lg"
    >
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => {
          stopAllCameraTracks();
          onClose();
        }}
        className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
        aria-label="Close Dialog"
      >
        <X className="w-5 h-5" />
      </button>

      {!isSuccess ? (
        <div className="max-h-[80vh] overflow-y-auto pr-1 pb-12 space-y-3 font-sans">
          {/* FILTER MODE TOGGLE SWITCH */}
          {!selectedClient && (
            <div className="flex bg-(--bg-page) p-1 rounded-xl border border-(--border-color)">
              <button
                type="button"
                onClick={() => {
                  setFilterMode('non-member');
                  setMemberSearch('');
                  setSuggestions([]);
                }}
                className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  filterMode === 'non-member'
                    ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-(--color-text)'
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
                    ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-(--color-text)'
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
              <label className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 block uppercase tracking-wider">
                {filterMode === 'non-member'
                  ? 'ENTER WALK-IN GUEST NAME'
                  : 'SEARCH MEMBER OR SCAN BADGE'}
              </label>

              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400" />
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
                        ? 'TYPE GUEST NAME (MIN 3 CHARS)...'
                        : 'TYPE NAME, PHONE, CARD CODE OR ID...'
                  }
                  className={`w-full pl-10 pr-20 py-2.5 sm:py-3 bg-(--bg-page) border-2 border-(--border-color) rounded-xl text-xs sm:text-sm font-bold uppercase transition-all ${
                    showLiveScanner
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-zinc-900 text-slate-400'
                      : 'text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-600 dark:focus:border-blue-500'
                  }`}
                  autoFocus
                />

                {memberSearch && !showLiveScanner && (
                  <button
                    type="button"
                    onClick={() => setMemberSearch('')}
                    className="absolute right-11 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-full text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartScan}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                    showLiveScanner
                      ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-500/50 animate-pulse'
                      : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                  title="Scan QR / Barcode using Camera"
                >
                  <QrCode className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* LIVE CAMERA VIEWFINDER */}
              {showLiveScanner && (
                <div className="mt-2 p-3 bg-zinc-950 border-2 border-blue-500/40 rounded-2xl relative text-center animate-fade-in z-30 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      LIVE CAMERA ACTIVE
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLiveScanner(false);
                        stopAllCameraTracks();
                      }}
                      className="text-xs text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative w-full aspect-square max-w-55 mx-auto rounded-2xl overflow-hidden bg-black border-2 border-dashed border-blue-500/50 flex items-center justify-center shadow-inner">
                    <div
                      id="live-qr-reader"
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <div className="w-full h-full border-2 border-blue-500 rounded-xl relative animate-pulse">
                        <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-4 border-l-4 border-blue-400" />
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-4 border-r-4 border-blue-400" />
                        <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-4 border-l-4 border-blue-400" />
                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-4 border-r-4 border-blue-400" />
                      </div>
                    </div>
                  </div>

                  {/* CAMERA SWITCHER CONTROLS */}
                  {cameras.length > 1 && (
                    <div className="flex items-center justify-center pt-2">
                      <button
                        type="button"
                        onClick={handleCycleCamera}
                        className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-blue-400 border border-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
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
                <div className="mt-3 p-4 bg-slate-50 dark:bg-zinc-900/60 border border-(--border-color) rounded-2xl text-center space-y-1.5 animate-fade-in">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                    {filterMode === 'non-member' ? (
                      <User className="w-4.5 h-4.5" />
                    ) : (
                      <Users className="w-4.5 h-4.5" />
                    )}
                  </div>

                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                    {filterMode === 'non-member'
                      ? 'PROCESS NON-MEMBER WALK-IN'
                      : 'SEARCH MEMBER RECORD'}
                  </h4>

                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">
                    {filterMode === 'non-member'
                      ? 'Type the guest name above (min 3 chars) and select pass option.'
                      : 'Type a member name, phone number, or ID above.'}
                  </p>
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
                          const isExpired = m.status === 'Expired';
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
                                        : isExpired
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
                    <div className="p-4 bg-slate-50 dark:bg-zinc-900/80 border-2 border-dashed border-(--border-color) rounded-2xl text-center space-y-3 shadow-xs">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        NO REGISTERED MEMBERS MATCH "
                        <strong>{memberSearch.toUpperCase()}</strong>"
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleRedirectToSubscription}
                          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>ENROLL NEW MEMBER IN SUBSCRIPTION PLANS</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
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
                          {memberSearch.toUpperCase()}
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
                            ₱{walkinRegularFee.toFixed(2)}
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
                            ₱{walkinStudentFee.toFixed(2)}
                          </div>
                        </button>
                      </div>
                    </div>

                    {memberSearch.trim().length < 3 && (
                      <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wide">
                        ⚠️ Guest name must be at least 3 characters
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={memberSearch.trim().length < 3}
                      onClick={handleContinueAsWalkIn}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-slate-500 disabled:opacity-40 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>PROCESS WALK-IN</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    {memberSearch.trim().length >= 3 && (
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
          {duplicateLog && (
            <div className="p-3.5 bg-amber-500/10 border-2 border-amber-500/40 text-amber-700 dark:text-amber-400 rounded-2xl flex flex-col items-center text-center space-y-2 animate-fade-in shadow-md">
              <div className="flex items-center justify-center gap-2 font-black text-xs sm:text-sm">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                <span>Customer already checked in today.</span>
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
            <div className="p-3 bg-slate-100/90 dark:bg-zinc-900/90 border-2 border-(--border-color) rounded-xl flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-3 min-w-0">
                {!selectedClient.isWalkIn ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPhotoModal({
                        name: selectedClient.name,
                        memberId: selectedClient.memberId || undefined,
                        url: selectedClient.avatarUrl || null,
                      })
                    }
                    className="w-11 h-11 rounded-xl bg-blue-600 text-white overflow-hidden flex items-center justify-center font-black text-base shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group relative shadow-md"
                    title="Click to verify member photo identity"
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
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                  </button>
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black text-base shrink-0 shadow-md">
                    {selectedClient.name[0]?.toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 text-left space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white truncate uppercase">
                      {selectedClient.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                        selectedClient.isWalkIn
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {selectedClient.isWalkIn
                        ? 'WALK-IN GUEST'
                        : 'REGISTERED MEMBER'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {selectedClient.isWalkIn
                      ? 'Non-Member Visitor'
                      : `${selectedClient.membership} • ID: ${selectedClient.memberId}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
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
                        ₱{walkinRegularFee.toFixed(2)}
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
                        ₱{walkinStudentFee.toFixed(2)}
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
                      {selectedClient.membership?.toLowerCase().includes('year')
                        ? `₱${yearlyMemberFee.toFixed(2)}`
                        : '₱0.00'}
                    </div>
                  </button>
                )}
              </div>

              {/* BILLING & PAYMENT SUMMARY */}
              {selectedEntry && (
                <div className="p-3.5 bg-slate-50 dark:bg-zinc-900/50 border border-(--border-color) rounded-2xl space-y-3 shadow-xs text-xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 block">
                    BILLING & SETTLEMENT
                  </span>

                  {derivedBilling.totalDue === 0 ? (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-2 font-bold">
                      <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-xs leading-tight">
                        NO PAYMENT REQUIRED. MONTHLY SUBSCRIPTION COVERS TODAY'S
                        ENTRY.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 bg-(--bg-page) p-1 rounded-xl border border-(--border-color)">
                        {(['Cash', 'GCash'] as const).map((method) => {
                          const isActive = paymentMethod === method;
                          return (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setPaymentMethod(method)}
                              className={`py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all ${
                                isActive
                                  ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                                  : 'text-slate-500 hover:text-(--color-text)'
                              }`}
                            >
                              {method === 'Cash' ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Coins className="w-3.5 h-3.5" /> Cash
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <CreditCard className="w-3.5 h-3.5" /> GCash
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {paymentMethod === 'Cash' ? (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                            Amount Received
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">
                              ₱
                            </span>
                            <input
                              type="number"
                              value={amountReceived}
                              onChange={(e) =>
                                setAmountReceived(e.target.value)
                              }
                              placeholder="0.00"
                              className="w-full pl-8 pr-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-slate-900 dark:text-white font-mono font-bold text-sm"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                            GCash Reference Number
                          </label>
                          <input
                            type="text"
                            value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                            placeholder="Enter reference code..."
                            className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-slate-900 dark:text-white font-mono font-bold text-xs uppercase"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* RECEIPT BREAKDOWN */}
                  <div className="p-2.5 rounded-xl bg-(--bg-page) border border-(--border-color) space-y-1 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    <div className="flex justify-between">
                      <span>Pass Type:</span>
                      <span className="font-bold text-slate-900 dark:text-white truncate max-w-45 uppercase">
                        {derivedBilling.title}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Entry Fee:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
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
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                          <span>Calculated Change:</span>
                          <span>
                            ₱{derivedBilling.calculatedChange.toFixed(2)}
                          </span>
                        </div>
                      )}
                  </div>

                  {/* TOTAL COST BANNER */}
                  <div className="p-3 bg-slate-900 dark:bg-black border-2 border-blue-600 dark:border-blue-500 rounded-2xl space-y-0.5 text-center shadow-xl">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 block">
                      TOTAL AMOUNT TO PAY
                    </span>
                    <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-400">
                      ₱{derivedBilling.totalDue.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* CHECK-IN ACTION BUTTON */}
              {selectedEntry && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleCompleteCheckIn}
                    disabled={
                      !isFormValid || isSubmitting || isLockedByDuplicate
                    }
                    className="w-full py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg transition-all duration-200 cursor-pointer"
                  >
                    {isSubmitting
                      ? 'RECORDING CHECK-IN...'
                      : 'COMPLETE CHECK-IN'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-pulse">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="font-black text-xl text-(--color-text) uppercase tracking-wider">
            CHECK-IN AUTHORIZED
          </h2>
          <p className="text-xs font-semibold text-slate-500 max-w-xs text-center uppercase">
            Attendance record filed in the gym logbook.
          </p>
        </div>
      )}

      {/* MEMBER PHOTO VERIFICATION LIGHTBOX MODAL */}
      {photoModal && (
        <Modal
          isOpen={!!photoModal}
          onClose={() => setPhotoModal(null)}
          title="MEMBER PHOTO VERIFICATION"
          className="w-full max-w-xs mx-auto p-5 text-center relative animate-fade-in z-120"
        >
          <button
            type="button"
            onClick={() => setPhotoModal(null)}
            className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="space-y-3 pt-2">
            <div className="w-48 h-48 mx-auto rounded-2xl overflow-hidden bg-zinc-900 border-2 border-blue-500/40 shadow-2xl flex items-center justify-center relative">
              {photoModal.url ? (
                <img
                  src={photoModal.url}
                  alt={photoModal.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center space-y-1">
                  <User className="w-16 h-16 text-slate-500 mx-auto" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    No Image Uploaded
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-0.5">
              <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase">
                {photoModal.name}
              </h3>
              {photoModal.memberId && (
                <p className="text-xs font-mono font-bold text-blue-500">
                  {photoModal.memberId}
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-(--border-color) flex items-center justify-center gap-1.5 text-xs text-emerald-500 font-bold uppercase">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Identity Match Verification</span>
            </div>
          </div>
        </Modal>
      )}
    </Modal>,
    document.body
  );
};
