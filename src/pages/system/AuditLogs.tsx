import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase/client';
import { toast } from 'react-toastify';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { 
  Database, 
  RefreshCw, 
  Loader2, 
  Users, 
  Calendar,
  AlertTriangle,
  LogIn,
  LogOut,
  Settings as SettingsIcon,
  Trash2,
  CreditCard,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Activity,
  Shield,
  Layers,
  CheckCircle2,
  UserCheck,
  UserX
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Activities' },
  { id: 'sales', label: 'Sales & Products' },
  { id: 'attendance', label: 'Logbook & Attendance' },
  { id: 'members', label: 'Members' },
  { id: 'payments', label: 'Payments & Rates' },
  { id: 'incidents', label: 'Incident Reports' },
  { id: 'settings', label: 'Settings & Profile' },
  { id: 'backups', label: 'Backups' },
  { id: 'security', label: 'Security & Users' },
  { id: 'auth', label: 'Authentication' }
];

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSeverity, setActiveSeverity] = useState<string>('all');
  const [activeOperator, setActiveOperator] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = useResponsiveItemsPerPage();

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.warn('Failed to retrieve system logs:', err.message);
      toast.error('Failed to load system audit history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatActionName = (action: string): string => {
    const act = action.toUpperCase();
    // Sales & Products
    if (act.includes('SALE_CREATED') || act.includes('SALE_ADD')) return 'Created New Sale';
    if (act.includes('SALE_REMOVED') || act.includes('SALE_DELETE')) return 'Moved Sale to Recycle Bin';
    if (act.includes('SALE_RESTORED')) return 'Restored Sale from Recycle Bin';
    if (act.includes('SALES_REPORT') || act.includes('SALES_PRINT')) return 'Generated Sales Report';
    if (act.includes('RECEIPT_PRINTED')) return 'Printed Official Receipt';
    if (act.includes('PRODUCT_ADDED') || act.includes('PRODUCT_CREATE')) return 'Added New Product';
    if (act.includes('PRODUCT_UPDATED') || act.includes('PRODUCT_EDIT')) return 'Updated Product Information';
    if (act.includes('PRODUCT_REMOVED') || act.includes('PRODUCT_DELETE')) return 'Moved Product to Recycle Bin';
    if (act.includes('PRODUCT_RESTORED')) return 'Restored Product from Recycle Bin';
    if (act.includes('PRODUCT_LABELS_PRINTED')) return 'Printed Product Sheet Labels';

    // Logbook & Attendance
    if (act.includes('CHECK_IN') || act.includes('LOGBOOK_CHECKIN') || act.includes('ATTENDANCE_CHECKIN')) return 'Logged Member / Walk-In Check-In';
    if (act.includes('CHECK_OUT')) return 'Member Checked Out';
    if (act.includes('LOGBOOK_REMOVED') || act.includes('LOGBOOK_DELETE') || act.includes('ATTENDANCE_REMOVED')) return 'Moved Check-In to Recycle Bin';
    if (act.includes('LOGBOOK_RESTORED') || act.includes('ATTENDANCE_RESTORED')) return 'Restored Check-In from Recycle Bin';
    if (act.includes('LOGBOOK_REPORT') || act.includes('ATTENDANCE_REPORT')) return 'Generated Attendance Report';
    if (act.includes('PAYMENT_COLLECTED')) return 'Collected Outstanding Payment';
    if (act.includes('PAYMENT_UNDONE')) return 'Reverted Payment to Unpaid';

    // Members
    if (act.includes('ONLINE_REGISTRATION_APPROVED') || act.includes('ONLINE_REG_APPROVED')) return 'Approved Online Pre-Registration';
    if (act.includes('ONLINE_REGISTRATION_REJECTED') || act.includes('ONLINE_REG_REJECTED')) return 'Rejected Online Pre-Registration';
    if (act.includes('ONLINE_REGISTRATION_PURGED') || act.includes('ONLINE_REG_PURGED')) return 'Purged Expired Registrations';
    if (act.includes('MEMBER_CREATED') || act.includes('MEMBER_ENROLLED')) return 'Enrolled New Member';
    if (act.includes('MEMBER_UPDATED') || act.includes('MEMBER_EDIT')) return 'Updated Member Details';
    if (act.includes('MEMBER_REMOVED') || act.includes('MEMBER_DELETE') || act.includes('MEMBER_DEACTIVATED')) return 'Moved Member to Recycle Bin';
    if (act.includes('MEMBER_RESTORED')) return 'Restored Member from Recycle Bin';
    if (act.includes('MEMBER_CARDS_PRINTED')) return 'Printed Member ID Cards';
    if (act.includes('MEMBER_PLAN_EXTENDED') || act.includes('SUBSCRIPTION_EXTENDED')) return 'Extended Member Subscription';

    // Incidents
    if (act.includes('INCIDENT_CREATED') || act.includes('INCIDENT_REPORT_CREATED')) return 'Filed Incident Report';
    if (act.includes('INCIDENT_RESOLVED') || act.includes('INCIDENT_REPORT_RESOLVED')) return 'Resolved Incident Report';
    if (act.includes('INCIDENT_UPDATED') || act.includes('INCIDENT_STATUS')) return 'Updated Incident Status';
    if (act.includes('INCIDENT_DELETED') || act.includes('INCIDENT_REMOVED')) return 'Deleted Incident Report';
    if (act.includes('INCIDENT_COMMENT')) return 'Added Comment to Incident';

    // Dashboard & Reports
    if (act.includes('DASHBOARD_REPORT') || act.includes('DASHBOARD_PRINT')) return 'Printed Dashboard Summary';
    if (act.includes('REVENUE_GOAL')) return 'Configured Revenue Goal';

    // Settings & System
    if (act.includes('PAYMENT_RECEIVED') || act.includes('PAYMENT_ADD')) return 'Received Plan Payment';
    if (act.includes('SYSTEM_RATES_UPDATED') || act.includes('RATES_CONFIG')) return 'Updated Pricing & Rates';
    if (act.includes('DATABASE_BACKUP') || act.includes('GENERATE_BACKUP')) return 'Created System Backup';
    if (act.includes('RESTORE_DATABASE') || act.includes('RESTORE_BACKUP')) return 'Restored System Backup';
    if (act.includes('LOGIN') || act.includes('SIGN_IN')) return 'User Logged In';
    if (act.includes('LOGOUT') || act.includes('SIGN_OUT')) return 'User Logged Out';
    if (act.includes('USER_CREATED') || act.includes('ACCOUNT_CREATED')) return 'Created Staff/Admin Account';
    if (act.includes('USER_UPDATED') || act.includes('ACCOUNT_UPDATED')) return 'Updated Staff/Admin Account';
    if (act.includes('USER_DEACTIVATED') || act.includes('USER_SUSPENDED')) return 'Suspended User Account';
    if (act.includes('GYM_PROFILE')) return 'Updated Gym Profile Information';
    if (act.includes('DELETE') || act.includes('PURGE')) return 'Purged System Record';
    
    return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const getActionCategory = (action: string): string => {
    const act = action.toLowerCase();
    if (act.includes('login') || act.includes('logout') || act.includes('auth')) return 'auth';
    if (act.includes('sale') || act.includes('product') || act.includes('receipt')) return 'sales';
    if (act.includes('incident')) return 'incidents';
    if (act.includes('check_in') || act.includes('check_out') || act.includes('logbook') || act.includes('attendance')) return 'attendance';
    if (act.includes('member') || act.includes('online_registration') || act.includes('online_reg') || act.includes('enroll')) return 'members';
    if (act.includes('profile') || act.includes('user') || act.includes('role') || act.includes('deactivate') || act.includes('restore') || act.includes('security') || act.includes('account')) return 'security';
    if (act.includes('payment') || act.includes('fee') || act.includes('charge') || act.includes('invoice') || act.includes('rates') || act.includes('revenue_goal')) return 'payments';
    if (act.includes('backup') || act.includes('snapshot')) return 'backups';
    if (act.includes('config') || act.includes('settings') || act.includes('gym') || act.includes('permission') || act.includes('dashboard')) return 'settings';
    return 'all';
  };

  const getActionSeverity = (action: string): 'info' | 'warning' | 'critical' => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('PURGE') || act.includes('RESTORE_DATABASE') || act.includes('REMOVE') || act.includes('DEACTIVATE') || act.includes('SUSPEND') || act.includes('ONLINE_REGISTRATION_REJECTED')) {
      return 'critical';
    }
    if (act.includes('UPDATE') || act.includes('CONFIG') || act.includes('EDIT') || act.includes('BACKUP') || act.includes('SAVE') || act.includes('RESOLVED') || act.includes('RESTORED') || act.includes('EXTENDED')) {
      return 'warning';
    }
    return 'info';
  };

  const getActionIcon = (action: string, severity: string) => {
    const act = action.toUpperCase();
    const style = "w-4 h-4";
    if (act.includes('ONLINE_REGISTRATION_APPROVED')) return <UserCheck className={`${style} text-emerald-500`} />;
    if (act.includes('ONLINE_REGISTRATION_REJECTED')) return <UserX className={`${style} text-red-500`} />;
    if (act.includes('INCIDENT')) return <AlertTriangle className={`${style} text-amber-500`} />;
    if (act.includes('SALE') || act.includes('PRODUCT') || act.includes('RECEIPT')) return <CreditCard className={`${style} text-emerald-500`} />;
    if (severity === 'critical') return <Trash2 className={`${style} text-red-500`} />;
    if (act.includes('CHECK_IN') || act.includes('CHECK_OUT') || act.includes('LOGBOOK') || act.includes('ATTENDANCE')) {
      return <CheckCircle2 className={`${style} text-emerald-500`} />;
    }
    if (act.includes('PAYMENT') || act.includes('RATES')) return <CreditCard className={`${style} text-emerald-500`} />;
    if (act.includes('MEMBER') || act.includes('USER') || act.includes('ACCOUNT')) return <User className={`${style} text-blue-400`} />;
    if (act.includes('BACKUP') || act.includes('SNAPSHOT')) return <Database className={`${style} text-amber-500`} />;
    if (act.includes('RESTORE')) return <RefreshCw className={`${style} text-red-500`} />;
    if (act.includes('LOGIN')) return <LogIn className={`${style} text-blue-400`} />;
    if (act.includes('LOGOUT')) return <LogOut className={`${style} text-slate-400`} />;
    if (act.includes('CONFIG') || act.includes('RATES') || act.includes('GYM') || act.includes('SETTINGS')) return <SettingsIcon className={`${style} text-amber-500`} />;
    return <Activity className={`${style} text-slate-400`} />;
  };

  const getDayLabel = (dateStr: string): string => {
    const ManilaTimeStr = new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    const targetDate = new Date(ManilaTimeStr);
    
    const nowManilaStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    const now = new Date(nowManilaStr);

    const targetZero = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffTime = nowZero.getTime() - targetZero.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    
    return targetDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const summaryMetrics = useMemo(() => {
    const activeOperators = new Set(logs.map(l => l.actor_username)).size;
    const criticalCount = logs.filter(l => getActionSeverity(l.action) === 'critical').length;
    
    const todayPHTStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila' });
    const todayCount = logs.filter(l => {
      const logPHTStr = new Date(l.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' });
      return logPHTStr === todayPHTStr;
    }).length;

    const backupCount = logs.filter(l => getActionCategory(l.action) === 'backups').length;
    const authCount = logs.filter(l => getActionCategory(l.action) === 'auth').length;

    return {
      total: logs.length,
      critical: criticalCount,
      operators: activeOperators,
      today: todayCount,
      backups: backupCount,
      auth: authCount
    };
  }, [logs]);

  const uniqueOperators = useMemo(() => {
    const operators = logs.map(l => l.actor_username);
    return Array.from(new Set(operators)).filter(Boolean).sort();
  }, [logs]);

  const processedLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesCategory = activeCategory === 'all' || getActionCategory(log.action) === activeCategory;
      const matchesSeverity = activeSeverity === 'all' || getActionSeverity(log.action) === activeSeverity;
      const matchesOperator = activeOperator === 'all' || log.actor_username === activeOperator;

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || 
        log.actor_username.toLowerCase().includes(query) ||
        log.details?.toLowerCase().includes(query) ||
        formatActionName(log.action).toLowerCase().includes(query);

      return matchesCategory && matchesSeverity && matchesOperator && matchesSearch;
    });
  }, [logs, activeCategory, activeSeverity, activeOperator, searchQuery]);

  const timelineGroups = useMemo(() => {
    if (!processedLogs.length) return [];

    const grouped: any[] = [];
    let currentGroup: any = null;

    processedLogs.forEach((log) => {
      const logTime = new Date(log.created_at).getTime();

      if (!currentGroup) {
        currentGroup = {
          id: log.id,
          actor_username: log.actor_username,
          action: log.action,
          severity: getActionSeverity(log.action),
          category: getActionCategory(log.action),
          created_at: log.created_at,
          items: [log]
        };
      } else {
        const lastInGroupTime = new Date(currentGroup.items[currentGroup.items.length - 1].created_at).getTime();
        const timeDiffMins = Math.abs(lastInGroupTime - logTime) / (1000 * 60);

        if (
          currentGroup.actor_username === log.actor_username &&
          currentGroup.action === log.action &&
          timeDiffMins <= 5
        ) {
          currentGroup.items.push(log);
        } else {
          grouped.push(currentGroup);
          currentGroup = {
            id: log.id,
            actor_username: log.actor_username,
            action: log.action,
            severity: getActionSeverity(log.action),
            category: getActionCategory(log.action),
            created_at: log.created_at,
            items: [log]
          };
        }
      }
    });

    if (currentGroup) {
      grouped.push(currentGroup);
    }

    const dayPartitions: Record<string, any[]> = {};
    grouped.forEach((group) => {
      const label = getDayLabel(group.created_at);
      if (!dayPartitions[label]) {
        dayPartitions[label] = [];
      }
      dayPartitions[label].push(group);
    });

    return Object.entries(dayPartitions).map(([day, items]) => ({
      day,
      items
    }));
  }, [processedLogs]);

  const totalGroupsCount = useMemo(() => {
    return timelineGroups.reduce((acc, current) => acc + current.items.length, 0);
  }, [timelineGroups]);

  const paginatedTimelineGroups = useMemo(() => {
    let flatIndex = 0;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const result: any[] = [];

    timelineGroups.forEach((dayGroup) => {
      const visibleItemsInDay: any[] = [];
      
      dayGroup.items.forEach((item) => {
        if (flatIndex >= startIndex && flatIndex < endIndex) {
          visibleItemsInDay.push(item);
        }
        flatIndex++;
      });

      if (visibleItemsInDay.length > 0) {
        result.push({
          day: dayGroup.day,
          items: visibleItemsInDay
        });
      }
    });

    return result;
  }, [timelineGroups, currentPage]);

  const totalPages = Math.ceil(totalGroupsCount / itemsPerPage);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const handlePageChange = (direction: 'next' | 'prev') => {
    setCurrentPage((prev) => {
      const target = direction === 'next' ? Math.min(totalPages, prev + 1) : Math.max(1, prev - 1);
      return target;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full space-y-6 font-body text-(--color-text) pr-1 pl-1 sm:px-0 min-w-0">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
            System Audit Logs
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-semibold leading-relaxed">
            A comprehensive, readable timeline tracking administrative actions and system security events.
          </p>
        </div>
        
        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-(--color-primary) hover:bg-(--color-primary-hover) text-white text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer self-start sm:self-auto shadow-md"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh Feed
        </button>
      </div>

      {/* KPI Info Widgets Container */}
      <div className="hidden md:block group/kpis relative transition-all duration-500 ease-in-out border border-transparent hover:border-(--border-color)/40 rounded-3xl p-1">
        
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-500/5 border border-dashed border-(--border-color) rounded-2xl text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer transition-all hover:bg-slate-500/10">
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            System Metrics Overview
          </span>
          <span className="text-[9px] text-slate-500 font-bold group-hover/kpis:hidden">Hover to Expand metrics</span>
          <span className="text-[9px] text-slate-500 font-bold hidden group-hover/kpis:inline">Collapse metrics</span>
        </div>
        
        {/* KPI Grid */}
        <div className="opacity-0 max-h-0 scale-y-95 origin-top overflow-hidden group-hover/kpis:opacity-100 group-hover/kpis:max-h-96 group-hover/kpis:scale-y-100 group-hover/kpis:mt-4 transition-all duration-500 ease-in-out grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          
          <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Logs</span>
              <Activity className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse mt-0.5" />
              ) : (
                <span className="text-lg font-extrabold text-(--color-text) font-mono block">
                  {summaryMetrics.total}
                </span>
              )}
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total Events</span>
            </div>
          </div>

          <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Critical</span>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse mt-0.5" />
              ) : (
                <span className="text-lg font-extrabold text-red-500 font-mono block">
                  {summaryMetrics.critical}
                </span>
              )}
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Requires Review</span>
            </div>
          </div>

          <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Operators</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse mt-0.5" />
              ) : (
                <span className="text-lg font-extrabold text-(--color-text) font-mono block">
                  {summaryMetrics.operators}
                </span>
              )}
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Active Staff</span>
            </div>
          </div>

          <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today</span>
              <Calendar className="w-4 h-4 text-emerald-450" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse mt-0.5" />
              ) : (
                <span className="text-lg font-extrabold text-emerald-450 font-mono block">
                  {summaryMetrics.today}
                </span>
              )}
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">System Events</span>
            </div>
          </div>

          <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Backups</span>
              <Database className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse mt-0.5" />
              ) : (
                <span className="text-lg font-extrabold text-amber-500 font-mono block">
                  {summaryMetrics.backups}
                </span>
              )}
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Auto & Manual</span>
            </div>
          </div>

          <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Logins</span>
              <LogIn className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse mt-0.5" />
              ) : (
                <span className="text-lg font-extrabold text-(--color-text) font-mono block">
                  {summaryMetrics.auth}
                </span>
              )}
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Session Logins</span>
            </div>
          </div>

        </div>
      </div>

      {/* Filter and Search Section */}
      <div className="space-y-4 bg-(--bg-card) p-4 sm:p-5 rounded-2xl border border-(--border-color) shadow-xs text-left">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
          <div className="relative flex-1 max-w-md w-full">
            <input
              type="text"
              placeholder="Search audit logs by actor, action..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-sm text-(--color-text) outline-none focus:border-slate-450 transition-all font-medium"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          </div>

          <div className="grid grid-cols-2 gap-3 w-full lg:flex lg:flex-row lg:items-center lg:gap-4 lg:w-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full">
              <label htmlFor="severity-filter" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Severity:</label>
              <select
                id="severity-filter"
                value={activeSeverity}
                onChange={(e) => {
                  setActiveSeverity(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter logs by severity"
                aria-label="Filter logs by severity"
                className="w-full px-3 py-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all cursor-pointer whitespace-nowrap"
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full">
              <label htmlFor="operator-filter" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">User:</label>
              <select
                id="operator-filter"
                value={activeOperator}
                onChange={(e) => {
                  setActiveOperator(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter logs by system operator"
                aria-label="Filter logs by system operator"
                className="w-full px-3 py-2.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all cursor-pointer truncate whitespace-nowrap"
              >
                <option value="all">All Users</option>
                {uniqueOperators.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin border-t border-(--border-color) pt-4 no-scrollbar">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0">Category:</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-all shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-(--color-primary) border-(--color-primary) text-white'
                  : 'bg-(--bg-page) border-(--border-color) text-slate-400 hover:text-(--color-text)'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified Timeline Layout */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-8 relative before:absolute before:inset-y-0 before:left-2.5 sm:before:left-6 before:w-0.5 before:bg-slate-800/60 dark:before:bg-slate-800/30">
            {[...Array(2)].map((_, groupIdx) => (
              <div key={groupIdx} className="space-y-4 relative">
                <div className="relative z-10 -ml-1 sm:ml-0 text-left">
                  <div className="h-6 w-28 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-full animate-pulse" />
                </div>

                <div className="space-y-3 pl-6 sm:pl-10">
                  {[...Array(groupIdx === 0 ? 2 : 1)].map((_, itemIdx) => (
                    <div 
                      key={itemIdx} 
                      className="relative rounded-2xl border bg-(--bg-card) border-(--border-color) p-3.5 sm:p-5 shadow-xs overflow-hidden animate-pulse"
                    >
                      <div className="absolute hidden sm:block sm:left-[-22px] top-5.5 w-3 h-3 rounded-full border-2 bg-(--bg-page) border-slate-700/50" />
                      
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-slate-100 dark:bg-[#13161a] border border-(--border-color) rounded-xl shrink-0" />
                          <div className="space-y-2 text-left flex-1 min-w-0">
                            <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-1/4" />
                            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-3/4" />
                            <div className="h-2.5 bg-slate-200 dark:bg-white/10 rounded w-16" />
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded-full w-14" />
                          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-4" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : paginatedTimelineGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-(--bg-card) rounded-2xl border border-(--border-color) space-y-3">
            <Layers className="w-10 h-10 text-slate-500 opacity-60" />
            <p className="text-sm font-semibold text-slate-300">No matching activities found</p>
            <p className="text-xs text-slate-500">Try modifying your search query or selecting a different category filter.</p>
          </div>
        ) : (
          <div className="space-y-8 relative before:absolute before:inset-y-0 before:left-2.5 sm:before:left-6 before:w-0.5 before:bg-slate-800/60 dark:before:bg-slate-800/30">
            
            {paginatedTimelineGroups.map((dayGroup) => (
              <div key={dayGroup.day} className="space-y-4 relative">
                
                <div className="relative z-10 -ml-1 sm:ml-0 text-left">
                  <span className="px-3.5 py-1.5 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) text-[10px] font-heading tracking-widest uppercase rounded-full text-slate-500 dark:text-slate-400 font-bold shadow-xs">
                    {dayGroup.day}
                  </span>
                </div>

                <div className="space-y-3 pl-6 sm:pl-10">
                  {dayGroup.items.map((group: any) => {
                    const isExpanded = expandedGroupId === group.id;
                    const itemCount = group.items.length;
                    const representative = group.items[0];
                    const latestTimestamp = new Date(group.created_at);

                    return (
                      <div 
                        key={group.id} 
                        className={`group relative rounded-2xl border transition-all duration-300 bg-(--bg-card) border-(--border-color) hover:border-slate-700/60 p-3.5 sm:p-5 shadow-xs overflow-hidden ${
                          isExpanded ? 'ring-1 ring-slate-800/30' : ''
                        }`}
                      >
                        
                        <div className={`absolute hidden sm:block sm:left-[-22px] top-5.5 w-3 h-3 rounded-full border-2 bg-(--bg-page) transition-all ${
                          group.severity === 'critical'
                            ? 'border-red-500 shadow-md shadow-red-500/10'
                            : group.severity === 'warning'
                              ? 'border-amber-500 shadow-md shadow-amber-500/10'
                              : 'border-blue-400 shadow-md shadow-blue-400/10'
                        }`} />

                        <div 
                          onClick={() => toggleGroupExpand(group.id)}
                          className="flex items-start justify-between gap-2.5 sm:gap-4 cursor-pointer"
                        >
                          <div className="flex items-start gap-2.5 sm:gap-4 flex-1 min-w-0">
                            <div className="p-2.5 rounded-xl border shrink-0 bg-(--bg-page) border-(--border-color) group-hover:scale-105 transition-transform">
                              {getActionIcon(group.action, group.severity)}
                            </div>
                            <div className="space-y-0.5 text-left flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <span className="text-sm font-semibold text-(--color-text) block tracking-wide">
                                  {formatActionName(group.action)}
                                </span>
                                {itemCount > 1 && (
                                  <span className="px-2 py-0.5 bg-blue-500/10 text-[9px] text-blue-400 border border-blue-500/20 rounded-md font-bold tracking-wider uppercase shrink-0">
                                    {itemCount} Consecutive Actions
                                  </span>
                                )}
                              </div>
                              
                              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed break-words">
                                <span className="font-bold text-slate-800 dark:text-slate-200 mr-1.5 break-all">{group.actor_username}</span>
                                {itemCount > 1 
                                  ? `recorded ${itemCount} events in a 5-minute interval`
                                  : representative.details || 'System action executed.'
                                }
                              </p>
                              
                              <span className="text-[10px] text-slate-500 block font-semibold mt-1">
                                {latestTimestamp.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })} (PHT)
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0 ml-1">
                            {group.severity === 'critical' ? (
                              <span className="px-2.5 py-0.5 bg-red-500/10 text-[9px] text-red-400 border border-red-500/20 rounded-full font-bold tracking-widest uppercase">
                                Critical
                              </span>
                            ) : group.severity === 'warning' ? (
                              <span className="px-2.5 py-0.5 bg-amber-500/10 text-[9px] text-amber-500 border border-amber-500/20 rounded-full font-bold tracking-widest uppercase">
                                Warning
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 bg-blue-500/10 text-[9px] text-blue-400 border border-blue-500/20 rounded-full font-bold tracking-widest uppercase">
                                Info
                              </span>
                            )}

                            <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
                              {isExpanded ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                            </span>
                          </div>
                        </div>

                        {/* Expandable Details */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-(--border-color) space-y-4 animate-slide-up text-left">
                            
                            {itemCount > 1 ? (
                              <div className="space-y-3.5">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Grouped Sub-Events:</span>
                                <div className="space-y-3 pl-3 border-l-2 border-slate-800/80">
                                  {group.items.map((item: any) => (
                                    <div key={item.id} className="space-y-0.5 text-xs">
                                      <div className="flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                          {new Date(item.created_at).toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            second: '2-digit',
                                            hour12: true
                                          })}
                                        </span>
                                      </div>
                                      <p className="text-slate-700 dark:text-slate-300 font-semibold pl-5 break-words">{item.details || 'No additional context recorded.'}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                                <div className="space-y-1">
                                  <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] block">Actor Username</span>
                                  <span className="text-slate-800 dark:text-slate-100 font-bold block break-all">{representative.actor_username}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] block">Database Event Key</span>
                                  <span className="text-slate-800 dark:text-slate-100 font-mono text-[10px] block break-all">{representative.action}</span>
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                  <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] block">Metadata & Details</span>
                                  <span className="text-slate-700 dark:text-slate-200 font-normal leading-relaxed block bg-(--bg-page) p-3 rounded-lg border border-(--border-color) font-mono text-[11px] whitespace-pre-wrap text-left select-all break-words">
                                    {representative.details || 'No extended metadata payload registered.'}
                                  </span>
                                </div>
                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>

              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-(--bg-card) border border-(--border-color) rounded-2xl p-4 shadow-xs font-semibold">
                <span className="text-xs text-slate-400 text-center sm:text-left">
                  Showing <strong className="text-slate-550">{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong className="text-slate-550">{Math.min(currentPage * itemsPerPage, totalGroupsCount)}</strong> of <strong className="text-slate-550">{totalGroupsCount}</strong> grouped items
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange('prev')}
                    className="px-3.5 py-1.5 border border-(--border-color) bg-(--bg-page) hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange('next')}
                    className="px-3.5 py-1.5 border border-(--border-color) bg-(--bg-page) hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Safety Policy Info Box */}
      <div className="flex items-start gap-4 p-4 sm:p-5 bg-blue-500/5 border border-blue-500/20 rounded-2xl text-xs text-blue-700 dark:text-blue-300 leading-normal max-w-full">
        <Shield className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-1.5 text-left">
          <p className="font-heading tracking-wider uppercase text-xs">System Retention Policy (pgAudit Aligned)</p>
          <p className="text-[11px] font-semibold text-slate-400 opacity-90 leading-relaxed">
            Audit logging operations are protected under secure write-only database constraints. Manual record updates or deletions are restricted at the database catalog layer. Logs are retained for exactly one year and pruned daily via an automated database cron job at midnight Manila time.
          </p>
        </div>
      </div>

    </div>
  );
};