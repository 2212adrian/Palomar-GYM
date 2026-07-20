// src/pages/logbook/components/LogbookRecordAttendance.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { Search, X, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { supabase } from '../../../lib/supabase/client';

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
}

const STATIC_MEMBERS: MemberProfile[] = [
  {
    id: 'mem-1',
    name: 'John Dela Cruz',
    memberId: 'WOLF-M-2026-0042',
    membership: 'Monthly Plan',
    status: 'Active',
    phone: '0917-123-4567',
    email: 'john.delacruz@gmail.com',
    address: '6B Judge A. Roldan St., Navotas City',
    regDate: 'Jan 15, 2026',
    expDate: 'Aug 15, 2026',
    lastVisit: 'July 15, 2026',
    todayVisits: 1
  },
  {
    id: 'mem-2',
    name: 'Jane Santos',
    memberId: 'WOLF-M-2026-0089',
    membership: 'Monthly Plan',
    status: 'Expires Soon',
    phone: '0918-987-6543',
    email: 'jane.santos@yahoo.com',
    address: '123 Barangay Central, Quezon City',
    regDate: 'June 20, 2026',
    expDate: 'July 20, 2026',
    lastVisit: 'July 14, 2026',
    todayVisits: 0
  },
  {
    id: 'mem-3',
    name: 'Michael Reyes',
    memberId: 'WOLF-Y-2025-0112',
    membership: 'Yearly Subscription',
    status: 'Expired',
    phone: '0909-889-3819',
    email: 'michael.reyes@gmail.com',
    address: 'Muaythai Boxing Gym Street, Malabon',
    regDate: 'July 10, 2025',
    expDate: 'July 10, 2026',
    lastVisit: 'July 10, 2026',
    todayVisits: 0
  },
  {
    id: 'mem-4',
    name: 'Sarah Geronimo',
    memberId: 'WOLF-M-2026-0015',
    membership: 'Monthly Plan',
    status: 'Suspended',
    phone: '0915-444-2222',
    email: 'sarah.g@gmail.com',
    address: 'Tondo, Manila',
    regDate: 'Feb 12, 2026',
    expDate: 'Sept 12, 2026',
    lastVisit: 'June 30, 2026',
    todayVisits: 0
  }
];

