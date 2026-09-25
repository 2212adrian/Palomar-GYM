// src/pages/reports/IncidentReports.tsx
import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { HeaderActionsContext } from '../../routes';
import { UndoToast, type UndoItem } from '../../components/ui/UndoToast';
import {
  Activity,
  Trash2,
  Archive,
  Check,
  Mail,
  Plus,
  Search,
  X,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  User,
  Calendar,
  Clock,
  Wrench,
  Package,
  Flame,
  AlertOctagon,
  AlertTriangle,
  UserSearch,
  Phone,
  Copy,
  MapPin,
  HeartPulse,
  ShieldAlert,
  Lock,
  Building2,
} from 'lucide-react';
import type { Member } from '../../types/members';

interface IncidentReport {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  staff_name: string;
  title: string;
  description: string;
  tags: string[];
  status: 'Unread' | 'Read';
  priority: 'Low' | 'Medium' | 'High';
  is_archived: boolean;
  read_at: string | null;
  read_by: string | null;
}

interface GymProfileContacts {
  name1: string;
  number1: string;
  name2: string;
  number2: string;
}

const SUGGESTED_TAGS = [
  'Equipment',
  'Facility',
  'Security',
  'Member',
  'Inventory',
  'Maintenance',
  'Emergency',
  'Cleaning',
  'Payment',
  'Complaint',
  'Staff',
  'Other',
];

