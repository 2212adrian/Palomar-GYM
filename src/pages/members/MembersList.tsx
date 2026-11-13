// src/pages/members/MembersList.tsx
import React, {
  useState,
  useMemo,
  useEffect,
  useContext,
  useRef,
  useCallback,
  useDeferredValue,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Users,
  Eye,
  CreditCard,
  RotateCcw,
  Plus,
  Search,
  Settings,
  X,
  UserX,
  UserCheck,
  QrCode,
  Filter,
  MoreVertical,
  Printer,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Check,
  Lock,
  RefreshCw,
  ChevronDown,
  CheckSquare,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { VirtualWindowList } from '../../components/common/VirtualWindowList';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { HeaderActionsContext } from '../../routes';
import { supabase } from '../../lib/supabase/client';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useNavbarStore } from '../../stores/useNavbarStore';
import { useBatterySaver } from '../../hooks/useBatterySaver';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';
import { LegacyDataMigrationModal } from './components/LegacyDataMigrationModal';
import { Database } from 'lucide-react';

// Import Shared Types
import type {
  Member,
  Subscription,
  MemberCard,
  OnlineRegistration,
  MembershipSettings,
} from '../../types/members';

// Import Services
import {
  memberService,
  subscriptionService,
  cardService,
  settingsService,
  getSynchronousInitialSettings,
} from './memberService';

// Import Modals & Views
import { OnlineQueue } from './components/OnlineQueue';
import { MemberProfileView } from './components/MemberProfileView';
import { MemberRecycleBin } from './components/MemberRecycleBin';
import {
  StaffPlansConsole,
  IntakeWizardModal,
} from './components/SubscriptionPlan';
import { ManualCardTemplateModal } from './components/ManualCardTemplateModal';
import { MemberCardPrintModal } from './components/MemberCardPrintModal';
import { MemberAvatar } from './components/MemberAvatar';
import { toast } from 'react-toastify';

interface MembersListProps {
  hideHeaderActions?: boolean;
}

const getMemberAge = (birthday?: string | null): number | null => {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
};

const isMemberMinor = (birthday?: string | null): boolean => {
  const age = getMemberAge(birthday);
  return age !== null && age >= 12 && age <= 17;
};

type FilterChip =
  | 'all'
  | 'recent_sub'
  | 'with_sub'
  | 'expiring'
  | 'expired'
  | 'no_sub'
  | 'unclaimed_card'
  | 'has_card'
  | 'no_card'
  | 'minor'
  | 'suspended';

