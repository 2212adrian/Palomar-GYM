// src/pages/logbook/components/LogbookRecordAttendance.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  X, 
  AlertTriangle, 
  Check, 
  UserCheck, 
  QrCode, 
  Coins, 
  CreditCard,
  RefreshCw,
  ChevronRight,
  User,
  GraduationCap,
  Ticket,
  Users,
  Eye,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';

// Dynamic Members Engine Integration
import { memberService, subscriptionService, cardService, prototypeStorage, STORAGE_KEYS } from '../../members/memberService';
import type { Member, Subscription, MemberCard, AttendanceRecord } from '../../../types/members';

interface LogbookRecordAttendanceProps {
  isOpen: boolean;
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

export const LogbookRecordAttendance: React.FC<LogbookRecordAttendanceProps> = ({
  isOpen,
  onClose,
  onCheckInSuccess,
}) => {
  const { user, profile } = useAuthStore() as any;
  const isSubmittingRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Dynamic Members State
  const [dynamicMembers, setDynamicMembers] = useState<MemberProfile[]>([]);

  // Search and Suggestions
  const [memberSearch, setMemberSearch] = useState('');
  const [suggestions, setSuggestions] = useState<MemberProfile[]>([]);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);

  // Photo Preview Lightbox State for Member Verification
  const [photoModal, setPhotoModal] = useState<{ name: string; memberId?: string; url: string | null } | null>(null);

  // Camera & Scanning States
  const [isScanningLoading, setIsScanningLoading] = useState(false);
  const [showLiveScanner, setShowLiveScanner] = useState(false);

  // Selected entry type ('walkin_regular' | 'walkin_student' | 'member_entry')
  const [selectedEntry, setSelectedEntry] = useState<'walkin_regular' | 'walkin_student' | 'member_entry' | null>(null);

  // Payment Setup
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Admin override toggles for duplicates
  const [adminOverride, setAdminOverride] = useState(false);

  // Resolve user role
  const isAdmin = useMemo(() => {
    if (isSuperAdmin(user?.email)) return true;
    return profile?.role?.toLowerCase() === 'admin';
  }, [user, profile]);