export const IncidentReports: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const { setActions } = useContext(HeaderActionsContext);

  // Safe, case-insensitive role check
  const roleString = String(
    user?.app_metadata?.role ||
      user?.user_metadata?.role ||
      (user as any)?.role ||
      ''
  )
    .toLowerCase()
    .trim();

  const isAdmin =
    roleString === 'admin' ||
    roleString === 'superadmin' ||
    isSuperAdmin(user?.email);

  // Mount Guard Ref
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // State Management
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Consolidated Multi-Stacked Deletion States
  const [stagedDeletions, setStagedDeletions] = useState<IncidentReport[]>([]);
  const stagedDeletionsRef = useRef<IncidentReport[]>([]);
  stagedDeletionsRef.current = stagedDeletions;

  // Unified Emergency Hub States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyTab, setEmergencyTab] = useState<'members' | 'palomar'>(
    'members'
  );
  const [isLegalExpanded, setIsLegalExpanded] = useState(false);

  // Emergency Member Directory States
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [selectedEmergencyMember, setSelectedEmergencyMember] =
    useState<Member | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Emergency Contacts State (Palomar Owners & Leadership)
  const [contacts, setContacts] = useState<GymProfileContacts>({
    name1: 'Staff Ryan (Palomar Management)',
    number1: '09762607481',
    name2: 'Admin Wolf (Palomar Owner)',
    number2: '09123456789',
  });

  // Modal Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<'Low' | 'Medium' | 'High'>(
    'Medium'
  );
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'All' | 'Unread' | 'Read' | 'Archived'
  >('All');
  const [priorityFilter, setPriorityFilter] = useState<
    'All' | 'Low' | 'Medium' | 'High'
  >('All');
  const [sortOrder] = useState<'Newest' | 'Oldest'>('Newest');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useResponsiveItemsPerPage();

  // Close modal when resizing into desktop mode
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsDetailModalOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openCreateModal = useCallback(() => {
    if (isAdmin) {
      toast.info(
        'Only staff personnel are authorized to submit incident reports.'
      );
      return;
    }
    setIsEditing(false);
    setFormTitle('');
    setFormDescription('');
    setFormPriority('Medium');
    setFormTags([]);
    setShowModal(true);
  }, [isAdmin]);

  // Load members for emergency lookup
  const fetchMembersForLookup = async () => {
    try {
      setLoadingMembers(true);
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .is('deleted_at', null)
        .order('full_name', { ascending: true });
      if (error) throw error;
      if (isMountedRef.current) {
        setAllMembers((data as Member[]) || []);
      }
    } catch (err) {
      console.error('Failed to load members for emergency lookup:', err);
    } finally {
      if (isMountedRef.current) {
        setLoadingMembers(false);
      }
    }
  };

  const openEmergencyHub = (initialTab: 'members' | 'palomar' = 'members') => {
    setEmergencyTab(initialTab);
    setIsLegalExpanded(false);
    setShowEmergencyModal(true);
    fetchMembersForLookup();
  };

  // Filtered members for emergency lookup
  const filteredEmergencyMembers = allMembers.filter((m) => {
    if (!memberSearchTerm.trim()) return true;
    const term = memberSearchTerm.toLowerCase().trim();
    return (
      m.full_name?.toLowerCase().includes(term) ||
      m.member_id?.toLowerCase().includes(term) ||
      m.phone?.toLowerCase().includes(term) ||
      m.email?.toLowerCase().includes(term) ||
      m.emergency_contact_name?.toLowerCase().includes(term) ||
      m.emergency_contact_phone?.toLowerCase().includes(term) ||
      m.parent_name?.toLowerCase().includes(term) ||
      m.parent_phone?.toLowerCase().includes(term)
    );
  });

  const recordAuditLog = async (action: string, details: string) => {
    try {
      await logAudit(action, details);
    } catch {
      // Prevent background errors
    }
  };

  // Track emergency member dossier inspection for NPC / R.A. 10173 compliance
  const handleSelectEmergencyMember = (m: Member) => {
    setSelectedEmergencyMember(m);
    recordAuditLog(
      'EMERGENCY_DOSSIER_ACCESSED',
      `Staff accessed emergency dossier for member "${m.full_name}" (ID: ${m.member_id || m.id}) under R.A. 10173 vital interest protocol.`
    );
  };

  // Top header actions for desktop
  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <button
          onClick={() => openEmergencyHub('members')}
          title="Emergency Hub: Member ICE dossier & Palomar Owner Escalation (Protected under R.A. 10173)"
          aria-label="Emergency Hub"
          className="hidden sm:inline-flex px-3.5 py-2.5 bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 rounded-xl transition-all active:scale-95 cursor-pointer items-center gap-2 shrink-0 font-heading text-xs uppercase tracking-wider font-bold shadow-xs"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 animate-pulse" />
          <span>Emergency Hub</span>
        </button>

        {!isAdmin && (
          <button
            onClick={openCreateModal}
            className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white rounded-xl text-xs font-heading tracking-widest uppercase shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shrink-0 font-bold"
          >
            <Plus className="w-4 h-4" />
            New Report
          </button>
        )}
      </div>
    );
    return () => setActions(null);
  }, [isAdmin, setActions, openCreateModal]);

  useEffect(() => {
    if (location.state?.openIncidentId && reports.length > 0) {
      const target = reports.find(
        (r) => r.id === location.state.openIncidentId
      );
      if (target) {
        setSelectedReport(target);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setIsDetailModalOpen(true);
        }
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, reports]);

  // Fetch Gym Profile contacts
  const fetchEmergencyContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('gym_profile')
        .select(
          'contact_name_1, contact_number_1, contact_name_2, contact_number_2'
        )
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data && isMountedRef.current) {
        setContacts({
          name1: data.contact_name_1 || 'Staff Ryan (Palomar Management)',
          number1: data.contact_number_1 || '09762607481',
          name2: data.contact_name_2 || 'Admin Wolf (Palomar Owner)',
          number2: data.contact_number_2 || '09123456789',
        });
      }
    } catch {
      // Fallback
    }
  };

  // Fetch Incident Reports
  const fetchIncidentReports = useCallback(
    async (silent = false) => {
      const cacheKey = `incident_reports_sanitized_${isAdmin ? 'admin' : user?.id || 'staff'}`;

      if (!silent) {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setReports(parsed);
              setLoading(false);
            }
          } catch {
            // ignore cache parse error
          }
        }
      }

      try {
        if (
          isMountedRef.current &&
          !silent &&
          !sessionStorage.getItem(cacheKey)
        ) {
          setLoading(true);
        }
        let query = supabase.from('incident_reports').select('*');

        if (!isAdmin && user) {
          query = query.eq('created_by', user.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && isMountedRef.current) {
          const typedData = data as IncidentReport[];
          const cachedRaw = sessionStorage.getItem(cacheKey);
          if (cachedRaw !== JSON.stringify(typedData)) {
            setReports(typedData);
            sessionStorage.setItem(cacheKey, JSON.stringify(typedData));
          }
        }
      } catch {
        if (isMountedRef.current) {
          console.warn(
            'INTERNET_ERR: Could not load incident files. Please check connection.'
          );
        }
      } finally {
        if (isMountedRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [isAdmin, user]
  );

  // Realtime subscription
  useEffect(() => {
    fetchEmergencyContacts();
    fetchIncidentReports();

    const cacheKey = `incident_reports_sanitized_${isAdmin ? 'admin' : user?.id || 'staff'}`;

    const channel = supabase
      .channel('incident_reports_realtime_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_reports' },
        (payload) => {
          if (!isMountedRef.current) return;
          sessionStorage.removeItem(cacheKey);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            const report = newRecord as IncidentReport;
            if (!isAdmin && report.created_by !== user?.id) return;
            setReports((prev) => {
              if (prev.some((r) => r.id === report.id)) return prev;
              const updated = [report, ...prev];
              sessionStorage.setItem(cacheKey, JSON.stringify(updated));
              return updated;
            });
          } else if (eventType === 'UPDATE') {
            const updated = newRecord as IncidentReport;
            if (!isAdmin && updated.created_by !== user?.id) return;
            setReports((prev) => {
              const updatedList = prev.map((r) =>
                r.id === updated.id ? updated : r
              );
              sessionStorage.setItem(cacheKey, JSON.stringify(updatedList));
              return updatedList;
            });
            setSelectedReport((prev) =>
              prev?.id === updated.id ? updated : prev
            );
          } else if (eventType === 'DELETE') {
            const targetId = oldRecord.id;
            setReports((prev) => {
              const updatedList = prev.filter((r) => r.id !== targetId);
              sessionStorage.setItem(cacheKey, JSON.stringify(updatedList));
              return updatedList;
            });
            setSelectedReport((prev) => (prev?.id === targetId ? null : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, user?.id, fetchIncidentReports]);

  // Calculate stats counters
  const stats = useMemo(() => {
    return {
      unread: reports.filter((r) => r.status === 'Unread' && !r.is_archived)
        .length,
      read: reports.filter((r) => r.status === 'Read' && !r.is_archived).length,
      archived: reports.filter((r) => r.is_archived).length,
      highPriority: reports.filter(
        (r) => r.priority === 'High' && !r.is_archived
      ).length,
      total: reports.filter((r) => !r.is_archived).length,
    };
  }, [reports]);

  // Filter records
  const filteredReports = reports
    .filter((report) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        query === '' ||
        report.title.toLowerCase().includes(query) ||
        report.staff_name.toLowerCase().includes(query) ||
        report.description.toLowerCase().includes(query) ||
        report.tags.some((t) => t.toLowerCase().includes(query));

      let matchesStatus = true;
      if (statusFilter === 'Unread') {
        matchesStatus = report.status === 'Unread' && !report.is_archived;
      } else if (statusFilter === 'Read') {
        matchesStatus = report.status === 'Read' && !report.is_archived;
      } else if (statusFilter === 'Archived') {
        matchesStatus = report.is_archived;
      } else {
        matchesStatus = !report.is_archived;
      }

      const matchesPriority =
        priorityFilter === 'All' || report.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    })
    .sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortOrder === 'Newest' ? timeB - timeA : timeA - timeB;
    });

  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getGroupedReports = () => {
    const groups: Record<string, IncidentReport[]> = {};
    paginatedReports.forEach((report) => {
      const dateStr = new Date(report.created_at).toLocaleDateString(
        undefined,
        {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }
      );
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(report);
    });
    return groups;
  };

  const handleAddTag = (tag: string) => {
    const cleaned = tag.trim();
    if (!cleaned) return;
    if (formTags.length >= 20) {
      toast.warn('Limit of 20 tags reached.');
      return;
    }
    if (formTags.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      setTagInput('');
      return;
    }
    setFormTags([...formTags, cleaned]);
    setTagInput('');
  };

  const handleRemoveTag = (index: number) => {
    setFormTags(formTags.filter((_, i) => i !== index));
  };

  const openEditModal = (report: IncidentReport) => {
    if (report.status !== 'Unread' || report.is_archived) {
      toast.error('Reviewed or archived incidents cannot be modified.');
      return;
    }
    setIsEditing(true);
    setFormTitle(report.title);
    setFormDescription(report.description);
    setFormPriority(report.priority);
    setFormTags(report.tags);
    setShowModal(true);
  };

  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const titleClean = formTitle.trim();
    const descClean = formDescription.trim();

    if (!titleClean || titleClean.length > 100) {
      toast.error('Title is required and must be under 100 characters.');
      return;
    }
    if (!descClean || descClean.length > 3000) {
      toast.error('Description is required and must be under 3000 characters.');
      return;
    }

    try {
      setSaving(true);
      if (isEditing && selectedReport) {
        const { error } = await supabase
          .from('incident_reports')
          .update({
            title: titleClean,
            description: descClean,
            priority: formPriority,
            tags: formTags,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedReport.id);

        if (error) throw error;

        toast.success('Report updated successfully.');
        const diffs: string[] = [];
        if (selectedReport) {
          if (selectedReport.title !== titleClean)
            diffs.push(`Title: "${selectedReport.title}" -> "${titleClean}"`);
          if (selectedReport.priority !== formPriority)
            diffs.push(
              `Priority: "${selectedReport.priority}" -> "${formPriority}"`
            );
          if (selectedReport.description !== descClean)
            diffs.push('Description updated');
          if (JSON.stringify(selectedReport.tags) !== JSON.stringify(formTags))
            diffs.push(
              `Tags: [${selectedReport.tags?.join(', ') || ''}] -> [${formTags.join(', ')}]`
            );
        }
        const diffStr = diffs.length > 0 ? `: ${diffs.join(', ')}` : '';
        await recordAuditLog(
          'INCIDENT_UPDATED',
          `Updated incident report "${titleClean}"${diffStr}.`
        );
      } else {
        const staffName =
          user?.user_metadata?.full_name ||
          user?.email?.split('@')[0] ||
          'Staff Personnel';
        const { data, error } = await supabase
          .from('incident_reports')
          .insert({
            title: titleClean,
            description: descClean,
            priority: formPriority,
            tags: formTags,
            staff_name: staffName,
            created_by: user?.id,
            status: 'Unread',
            is_archived: false,
          })
          .select()
          .single();

        if (error) throw error;

        toast.success('Report submitted successfully.');
        if (data) {
          await recordAuditLog(
            'INCIDENT_CREATED',
            `Filed incident report "${titleClean}" with ${formPriority} priority by ${staffName}.`
          );
        }
      }

      setShowModal(false);
      sessionStorage.removeItem(
        `incident_reports_sanitized_${isAdmin ? 'admin' : user?.id || 'staff'}`
      );
      fetchIncidentReports();
    } catch {
      toast.error('Submission failed. Please verify your data.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: 'Unread' | 'Read') => {
    try {
      const target = reports.find((r) => r.id === id);
      const { error } = await supabase
        .from('incident_reports')
        .update({
          status,
          read_at: status === 'Read' ? new Date().toISOString() : null,
          read_by: status === 'Read' ? user?.id : null,
        })
        .eq('id', id);

      if (error) throw error;

      await recordAuditLog(
        status === 'Read' ? 'INCIDENT_RESOLVED' : 'INCIDENT_UPDATED',
        `Incident report "${target?.title || 'Report'}" Status: "${target?.status || 'Unread'}" -> "${status}".`
      );

      if (selectedReport?.id === id) {
        setSelectedReport((prev) =>
          prev
            ? {
                ...prev,
                status,
                read_at: status === 'Read' ? new Date().toISOString() : null,
              }
            : null
        );
      }

      setReports((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                read_at: status === 'Read' ? new Date().toISOString() : null,
              }
            : r
        )
      );
    } catch {
      toast.error('Failed to change status attributes.');
    }
  };

  const handleSelectReport = async (report: IncidentReport) => {
    if (selectedReport?.id === report.id) {
      setSelectedReport(null);
      setIsDetailModalOpen(false);
    } else {
      setSelectedReport(report);
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsDetailModalOpen(true);
      } else {
        setIsDetailModalOpen(false);
      }

      if (isAdmin && report.status === 'Unread' && !report.is_archived) {
        await updateStatus(report.id, 'Read');
      }
    }
  };

  // Stackable Multi-Undo & Commit Controllers
  const handleConfirmDelete = useCallback(async (id: string) => {
    const stagedReport = stagedDeletionsRef.current.find(
      (r) => String(r.id) === String(id)
    );
    if (!stagedReport) return;

    try {
      const { error } = await supabase
        .from('incident_reports')
        .delete()
        .eq('id', stagedReport.id);

      if (error) throw error;

      await recordAuditLog(
        'INCIDENT_DELETED',
        `Deleted incident report "${stagedReport.title}".`
      );
      toast.success(`Report "${stagedReport.title}" deleted.`);
    } catch {
      toast.error('Deletion failure. Restoring report file.');
      setReports((prev) =>
        [stagedReport, ...prev].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } finally {
      setStagedDeletions((prev) =>
        prev.filter((r) => String(r.id) !== String(id))
      );
    }
  }, []);

  const handleUndoDelete = (id: string) => {
    const stagedReport = stagedDeletionsRef.current.find(
      (r) => String(r.id) === String(id)
    );
    if (!stagedReport) return;

    setReports((prev) =>
      [
        stagedReport,
        ...prev.filter((item) => String(item.id) !== String(id)),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    );
    setStagedDeletions((prev) =>
      prev.filter((item) => String(item.id) !== String(id))
    );
    toast.info(`Restored report "${stagedReport.title}".`);
  };

  const handleConfirmAll = () => {
    if (stagedDeletionsRef.current.length === 0) return;
    const itemsToCommit = [...stagedDeletionsRef.current];
    itemsToCommit.forEach((report) => handleConfirmDelete(String(report.id)));
  };

  const handleUndoAll = () => {
    if (stagedDeletionsRef.current.length === 0) return;
    const itemsToRestore = [...stagedDeletionsRef.current];
    setReports((prev) => {
      const existingIds = new Set(itemsToRestore.map((r) => String(r.id)));
      const filtered = prev.filter((r) => !existingIds.has(String(r.id)));
      return [...itemsToRestore, ...filtered].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    setStagedDeletions([]);
    toast.info(`Restored all ${itemsToRestore.length} incident reports.`);
  };

  const startPendingDelete = (report: IncidentReport) => {
    if (!isAdmin && (report.status !== 'Unread' || report.is_archived)) {
      toast.error('Reviewed or archived incidents cannot be deleted.');
      return;
    }

    setStagedDeletions((prev) => [...prev, report]);
    setReports((prev) => prev.filter((r) => r.id !== report.id));

    if (selectedReport?.id === report.id) {
      setSelectedReport(null);
      setIsDetailModalOpen(false);
    }
  };

  useEffect(() => {
    return () => {
      if (stagedDeletionsRef.current.length > 0) {
        stagedDeletionsRef.current.forEach((report) => {
          supabase.from('incident_reports').delete().eq('id', report.id).then();
        });
      }
    };
  }, []);

  const toggleArchive = async (id: string, archiveState: boolean) => {
    try {
      const target = reports.find((r) => r.id === id);
      const { error } = await supabase
        .from('incident_reports')
        .update({ is_archived: archiveState })
        .eq('id', id);

      if (error) throw error;

      toast.success(
        archiveState
          ? 'Report moved to archives.'
          : 'Report restored to workspace.'
      );
      await recordAuditLog(
        archiveState ? 'INCIDENT_ARCHIVED' : 'INCIDENT_RESTORED',
        `${archiveState ? 'Archived' : 'Restored'} incident report "${target?.title || 'Report'}".`
      );

      if (selectedReport?.id === id) {
        setSelectedReport((prev) =>
          prev ? { ...prev, is_archived: archiveState } : null
        );
      }
      setIsDetailModalOpen(false);
      fetchIncidentReports();
    } catch {
      toast.error('Archiving operation failure.');
    }
  };

  const handleBulkAction = async (
    action: 'Read' | 'Unread' | 'Archive' | 'Delete'
  ) => {
    if (selectedIds.length === 0) return;

    const targetReports = reports.filter((r) => selectedIds.includes(r.id));
    const targetTitles = targetReports.map((r) => r.title).join(', ');

    try {
      setLoading(true);
      if (action === 'Delete') {
        const { error } = await supabase
          .from('incident_reports')
          .delete()
          .in('id', selectedIds);
        if (error) throw error;
        toast.success(`Successfully removed ${selectedIds.length} reports.`);
        await recordAuditLog(
          'INCIDENT_DELETED',
          `Deleted ${selectedIds.length} incident reports: ${targetTitles}.`
        );
      } else if (action === 'Archive') {
        const { error } = await supabase
          .from('incident_reports')
          .update({ is_archived: true })
          .in('id', selectedIds);
        if (error) throw error;
        toast.success(`Successfully archived ${selectedIds.length} reports.`);
        await recordAuditLog(
          'INCIDENT_ARCHIVED',
          `Archived ${selectedIds.length} incident reports: ${targetTitles}.`
        );
      } else {
        const { error } = await supabase
          .from('incident_reports')
          .update({
            status: action,
            read_at: action === 'Read' ? new Date().toISOString() : null,
            read_by: action === 'Read' ? user?.id : null,
          })
          .in('id', selectedIds);
        if (error) throw error;
        toast.success(`Successfully updated ${selectedIds.length} reports.`);
        await recordAuditLog(
          'INCIDENT_UPDATED',
          `Marked ${selectedIds.length} incident reports as ${action === 'Read' ? 'Reviewed' : 'Unread'}: ${targetTitles}.`
        );
      }
      setSelectedIds([]);
      fetchIncidentReports();
    } catch {
      toast.error('Failed to perform bulk operations.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getTagIcon = (tag: string) => {
    switch (tag.toLowerCase()) {
      case 'maintenance':
      case 'equipment':
        return <Wrench className="w-3 h-3" />;
      case 'inventory':
        return <Package className="w-3 h-3" />;
      case 'emergency':
        return <Flame className="w-3 h-3" />;
      case 'security':
        return <AlertOctagon className="w-3 h-3" />;
      default:
        return <TagIcon />;
    }
  };

  const undoToastItems: UndoItem[] = useMemo(() => {
    return stagedDeletions.map((report) => ({
      id: String(report.id),
      title: report.title,
      type: 'general',
      extraInfo: `${report.priority} Priority • Filed by ${report.staff_name}`,
      timestamp: report.created_at,
    }));
  }, [stagedDeletions]);

  const renderDetailPanelContent = (
    report: IncidentReport,
    isModalContext = false
  ) => {
    return (
      <div className="space-y-6 text-xs relative">
        <div
          className={`absolute -top-5 -left-5 -right-5 h-1.5 rounded-t-2xl ${
            report.priority === 'High'
              ? 'bg-red-500'
              : report.priority === 'Medium'
                ? 'bg-amber-500'
                : 'bg-green-500'
          }`}
        />
        <div
          className={`flex items-start justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-4 ${
            isModalContext ? 'pr-10' : ''
          }`}
        >
          <div className="space-y-1.5 flex-1 min-w-0">
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-heading tracking-widest uppercase ${
                report.priority === 'High'
                  ? 'bg-red-500/10 text-red-500'
                  : report.priority === 'Medium'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-green-500/10 text-green-500'
              }`}
            >
              {report.priority} Priority
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
              {report.title}
            </h2>
            <div className="flex flex-wrap items-center gap-3.5 text-xs text-slate-400 pt-0.5">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {report.staff_name}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {new Date(report.created_at).toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {new Date(report.created_at).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading tracking-widest uppercase ${
                report.status === 'Unread' && !report.is_archived
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                  : 'bg-green-500/10 text-green-500 border border-green-500/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  report.status === 'Unread' && !report.is_archived
                    ? 'bg-red-500'
                    : 'bg-green-500'
                }`}
              />
              {report.is_archived
                ? 'Archived'
                : report.status === 'Unread'
                  ? 'New'
                  : 'Reviewed'}
            </span>

            {!isModalContext && (
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Unselect current report file"
                aria-label="Unselect current report file"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {report.tags && report.tags.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Incident Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {report.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 text-[10px] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider"
                >
                  {getTagIcon(tag)}
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 bg-slate-50/50 dark:bg-[#12141a]/50 border border-slate-200/40 dark:border-white/5 p-4 rounded-2xl">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Description
          </h4>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap wrap-break-word">
            {report.description}
          </p>
        </div>

        {/* Actions panel according to Role */}
        <div className="border-t border-slate-100 dark:border-white/5 pt-4">
          {isAdmin ? (
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Admin Controls
              </h4>

              <div className="grid grid-cols-3 gap-2">
                {report.status === 'Unread' ? (
                  <button
                    type="button"
                    onClick={() => updateStatus(report.id, 'Read')}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Reviewed</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateStatus(report.id, 'Unread')}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Unread</span>
                  </button>
                )}

                {!report.is_archived ? (
                  <button
                    type="button"
                    onClick={() => toggleArchive(report.id, true)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 border border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Archive</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleArchive(report.id, false)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Restore</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => startPendingDelete(report)}
                  className="flex items-center justify-center gap-1.5 py-2 px-2 border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Delete</span>
                </button>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/60 dark:border-white/5 rounded-xl flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                <Info className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                <span>
                  Status changes sync with staff. Archived reports can be
                  retrieved anytime.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Staff Actions
              </h4>
              {report.status === 'Unread' && !report.is_archived ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isModalContext) setIsDetailModalOpen(false);
                      openEditModal(report);
                    }}
                    className="flex items-center justify-center px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:opacity-90 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Edit Details
                  </button>
                  <button
                    type="button"
                    onClick={() => startPendingDelete(report)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>Delete Report</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-white/5 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#123c73] dark:text-[#bf0202]" />
                  <span>
                    This incident report has been reviewed or archived by gym
                    management and is now locked from further edits or deletion.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-2 pb-36 sm:pb-24 lg:pb-8 animate-fade-in relative min-h-[85vh] w-full">
      {/* Main Dashboard Workspace */}
      <div className="flex flex-col lg:flex-row gap-6 items-start w-full max-w-7xl mx-auto">
        {/* Left Column: Directory List Section */}
        <div
          className={`transition-all duration-300 ease-in-out space-y-4 w-full ${
            selectedReport ? 'lg:w-[42%] shrink-0' : 'w-full max-w-5xl mx-auto'
          }`}
        >
          {/* Queue Alert for Admins if >= 10 unread */}
          {isAdmin && stats.unread >= 10 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-2 font-medium animate-slide-up">
              <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce text-amber-500" />
              <span>
                Queue Alert: You have {stats.unread} unread incident reports
                requiring admin review.
              </span>
            </div>
          )}

          <div className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                placeholder="Search by title, staff name, description..."
                title="Search reports"
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] outline-none transition-all"
              />
            </div>

            {/* Quick Filters & Select All Checkbox */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-white/5 pt-3">
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                {/* Unified Select All Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={
                      paginatedReports.length > 0 &&
                      paginatedReports.every((r) => selectedIds.includes(r.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(paginatedReports.map((r) => r.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] dark:accent-[#bf0202]"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Select All
                  </span>
                </label>

                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 min-w-0">
                  {(['All', 'Unread', 'Read', 'Archived'] as const).map(
                    (filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          setStatusFilter(filter);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-heading tracking-wider uppercase transition-all shrink-0 cursor-pointer ${
                          statusFilter === filter
                            ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-[#1e232d] text-slate-500 dark:text-slate-400 hover:opacity-80'
                        }`}
                      >
                        {filter}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <label htmlFor="priority-filter-select" className="sr-only">
                  Priority Filter
                </label>
                <select
                  id="priority-filter-select"
                  title="Filter reports by priority level"
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="bg-slate-100 dark:bg-[#1e232d] border-none text-[10px] text-slate-500 dark:text-slate-400 font-heading tracking-wider uppercase rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#123c73] dark:focus:ring-[#bf0202] outline-none cursor-pointer"
                >
                  <option value="All">All Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bulk Select Action Bar */}
          {selectedIds.length > 0 && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold animate-scale-up">
              <span className="text-blue-600 dark:text-blue-400 font-mono">
                {selectedIds.length} Selected
              </span>
              <div className="flex gap-1 flex-wrap">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => handleBulkAction('Read')}
                      title="Mark as Read"
                      className="px-2 py-1 bg-green-500/10 text-green-600 border border-green-500/20 hover:bg-green-500/20 rounded-lg text-[9px] cursor-pointer font-bold uppercase transition-colors"
                    >
                      Read
                    </button>
                    <button
                      onClick={() => handleBulkAction('Unread')}
                      title="Reopen selected"
                      className="px-2 py-1 bg-slate-500/10 text-slate-600 border border-slate-500/20 hover:bg-slate-500/20 rounded-lg text-[9px] cursor-pointer font-bold uppercase transition-colors"
                    >
                      Unread
                    </button>
                    <button
                      onClick={() => handleBulkAction('Archive')}
                      title="Archive selected"
                      className="px-2 py-1 bg-blue-500/10 text-blue-600 border border-blue-500/20 hover:bg-blue-500/20 rounded-lg text-[9px] cursor-pointer font-bold uppercase transition-colors"
                    >
                      Archive
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleBulkAction('Delete')}
                  title="Delete selected"
                  className="px-2 py-1 bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-[9px] cursor-pointer font-bold uppercase transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Directory lists styled in dynamic timeline groups */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="p-4 bg-white/50 dark:bg-[#161920]/50 border border-slate-200 dark:border-white/5 rounded-2xl animate-pulse space-y-3"
                >
                  <div className="flex justify-between">
                    <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-2/3" />
                    <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-1/6" />
                  </div>
                  <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : paginatedReports.length === 0 ? (
            <div className="py-12 px-6 bg-white dark:bg-[#161920] border border-dashed border-slate-200 dark:border-white/5 rounded-2xl text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-xs uppercase tracking-widest text-slate-800 dark:text-slate-200">
                No incident reports
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                {isAdmin
                  ? 'Reports submitted by your staff matching your active filters will appear here.'
                  : "You haven't submitted any incident reports matching the active filters."}
              </p>

              {!isAdmin && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-3 px-4 py-2 bg-[#123c73] dark:bg-[#bf0202] text-white rounded-xl font-heading text-[11px] font-bold uppercase tracking-wider cursor-pointer shadow-md hover:opacity-90 transition-all inline-flex items-center gap-2 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>FILE NEW REPORT</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(getGroupedReports()).map(
                ([dateLabel, groupReports]) => (
                  <div key={dateLabel} className="space-y-3 relative">
                    <div className="flex items-center gap-2 py-1 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#123c73] dark:bg-[#bf0202]" />
                      <span className="text-[9px] font-heading tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase">
                        {dateLabel}
                      </span>
                      <div className="flex-1 h-px bg-slate-200/50 dark:bg-white/5" />
                    </div>

                    {groupReports.map((report) => {
                      const isSelected = selectedReport?.id === report.id;
                      const isHigh = report.priority === 'High';

                      return (
                        <div
                          key={report.id}
                          onClick={() => handleSelectReport(report)}
                          className={`relative p-4 border rounded-2xl cursor-pointer transition-all shadow-xs flex items-start gap-3.5 overflow-hidden group ${
                            isSelected
                              ? 'bg-[#123c73]/5 dark:bg-[#bf0202]/5 border-[#123c73] dark:border-[#bf0202]'
                              : 'bg-white dark:bg-[#161920] border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/15'
                          }`}
                        >
                          <div
                            className={`absolute top-0 left-0 bottom-0 w-1 ${
                              report.priority === 'High'
                                ? 'bg-red-500'
                                : report.priority === 'Medium'
                                  ? 'bg-amber-500'
                                  : 'bg-green-500'
                            }`}
                          />

                          <div
                            className="pt-1 select-none shrink-0 z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(report.id)}
                              onChange={() =>
                                handleToggleSelect(report.id, {
                                  stopPropagation: () => {},
                                } as any)
                              }
                              title={`Select report: ${report.title}`}
                              aria-label={`Select report: ${report.title}`}
                              className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] dark:accent-[#bf0202]"
                            />
                          </div>

                          <div className="pl-1.5 flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#123c73] dark:group-hover:text-[#bf0202] transition-colors leading-snug line-clamp-1">
                                {report.title}
                              </h4>
                              <span
                                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ${
                                  isHigh
                                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    : report.priority === 'Medium'
                                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                      : 'bg-green-500/10 text-green-500 border border-green-500/20'
                                }`}
                              >
                                {report.priority}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-medium">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {report.staff_name}
                              </span>
                              <span>•</span>
                              <span>
                                {new Date(report.created_at).toLocaleDateString(
                                  undefined,
                                  { month: 'short', day: 'numeric' }
                                )}
                              </span>
                              <span>•</span>
                              <span
                                className={`font-semibold ${report.is_archived ? 'text-amber-500' : report.status === 'Unread' ? 'text-red-500' : 'text-slate-400'}`}
                              >
                                {report.is_archived
                                  ? 'Archived'
                                  : report.status === 'Unread'
                                    ? 'New'
                                    : 'Reviewed'}
                              </span>
                            </div>

                            {report.tags && report.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2.5">
                                {report.tags.slice(0, 3).map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/5 text-[8px] text-slate-500 font-semibold uppercase tracking-wider"
                                  >
                                    {getTagIcon(tag)}
                                    {tag}
                                  </span>
                                ))}
                                {report.tags.length > 3 && (
                                  <span className="text-[8px] text-slate-400 font-bold self-center">
                                    +{report.tags.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-white/5 pt-4 text-xs">
              <span className="text-slate-400 font-medium text-[11px] text-center sm:text-left">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                {Math.min(currentPage * itemsPerPage, totalItems)} of{' '}
                {totalItems} reports
              </span>
              <div className="flex gap-1.5 items-center">
                <button
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  title="Previous Page"
                  aria-label="Previous Page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161920] disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(idx + 1)}
                      title={`Go to page ${idx + 1}`}
                      className={`w-7 h-7 rounded-lg text-[10px] font-heading tracking-widest transition-all cursor-pointer ${
                        currentPage === idx + 1
                          ? 'bg-[#123c73] dark:bg-[#bf0202] text-white'
                          : 'bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 hover:bg-slate-50'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  title="Next Page"
                  aria-label="Next Page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161920] disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Desktop Inline Detail Panel */}
        <div
          className={`transition-all duration-300 ease-in-out hidden lg:block overflow-hidden ${
            selectedReport
              ? 'opacity-100 translate-x-0 lg:w-[58%] shrink-0 h-auto'
              : 'opacity-0 translate-x-4 w-0 h-0 pointer-events-none'
          }`}
        >
          <div className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-6 shadow-xs relative">
            {selectedReport && renderDetailPanelContent(selectedReport, false)}
          </div>
        </div>
      </div>

      {/* Reusable Consolidated Multi-Stacked Countdown Toast */}
      <UndoToast
        items={undoToastItems}
        duration={5}
        onUndoItem={handleUndoDelete}
        onConfirmItem={handleConfirmDelete}
        onUndoAll={handleUndoAll}
        onConfirmAll={handleConfirmAll}
      />

      {/* Mobile & Tablet Detail Modal Overlay (< 1024px) */}
      {isDetailModalOpen &&
        selectedReport &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => {
                setSelectedReport(null);
                setIsDetailModalOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-6 shadow-2xl relative w-full max-w-lg max-h-[90vh] overflow-y-auto z-10"
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedReport(null);
                  setIsDetailModalOpen(false);
                }}
                className="absolute top-4 right-4 z-20 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Close report modal"
              >
                <X className="w-4 h-4" />
              </button>

              {renderDetailPanelContent(selectedReport, true)}
            </motion.div>
          </div>,
          document.body
        )}

      {/* ─── MOBILE-FIRST UNIFIED EMERGENCY HUB MODAL (PORTALED) ─── */}
      {showEmergencyModal &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEmergencyModal(false);
                setSelectedEmergencyMember(null);
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, y: 25, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 25, scale: 0.98 }}
              className="bg-white dark:bg-[#161920] border-t sm:border border-slate-200 dark:border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-4xl shadow-2xl relative z-10 overflow-hidden h-[92vh] sm:h-[88vh] flex flex-col"
            >
              {/* Emergency Header */}
              <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50/70 dark:bg-black/20 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-heading text-xs sm:text-sm font-bold tracking-wider uppercase text-slate-900 dark:text-slate-100 leading-tight">
                      Emergency Operations & Directory
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[210px] sm:max-w-none">
                      Palomar Gym Owner hotlines & Member ICE dossiers
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowEmergencyModal(false);
                    setSelectedEmergencyMember(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
                  title="Close Emergency Hub"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ─── COMPACT COLLAPSIBLE LEGAL BANNER (R.A. 10173) ─── */}
              <div className="bg-amber-500/10 dark:bg-amber-950/20 border-b border-amber-500/20 shrink-0 transition-colors">
                <button
                  type="button"
                  onClick={() => setIsLegalExpanded(!isLegalExpanded)}
                  className="w-full px-4 sm:px-6 py-2 flex items-center justify-between text-left gap-2 cursor-pointer hover:bg-amber-500/15 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">
                      R.A. 10173 (Data Privacy Act) Confidentiality Guard
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 uppercase tracking-wider shrink-0 underline ml-2">
                    {isLegalExpanded ? 'Hide' : 'View'} Notice
                    {isLegalExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </span>
                </button>

                <AnimatePresence>
                  {isLegalExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden px-4 sm:px-6 pb-3 pt-1 border-t border-amber-500/10 text-[10px] sm:text-[11px] text-amber-900/90 dark:text-amber-200/90 space-y-1.5 leading-relaxed"
                    >
                      <p>
                        Member contact and medical records are classified as
                        Protected & Sensitive Personal Information (SPI) under
                        Philippine law.
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>
                          <strong>Lawful Processing (Sec. 12/13):</strong>{' '}
                          Access is strictly authorized only for immediate
                          threats to life, health, or physical safety.
                        </li>
                        <li>
                          <strong>Prohibition:</strong> Copying, screenshotting,
                          or sharing member numbers and medical notes is
                          illegal.
                        </li>
                        <li>
                          <strong>Criminal Penalties (Sec. 25–32):</strong>{' '}
                          Violators face up to 6 years imprisonment and fines up
                          to ₱5,000,000. All queries are audited and logged.
                        </li>
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ─── STREAMLINED MOBILE-FIRST TABS ─── */}
              <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0">
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 dark:bg-[#12141a] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEmergencyTab('members')}
                    className={`py-2 px-2 rounded-lg font-heading text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      emergencyTab === 'members'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <UserSearch className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Member ICE Dossier</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEmergencyTab('palomar');
                      setSelectedEmergencyMember(null);
                    }}
                    className={`py-2 px-2 rounded-lg font-heading text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      emergencyTab === 'palomar'
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Palomar Owners</span>
                  </button>
                </div>
              </div>

              {/* ─── TAB 1: MEMBER DIRECTORY & EMERGENCY DOSSIER ─── */}
              {emergencyTab === 'members' && (
                <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col md:grid md:grid-cols-12">
                  {/* Left Pane: Search & List (Hidden on mobile if a member is active) */}
                  <div
                    className={`md:col-span-5 md:border-r border-slate-200 dark:border-white/5 p-3.5 sm:p-4 flex-col gap-2.5 min-h-0 bg-slate-50/30 dark:bg-black/10 h-full ${
                      selectedEmergencyMember ? 'hidden md:flex' : 'flex'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        autoFocus
                        value={memberSearchTerm}
                        onChange={(e) => setMemberSearchTerm(e.target.value)}
                        placeholder="Search member name, ID, phone..."
                        className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                      {memberSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setMemberSearchTerm('')}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-1 shrink-0 flex items-center justify-between">
                      <span>{filteredEmergencyMembers.length} Members</span>
                      {loadingMembers && (
                        <span className="animate-pulse text-emerald-500">
                          Loading...
                        </span>
                      )}
                    </div>

                    {/* Scrollable Member Directory */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 pb-4">
                      {filteredEmergencyMembers.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                          <User className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 opacity-60 mb-2" />
                          <p className="font-semibold">
                            No member matches found
                          </p>
                          <p className="text-[11px]">
                            Search by name, ID number, or phone.
                          </p>
                        </div>
                      ) : (
                        filteredEmergencyMembers.map((m) => {
                          const isSelected =
                            selectedEmergencyMember?.id === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={() => handleSelectEmergencyMember(m)}
                              className={`p-3 rounded-xl border text-left cursor-pointer transition-all active:scale-[0.99] ${
                                isSelected
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-100 shadow-xs'
                                  : 'bg-white dark:bg-[#1e232d] border-slate-200/80 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                                {m.full_name}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center justify-between">
                                <span>ID: {m.member_id}</span>
                                <span>{m.phone || 'No direct phone'}</span>
                              </div>
                              {m.emergency_contact_name && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-white/5 text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                  <span className="truncate">
                                    ICE: {m.emergency_contact_name} (
                                    {m.relationship || 'Contact'})
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Pane: Selected Member Profile */}
                  <div
                    className={`md:col-span-7 p-3.5 sm:p-5 flex-col min-h-0 overflow-y-auto space-y-3.5 h-full ${
                      !selectedEmergencyMember ? 'hidden md:flex' : 'flex'
                    }`}
                  >
                    {/* Mobile Back Button */}
                    {selectedEmergencyMember && (
                      <button
                        type="button"
                        onClick={() => setSelectedEmergencyMember(null)}
                        className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold font-heading uppercase tracking-wider self-start cursor-pointer active:scale-95"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Back to Directory</span>
                      </button>
                    )}

                    {selectedEmergencyMember ? (
                      <div className="space-y-3.5 pb-6">
                        {/* Member Identity Header (No status displayed) */}
                        <div className="p-3.5 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-200/80 dark:border-white/5 flex items-start gap-3">
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center font-heading font-black text-base shrink-0 shadow-xs">
                            {selectedEmergencyMember.full_name?.charAt(0) ||
                              'M'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                              {selectedEmergencyMember.full_name}
                            </h4>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              ID:{' '}
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {selectedEmergencyMember.member_id}
                              </span>
                              {selectedEmergencyMember.gender && (
                                <span> • {selectedEmergencyMember.gender}</span>
                              )}
                              {selectedEmergencyMember.birthday && (
                                <span>
                                  {' '}
                                  • Born: {selectedEmergencyMember.birthday}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* In Case of Emergency (ICE) Card */}
                        <div className="p-3.5 sm:p-4 bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 rounded-2xl space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 font-heading">
                            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            <span>In Case of Emergency (ICE)</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5 text-xs">
                            <div className="p-3 bg-white/80 dark:bg-black/30 rounded-xl border border-rose-500/20">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Contact Name
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm mt-0.5 block truncate">
                                {selectedEmergencyMember.emergency_contact_name ||
                                  'Not Provided'}
                              </span>
                              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                Relationship:{' '}
                                {selectedEmergencyMember.relationship ||
                                  'Not Specified'}
                              </span>
                            </div>

                            <div className="p-3 bg-white/80 dark:bg-black/30 rounded-xl border border-rose-500/20">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Emergency Hotline
                              </span>
                              {selectedEmergencyMember.emergency_contact_phone ? (
                                <div className="flex items-center justify-between gap-1.5 mt-1">
                                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate">
                                    {
                                      selectedEmergencyMember.emergency_contact_phone
                                    }
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <a
                                      href={`tel:${selectedEmergencyMember.emergency_contact_phone}`}
                                      className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors inline-flex items-center"
                                      title="Call Emergency Contact"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(
                                          selectedEmergencyMember.emergency_contact_phone ||
                                            ''
                                        );
                                        toast.success(
                                          'Emergency phone copied to clipboard'
                                        );
                                      }}
                                      className="p-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                                      title="Copy Phone"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs mt-1 block italic">
                                  No phone recorded
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Minor Member Parent / Guardian Record */}
                          {(selectedEmergencyMember.parent_name ||
                            selectedEmergencyMember.parent_phone) && (
                            <div className="pt-2 border-t border-rose-500/20 text-xs">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                Parent / Legal Guardian (Minor Member)
                              </span>
                              <div className="p-2.5 bg-white/80 dark:bg-black/30 rounded-xl border border-rose-500/20 flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {selectedEmergencyMember.parent_name ||
                                      'Parent'}
                                  </span>
                                  {selectedEmergencyMember.parent_relationship && (
                                    <span className="text-[11px] text-slate-400 ml-1.5">
                                      (
                                      {
                                        selectedEmergencyMember.parent_relationship
                                      }
                                      )
                                    </span>
                                  )}
                                </div>
                                {selectedEmergencyMember.parent_phone && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-xs">
                                      {selectedEmergencyMember.parent_phone}
                                    </span>
                                    <a
                                      href={`tel:${selectedEmergencyMember.parent_phone}`}
                                      className="p-1 bg-rose-600 text-white rounded-md hover:bg-rose-700"
                                      title="Call Parent"
                                    >
                                      <Phone className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Direct Member Contacts & Residence */}
                        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-2xl space-y-3 text-xs">
                          <h5 className="font-heading font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400">
                            Member Direct Communication & Residence
                          </h5>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="p-2.5 bg-slate-50 dark:bg-black/20 rounded-xl flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">
                                  Member Mobile
                                </span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {selectedEmergencyMember.phone || 'None'}
                                </span>
                              </div>
                              {selectedEmergencyMember.phone && (
                                <a
                                  href={`tel:${selectedEmergencyMember.phone}`}
                                  className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors inline-flex"
                                  title="Call Member"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>

                            <div className="p-2.5 bg-slate-50 dark:bg-black/20 rounded-xl flex items-center justify-between">
                              <div className="min-w-0 pr-1">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">
                                  Email Address
                                </span>
                                <span className="text-slate-900 dark:text-slate-100 font-medium truncate block">
                                  {selectedEmergencyMember.email ||
                                    'None registered'}
                                </span>
                              </div>
                              {selectedEmergencyMember.email && (
                                <a
                                  href={`mailto:${selectedEmergencyMember.email}`}
                                  className="p-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 rounded-lg inline-flex"
                                  title="Email Member"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>

                          {selectedEmergencyMember.address && (
                            <div className="p-2.5 bg-slate-50 dark:bg-black/20 rounded-xl flex items-start gap-2 text-xs">
                              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">
                                  Home Address
                                </span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {selectedEmergencyMember.address}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Medical & Physical Health Notes (Protected SPI) */}
                        <div className="p-3.5 sm:p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/30 rounded-2xl space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 font-heading">
                              <HeartPulse className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>Medical & Health Limitations</span>
                            </div>
                            <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                              SPI • Sec. 13
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-[#161920] p-3 rounded-xl border border-slate-200/60 dark:border-white/5">
                            {selectedEmergencyMember.notes ||
                              'No declared health conditions, allergies, or physical restrictions recorded on member file.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                          <UserSearch className="w-7 h-7 text-slate-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                            No Member Selected
                          </h4>
                          <p className="text-xs text-slate-400 mt-1 max-w-xs">
                            Select a member from the directory list to view
                            their emergency dossier.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── TAB 2: PALOMAR GYM OWNERS & MANAGEMENT FAMILY ─── */}
              {emergencyTab === 'palomar' && (
                <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
                  <div className="p-3.5 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-200/80 dark:border-white/5 space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-heading font-bold text-xs uppercase tracking-wider">
                      <Building2 className="w-4 h-4 text-[#123c73] dark:text-[#bf0202]" />
                      <span>Executive Escalation: Palomar Gym Owners</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs">
                      The contacts below are the registered owners of Palomar
                      Gym and the executive family. Call them immediately for
                      severe emergencies, structural hazards, or police
                      escalations after contacting 911.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {contacts.name1 && (
                      <div className="p-4 bg-white dark:bg-[#1e232d] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-heading font-bold text-xs">
                            1
                          </div>
                          <span className="text-[9px] font-heading font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            Primary Escalation
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                            Gym Management / Family Leadership
                          </p>
                          <p className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 mt-0.5">
                            {contacts.name1}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-sm text-[#123c73] dark:text-red-400">
                            {contacts.number1}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${contacts.number1}`}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  contacts.number1 || ''
                                );
                                toast.success(
                                  'Primary owner phone copied to clipboard'
                                );
                              }}
                              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
                              title="Copy Phone"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {contacts.name2 && (
                      <div className="p-4 bg-white dark:bg-[#1e232d] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-heading font-bold text-xs">
                            2
                          </div>
                          <span className="text-[9px] font-heading font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            Secondary Owner
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                            Gym Owner / Executive Director
                          </p>
                          <p className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 mt-0.5">
                            {contacts.name2}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-sm text-[#123c73] dark:text-red-400">
                            {contacts.number2}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${contacts.number2}`}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  contacts.number2 || ''
                                );
                                toast.success(
                                  'Secondary owner phone copied to clipboard'
                                );
                              }}
                              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
                              title="Copy Phone"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Standard On-Duty Emergency Procedure */}
                  <div className="p-3.5 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-200/80 dark:border-white/5 space-y-1.5 text-xs">
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px] font-heading">
                      Standard Emergency Sequence:
                    </h5>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                      <li>
                        <strong>Life Safety First:</strong> Call{' '}
                        <strong>911</strong> or local Philippine Red Cross /
                        CDRRMO if medical aid is needed.
                      </li>
                      <li>
                        <strong>Member ICE Contact:</strong> Switch to the{' '}
                        <em>Member ICE Dossier</em> tab to reach the member's
                        emergency contact.
                      </li>
                      <li>
                        <strong>Notify Palomar Leadership:</strong> Call the
                        Palomar Owners directly via the hotlines above.
                      </li>
                      <li>
                        <strong>File Report:</strong> Log an official Incident
                        Report marked as <strong>High Priority</strong>.
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </motion.div>
          </div>,
          document.body
        )}

      {/* Staff New / Edit Modal Form (Portaled to document.body) */}
      {showModal &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setShowModal(false)}
            />
            <div className="bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative z-10 max-h-[90vh] flex flex-col">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0">
                <h3 className="font-heading text-xs tracking-widest uppercase text-slate-900 dark:text-slate-100">
                  {isEditing
                    ? 'Modify Incident Report'
                    : 'Draft New Incident Report'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  title="Close editing modal dialog window"
                  aria-label="Close Modal"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleSaveReport}
                className="p-5 space-y-4 text-xs overflow-y-auto flex-1"
              >
                <div className="grid gap-1.5">
                  <label
                    htmlFor="form-incident-title"
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    Incident Title * (Max 100 chars)
                  </label>
                  <input
                    id="form-incident-title"
                    type="text"
                    required
                    maxLength={100}
                    placeholder="E.g., Power Surge on Treadmill #4"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor="form-priority-select"
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    Severity Priority Level *
                  </label>
                  <select
                    id="form-priority-select"
                    title="Select priority severity of the incident"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all cursor-pointer"
                  >
                    <option value="Low">
                      Low (No disruption to core workflow)
                    </option>
                    <option value="Medium">
                      Medium (Disruptive but manageable)
                    </option>
                    <option value="High">
                      High (Immediate safety or business stoppage)
                    </option>
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor="form-tag-input"
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    Classified Tags (Max 20 tags)
                  </label>

                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl min-h-10">
                    {formTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(idx)}
                          title={`Remove tag: ${tag}`}
                          aria-label={`Remove tag: ${tag}`}
                          className="text-slate-400 hover:text-red-500 ml-0.5 cursor-pointer p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    <input
                      id="form-tag-input"
                      type="text"
                      placeholder={
                        formTags.length === 0
                          ? 'Press Enter to add custom tag...'
                          : 'Add more...'
                      }
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag(tagInput);
                        }
                      }}
                      className="flex-1 bg-transparent border-none outline-none text-xs text-slate-900 dark:text-slate-100 min-w-25 p-0.5"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {SUGGESTED_TAGS.map((tag) => {
                      const exists = formTags.some(
                        (t) => t.toLowerCase() === tag.toLowerCase()
                      );
                      return (
                        <button
                          type="button"
                          key={tag}
                          onClick={() =>
                            exists
                              ? setFormTags(
                                  formTags.filter(
                                    (t) => t.toLowerCase() !== tag.toLowerCase()
                                  )
                                )
                              : handleAddTag(tag)
                          }
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                            exists
                              ? 'bg-[#123c73] dark:bg-[#bf0202] border-[#123c73] dark:border-[#bf0202] text-white'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-400 hover:opacity-80'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor="form-incident-description"
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    Detailed Description * (Max 3000 chars)
                  </label>
                  <textarea
                    id="form-incident-description"
                    required
                    rows={4}
                    maxLength={3000}
                    placeholder="Detail exactly what happened, medical/security measures applied, and parties involved..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all resize-none leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-white/5 pt-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 hover:opacity-90 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-95 text-white disabled:opacity-50 rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer transition-all font-bold"
                  >
                    {saving
                      ? 'Submitting...'
                      : isEditing
                        ? 'Save Modifications'
                        : 'Submit Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ─── MOBILE STICKY BOTTOM BAR ─── */}
      {createPortal(
        <div className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 backdrop-blur-xl border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-40 shadow-2xl">
          {/* Left Indicators */}
          <div className="flex items-center gap-2 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-[11px] text-slate-700 dark:text-slate-200 font-bold">
                {stats.unread} Unread
              </span>
            </div>
            {stats.highPriority > 0 && (
              <>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <div className="flex items-center gap-1 text-rose-500 truncate font-bold">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] truncate">
                    {stats.highPriority} High
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Unified Emergency Hub Action */}
            <button
              type="button"
              onClick={() => openEmergencyHub('members')}
              className="h-9 px-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-colors active:scale-95 shrink-0 font-heading text-xs font-bold uppercase tracking-wider"
              title="Emergency Hub (Owners & Member ICE)"
              aria-label="Emergency Hub"
            >
              <ShieldAlert className="w-4 h-4 animate-pulse" />
              <span>Emergency</span>
            </button>

            {/* New Report (Staff Only) */}
            {!isAdmin && (
              <button
                type="button"
                onClick={openCreateModal}
                className="h-9 px-3 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider shadow-md border border-white/10 cursor-pointer active:scale-95 transition-all shrink-0"
                title="Create New Report"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">REPORT</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const TagIcon: React.FC = () => (
  <svg
    className="w-2.5 h-2.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.125 1.125 0 001.59 0l4.318-4.318a1.125 1.125 0 000-1.59l-9.58-9.581A1.125 1.125 0 009.568 3z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 6h.008v.008H6V6z"
    />
  </svg>
);

export default IncidentReports;
