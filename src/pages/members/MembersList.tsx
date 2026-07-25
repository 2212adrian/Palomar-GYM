import React, { useState, useMemo, useEffect, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Users, Eye, CreditCard, RotateCcw, Plus, Search, Settings
} from 'lucide-react';
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
import { StaffPlansConsole, IntakeWizardModal } from './components/StaffPlansConsole'; 

interface MembersListProps {
  hideHeaderActions?: boolean;
}

export const MembersList: React.FC<MembersListProps> = ({ hideHeaderActions = false }) => {
  const { setActions } = useContext(HeaderActionsContext);
  const location = useLocation();

  const isPlansPath = useMemo(() => {
    return location.pathname.includes('/plans');
  }, [location.pathname]);

  const [activeTab, setActiveTab] = useState<'Directory' | 'Queue'>('Directory');
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRecycleOpen, setIsRecycleOpen] = useState(false);
  const [selectedProfileMember, setSelectedProfileMember] = useState<Member | null>(null);
  const [wizardPrefillMember, setWizardPrefillMember] = useState<Member | undefined>(undefined);
  const [wizardPrefill, setWizardPrefill] = useState<OnlineRegistration | undefined>(undefined);

  const itemsPerPage = useResponsiveItemsPerPage();

  const subscriptions = useMemo(() => {
    return prototypeStorage.getCollection<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
  }, [members, activeTab]);

  const cards = useMemo(() => {
    return prototypeStorage.getCollection<MemberCard>(STORAGE_KEYS.CARDS);
  }, [members, activeTab]);

  const fetchMembers = () => {
    setMembers(memberService.getAll());
  };

  useEffect(() => {
    fetchMembers();
  }, [activeTab]);

  useEffect(() => {
    if (isPlansPath) {
      setActiveTab('Directory');
    }
  }, [isPlansPath]);

  const stats = useMemo(() => {
    return {
      total: members.length,
      active: members.filter((m: Member) => m.status === 'Active').length,
      inactive: members.filter((m: Member) => m.status === 'Suspended').length,
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    return members.filter((m: Member) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = q === '' ||
        m.full_name.toLowerCase().includes(q) ||
        m.member_id.toLowerCase().includes(q) ||
        m.phone.includes(q);

      if (!matchesSearch) return false;
      if (filterStatus === 'all') return true;
      return m.status === filterStatus;
    });
  }, [members, searchQuery, filterStatus]);

  const columns: Column<Member>[] = [
    {
      key: 'full_name',
      header: 'Full Name / ID',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1 text-left">
          <div className="w-8 h-8 rounded-lg bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center font-heading text-xs font-bold shadow-xs">
            {item.full_name[0]}
          </div>
          <div>
            <span className="font-bold block text-xs text-(--color-text)">{item.full_name}</span>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5 leading-none">
              {item.member_id} • {item.phone}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'card_printed',
      header: 'Credential Status',
      render: (item) => {
        const cardObj = cards.find((c: MemberCard) => c.member_id === item.member_id && c.status === 'Active');
        if (!cardObj || cardObj.card_type === 'None') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
              No Card
            </span>
          );
        }
        const isQr = cardObj.card_type === 'QR';
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-bold border ${
            isQr 
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' 
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          }`}>
            {isQr ? 'Printed (QR)' : 'Printed (Manual)'}
          </span>
        );
      }
    },
    {
      key: 'subscription',
      header: 'Subscription',
      render: (item) => {
        const sub = subscriptions.find((s: Subscription) => s.member_id === item.member_id && s.status === 'Active');
        if (!sub) return <span className="text-slate-400 font-medium text-[11px]">Profile Only (No Plan)</span>;
        
        const end = new Date(sub.end_date);
        const now = new Date();
        const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        let durationText = '';
        if (diffDays <= 0) {
          durationText = 'Expired Today';
        } else if (diffDays > 30) {
          const months = Math.floor(diffDays / 30);
          const remDays = diffDays % 30;
          durationText = remDays === 0 ? `${months} Mon left` : `${months}m ${remDays}d left`;
        } else {
          durationText = `${diffDays} Days left`;
        }

        return (
          <div className="text-left leading-tight">
            <span className="font-sans font-bold text-xs block text-(--color-text)">{sub.plan_name}</span>
            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">{durationText}</span>
          </div>
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
            : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
        }`}>{item.status}</span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'text-right min-w-[180px]',
      render: (item) => {
        const hasActiveSub = subscriptions.some((s: Subscription) => s.member_id === item.member_id && s.status === 'Active');

        return (
          <div className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 flex items-center justify-end gap-1.5 select-none">
            {!hasActiveSub && (
              <button 
                onClick={() => {
                  setWizardPrefillMember(item);
                  setIsWizardOpen(true);
                }}
                className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg cursor-pointer border border-emerald-500/20 inline-flex items-center gap-1 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
                title="Renew or Upgrade current membership plan"
              >
                <CreditCard className="w-3.5 h-3.5" /> Subscribe
              </button>
            )}
            
            <button 
              onClick={() => setSelectedProfileMember(item)}
              className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg cursor-pointer border border-blue-500/20 inline-flex items-center gap-1 text-[9px] font-heading tracking-wider uppercase font-bold transition-colors"
            >
              <Eye className="w-3.5 h-3.5" /> Workspace
            </button>
          </div>
        );
      }
    }
  ];

  useEffect(() => {
    if (hideHeaderActions || isPlansPath) {
      setActions(null);
      return;
    }

    setActions(
      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in select-none">
        {activeTab === 'Directory' && (
          <>
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

    return () => setActions(null);
  }, [activeTab, setActions, hideHeaderActions, isPlansPath]);

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
          <div className="flex border-b border-(--border-color) bg-(--bg-card) p-1 rounded-t-3xl select-none">
            {[
              { id: 'Directory', icon: Users, label: 'Members Directory' },
              { id: 'Queue', icon: CreditCard, label: 'Online Queue' }
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

          <div className="mt-6">
            {activeTab === 'Directory' && (
              <div className="space-y-6 pb-24">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 select-none">
                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl text-left shadow-xs">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block leading-none">TOTAL CLIENTS</span>
                    <span className="text-sm font-heading font-black block mt-2.5 leading-none">{stats.total} Profiles</span>
                  </div>
                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl text-left shadow-xs">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block leading-none">ACTIVE MEMBERS</span>
                    <span className="text-sm font-heading font-black block mt-2.5 leading-none text-emerald-600 dark:text-emerald-400">{stats.active} Active</span>
                  </div>
                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl text-left shadow-xs">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block leading-none">INACTIVE PROFILES</span>
                    <span className="text-sm font-heading font-black block mt-2.5 leading-none text-slate-500">{stats.inactive} Inactive</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 bg-(--bg-card) p-3.5 rounded-xl border border-(--border-color) shadow-xs">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Query membership databases..."
                      className="w-full pl-9 pr-4 py-2 border border-(--border-color) bg-(--bg-page) rounded-lg outline-none font-medium text-xs"
                    />
                  </div>

                  <select 
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-(--border-color) bg-(--bg-page) rounded-lg font-bold outline-none cursor-pointer text-xs"
                  >
                    <option value="all">ALL SYSTEM STATUSES</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="p-1 bg-(--bg-card) border border-(--border-color) rounded-2xl overflow-hidden shadow-xs">
                  <Table<Member>
                    data={filteredMembers}
                    columns={columns}
                    itemsPerPage={itemsPerPage}
                    loading={false}
                  />
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

    </div>
  );
};

export default MembersList;