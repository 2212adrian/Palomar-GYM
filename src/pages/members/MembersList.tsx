// src/pages/members/MembersList.tsx

import React, { useState, useMemo, useEffect, useContext, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Users, Eye, CreditCard, RotateCcw, Plus, Search, Settings,
  X, Award, Clock, UserX, UserCheck, QrCode, Filter, MoreVertical, Printer
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { HeaderActionsContext } from '../../routes';

// Import Shared Types
import type { 
  Member, Subscription, MemberCard, OnlineRegistration
} from '../../types/members';

// Import Consolidated Service & Storage
import { memberService, prototypeStorage, STORAGE_KEYS } from './memberService';

// Import Modals & Views
import { OnlineQueue } from './components/OnlineQueue';
import { MemberProfileView } from './components/MemberProfileView';
import { MemberRecycleBin } from './components/MemberRecycleBin';
import { StaffPlansConsole, IntakeWizardModal } from './components/SubscriptionPlan'; 
import { DigitalQRCardModal } from './components/DigitalQRCardModal';
import { ManualCardTemplateModal } from './components/ManualCardTemplateModal';
import { MemberCardPrintModal } from './components/MemberCardPrintModal';
import { toast } from 'react-toastify';

interface MembersListProps {
  hideHeaderActions?: boolean;
}

type FilterChip = 
  | 'all' 
  | 'suspended' 
  | 'with_sub' 
  | 'expiring' 
  | 'expired' 
  | 'has_card' 
  | 'no_card';

export const MembersList: React.FC<MembersListProps> = ({ hideHeaderActions = false }) => {
  const { setActions } = useContext(HeaderActionsContext);
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isPlansPath = useMemo(() => {
    return location.pathname.includes('/plans');
  }, [location.pathname]);

  const [activeTab, setActiveTab] = useState<'Directory' | 'Queue'>('Directory');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState<FilterChip>('all');
  
  // Selection state for multi-select batch operations
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRecycleOpen, setIsRecycleOpen] = useState(false);
  const [selectedProfileMember, setSelectedProfileMember] = useState<Member | null>(null);
  const [wizardPrefillMember, setWizardPrefillMember] = useState<Member | undefined>(undefined);
  const [wizardPrefill, setWizardPrefill] = useState<OnlineRegistration | undefined>(undefined);

  // Card modal state
  const [qrModalMember, setQrModalMember] = useState<Member | null>(null);
  const [manualModalMember, setManualModalMember] = useState<Member | null>(null);
  const [showBatchCardModal, setShowBatchCardModal] = useState<boolean>(false);

  // Action Menu state
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const itemsPerPage = useResponsiveItemsPerPage();

  const subscriptions = useMemo(() => {
    return prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
  }, [members, activeTab]);

  const cards = useMemo(() => {
    return prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS);
  }, [members, activeTab]);

  const fetchMembers = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setMembers(memberService.getAll());
      setLoading(false);
    }, 250);
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, activeTab]);

  useEffect(() => {
    if (isPlansPath) {
      setActiveTab('Directory');
    }
  }, [isPlansPath]);

  // Keyboard Shortcut: Focus Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || ''))) return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Helper getters
  const getActiveSubscription = useCallback((memberId: string): Subscription | undefined => {
    return subscriptions.find((s: Subscription) => s.member_id === memberId && s.status === 'Active');
  }, [subscriptions]);

  const getActiveCard = useCallback((memberId: string): MemberCard | undefined => {
    return cards.find((c: MemberCard) => c.member_id === memberId && c.status === 'Active');
  }, [cards]);

  // Launch Print Modal pre-selecting all "No Card Issued" members if no checkboxes selected
  const handleOpenPrintModal = () => {
    if (selectedMemberIds.length === 0) {
      const unissuedIds = members.filter(m => !getActiveCard(m.member_id)).map(m => m.id);
      setSelectedMemberIds(unissuedIds);
    }
    setShowBatchCardModal(true);
  };

  // Metric Calculations
  const stats = useMemo(() => {
    const now = new Date();
    
    let activeSubsCount = 0;
    let expiringSoonCount = 0;

    subscriptions.forEach((s: Subscription) => {
      if (s.status === 'Active') {
        activeSubsCount++;
        const end = new Date(s.end_date);
        const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) {
          expiringSoonCount++;
        }
      }
    });

    return {
      total: members.length,
      activeSubscriptions: activeSubsCount,
      expiringSoon: expiringSoonCount,
      suspendedMembers: members.filter(m => m.status === 'Suspended').length,
    };
  }, [members, subscriptions]);

  // Chip Filter Counts
  const chipCounts = useMemo(() => {
    const now = new Date();
    return {
      all: members.length,
      suspended: members.filter(m => m.status === 'Suspended').length,
      with_sub: members.filter(m => !!getActiveSubscription(m.member_id)).length,
      expiring: members.filter(m => {
        const sub = getActiveSubscription(m.member_id);
        if (!sub) return false;
        const diffDays = Math.ceil((new Date(sub.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 7;
      }).length,
      expired: members.filter(m => {
        const hasActive = !!getActiveSubscription(m.member_id);
        const hasExpiredSub = subscriptions.some(s => s.member_id === m.member_id && s.status === 'Expired');
        return !hasActive && hasExpiredSub;
      }).length,
      has_card: members.filter(m => {
        const card = getActiveCard(m.member_id);
        return card && card.card_type !== 'None';
      }).length,
      no_card: members.filter(m => {
        const card = getActiveCard(m.member_id);
        return !card || card.card_type === 'None';
      }).length,
    };
  }, [members, subscriptions, getActiveSubscription, getActiveCard]);

  // Filtered Members
  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();

    return members.filter((m: Member) => {
      const fullName = (m.full_name || '').toLowerCase();
      const memberId = (m.member_id || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const email = (m.email || '').toLowerCase();

      const matchesSearch = q === '' ||
        fullName.includes(q) ||
        memberId.includes(q) ||
        phone.includes(q) ||
        email.includes(q);

      if (!matchesSearch) return false;

      switch (activeChip) {
        case 'suspended':
          return m.status === 'Suspended';
        case 'with_sub':
          return !!getActiveSubscription(m.member_id);
        case 'expiring': {
          const sub = getActiveSubscription(m.member_id);
          if (!sub) return false;
          const diffDays = Math.ceil((new Date(sub.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 7;
        }
        case 'expired': {
          const hasActive = !!getActiveSubscription(m.member_id);
          const hasExpiredSub = subscriptions.some(s => s.member_id === m.member_id && s.status === 'Expired');
          return !hasActive && hasExpiredSub;
        }
        case 'has_card': {
          const card = getActiveCard(m.member_id);
          return card && card.card_type !== 'None';
        }
        case 'no_card': {
          const card = getActiveCard(m.member_id);
          return !card || card.card_type === 'None';
        }
        case 'all':
        default:
          return true;
      }
    });
  }, [members, searchQuery, activeChip, subscriptions, getActiveSubscription, getActiveCard]);

  const handleToggleSuspend = (memberItem: Member) => {
    const nextStatus = memberItem.status === 'Active' ? 'Suspended' : 'Active';
    try {
      memberService.update(memberItem.id, { status: nextStatus }, 'Admin Staff');
      toast.success(`Member set to ${nextStatus}.`);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    }
  };

  const isSelectionActive = selectedMemberIds.length > 0;

  // Row selection handler identical to Products.tsx
  const handleRowClick = (member: Member) => {
    setSelectedMemberIds(prev =>
      prev.includes(member.id)
        ? prev.filter(id => id !== member.id)
        : [...prev, member.id]
    );
  };

  // Row style function identical to Products.tsx
  const getRowStyle = (member: Member) => {
    const isSelected = selectedMemberIds.includes(member.id);
    const isSuspended = member.status === 'Suspended';

    if (isSelected) {
      return 'group !bg-blue-500/10 hover:!bg-blue-500/15 border-l-2 border-blue-500 transition-colors duration-150 cursor-pointer';
    }
    if (isSuspended) {
      return 'group bg-slate-200/50 dark:bg-zinc-900/40 hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 opacity-60 text-slate-400 transition-colors duration-150 cursor-pointer';
    }
    return 'group hover:!bg-blue-500/5 dark:hover:!bg-blue-500/10 transition-colors duration-150 cursor-pointer';
  };

  const columns: Column<Member>[] = [
    {
      key: 'select',
      header: isSelectionActive ? (
        <div className="flex items-center justify-center h-full w-full py-1">
          <input
            type="checkbox"
            checked={filteredMembers.length > 0 && filteredMembers.every(m => selectedMemberIds.includes(m.id))}
            onChange={(e) => {
              if (e.target.checked) {
                const currentIds = filteredMembers.map(m => m.id);
                setSelectedMemberIds(prev => Array.from(new Set([...prev, ...currentIds])));
              } else {
                const currentIds = filteredMembers.map(m => m.id);
                setSelectedMemberIds(prev => prev.filter(id => !currentIds.includes(id)));
              }
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
            title="Toggle Select All"
          />
        </div>
      ) : null,
      headerClassName: 'w-12 text-center',
      cellClassName: 'text-center p-0',
      render: (item) => isSelectionActive ? (
        <label className="flex items-center justify-center w-full h-11 py-2 cursor-pointer transition-colors hover:bg-slate-500/5 select-none" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedMemberIds.includes(item.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedMemberIds(prev => [...prev, item.id]);
              } else {
                setSelectedMemberIds(prev => prev.filter(id => id !== item.id));
              }
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-110"
          />
        </label>
      ) : null
    },
    {
      key: 'full_name',
      header: 'Member / ID',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1 text-left">
          <div className="w-9 h-9 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-xs font-bold shadow-xs shrink-0">
            {(item.full_name || 'M')[0]}
          </div>
          <div className="min-w-0">
            <span className="font-bold block text-xs text-(--color-text) truncate">{item.full_name}</span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5 leading-none truncate">
              {item.member_id} • {item.phone}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'subscription',
      header: 'Subscription Plan',
      sortable: true,
      sortValue: (item) => {
        const sub = getActiveSubscription(item.member_id);
        return sub ? sub.plan_name : 'AAA_NO_SUB';
      },
      render: (item) => {
        const sub = getActiveSubscription(item.member_id);
        if (!sub) {
          return (
            <div className="text-left leading-tight">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                Profile Only
              </span>
              <span className="text-[9px] text-slate-400 block mt-1 font-mono">No active contract</span>
            </div>
          );
        }
        
        const end = new Date(sub.end_date);
        const now = new Date();
        const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        let badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
        let statusLabel = `${diffDays} Days left`;

        if (diffDays <= 0) {
          badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
          statusLabel = 'Expires Today';
        } else if (diffDays <= 3) {
          badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
          statusLabel = `${diffDays} Days Left (Renew Soon)`;
        } else if (diffDays <= 7) {
          badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
          statusLabel = '7 Days Left';
        } else if (diffDays > 30) {
          const months = Math.floor(diffDays / 30);
          const remDays = diffDays % 30;
          statusLabel = remDays === 0 ? `${months} Mon left` : `${months}m ${remDays}d left`;
        }

        return (
          <div className="text-left leading-tight space-y-1">
            <span className="font-sans font-bold text-xs block text-(--color-text)">{sub.plan_name}</span>
            <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${badgeStyle}`}>
              {statusLabel}
            </span>
          </div>
        );
      }
    },
    {
      key: 'card_printed',
      header: 'Security Badge',
      sortable: true,
      sortValue: (item) => {
        const cardObj = getActiveCard(item.member_id);
        if (!cardObj || cardObj.card_type === 'None') return 'AAA_NO_CARD';
        return cardObj.card_type;
      },
      render: (item) => {
        const cardObj = getActiveCard(item.member_id);
        if (!cardObj || cardObj.card_type === 'None') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
              No Card Issued
            </span>
          );
        }
        const isQr = cardObj.card_type === 'QR';
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isQr) {
                setQrModalMember(item);
              } else {
                setManualModalMember(item);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[8px] font-bold border cursor-pointer hover:opacity-80 transition-opacity ${
              isQr 
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' 
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}
            title="Click to view & print card"
          >
            {isQr ? <QrCode className="w-3 h-3 text-blue-500" /> : <CreditCard className="w-3 h-3 text-amber-500" />}
            <span>{isQr ? 'Digital QR Badge' : 'Manual Badge'}</span>
          </button>
        );
      }
    },
    {
      key: 'status',
      header: 'System Status',
      sortable: true,
      render: (item) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
          item.status === 'Active' 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        }`}>
          {item.status}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[180px]',
      render: (item) => {
        const hasActiveSub = !!getActiveSubscription(item.member_id);

        return (
          <div 
            className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 flex items-center justify-end gap-1.5 select-none relative"
            onClick={(e) => e.stopPropagation()}
          >
            {!hasActiveSub && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setWizardPrefillMember(item);
                  setIsWizardOpen(true);
                }}
                className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg cursor-pointer border border-emerald-500/20 inline-flex items-center gap-1 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
                title="Enroll member into a subscription contract"
              >
                <CreditCard className="w-3.5 h-3.5" /> Subscribe
              </button>
            )}
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProfileMember(item);
              }}
              className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg cursor-pointer border border-blue-500/20 inline-flex items-center gap-1 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
              title="See more details"
            >
              <Eye className="w-3.5 h-3.5" /> Profile
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenActionMenuId(openActionMenuId === item.id ? null : item.id);
                }}
                className="p-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-(--color-text) cursor-pointer"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {openActionMenuId === item.id && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1 w-44 bg-(--bg-card) border border-(--border-color) rounded-2xl shadow-xl z-30 p-1.5 space-y-1 font-body text-xs text-left animate-fade-in"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setSelectedProfileMember(item);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2 text-[10px] font-bold text-(--color-text) cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                    <span>View Workspace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      setQrModalMember(item);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2 text-[10px] font-bold text-(--color-text) cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-500" />
                    <span>Digital QR Card</span>
                  </button>

                  <div className="border-t border-(--border-color) my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpenActionMenuId(null);
                      handleToggleSuspend(item);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 cursor-pointer"
                  >
                    {item.status === 'Active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    <span>{item.status === 'Active' ? 'Suspend Member' : 'Activate Member'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      }
    }
  ];

  // Header Actions Sync (PRINT MEMBER CARDS BUTTON)
  useEffect(() => {
    if (hideHeaderActions || isPlansPath) {
      return;
    }

    setActions(
      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
        {activeTab === 'Directory' && (
          <>
            <Button
              onClick={handleOpenPrintModal}
              variant="secondary"
              className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
              title="Open full member credential card print workspace"
            >
              <Printer className="w-4 h-4 text-red-500" />
              <span>PRINT MEMBER CARDS</span>
            </Button>

            <Button
              onClick={() => setIsRecycleOpen(true)}
              variant="secondary"
              className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
            >
              <RotateCcw className="w-4 h-4 text-amber-500" />
              <span>RECYCLE BIN</span>
            </Button>

            <Button
              onClick={() => { 
                setWizardPrefillMember(undefined); 
                setWizardPrefill(undefined); 
                setIsWizardOpen(true); 
              }}
              variant="primary"
              className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 shadow-md cursor-pointer animate-fade-in"
            >
              <Plus className="w-4 h-4" />
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
  }, [activeTab, setActions, hideHeaderActions, isPlansPath, members]);

  useEffect(() => {
    const handleClickOutside = () => setOpenActionMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="relative min-h-[85vh] w-full animate-fade-in text-xs text-(--color-text)">
      
      {isPlansPath ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-(--border-color) pb-4 select-none">
            <Settings className="w-5 h-5 text-(--color-primary-light)" />
            <h2 className="font-heading text-base tracking-wider uppercase text-slate-800 dark:text-white">Active Counter Plan Catalog</h2>
          </div>
          <StaffPlansConsole />
        </div>
      ) : (
        <>
          {/* TOP SWITCH TABS */}
          <div className="flex border-b border-(--border-color) bg-(--bg-card) p-1 rounded-t-3xl select-none">
            {[
              { id: 'Directory', icon: Users, label: 'Members Directory' },
              { id: 'Queue', icon: CreditCard, label: 'Online Registration Queue' }
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`flex-1 py-3 px-2 font-heading text-[10px] tracking-wider uppercase font-black cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === item.id 
                      ? 'border-b-2 border-[#123c73] dark:border-[#bf0202] text-slate-900 dark:text-white' 
                      : 'border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-6">
            {activeTab === 'Directory' && (
              <div className="space-y-6 pb-24">
                
                {/* UPGRADED OVERVIEW METRIC CARDS (4 CARDS) */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
                  
                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20 shrink-0">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">TOTAL MEMBERS</span>
                      <span className="text-base font-heading font-black text-(--color-text) block leading-tight">
                        {stats.total}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400 block truncate">Registered Profiles</span>
                    </div>
                  </div>

                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20 shrink-0">
                      <Award className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">ONGOING SUBSCRIPTION</span>
                      <span className="text-base font-heading font-black text-emerald-600 dark:text-emerald-400 block leading-tight">
                        {stats.activeSubscriptions}
                      </span>
                      <span className="text-[9px] font-mono text-emerald-600/70 dark:text-emerald-400/70 block truncate">Active Contracts</span>
                    </div>
                  </div>

                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20 shrink-0">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">EXPIRING SOON</span>
                      <span className="text-base font-heading font-black text-amber-600 dark:text-amber-400 block leading-tight">
                        {stats.expiringSoon}
                      </span>
                      <span className="text-[9px] font-mono text-amber-600/70 dark:text-amber-400/70 block truncate">Within 7 Days</span>
                    </div>
                  </div>

                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3.5 shadow-xs hover:-translate-y-0.5 transition-all">
                    <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500 border border-rose-500/20 shrink-0">
                      <UserX className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">SUSPENDED</span>
                      <span className="text-base font-heading font-black text-rose-600 dark:text-rose-400 block leading-tight">
                        {stats.suspendedMembers}
                      </span>
                      <span className="text-[9px] font-mono text-rose-600/70 dark:text-rose-400/70 block truncate">Locked Profiles</span>
                    </div>
                  </div>

                </div>

                {/* SEARCH & STREAMLINED CHIP FILTERS TOOLBAR */}
                <div className="space-y-3 bg-(--bg-card) p-3.5 rounded-2xl border border-(--border-color) shadow-xs">
                  
                  <div className="relative w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search profiles by Name, Member ID, Contact Phone, or Email..."
                      className="w-full pl-10 pr-10 py-2.5 border border-(--border-color) bg-(--bg-page) rounded-xl outline-none font-medium text-xs text-(--color-text) focus:border-blue-500 transition-all"
                    />

                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-(--color-text) cursor-pointer"
                        title="Clear search query"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 select-none">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 shrink-0 pr-1">
                      <Filter className="w-3 h-3" /> Filters:
                    </span>

                    {[
                      { id: 'all', label: 'All', count: chipCounts.all },
                      { id: 'with_sub', label: 'Ongoing Sub', count: chipCounts.with_sub },
                      { id: 'expiring', label: 'Expiring Soon', count: chipCounts.expiring },
                      { id: 'expired', label: 'Expired Plan', count: chipCounts.expired },
                      { id: 'has_card', label: 'Has Card', count: chipCounts.has_card },
                      { id: 'no_card', label: 'No Card', count: chipCounts.no_card },
                      { id: 'suspended', label: 'Suspended', count: chipCounts.suspended },
                    ].map(chip => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setActiveChip(chip.id as FilterChip)}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer border transition-all flex items-center gap-1.5 shrink-0 ${
                          activeChip === chip.id
                            ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-xs'
                            : 'bg-(--bg-page) border-(--border-color) text-slate-400 hover:text-(--color-text)'
                        }`}
                      >
                        <span>{chip.label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full font-mono text-[9px] ${
                          activeChip === chip.id
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                        }`}>
                          {chip.count}
                        </span>
                      </button>
                    ))}
                  </div>

                </div>

                {/* TABLE CONTAINER WITH EMPTY STATES & SKELETON */}
                <div className="p-1 bg-(--bg-card) border border-(--border-color) rounded-2xl overflow-hidden shadow-xs">
                  {loading ? (
                    <div className="p-6 space-y-3">
                      <Skeleton height={20} count={6} baseColor="var(--border-color)" />
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 mx-auto flex items-center justify-center">
                        <Search className="w-6 h-6" />
                      </div>
                      <h4 className="font-heading font-bold text-sm text-(--color-text)">No members match query</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {searchQuery || activeChip !== 'all'
                          ? 'Try modifying your search keywords or reset chip filters.'
                          : 'No member records enrolled in system databases yet.'}
                      </p>
                      {(searchQuery || activeChip !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveChip('all');
                          }}
                          className="px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl font-heading text-[10px] font-bold uppercase tracking-wider cursor-pointer border border-blue-500/20"
                        >
                          Clear Filters
                        </button>
                      )}
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

      {/* FLOATING BULK ACTIONS BAR FOR MULTI-SELECTION */}
{isSelectionActive && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-(--bg-card) text-(--color-text) px-5 py-3 rounded-2xl shadow-2xl border border-(--border-color) flex items-center gap-4 animate-slide-up select-none">
    <div className="flex items-center gap-2 pr-2 border-r border-(--border-color)">
      <span className="w-6 h-6 rounded-full bg-[#123c73] dark:bg-[#bf0202] text-white font-mono font-bold text-xs flex items-center justify-center">
        {selectedMemberIds.length}
      </span>
      <span className="font-heading text-xs font-bold uppercase tracking-wider text-(--color-text)">
        Selected
      </span>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowBatchCardModal(true)}
        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-red-600 dark:hover:bg-red-700  text-white rounded-xl text-[10px] font-heading font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition-colors shadow-md border-none"
      >
        <Printer className="w-3.5 h-3.5" />
        <span>Print Member Cards</span>
      </button>

      <button
        type="button"
        onClick={() => setSelectedMemberIds([])}
        className="p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
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

      {isRecycleOpen && (
        <MemberRecycleBin 
          isOpen={isRecycleOpen}
          onClose={() => setIsRecycleOpen(false)}
          onRestoreSuccess={fetchMembers}
        />
      )}

      {selectedProfileMember && (
        <MemberProfileView 
          member={selectedProfileMember}
          onClose={() => setSelectedProfileMember(null)}
          onMutationSuccess={fetchMembers}
        />
      )}

      {/* SINGLE CARD MODALS */}
      {qrModalMember && (
        <DigitalQRCardModal
          member={qrModalMember}
          subscription={getActiveSubscription(qrModalMember.member_id)}
          card={getActiveCard(qrModalMember.member_id)}
          onClose={() => setQrModalMember(null)}
        />
      )}

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
        />
      )}

    </div>
  );
};

export default MembersList;