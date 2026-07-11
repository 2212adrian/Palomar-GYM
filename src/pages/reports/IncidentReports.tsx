//src/pages/reports/IncidentReports.tsx
import React, { useState, useEffect, useContext, useRef  } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { HeaderActionsContext } from '../../routes';
import { UndoToast } from '../../components/ui/UndoToast';
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
  Info,
  PhoneCall,
  User,
  Calendar,
  Clock,
  Wrench,
  Package,
  Flame,
  AlertOctagon,
  AlertTriangle
} from 'lucide-react';

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
  'Other'
];

export const IncidentReports: React.FC = () => {
  const { user } = useAuthStore();
  const { setActions } = useContext(HeaderActionsContext);
  
  const isAdmin = 
    user?.app_metadata?.role === 'Admin' || 
    user?.user_metadata?.role === 'Admin' || 
    isSuperAdmin(user?.email);

  // Mount Guard Ref
  const isMountedRef = useRef(true);

  // Initialize and clean up the mount guard
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // State Management
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  
  // Undo Countdown States
  const [pendingDelete, setPendingDelete] = useState<IncidentReport | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  
  // Navigation States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Emergency Contacts State
  const [contacts, setContacts] = useState<GymProfileContacts>({
    name1: 'Staff Ryan',
    number1: '09762607481',
    name2: 'Admin Wolf',
    number2: '09123456789'
  });

  // Modal Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread' | 'Read' | 'Archived'>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
  const [sortOrder] = useState<'Newest' | 'Oldest'>('Newest');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useResponsiveItemsPerPage();

  // centralize top action controls
  useEffect(() => {
    setActions(
      <>
        <button
          onClick={() => setShowContactsModal(true)}
          title="Escalated emergency contact directory"
          aria-label="Emergency Escalation Contacts"
          className="p-3 bg-slate-100 dark:bg-[#161920] border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
        >
          <PhoneCall className="w-4 h-4 text-blue-500" />
        </button>

        {!isAdmin && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-3 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 text-white rounded-xl text-xs font-heading tracking-widest uppercase shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Report
          </button>
        )}
      </>
    );
  }, [isAdmin, reports]);

  // Fetch Gym Profile contacts safely without hardcoded ID constraints
  const fetchEmergencyContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('gym_profile')
        .select('contact_name_1, contact_number_1, contact_name_2, contact_number_2')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data && isMountedRef.current) {
        setContacts({
          name1: data.contact_name_1 || 'Staff Ryan',
          number1: data.contact_number_1 || '09762607481',
          name2: data.contact_name_2 || 'Admin Wolf',
          number2: data.contact_number_2 || '09123456789'
        });
      }
    } catch {
      // Fallback
    }
  };

  // Fetch Incident Reports
  const fetchIncidentReports = async () => {
    try {
      if (isMountedRef.current) setLoading(true);
      let query = supabase.from('incident_reports').select('*');

      if (!isAdmin && user) {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && isMountedRef.current) {
        const typedData = data as IncidentReport[];
        setReports(typedData);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.warn('INTERNET_ERR: Could not load incident files. Please check connection.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Realtime subscription and base fetch initialization
  useEffect(() => {
    fetchEmergencyContacts();
    fetchIncidentReports();

    const channel = supabase
      .channel('incident_reports_realtime_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_reports' },
        (payload) => {
          if (!isMountedRef.current) return;
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            setReports((prev) => {
              if (prev.some((r) => r.id === newRecord.id)) return prev;
              return [newRecord as IncidentReport, ...prev];
            });
          } else if (eventType === 'UPDATE') {
            const updated = newRecord as IncidentReport;
            setReports((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
            setSelectedReport((prev) =>
              prev?.id === updated.id ? updated : prev
            );
          } else if (eventType === 'DELETE') {
            const targetId = oldRecord.id;
            setReports((prev) => prev.filter((r) => r.id !== targetId));
            setSelectedReport((prev) => (prev?.id === targetId ? null : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, user]);

  const recordAuditLog = async (action: string, details: any) => {
    try {
      if (!user) return;
      await supabase.from('audit_logs').insert({
        action,
        user_id: user.id,
        details: JSON.stringify(details),
        created_at: new Date().toISOString()
      });
    } catch {
      // Prevent background errors
    }
  };

  // Calculate stats counters
  const stats = {
    unread: reports.filter(r => r.status === 'Unread' && !r.is_archived).length,
    read: reports.filter(r => r.status === 'Read' && !r.is_archived).length,
    archived: reports.filter(r => r.is_archived).length,
    highPriority: reports.filter(r => r.priority === 'High' && !r.is_archived).length
  };

  // Filter records
  const filteredReports = reports.filter(report => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = query === '' || 
      report.title.toLowerCase().includes(query) ||
      report.staff_name.toLowerCase().includes(query) ||
      report.description.toLowerCase().includes(query) ||
      report.tags.some(t => t.toLowerCase().includes(query));

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

    const matchesPriority = priorityFilter === 'All' || report.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  }).sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return sortOrder === 'Newest' ? timeB - timeA : timeA - timeB;
  });

  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedReports = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Helper to group filtered reports by calendar days for timeline separation
  const getGroupedReports = () => {
    const groups: Record<string, IncidentReport[]> = {};
    paginatedReports.forEach(report => {
      const dateStr = new Date(report.created_at).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
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
    if (formTags.some(t => t.toLowerCase() === cleaned.toLowerCase())) {
      setTagInput('');
      return;
    }
    setFormTags([...formTags, cleaned]);
    setTagInput('');
  };

  const handleRemoveTag = (index: number) => {
    setFormTags(formTags.filter((_, i) => i !== index));
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setFormTitle('');
    setFormDescription('');
    setFormPriority('Medium');
    setFormTags([]);
    setShowModal(true);
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
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedReport.id);

        if (error) throw error;

        toast.success('Report updated successfully.');
        await recordAuditLog('INCIDENT_REPORT_UPDATED', { 
          title: titleClean, 
          priority: formPriority,
          tags: formTags 
        });
      } else {
        const staffName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Staff Personnel';
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
            is_archived: false
          })
          .select()
          .single();

        if (error) throw error;

        toast.success('Report submitted successfully.');
        if (data) {
          await recordAuditLog('INCIDENT_REPORT_CREATED', { 
            title: titleClean, 
            priority: formPriority,
            tags: formTags,
            staff_name: staffName
          });
        }
      }

      setShowModal(false);
      fetchIncidentReports();
    } catch {
      toast.error('Submission failed. Please verify your data.');
    } finally {
      setSaving(false);
    }
  };

  // Triggered when a report is selected
  const handleSelectReport = async (report: IncidentReport) => {
    if (selectedReport?.id === report.id) {
      // Toggle unselect behavior
      setSelectedReport(null);
      setIsDetailModalOpen(false);
    } else {
      setSelectedReport(report);
      setIsDetailModalOpen(true);
      
      // Automatically mark as Reviewed (Read) when clicked by an admin
      if (isAdmin && report.status === 'Unread' && !report.is_archived) {
        await updateStatus(report.id, 'Read');
      }
    }
  };

  // Prepares the countdown timer toast for deletion
  const startPendingDelete = (report: IncidentReport) => {
    if (!isAdmin && (report.status !== 'Unread' || report.is_archived)) {
      toast.error('Reviewed or archived incidents cannot be deleted.');
      return;
    }
    
    setPendingDelete(report);
    setShowUndoToast(true);

    // Optimistically hide item from local list
    setReports(prev => prev.filter(r => r.id !== report.id));
    if (selectedReport?.id === report.id) {
      setSelectedReport(null);
      setIsDetailModalOpen(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const { error } = await supabase
        .from('incident_reports')
        .delete()
        .eq('id', pendingDelete.id);

      if (error) throw error;

      await recordAuditLog('INCIDENT_REPORT_DELETED', { 
        title: pendingDelete.title,
        staff_name: pendingDelete.staff_name
      });
    } catch {
      toast.error('Deletion failure. Restoring report file.');
      // Fallback: put it back on connection error
      setReports(prev => [pendingDelete, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } finally {
      setPendingDelete(null);
      setShowUndoToast(false);
    }
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    // Restore file safely
    setReports(prev => [pendingDelete, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setPendingDelete(null);
    setShowUndoToast(false);
    toast.info('Operation successfully undone.');
  };

  const updateStatus = async (id: string, status: 'Unread' | 'Read') => {
    try {
      const target = reports.find(r => r.id === id);
      const { error } = await supabase
        .from('incident_reports')
        .update({
          status,
          read_at: status === 'Read' ? new Date().toISOString() : null,
          read_by: status === 'Read' ? user?.id : null
        })
        .eq('id', id);

      if (error) throw error;

      await recordAuditLog(
        status === 'Read' ? 'INCIDENT_REPORT_MARKED_READ' : 'INCIDENT_REPORT_MARKED_UNREAD', 
        { 
          title: target?.title || 'Unknown Title',
          status: status === 'Read' ? 'Reviewed' : 'Unread',
          staff_name: target?.staff_name || 'Unknown Staff'
        }
      );
      
      if (selectedReport?.id === id) {
        setSelectedReport(prev => prev ? { ...prev, status, read_at: status === 'Read' ? new Date().toISOString() : null } : null);
      }
      
      // Preserve local state with silent sync
      setReports(prev => prev.map(r => r.id === id ? { ...r, status, read_at: status === 'Read' ? new Date().toISOString() : null } : r));
    } catch {
      toast.error('Failed to change status attributes.');
    }
  };

  const toggleArchive = async (id: string, archiveState: boolean) => {
    try {
      const target = reports.find(r => r.id === id);
      const { error } = await supabase
        .from('incident_reports')
        .update({ is_archived: archiveState })
        .eq('id', id);

      if (error) throw error;

      toast.success(archiveState ? 'Report moved to archives.' : 'Report restored to workspace.');
      await recordAuditLog(
        archiveState ? 'INCIDENT_REPORT_ARCHIVED' : 'INCIDENT_REPORT_RESTORATION', 
        { 
          title: target?.title || 'Unknown Title',
          staff_name: target?.staff_name || 'Unknown Staff'
        }
      );
      
      if (selectedReport?.id === id) {
        setSelectedReport(prev => prev ? { ...prev, is_archived: archiveState } : null);
      }
      setIsDetailModalOpen(false); 
      fetchIncidentReports();
    } catch {
      toast.error('Archiving operation failure.');
    }
  };

  const handleBulkAction = async (action: 'Read' | 'Unread' | 'Archive' | 'Delete') => {
    if (selectedIds.length === 0) return;

    const targetReports = reports.filter(r => selectedIds.includes(r.id));
    const targetTitles = targetReports.map(r => r.title);

    try {
      setLoading(true);
      if (action === 'Delete') {
        const { error } = await supabase
          .from('incident_reports')
          .delete()
          .in('id', selectedIds);
        if (error) throw error;
        toast.success(`Successfully removed ${selectedIds.length} reports.`);
        await recordAuditLog('BULK_INCIDENT_REPORTS_DELETED', { 
          titles: targetTitles,
          count: targetTitles.length
        });
      } else if (action === 'Archive') {
        const { error } = await supabase
          .from('incident_reports')
          .update({ is_archived: true })
          .in('id', selectedIds);
        if (error) throw error;
        toast.success(`Successfully archived ${selectedIds.length} reports.`);
        await recordAuditLog('BULK_INCIDENT_REPORTS_ARCHIVED', { 
          titles: targetTitles,
          count: targetTitles.length
        });
      } else {
        const { error } = await supabase
          .from('incident_reports')
          .update({ 
            status: action,
            read_at: action === 'Read' ? new Date().toISOString() : null,
            read_by: action === 'Read' ? user?.id : null
          })
          .in('id', selectedIds);
        if (error) throw error;
        toast.success(`Successfully updated ${selectedIds.length} reports.`);
        await recordAuditLog('BULK_INCIDENT_REPORTS_STATUS_UPDATE', { 
          titles: targetTitles,
          status: action === 'Read' ? 'Reviewed' : 'Unread',
          count: targetTitles.length
        });
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

  const renderDetailPanelContent = (report: IncidentReport, isModalContext = false) => {
    return (
      <div className="space-y-6 text-xs relative">
        {!isModalContext && (
          <div className={`absolute top-[-20px] left-[-20px] right-[-20px] h-1.5 rounded-t-2xl ${
            report.priority === 'High' 
              ? 'bg-red-500' 
              : report.priority === 'Medium' 
                ? 'bg-amber-500' 
                : 'bg-green-500'
          }`} />
        )}

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-white/5 pb-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className={`px-2 py-0.5 rounded text-[9px] font-heading tracking-widest uppercase ${
              report.priority === 'High' 
                ? 'bg-red-500/10 text-red-500' 
                : report.priority === 'Medium'
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-green-500/10 text-green-500'
            }`}>
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
                    day: 'numeric' 
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {new Date(report.created_at).toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading tracking-widest uppercase ${
              report.status === 'Unread' && !report.is_archived
                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                : 'bg-green-500/10 text-green-500 border border-green-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${report.status === 'Unread' && !report.is_archived ? 'bg-red-500' : 'bg-green-500'}`} />
              {report.is_archived ? 'Archived' : report.status === 'Unread' ? 'New' : 'Reviewed'}
            </span>
            
            {/* Desktop Only Close Button to allow Unselecting */}
            {!isModalContext && (
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Unselect current report file"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {report.tags && report.tags.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Incident Tags</h4>
            <div className="flex flex-wrap gap-2">
              {report.tags.map((tag, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 text-[10px] text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                  {getTagIcon(tag)}
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 bg-slate-50/50 dark:bg-[#12141a]/50 border border-slate-200/40 dark:border-white/5 p-4 rounded-2xl">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</h4>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {report.description}
          </p>
        </div>

        {/* Actions panel depending on roles */}
        <div className="border-t border-slate-100 dark:border-white/5 pt-4">
          {isAdmin ? (
            <div className="space-y-3.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</h4>
              <div className="flex flex-wrap gap-2">
                {report.status === 'Unread' ? (
                  <button
                    onClick={() => updateStatus(report.id, 'Read')}
                    className="flex items-center gap-1.5 px-4 py-2 border border-green-500/20 text-green-600 dark:text-green-400 bg-green-500/5 hover:bg-green-500/10 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Mark Reviewed
                  </button>
                ) : (
                  <button
                    onClick={() => updateStatus(report.id, 'Unread')}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:opacity-90 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    Mark as unread
                  </button>
                )}

                {!report.is_archived ? (
                  <button
                    onClick={() => toggleArchive(report.id, true)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Archive className="w-4 h-4" />
                    Archive Report
                  </button>
                ) : (
                  <button
                    onClick={() => toggleArchive(report.id, false)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:opacity-90 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Archive className="w-4 h-4" />
                    Restore Workspace
                  </button>
                )}

                <button
                  onClick={() => startPendingDelete(report)}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Report
                </button>
              </div>

              <div className="p-3.5 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 rounded-xl flex items-start gap-2 text-xs text-blue-600 dark:text-blue-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Adjusting status keeps staff informed. Archived files can be reviewed at any time by selecting "Archived" filter.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</h4>
              {report.status === 'Unread' && !report.is_archived ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (isModalContext) setIsDetailModalOpen(false);
                      openEditModal(report);
                    }}
                    className="px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:opacity-90 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Edit Details
                  </button>
                  <button
                    onClick={() => startPendingDelete(report)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-red-500/20 text-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Delete Report
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-white/5 flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#123c73] dark:text-[#bf0202]" />
                  <span>This report has already been reviewed or archived by administrators and can no longer be edited or deleted by staff personnel.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-2">

      {/* 2. Main Dashboard Workspace (Supports animated layout shifts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Directory List Section */}
        <motion.div 
          layout
          className={selectedReport 
            ? "lg:col-span-5 space-y-4" 
            : "lg:col-span-8 lg:col-start-2 xl:col-span-6 xl:col-start-3 space-y-4"
          }
        >
          {/* Soft Warning at >= 10 unread reports */}
          {stats.unread >= 10 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-2 font-medium animate-slide-up">
              <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce text-amber-500" />
              <span>Queue Alert: You have {stats.unread} unread incident reports. Please process them to clear the pipeline.</span>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-white/5 pt-3">
              <div className="flex items-center gap-3">
                {/* Unified Select All Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={paginatedReports.length > 0 && paginatedReports.every(r => selectedIds.includes(r.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(paginatedReports.map(r => r.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] dark:accent-[#bf0202]"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select All</span>
                </label>

                <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {(['All', 'Unread', 'Read', 'Archived'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => { setStatusFilter(filter); setCurrentPage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-heading tracking-wider uppercase transition-all shrink-0 cursor-pointer ${
                        statusFilter === filter
                          ? 'bg-[#123c73] dark:bg-[#bf0202] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-[#1e232d] text-slate-500 dark:text-slate-400 hover:opacity-80'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <label htmlFor="priority-filter-select" className="sr-only">Priority Filter</label>
                <select
                  id="priority-filter-select"
                  title="Filter reports by priority level"
                  value={priorityFilter}
                  onChange={(e) => { setPriorityFilter(e.target.value as any); setCurrentPage(1); }}
                  className="bg-slate-100 dark:bg-[#1e232d] border-none text-[10px] text-slate-500 dark:text-slate-400 font-heading tracking-wider uppercase rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-[#123c73] dark:focus:ring-[#bf0202] outline-none"
                >
                  <option value="All">All Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bulk Select Action Bar (Only visible when checkbox is checked) */}
          {selectedIds.length > 0 && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold animate-scale-up">
              <span className="text-blue-600 dark:text-blue-400 font-mono">
                {selectedIds.length} Selected
              </span>
              <div className="flex gap-1 flex-wrap">
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
                <button
                  onClick={() => handleBulkAction('Delete')}
                  title="Delete selected"
                  className="px-2 py-1 bg-red-500/10 text-red-650 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-[9px] cursor-pointer font-bold uppercase transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="p-1 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
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
                <div key={i} className="p-4 bg-white/50 dark:bg-[#161920]/50 border border-slate-200 dark:border-white/5 rounded-2xl animate-pulse space-y-3">
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
              <h3 className="font-heading text-xs uppercase tracking-widest text-slate-800 dark:text-slate-200">No incident reports</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                Reports submitted by your staff matching your active filters will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(getGroupedReports()).map(([dateLabel, groupReports]) => (
                <div key={dateLabel} className="space-y-3 relative">
                  {/* Timeline separators showing dynamic day records */}
                  <div className="flex items-center gap-2 py-1 select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#123c73] dark:bg-[#bf0202]" />
                    <span className="text-[9px] font-heading tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase">
                      {dateLabel}
                    </span>
                    <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/5" />
                  </div>

                  {groupReports.map((report) => {
                    const isSelected = selectedReport?.id === report.id;
                    const isHigh = report.priority === 'High';
                    
                    return (
                      <motion.div
                        layoutId={`report-card-${report.id}`}
                        key={report.id}
                        onClick={() => handleSelectReport(report)}
                        className={`relative p-4 border rounded-2xl cursor-pointer transition-all shadow-xs flex items-start gap-3.5 overflow-hidden group ${
                          isSelected
                            ? 'bg-[#123c73]/5 dark:bg-[#bf0202]/5 border-[#123c73] dark:border-[#bf0202]'
                            : 'bg-white dark:bg-[#161920] border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/15'
                        }`}
                      >
                        <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                          report.priority === 'High' 
                            ? 'bg-red-500' 
                            : report.priority === 'Medium' 
                              ? 'bg-amber-500' 
                              : 'bg-green-500'
                        }`} />

                        <div className="pt-1 select-none shrink-0 z-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(report.id)}
                            onChange={() => handleToggleSelect(report.id, { stopPropagation: () => {} } as any)}
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
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ${
                              isHigh 
                                ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                                : report.priority === 'Medium'
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                  : 'bg-green-500/10 text-green-500 border border-green-500/20'
                            }`}>
                              {report.priority}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-medium">
                            <span className="font-semibold text-slate-700 dark:text-slate-350">
                              {report.staff_name}
                            </span>
                            <span>•</span>
                            <span>
                              {new Date(report.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <span>•</span>
                            <span className={`font-semibold ${report.is_archived ? 'text-amber-500' : report.status === 'Unread' ? 'text-red-500' : 'text-slate-455'}`}>
                              {report.is_archived ? 'Archived' : report.status === 'Unread' ? 'New' : 'Reviewed'}
                            </span>
                          </div>

                          {report.tags && report.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2.5">
                              {report.tags.slice(0, 3).map((tag, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/5 text-[8px] text-slate-500 font-semibold uppercase tracking-wider">
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
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/5 pt-4 text-xs">
              <span className="text-slate-400 font-medium text-[11px]">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} reports
              </span>
              <div className="flex gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
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
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  title="Next Page"
                  aria-label="Next Page"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161920] disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Right Column: Desktop Inline Detail Panel */}
        <AnimatePresence>
          {selectedReport && (
            <motion.div 
              initial={{ opacity: 0, x: 20, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="hidden lg:block lg:col-span-7"
            >
              <div className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-6 shadow-xs relative">
                {renderDetailPanelContent(selectedReport, false)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Reusable universal 5-second countdown timer for deleted items */}
      <UndoToast
        isOpen={showUndoToast}
        message={`Incident report "${pendingDelete?.title}" deleted.`}
        duration={10}
        onConfirm={confirmDelete}
        onUndo={undoDelete}
        onClose={() => setShowUndoToast(false)}
      />

      {/* Mobile & Tablet Detail Modal Overlay */}
      <AnimatePresence>
        {isDetailModalOpen && selectedReport && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40" 
              onClick={() => setSelectedReport(null)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-2xl space-y-6 shadow-2xl relative w-full max-w-lg max-h-[90vh] overflow-y-auto z-[2001]"
            >
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="absolute top-4 right-4 z-50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer transition-colors"
                title="Close report modal"
              >
                <X className="w-5 h-5" />
              </button>

              {renderDetailPanelContent(selectedReport, true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Emergency contacts modal panel */}
      <AnimatePresence>
        {showContactsModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30" 
              onClick={() => setShowContactsModal(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className="bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md p-6 shadow-xl relative z-10 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <PhoneCall className="w-4 h-4 text-blue-500" />
                  <span>Emergency Escalation Directory</span>
                </div>
                <button 
                  onClick={() => setShowContactsModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Close directory"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                If an incident requires immediate security, management support, or critical escalation, call the registered gym administrators:
              </p>
              
              <div className="space-y-3 pt-1">
                {contacts.name1 && (
                  <div className="p-3.5 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-[#bf0202]/10 flex items-center justify-center text-blue-600 dark:text-[#bf0202] shrink-0 font-heading">
                      1
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Primary Admin</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{contacts.name1}</p>
                      <a href={`tel:${contacts.number1}`} className="text-blue-600 dark:text-[#bf0202] dark:hover:text-red-400 font-semibold hover:underline block mt-0.5">
                        {contacts.number1}
                      </a>
                    </div>
                  </div>
                )}

                {contacts.name2 && (
                  <div className="p-3.5 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-100 dark:border-white/5 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-[#bf0202]/10 flex items-center justify-center text-blue-600 dark:text-[#bf0202] shrink-0 font-heading">
                      2
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Secondary Admin</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{contacts.name2}</p>
                      <a href={`tel:${contacts.number2}`} className="text-blue-600 dark:text-[#bf0202] dark:hover:text-red-400 font-semibold hover:underline block mt-0.5">
                        {contacts.number2}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Accessible New / Edit Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-scale-up">
            
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <h3 className="font-heading text-xs tracking-widest uppercase text-slate-900 dark:text-slate-100">
                {isEditing ? 'Modify Incident Report' : 'Draft New Incident Report'}
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

            <form onSubmit={handleSaveReport} className="p-5 space-y-4 text-xs">
              
              <div className="grid gap-1.5">
                <label htmlFor="form-incident-title" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                <label htmlFor="form-priority-select" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Severity Priority Level *
                </label>
                <select
                  id="form-priority-select"
                  title="Select priority severity of the incident"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as any)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                >
                  <option value="Low">Low (No disruption to core workflow)</option>
                  <option value="Medium">Medium (Disruptive but manageable)</option>
                  <option value="High">High (Immediate safety or business stoppage)</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="form-tag-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Classified Tags (Max 20 tags)
                </label>
                
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl min-h-[40px]">
                  {formTags.map((tag, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
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
                    placeholder={formTags.length === 0 ? "Press Enter to add custom tag..." : "Add more..."}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      }
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-xs text-slate-900 dark:text-slate-100 min-w-[100px] p-0.5"
                  />
                </div>

                <div className="flex flex-wrap gap-1 pt-1.5">
                  {SUGGESTED_TAGS.map((tag) => {
                    const exists = formTags.some(t => t.toLowerCase() === tag.toLowerCase());
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => exists ? setFormTags(formTags.filter(t => t.toLowerCase() !== tag.toLowerCase())) : handleAddTag(tag)}
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
                <label htmlFor="form-incident-description" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Detailed Description * (Max 3000 chars)
                </label>
                <textarea
                  id="form-incident-description"
                  required
                  rows={4}
                  maxLength={3000}
                  placeholder="Detail exactly what happened, any actions taken, and who is involved..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#1e232d] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-white/5 pt-4">
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
                  className="px-5 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-95 text-white disabled:opacity-50 rounded-xl text-[10px] font-heading tracking-widest uppercase cursor-pointer transition-all"
                >
                  {saving ? 'Submitting...' : isEditing ? 'Save Modifications' : 'Submit Report'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

const TagIcon: React.FC = () => (
  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.125 1.125 0 001.59 0l4.318-4.318a1.125 1.125 0 000-1.59l-9.58-9.581A1.125 1.125 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
);