export const MembersList: React.FC<MembersListProps> = ({
  hideHeaderActions = false,
}) => {
  const { setActions } = useContext(HeaderActionsContext);
  const location = useLocation();
  const navigate = useNavigate();
  const { isBatterySaver } = useBatterySaver();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasTriggeredRenewRef = useRef<boolean>(false);

  const { isSessionOpen } = useCashSessionStore();

  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isPlansPath = useMemo(() => {
    return location.pathname.includes('/plans');
  }, [location.pathname]);

  const { user } = useAuthStore();
  const isSuper = isSuperAdmin(user?.email);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'Directory' | 'Queue'>(
    'Directory'
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [settings, setSettings] =
    useState<MembershipSettings>(getSynchronousInitialSettings);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [activeChip, setActiveChip] = useState<FilterChip>('all');

  // Selection state for multi-select batch operations
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const mobileCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (selectedMemberIds.length === 0) {
      setIsMultiSelect(false);
    }
  }, [selectedMemberIds.length]);

  const resetActionState = useCallback(() => {
    setSelectedMemberIds([]);
    setIsMultiSelect(false);
  }, []);

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRecycleOpen, setIsRecycleOpen] = useState(false);
  const [selectedProfileMember, setSelectedProfileMember] =
    useState<Member | null>(null);
  const [wizardPrefillMember, setWizardPrefillMember] = useState<
    Member | undefined
  >(undefined);
  const [wizardPrefill, setWizardPrefill] = useState<
    OnlineRegistration | undefined
  >(undefined);

  useEffect(() => {
    if (isOffline && isRecycleOpen) {
      setIsRecycleOpen(false);
      toast.warning('Recycle Bin closed: internet connection lost.', {
        toastId: 'recycle-bin-offline-close',
      });
    }
  }, [isOffline, isRecycleOpen]);

  // Batch Card Purchase Modal State
  const [isBatchBuyCardModalOpen, setIsBatchBuyCardModalOpen] = useState(false);
  const [batchPayMethod, setBatchPayMethod] = useState<'Cash' | 'GCash'>(
    'Cash'
  );
  const [batchGcashRef, setBatchGcashRef] = useState('');
  const [isProcessingBatchPay, setIsProcessingBatchPay] = useState(false);

  // Direct Claim Handler with Optimistic UI Update (No skeleton flash)
  const handleDirectClaim = async (member: Member, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const prevCards = [...cards];

    setCards((currentCards) =>
      currentCards.map((card) =>
        card.member_id === member.member_id
          ? {
              ...card,
              claim_status: 'CLAIMED',
              claimed_at: new Date().toISOString(),
            }
          : card
      )
    );

    try {
      await cardService.markClaimed(member.member_id, 'Admin Staff');
      toast.success(`Physical card for ${member.full_name} marked as CLAIMED.`);
      fetchMembers(true);
    } catch (err: any) {
      setCards(prevCards);
      toast.error(err.message || 'Failed to mark card as claimed.');
    }
  };

  // Mobile Action Sheet State
  const [mobileActionSheetMember, setMobileActionSheetMember] =
    useState<Member | null>(null);

  // Card modal state
  const [manualModalMember, setManualModalMember] = useState<Member | null>(
    null
  );
  const [showBatchCardModal, setShowBatchCardModal] = useState<boolean>(false);

  // Action Menu state (Desktop Dropdown)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Mobile Pagination State
  const [mobilePage, setMobilePage] = useState(1);

  const itemsPerPage = useResponsiveItemsPerPage();

  // Replacement toggle (enabled by default when staff wants to charge for lost/damaged card)
  const [chargeReplacements, setChargeReplacements] = useState(true);

  // Unified click handler for Renew / Subscribe triggers across table & cards
  const handleTableRenewOrSubscribe = useCallback(
    (item: Member, hasSub: boolean, e: React.MouseEvent) => {
      e.stopPropagation();

      if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        toast.error(
          `Cannot ${hasSub ? 'renew' : 'subscribe'}: Internet connection is required. Subscriptions cannot be created or renewed while offline.`,
          { toastId: 'offline-subscribe-block' }
        );
        return;
      }

      if (item.status === 'Suspended') {
        toast.error(
          `Cannot ${hasSub ? 'renew' : 'subscribe'}: Member "${item.full_name}" is currently suspended. Activate member to proceed.`,
          { toastId: `suspended-${item.id}` }
        );
        return;
      }

      if (!isSessionOpen) {
        toast.warning(
          `Cannot ${hasSub ? 'renew' : 'subscribe'}: Cash drawer session is closed. Open a cash session in Cash Management first.`,
          { toastId: 'cash-session-closed-enroll-block' }
        );
        return;
      }

      setWizardPrefillMember(item);
      setIsWizardOpen(true);
    },
    [isSessionOpen, isOffline]
  );

  // Break down selected members into Unpaid (New) and Already Paid (Replacements)
  const batchMemberBreakdown = useMemo(() => {
    const selectedMembers = members.filter((m) =>
      selectedMemberIds.includes(m.id)
    );

    const newCardMembers: Member[] = [];
    const replacementMembers: Member[] = [];

    selectedMembers.forEach((m) => {
      const card = cards.find(
        (c) =>
          c.member_id === m.member_id &&
          c.status === 'Active' &&
          c.card_type !== 'None'
      );
      if (card && card.payment_status === 'PAID') {
        replacementMembers.push(m);
      } else {
        newCardMembers.push(m);
      }
    });

    const payableMembers = chargeReplacements
      ? [...newCardMembers, ...replacementMembers]
      : newCardMembers;

    const fee = settings.card_printing_fee || 50;
    const totalPrice = payableMembers.length * fee;

    return {
      newCardMembers,
      replacementMembers,
      payableMembers,
      totalPrice,
      fee,
    };
  }, [
    members,
    selectedMemberIds,
    cards,
    chargeReplacements,
    settings.card_printing_fee,
  ]);

  const fetchMembers = useCallback(async (silent = false) => {
    const cacheKey = 'members_sanitized_cache';

    if (!silent) {
      const cached =
        sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const memList = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.members)
              ? parsed.members
              : [];
          if (memList.length > 0) {
            setMembers(memList);
            if (Array.isArray(parsed?.subscriptions))
              setSubscriptions(parsed.subscriptions);
            if (Array.isArray(parsed?.cards)) setCards(parsed.cards);
            if (parsed?.settings) setSettings(parsed.settings);
            setLoading(false);
          }
        } catch {
          // ignore cache parse error
        }
      }
    }

    if (
      !silent &&
      !sessionStorage.getItem(cacheKey) &&
      !localStorage.getItem(cacheKey)
    ) {
      setLoading(true);
    }
    try {
      const [membersData, subsData, cardsData, settingsData] =
        await Promise.all([
          memberService.getAll(),
          subscriptionService.getAll(),
          cardService.getAll(),
          settingsService.load().catch(() => getSynchronousInitialSettings()),
        ]);

      const newPayload = {
        members: membersData,
        subscriptions: subsData,
        cards: cardsData,
        settings: settingsData || getSynchronousInitialSettings(),
      };

      const cachedRaw =
        sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
      if (cachedRaw !== JSON.stringify(newPayload)) {
        setMembers(membersData);
        setSubscriptions(subsData);
        setCards(cardsData);
        if (settingsData) setSettings(settingsData);
        const payloadStr = JSON.stringify(newPayload);
        sessionStorage.setItem(cacheKey, payloadStr);
        try {
          localStorage.setItem(cacheKey, payloadStr);
        } catch {
          // quota or private mode fallback
        }
      }
    } catch (err: any) {
      console.error('Error fetching members data:', err);
      // Attempt to load from persistent offline cache
      const offlineCached =
        localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (offlineCached) {
        try {
          const parsed = JSON.parse(offlineCached);
          const memList = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.members)
              ? parsed.members
              : [];
          if (memList.length > 0) {
            setMembers(memList);
            if (Array.isArray(parsed?.subscriptions))
              setSubscriptions(parsed.subscriptions);
            if (Array.isArray(parsed?.cards)) setCards(parsed.cards);
            if (parsed?.settings) setSettings(parsed.settings);
            toast.info(
              'Showing cached member directory while offline/unstable.',
              { toastId: 'members-offline-cache-loaded' }
            );
          }
        } catch {
          toast.error(err.message || 'Failed to load member records');
        }
      } else {
        toast.error(err.message || 'Failed to load member records');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Listen to navbar floating sub-menu toggle
  const activeFloating = useNavbarStore((s) => s.activeFloating);
  const isNavFloatingOpen = Boolean(activeFloating);
  const [hasAttemptedEmptyRefresh, setHasAttemptedEmptyRefresh] =
    useState(false);
  const [isRefreshingEmpty, setIsRefreshingEmpty] = useState(false);

  useEffect(() => {
    setHasAttemptedEmptyRefresh(false);
    if (!location.pathname.startsWith('/members/list')) {
      setSelectedMemberIds([]);
      setIsMultiSelect(false);
      setOpenActionMenuId(null);
      setMobileActionSheetMember(null);
    }
  }, [activeTab, location.pathname]);

  useEffect(() => {
    const cacheKey = 'members_sanitized_cache';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const purgeCache = () => {
      sessionStorage.removeItem(cacheKey);
      try {
        localStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
    };

    const invalidateAndRefresh = () => {
      if (isBatterySaver && document.hidden) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(
        () => {
          debounceTimer = null;
          purgeCache();
          fetchMembers(true);
        },
        isBatterySaver ? 10000 : 1500
      );
    };

    const channel = supabase
      .channel('realtime-members-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        invalidateAndRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        invalidateAndRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        (payload: any) => {
          if (payload.eventType === 'UPDATE' && payload.new?.deleted_at) {
            const deletedId = String(payload.new.id);
            setMembers((prev) => prev.filter((m) => String(m.id) !== deletedId));
            setSelectedMemberIds((prev) =>
              prev.filter((id) => String(id) !== deletedId)
            );
          } else if (payload.eventType === 'DELETE' && payload.old?.id) {
            const deletedId = String(payload.old.id);
            setMembers((prev) => prev.filter((m) => String(m.id) !== deletedId));
            setSelectedMemberIds((prev) =>
              prev.filter((id) => String(id) !== deletedId)
            );
          }
          invalidateAndRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        invalidateAndRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_cards' },
        invalidateAndRefresh
      )
      .subscribe();

    const handleRefresh = (e?: Event) => {
      const customEvent = e as CustomEvent<{ deletedId?: string }>;
      const deletedId = customEvent?.detail?.deletedId;

      purgeCache();

      if (deletedId) {
        setMembers((prev) =>
          prev.filter((m) => m.id !== deletedId && m.member_id !== deletedId)
        );
        setSelectedMemberIds((prev) =>
          prev.filter((id) => id !== deletedId)
        );
      }

      fetchMembers(true);
    };
    window.addEventListener('member-refresh', handleRefresh);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      window.removeEventListener('member-refresh', handleRefresh);
    };
  }, [fetchMembers, isBatterySaver]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, activeTab]);

  useEffect(() => {
    if (isPlansPath) {
      setActiveTab('Directory');
    }
  }, [isPlansPath]);

  // Launch Print Modal pre-selecting all "No Card Issued" members if no checkboxes selected
  const handleOpenPrintModal = useCallback(() => {
    if (selectedMemberIds.length === 0) {
      const unissuedIds = members
        .filter((m) => {
          const c = cards.find(
            (card: MemberCard) =>
              card.member_id === m.member_id && card.status === 'Active'
          );
          return !c || c.card_type === 'None';
        })
        .map((m) => m.id);
      setSelectedMemberIds(unissuedIds);
    }
    setShowBatchCardModal(true);
  }, [selectedMemberIds, members, cards]);

  // Custom Event Listeners for Header Actions Sync
  useEffect(() => {
   const handlePrintEvent = () => handleOpenPrintModal();
    const handleRecycleEvent = () => {
      if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        toast.error('Member\'s profile bin is unavailable while offline.', {
          toastId: 'recycle-bin-offline-event',
        });
        return;
      }
      setIsRecycleOpen(true);
    };
    const handleWizardEvent = () => {
      setWizardPrefillMember(undefined);
      setWizardPrefill(undefined);
      setIsWizardOpen(true);
    };
    const handleMigrationEvent = () => {
      if (!isSuper) {
        toast.error('Legacy Data Migration is restricted to SuperAdmin.');
        return;
      }
      if (isSessionOpen) {
        toast.warning(
          'Cannot perform legacy data migration: Cash drawer session is currently open. Please close the session in Cash Management first.',
          { toastId: 'migration-session-open-block' }
        );
        return;
      }
      setIsMigrationModalOpen(true);
    };

    window.addEventListener('trigger-member-print', handlePrintEvent);
    window.addEventListener('trigger-member-recycle', handleRecycleEvent);
    window.addEventListener('trigger-member-wizard', handleWizardEvent);
    window.addEventListener('trigger-member-migration', handleMigrationEvent);

    return () => {
      window.removeEventListener('trigger-member-print', handlePrintEvent);
      window.removeEventListener('trigger-member-recycle', handleRecycleEvent);
      window.removeEventListener('trigger-member-wizard', handleWizardEvent);
      window.removeEventListener('trigger-member-migration', handleMigrationEvent);
    };
  }, [handleOpenPrintModal, isOffline, isSuper]);

  // Keyboard Shortcut: Focus Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current
      ) {
        if (
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(
            document.activeElement?.tagName || ''
          )
        )
          return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset mobile page on query change
  useEffect(() => {
    setMobilePage(1);
  }, [searchQuery, activeChip]);

  // Handle Automatic Renew from Dashboard or external redirection
  useEffect(() => {
    if (loading || members.length === 0 || hasTriggeredRenewRef.current) return;

    const searchParams = new URLSearchParams(location.search);
    const renewMemberId =
      searchParams.get('renewMemberId') ||
      (location.state as any)?.renewMemberId;
    const memberName =
      searchParams.get('memberName') || (location.state as any)?.memberName;

    if (renewMemberId || memberName) {
      const targetMember = members.find(
        (m) =>
          (renewMemberId &&
            (m.member_id === renewMemberId || m.id === renewMemberId)) ||
          (memberName &&
            m.full_name?.toLowerCase().trim() ===
              memberName.toLowerCase().trim())
      );

      if (targetMember) {
        hasTriggeredRenewRef.current = true;
        setSearchQuery(targetMember.full_name || targetMember.member_id);

        if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          toast.error(
            `Cannot renew: Internet connection is required. Subscriptions cannot be created or renewed while offline.`
          );
          navigate('/members/list', { replace: true, state: {} });
          return;
        }

        if (targetMember.status === 'Suspended') {
          toast.error(
            `Cannot renew: ${targetMember.full_name} is suspended. Activate member first.`
          );
          navigate('/members/list', { replace: true, state: {} });
          return;
        }

        if (!isSessionOpen) {
          toast.warning(
            'Cannot renew subscription: Cash drawer session is closed. Open a cash session in Cash Management first.'
          );
          navigate('/members/list', { replace: true, state: {} });
          return;
        }

        const now = Date.now();
        const memberActiveSubs = subscriptions.filter((s) => {
          if (s.member_id !== targetMember.member_id || s.status === 'Voided')
            return false;
          if (!s.end_date) return false;
          const endMs = new Date(s.end_date).getTime();
          return endMs >= now;
        });

        if (memberActiveSubs.length > 1) {
          toast.warning(
            `Cannot auto-renew: ${targetMember.full_name} has ${memberActiveSubs.length} active subscriptions. Please manage contracts individually.`
          );
          navigate('/members/list', { replace: true, state: {} });
        } else {
          setWizardPrefillMember(targetMember);
          setIsWizardOpen(true);
          toast.info(`Opening renewal wizard for ${targetMember.full_name}`);
          navigate('/members/list', { replace: true, state: {} });
        }
      }
    }
  }, [
    loading,
    members,
    subscriptions,
    location.search,
    location.state,
    navigate,
    isSessionOpen,
    isOffline,
  ]);

  const getActiveSubscription = useCallback(
    (memberId: string): Subscription | undefined => {
      const now = Date.now();
      return subscriptions.find((s: Subscription) => {
        if (s.member_id !== memberId || s.status === 'Voided') return false;
        const startMs = new Date(s.start_date).getTime();
        const endMs = new Date(s.end_date).getTime();
        return startMs <= now && endMs >= now;
      });
    },
    [subscriptions]
  );

  const getQueuedSubscription = useCallback(
    (memberId: string): Subscription | undefined => {
      const now = Date.now();
      return subscriptions.find((s: Subscription) => {
        if (s.member_id !== memberId || s.status === 'Voided') return false;
        const startMs = new Date(s.start_date).getTime();
        return startMs > now;
      });
    },
    [subscriptions]
  );

  const getLatestSubscriptionRecord = useCallback(
    (memberId: string): Subscription | undefined => {
      const memberSubs = subscriptions
        .filter(
          (s: Subscription) => s.member_id === memberId && s.status !== 'Voided'
        )
        .sort(
          (a, b) =>
            new Date(b.created_at || b.start_date).getTime() -
            new Date(a.created_at || a.start_date).getTime()
        );

      return memberSubs[0];
    },
    [subscriptions]
  );

  const getActiveCard = useCallback(
    (memberId: string): MemberCard | undefined => {
      return cards.find(
        (c: MemberCard) => c.member_id === memberId && c.status === 'Active'
      );
    },
    [cards]
  );

  const getSubscriptionDetails = useCallback(
    (memberId: string) => {
      const activeSub = getActiveSubscription(memberId);
      const queuedSub = getQueuedSubscription(memberId);
      const latestSub = getLatestSubscriptionRecord(memberId);

      if (!activeSub && !latestSub) {
        return {
          hasSub: false,
          canRenew: true,
          planName: 'Profile Only',
          statusLabel: 'No Subscription',
          badgeStyle:
            'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',
          dotColor: 'bg-slate-400',
          subscribedAt: null,
          queuedPlan: null,
        };
      }

      const targetSub = activeSub || latestSub!;
      const endMs = new Date(targetSub.end_date).getTime();
      const now = Date.now();
      const isPast = !isNaN(endMs) && endMs < now;

      if (isPast) {
        const daysExpired = Math.floor((now - endMs) / (1000 * 60 * 60 * 24));

        if (daysExpired > 7) {
          return {
            hasSub: false,
            canRenew: true,
            planName: 'Profile Only',
            statusLabel: 'No Subscription',
            badgeStyle:
              'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',
            dotColor: 'bg-slate-400',
            subscribedAt: null,
            queuedPlan: null,
          };
        }

        return {
          hasSub: false,
          canRenew: true,
          planName:
            targetSub.plan_name ||
            (targetSub.plan_type === 'yearly'
              ? 'Yearly Membership'
              : 'Monthly Membership'),
          statusLabel: 'Expired',
          badgeStyle:
            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 font-extrabold',
          dotColor: 'bg-rose-500',
          subscribedAt: targetSub.start_date
            ? new Date(targetSub.start_date).toLocaleDateString()
            : null,
          queuedPlan: null,
        };
      }

      const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));

      let badgeStyle =
        'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 font-bold';
      let statusLabel = `${diffDays} Days remaining`;
      let dotColor = 'bg-emerald-500';

      if (diffDays <= 3) {
        badgeStyle =
          'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 font-extrabold';
        statusLabel = `${diffDays} Days Left (Renew)`;
        dotColor = 'bg-amber-500';
      } else if (diffDays <= 7) {
        badgeStyle =
          'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 font-bold';
        statusLabel = `${diffDays} Days Left`;
        dotColor = 'bg-amber-500';
      }

      const subDate = new Date(targetSub.created_at || targetSub.start_date);
      const dateFormatted = !isNaN(subDate.getTime())
        ? `${subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : null;

      return {
        hasSub: true,
        canRenew: diffDays <= 30 && !queuedSub,
        planName:
          targetSub.plan_name ||
          (targetSub.plan_type === 'yearly'
            ? 'Yearly Membership'
            : 'Monthly Membership'),
        statusLabel,
        badgeStyle,
        dotColor,
        subscribedAt: dateFormatted,
        queuedPlan: queuedSub
          ? queuedSub.plan_name ||
            (queuedSub.plan_type === 'yearly'
              ? 'Yearly Membership'
              : 'Monthly Membership')
          : null,
      };
    },
    [getActiveSubscription, getQueuedSubscription, getLatestSubscriptionRecord]
  );

  const stats = useMemo(() => {
    const now = Date.now();
    let activeSubsCount = 0;
    let expiringSoonCount = 0;

    subscriptions.forEach((s: Subscription) => {
      if (s.status !== 'Voided') {
        const startMs = new Date(s.start_date).getTime();
        const endMs = new Date(s.end_date).getTime();
        if (startMs <= now && endMs >= now) {
          activeSubsCount++;
          const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            expiringSoonCount++;
          }
        }
      }
    });

    return {
      total: members.length,
      activeSubscriptions: activeSubsCount,
      expiringSoon: expiringSoonCount,
      suspendedMembers: members.filter((m) => m.status === 'Suspended').length,
    };
  }, [members, subscriptions]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('members-kpi-update', {
        detail: stats,
      })
    );
  }, [stats]);

const chipCounts = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let allCount = members.length;
    let recentSubCount = 0;
    let withSubCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let noSubCount = 0;
    let hasCardCount = 0;
    let unclaimedCardCount = 0;
    let noCardCount = 0;
    let minorCount = 0;
    let suspendedCount = 0;

    members.forEach((m) => {
      if (m.status === 'Suspended') suspendedCount++;
      if (isMemberMinor(m.birthday)) minorCount++;

      const sub = getActiveSubscription(m.member_id);
      if (sub) {
        withSubCount++;
        const diffDays = Math.ceil(
          (new Date(sub.end_date).getTime() - now) / (1000 * 60 * 60 * 24)
        );
        if (diffDays >= 0 && diffDays <= 7) expiringCount++;
      } else {
        const latestSub = getLatestSubscriptionRecord(m.member_id);
        if (latestSub) {
          const endMs = new Date(latestSub.end_date).getTime();
          if (!isNaN(endMs) && endMs < now) {
            const daysExpired = Math.floor(
              (now - endMs) / (1000 * 60 * 60 * 24)
            );
            if (daysExpired <= 7) expiredCount++;
            else noSubCount++;
          } else {
            noSubCount++;
          }
        } else {
          noSubCount++;
        }
      }

      const isRecent = subscriptions.some((s) => {
        if (s.member_id !== m.member_id || s.status === 'Voided') return false;
        const subTime = new Date(s.created_at || s.start_date).getTime();
        return !isNaN(subTime) && subTime >= sevenDaysAgo;
      });
      if (isRecent) recentSubCount++;

      const card = getActiveCard(m.member_id);
      if (card && card.card_type !== 'None') {
        hasCardCount++;
        if (
          card.payment_status === 'PAID' &&
          card.claim_status === 'UNCLAIMED'
        ) {
          unclaimedCardCount++;
        }
      } else {
        noCardCount++;
      }
    });

    return {
      all: allCount,
      recent_sub: recentSubCount,
      with_sub: withSubCount,
      expiring: expiringCount,
      expired: expiredCount,
      no_sub: noSubCount,
      unclaimed_card: unclaimedCardCount,
      has_card: hasCardCount,
      no_card: noCardCount,
      minor: minorCount,
      suspended: suspendedCount,
    };
  }, [
    members,
    subscriptions,
    getActiveSubscription,
    getLatestSubscriptionRecord,
    getActiveCard,
  ]);

  const filteredMembers = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    const now = Date.now();

    const matched = members.filter((m: Member) => {
      const fullName = (m.full_name || '').toLowerCase();
      const memberId = (m.member_id || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const email = (m.email || '').toLowerCase();

      const matchesSearch =
        q === '' ||
        fullName.includes(q) ||
        memberId.includes(q) ||
        phone.includes(q) ||
        email.includes(q);

      if (!matchesSearch) return false;

      switch (activeChip) {
        case 'recent_sub': {
          const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
          return subscriptions.some((s) => {
            if (s.member_id !== m.member_id || s.status === 'Voided')
              return false;
            const subTime = new Date(s.created_at || s.start_date).getTime();
            return !isNaN(subTime) && subTime >= sevenDaysAgo;
          });
        }
        case 'with_sub':
          return !!getActiveSubscription(m.member_id);
        case 'expiring': {
          const sub = getActiveSubscription(m.member_id);
          if (!sub) return false;
          const diffDays = Math.ceil(
            (new Date(sub.end_date).getTime() - now) / (1000 * 60 * 60 * 24)
          );
          return diffDays >= 0 && diffDays <= 7;
        }
        case 'expired': {
          const activeSub = getActiveSubscription(m.member_id);
          if (activeSub) return false;
          const latestSub = getLatestSubscriptionRecord(m.member_id);
          if (!latestSub) return false;
          const endMs = new Date(latestSub.end_date).getTime();
          if (isNaN(endMs) || endMs >= now) return false;
          const daysExpired = Math.floor((now - endMs) / (1000 * 60 * 60 * 24));
          return daysExpired <= 7;
        }
        case 'no_sub':
          return !getActiveSubscription(m.member_id);
        case 'unclaimed_card': {
          const card = getActiveCard(m.member_id);
          return (
            card &&
            card.card_type !== 'None' &&
            card.claim_status === 'UNCLAIMED'
          );
        }
        case 'has_card': {
          const card = getActiveCard(m.member_id);
          return card && card.card_type !== 'None';
        }
        case 'no_card': {
          const card = getActiveCard(m.member_id);
          return !card || card.card_type === 'None';
        }
        case 'minor':
          return isMemberMinor(m.birthday);
        case 'suspended':
          return m.status === 'Suspended';
        case 'all':
        default:
          return true;
      }
    });

    return matched.sort((a, b) => {
      if (activeChip === 'recent_sub') {
        const getLatestTime = (mId: string) => {
          const sub = subscriptions.find(
            (s) => s.member_id === mId && s.status !== 'Voided'
          );
          return sub ? new Date(sub.created_at || sub.start_date).getTime() : 0;
        };
        return getLatestTime(b.member_id) - getLatestTime(a.member_id);
      }

      const activeA = getActiveSubscription(a.member_id);
      const activeB = getActiveSubscription(b.member_id);

      const hasActiveA = activeA ? 1 : 0;
      const hasActiveB = activeB ? 1 : 0;

      if (hasActiveA !== hasActiveB) {
        return hasActiveA - hasActiveB;
      }

      if (!activeA && !activeB) {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      }

      const endA = new Date(activeA!.end_date).getTime();
      const endB = new Date(activeB!.end_date).getTime();

      const daysA = Math.ceil((endA - now) / (1000 * 60 * 60 * 24));
      const daysB = Math.ceil((endB - now) / (1000 * 60 * 60 * 24));

      return daysA - daysB;
    });
  }, [
    members,
    deferredSearchQuery,
    activeChip,
    getActiveSubscription,
    getLatestSubscriptionRecord,
    getActiveCard,
  ]);

  const isAllSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((m) => selectedMemberIds.includes(m.id));
  const isSomeSelected = selectedMemberIds.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(filteredMembers.map((m) => m.id));
    }
  };

  const totalMobilePages =
    Math.ceil(filteredMembers.length / itemsPerPage) || 1;
  const paginatedMobileMembers = useMemo(() => {
    const start = (mobilePage - 1) * itemsPerPage;
    return filteredMembers.slice(start, start + itemsPerPage);
  }, [filteredMembers, mobilePage, itemsPerPage]);

  const handleToggleSuspend = async (memberItem: Member) => {
    const nextStatus = memberItem.status === 'Active' ? 'Suspended' : 'Active';
    const prevMembers = [...members];

    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberItem.id ? { ...m, status: nextStatus } : m
      )
    );

    try {
      await memberService.update(
        memberItem.id,
        { status: nextStatus },
        'Admin Staff'
      );
      toast.success(`Member set to ${nextStatus}.`);
      fetchMembers(true);
    } catch (err: any) {
      setMembers(prevMembers);
      toast.error(err.message || 'Action failed.');
    }
  };
  const isSelectionActive = selectedMemberIds.length > 0;

  const handleRowClick = (member: Member) => {
    if (!isMultiSelect) {
      const isCurrentlySelected = selectedMemberIds.includes(member.id);
      const next = isCurrentlySelected ? [] : [member.id];
      setSelectedMemberIds(next);

      if (!isCurrentlySelected) {
        // Center auto-scroll focus on PC desktop table
        setTimeout(() => {
          const rowEl = document.querySelector(`.member-row-${member.id}`);
          if (rowEl) {
            rowEl.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
        }, 80);
      }
    } else {
      setSelectedMemberIds((prev) => {
        const next = prev.includes(member.id)
          ? prev.filter((id) => id !== member.id)
          : [...prev, member.id];
        if (next.length === 0) {
          setIsMultiSelect(false);
        }
        return next;
      });
    }
  };

  const getRowStyle = (member: Member) => {
    const isSelected = selectedMemberIds.includes(member.id);
    const isSuspended = member.status === 'Suspended';
    const rowClass = `member-row-${member.id}`;

    if (isSelected) {
      return `${rowClass} group !bg-blue-500/10 hover:!bg-blue-500/15 border-l-2 border-blue-500 transition-colors duration-150 cursor-pointer`;
    }
    if (isSuspended) {
      return `${rowClass} group bg-amber-500/10 dark:bg-amber-500/15 hover:!bg-amber-500/20 border-l-2 border-amber-500 text-amber-950 dark:text-amber-200 transition-colors duration-150 cursor-pointer`;
    }
    return `${rowClass} group hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 transition-colors duration-150 cursor-pointer`;
  };

  const columns: Column<Member>[] = [
    ...(isSelectionActive && isMultiSelect
      ? [
          {
            key: 'select',
            header: (
              <div className="flex items-center justify-center h-full w-full py-0.5">
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
                  title="Toggle Select All"
                />
              </div>
            ),
            headerClassName: 'w-10 text-center',
            cellClassName: 'text-center p-0',
            render: (item: Member) => (
              <label
                className="flex items-center justify-center w-full h-10 py-1 cursor-pointer transition-colors hover:bg-slate-500/5 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedMemberIds.includes(item.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedMemberIds((prev) => [...prev, item.id]);
                    } else {
                      setSelectedMemberIds((prev) => {
                        const next = prev.filter((id) => id !== item.id);
                        if (next.length === 0) setIsMultiSelect(false);
                        return next;
                      });
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-110"
                />
              </label>
            ),
          } as Column<Member>,
        ]
      : []),
    {
      key: 'full_name',
      header: 'Member / ID',
      sortable: true,
      render: (item) => {
        const age = getMemberAge(item.birthday);
        const isMinor = age !== null && age >= 12 && age <= 17;

        return (
          <div className="flex items-center gap-2.5 py-0.5 text-left">
            <MemberAvatar
              src={item.image_url || item.avatar_url}
              name={item.full_name}
              size={38}
              roundedClassName="rounded-xl"
              className="shadow-xs border border-black/10 dark:border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 truncate leading-tight uppercase">
                  {item.full_name}
                </span>
                {isMinor && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                    Minor ({age} yrs)
                  </span>
                )}
                {item.status === 'Suspended' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    SUSPENDED
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-medium block mt-0.5 leading-none truncate uppercase">
                {item.member_id} • {item.phone}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'subscription',
      header: 'Subscription Plan',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      sortable: true,
      sortValue: (item) => {
        const sub = getActiveSubscription(item.member_id);
        if (!sub) return -1;
        const endMs = new Date(sub.end_date).getTime();
        return Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24));
      },
      render: (item) => {
        const subInfo = getSubscriptionDetails(item.member_id);

        return (
          <div className="flex flex-col items-center justify-center text-center leading-tight space-y-0.5 py-0.5">
            <span className="font-extrabold text-xs block text-slate-900 dark:text-zinc-100 truncate">
              {subInfo.planName}
            </span>

            <div className="flex flex-wrap items-center justify-center gap-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-extrabold uppercase border ${subInfo.badgeStyle}`}
              >
                {subInfo.statusLabel}
              </span>
              {subInfo.queuedPlan && (
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                  title="Queued renewal after current plan expires"
                >
                  Queued: {subInfo.queuedPlan}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'card_printed',
      header: 'Card Status',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      sortable: true,
      sortValue: (item) => {
        const cardObj = getActiveCard(item.member_id);
        if (!cardObj || cardObj.card_type === 'None') return '1_NO_CARD';
        if (
          cardObj.payment_status === 'PAID' &&
          cardObj.claim_status === 'UNCLAIMED'
        )
          return '2_PAID_UNCLAIMED';
        if (
          cardObj.payment_status === 'PAID' &&
          cardObj.claim_status === 'CLAIMED'
        )
          return '3_PAID_CLAIMED';
        return '4_NO_CARD';
      },
      render: (item) => {
        const cardObj = getActiveCard(item.member_id);
        const isQr = cardObj?.card_type === 'QR';

        return (
          <div className="flex items-center justify-center">
            {(!cardObj ||
              cardObj.card_type === 'None' ||
              cardObj.payment_status !== 'PAID') && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span>NO CARD</span>
              </span>
            )}

            {cardObj &&
              cardObj.payment_status === 'PAID' &&
              cardObj.claim_status === 'UNCLAIMED' && (
                <div
                  className="flex items-center justify-center gap-1.5 flex-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      isQr ? setSelectedProfileMember(item) : setManualModalMember(item)
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 hover:opacity-85 cursor-pointer transition-opacity"
                    title="Physical card fee is paid but card is not yet claimed by member. Click to view."
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>PAID • UNCLAIMED</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDirectClaim(item, e)}
                    className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-heading font-bold uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-1 transition-transform active:scale-95"
                    title="Mark this physical card as claimed by member"
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span>Claim</span>
                  </button>
                </div>
              )}

            {cardObj &&
              cardObj.payment_status === 'PAID' &&
              cardObj.claim_status === 'CLAIMED' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isQr) {
                      setSelectedProfileMember(item);
                    } else {
                      setManualModalMember(item);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 cursor-pointer hover:opacity-85 transition-opacity"
                  title="Physical card fee is paid and claimed by member. Click to view or print."
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>PAID • CLAIMED</span>
                </button>
              )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[200px]',
      render: (item) => {
        const subInfo = getSubscriptionDetails(item.member_id);
        const isMenuOpen = openActionMenuId === item.id;
        const isSuspended = item.status === 'Suspended';
        const isActionDisabled = !isSessionOpen || isSuspended || isOffline;

        return (
          <div
            className={`transition-opacity duration-150 flex items-center justify-end gap-1.5 select-none relative ${
              isMenuOpen
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {subInfo.canRenew && (
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={(e) =>
                  handleTableRenewOrSubscribe(item, subInfo.hasSub, e)
                }
                title={
                  isOffline
                    ? 'Subscriptions locked: Internet connection required.'
                    : isSuspended
                      ? 'Member account is suspended. Activate member first.'
                      : !isSessionOpen
                        ? 'Cash drawer session is closed. Open a cash session in Cash Management.'
                        : subInfo.hasSub
                          ? 'Renew Subscription'
                          : 'Subscribe Plan'
                }
                className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 text-[10px] font-heading tracking-wider uppercase font-extrabold transition-all shadow-xs ${
                  isActionDisabled
                    ? 'bg-slate-400 dark:bg-zinc-700 text-white/70 opacity-60 cursor-not-allowed border border-transparent'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 cursor-pointer'
                }`}
              >
                {isActionDisabled ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <CreditCard className="w-3 h-3" />
                )}
                <span>
                  {isOffline
                    ? 'Locked'
                    : subInfo.hasSub
                      ? 'Renew'
                      : 'Subscribe'}
                </span>
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProfileMember(item);
              }}
              className="px-2.5 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white rounded-lg cursor-pointer border border-blue-500/30 inline-flex items-center gap-1 text-[10px] font-heading tracking-wider uppercase font-extrabold transition-colors shadow-xs"
              title="See profile details"
            >
              <Eye className="w-3 h-3" /> Profile
            </button>

            {/* FULL DESKTOP 3-DOT DROPDOWN MENU */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActionMenuId(
                    openActionMenuId === item.id ? null : item.id
                  );
                }}
                className="p-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-(--color-text) cursor-pointer transition-colors shadow-xs"
                title="More Options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {openActionMenuId === item.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1.5 w-48 bg-(--bg-card) border border-(--border-color) rounded-2xl shadow-xl z-30 p-1.5 space-y-1 font-body text-xs text-left animate-fade-in"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setSelectedProfileMember(item);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2.5 text-xs font-bold text-(--color-text) cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-blue-500" />
                    <span>View Workspace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setSelectedMemberIds([item.id]);
                      setShowBatchCardModal(true);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2.5 text-xs font-bold text-(--color-text) cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-blue-500" />
                    <span>Print Member Card</span>
                  </button>

                  <div className="border-t border-(--border-color) my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      handleToggleSuspend(item);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
                  >
                    {item.status === 'Active' ? (
                      <UserX className="w-4 h-4" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    <span>
                      {item.status === 'Active'
                        ? 'Suspend Member'
                        : 'Activate Member'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      },
    },
  ];

  // Header Actions Sync
  useEffect(() => {
    if (hideHeaderActions || isPlansPath) {
      return;
    }

    setActions(
      <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
        {activeTab === 'Directory' && (
          <>
            <Button
              onClick={handleOpenPrintModal}
              variant="secondary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 cursor-pointer font-bold animate-fade-in whitespace-nowrap"
              title="Open full member credential card print workspace"
            >
              <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-red-500 shrink-0" />
              <span>PRINT MEMBER CARDS</span>
            </Button>

            <Button
              disabled={isOffline}
              onClick={() => {
                if (isOffline) {
                  toast.error('Recycle Bin is unavailable while offline.', {
                    toastId: 'recycle-bin-offline',
                  });
                  return;
                }
                setIsRecycleOpen(true);
              }}
              variant="secondary"
              title={
                isOffline
                  ? 'Recycle Bin is unavailable while offline'
                  : 'Open Recycle Bin'
              }
              className={`py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 font-bold animate-fade-in whitespace-nowrap ${
                isOffline
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-500 shrink-0" />
              <span>RECYCLE BIN</span>
            </Button>

            {isSuper && (
              <Button
                onClick={() => {
                  if (isSessionOpen) {
                    toast.warning(
                      'Cannot perform legacy data migration: Cash drawer session is open. Please close the session in Cash Management first.',
                      { toastId: 'migration-session-open-block' }
                    );
                    return;
                  }
                  setIsMigrationModalOpen(true);
                }}
                variant="secondary"
                className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 font-bold animate-fade-in whitespace-nowrap border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                title={
                  isSessionOpen
                    ? 'Legacy Data Migration is locked while cash drawer session is open'
                    : 'SuperAdmin Legacy Data Migration'
                }
              >
                <Database className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-500 shrink-0" />
                <span>DATA MIGRATION</span>
              </Button>
            )}

            <Button
              onClick={() => {
                setWizardPrefillMember(undefined);
                setWizardPrefill(undefined);
                setIsWizardOpen(true);
              }}
              variant="primary"
              className="py-1.5 px-2.5 lg:py-2 lg:px-3.5 !w-auto text-[11px] lg:text-xs flex items-center gap-1 lg:gap-1.5 shadow-md animate-fade-in whitespace-nowrap cursor-pointer"
              title="Enroll New Member"
            >
              <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
              <span>ENROLL MEMBER</span>
            </Button>
          </>
        )}
      </div>
    );

    return () => {
      if (!hideHeaderActions && !isPlansPath) {
        setActions(null);
      }
    };
  }, [
    activeTab,
    setActions,
    hideHeaderActions,
    isPlansPath,
    members,
    handleOpenPrintModal,
    isOffline,
  ]);

  useEffect(() => {
    const handleClickOutside = () => setOpenActionMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Auto-open expiring member from notification redirection
  useEffect(() => {
    if (location.state?.openMemberId && members.length > 0) {
      const targetMember = members.find(
        (m) =>
          m.member_id === location.state.openMemberId ||
          m.id === location.state.openMemberId
      );
      if (targetMember) {
        setActiveChip('expiring');
        setSelectedProfileMember(targetMember);
        setSearchQuery(targetMember.full_name);
        toast.info(`Viewing expiring member: "${targetMember.full_name}"`, {
          toastId: `expiring-${targetMember.id}`,
        });
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, members]);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in text-xs md:text-sm text-(--color-text)">
      {isPlansPath ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-(--border-color) pb-4 select-none">
            <Settings className="w-5 h-5 text-(--color-primary-light)" />
            <h2 className="font-heading text-base tracking-wider uppercase text-slate-800 dark:text-white">
              Active Counter Plan Catalog
            </h2>
          </div>
          <StaffPlansConsole />
        </div>
      ) : (
        <>
          {/* Top Closed Session Banner */}
          {!isSessionOpen && (
            <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold uppercase select-none shadow-xs">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0 text-yellow-500" />
                <span>
                  Cash drawer session is closed. Subscription renewals and card
                  purchases are locked.
                </span>
              </div>
              <span className="text-[10px] font-mono opacity-80 lowercase font-normal hidden sm:inline">
                open session in cash management to proceed
              </span>
            </div>
          )}

          {/* TOP SWITCH TABS */}
          <div className="flex border-b border-(--border-color) bg-(--bg-card) p-1 rounded-t-3xl select-none">
            {[
              { id: 'Directory', icon: Users, label: 'Members List' },
              {
                id: 'Queue',
                icon: CreditCard,
                label: 'Online Registration',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`flex-1 py-3 px-4 font-heading text-xs md:text-sm tracking-wider uppercase font-extrabold cursor-pointer flex items-center justify-center gap-2 transition-all ${
                    activeTab === item.id
                      ? 'border-b-2 border-(--color-primary) text-slate-900 dark:text-white'
                      : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 md:w-4.5 md:h-4.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 md:mt-4 space-y-3 md:space-y-4">
            {activeTab === 'Directory' && (
              <div
                className={`space-y-3 md:space-y-4 ${
                  isSelectionActive ? 'pb-24 md:pb-16 lg:pb-16' : 'pb-1'
                }`}
              >
                {/* SEARCH & REWORKED RESPONSIVE CATEGORY TOOLBAR */}
                <div className="space-y-2.5 bg-(--bg-card) p-3 md:p-3.5 rounded-2xl border border-(--border-color) shadow-xs">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Category Selector Dropdown */}
                    <div className="relative shrink-0 sm:w-60">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Filter className="w-3.5 h-3.5" />
                      </div>
                      <select
                        value={activeChip}
                        onChange={(e) =>
                          setActiveChip(e.target.value as FilterChip)
                        }
                        className="w-full pl-9 pr-8 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs font-heading font-extrabold uppercase tracking-wider text-(--color-text) outline-none cursor-pointer focus:border-blue-500 transition-all appearance-none"
                      >
                        <option value="all">All Members ({chipCounts.all})</option>
                        <optgroup label="── Subscriptions ──">
                          <option value="recent_sub">
                            Recently Subscribed ({chipCounts.recent_sub})
                          </option>
                          <option value="with_sub">
                            Active Subscriptions ({chipCounts.with_sub})
                          </option>
                          <option value="expiring">
                            Expiring (≤ 7d) ({chipCounts.expiring})
                          </option>
                          <option value="expired">
                            Expired (≤ 7d) ({chipCounts.expired})
                          </option>
                          <option value="no_sub">
                            No Subscription ({chipCounts.no_sub})
                          </option>
                        </optgroup>
                        <optgroup label="── Member Cards ──">
                          <option value="unclaimed_card">
                            Unclaimed Cards ({chipCounts.unclaimed_card})
                          </option>
                          <option value="has_card">
                            Has Card ({chipCounts.has_card})
                          </option>
                          <option value="no_card">
                            No Card ({chipCounts.no_card})
                          </option>
                        </optgroup>
                        <optgroup label="── Demographics & Status ──">
                          <option value="minor">
                            Minors (12–17 yrs) ({chipCounts.minor})
                          </option>
                          <option value="suspended">
                            Suspended ({chipCounts.suspended})
                          </option>
                        </optgroup>
                      </select>
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search profiles by Name, ID, Phone, or Email..."
                        className="w-full pl-10 pr-10 py-2 border border-(--border-color) bg-(--bg-page) rounded-xl outline-none font-bold text-xs md:text-sm text-(--color-text) focus:border-blue-500 transition-all"
                      />

                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-(--color-text) cursor-pointer"
                          title="Clear search query"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* High-Frequency Quick Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5 select-none pt-0.5">
                    {[
                      { id: 'all', label: 'All', count: chipCounts.all },
                      {
                        id: 'recent_sub',
                        label: 'Recent Sub',
                        count: chipCounts.recent_sub,
                      },
                      {
                        id: 'with_sub',
                        label: 'Active Sub',
                        count: chipCounts.with_sub,
                      },
                      {
                        id: 'expiring',
                        label: 'Expiring',
                        count: chipCounts.expiring,
                      },
                      {
                        id: 'unclaimed_card',
                        label: 'Unclaimed Cards',
                        count: chipCounts.unclaimed_card,
                      },
                      {
                        id: 'minor',
                        label: 'Minors (12–17)',
                        count: chipCounts.minor,
                      },
                    ].map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setActiveChip(chip.id as FilterChip)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-heading font-extrabold uppercase tracking-wider cursor-pointer border transition-all flex items-center gap-1.5 shrink-0 ${
                          activeChip === chip.id
                            ? 'bg-(--color-primary) text-white border-transparent shadow-xs'
                            : 'bg-(--bg-page) border-(--border-color) text-slate-500 hover:text-(--color-text)'
                        }`}
                      >
                        <span>{chip.label}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                            activeChip === chip.id
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {chip.count}
                        </span>
                      </button>
                    ))}

                    {/* Secondary active category pill if selected via dropdown */}
                    {![
                      'all',
                      'recent_sub',
                      'with_sub',
                      'expiring',
                      'unclaimed_card',
                      'minor',
                    ].includes(activeChip) && (
                      <button
                        type="button"
                        onClick={() => setActiveChip('all')}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-heading font-extrabold uppercase tracking-wider cursor-pointer border transition-all flex items-center gap-1.5 shrink-0 bg-(--color-primary) text-white border-transparent shadow-xs"
                      >
                        <span>
                          {activeChip === 'expired'
                            ? 'Expired'
                            : activeChip === 'no_sub'
                              ? 'No Subscription'
                              : activeChip === 'has_card'
                                ? 'Has Card'
                                : activeChip === 'no_card'
                                  ? 'No Card'
                                  : activeChip === 'suspended'
                                    ? 'Suspended'
                                    : activeChip}
                        </span>
                        <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold bg-white/20 text-white">
                          {chipCounts[activeChip as keyof typeof chipCounts] ??
                            0}
                        </span>
                        <X className="w-3 h-3 ml-0.5 opacity-80 hover:opacity-100" />
                      </button>
                    )}
                  </div>
                </div>

                {/* SELECTION CONTROL TOOLBAR (VISIBLE ON BOTH PC & MOBILE DURING SELECT MODE) */}
                {isSelectionActive && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-blue-500/10 dark:bg-blue-600/15 border-2 border-blue-500/30 rounded-2xl animate-fade-in shadow-xs select-none">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                        {selectedMemberIds.length}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-heading font-black uppercase tracking-wider text-(--color-text)">
                          {isMultiSelect ? 'Multi-Select Mode' : 'Single-Select Mode'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {isMultiSelect
                            ? 'Click members or use checkboxes to select multiple items'
                            : 'Click any member to switch focus. Enable Multi-Select to select more'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Multi-Select Toggle Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMultiSelect((prev) => {
                            const next = !prev;
                            if (!next && selectedMemberIds.length > 1) {
                              setSelectedMemberIds([selectedMemberIds[0]]);
                            }
                            return next;
                          });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border active:scale-95 ${
                          isMultiSelect
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/40'
                            : 'bg-(--bg-card) text-slate-700 dark:text-slate-200 border-(--border-color) hover:border-blue-500'
                        }`}
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span>Multi-Select</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                            isMultiSelect
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {isMultiSelect ? 'ON' : 'OFF'}
                        </span>
                      </button>

                      {/* Select All Button (Only available when Multi-Select is ON) */}
                      {isMultiSelect && (
                        <button
                          type="button"
                          onClick={handleToggleSelectAll}
                          className="px-3 py-1.5 rounded-xl text-xs font-heading font-bold uppercase tracking-wider bg-(--bg-card) hover:bg-slate-200 dark:hover:bg-zinc-800 border border-(--border-color) text-(--color-text) transition-colors cursor-pointer active:scale-95"
                        >
                          {isAllSelected ? 'Unselect All' : `Select All (${filteredMembers.length})`}
                        </button>
                      )}

                      {/* Deselect All / Clear Selection */}
                      <button
                        type="button"
                        onClick={resetActionState}
                        className="text-xs font-heading font-bold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 uppercase tracking-wider px-3 py-1.5 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer active:scale-95"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* DESKTOP TABLE VIEW (HIGH DENSITY COMPACT ROWS) */}
                <div className="hidden md:block p-1 bg-(--bg-card) border border-(--border-color) rounded-2xl overflow-hidden shadow-xs">
                  {loading ? (
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-(--border-color) px-3">
                        <Skeleton height={14} width={120} />
                        <Skeleton height={14} width={140} />
                        <Skeleton height={14} width={110} />
                        <Skeleton height={28} width={70} />
                      </div>
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-2 px-3 border-b border-(--border-color)/40 last:border-none"
                        >
                          <div className="flex items-center gap-2.5 w-1/3">
                            <Skeleton
                              circle
                              width={38}
                              height={38}
                              className="shrink-0"
                            />
                            <div className="space-y-1 flex-1">
                              <Skeleton height={14} width="70%" />
                              <Skeleton height={10} width="50%" />
                            </div>
                          </div>
                          <div className="w-1/3 space-y-1">
                            <Skeleton height={14} width="65%" />
                            <Skeleton height={16} width={90} borderRadius={6} />
                          </div>
                          <div className="w-1/5">
                            <Skeleton
                              height={24}
                              width={105}
                              borderRadius={8}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <Skeleton height={28} width={65} borderRadius={8} />
                            <Skeleton height={28} width={60} borderRadius={8} />
                            <Skeleton height={28} width={28} borderRadius={8} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-10 text-center space-y-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search className="w-5 h-5" />
                      </div>
                      <h4 className="font-heading font-bold text-sm text-(--color-text)">
                        No members match query
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {searchQuery || activeChip !== 'all'
                          ? 'Try modifying your search keywords or reset chip filters.'
                          : 'No member records enrolled in system databases yet.'}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {(searchQuery || activeChip !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setActiveChip('all');
                            }}
                            className="px-3.5 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-blue-500/20"
                          >
                            Clear Filters
                          </button>
                        )}
                        {!hasAttemptedEmptyRefresh && (
                          <button
                            type="button"
                            disabled={isRefreshingEmpty}
                            onClick={async () => {
                              setIsRefreshingEmpty(true);
                              try {
                                sessionStorage.removeItem(
                                  'members_sanitized_cache'
                                );
                                await fetchMembers(false);
                              } finally {
                                setHasAttemptedEmptyRefresh(true);
                                setIsRefreshingEmpty(false);
                              }
                            }}
                            className="px-4 py-1.5 bg-(--bg-input) hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-(--color-text) rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-(--border-color) transition-all inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isRefreshingEmpty ? 'animate-spin' : ''}`}
                            />
                            <span>
                              {isRefreshingEmpty ? 'Refreshing...' : 'Refresh'}
                            </span>
                          </button>
                        )}
                        {isSuper && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSessionOpen) {
                                toast.warning(
                                  'Cannot perform legacy data migration: Cash drawer session is open. Please close the session in Cash Management first.',
                                  { toastId: 'migration-session-open-block' }
                                );
                                return;
                              }
                              setIsMigrationModalOpen(true);
                            }}
                            className="px-4 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-amber-500/30 transition-all inline-flex items-center gap-1.5 shadow-2xs"
                          >
                            <Database className="w-3.5 h-3.5 text-amber-500" />
                            <span>Legacy Data Migration</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Table<Member>
                      data={filteredMembers}
                      columns={columns}
                      itemsPerPage={itemsPerPage}
                      loading={false}
                      getRowClassName={getRowStyle}
                      onRowClick={handleRowClick}
                    />
                  )}

                  {/* QUICK ACTION: ENROLL NEW MEMBER BUTTON (DESKTOP & TABLET) */}
                  <motion.button
                    whileHover={{ scale: 1.006 }}
                    whileTap={{ scale: 0.985 }}
                    type="button"
                    onClick={() => {
                      setWizardPrefillMember(undefined);
                      setWizardPrefill(undefined);
                      setIsWizardOpen(true);
                    }}
                    title="Enroll New Member"
                    className="hidden sm:flex w-full py-3 px-4 rounded-2xl text-white font-heading font-black text-xs sm:text-sm tracking-wider uppercase items-center justify-center gap-2 shadow-md transition-all duration-200 border border-white/10 group mt-3 select-none bg-(--color-primary) hover:bg-(--color-primary-hover) cursor-pointer hover:shadow-lg"
                  >
                    <div className="w-5 h-5 rounded-lg bg-white/15 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300 shrink-0">
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span>ENROLL NEW MEMBER</span>
                  </motion.button>
                </div>

                {/* MOBILE CARD LIST VIEW (< MD) */}
                <div className="block md:hidden space-y-2.5">
                  {loading ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border border-(--border-color) bg-(--bg-card) space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <Skeleton
                                circle
                                width={38}
                                height={38}
                                className="shrink-0"
                              />
                              <div className="flex-1 space-y-1">
                                <Skeleton height={14} width="65%" />
                                <Skeleton height={10} width="40%" />
                              </div>
                            </div>
                            <Skeleton
                              height={20}
                              width={60}
                              borderRadius={16}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-(--border-color)">
                            <Skeleton height={20} width="80%" />
                            <Skeleton height={20} width="60%" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-8 text-center space-y-2.5 bg-(--bg-card) border border-(--border-color) rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search className="w-5 h-5" />
                      </div>
                      <h4 className="font-heading font-bold text-xs text-(--color-text)">
                        No members match query
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        Modify search or filter chips to find profiles.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {(searchQuery || activeChip !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setActiveChip('all');
                            }}
                            className="px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider border border-blue-500/20"
                          >
                            Clear Filters
                          </button>
                        )}
                        {!hasAttemptedEmptyRefresh && (
                          <button
                            type="button"
                            disabled={isRefreshingEmpty}
                            onClick={async () => {
                              setIsRefreshingEmpty(true);
                              try {
                                sessionStorage.removeItem(
                                  'members_sanitized_cache'
                                );
                                await fetchMembers(false);
                              } finally {
                                setHasAttemptedEmptyRefresh(true);
                                setIsRefreshingEmpty(false);
                              }
                            }}
                            className="px-3.5 py-1.5 bg-(--bg-input) hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-(--color-text) rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-(--border-color) transition-all inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isRefreshingEmpty ? 'animate-spin' : ''}`}
                            />
                            <span>
                              {isRefreshingEmpty ? 'Refreshing...' : 'Refresh'}
                            </span>
                          </button>
                        )}
                        {isSuper && (
                          <button
                            type="button"
                            onClick={() => setIsMigrationModalOpen(true)}
                            className="px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-amber-500/30 transition-all inline-flex items-center gap-1.5 shadow-2xs"
                          >
                            <Database className="w-3.5 h-3.5 text-amber-500" />
                            <span>Data Migration</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards Map with Windowing/Virtualization */}
                      <VirtualWindowList
                        items={paginatedMobileMembers}
                        estimateItemHeight={140}
                        overscan={3}
                        className="space-y-2.5"
                        getItemKey={(member) => member.id}
                        renderItem={(member) => {
                          const subInfo = getSubscriptionDetails(
                            member.member_id
                          );
                          const cardObj = getActiveCard(member.member_id);
                          const isSelected = selectedMemberIds.includes(
                            member.id
                          );
                        const isSuspended = member.status === 'Suspended';
                        const isQr = cardObj && cardObj.card_type === 'QR';

                        return (
                          <div
                            key={member.id}
                            ref={(el) => {
                              if (el) mobileCardRefs.current.set(member.id, el);
                              else mobileCardRefs.current.delete(member.id);
                            }}
                            onClick={() => {
                              setSelectedMemberIds((prev) => {
                                if (!isMultiSelect) {
                                  const isCurrentlySelected = prev.includes(member.id);
                                  const next = isCurrentlySelected ? [] : [member.id];
                                  if (!isCurrentlySelected) {
                                    setTimeout(() => {
                                      const el = mobileCardRefs.current.get(member.id);
                                      if (el) {
                                        el.scrollIntoView({
                                          behavior: 'smooth',
                                          block: 'center',
                                        });
                                      }
                                    }, 100);
                                  }
                                  return next;
                                }

                                const isCurrentlySelected = prev.includes(member.id);
                                const next = isCurrentlySelected
                                  ? prev.filter((id) => id !== member.id)
                                  : [...prev, member.id];

                                if (next.length === 0) {
                                  setIsMultiSelect(false);
                                }

                                if (!isCurrentlySelected && next.length === 1) {
                                  setTimeout(() => {
                                    const el = mobileCardRefs.current.get(member.id);
                                    if (el) {
                                      el.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'center',
                                      });
                                    }
                                  }, 100);
                                }
                                return next;
                              });
                            }}
                            className={`p-3.5 rounded-2xl border transition-all select-none space-y-2.5 relative ${
                              isSelected
                                ? 'bg-blue-500/10 dark:bg-blue-500/15 border-blue-500 shadow-md ring-1 ring-blue-500'
                                : isSuspended
                                  ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-200'
                                  : 'bg-(--bg-card) border-(--border-color) shadow-xs active:scale-[0.99]'
                            }`}
                          >
                            {/* Card Header: Checkbox + Avatar + Details + Status */}
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Picture Box with Top-Left Checkbox Overlay */}
                                <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden select-none border border-(--border-color)">
                                  <MemberAvatar
                                    src={member.image_url || member.avatar_url}
                                    name={member.full_name}
                                    size={44}
                                    roundedClassName="rounded-xl"
                                    className="shadow-xs shrink-0 w-full h-full"
                                  />

                                  {/* Multi-Selection Checkbox Indicator Badge */}
                                  {isSelectionActive && isMultiSelect && (
                                    <div className="absolute top-1 left-1 pointer-events-none">
                                      <div
                                        className={`w-3.5 h-3.5 rounded-md flex items-center justify-center transition-all ${
                                          isSelected
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'border border-white/60 bg-black/40'
                                        }`}
                                      >
                                        {isSelected && (
                                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-heading font-extrabold text-sm text-(--color-text) truncate leading-tight uppercase">
                                      {member.full_name}
                                    </h3>
                                    {(() => {
                                      const age = getMemberAge(member.birthday);
                                      if (
                                        age !== null &&
                                        age >= 12 &&
                                        age <= 17
                                      ) {
                                        return (
                                          <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                                            Minor ({age} yrs)
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                    {isSuspended && (
                                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shrink-0">
                                        SUSPENDED
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-mono text-slate-400 block mt-0.5 truncate font-medium uppercase">
                                    {member.member_id}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Plan & Security Details Grid */}
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-(--border-color)">
                              <div className="space-y-0.5">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  PLAN
                                </span>
                                <span className="font-extrabold text-xs text-(--color-text) block truncate">
                                  {subInfo.planName}
                                </span>
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-extrabold uppercase border ${subInfo.badgeStyle}`}
                                  >
                                    {subInfo.statusLabel}
                                  </span>
                                  {subInfo.queuedPlan && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                                      Queued: {subInfo.queuedPlan}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-0.5 text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  BADGE STATUS
                                </span>
                                <div>
                                  {!cardObj ||
                                  cardObj.card_type === 'None' ||
                                  cardObj.payment_status !== 'PAID' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                                      <span>NO CARD</span>
                                    </span>
                                  ) : cardObj.payment_status === 'PAID' &&
                                    cardObj.claim_status === 'UNCLAIMED' ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                                        <span>PAID • UNCLAIMED</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) =>
                                          handleDirectClaim(member, e)
                                        }
                                        className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-heading font-bold uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-1"
                                      >
                                        <Check className="w-2.5 h-2.5" />
                                        <span>Claim</span>
                                      </button>
                                    </div>
                                  ) : cardObj.payment_status === 'PAID' &&
                                    cardObj.claim_status === 'CLAIMED' ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isQr) {
                                          setSelectedProfileMember(member);
                                        } else {
                                          setManualModalMember(member);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                      <span>PAID • CLAIMED</span>
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                                      <span>NO CARD</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                  {member.phone || 'No phone'}
                                </span>
                              </div>
                            </div>

                            </div>
                        );
                      }}
                    />

                      {/* Mobile Pagination Navigation */}
                      {totalMobilePages > 1 && (
                        <div className="flex items-center justify-between pt-2.5 pb-2 select-none">
                          <span className="text-xs text-slate-400 font-mono">
                            Page {mobilePage} of {totalMobilePages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={mobilePage === 1}
                              onClick={() =>
                                setMobilePage((p) => Math.max(1, p - 1))
                              }
                              className="px-3 py-1.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <button
                              disabled={mobilePage === totalMobilePages}
                              onClick={() =>
                                setMobilePage((p) =>
                                  Math.min(totalMobilePages, p + 1)
                                )
                              }
                              className="px-3 py-1.5 rounded-xl border border-(--border-color) bg-(--bg-card) text-xs font-bold disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Queue' && (
              <OnlineQueue
                onApproveLaunchWizard={(reg) => {
                  setWizardPrefill(reg);
                  setWizardPrefillMember(undefined);
                  setIsWizardOpen(true);
                }}
              />
            )}
          </div>
        </>
      )}

      {/* 1. DESKTOP / TABLET FLOATING MULTI-SELECT BAR */}
      {location.pathname.startsWith('/members/list') &&
        activeTab === 'Directory' &&
        !isPlansPath &&
        isSelectionActive &&
        createPortal(
          <div
            style={{ position: 'fixed' }}
            className={`hidden md:flex fixed md:bottom-[6.5rem] lg:bottom-6 left-1/2 -translate-x-1/2 z-[195] bg-(--bg-card)/98 backdrop-blur-xl text-(--color-text) px-5 py-2.5 rounded-2xl shadow-2xl border border-(--border-color) items-center gap-4 select-none transition-all duration-300 ease-in-out ${
              isNavFloatingOpen
                ? 'max-lg:translate-y-24 max-lg:opacity-0 max-lg:pointer-events-none'
                : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2 pr-2 border-r border-(--border-color)">
              <span className="w-6 h-6 rounded-full bg-(--color-primary) text-white font-mono font-bold text-xs flex items-center justify-center">
                {selectedMemberIds.length}
              </span>
              <span className="font-heading text-xs font-bold uppercase tracking-wider text-(--color-text)">
                Selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsMultiSelect((prev) => {
                    const next = !prev;
                    if (!next && selectedMemberIds.length > 1) {
                      setSelectedMemberIds([selectedMemberIds[0]]);
                    }
                    return next;
                  });
                }}
                className={`px-3 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-all border active:scale-95 ${
                  isMultiSelect
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/30'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 border-(--border-color)'
                }`}
                title={
                  isMultiSelect
                    ? 'Multi-select is active (click to switch to single-select)'
                    : 'Enable multi-select mode'
                }
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Multi-Select</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-extrabold uppercase ${
                    isMultiSelect
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isMultiSelect ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isSessionOpen) {
                    toast.warning(
                      'Cannot purchase cards: Cash drawer session is closed. Open a cash session in Cash Management first.'
                    );
                    return;
                  }
                  setIsBatchBuyCardModalOpen(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors shadow-md border-none"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>
                  Purchase Cards (₱
                  {(
                    selectedMemberIds.length * (settings.card_printing_fee || 50)
                  ).toLocaleString()}
                  )
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowBatchCardModal(true)}
                className="px-3.5 py-2 bg-(--color-primary) hover:bg-(--color-primary-hover) text-white rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors shadow-md border-none"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Member Cards</span>
              </button>

              <button
                type="button"
                onClick={resetActionState}
                className="p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* 2. MOBILE MULTI-SELECT BOTTOM BAR */}
      {location.pathname.startsWith('/members/list') &&
        activeTab === 'Directory' &&
        !isPlansPath &&
        isSelectionActive &&
        createPortal(
          (() => {
            const singleSelectedMember =
              selectedMemberIds.length === 1
                ? members.find((m) => m.id === selectedMemberIds[0])
                : null;
            const singleSubInfo = singleSelectedMember
              ? getSubscriptionDetails(singleSelectedMember.member_id)
              : null;
            const isSingleActionDisabled =
              !isSessionOpen ||
              singleSelectedMember?.status === 'Suspended' ||
              isOffline;

            return (
              <div
                style={{ position: 'fixed' }}
                className={`md:hidden fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] left-2 right-2 h-14 z-[210] bg-(--bg-card)/98 backdrop-blur-xl text-(--color-text) px-2 py-2 rounded-2xl shadow-2xl border border-(--border-color) flex items-center justify-between gap-1.5 select-none transition-all duration-300 ease-in-out ${
                  isNavFloatingOpen
                    ? 'translate-y-24 opacity-0 pointer-events-none'
                    : 'translate-y-0 opacity-100 pointer-events-auto'
                }`}
              >
                {/* Selected Counter Badge */}
                <div className="flex items-center pr-1.5 border-r border-(--border-color) shrink-0">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                    {selectedMemberIds.length}
                  </span>
                </div>

                {/* Action Buttons (Fills space evenly without dead gaps or scrolling) */}
                <div className="flex-1 flex items-center gap-1 min-w-0">
                  {singleSelectedMember ? (
                    <>
                      {/* Profile */}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedProfileMember(singleSelectedMember)
                        }
                        className="flex-1 min-w-0 h-9 px-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center gap-1 text-[10px] font-heading font-bold uppercase tracking-tight border border-blue-500/20 active:scale-95 transition-colors cursor-pointer"
                        title="View Profile"
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Profile</span>
                      </button>

                      {/* Subscribe / Renew */}
                      <button
                        type="button"
                        disabled={isSingleActionDisabled}
                        onClick={(e) => {
                          if (isSingleActionDisabled || !singleSelectedMember)
                            return;
                          handleTableRenewOrSubscribe(
                            singleSelectedMember,
                            singleSubInfo?.hasSub || false,
                            e
                          );
                        }}
                        className={`flex-1 min-w-0 h-9 px-1.5 rounded-xl flex items-center justify-center gap-1 text-[10px] font-heading font-bold uppercase tracking-tight active:scale-95 transition-colors border cursor-pointer ${
                          isSingleActionDisabled
                            ? 'bg-slate-400/20 text-slate-400 border-slate-500/20 opacity-60 cursor-not-allowed'
                            : 'bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        }`}
                        title={
                          isOffline
                            ? 'Offline'
                            : singleSubInfo?.hasSub
                              ? 'Renew Subscription'
                              : 'Subscribe Plan'
                        }
                      >
                        {isSingleActionDisabled ? (
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {singleSubInfo?.hasSub ? 'Renew' : 'Subscribe'}
                        </span>
                      </button>

                      {/* Purchase Physical Card */}
                      <button
                        type="button"
                        disabled={!isSessionOpen}
                        onClick={() => {
                          if (!isSessionOpen) {
                            toast.warning(
                              'Cannot purchase cards: Cash drawer session is closed. Open a cash session in Cash Management first.'
                            );
                            return;
                          }
                          setIsBatchBuyCardModalOpen(true);
                        }}
                        className="h-9 px-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1 shadow-md active:scale-95 transition-transform border border-indigo-500/30 shrink-0"
                        title="Purchase physical card"
                      >
                        <CreditCard className="w-3.5 h-3.5 shrink-0" />
                        <span>₱{settings.card_printing_fee || 50}</span>
                      </button>

                      {/* 3-Dots Action Menu Trigger */}
                      <button
                        type="button"
                        onClick={() =>
                          setMobileActionSheetMember(singleSelectedMember)
                        }
                        className="w-9 h-9 bg-(--bg-page) text-slate-400 border border-(--border-color) rounded-xl flex items-center justify-center hover:text-(--color-text) active:scale-95 cursor-pointer transition-colors shrink-0"
                        title="More Options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Batch Purchase Physical Cards */}
                      <button
                        type="button"
                        disabled={!isSessionOpen}
                        onClick={() => {
                          if (!isSessionOpen) {
                            toast.warning(
                              'Cannot purchase cards: Cash drawer session is closed. Open a cash session in Cash Management first.'
                            );
                            return;
                          }
                          setIsBatchBuyCardModalOpen(true);
                        }}
                        className="flex-1 h-9 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform border border-indigo-500/30"
                        title="Purchase physical cards"
                      >
                        <CreditCard className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Buy ₱
                          {(
                            selectedMemberIds.length *
                            (settings.card_printing_fee || 50)
                          ).toLocaleString()}
                        </span>
                      </button>

                      {/* Batch Print Member Cards */}
                      <button
                        type="button"
                        onClick={() => setShowBatchCardModal(true)}
                        className="flex-1 h-9 px-3 bg-(--color-primary) hover:bg-(--color-primary-hover) text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-colors"
                        title="Print Member Cards"
                      >
                        <Printer className="w-3.5 h-3.5 shrink-0" />
                        <span>Print Cards</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Clear Selection */}
                <div className="flex items-center pl-1 border-l border-(--border-color) shrink-0">
                  <button
                    type="button"
                    onClick={resetActionState}
                    className="w-8 h-8 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center justify-center transition-colors active:scale-95 shrink-0"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })(),
          document.body
        )}

      {/* 3. MOBILE DIRECT ACTION BOTTOM BAR */}
      {location.pathname.startsWith('/members/list') &&
        activeTab === 'Directory' &&
        !isPlansPath &&
        !isSelectionActive &&
        createPortal(
          <div
            style={{ position: 'fixed' }}
            className={`md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-[195] shadow-2xl transition-all duration-300 ease-in-out ${
              isNavFloatingOpen
                ? 'translate-y-24 opacity-0 pointer-events-none'
                : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
              <div className="flex items-center gap-1 text-(--color-primary-light) shrink-0">
                <Users className="w-3.5 h-3.5" />
                <span className="text-[11px]">{stats.total} Members</span>
              </div>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] truncate">
                  {stats.activeSubscriptions} Active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isOffline}
                onClick={() => {
                  if (isOffline) {
                    toast.error('Recycle Bin is unavailable while offline.', {
                      toastId: 'recycle-bin-offline',
                    });
                    return;
                  }
                  setIsRecycleOpen(true);
                }}
                className={`w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center transition-colors ${
                  isOffline
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-amber-500/20 cursor-pointer active:scale-95'
                }`}
                title={
                  isOffline
                    ? 'Recycle Bin is unavailable while offline'
                    : 'Recycle Bin'
                }
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleOpenPrintModal}
                className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                title="Print Cards"
              >
                <Printer className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setWizardPrefillMember(undefined);
                  setWizardPrefill(undefined);
                  setIsWizardOpen(true);
                }}
                className="h-9 px-3 rounded-xl text-white flex items-center justify-center gap-1 text-xs font-heading font-bold uppercase tracking-wider shadow-md border border-white/10 transition-transform bg-(--color-primary) hover:bg-(--color-primary-hover) cursor-pointer active:scale-95"
                title="Enroll Member"
              >
                <Plus className="w-4 h-4" />
                <span className="text-[10px] hidden xs:inline">Enroll</span>
              </button>
            </div>
          </div>,
          document.body
        )}

{/* 4. MOBILE SLIDE-UP ACTION SHEET (PULLABLE DRAGGABLE WITH 2 BUTTONS PER ROW) */}
      {createPortal(
        <AnimatePresence>
          {mobileActionSheetMember && (
            <motion.div
              key="mobile-action-sheet-portal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[300]"
            >
              <div
                onClick={() => setMobileActionSheetMember(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                key="mobile-action-sheet-panel"
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 400) {
                    setMobileActionSheetMember(null);
                  }
                }}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed bottom-0 left-0 right-0 z-[310] bg-(--bg-card) border-t border-(--border-color) rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto touch-pan-y select-none"
              >
                {/* Pullable Top Drag Handle */}
                <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700 mx-auto shrink-0 cursor-grab active:cursor-grabbing mb-1" />

                <div className="flex items-center gap-3 border-b border-(--border-color) pb-4">
                  <div className="w-11 h-11 rounded-2xl bg-(--color-primary) text-white flex items-center justify-center font-heading text-sm font-black shrink-0">
                    {(mobileActionSheetMember.full_name || 'M')[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading font-bold text-base text-(--color-text) truncate uppercase">
                      {mobileActionSheetMember.full_name}
                    </h3>
                    <span className="text-xs font-mono text-slate-400 block uppercase">
                      {mobileActionSheetMember.member_id} •{' '}
                      {mobileActionSheetMember.phone}
                    </span>
                  </div>
                </div>

                {/* 2 Buttons Per Row Grid with Profile Alone at Bottom */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* Row 1: Print Card & Purchase Card */}
                  <button
                    type="button"
                    onClick={() => {
                      const target = mobileActionSheetMember;
                      setMobileActionSheetMember(null);
                      setSelectedMemberIds([target.id]);
                      setShowBatchCardModal(true);
                    }}
                    className="p-3 bg-(--bg-page) border border-(--border-color) rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center text-xs font-heading font-bold uppercase tracking-wider text-(--color-text) active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Printer className="w-5 h-5 text-blue-500" />
                    <span>Print Card</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isSessionOpen}
                    onClick={() => {
                      const target = mobileActionSheetMember;
                      setMobileActionSheetMember(null);
                      setSelectedMemberIds([target.id]);
                      if (!isSessionOpen) {
                        toast.warning(
                          'Cannot purchase cards: Cash drawer session is closed.'
                        );
                        return;
                      }
                      setIsBatchBuyCardModalOpen(true);
                    }}
                    className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center text-xs font-heading font-bold uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CreditCard className="w-5 h-5 text-indigo-500" />
                    <span>Purchase (₱{settings.card_printing_fee || 50})</span>
                  </button>

                  {/* Row 2: Colorful Subscribe & Suspend */}
                  {(() => {
                    const isActionDisabled =
                      !isSessionOpen ||
                      mobileActionSheetMember.status === 'Suspended' ||
                      isOffline;
                    const subInfo = getSubscriptionDetails(
                      mobileActionSheetMember.member_id
                    );

                    return (
                      <button
                        type="button"
                        disabled={isActionDisabled}
                        onClick={(e) => {
                          if (isActionDisabled) return;
                          const target = mobileActionSheetMember;
                          setMobileActionSheetMember(null);
                          handleTableRenewOrSubscribe(target, subInfo.hasSub, e);
                        }}
                        title={
                          isOffline
                            ? 'Subscriptions locked: Internet connection required.'
                            : undefined
                        }
                        className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center text-xs font-heading font-bold uppercase tracking-wider active:scale-[0.98] transition-all ${
                          isActionDisabled
                            ? 'bg-slate-400/10 text-slate-400 border border-slate-500/20 cursor-not-allowed opacity-60'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 cursor-pointer shadow-xs'
                        }`}
                      >
                        {isActionDisabled ? (
                          <Lock className="w-5 h-5" />
                        ) : (
                          <Zap className="w-5 h-5 text-emerald-500" />
                        )}
                        <span>
                          {subInfo.hasSub ? 'Renew Plan' : 'Subscribe'}
                        </span>
                      </button>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => {
                      const target = mobileActionSheetMember;
                      setMobileActionSheetMember(null);
                      handleToggleSuspend(target);
                    }}
                    className="p-3 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-center text-xs font-heading font-bold uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                  >
                    {mobileActionSheetMember.status === 'Active' ? (
                      <UserX className="w-5 h-5 text-amber-500" />
                    ) : (
                      <UserCheck className="w-5 h-5 text-emerald-500" />
                    )}
                    <span>
                      {mobileActionSheetMember.status === 'Active'
                        ? 'Suspend'
                        : 'Reactivate'}
                    </span>
                  </button>

                  {/* Row 3: View Profile Alone at the Bottom */}
                  <button
                    type="button"
                    onClick={() => {
                      const target = mobileActionSheetMember;
                      setMobileActionSheetMember(null);
                      setSelectedProfileMember(target);
                    }}
                    className="col-span-2 p-3 bg-(--bg-page) border border-(--border-color) rounded-2xl flex items-center justify-center gap-2 text-center text-xs font-heading font-bold uppercase tracking-wider text-(--color-text) active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-blue-500" />
                    <span>View Profile</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* MODALS */}
      {isWizardOpen && (
        <IntakeWizardModal
          isOpen={isWizardOpen}
          initialIntakeMode="Manual"
          prefillData={wizardPrefill}
          prefillMember={wizardPrefillMember}
          onClose={() => {
            setIsWizardOpen(false);
            setWizardPrefill(undefined);
            setWizardPrefillMember(undefined);
          }}
          onComplete={fetchMembers}
        />
      )}

      {isRecycleOpen && !isOffline && (
        <MemberRecycleBin
          isOpen={isRecycleOpen}
          onClose={() => setIsRecycleOpen(false)}
          onRestoreSuccess={fetchMembers}
        />
      )}

      <AnimatePresence>
        {selectedProfileMember && (
          <MemberProfileView
            member={selectedProfileMember}
            onClose={() => setSelectedProfileMember(null)}
            onMutationSuccess={(deletedMemberId?: string) => {
              const cacheKey = 'members_sanitized_cache';
              sessionStorage.removeItem(cacheKey);
              try {
                localStorage.removeItem(cacheKey);
              } catch {
                // ignore
              }
              if (deletedMemberId) {
                setMembers((prev) =>
                  prev.filter(
                    (m) =>
                      m.id !== deletedMemberId && m.member_id !== deletedMemberId
                  )
                );
                setSelectedMemberIds((prev) =>
                  prev.filter((id) => id !== deletedMemberId)
                );
              }
              fetchMembers(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* SINGLE CARD MODALS */}
      {manualModalMember && (
        <ManualCardTemplateModal
          member={manualModalMember}
          onClose={() => setManualModalMember(null)}
        />
      )}

      {/* BATCH MULTI-SELECT MEMBER CARD PRINT WORKSPACE MODAL */}
      {showBatchCardModal && (
        <MemberCardPrintModal
          members={members}
          initialSelectedIds={selectedMemberIds}
          onClose={() => setShowBatchCardModal(false)}
          onSuccess={fetchMembers}
        />
      )}

      {/* SUPERADMIN LEGACY DATA MIGRATION MODAL */}
      {isMigrationModalOpen && (
        <LegacyDataMigrationModal
          isOpen={isMigrationModalOpen}
          onClose={() => setIsMigrationModalOpen(false)}
          onSuccess={() => fetchMembers(true)}
        />
      )}

      <Modal
        isOpen={isBatchBuyCardModalOpen}
        onClose={() => {
          if (!isProcessingBatchPay) setIsBatchBuyCardModalOpen(false);
        }}
        title="BATCH PURCHASE PHYSICAL CARDS"
        className="max-w-lg md:max-w-xl w-full p-6"
      >
        <div className="space-y-4 text-left font-body">
          {/* 1. KPI Summary Banner */}
          <div className="p-4 bg-gradient-to-r from-blue-600/10 via-blue-500/5 to-transparent border border-blue-500/20 rounded-2xl flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Total Payable Amount
              </span>
              <div className="text-2xl font-mono font-black text-(--color-text)">
                ₱{batchMemberBreakdown.totalPrice.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-400">
                Rate: ₱{batchMemberBreakdown.fee} •{' '}
                {batchMemberBreakdown.payableMembers.length} of{' '}
                {selectedMemberIds.length} members billed
              </p>
            </div>

            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                <CreditCard className="w-3.5 h-3.5" />
                <span>{batchMemberBreakdown.payableMembers.length} Cards</span>
              </span>
            </div>
          </div>

          {/* 2. Replacement Warning (Only if members already have a card) */}
          {batchMemberBreakdown.replacementMembers.length > 0 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 block">
                  {batchMemberBreakdown.replacementMembers.length} member(s)
                  already paid for a card
                </span>
                <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={chargeReplacements}
                    onChange={(e) => setChargeReplacements(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Charge replacement fee (Lost or Damaged Card)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* 3. Member List with Avatars */}
          <div>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-heading font-extrabold text-slate-400 uppercase tracking-wider">
                Selected Members ({selectedMemberIds.length})
              </span>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
              {members
                .filter((m) => selectedMemberIds.includes(m.id))
                .map((m) => {
                  const isReplacement =
                    batchMemberBreakdown.replacementMembers.some(
                      (rm) => rm.id === m.id
                    );
                  const isCharged = isReplacement ? chargeReplacements : true;

                  return (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        !isCharged
                          ? 'bg-slate-500/5 border-(--border-color) opacity-60'
                          : 'bg-(--bg-card) border-(--border-color)'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MemberAvatar
                          src={m.image_url || m.avatar_url}
                          name={m.full_name}
                          size={32}
                          roundedClassName="rounded-lg"
                          className="shrink-0 border border-(--border-color)"
                        />
                        <div className="min-w-0">
                          <span className="font-bold text-xs block truncate text-(--color-text) uppercase">
                            {m.full_name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block uppercase">
                            {m.member_id}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isReplacement ? (
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase border ${
                              isCharged
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : 'bg-slate-500/15 text-slate-400 border-slate-500/20 line-through'
                            }`}
                          >
                            {isCharged
                              ? `Replacement (₱${batchMemberBreakdown.fee})`
                              : 'Skipped (₱0)'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase border bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                            New Card (₱${batchMemberBreakdown.fee})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* 4. Payment Method Segmented Selector */}
          <div className="space-y-2 pt-2 border-t border-(--border-color)">
            <label className="text-[10px] font-heading font-extrabold text-slate-400 uppercase tracking-wider block">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBatchPayMethod('Cash')}
                className={`py-2 px-3 rounded-xl border text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 transition-all ${
                  batchPayMethod === 'Cash'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                    : 'bg-(--bg-page) text-slate-400 border-(--border-color) hover:text-(--color-text)'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setBatchPayMethod('GCash')}
                className={`py-2 px-3 rounded-xl border text-xs font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 transition-all ${
                  batchPayMethod === 'GCash'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                    : 'bg-(--bg-page) text-slate-400 border-(--border-color) hover:text-(--color-text)'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>GCash</span>
              </button>
            </div>

            {batchPayMethod === 'GCash' && (
              <div className="space-y-1 pt-1 animate-fade-in">
                <input
                  type="text"
                  value={batchGcashRef}
                  onChange={(e) => setBatchGcashRef(e.target.value)}
                  placeholder="GCash Reference Number (Optional)"
                  className="w-full p-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl font-mono text-xs text-(--color-text) outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            )}
          </div>

          {/* 5. Bottom Action Buttons */}
          <div className="flex gap-2.5 justify-end pt-3 border-t border-(--border-color)">
            <button
              type="button"
              disabled={isProcessingBatchPay}
              onClick={() => setIsBatchBuyCardModalOpen(false)}
              className="px-4 py-2 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-heading font-bold uppercase tracking-wider cursor-pointer border-none transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={
                isProcessingBatchPay ||
                batchMemberBreakdown.payableMembers.length === 0
              }
              onClick={async () => {
                if (!isSessionOpen) {
                  toast.error(
                    'Cannot process batch card purchase: Cash drawer session is closed. Open a cash session in Cash Management first.'
                  );
                  return;
                }
                setIsProcessingBatchPay(true);
                try {
                  const memberIds = batchMemberBreakdown.payableMembers.map(
                    (m) => m.member_id
                  );
                  const fee = batchMemberBreakdown.fee;

                  await cardService.batchPurchase(
                    memberIds,
                    batchPayMethod,
                    fee,
                    batchGcashRef,
                    'Admin Staff'
                  );

                  toast.success(
                    `Processed card payment for ${memberIds.length} member(s).`
                  );
                  setIsBatchBuyCardModalOpen(false);
                  setSelectedMemberIds([]);
                  setBatchGcashRef('');
                  fetchMembers();
                } catch (err: any) {
                  toast.error(
                    err.message || 'Failed to complete batch card purchase.'
                  );
                } finally {
                  setIsProcessingBatchPay(false);
                }
              }}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-heading font-extrabold uppercase tracking-wider cursor-pointer border-none shadow-md flex items-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>
                {isProcessingBatchPay
                  ? 'Processing...'
                  : `Confirm (₱${batchMemberBreakdown.totalPrice.toFixed(2)})`}
              </span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MembersList;
