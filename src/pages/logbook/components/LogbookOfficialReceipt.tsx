// src/pages/logbook/components/LogbookOfficialReceipt.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Download, Printer } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client'; 

interface LogbookOfficialReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  tx: any;
}

export const LogbookOfficialReceipt: React.FC<LogbookOfficialReceiptProps> = ({
  isOpen,
  onClose,
  tx,
}) => {
  const [gymProfile, setGymProfile] = useState<any>(null);
  const [ratesConfig, setRatesConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Core Field Resolvers
  const receiptNo = useMemo(() => tx?.receipt_no || tx?.id || 'N/A', [tx]);
  const paymentMethod = useMemo(() => tx?.payment_method || tx?.paymentMethod || 'Free', [tx]);
  const amountPaid = useMemo(() => Number(tx?.amountPaid || tx?.amount_received || 0), [tx]);
  const totalAmount = amountPaid; 
  const createdAtStr = useMemo(() => tx?.timestamp || tx?.created_at || tx?.createdAt, [tx]);
  
  const txDateStr = useMemo(() => {
    if (createdAtStr) {
      try {
        return format(parseISO(createdAtStr), 'MMM d, yyyy');
      } catch {
        return format(new Date(), 'MMM d, yyyy');
      }
    }
    return format(new Date(), 'MMM d, yyyy');
  }, [createdAtStr]);

 // Quick Fix: Declare formattedTimeStr from txTimeStr so the JPG Canvas exporter compiles cleanly
  const txTimeStr = useMemo(() => {
    if (createdAtStr) {
      try {
        return format(parseISO(createdAtStr), 'hh:mm:ss a');
      } catch {
        return format(new Date(), 'hh:mm:ss a');
      }
    }
    return format(new Date(), 'hh:mm:ss a');
  }, [createdAtStr]);

  const formattedTimeStr = txTimeStr;

  useEffect(() => {
    if (!isOpen) return;

    const fetchReceiptConfigurations = async () => {
      setLoadingConfig(true);
      try {
        const [profileRes, ratesRes] = await Promise.all([
          supabase.from('gym_profile').select('*').eq('id', 1).single(),
          supabase.from('rates_config').select('*').eq('id', 1).single()
        ]);

        if (!profileRes.error) setGymProfile(profileRes.data);
        if (!ratesRes.error) setRatesConfig(ratesRes.data);
      } catch (error) {
        console.error('Failed to load dynamic receipt parameters:', error);
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchReceiptConfigurations();
  }, [isOpen]);

  const gymName = useMemo(() => gymProfile?.gym_name || 'WOLF PALOMAR GYM', [gymProfile]);
  const gymAddress = useMemo(() => gymProfile?.gym_address || '6B Judge A. Roldan St., Navotas City', [gymProfile]);
  const staffContact = useMemo(() => {
    if (gymProfile?.contact_number_1) {
      return `Staff Contact: ${gymProfile.contact_number_1}`;
    }
    return 'Staff Contact: 09762607481 / 09123456789';
  }, [gymProfile]);

  const vatEnabled = useMemo(() => ratesConfig?.vat_enabled ?? true, [ratesConfig]);
  const vatPercentage = useMemo(() => ratesConfig?.vat_percentage ? Number(ratesConfig.vat_percentage) : 12.00, [ratesConfig]);

  // Determine receipt context type sashes
  const isSubscription = tx.customerType === 'New Membership';
  const isWalkIn = tx.customerType === 'Walk-In' || (tx.customerType === 'Existing Member' && amountPaid > 0);

  // Pricing calculations
  const breakdown = useMemo(() => {
    let basePrice = amountPaid;
    let cardFee = 0;
    let gcashFee = 0;

    if (paymentMethod === 'GCash') {
      gcashFee = 10;
      basePrice = Math.max(0, basePrice - 10);
    }

    if (isSubscription) {
      // Surcharge check RFID printing
      if (basePrice > 800 && basePrice < 1000) {
        cardFee = 150;
        basePrice = Math.max(0, basePrice - 150);
      } else if (basePrice > 8000) {
        cardFee = 150;
        basePrice = Math.max(0, basePrice - 150);
      }
    }

    const subtotal = basePrice + cardFee + gcashFee;

    return {
      basePrice,
      cardFee,
      gcashFee,
      subtotal
    };
  }, [amountPaid, paymentMethod, isSubscription]);

  const { vatableSales, vatAmount } = useMemo(() => {
    const subtotal = breakdown.subtotal;
    if (vatEnabled && vatPercentage > 0 && subtotal > 0) {
      const vatFactor = 1 + (vatPercentage / 100);
      const calculatedVatable = subtotal / vatFactor;
      return {
        vatableSales: calculatedVatable,
        vatAmount: subtotal - calculatedVatable
      };
    }
    return { vatableSales: subtotal, vatAmount: 0.00 };
  }, [breakdown.subtotal, vatEnabled, vatPercentage]);

  const handlePrintReceipt = () => {
    const content = document.getElementById('thermal-receipt-card');
    if (!content) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
      stylesHtml += el.outerHTML;
    });

    doc.write(`
      <html>
        <head>
          <title>Receipt - ${receiptNo}</title>
          ${stylesHtml}
          <style>
            @media print {
              body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
              #thermal-receipt-card { width: 80mm !important; box-shadow: none !important; border: none !important; padding: 10px !important; font-family: monospace !important; }
            }
          </style>
        </head>
        <body>
          <div id="thermal-receipt-card" class="bg-white p-4 border border-dashed border-slate-200 rounded-2xl text-black shadow-inner space-y-4">
            ${content.innerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() { window.frameElement.remove(); }, 500);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const handleDownloadReceiptJpg = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = isSubscription ? 560 : 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(gymName, 200, 45);

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(gymAddress, 200, 65);
    ctx.fillText(staffContact, 200, 80);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, 95); ctx.lineTo(370, 95); ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(isSubscription ? 'SUBSCRIPTION OFFICIAL RECEIPT' : isWalkIn ? 'WALK-IN OFFICIAL RECEIPT' : 'ATTENDANCE CHECK-IN SLIP', 200, 115);

    ctx.beginPath(); ctx.moveTo(30, 130); ctx.lineTo(370, 130); ctx.stroke();

    const renderRow = (label: string, value: string, rowY: number) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText(label, 30, rowY);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(value, 370, rowY);
    };

    let itemY = 160;
    renderRow('RECEIPT NO', receiptNo, itemY);
    itemY += 22;
    renderRow(isSubscription ? 'MEMBER' : 'NON-MEMBER', tx.customerName || 'Walk-In Guest', itemY);
    itemY += 22;
    renderRow(isSubscription ? 'PLAN TYPE' : 'LOGBOOK ENTRY', tx.categoryOrPlan || 'Daily Pass', itemY);
    itemY += 22;
    renderRow('PAYMENT METHOD', paymentMethod.toUpperCase(), itemY);
    itemY += 22;
    renderRow('TRANSACTION DATE', `${txDateStr} • ${formattedTimeStr}`, itemY);

    ctx.beginPath(); ctx.moveTo(30, itemY + 15); ctx.lineTo(370, itemY + 15); ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(30, itemY + 30, 340, 34);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('TOTAL DUE', 45, itemY + 52);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#bf0202';
    ctx.fillText(`₱${amountPaid.toFixed(2)}`, 355, itemY + 52);

    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
    const link = document.createElement('a');
    link.download = `Logbook_Receipt_${receiptNo}.jpg`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Check-in Slip downloaded!');
  };

  if (!tx) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="OFFICIAL RECEIPT"
      className="max-w-sm p-6 overflow-y-auto max-h-[85vh] font-mono text-[10px] text-(--color-text) relative"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50 animate-fade-in"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-4 pt-2 leading-normal">
        <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-orange-500 to-amber-500 opacity-80" />

        {loadingConfig ? (
          <div className="bg-white p-4 border border-dashed border-slate-200 rounded-2xl text-black animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto" />
            <div className="h-3 bg-slate-200 rounded w-2/3 mx-auto" />
          </div>
        ) : (
          <div id="thermal-receipt-card" className="bg-white p-4 border border-dashed border-slate-200 rounded-2xl text-black shadow-inner space-y-4 text-[9px]">
            {/* Header branding */}
            <div className="text-center space-y-1">
              <img src="/favicon.svg" alt="Wolf Gym Logo" className="mx-auto w-10 h-10 object-contain mb-1.5" />
              <h4 className="font-heading text-xs tracking-wider text-slate-900 uppercase leading-none">{gymName}</h4>
              <p className="text-[7px] text-slate-500 uppercase tracking-tight max-w-60 mx-auto leading-normal">{gymAddress}</p>
              <p className="text-[7px] text-slate-500 uppercase tracking-wider font-semibold">{staffContact}</p>
            </div>

            <div className="border-b border-dashed border-slate-200" />
            
            {/* Conditional Receipt titles */}
            <div className="text-center font-bold tracking-wider text-slate-900 uppercase text-[9px]">
              {isSubscription ? 'SUBSCRIPTION OFFICIAL RECEIPT' : isWalkIn ? 'WALK-IN OFFICIAL RECEIPT' : 'ATTENDANCE CHECK-IN SLIP'}
            </div>

            {/* SCAN FOR REF QR Barcode Block (Subscription / Registration reference layout) */}
            {isSubscription && (
              <div className="flex items-center gap-3.5 py-1.5 bg-slate-50 border border-slate-200/50 rounded-xl p-2.5 animate-slide-up">
                <svg className="w-12 h-12 text-slate-900 shrink-0 select-none" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 3h6v6H3V3zm1 1v4h4V4H4zm1 1h2v2H5V5zm6-2h2v2h-2V3zm3 0h2v2h-2V3zm3 0h4v6h-4V3zm1 1v4h2V4h-2zm1 1h1v2h-1V5zM3 15h6v6H3v-6zm1 1v4h4v-4H4zm1 1h2v2H5v-2zm8-2h1v1h-1v-1zm1 1h1v1h-1v-1zm1-1h1v1h-1v-1zm2 0h2v1h-2v-1zm1 2h1v1h-1v-1zm1-2h1v1h-1v-1zm-4 4h2v1h-2v-1zm3 0h1v1h-1v-1zm2-2h1v1h-1v-1zm-6 3h1v1h-1v-1zm2 0h1v1h-1v-1zm2 0h2v1h-2v-1zm1-3h1v1h-1v-1z"/>
                </svg>
                <div className="text-[8px] font-mono leading-tight overflow-hidden text-left">
                  <span className="text-slate-500 font-bold block">SCAN FOR REF</span>
                  <span className="text-slate-900 font-black block tracking-tight uppercase">RCPT-{receiptNo}</span>
                </div>
              </div>
            )}

            <div className="border-b border-dashed border-slate-200" />

            {/* Receipt Table Items */}
            <div className="space-y-1.5 text-slate-800 text-[9px]">
              <div className="flex justify-between">
                <span className="text-slate-500">RECEIPT NO</span>
                <span className="font-semibold text-slate-900">{receiptNo}</span>
              </div>
              
              {isSubscription && (
                <div className="flex justify-between">
                  <span className="text-slate-500">PAYMENT REF</span>
                  <span className="font-semibold text-slate-900">SUBPAY-{receiptNo}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-500">{isSubscription ? 'MEMBER' : 'NON-MEMBER'}</span>
                <span className="font-semibold text-slate-900 uppercase">{tx.customerName || 'Walk-In Guest'}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">{isSubscription ? 'PLAN TYPE' : 'LOGBOOK ENTRY'}</span>
                <span className="font-semibold text-slate-900 uppercase text-right truncate max-w-45">
                  {tx.categoryOrPlan || 'Daily Gym Pass'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">{isSubscription ? 'MEMBERSHIP FEE' : 'WALK-IN CHARGE'}</span>
                <span className="font-semibold text-slate-900">₱{breakdown.basePrice.toFixed(2)}</span>
              </div>

              {breakdown.cardFee > 0 && (
                <div className="flex justify-between animate-slide-up">
                  <span className="text-slate-500">CARD FEE</span>
                  <span className="font-semibold text-slate-900">+₱{breakdown.cardFee.toFixed(2)}</span>
                </div>
              )}

              {breakdown.gcashFee > 0 && (
                <div className="flex justify-between animate-slide-up">
                  <span className="text-slate-500">GCASH CONVENIENCE FEE</span>
                  <span className="font-semibold text-slate-900">+₱{breakdown.gcashFee.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-500">PAYMENT METHOD</span>
                <span className="font-semibold text-slate-900 uppercase">{paymentMethod}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">TRANSACTION DATE</span>
                <span className="font-semibold text-slate-900">{txDateStr}, {txTimeStr}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">PROCESSED BY</span>
                <span className="font-semibold text-slate-900 uppercase">WOLF PALOMAR</span>
              </div>
            </div>

            <div className="border-b border-dashed border-slate-200" />

            {/* Totals Summary */}
            <div className="space-y-1.5 text-xs text-slate-950 font-bold">
              <div className="flex justify-between text-[9px]"><span className="text-slate-500">SUBTOTAL</span><span>₱{breakdown.subtotal.toFixed(2)}</span></div>
              
              <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-xs">
                <span>TOTAL DUE</span><span className="text-[#bf0202]">₱{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {totalAmount > 0 && vatEnabled && (
              <>
                <div className="border-b border-dashed border-slate-200" />
                <div className="space-y-1 text-[8px] text-slate-500 font-sans uppercase">
                  <div className="flex justify-between"><span>VATABLE ATTENDANCE</span><span>₱{vatableSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>VAT ({vatPercentage}% INCLUSIVE)</span><span>₱{vatAmount.toFixed(2)}</span></div>
                </div>
              </>
            )}

            <div className="border-b border-dashed border-slate-200" />
            <div className="text-center space-y-1.5 text-[8px] text-slate-400 font-sans leading-normal">
              <p className="font-semibold uppercase tracking-wider">THIS SERVES AS YOUR SALES INVOICE</p>
              <div className="font-medium uppercase tracking-widest text-slate-500 space-y-0.5">
                <p>Thank you for choosing Wolf Gym.</p>
                <p>We look forward to seeing you again.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            disabled={loadingConfig}
            onClick={handleDownloadReceiptJpg}
            className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold"
          >
            <Download className="w-4 h-4" />
            <span>Download JPG</span>
          </button>
          <button
            type="button"
            disabled={loadingConfig}
            onClick={handlePrintReceipt}
            className="py-3 px-4 bg-(--bg-input) hover:bg-slate-800 disabled:opacity-50 text-(--color-text) border border-(--border-color) font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};