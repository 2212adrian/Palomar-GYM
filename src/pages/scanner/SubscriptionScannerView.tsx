// src/pages/scanner/SubscriptionScannerView.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Calendar, 
  Clock, 
  ArrowRight,
  CreditCard,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-toastify';
import { memberService, subscriptionService, cardService } from '../members/memberService';
import type { Member, Subscription, MemberCard } from '../../types/members';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { parseScannedMemberCode } from './scannerService';
import { supabase } from '../../lib/supabase/client';

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

interface SubscriptionScannerViewProps {
  scannedCode: string | null;
  onClearScan: () => void;
}

interface SubscriptionData {
  id: string;
  memberId: string;
  fullName: string;
  avatarUrl?: string | null;
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  planName: string;
  startDate: string;
  expDate: string;
  remainingDays: number;
}

export const SubscriptionScannerView: React.FC<SubscriptionScannerViewProps> = ({
  scannedCode,
  onClearScan,
}) => {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!scannedCode) {
      setSubData(null);
      setNotFound(false);
      return;
    }

    const lookupSubscription = async () => {
      setIsLoading(true);
      setNotFound(false);
      setSubData(null);

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
          let calculatedStatus: SubscriptionData['status'] = 'Expired';
          let planName = 'No Active Subscription';
          let startDateStr = 'N/A';
          let expDateStr = 'N/A';
          let remainingDays = 0;

          if (member.status === 'Suspended') {
            calculatedStatus = 'Suspended';
          } else if (activeSub) {
            planName = activeSub.plan_name || 'Active Membership';
            startDateStr = new Date(activeSub.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            expDateStr = new Date(activeSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            const endDate = new Date(activeSub.end_date);
            remainingDays = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

            if (remainingDays <= 0) {
              calculatedStatus = 'Expired';
            } else if (remainingDays <= 7) {
              calculatedStatus = 'Expires Soon';
            } else {
              calculatedStatus = 'Active';
            }
          }

          setSubData({
            id: member.id,
            memberId: member.member_id,
            fullName: member.full_name,
            avatarUrl: member.avatar_url || null,
            status: calculatedStatus,
            planName,
            startDate: startDateStr,
            expDate: expDateStr,
            remainingDays
          });
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Subscription lookup failed:', err);
        toast.error('Subscription lookup failed.');
      } finally {
        setIsLoading(false);
      }
    };

    lookupSubscription();
  }, [scannedCode]);

  if (!scannedCode) return null;

  return (
    <Modal
      isOpen={Boolean(scannedCode)}
      onClose={onClearScan}
      title="SUBSCRIPTION STATUS INSPECTOR"
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
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Checking Subscription Plan...</p>
        </div>
      ) : subData ? (
        <div className="space-y-4 pt-1">
          <div className="p-4 bg-slate-50 dark:bg-zinc-900 border-2 border-(--border-color) rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white overflow-hidden flex items-center justify-center font-black text-lg shrink-0 border border-blue-500/40">
                {subData.avatarUrl ? (
                  <img src={subData.avatarUrl} alt={subData.fullName} className="w-full h-full object-cover" />
                ) : (
                  <span>{subData.fullName[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base text-(--color-text) truncate uppercase">
                  {subData.fullName}
                </h3>
                <p className="text-xs text-slate-500 font-mono">ID: {subData.memberId}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-(--border-color) text-xs">
              <div className="p-2.5 bg-(--bg-card) rounded-xl border border-(--border-color) space-y-0.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase block flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-500" /> Start Date
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {subData.startDate}
                </span>
              </div>

              <div className="p-2.5 bg-(--bg-card) rounded-xl border border-(--border-color) space-y-0.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase block flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-500" /> End Date
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {subData.expDate}
                </span>
              </div>
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between text-xs">
              <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">
                Plan: {subData.planName}
              </span>
              <span className="font-mono font-black text-blue-600 dark:text-blue-400">
                {subData.remainingDays} Days Remaining
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onClearScan();
              navigate('/members/plans');
            }}
            className="w-full py-3.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <CreditCard className="w-4.5 h-4.5" />
            <span>MANAGE SUBSCRIPTION PLAN</span>
          </Button>
        </div>
      ) : notFound ? (
        <div className="space-y-4 py-2 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-(--color-text) uppercase">NO SUBSCRIPTION FOUND</h3>
            <p className="text-xs text-slate-500 font-mono mt-1">"{scannedCode}"</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onClearScan();
              navigate('/members/plans');
            }}
            className="w-full py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>ENROLL NEW SUBSCRIPTION</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      ) : null}
    </Modal>
  );
};