  // Load active member profiles dynamically from database
  const loadDynamicMembers = () => {
    try {
      const members = memberService.getAll();
      const subscriptions = subscriptionService.getAll();
      const cards = cardService.getAll();
      const attendanceList = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);

      const now = new Date();

      const mappedProfiles: MemberProfile[] = members.map((m: Member) => {
        const activeSub = subscriptions.find(
          (s: Subscription) => s.member_id === m.member_id && s.status === 'Active'
        );

        let membershipName = activeSub ? activeSub.plan_name : 'No Active Plan';
        let expDateStr = activeSub ? new Date(activeSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        
        let calculatedStatus: MemberProfile['status'] = 'Expired';
        if (m.status === 'Suspended') {
          calculatedStatus = 'Suspended';
        } else if (activeSub) {
          const endDate = new Date(activeSub.end_date);
          const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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

        const memberVisits = attendanceList.filter((a: AttendanceRecord) => a.member_id === m.member_id);
        const lastVisitRecord = memberVisits[0];
        const lastVisitStr = lastVisitRecord 
          ? new Date(lastVisitRecord.check_in_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'First Visit';

        const todayVisits = memberVisits.filter((a: AttendanceRecord) => {
          const d = new Date(a.check_in_time);
          return d.getDate() === now.getDate() &&
                 d.getMonth() === now.getMonth() &&
                 d.getFullYear() === now.getFullYear();
        }).length;

        return {
          id: m.id,
          name: m.full_name,
          memberId: m.member_id,
          membership: membershipName,
          status: calculatedStatus,
          phone: m.phone || '',
          email: m.email || '',
          address: m.address || '',
          regDate: new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          expDate: expDateStr,
          lastVisit: lastVisitStr,
          todayVisits,
          cardNumbers: memberCards,
          avatarUrl: m.avatar_url || null
        };
      });

      setDynamicMembers(mappedProfiles);
    } catch (e) {
      console.error('Failed to load dynamic member records:', e);
    }
  };

  // Load today's check-ins from local storage to trace duplicate records dynamically
  const todayLogs = useMemo(() => {
    try {
      const saved = localStorage.getItem('palomar_gym_logbook');
      const logs = saved ? JSON.parse(saved) : [];
      
      const today = new Date();
      return logs.filter((log: any) => {
        if (!log.timestamp) return false;
        const logDate = new Date(log.timestamp);
        return logDate.getDate() === today.getDate() &&
               logDate.getMonth() === today.getMonth() &&
               logDate.getFullYear() === today.getFullYear();
      });
    } catch (e) {
      return [];
    }
  }, [isOpen, selectedClient, isSuccess]);

  // Find duplicates
  const duplicateLog = useMemo(() => {
    if (!selectedClient) return null;
    return todayLogs.find((log: any) => {
      if (selectedClient.isWalkIn) {
        return log.customerName.toLowerCase() === selectedClient.name.toLowerCase() && log.customerType === 'Walk-In';
      } else {
        return log.memberId === selectedClient.memberId;
      }
    });
  }, [selectedClient, todayLogs]);

  // Evaluate duplicate lockout state
  const isLockedByDuplicate = Boolean(duplicateLog && !adminOverride);

  // Request Android / iOS camera permissions explicitly
  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const status = await Camera.checkPermissions();
      if (status.camera !== 'granted') {
        const requestRes = await Camera.requestPermissions({ permissions: ['camera'] });
        if (requestRes.camera !== 'granted') {
          toast.error('Camera permission was denied. Please allow camera access in App Settings.');
          return false;
        }
      }
      return true;
    } catch (err) {
      console.warn('Permission request check failed:', err);
      return true;
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDynamicMembers();
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      resetForm();
    }
  }, [isOpen]);

  // Effect for live camera feed
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (showLiveScanner) {
      const element = document.getElementById('live-qr-reader');
      if (element) {
        html5QrCode = new Html5Qrcode('live-qr-reader');
        html5QrCode
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              handleMemberSearchChange(decodedText);
              toast.success(`Scanned: ${decodedText}`);
              setShowLiveScanner(false);
            },
            () => {}
          )
          .catch((err) => {
            console.error('Live camera start failed:', err);
            toast.error('Unable to access camera feed.');
            setShowLiveScanner(false);
          });
      }
    }

    return () => {
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode
            .stop()
            .then(() => {
              try { html5QrCode?.clear(); } catch (e) {}
            })
            .catch(console.error);
        } else {
          try { html5QrCode.clear(); } catch (e) {}
        }
      }
    };
  }, [showLiveScanner]);

  const resetForm = () => {
    setMemberSearch('');
    setSuggestions([]);
    setSelectedClient(null);
    setSelectedEntry(null);
    setPaymentMethod('Cash');
    setAmountReceived('');
    setReferenceNumber('');
    setAdminOverride(false);
    setShowLiveScanner(false);
    setPhotoModal(null);
  };

  const handleMemberSearchChange = (val: string) => {
    if (showLiveScanner) return;
    setMemberSearch(val);
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }
    const query = val.toLowerCase().trim();
    const filtered = dynamicMembers.filter(m => 
      m.name.toLowerCase().includes(query) || 
      m.memberId.toLowerCase().includes(query) ||
      m.phone.includes(query) ||
      m.cardNumbers.some(card => card.toLowerCase().includes(query))
    );
    setSuggestions(filtered);

    // Auto select on exact ID, phone, or printed card token match
    const exactMatch = dynamicMembers.find(
      m => m.memberId.toLowerCase() === query || 
           m.phone === query ||
           m.cardNumbers.some(c => c.toLowerCase() === query)
    );
    if (exactMatch) {
      handleSelectMember(exactMatch);
    }
  };

  const handleSelectMember = (member: MemberProfile) => {
    const client: SelectedClient = {
      id: member.id,
      name: member.name.toUpperCase(),
      memberId: member.memberId,
      phone: member.phone,
      regDate: member.regDate,
      membership: member.membership,
      status: member.status,
      isWalkIn: false,
      avatarUrl: member.avatarUrl || null
    };
    setSelectedClient(client);
    setMemberSearch('');
    setSuggestions([]);
    
    // Auto-select Member Entry if account state is healthy
    if (member.status === 'Active' || member.status === 'Expires Soon') {
      setSelectedEntry('member_entry');
    } else {
      setSelectedEntry(null);
    }
  };

  const handleContinueAsWalkIn = () => {
    const query = memberSearch.trim();
    if (query.length < 3) {
      toast.warning('Please enter at least 3 characters for guest name.');
      return;
    }
    const client: SelectedClient = {
      name: query.toUpperCase(),
      isWalkIn: true
    };
    setSelectedClient(client);
    setMemberSearch('');
    setSuggestions([]);
    setSelectedEntry('walkin_regular');
  };

  // Decode QR/Barcode from image file using html5-qrcode
  const scanImageFile = async (file: File) => {
    let html5QrCode: Html5Qrcode | null = null;
    try {
      html5QrCode = new Html5Qrcode('qr-reader-hidden');
      const decodedText = await html5QrCode.scanFile(file, false);
      if (decodedText) {
        handleMemberSearchChange(decodedText);
        toast.success(`Scanned: ${decodedText}`);
        return true;
      }
    } catch (err) {
      console.warn('Scan file failed:', err);
      toast.error('No valid QR code or barcode detected in image.');
    } finally {
      if (html5QrCode) {
        try { html5QrCode.clear(); } catch (e) {}
      }
    }
    return false;
  };

  // Capacitor Native Camera scanner trigger
  const handleCapacitorCameraScan = async () => {
    setIsScanningLoading(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      if (photo && photo.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const file = new File([blob], 'scanned_qr.jpg', { type: blob.type || 'image/jpeg' });
        await scanImageFile(file);
      }
    } catch (error: any) {
      if (
        error?.message !== 'User cancelled photos app' && 
        error?.message !== 'User cancelled photo'
      ) {
        console.warn('Capacitor camera error:', error);
        setShowLiveScanner(true);
      }
    } finally {
      setIsScanningLoading(false);
    }
  };

  // Toggle camera mode based on environment & clear search
  const handleStartScan = async () => {
    setMemberSearch('');
    setSuggestions([]);

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    if (Capacitor.isNativePlatform()) {
      await handleCapacitorCameraScan();
    } else {
      setShowLiveScanner((prev) => !prev);
    }
  };

  // Derive active pricing logic
  const derivedBilling = useMemo(() => {
    let subtotal = 0;
    let title = 'None Selected';
    let discount = 0;

    if (selectedEntry === 'walkin_regular') {
      subtotal = 90;
      title = 'Walk-In Regular Pass';
    } else if (selectedEntry === 'walkin_student') {
      subtotal = 60;
      title = 'Walk-In Student Pass';
    } else if (selectedEntry === 'member_entry' && selectedClient && !selectedClient.isWalkIn) {
      const isYearly = selectedClient.membership?.toLowerCase().includes('year');
      if (isYearly) {
        subtotal = 70;
        title = 'Yearly Member Entry';
      } else {
        subtotal = 0;
        title = 'Monthly Member Entry';
      }
    }

    const convenienceFee = paymentMethod === 'GCash' && subtotal > 0 ? 10 : 0;
    const totalDue = Math.max(0, subtotal - discount + convenienceFee);
    const calculatedChange = Math.max(0, (Number(amountReceived) || 0) - totalDue);

    return {
      subtotal,
      title,
      discount,
      convenienceFee,
      totalDue,
      calculatedChange
    };
  }, [selectedEntry, selectedClient, paymentMethod, amountReceived]);

  useEffect(() => {
    if (paymentMethod === 'Cash') {
      setAmountReceived(derivedBilling.totalDue > 0 ? derivedBilling.totalDue.toString() : '');
    } else {
      setAmountReceived('');
    }
  }, [paymentMethod, derivedBilling.totalDue]);

  const handleCompleteCheckIn = () => {
    if (isSubmittingRef.current || isSuccess || !selectedClient) return;

    if (duplicateLog && !adminOverride) {
      toast.error('Duplicate attendance requires administrator override.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const checkInRecord = {
      id: `CHK-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      memberId: selectedClient.isWalkIn ? null : selectedClient.memberId,
      customerName: selectedClient.name,
      customerType: selectedClient.isWalkIn ? 'Walk-In' : 'Existing Member',
      categoryOrPlan: derivedBilling.title,
      paymentMethod: derivedBilling.totalDue > 0 ? paymentMethod : 'Free',
      amountPaid: derivedBilling.totalDue,
      paymentStatus: derivedBilling.totalDue > 0 ? 'Paid' : 'Free',
      referenceNumber: paymentMethod === 'GCash' && derivedBilling.totalDue > 0 ? referenceNumber : undefined,
      status: selectedClient.isWalkIn ? 'Active' : selectedClient.status
    };

    // Save attendance record to unified prototypeStorage database
    try {
      const attendanceList = prototypeStorage.getCollection<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
      const newAttendance: AttendanceRecord = {
        id: checkInRecord.id,
        member_id: selectedClient.isWalkIn ? undefined : selectedClient.memberId || undefined,
        customer_name: selectedClient.name,
        customer_type: selectedClient.isWalkIn ? 'Walk-In' : 'Existing Member',
        check_in_time: checkInRecord.timestamp,
        plan_name: derivedBilling.title,
        entry_fee: derivedBilling.totalDue,
        payment_method: (derivedBilling.totalDue > 0 ? paymentMethod : 'Cash') as any,
        receipt_number: paymentMethod === 'GCash' && derivedBilling.totalDue > 0 ? referenceNumber : undefined,
        staff_name: user?.email || 'Counter Staff'
      };
      prototypeStorage.save(STORAGE_KEYS.ATTENDANCE, [newAttendance, ...attendanceList]);
    } catch (e) {
      console.warn('Failed to persist attendance in storage:', e);
    }

    setIsSuccess(true);

    setTimeout(() => {
      onCheckInSuccess(checkInRecord);
      setIsSuccess(false);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      onClose();
    }, 1500);
  };

  const isFormValid = useMemo(() => {
    if (!selectedClient || !selectedEntry) return false;
    
    if (duplicateLog && !adminOverride) return false;

    if (selectedEntry === 'member_entry' && selectedClient.status) {
      if (selectedClient.status === 'Expired' || selectedClient.status === 'Suspended') {
        return false;
      }
    }

    if (derivedBilling.totalDue === 0) return true;

    if (paymentMethod === 'Cash') {
      return (Number(amountReceived) || 0) >= derivedBilling.totalDue;
    } else {
      return referenceNumber.trim().length >= 6;
    }
  }, [selectedClient, selectedEntry, duplicateLog, adminOverride, paymentMethod, amountReceived, referenceNumber, derivedBilling.totalDue]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reception Check-In"
      className="w-full mx-auto -mt-4 sm:-mt-8 p-4 sm:p-5 overflow-visible transition-all duration-300 relative text-left max-w-lg"
    >
      <div id="qr-reader-hidden" className="hidden" aria-hidden="true" />

      {/* Close Button */}
      <button
        type="button"
        disabled={isSubmitting}
        onClick={onClose}
        className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
        aria-label="Close Dialog"
      >
        <X className="w-5 h-5" />
      </button>

      {!isSuccess ? (
        <div className="max-h-[80vh] overflow-y-auto pr-1 pb-12 space-y-2.5 sm:space-y-3 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent font-sans">

          {/* SEARCH INPUT & CAMERA TRIGGER */}
          {!selectedClient && (
            <div className="space-y-1.5">
              <label className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 block uppercase tracking-wider">
                SEARCH MEMBER OR SCAN CARD / QR CODE
              </label>

              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => handleMemberSearchChange(e.target.value)}
                  disabled={showLiveScanner}
                  placeholder={showLiveScanner ? "CAMERA SCANNER ACTIVE..." : "TYPE NAME, PHONE, CARD CODE OR MEMBER ID..."}
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
                  disabled={isScanningLoading}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                    showLiveScanner 
                      ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-500/50 animate-pulse' 
                      : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                  title="Scan QR / Barcode using Camera"
                >
                  {isScanningLoading ? (
                    <RefreshCw className="w-4.5 h-4.5 animate-spin text-white" />
                  ) : (
                    <QrCode className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>

              {/* PERFECT SQUARE LIVE CAMERA VIEWFINDER */}
              {showLiveScanner && (
                <div className="mt-2 p-3 bg-zinc-950 border-2 border-blue-500/40 rounded-2xl relative text-center animate-fade-in z-30 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      LIVE CAMERA ACTIVE
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLiveScanner(false)}
                      className="text-xs text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative w-full aspect-square max-w-55 mx-auto rounded-2xl overflow-hidden bg-black border-2 border-dashed border-blue-500/50 flex items-center justify-center shadow-inner">
                    <div id="live-qr-reader" className="w-full h-full object-cover" />
                    
                    {/* Scanner Target Frame Reticle */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <div className="w-full h-full border-2 border-blue-500 rounded-xl relative animate-pulse">
                        <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-4 border-l-4 border-blue-400" />
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-4 border-r-4 border-blue-400" />
                        <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-4 border-l-4 border-blue-400" />
                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-4 border-r-4 border-blue-400" />
                      </div>
                    </div>
                  </div>

                  {Capacitor.isNativePlatform() && (
                    <button
                      type="button"
                      onClick={handleCapacitorCameraScan}
                      className="text-[11px] font-bold text-amber-400 hover:underline uppercase tracking-wider block mx-auto cursor-pointer"
                    >
                      Snap Photo with Native Camera
                    </button>
                  )}
                </div>
              )}

              {/* CLEAN CENTERED GUIDANCE CARD WHEN NO SEARCH INPUT IS ENTERED YET */}
              {!memberSearch.trim() && !showLiveScanner && (
                <div className="mt-3 p-4 bg-slate-50 dark:bg-zinc-900/60 border border-(--border-color) rounded-2xl text-center space-y-1.5 animate-fade-in">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                    <Users className="w-4.5 h-4.5" />
                  </div>
                  
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                    SEARCH MEMBER OR SCAN BADGE
                  </h4>
                  
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">
                    Type a name, phone number, or ID above, or tap the QR scanner.
                  </p>
                </div>
              )}

              {/* SEARCH RESULTS & PROCESS WALK-IN */}
              {memberSearch.trim().length > 0 && (
                <div className="mt-2.5 space-y-2.5 animate-fade-in">
                  
                  {/* MEMBER MATCHES LIST */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white block uppercase tracking-wider px-0.5">
                      REGISTERED MEMBERS FOUND ({suggestions.length})
                    </span>

                    {suggestions.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {suggestions.map((m) => {
                          const isSuspended = m.status === 'Suspended';
                          const isExpired = m.status === 'Expired';
                          const isLocked = isSuspended || isExpired;
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
                                {/* CLICKABLE SQUARE MEMBER PHOTO */}
                                <button
                                  type="button"
                                  onClick={() => setPhotoModal({ name: m.name, memberId: m.memberId, url: m.avatarUrl || null })}
                                  className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-zinc-800 border border-(--border-color) overflow-hidden flex items-center justify-center font-black text-slate-900 dark:text-white text-xs shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group relative"
                                  title="Click to verify member photo"
                                >
                                  {m.avatarUrl ? (
                                    <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
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
                                    {m.membership} • <span className="font-mono text-[10px]">{m.memberId}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isNonActive && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    isSuspended ? 'bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30' :
                                    isExpired ? 'bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30' :
                                    'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                  }`}>
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
                    ) : (
                      <div className="p-2.5 bg-slate-50 dark:bg-zinc-900/40 border border-dashed border-(--border-color) rounded-xl text-center text-xs font-medium text-slate-500">
                        NO REGISTERED MEMBERS MATCH "<strong>{memberSearch.toUpperCase()}</strong>"
                      </div>
                    )}
                  </div>

                  {/* PROCESS AS WALK-IN (POSITIONED BELOW MEMBER LIST & VALIDATED FOR 3+ CHARS) */}
                  <div className="pt-2 border-t border-(--border-color)">
                    <div className="p-2.5 bg-slate-50 dark:bg-zinc-900/60 border border-(--border-color) rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <User className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate uppercase">
                            {memberSearch.toUpperCase()}
                          </p>
                          {memberSearch.trim().length < 3 && (
                            <p className="text-[10px] text-amber-500 font-medium truncate mt-0.5">
                              Type at least 3 characters to process walk-in
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={memberSearch.trim().length < 3}
                        onClick={handleContinueAsWalkIn}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-slate-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider rounded-lg shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 shadow-md"
                      >
                        <span>Process Walk-In</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* REDESIGNED CENTERED DUPLICATE CHECK-IN ALERT */}
          {duplicateLog && (
            <div className="p-3.5 bg-amber-500/10 border-2 border-amber-500/40 text-amber-700 dark:text-amber-400 rounded-2xl flex flex-col items-center text-center space-y-2 animate-fade-in shadow-md">
              <div className="flex items-center justify-center gap-2 font-black text-xs sm:text-sm">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                <span>Customer already checked in today.</span>
              </div>

              {isAdmin ? (
                <label className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-xl cursor-pointer transition-all shadow-xs">
                  <input
                    type="checkbox"
                    checked={adminOverride}
                    onChange={(e) => setAdminOverride(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-500 text-blue-600 focus:ring-amber-500 accent-blue-600"
                  />
                  <span className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                    PROCEED ANYWAY
                  </span>
                </label>
              ) : (
                <span className="text-[11px] text-rose-500 font-black uppercase tracking-wider">
                  Requires Admin Override To Proceed
                </span>
              )}
            </div>
          )}

          {/* VERIFIED CUSTOMER CARD WITH EXCLUSIVE CLICKABLE MEMBER PHOTO */}
          {selectedClient && (
            <div className="p-3 bg-slate-100/90 dark:bg-zinc-900/90 border-2 border-(--border-color) rounded-xl flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-3 min-w-0">
                
                {/* SQUARE PHOTO AVATAR — CLICKABLE ONLY FOR REGISTERED MEMBERS */}
                {!selectedClient.isWalkIn ? (
                  <button
                    type="button"
                    onClick={() => setPhotoModal({ name: selectedClient.name, memberId: selectedClient.memberId || undefined, url: selectedClient.avatarUrl || null })}
                    className="w-11 h-11 rounded-xl bg-blue-600 text-white overflow-hidden flex items-center justify-center font-black text-base shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group relative shadow-md"
                    title="Click to verify member photo identity"
                  >
                    {selectedClient.avatarUrl ? (
                      <img src={selectedClient.avatarUrl} alt={selectedClient.name} className="w-full h-full object-cover" />
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
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                      selectedClient.isWalkIn 
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30' 
                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {selectedClient.isWalkIn ? 'WALK-IN GUEST' : 'REGISTERED MEMBER'}
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

          {/* PASS SELECTION, BILLING & CHECKOUT (LOCKED & TRANSPARENT UNTIL PROCEED ANYWAY IS CHECKED IF DUPLICATE) */}
          {selectedClient && (
            <div className={`space-y-3 transition-all duration-300 ${
              isLockedByDuplicate 
                ? 'opacity-25 pointer-events-none grayscale select-none' 
                : 'opacity-100'
            }`}>

              {/* CHOOSE TODAY'S ENTRY PASS (DYNAMICALLY CONDITIONAL) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-900 dark:text-slate-100 block uppercase tracking-wider">
                  SELECT ENTRY PASS
                </label>

                {selectedClient.isWalkIn ? (
                  /* WALK-IN PASSES (REGULAR & STUDENT) ONLY */
                  <div className="grid grid-cols-2 gap-2">
                    {/* REGULAR PASS */}
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
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedEntry === 'walkin_regular' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                        }`}>
                          <Ticket className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate">Regular Pass</div>
                          <div className="text-[10px] text-slate-500 truncate">Daily pass</div>
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0 ml-1">
                        ₱90.00
                      </div>
                    </button>

                    {/* STUDENT PASS */}
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
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedEntry === 'walkin_student' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                        }`}>
                          <GraduationCap className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white uppercase truncate">Student Pass</div>
                          <div className="text-[10px] text-amber-500 font-bold truncate">ID required</div>
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0 ml-1">
                        ₱60.00
                      </div>
                    </button>
                  </div>
                ) : (
                  /* REGISTERED MEMBER PLAN ENTRY ONLY */
                  (() => {
                    const isInactive = selectedClient.status === 'Expired' || selectedClient.status === 'Suspended';
                    const isYearly = selectedClient.membership?.toLowerCase().includes('year');

                    return (
                      <button
                        type="button"
                        disabled={isInactive}
                        onClick={() => setSelectedEntry('member_entry')}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isInactive
                            ? 'opacity-40 cursor-not-allowed border-(--border-color) bg-slate-100/40 dark:bg-zinc-900/40'
                            : selectedEntry === 'member_entry'
                            ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/50 cursor-pointer'
                            : 'border-(--border-color) bg-(--bg-card) hover:border-slate-400 dark:hover:border-zinc-600 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            selectedEntry === 'member_entry' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            <UserCheck className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white uppercase">Member Plan Entry</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {isInactive ? `Account ${selectedClient.status}` : selectedClient.membership}
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs font-extrabold text-slate-900 dark:text-white shrink-0">
                          {isYearly ? '₱70.00' : '₱0.00'}
                        </div>
                      </button>
                    );
                  })()
                )}
              </div>

              {/* BILLING & PAYMENT SUMMARY WITH EMPHASIZED TOTAL COST */}
              {selectedEntry && (
                <div className="p-3.5 bg-slate-50 dark:bg-zinc-900/50 border border-(--border-color) rounded-2xl space-y-3 shadow-xs text-xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 block">
                    BILLING & SETTLEMENT
                  </span>

                  {derivedBilling.totalDue === 0 ? (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-2 font-bold">
                      <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-xs leading-tight">
                        NO PAYMENT REQUIRED. MONTHLY SUBSCRIPTION COVERS TODAY'S ENTRY.
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
                                <span className="inline-flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Cash</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> GCash</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {paymentMethod === 'Cash' ? (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">Amount Received</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                            <input
                              type="number"
                              value={amountReceived}
                              onChange={(e) => setAmountReceived(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-8 pr-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-slate-900 dark:text-white font-mono font-bold text-sm"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">GCash Reference Number</label>
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
                      <span className="font-bold text-slate-900 dark:text-white truncate max-w-45 uppercase">{derivedBilling.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Entry Fee:</span>
                      <span className="font-bold text-slate-900 dark:text-white">₱{derivedBilling.subtotal.toFixed(2)}</span>
                    </div>
                    {paymentMethod === 'GCash' && derivedBilling.convenienceFee > 0 && (
                      <div className="flex justify-between">
                        <span>Convenience Fee:</span>
                        <span className="text-rose-500 font-bold">+₱10.00</span>
                      </div>
                    )}
                    {amountReceived && paymentMethod === 'Cash' && derivedBilling.totalDue > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                        <span>Calculated Change:</span>
                        <span>₱{derivedBilling.calculatedChange.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  {/* HIGH-IMPACT PROMINENT TOTAL COST BANNER */}
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
                    disabled={!isFormValid || isSubmitting || isLockedByDuplicate}
                    className="w-full py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg transition-all duration-200"
                  >
                    {isSubmitting ? 'RECORDING CHECK-IN...' : 'COMPLETE CHECK-IN'}
                  </Button>
                </div>
              )}

            </div>
          )}

        </div>
      ) : (
        /* SUCCESS ANIMATION OVERLAY */
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
                <img src={photoModal.url} alt={photoModal.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-center space-y-1">
                  <User className="w-16 h-16 text-slate-500 mx-auto" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">No Image Uploaded</span>
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
    </Modal>
  );
};