export const LogbookRecordAttendance: React.FC<LogbookRecordAttendanceProps> = ({
  isOpen,
  onClose,
  onCheckInSuccess,
}) => {
  const [ratesConfig, setRatesConfig] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const isSubmittingRef = useRef(false);

  // Progressive Wizard States - Walk-In set as the starting default [1]
  const [customerType, setCustomerType] = useState<'Walk-In' | 'Existing Member' | 'New Membership' | null>('Walk-In');
  const [customerConfirmed, setCustomerConfirmed] = useState(false);

  // Walk-In Flow States
  const [walkInName, setWalkInName] = useState('');
  const [walkInCategory, setWalkInCategory] = useState<'Regular' | 'Student'>('Regular');

  // Existing Member Flow States
  const [memberSearch, setMemberSearch] = useState('');
  const [suggestions, setSuggestions] = useState<MemberProfile[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberProfile | null>(null);
  const [validationError, setMemberValidationError] = useState<string | null>(null);

  // New Membership Forms
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newGender, setNewGender] = useState('Male');
  const [newBirthdate, setNewBirthdate] = useState('');
  const [newEmergencyContact, setNewEmergencyContact] = useState('');
  const [newMembershipType, setNewMembershipType] = useState<'Monthly' | 'Yearly' | null>(null);
  const [cardFeeEnabled, setCardFeeEnabled] = useState(true);
  const [policyAcknowledge, setPolicyAcknowledge] = useState(false);

  // Payment States
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Sizing adjustments with overflow-visible specifically on active members search to avoid clipped lists [1]
  const modalClassName = useMemo(() => {
    if (customerType === 'New Membership' && !customerConfirmed) {
      return "max-w-2xl w-full mx-auto my-8 p-6 overflow-y-auto max-h-[calc(100vh-4rem)]";
    }
    if (customerType === 'Existing Member' && !customerConfirmed) {
      return "max-w-md w-full mx-auto my-8 p-6 overflow-visible"; // Lets selection drop down cleanly past modal walls [1]
    }
    return "max-w-md w-full mx-auto my-8 p-6 overflow-y-auto max-h-[calc(100vh-4rem)]";
  }, [customerType, customerConfirmed]);

  useEffect(() => {
    const fetchRatesConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('rates_config')
          .select('*')
          .eq('id', 1)
          .single();
        if (!error && data) {
          setRatesConfig(data);
        }
      } catch (err) {
        console.error('Error fetching rates_config:', err);
      }
    };
    if (isOpen) {
      fetchRatesConfig();
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      resetWizard();
    }
  }, [isOpen]);

  const resetWizard = () => {
    setCustomerType('Walk-In'); // Walks-in default on re-entry [1]
    setCustomerConfirmed(false);
    setWalkInName('');
    setWalkInCategory('Regular');
    setMemberSearch('');
    setSelectedMember(null);
    setMemberValidationError(null);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewAddress('');
    setNewGender('Male');
    setNewBirthdate('');
    setNewEmergencyContact('');
    setNewMembershipType(null);
    setCardFeeEnabled(true);
    setPolicyAcknowledge(false);
    setPaymentMethod('Cash');
    setAmountReceived('');
    setReferenceNumber('');
  };

  const handleMemberSearchChange = (val: string) => {
    setMemberSearch(val);
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }
    const filtered = STATIC_MEMBERS.filter(m => 
      m.name.toLowerCase().includes(val.toLowerCase()) || 
      m.memberId.toLowerCase().includes(val.toLowerCase())
    );
    setSuggestions(filtered);
  };

  const handleSelectMember = (member: MemberProfile) => {
    setSelectedMember(member);
    setMemberSearch(member.name);
    setSuggestions([]);
  };

  const handleConfirmWalkIn = () => {
    if (!walkInName.trim()) {
      toast.error('Please enter the customer name.');
      return;
    }
    setCustomerConfirmed(true);
  };

  const handleConfirmExistingMember = () => {
    if (!selectedMember) {
      toast.error('Please search and select a member profile.');
      return;
    }

    if (selectedMember.status === 'Expired') {
      setMemberValidationError('Membership subscription is no longer active.');
      setCustomerConfirmed(false);
    } else if (selectedMember.status === 'Suspended') {
      setMemberValidationError('This account has been Suspended. Check-In is denied.');
      setCustomerConfirmed(false);
    } else {
      setMemberValidationError(null);
      setCustomerConfirmed(true);
    }
  };

  const handleRouteToRenewal = (m: MemberProfile) => {
    resetWizard();
    setCustomerType('New Membership');
    setNewName(m.name);
    setNewPhone(m.phone);
    setNewEmail(m.email);
    setNewAddress(m.address);
  };

  const handleConfirmRegistration = () => {
    if (!newName.trim() || !newPhone.trim()) {
      toast.error('Name and Phone fields are required.');
      return;
    }
    if (!newMembershipType) {
      toast.error('Please select a membership plan.');
      return;
    }
    if (!policyAcknowledge) {
      toast.error('Receptionist must acknowledge membership terms.');
      return;
    }
    setCustomerConfirmed(true);
  };

  const calculateFees = useMemo(() => {
    let subtotal = 0;
    let details = 'Daily Gym Pass';

    if (customerType === 'Walk-In') {
      subtotal = walkInCategory === 'Regular' ? 90 : 60;
      details = `Walk-In Pass (${walkInCategory})`;
    } else if (customerType === 'Existing Member') {
      if (selectedMember) {
        const isYearly = selectedMember.membership.toLowerCase().includes('year');
        subtotal = isYearly ? 70 : 0;
        details = `Member Pass (${selectedMember.membership})`;
      }
    } else if (customerType === 'New Membership') {
      if (newMembershipType) {
        subtotal = newMembershipType === 'Monthly' 
          ? (ratesConfig?.monthly_rate || 800) 
          : (ratesConfig?.yearly_rate || 8000);
        if (cardFeeEnabled) {
          subtotal += 150;
        }
        details = `${newMembershipType} Membership Surcharge`;
      }
    }

    const gcashSurcharge = paymentMethod === 'GCash' ? 10 : 0;
    const totalDue = Math.max(0, subtotal + gcashSurcharge);
    const change = Math.max(0, (Number(amountReceived) || 0) - totalDue);

    return {
      subtotal,
      totalDue,
      change,
      details,
      gcashFee: gcashSurcharge,
      cardFee: cardFeeEnabled && customerType === 'New Membership' ? 150 : 0
    };
  }, [customerType, walkInCategory, selectedMember, newMembershipType, cardFeeEnabled, paymentMethod, amountReceived, ratesConfig]);

  useEffect(() => {
    if (paymentMethod === 'Cash') {
      setAmountReceived(calculateFees.totalDue > 0 ? calculateFees.totalDue.toString() : '');
    } else {
      setAmountReceived('');
    }
  }, [paymentMethod, calculateFees.totalDue]);

  const handleCompleteCheckIn = () => {
    if (isSubmittingRef.current || isSuccess) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const clientName = customerType === 'New Membership' 
      ? newName.trim() 
      : (selectedMember ? selectedMember.name : walkInName.trim());

    const newRecord = {
      id: `CHK-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      memberId: selectedMember ? selectedMember.memberId : (customerType === 'New Membership' ? `WOLF-M-2026-${Math.floor(1000 + Math.random() * 9000)}` : null),
      customerName: clientName,
      customerType,
      categoryOrPlan: calculateFees.details,
      paymentMethod: calculateFees.totalDue > 0 ? paymentMethod : 'Free',
      amountPaid: calculateFees.totalDue,
      paymentStatus: calculateFees.totalDue > 0 ? 'Paid' : 'Free', // Standard defaults to PAID directly [1]
      referenceNumber: paymentMethod === 'GCash' ? referenceNumber : undefined, // Persists reference tracking [1]
      status: selectedMember ? selectedMember.status : 'Active'
    };

    setIsSuccess(true);

    setTimeout(() => {
      onCheckInSuccess(newRecord);
      setIsSuccess(false);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      onClose();
    }, 1500);
  };

  const isFormValid = useMemo(() => {
    if (!customerConfirmed) return false;
    if (calculateFees.totalDue === 0) return true;
    if (paymentMethod === 'Cash') {
      return (Number(amountReceived) || 0) >= calculateFees.totalDue;
    } else {
      return referenceNumber.trim().length >= 6;
    }
  }, [customerConfirmed, paymentMethod, amountReceived, referenceNumber, calculateFees.totalDue]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="RECORD ATTENDANCE"
      className={`${modalClassName} transition-all duration-300 relative`}
    >
      {/* Absolute Close (X) Trigger */}
      <button
        type="button"
        disabled={isSubmitting}
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
        aria-label="Close Dialog"
      >
        <X className="w-5 h-5" />
      </button>

      {!isSuccess ? (
        <div className="space-y-4 pt-2 text-left">
          {/* STEP 1: CATEGORY SELECTION */}
          {!customerConfirmed && (
            <div className="p-4 bg-slate-50/50 dark:bg-neutral-900/10 border border-(--border-color) rounded-2xl space-y-3 shadow-xs">
              <span className="text-[9px] font-heading tracking-wider uppercase text-slate-455 block">
                STEP 1. SELECT CUSTOMER CATEGORY
              </span>
              
              <div className="grid grid-cols-3 gap-2 select-none">
                {(['Walk-In', 'Existing Member', 'New Membership'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      resetWizard();
                      setCustomerType(type);
                    }}
                    className={`py-3.5 text-[9px] font-heading tracking-widest uppercase rounded-xl cursor-pointer border transition-all ${
                      customerType === type
                        ? 'bg-[#bf0202] text-white border-transparent shadow-md font-bold'
                        : 'bg-(--bg-card) border-(--border-color) text-slate-450 hover:text-(--color-text)'
                    }`}
                  >
                    {type === 'New Membership' ? 'Registration' : type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: CUSTOMER VALIDATION */}
          {customerType && !customerConfirmed && (
            <div className="p-4 bg-slate-50/50 dark:bg-neutral-900/10 border border-(--border-color) rounded-2xl space-y-4 shadow-xs">
              <span className="text-[9px] font-heading tracking-wider uppercase text-slate-455 block">
                STEP 2. CUSTOMER VALIDATION
              </span>

              {customerType === 'Walk-In' && (
                <div className="space-y-4">
                  <div className="grid gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Customer Name</label>
                    <input
                      type="text"
                      value={walkInName}
                      onChange={(e) => setWalkInName(e.target.value)}
                      placeholder="Enter customer's full name"
                      className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Customer Category</label>
                    <div className="grid grid-cols-2 gap-3 select-none">
                      {(['Regular', 'Student'] as const).map((cat) => {
                        const price = cat === 'Regular' ? 90 : 60;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setWalkInCategory(cat)}
                            className={`py-3.5 text-[9px] font-heading tracking-widest uppercase rounded-xl cursor-pointer border transition-all ${
                              walkInCategory === cat
                                ? 'bg-(--bg-input) text-(--color-text) border border-(--border-color) font-extrabold shadow-sm'
                                : 'bg-(--bg-card) border-(--border-color) text-slate-450 hover:text-(--color-text)'
                            }`}
                          >
                            <div className="font-bold">{cat} Pass</div>
                            <div className="text-[11px] font-mono text-(--color-primary-light) mt-1 font-extrabold">
                              ₱{price.toFixed(2)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Button
                    onClick={handleConfirmWalkIn}
                    variant="primary"
                    className="w-full py-2.5 font-heading tracking-widest"
                  >
                    CONFIRM WALK-IN
                  </Button>
                </div>
              )}

              {customerType === 'Existing Member' && (
                <div className="space-y-4">
                  <div className="relative">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455 block mb-1">Search Member Name / ID</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => handleMemberSearchChange(e.target.value)}
                        placeholder="Search member name, phone, or QR"
                        className="w-full pl-9 pr-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) placeholder-slate-500 outline-none focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>

                    {suggestions.length > 0 && (
                      <div className="absolute top-16 left-0 right-0 bg-(--bg-card) border border-(--border-color) rounded-xl shadow-2xl overflow-hidden z-20 divide-y divide-(--border-color)">
                        {suggestions.map((m) => {
                          const isLocked = m.status === 'Expired' || m.status === 'Suspended';
                          const displayMembership = m.status === 'Active' || m.status === 'Expires Soon'
                            ? (m.membership.toLowerCase().includes('month') ? 'Monthly Subscription' : 'Yearly Subscription')
                            : 'N/A';
                          
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={isLocked}
                              onClick={() => handleSelectMember(m)}
                              className={`w-full text-left p-3 text-xs flex justify-between items-center transition-colors ${
                                isLocked 
                                  ? 'bg-rose-500/5 dark:bg-rose-500/10 opacity-50 cursor-not-allowed' 
                                  : 'hover:bg-slate-50/50 dark:hover:bg-neutral-900/20 text-(--color-text) cursor-pointer'
                              }`}
                            >
                              <div>
                                <div className="font-bold">{m.name}</div>
                                <div className="text-[10px] text-slate-455 mt-0.5 font-mono font-semibold">
                                  {displayMembership}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className={`font-bold text-[9px] uppercase tracking-wider ${
                                  m.status === 'Active' ? 'text-emerald-500' : m.status === 'Expires Soon' ? 'text-amber-500' : 'text-rose-500'
                                }`}>
                                  {m.status}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Display directory warning ONLY if no selection has been locked and suggests search query is active */}
                    {memberSearch.trim() && suggestions.length === 0 && !selectedMember && (
                      <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl leading-relaxed flex flex-col gap-2 font-semibold mt-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>No registered member found in directory.</span>
                        </div>
                        <Button
                          onClick={() => {
                            resetWizard();
                            setCustomerType('New Membership');
                            setNewName(memberSearch);
                          }}
                          variant="secondary"
                          className="w-full mt-1 border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                        >
                          Register New Account
                        </Button>
                      </div>
                    )}
                  </div>

                  {selectedMember && (
                    <Button
                      onClick={handleConfirmExistingMember}
                      variant="primary"
                      className="w-full py-2.5 font-heading tracking-widest uppercase font-black"
                    >
                      CONFIRM MEMBER
                    </Button>
                  )}

                  {validationError && (
                    <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl leading-relaxed flex flex-col gap-2 font-semibold">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>Subscription Not Active</span>
                      </div>
                      <Button
                        onClick={() => handleRouteToRenewal(selectedMember!)}
                        variant="secondary"
                        className="w-full mt-1 border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                      >
                        Activate / Renew Subscription
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {customerType === 'New Membership' && (
                <div className="space-y-4">
                  <span className="text-[9px] font-heading tracking-widest text-[#bf0202] uppercase block">
                    CUSTOMER REGISTRATION SHEET
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Full Name</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Juan Dela Cruz"
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>
                    
                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Phone Contact</label>
                      <input
                        type="text"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="09170001122"
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Email Address</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="juan@email.com"
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Emergency Contact (Phone)</label>
                      <input
                        type="text"
                        value={newEmergencyContact}
                        onChange={(e) => setNewEmergencyContact(e.target.value)}
                        placeholder="Name / 0917-0000"
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Home Address</label>
                      <input
                        type="text"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        placeholder="Barangay Central, Quezon City"
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Gender</label>
                      <select
                        value={newGender}
                        onChange={(e) => setNewGender(e.target.value)}
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="grid gap-1.5 sm:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Birthdate</label>
                      <input
                        type="date"
                        value={newBirthdate}
                        onChange={(e) => setNewBirthdate(e.target.value)}
                        className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </div>
                  </div>

                  {/* plan selection */}
                  <div className="space-y-2 pt-2 border-t border-(--border-color)">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Select Membership Surcharge Plan</label>
                    <div className="grid grid-cols-2 gap-3 select-none">
                      {[
                        { key: 'Monthly', price: 800, desc: '30 Days Gym Access, full cardio & weights' },
                        { key: 'Yearly', price: 8000, desc: '365 Days Access, guest passes & sashes' }
                      ].map((plan) => (
                        <button
                          key={plan.key}
                          type="button"
                          onClick={() => setNewMembershipType(plan.key as any)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            newMembershipType === plan.key
                              ? 'border-blue-500 bg-blue-500/5'
                              : 'border-(--border-color) bg-(--bg-page) hover:bg-slate-100/50'
                          }`}
                        >
                          <div className="flex justify-between font-bold text-(--color-text)">
                            <span className="uppercase text-[9px] tracking-wide font-heading">{plan.key} Plan</span>
                            <span>₱{plan.price}</span>
                          </div>
                          <p className="text-[9px] text-slate-455 mt-1 font-semibold leading-tight">{plan.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-(--bg-page) p-3 border border-(--border-color) rounded-xl h-10.5">
                    <input
                      type="checkbox"
                      id="cardFeeCheck"
                      checked={cardFeeEnabled}
                      onChange={(e) => setCardFeeEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-white/10 text-(--color-primary) accent-(--color-primary)"
                    />
                    <label htmlFor="cardFeeCheck" className="text-[10px] uppercase font-bold tracking-wider text-slate-455 cursor-pointer select-none">
                      Issue RFID Member Card (+₱150)
                    </label>
                  </div>

                  <div className="p-3.5 bg-slate-100 dark:bg-zinc-900 border border-(--border-color) rounded-xl space-y-3 font-mono text-[9px] text-slate-500 leading-normal">
                    <span className="font-bold text-slate-700 dark:text-slate-300 block text-[9.5px]">GYM MEMBERSHIP CONTRACT POLICY</span>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Membership registration fees are NON-REFUNDABLE.</li>
                      <li>Subscriptions are personal and cannot be transferred.</li>
                    </ul>
                    <div className="flex items-start gap-2.5 pt-1.5 border-t border-(--border-color)">
                      <input
                        type="checkbox"
                        id="agreeTerms"
                        checked={policyAcknowledge}
                        onChange={(e) => setPolicyAcknowledge(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-zinc-800 text-[#bf0202] accent-[#bf0202] cursor-pointer mt-0.5"
                      />
                      <label htmlFor="agreeTerms" className="text-slate-600 dark:text-slate-400 font-bold select-none cursor-pointer">
                        I confirm that the customer understands and accepts the membership terms.
                      </label>
                    </div>
                  </div>

                  <Button
                    onClick={handleConfirmRegistration}
                    variant="primary"
                    className="w-full py-2.5 font-heading tracking-widest uppercase font-black"
                  >
                    CONFIRM REGISTRATION
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: COMPACT VALIDATED ATTENDANCE SUMMARY CARD */}
          {customerConfirmed && (
            <div className="p-4 bg-slate-50/50 dark:bg-neutral-900/10 border border-(--border-color) rounded-2xl space-y-3 shadow-xs font-mono">
              <span className="text-[10px] font-heading tracking-wider uppercase text-slate-455 block">
                STEP 3. VERIFIED CLIENT INFORMATION
              </span>

              {customerType === 'Walk-In' ? (
                <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between text-[10px] leading-tight text-slate-455 font-mono">
                  <div className="space-y-1">
                    <p className="font-bold text-xs text-(--color-text)">{walkInName}</p>
                    <p className="text-[9px] uppercase font-bold text-slate-500">
                      Category: <span className="text-[var(--color-primary-light)]">{walkInCategory} Pass</span>
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    {walkInCategory === 'Student' ? (
                      <div>
                        <span className="line-through text-slate-400 mr-1.5">₱90.00</span>
                        <span className="font-extrabold text-emerald-500">₱60.00</span>
                      </div>
                    ) : (
                      <span className="font-extrabold text-(--color-text)">₱90.00</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-start gap-3.5 text-[10px] leading-tight text-slate-455 font-mono">
                  <div className="w-11 h-11 rounded-full bg-(--bg-card) border border-(--border-color) flex items-center justify-center font-heading text-slate-500 font-bold text-sm shrink-0 overflow-hidden relative">
                    {selectedMember ? (
                      <span className="text-[var(--color-primary-light)] text-xl font-bold">{selectedMember.name[0]}</span>
                    ) : (
                      <span className="text-slate-500 text-xl font-bold">{newName[0]}</span>
                    )}
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-bold text-xs text-(--color-text) truncate">
                      {selectedMember ? selectedMember.name : newName}
                    </p>
                    <p className="text-[8.5px] uppercase font-bold text-slate-500">
                      Contact: <span className="text-(--color-text) font-semibold">{selectedMember ? selectedMember.phone : newPhone}</span>
                    </p>
                    <p className="text-[8.5px] text-slate-500">
                      Joined: {selectedMember ? selectedMember.regDate : format(new Date(), 'MMM d, yyyy')}
                    </p>
                    <p className="text-[8.5px] text-slate-500">
                      Plan: <span className="text-[var(--color-primary-light)] font-bold">
                        {selectedMember 
                          ? (selectedMember.membership.toLowerCase().includes('month') ? 'Monthly Subscription' : 'Yearly Subscription') 
                          : `${newMembershipType} Subscription`}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {customerType === 'Existing Member' && selectedMember ? (
                      <div className="space-y-1">
                        <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 uppercase tracking-widest text-[8px] font-heading font-black">
                          {selectedMember.status}
                        </span>
                        <p className="text-[8.5px] text-slate-500 mt-1 block">
                          {selectedMember.membership.toLowerCase().includes('year') ? '₱70.00 Entry' : 'Free Entry'}
                        </p>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 uppercase tracking-widest text-[8px] font-heading font-black">
                        REGISTERED
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: DESK BILLING DETAILS */}
          {customerConfirmed && (
            <div className="p-4 bg-slate-50/50 dark:bg-neutral-900/10 border border-(--border-color) rounded-2xl space-y-4 shadow-xs animate-fade-in">
              <span className="text-[10px] font-heading tracking-wider uppercase text-slate-455 block">
                STEP 4. DESK BILLING DETAILS
              </span>

              <div className="space-y-2.5">
                <div className="grid grid-cols-2 bg-(--bg-page) p-1 rounded-xl border border-(--border-color)">
                  {(['Cash', 'GCash'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 text-[10px] font-heading tracking-widest uppercase rounded-lg cursor-pointer transition-all ${
                        paymentMethod === method
                          ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-md font-bold'
                          : 'text-slate-455 hover:text-[var(--color-text)]'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>

                {calculateFees.totalDue > 0 && (
                  <div className="grid grid-cols-1 gap-2.5 animate-fade-in">
                    {paymentMethod === 'Cash' ? (
                      <div className="grid gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Amount Received</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono">₱</span>
                          <input
                            type="number"
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-8 pr-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary) font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-455">GCash Transaction REF No</label>
                        <input
                          type="text"
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          placeholder="E.g., REF-989159849359"
                          className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) focus:ring-1 focus:ring-(--color-primary) font-mono"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-(--bg-page) border border-(--border-color) space-y-1.5 text-xs font-sans font-medium">
                <div className="flex justify-between text-slate-500">
                  <span>Filing Slip:</span>
                  <span className="font-semibold text-(--color-text)">{calculateFees.details}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Entry Fee:</span>
                  <span className="font-semibold text-(--color-text)">
                    ₱{(calculateFees.subtotal - calculateFees.gcashFee - calculateFees.cardFee).toFixed(2)}
                  </span>
                </div>
                {calculateFees.cardFee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>RFID Card Surcharge:</span>
                    <span className="font-semibold text-(--color-text)">₱150.00</span>
                  </div>
                )}
                {paymentMethod === 'GCash' && calculateFees.gcashFee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>GCash Convenience Fee:</span>
                    <span className="text-rose-500 font-bold">+₱10.00</span>
                  </div>
                )}
                {amountReceived && paymentMethod === 'Cash' && calculateFees.totalDue > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-sans font-bold">
                    <span>Calculated Change:</span>
                    <span>₱{calculateFees.change.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-(--border-color) pt-1.5 flex justify-between font-heading text-sm text-(--color-text)">
                  <span>TOTAL PAYABLE:</span>
                  <span className="text-(--color-primary) font-extrabold">
                    ₱{calculateFees.totalDue.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: BOTTOM STICKY COMPLETE TRIGGERS */}
          {customerConfirmed && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-(--border-color) mt-4">
              <Button
                type="button"
                variant="primary"
                onClick={handleCompleteCheckIn}
                disabled={!isFormValid || isSubmitting}
                className="w-full py-3.5 text-[10px] font-heading tracking-widest uppercase font-bold shrink-0 shadow-md animate-fade-in"
              >
                COMPLETE CHECK-IN
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-pulse">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="font-heading text-lg tracking-wider text-(--color-text)">
            CHECK-IN AUTHORIZED
          </h2>
          <p className="text-xs text-slate-444 dark:text-slate-400 max-w-xs text-center font-body animate-pulse">
            Filing check-in record to database and registering active counter logs.
          </p>
        </div>
      )}
    </Modal>
  );
};
