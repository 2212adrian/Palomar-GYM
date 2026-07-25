import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { 
  format, 
  startOfWeek, 
  addDays, 
  getDay,
  parseISO 
} from 'date-fns';
import { 
  Plus, 
  RotateCcw, 
  ClipboardList, 
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { useNavigate, useLocation } from 'react-router-dom';

// Supabase & Authentication Stores
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

// UI Helpers
import { Button } from '../../components/ui/Button';
import { UndoToast } from '../../components/ui/UndoToast'; 
import { TimelineBar } from '../../components/ui/TimelineBar';
import { TabLoader } from '../../components/ui/TabLoader'; 
import { HeaderActionsContext } from '../../routes';
import { LogbookRecordAttendance } from './components/LogbookRecordAttendance';
import { LogbookRecycleBin } from './components/LogbookRecycleBin';
import { LogbookReportCompiler } from './components/LogbookReportCompiler';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';

// Unified Official Receipt & TimelineCard
import { OfficialReceipt } from '../../components/ui/OfficialReceipt';
import { TimelineCard, type LogRecord } from '../../components/ui/TimelineCard';
import { MembersList } from '../members/MembersList';

// Storage Engine
import { prototypeStorage, STORAGE_KEYS } from '../members/memberService';
import type { AttendanceRecord } from '../../types/members';

const ATTENDANCE_FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Walk-In', value: 'Walk-In' },
  { label: 'Member', value: 'Member' },
  { label: 'New', value: 'New' }
];

const isLogDeletable = (log: LogRecord) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const logDate = log.timestamp ? format(parseISO(log.timestamp), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  return logDate === todayStr;
};

