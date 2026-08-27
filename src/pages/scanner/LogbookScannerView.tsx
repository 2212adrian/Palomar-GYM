// src/pages/scanner/LogbookScannerView.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  UserCheck, 
  AlertTriangle, 
  ArrowRight,
  CircleDollarSign,
  CreditCard
} from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { memberService, subscriptionService, cardService } from '../members/memberService';
import type { Member, Subscription, MemberCard } from '../../types/members';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { parseScannedMemberCode } from './scannerService';

import beepSoundUrl from '../../assets/beep-scanner.mp3';

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

interface LogbookScannerViewProps {
  scannedCode: string | null;
  onClearScan: () => void;
}

interface MemberLogbookData {
  id: string;
  memberId: string;
  fullName: string;
  phone: string;
  avatarUrl?: string | null;
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  membershipPlan: string;
  alreadyCheckedInToday: boolean;
}

export const LogbookScannerView: React.FC<LogbookScannerViewProps> = ({
  scannedCode,
  onClearScan,
}) => {
  const navigate = useNavigate();
  const { user } = useAuthStore() as any;

  const [isLoading, setIsLoading] = useState(false);
  const [memberData, setMemberData] = useState<MemberLogbookData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment Settlement
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [yearlyMemberFee, setYearlyMemberFee] = useState(50);
  const [gcashFeeRate, setGcashFeeRate] = useState(10);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const { data } = await supabase
          .from('rates_config')
          .select('yearly_walk_in, gcash_fee')
          .eq('id', 1)
          .maybeSingle();

        if (data) {
          setYearlyMemberFee(Number(data.yearly_walk_in) || 50);
          setGcashFeeRate(Number(data.gcash_fee) ?? 10);
        }
      } catch (err) {
        console.warn('Failed to load rates_config:', err);
      }
    };
    fetchRates();
  }, []);

  useEffect(() => {
    if (!scannedCode) {
      setMemberData(null);
      setNotFound(false);
      setPaymentMethod('Cash');
      setReferenceNumber('');
      return;
    }

    const lookupMemberForLogbook = async () => {
      setIsLoading(true);
      setNotFound(false);
      setMemberData(null);

      try {
        const cleanCode = scannedCode.trim().toUpperCase();
        if (cleanCode.startsWith('REG-') || cleanCode.includes('REG-')) {
          const { data: regData } = await supabase
            .from('online_registrations')
            .select('*')
            .is('deleted_at', null)
            .or(`id.ilike.${cleanCode}`)
            .maybeSingle();

          if (regData) {
            playBeepSound();
            onClearScan();
            navigate('/members/plans', {
              state: {
                openWizard: true,
                initialStep: 1,
                initialIntakeMode: 'Manual',
                prefillData: regData
              }
            });
            return;
          }
        }
      
        const [allCards, allMembers, allSubscriptions] = await Promise.all([
          cardService.getAll(),
          memberService.getAll(),
          subscriptionService.getAll(),
        ]);

        const { fullCode, memberIdPart } = parseScannedMemberCode(scannedCode);

        const cardMatch = allCards.find((c: MemberCard) => 
          c.card_number.toLowerCase() === fullCode.toLowerCase() ||
          c.card_number.toLowerCase() === memberIdPart.toLowerCase()
        );

        const targetMemberId = cardMatch ? cardMatch.member_id : memberIdPart;

        const member = allMembers.find((m: Member) => 
          m.member_id.toLowerCase() === targetMemberId.toLowerCase() ||
          m.member_id.toLowerCase() === fullCode.toLowerCase() ||
          m.phone === fullCode ||
          m.id === fullCode
        );

        if (member) {
          playBeepSound();
          const activeSub = allSubscriptions.find(
            (s: Subscription) => s.member_id === member.member_id && s.status === 'Active'
          );

          const now = new Date();
          let calculatedStatus: MemberLogbookData['status'] = 'Expired';
          let planName = 'No Active Plan';

          if (member.status === 'Suspended') {
            calculatedStatus = 'Suspended';
          } else if (activeSub) {
            planName = activeSub.plan_name || 'Active Membership';
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

          const todayStr = new Date().toISOString().split('T')[0];
          const { data: todayAtt } = await supabase
            .from('attendance')
            .select('check_in_time')
            .is('deleted_at', null)
            .eq('member_id', member.member_id)
            .gte('check_in_time', `${todayStr}T00:00:00Z`)
            .limit(1);

          setMemberData({
            id: member.id,
            memberId: member.member_id,
            fullName: member.full_name,
            phone: member.phone || '',
            avatarUrl: member.avatar_url || null,
            status: calculatedStatus,
            membershipPlan: planName,
            alreadyCheckedInToday: Boolean(todayAtt && todayAtt.length > 0)
          });
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Logbook member lookup failed:', err);
        toast.error('Lookup failed.');
      } finally {
        setIsLoading(false);
      }
    };

    lookupMemberForLogbook();
  }, [scannedCode]);

  const isYearly = memberData?.membershipPlan.toLowerCase().includes('year');
  const baseEntryFee = isYearly ? yearlyMemberFee : 0;
  const gcashFee = paymentMethod === 'GCash' && baseEntryFee > 0 ? gcashFeeRate : 0;
  const totalDue = baseEntryFee + gcashFee;

  const handleConfirmAttendance = async () => {
    if (!memberData || isSubmitting) return;

    if (baseEntryFee > 0 && paymentMethod === 'GCash' && referenceNumber.trim().length < 6) {
      toast.error('Please enter a valid GCash reference number (min 6 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .insert([{
          member_id: memberData.memberId,
          customer_name: memberData.fullName.toUpperCase(),
          customer_type: 'Existing Member',
          check_in_time: new Date().toISOString(),
          plan_name: memberData.membershipPlan,
          entry_fee: totalDue,
          base_price: baseEntryFee,
          gcash_fee: gcashFee,
          card_fee: 0,
          gcash_ref_no: paymentMethod === 'GCash' ? referenceNumber.trim() : null,
          payment_method: paymentMethod,
          staff_name: user?.email || 'Scanner Station'
        }]);

      if (error) throw error;

      toast.success(`Check-in recorded for ${memberData.fullName}!`);
      onClearScan();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record check-in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcessAsWalkIn = () => {
    const { memberIdPart } = parseScannedMemberCode(scannedCode || '');
    const searchName = memberData?.fullName || memberIdPart;
    onClearScan();
    navigate('/logbook', { state: { openAttendanceModal: true, initialSearch: searchName } });
  };

  if (!scannedCode) return null;

  return (
    <Modal
      isOpen={Boolean(scannedCode)}
      onClose={onClearScan}
      title="LOGBOOK CHECK-IN VERIFICATION"
      className="w-full max-w-md mx-auto p-5 relative text-left animate-fade-in"
    >
      <button
        type="button"
        onClick={onClearScan}
        className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {isLoading ? (
        <div className="py-8 text-center space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verifying Member Card...</p>
        </div>
      ) : memberData ? (
        <div className="space-y-4 pt-1">
          <div className="p-4 bg-slate-50 dark:bg-zinc-900 border-2 border-(--border-color) rounded-2xl flex items-center gap-3.5">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white overflow-hidden flex items-center justify-center font-black text-xl shrink-0 border-2 border-blue-500/40 shadow-md">
              {memberData.avatarUrl ? (
                <img src={memberData.avatarUrl} alt={memberData.fullName} className="w-full h-full object-cover" />
              ) : (
                <span>{memberData.fullName[0]?.toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-bold text-sm sm:text-base text-(--color-text) truncate uppercase">
                {memberData.fullName}
              </h3>
              <p className="text-xs text-slate-500 font-mono">ID: {memberData.memberId}</p>

              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                  memberData.status === 'Active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                  memberData.status === 'Expires Soon' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30' :
                  'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
                }`}>
                  {memberData.status}
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {memberData.membershipPlan}
                </span>
              </div>
            </div>
          </div>

          {memberData.alreadyCheckedInToday && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
              <span>Already checked in today</span>
            </div>
          )}

          {baseEntryFee > 0 && (
            <div className="p-3 bg-slate-100 dark:bg-zinc-800/80 border border-(--border-color) rounded-xl space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300">
                  Yearly Entry Fee Settlement
                </span>
                <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                  Total: ₱{totalDue.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200 dark:bg-zinc-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={`py-1 text-[10px] font-bold uppercase rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    paymentMethod === 'Cash'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-(--color-text)'
                  }`}
                >
                  <CircleDollarSign className="w-3.5 h-3.5" /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('GCash')}
                  className={`py-1 text-[10px] font-bold uppercase rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    paymentMethod === 'GCash'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-(--color-text)'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" /> GCash
                </button>
              </div>

              {paymentMethod === 'GCash' && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-500 block">
                    GCash Reference Number
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="ENTER REF NO. (MIN 6 DIGITS)..."
                    className="w-full px-2 py-1 bg-(--bg-card) border border-(--border-color) rounded-lg font-mono text-xs font-bold uppercase outline-none focus:border-blue-500 text-(--color-text)"
                  />
                </div>
              )}
            </div>
          )}

          {memberData.status === 'Active' || memberData.status === 'Expires Soon' ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmAttendance}
              disabled={isSubmitting || (baseEntryFee > 0 && paymentMethod === 'GCash' && referenceNumber.trim().length < 6)}
              className="w-full py-3.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <UserCheck className="w-4.5 h-4.5" />
              <span>{isSubmitting ? 'LOGGING...' : 'CONFIRM & LOG ATTENDANCE'}</span>
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-bold uppercase text-center">
                ⚠️ Plan Expired — Daily Walk-In Fee Required
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleProcessAsWalkIn}
                className="w-full py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>PROCESS WALK-IN PASS</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      ) : notFound ? (
        <div className="space-y-4 py-2 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-(--color-text) uppercase">
              MEMBER CARD NOT FOUND
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-1">"{scannedCode}"</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleProcessAsWalkIn}
            className="w-full py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>REGISTER AS GUEST WALK-IN</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      ) : null}
    </Modal>
  );
};