export const LogbookPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setActions } = useContext(HeaderActionsContext);
  const { user, profile } = useAuthStore() as any;

  const role = useMemo<'admin' | 'staff'>(() => {
    if (isSuperAdmin(user?.email)) return 'admin';
    return (profile?.role?.toLowerCase() === 'admin' ? 'admin' : 'staff');
  }, [user, profile]);

  const isAdmin = useMemo(() => role === 'admin', [role]);

  const [logs, setLogs] = useState<LogRecord[]>(() => {
    const saved = localStorage.getItem('palomar_gym_logbook');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Logbook parse error:', e);
      }
    }

    // Hydrate from STORAGE_KEYS.ATTENDANCE if present
    try {
      const dbAttendance = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
      if (dbAttendance.length > 0) {
        return dbAttendance.map((att: AttendanceRecord) => ({
          id: att.id,
          timestamp: att.check_in_time,
          memberId: att.member_id || null,
          customerName: att.customer_name,
          customerType: att.customer_type,
          categoryOrPlan: att.plan_name || 'Regular Pass',
          paymentMethod: att.payment_method,
          amountPaid: att.entry_fee,
          paymentStatus: att.entry_fee > 0 ? 'Paid' : 'Free',
          status: 'Active'
        }));
      }
    } catch (e) {
      console.error('Attendance hydration error:', e);
    }

    return INITIAL_LOGS;
  });

  useEffect(() => {
    localStorage.setItem('palomar_gym_logbook', JSON.stringify(logs));
  }, [logs]);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => 
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => getDay(new Date()));
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'All' | 'Walk-In' | 'Member' | 'New'>('All');
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  const [selectedReceiptLog, setSelectedReceiptLog] = useState<LogRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LogRecord | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [loading] = useState(false);

  // Dynamic mobile sliding backdrop state
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

  const itemsPerPage = useResponsiveItemsPerPage();
  const [currentPage, setCurrentPage] = useState(1);

  // Derive which main sliding view is active based on path
  const activePage = useMemo<'logbook' | 'members'>(() => {
    return location.pathname.startsWith('/members') ? 'members' : 'logbook';
  }, [location.pathname]);

  // Synchronize active slide state immediately during render phases
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;

  const selectedDate = useMemo(() => {
    return addDays(currentWeekStart, selectedDayIndex);
  }, [currentWeekStart, selectedDayIndex]);

  const dayLogs = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return logs.filter((l: LogRecord) => {
      const logDate = l.timestamp ? format(parseISO(l.timestamp), 'yyyy-MM-dd') : '';
      return logDate === dateStr;
    });
  }, [selectedDate, logs]);

  const filteredLogs = useMemo(() => {
    return dayLogs.filter((l: LogRecord) => {
      const q = ledgerSearch.toLowerCase().trim();
      const matchesSearch = q === '' ||
        l.customerName.toLowerCase().includes(q) ||
        (l.memberId && l.memberId.toLowerCase().includes(q)) ||
        l.categoryOrPlan.toLowerCase().includes(q);

      let matchesType = true;
      if (customerFilter === 'Walk-In') {
        matchesType = l.customerType === 'Walk-In';
      } else if (customerFilter === 'Member') {
        matchesType = l.customerType === 'Existing Member';
      } else if (customerFilter === 'New') {
        matchesType = l.customerType === 'New Membership';
      }

      return matchesSearch && matchesType;
    });
  }, [dayLogs, ledgerSearch, customerFilter]);

  // Pagination bounds
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedLogs = useMemo(() => {
    const startIdx = (clampedPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredLogs, clampedPage, itemsPerPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  // Aggregate Metrics
  const totalCollectedToday = useMemo(() => {
    return dayLogs.reduce((acc, log) => acc + (log.amountPaid || 0), 0);
  }, [dayLogs]);

  const handleCheckInSuccess = (newLog: LogRecord) => {
    setLogs(prev => [newLog, ...prev]);
    toast.success('Attendance check-in success.');
  };

  const handleTriggerCollectPayment = (log: LogRecord) => {
    setLogs(prev => prev.map(item => {
      if (item.id === log.id) {
        return { ...item, paymentStatus: 'Paid' };
      }
      return item;
    }));
    toast.success(`Payment logged for ${log.customerName}`);
  };

  const handleTriggerUndoPayment = (log: LogRecord) => {
    setLogs(prev => prev.map(item => {
      if (item.id === log.id) {
        return { ...item, paymentStatus: 'Unpaid' };
      }
      return item;
    }));
    toast.info(`Undone payment. Set back to Unpaid.`);
  };

  const handleDeleteLog = (log: LogRecord) => {
    if (!isLogDeletable(log)) {
      toast.error('Only logs recorded today can be deleted.');
      return;
    }
    setPendingDelete(log);
    
    // Save soft deletions array for Recycle Bin
    const savedDeleted = localStorage.getItem('palomar_gym_logbook_deleted');
    const deletedList = savedDeleted ? JSON.parse(savedDeleted) : [];
    localStorage.setItem('palomar_gym_logbook_deleted', JSON.stringify([{ ...log, deleted_at: new Date().toISOString() }, ...deletedList]));

    setLogs(prev => prev.filter(item => item.id !== log.id));
    setShowUndoToast(true);
  };

  const confirmDelete = () => {
    setPendingDelete(null);
    setShowUndoToast(false);
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    
    // Pull back from Recycle Bin
    const savedDeleted = localStorage.getItem('palomar_gym_logbook_deleted');
    if (savedDeleted) {
      const deletedList = JSON.parse(savedDeleted).filter((item: any) => item.id !== pendingDelete.id);
      localStorage.setItem('palomar_gym_logbook_deleted', JSON.stringify(deletedList));
    }

    setLogs(prev => [pendingDelete, ...prev].sort((a, b) => {
      const dateA = a.timestamp || '';
      const dateB = b.timestamp || '';
      return dateB.localeCompare(dateA);
    }));
    setPendingDelete(null);
    setShowUndoToast(false);
    toast.success('Check-in record restored.');
  };

  useEffect(() => {
    if (activePage === 'logbook') {
      setActions(
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end animate-fade-in">
          {role === 'admin' && (
            <>
              <Button
                onClick={() => setIsRecycleBinOpen(true)}
                variant="secondary"
                className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
              >
                <RotateCcw className="w-4 h-4 text-amber-500" />
                <span>RECYCLE BIN</span>
              </Button>

              <Button
                onClick={() => setIsReportModalOpen(true)}
                variant="secondary"
                className="py-2 px-3.5 w-auto! text-xs flex items-center gap-1.5 cursor-pointer font-bold animate-fade-in"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>GENERATE REPORT</span>
              </Button>
            </>
          )}

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            variant="primary"
            className="hidden md:flex py-2 px-3.5 w-auto! text-xs items-center gap-1.5 shadow-md cursor-pointer animate-fade-in"
          >
            <Plus className="w-4 h-4" />
            <span>NEW CHECK-IN</span>
          </Button>
        </div>
      );
    }

    return () => {
      setActions(null);
    };
  }, [role, setActions, activePage]);

  const handleDragEnd = (_event: any, info: any, log: LogRecord) => {
    const swipeThreshold = 80;
    if (info.offset.x > swipeThreshold) {
      setSelectedReceiptLog(log);
      setIsReceiptModalOpen(true);
    } else if (info.offset.x < -swipeThreshold) {
      handleDeleteLog(log);
    }
  };

  // Dynamic View Target Evaluation for Desktop Side arrows
  const showLeftArrow = useMemo(() => {
    return location.pathname === '/members/list' || location.pathname === '/members/plans';
  }, [location.pathname]);

  const showRightArrow = useMemo(() => {
    return location.pathname === '/logbook' || location.pathname === '/members/list';
  }, [location.pathname]);

  const leftArrowTarget = useMemo(() => {
    if (location.pathname === '/members/list') return '/logbook';
    if (location.pathname === '/members/plans') return '/members/list';
    return null;
  }, [location.pathname]);

  const rightArrowTarget = useMemo(() => {
    if (location.pathname === '/logbook') return '/members/list';
    if (location.pathname === '/members/list') return '/members/plans';
    return null;
  }, [location.pathname]);

  const leftArrowLabel = useMemo(() => {
    if (location.pathname === '/members/list') return 'LOGBOOK';
    if (location.pathname === '/members/plans') return 'DIRECTORY';
    return '';
  }, [location.pathname]);

  const rightArrowLabel = useMemo(() => {
    if (location.pathname === '/logbook') return 'DIRECTORY';
    if (location.pathname === '/members/list') return 'PLANS';
    return '';
  }, [location.pathname]);

  const leftArrowSub = useMemo(() => {
    if (location.pathname === '/members/list') return 'View Registry';
    if (location.pathname === '/members/plans') return 'View Setup';
    return '';
  }, [location.pathname]);

  const rightArrowSub = useMemo(() => {
    if (location.pathname === '/logbook') return 'View Setup';
    if (location.pathname === '/members/list') return 'View Setup';
    return '';
  }, [location.pathname]);

  return (
    <div className="relative min-h-[85vh] w-full">
      <TabLoader isVisible={loading} />

      {/* ─── DESKTOP SIDE ARROWS ─── */}
      {isAdmin && (
        <div className="hidden xl:block">
          <AnimatePresence mode="wait">
            {showLeftArrow && leftArrowTarget && (
              <motion.button
                key={`left-arrow-${location.pathname}`}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => navigate(leftArrowTarget)}
                className="group fixed left-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-r border-(--border-color) pl-4 pr-5 py-6 rounded-r-3xl shadow-2xl cursor-pointer flex items-center gap-3 z-45 transition-colors hover:border-(--color-primary-light)/40 hover:bg-(--bg-card)"
              >
                <motion.div 
                  animate={{ x: [0, -4, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <ChevronLeft className="w-5 h-5 text-(--color-primary-light)" />
                </motion.div>
                <div className="text-left">
                  <span className="text-[8px] font-bold text-slate-400 block tracking-widest uppercase leading-none">{leftArrowSub}</span>
                  <span className="font-heading text-[10px] text-(--color-text) tracking-wider uppercase block mt-1 leading-none group-hover:text-(--color-primary-light) transition-colors">{leftArrowLabel}</span>
                </div>
              </motion.button>
            )}

            {showRightArrow && rightArrowTarget && (
              <motion.button
                key={`right-arrow-${location.pathname}`}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 0.9, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => navigate(rightArrowTarget)}
                className="group fixed right-0 top-1/2 -translate-y-1/2 bg-(--bg-card)/90 backdrop-blur-md border-y border-l border-(--border-color) pl-5 pr-4 py-6 rounded-l-3xl shadow-2xl cursor-pointer flex items-center gap-3 z-45 transition-colors hover:border-(--color-primary-light)/40 hover:bg-(--bg-card)"
              >
                <div className="text-right">
                  <span className="text-[8px] font-bold text-slate-400 block tracking-widest uppercase leading-none">{rightArrowSub}</span>
                  <span className="font-heading text-[10px] text-(--color-text) tracking-wider uppercase block mt-1 leading-none group-hover:text-(--color-primary-light) transition-colors">{rightArrowLabel}</span>
                </div>
                <motion.div 
                  animate={{ x: [0, 4, 0] }} 
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <ChevronRight className="w-5 h-5 text-(--color-primary-light)" />
                </motion.div>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── SLIDING TIMELINE CANVAS GRID SCROLLER ─── */}
      <div className="relative w-full h-full min-h-[80vh] overflow-x-clip grid grid-cols-1 items-start">
        
        {/* VIEW 1: LEFT SLIDE (LOGBOOK COUNTER) */}
        <div 
          className="w-full h-full space-y-6 max-w-4xl mx-auto px-1.5 sm:px-8 pb-36"
          style={{
            gridColumn: 1,
            gridRow: 1,
            transform: activePage === 'logbook' 
              ? 'none' 
              : 'translate3d(-101%, 0, 0)',
            opacity: activePage === 'logbook' ? 1 : 0,
            pointerEvents: activePage === 'logbook' ? 'auto' : 'none',
            transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
          }}
        >
          <TimelineBar
            currentWeekStart={currentWeekStart}
            onWeekStartChange={setCurrentWeekStart}
            selectedDayIndex={selectedDayIndex}
            onDayIndexChange={setSelectedDayIndex}
            searchQuery={ledgerSearch}
            onSearchQueryChange={setLedgerSearch}
            activeFilter={customerFilter}
            onFilterChange={setCustomerFilter}
            filterOptions={ATTENDANCE_FILTERS}
            role={role}
            searchPlaceholder="Search members, phone, QR, customer type..."
          />

          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {(() => {
                const hourlyGroups: { label: string; records: LogRecord[] }[] = [];
                
                paginatedLogs.forEach(log => {
                  const rawTime = log.timestamp;
                  let hourLabel = 'Unknown Time';
                  if (rawTime) {
                    try {
                      hourLabel = format(parseISO(rawTime), 'hh:00 a');
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  const existingGroup = hourlyGroups.find(g => g.label === hourLabel);
                  if (existingGroup) {
                    existingGroup.records.push(log);
                  } else {
                    hourlyGroups.push({ label: hourLabel, records: [log] });
                  }
                });

                if (totalItems === 0) {
                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-2xl border border-dashed border-(--border-color) p-12 text-center flex flex-col items-center justify-center bg-(--bg-card) shadow-xs animate-fade-in"
                    >
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-455 dark:text-zinc-650 mb-4 animate-pulse">
                        <ClipboardList className="w-8 h-8" />
                      </div>
                      <h3 className="font-heading text-sm text-(--color-text) tracking-wider">NO CHECK-INS RECORDED</h3>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-body">
                        Attendance records and subscription log sheets are empty for this date.
                      </p>
                    </motion.div>
                  );
                }

                return hourlyGroups.map(group => (
                  <div key={group.label} className="space-y-4 font-body animate-fade-in">
                    <div className="flex items-center gap-3 select-none pt-2">
                      <div className="text-[9px] font-heading font-black tracking-widest text-(--color-primary-light) bg-(--color-primary)/10 border border-(--border-color) px-3 py-1 rounded-full uppercase shrink-0">
                        {group.label}
                      </div>
                      <div className="h-px flex-1 bg-linear-to-r from-(--border-color) to-transparent" />
                    </div>

                    <div className="space-y-2.5">
                      {group.records.map(log => (
                        <TimelineCard
                          key={log.id}
                          mode="attendance"
                          data={log}
                          canDelete={isLogDeletable(log)}
                          onSelectReceipt={(rec) => {
                            setSelectedReceiptLog(rec);
                            setIsReceiptModalOpen(true);
                          }}
                          onTriggerDelete={handleDeleteLog}
                          onTriggerCollectPayment={handleTriggerCollectPayment}
                          onTriggerUndoPayment={handleTriggerUndoPayment}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </AnimatePresence>
          </div>

          {/* Logbook Pagination controls */}
          {totalItems > 0 && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1 py-2 text-xs font-body animate-fade-in">
              <span className="text-slate-500">
                Showing <span className="font-semibold text-(--color-text)">{startIndex + 1}</span> to{' '}
                <span className="font-semibold text-(--color-text)">{Math.min(startIndex + itemsPerPage, totalItems)}</span> of{' '}
                <span className="font-semibold text-(--color-text)">{totalItems}</span> entries
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={clampedPage === 1}
                  className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center h-7 w-7"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`h-7 w-7 rounded-lg font-mono font-bold transition-all cursor-pointer text-[10px] ${
                      clampedPage === page
                        ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                        : 'border border-(--border-color) text-slate-700 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={clampedPage === totalPages}
                  className="p-1 border border-(--border-color) rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center h-7 w-7"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* VIEW 2: RIGHT SLIDE */}
        {role === 'admin' && (
          <div 
            className="w-full h-full pb-36 max-w-full animate-fade-in"
            style={{
              gridColumn: 1,
              gridRow: 1,
              transform: activePage === 'members' ? 'none' : 'translate3d(101%, 0, 0)',
              opacity: activePage === 'members' ? 1 : 0,
              pointerEvents: activePage === 'members' ? 'auto' : 'none',
              transition: 'transform 800ms cubic-bezier(0.77, 0, 0.175, 1), opacity 800ms cubic-bezier(0.77, 0, 0.175, 1)'
            }}
          >
            <MembersList hideHeaderActions={activePage !== 'members'} />
          </div>
        )}

      </div>

      {/* MODALS */}
      {isCreateModalOpen && (
        <LogbookRecordAttendance
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCheckInSuccess={handleCheckInSuccess}
        />
      )}

      {isReceiptModalOpen && selectedReceiptLog && (
        <OfficialReceipt
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setSelectedReceiptLog(null);
            setIsReceiptModalOpen(false);
          }}
          data={{
            receiptType: selectedReceiptLog.customerType === 'New Membership' ? 'subscription' : 'walkin',
            receiptNo: (selectedReceiptLog as any).receipt_no || selectedReceiptLog.id,
            customerName: selectedReceiptLog.customerName || 'Walk-In Guest',
            planType: selectedReceiptLog.categoryOrPlan || 'Daily Pass',
            basePrice: selectedReceiptLog.amountPaid,
            paymentMethod: selectedReceiptLog.paymentMethod,
            transactionDate: selectedReceiptLog.timestamp,
            processedBy: 'WOLF PALOMAR STAFF'
          }}
        />
      )}

      {isRecycleBinOpen && (
        <LogbookRecycleBin
          isOpen={isRecycleBinOpen}
          onClose={() => setIsRecycleBinOpen(false)}
          onRestoreSuccess={() => {
            const saved = localStorage.getItem('palomar_gym_logbook');
            setLogs(saved ? JSON.parse(saved) : []);
          }}
        />
      )}

      {isReportModalOpen && (
        <LogbookReportCompiler
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          logs={logs}
        />
      )}

      {/* DETACHED CONFIRMATION NOTIFIER */}
      <div className="fixed bottom-40 md:bottom-28 lg:bottom-8 left-1/2 -translate-x-1/2 z-3000 flex flex-col gap-2 w-[calc(100vw-24px)] md:w-auto items-center pointer-events-none">
        <AnimatePresence mode="popLayout">
          {pendingDelete && (
            <UndoToast
              isOpen={showUndoToast}
              message={`Removing check-in transaction for "${pendingDelete.customerName}" from database...`}
              duration={5}
              onConfirm={confirmDelete}
              onUndo={undoDelete}
              onClose={() => setShowUndoToast(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* MOBILE STICKY BOTTOM BAR */}
      {activePage === 'logbook' && (
        <>
          <AnimatePresence>
            {isMobileActionsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileActionsOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-35"
              />
            )}
          </AnimatePresence>

          <div className="md:hidden fixed bottom-36 right-6 z-40 flex flex-col items-end gap-3.5">
            <AnimatePresence>
              {isMobileActionsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 15, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.9 }}
                  className="flex flex-col items-end gap-2.5 mb-1 animate-fade-in"
                >
                  {role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => { setIsMobileActionsOpen(false); setIsRecycleBinOpen(true); }}
                      className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-amber-500" />
                      <div className="text-right">
                        <span className="block">Recycle Bin</span>
                        <span className="block text-[7px] text-slate-400 font-sans font-bold capitalize">Clears At End Of Day</span>
                      </div>
                    </button>
                  )}

                  {role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => { setIsMobileActionsOpen(false); setIsReportModalOpen(true); }}
                      className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      <span>Generate Report</span>
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => { setIsMobileActionsOpen(false); setIsCreateModalOpen(true); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 text-slate-100 border border-white/5 text-[9px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-blue-500" />
                    <span>New Check-In</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="md:hidden fixed bottom-16 left-0 right-0 h-20 bg-(--bg-card)/90 backdrop-blur-md border-t border-(--border-color) flex items-center justify-between px-6 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] transition-colors duration-300">
            <div className="space-y-0.5 text-left select-none">
              <span className="text-[9px] font-heading tracking-widest text-slate-400 dark:text-slate-500 uppercase leading-none block">
                TODAY'S LOGBOOK MADE
              </span>
              <span className="text-xl font-heading text-(--color-primary) block leading-none pt-0.5">
                ₱{totalCollectedToday.toFixed(2)}
              </span>
              <span className="text-[9px] font-sans text-slate-500 block leading-none font-semibold">
                Filing Attendance History
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsMobileActionsOpen(!isMobileActionsOpen)}
              className="flex items-center justify-center w-12 h-12 text-white rounded-full cursor-pointer bg-[#10b981] hover:bg-emerald-600 border border-white/10 shadow-lg"
              title="Attendance Actions"
            >
              <Plus className="w-5.5 h-5.5" />
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
};

const INITIAL_LOGS: LogRecord[] = [
  {
    id: 'log-1',
    timestamp: '2026-07-17T08:34:00Z',
    memberId: 'MEM-000001',
    customerName: 'John Dela Cruz',
    customerType: 'Existing Member',
    categoryOrPlan: 'Monthly Plan',
    paymentMethod: 'Free',
    amountPaid: 0,
    paymentStatus: 'Free',
    status: 'Active'
  },
  {
    id: 'log-2',
    timestamp: '2026-07-17T15:15:00Z',
    memberId: null,
    customerName: 'Juan Miguel',
    customerType: 'Walk-In',
    categoryOrPlan: 'Regular Pass',
    paymentMethod: 'GCash',
    amountPaid: 90, 
    paymentStatus: 'Paid',
    status: 'Active'
  },
  {
    id: 'log-3',
    timestamp: '2026-07-17T19:45:00Z',
    memberId: 'MEM-000002',
    customerName: 'Jane Santos',
    customerType: 'Existing Member',
    categoryOrPlan: 'Monthly Plan',
    paymentMethod: 'Free',
    amountPaid: 0,
    paymentStatus: 'Free',
    status: 'Expires Soon'
  }
];

export default LogbookPage;