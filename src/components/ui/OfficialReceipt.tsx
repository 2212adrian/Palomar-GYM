import { useMemo, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Download, Printer } from 'lucide-react';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabase/client';

export interface ReceiptItem {
  productName: string;
  quantity: number;
  price: number;
}

export interface GymProfileConfig {
  gym_name?: string;
  gym_address?: string;
  contact_number_1?: string;
  contact_number_2?: string;
  gym_logo?: string;
}

export interface RatesConfig {
  vat_enabled?: boolean;
  vat_percentage?: number;
}

export interface ReceiptData {
  receiptType?: 'subscription' | 'walkin' | 'sales' | 'attendance';
  receiptNo?: string;
  paymentRef?: string;
  customerName?: string;
  customerType?: string;
  planType?: string;
  basePrice?: number;
  items?: ReceiptItem[];
  cardFee?: number;
  gcashFee?: number;
  paymentMethod?: string;
  amountReceived?: number;
  changeDue?: number;
  gcashRefNo?: string;
  transactionDate?: string;
  processedBy?: string;
  qrValue?: string;
  gymProfile?: GymProfileConfig;
  ratesConfig?: RatesConfig;
}

export interface OfficialReceiptRef {
  handlePrint: () => void;
  handleDownloadJpg: () => void;
}

interface OfficialReceiptProps {
  data: ReceiptData;
  variant?: 'modal' | 'inline';
  isOpen?: boolean;
  onClose?: () => void;
  showPrintButton?: boolean;
  showDownloadButton?: boolean;
  isLoading?: boolean;
}

const DEFAULT_GYM_NAME = "WOLF PALOMAR GYM";
const DEFAULT_GYM_ADDRESS = "6B JUDGE A. ROLDAN ST., NAVOTAS CITY, METRO MANILA";
const DEFAULT_CONTACTS = "STAFF CONTACT: 09762607481 / 09123456789";
const DEFAULT_LOGO = "/favicon.svg";

const RECEIPT_TITLES: Record<NonNullable<ReceiptData['receiptType']>, string> = {
  subscription: 'Subscription Official Receipt',
  walkin: 'Walk-In Official Receipt',
  sales: 'Product Official Receipt',
  attendance: 'Attendance Check-In Slip'
};

export const OfficialReceipt = forwardRef<OfficialReceiptRef, OfficialReceiptProps>(({
  data,
  variant = 'modal',
  isOpen = true,
  onClose,
  showPrintButton = true,
  showDownloadButton = true,
  isLoading = false
}, ref) => {
  const [gymProfile, setGymProfile] = useState<GymProfileConfig | null>(data.gymProfile || null);
  const [ratesConfig, setRatesConfig] = useState<RatesConfig | null>(data.ratesConfig || null);
  const [loadingConfig, setLoadingConfig] = useState(!data.gymProfile || !data.ratesConfig);

  useEffect(() => {
    if (data.gymProfile) setGymProfile(data.gymProfile);
    if (data.ratesConfig) setRatesConfig(data.ratesConfig);
  }, [data.gymProfile, data.ratesConfig]);

  useEffect(() => {
    if (data.gymProfile && data.ratesConfig) {
      setLoadingConfig(false);
      return;
    }
    if (variant === 'modal' && !isOpen) return;

    let isMounted = true;
    const fetchConfigs = async () => {
      setLoadingConfig(true);
      try {
        const [profileRes, ratesRes] = await Promise.all([
          supabase.from('gym_profile').select('*').eq('id', 1).single(),
          supabase.from('rates_config').select('*').eq('id', 1).single()
        ]);

        if (isMounted) {
          if (!profileRes.error && profileRes.data) setGymProfile(profileRes.data);
          if (!ratesRes.error && ratesRes.data) setRatesConfig(ratesRes.data);
        }
      } catch (err) {
        console.warn('Failed to load dynamic receipt settings:', err);
      } finally {
        if (isMounted) setLoadingConfig(false);
      }
    };

    fetchConfigs();
    return () => { isMounted = false; };
  }, [isOpen, variant, data.gymProfile, data.ratesConfig]);

  const gymName = gymProfile?.gym_name || DEFAULT_GYM_NAME;
  const gymAddress = gymProfile?.gym_address || DEFAULT_GYM_ADDRESS;
  const staffContact = gymProfile?.contact_number_1
    ? `STAFF CONTACT: ${gymProfile.contact_number_1}${gymProfile.contact_number_2 ? ` / ${gymProfile.contact_number_2}` : ''}`
    : DEFAULT_CONTACTS;
  const gymLogo = gymProfile?.gym_logo || DEFAULT_LOGO;

  const vatEnabled = ratesConfig?.vat_enabled ?? true;
  const vatPercentage = Number(ratesConfig?.vat_percentage ?? 12);

  const receiptType = data.receiptType || (data.items && data.items.length > 0 ? 'sales' : 'subscription');
  const receiptTitle = RECEIPT_TITLES[receiptType] || 'Official Receipt';

  const basePrice = data.basePrice || 0;
  const cardFee = data.cardFee || 0;
  const gcashFee = data.gcashFee || 0;

  const itemsSubtotal = useMemo(() => {
    if (data.items && data.items.length > 0) {
      return data.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    }
    return basePrice;
  }, [data.items, basePrice]);

  const subtotal = itemsSubtotal + cardFee + gcashFee;
  const totalDue = subtotal;

  const vatableSales = vatEnabled ? totalDue / (1 + vatPercentage / 100) : 0;
  const vatAmount = vatEnabled ? totalDue - vatableSales : 0;

  const receiptNo = data.receiptNo || 'RCPT-PREVIEW-001';
  const paymentMethod = (data.paymentMethod || 'cash').toUpperCase();
  const processedBy = data.processedBy || 'WOLF PALOMAR STAFF';

  const txDateStr = useMemo(() => {
    if (!data.transactionDate) return format(new Date(), 'MMM d, yyyy, h:mm:ss a');
    try {
      return format(parseISO(data.transactionDate), 'MMM d, yyyy, h:mm:ss a');
    } catch {
      return data.transactionDate;
    }
  }, [data.transactionDate]);

  const qrPayload = data.qrValue || receiptNo;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;

  // --- PRINT HANDLER ---
  const handlePrint = () => {
    const content = document.getElementById('unified-thermal-receipt-card');
    if (!content) return;

    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0'
    });
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
      stylesHtml += el.outerHTML;
    });

    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${receiptTitle} - ${receiptNo}</title>
          ${stylesHtml}
          <style>
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              html, body {
                width: 80mm !important;
                max-width: 80mm !important;
                margin: 0 auto !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #unified-thermal-receipt-card {
                width: 78mm !important;
                max-width: 78mm !important;
                margin: 0 auto !important;
                padding: 4mm 2mm !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: 'Courier New', Courier, monospace !important;
                font-size: 10px !important;
                line-height: 1.2 !important;
                box-sizing: border-box !important;
              }
              #unified-thermal-receipt-card * {
                color: #000000 !important;
                background: transparent !important;
                border-color: #000000 !important;
                box-shadow: none !important;
                text-shadow: none !important;
              }
              .receipt-logo {
                max-width: 14mm !important;
                max-height: 14mm !important;
                object-fit: contain !important;
                margin: 0 auto 1.5mm auto !important;
                display: block !important;
              }
              .receipt-qr-img {
                width: 12mm !important;
                height: 12mm !important;
                object-fit: contain !important;
                display: block !important;
              }
              .receipt-qr-container {
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                gap: 3mm !important;
                border: 1px solid #000 !important;
                padding: 2mm !important;
                margin: 2mm 0 !important;
              }
              .manual-signature-line {
                border-bottom: 1px solid #000 !important;
                height: 6mm !important;
              }
              .absolute, .bg-gradient-to-r {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div id="unified-thermal-receipt-card">
            ${content.innerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() {
                  if (window.frameElement) {
                    window.frameElement.remove();
                  }
                }, 500);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  // --- JPG CANVAS DOWNLOAD HANDLER ---
  const handleDownloadJpg = async () => {
    const loadImage = (src: string): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };

    const showQr = receiptType === 'subscription' || receiptType === 'attendance';
    const [logoImg, qrImg] = await Promise.all([
      loadImage(gymLogo),
      loadImage(showQr ? qrImageUrl : '')
    ]);

    const canvas = document.createElement('canvas');
    const scale = 2;
    const width = 400;

    let itemCount = 0;
    if (data.items && data.items.length > 0) itemCount += data.items.length + 1;
    let extraRows = 12;
    if (data.paymentRef) extraRows++;
    if (cardFee > 0) extraRows++;
    if (gcashFee > 0) extraRows++;
    if (vatEnabled) extraRows += 2;

    const baseHeight = 480 + (extraRows * 20) + (itemCount * 18) + (qrImg ? 65 : 0);
    const height = baseHeight;

    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    // Canvas Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Card Border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Top Accent Bar
    ctx.fillStyle = '#bf0202';
    ctx.fillRect(10, 10, width - 20, 4);

    let y = 30;

    if (logoImg) {
      ctx.drawImage(logoImg, width / 2 - 20, y, 40, 40);
      y += 48;
    } else {
      y += 10;
    }

    // Header Info
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(gymName.toUpperCase(), width / 2, y);
    y += 15;

    ctx.fillStyle = '#64748b';
    ctx.font = '8px system-ui, sans-serif';
    ctx.fillText(gymAddress.toUpperCase(), width / 2, y);
    y += 13;

    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillText(staffContact.toUpperCase(), width / 2, y);
    y += 16;

    const drawDashedLine = (lineY: number) => {
      ctx.strokeStyle = '#cbd5e1';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(20, lineY);
      ctx.lineTo(width - 20, lineY);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawDashedLine(y);
    y += 16;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(receiptTitle.toUpperCase(), width / 2, y);
    y += 15;

    // QR Block
    if (qrImg) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(20, y, width - 40, 56);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(20, y, width - 40, 56);

      ctx.drawImage(qrImg, 30, y + 6, 44, 44);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('SCAN FOR CHECK-IN', 84, y + 20);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(receiptNo, 84, y + 36);

      y += 66;
    }

    drawDashedLine(y);
    y += 18;

    const renderRow = (label: string, value: string, isHighlight = false, fontColor = '#0f172a') => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '8.5px monospace';
      ctx.fillText(label, 20, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = fontColor;
      ctx.font = isHighlight ? 'bold 9.5px monospace' : '600 8.5px monospace';
      ctx.fillText(value, width - 20, y);
      y += 16;
    };

    renderRow('RECEIPT NO', receiptNo, true, '#0f172a');
    if (data.paymentRef) renderRow('PAYMENT REF', data.paymentRef, true, '#0284c7');
    renderRow(receiptType === 'subscription' ? 'MEMBER' : 'CUSTOMER', (data.customerName || 'Walk-In Guest').toUpperCase(), true, '#0f172a');

    if (data.planType) {
      renderRow(receiptType === 'subscription' ? 'PLAN TYPE' : 'LOGBOOK ENTRY', data.planType.toUpperCase(), false, '#15803d');
    }

    if (basePrice > 0) {
      renderRow(receiptType === 'subscription' ? 'MEMBERSHIP FEE' : 'BASE CHARGE', `₱${basePrice.toFixed(2)}`);
    }

    if (cardFee > 0) renderRow('CARD FEE', `+₱${cardFee.toFixed(2)}`, false, '#2563eb');
    if (gcashFee > 0) renderRow('GCASH CONVENIENCE FEE', `+₱${gcashFee.toFixed(2)}`, false, '#15803d');

    renderRow('PAYMENT METHOD', paymentMethod, false, '#0f172a');
    if (data.gcashRefNo) renderRow('GCASH REF NO', data.gcashRefNo, true, '#0284c7');

    renderRow('TRANSACTION DATE', txDateStr);
    renderRow('PROCESSED BY', processedBy.toUpperCase());

    if (data.items && data.items.length > 0) {
      drawDashedLine(y);
      y += 14;
      data.items.forEach(item => {
        renderRow(`${item.quantity}x ${item.productName}`, `₱${(item.price * item.quantity).toFixed(2)}`);
      });
    }

    drawDashedLine(y);
    y += 18;

    // Subtotal
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 9.5px monospace';
    ctx.fillText('SUBTOTAL', 20, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`₱${subtotal.toFixed(2)}`, width - 20, y);

    y += 14;

    // Total Due Box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(20, y, width - 40, 32);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(20, y, width - 40, 32);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('TOTAL DUE', 30, y + 20);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`₱${totalDue.toFixed(2)}`, width - 30, y + 20);

    y += 44;

    drawDashedLine(y);
    y += 14;

    // --- RECIPIENT ACKNOWLEDGEMENT SECTION (MANUAL WRITING) ---
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillText('RECIPIENT ACKNOWLEDGEMENT', width / 2, y);
    y += 26;

    // Underlines
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(25, y);
    ctx.lineTo(210, y);
    ctx.moveTo(230, y);
    ctx.lineTo(width - 25, y);
    ctx.stroke();

    y += 12;
    ctx.fillStyle = '#64748b';
    ctx.font = '7px system-ui, sans-serif';
    ctx.fillText('SIGNATURE OVER PRINTED NAME', 117, y);
    ctx.fillText('DATE SIGNED', (230 + width - 25) / 2, y);

    y += 20;
    drawDashedLine(y);
    y += 14;

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillText('THIS SERVES AS YOUR SALES INVOICE', width / 2, y);
    y += 12;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px system-ui, sans-serif';
    ctx.fillText('THANK YOU FOR CHOOSING WOLF GYM.', width / 2, y);

    canvas.toBlob((blob) => {
      if (blob) {
        saveAs(blob, `Official_Receipt_${receiptNo}.png`);
        toast.success('Official Receipt image downloaded!');
      } else {
        toast.error('Failed to export receipt image.');
      }
    }, 'image/png');
  };

  useImperativeHandle(ref, () => ({
    handlePrint,
    handleDownloadJpg
  }));

  const receiptBody = (
    <div
      id="unified-thermal-receipt-card"
      className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-page)] p-4 sm:p-4.5 shadow-md space-y-2.5 font-mono text-[9px] text-[var(--color-text)] relative overflow-hidden leading-tight max-w-sm mx-auto"
    >
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] opacity-80" />

      {/* Store Branding Header */}
      <div className="text-center pt-1 pb-0.5 space-y-1">
        <img
          src={gymLogo}
          alt="Gym Logo"
          className="receipt-logo mx-auto w-10 h-10 object-contain block mb-1"
        />
        <h4 className="font-heading text-[11px] tracking-wider text-[var(--color-text)] uppercase leading-snug font-bold block">
          {gymName}
        </h4>
        <p className="text-[7.5px] text-slate-500 uppercase tracking-tight leading-tight max-w-48 mx-auto">
          {gymAddress}
        </p>
        <p className="text-[7.5px] text-slate-500 uppercase tracking-wider font-semibold">
          {staffContact}
        </p>
      </div>

      <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

      <div className="text-center font-bold tracking-wider text-[var(--color-text)] uppercase text-[8.5px]">
        {receiptTitle}
      </div>

      {/* QR Code Block */}
      {(receiptType === 'subscription' || receiptType === 'attendance') && (
        <div className="receipt-qr-container flex items-center gap-3 py-1.5 px-2 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] my-1.5">
          <img
            src={qrImageUrl}
            alt="Check-in QR Code"
            className="receipt-qr-img w-10 h-10 object-contain shrink-0 rounded bg-white p-0.5 border border-slate-200"
          />
          <div className="text-[8px] font-mono leading-tight overflow-hidden text-left flex-1">
            <span className="text-slate-500 font-bold block text-[7.5px]">SCAN FOR CHECK-IN</span>
            <span className="text-[var(--color-text)] font-black block tracking-tight uppercase break-all text-[9px] mt-0.5">
              {receiptNo}
            </span>
          </div>
        </div>
      )}

      <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

      {/* Metadata Table */}
      <div className="space-y-1 text-[8.5px]">
        <div className="flex justify-between">
          <span className="text-slate-500">RECEIPT NO</span>
          <span className="font-semibold text-[var(--color-text)]">{receiptNo}</span>
        </div>
        {data.paymentRef && (
          <div className="flex justify-between">
            <span className="text-slate-500">PAYMENT REF</span>
            <span className="font-semibold text-[var(--color-text)]">{data.paymentRef}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">
            {receiptType === 'subscription' ? 'MEMBER' : 'CUSTOMER'}
          </span>
          <span className="font-semibold text-[var(--color-text)] uppercase truncate max-w-36">
            {data.customerName || 'Walk-In Guest'}
          </span>
        </div>

        {data.planType && (
          <div className="flex justify-between">
            <span className="text-slate-500">
              {receiptType === 'subscription' ? 'PLAN TYPE' : 'LOGBOOK ENTRY'}
            </span>
            <span className="font-semibold text-[var(--color-text)] uppercase text-right max-w-32">
              {data.planType}
            </span>
          </div>
        )}

        {/* Product Items Breakdown */}
        {data.items && data.items.length > 0 && (
          <div className="py-1 space-y-0.5 border-y border-dashed border-[var(--border-color)] my-1">
            <span className="text-[7.5px] font-bold text-slate-500 uppercase block">Purchased Items</span>
            {data.items.map((item, i) => (
              <div key={i} className="flex justify-between text-[8.5px]">
                <span>{item.quantity}x {item.productName}</span>
                <span className="font-semibold">₱{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {basePrice > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">
              {receiptType === 'subscription' ? 'MEMBERSHIP FEE' : 'BASE CHARGE'}
            </span>
            <span className="font-semibold text-[var(--color-text)]">
              ₱{basePrice.toFixed(2)}
            </span>
          </div>
        )}

        {cardFee > 0 && (
          <div className="flex justify-between text-blue-500">
            <span>CARD FEE</span>
            <span className="font-semibold">+₱{cardFee.toFixed(2)}</span>
          </div>
        )}

        {gcashFee > 0 && (
          <div className="flex justify-between text-emerald-500">
            <span>GCASH CONVENIENCE FEE</span>
            <span className="font-semibold">+₱{gcashFee.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-slate-500">PAYMENT METHOD</span>
          <span className="font-semibold text-[var(--color-text)] uppercase">{paymentMethod}</span>
        </div>

        {data.gcashRefNo && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-mono font-bold">
            <span>GCASH REF NO</span>
            <span>{data.gcashRefNo}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-slate-500">TRANSACTION DATE</span>
          <span className="font-semibold text-[var(--color-text)] text-right max-w-32">
            {txDateStr}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">PROCESSED BY</span>
          <span className="font-semibold text-[var(--color-text)] uppercase">{processedBy}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

      {/* Totals */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between font-bold text-[10px]">
          <span>SUBTOTAL</span>
          <span>₱{subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-2.5 py-1.5 text-[var(--color-text)] font-extrabold text-xs">
          <span>TOTAL DUE</span>
          <span className="text-[var(--color-primary-light)] text-sm font-black">₱{totalDue.toFixed(2)}</span>
        </div>

        {data.amountReceived !== undefined && data.amountReceived !== null && (
          <div className="pt-0.5 text-[8px] space-y-0.5 text-slate-500 font-mono">
            <div className="flex justify-between">
              <span>CASH RECEIVED</span>
              <span>₱{data.amountReceived.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-[var(--color-text)]">
              <span>CHANGE DUE</span>
              <span>₱{(data.changeDue || 0).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tax Breakdown */}
      {vatEnabled && (
        <>
          <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />
          <div className="space-y-0.5 text-[8px] text-slate-500">
            <div className="flex justify-between">
              <span>VATABLE SALES</span>
              <span>₱{vatableSales.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT ({vatPercentage}%)</span>
              <span>₱{vatAmount.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}

      {/* Manual Recipient Information Section */}
      <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />
      
      <div className="pt-1 pb-1 space-y-2">
        <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wider block text-center">
          Recipient Details
        </span>
        <div className="grid grid-cols-2 gap-3 text-[7.5px]">
          <div>
            <div className="manual-signature-line border-b border-slate-400 dark:border-zinc-500 h-5" />
            <span className="text-slate-400 uppercase tracking-tight block text-center mt-1 font-sans">
              Full Name
            </span>
          </div>
          <div>
            <div className="manual-signature-line border-b border-slate-400 dark:border-zinc-500 h-5" />
            <span className="text-slate-400 uppercase tracking-tight block text-center mt-1 font-sans">
              Contact Number
            </span>
          </div>
        </div>
      </div>

      <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

      {/* Footer */}
      <div className="text-center space-y-0.5 pt-0.5 text-[7.5px] text-slate-500 leading-tight">
        <p className="font-semibold uppercase tracking-wider">This serves as your Sales Invoice</p>
        <div className="font-medium uppercase tracking-widest text-slate-500 space-y-0.5">
          <p>Thank you for choosing Wolf Gym.</p>
          <p>We look forward to seeing you again.</p>
        </div>
      </div>
    </div>
  );

  if (variant === 'inline') {
    if (isLoading || loadingConfig) {
      return (
        <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-page)] p-4 animate-pulse space-y-2.5 max-w-sm mx-auto">
          <div className="h-5 bg-slate-200 dark:bg-white/10 rounded w-1/2 mx-auto" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-3/4 mx-auto" />
          <div className="h-20 bg-slate-200 dark:bg-white/10 rounded" />
        </div>
      );
    }
    return receiptBody;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose || (() => {})}
      title="OFFICIAL RECEIPT"
      className="max-w-sm p-4 sm:p-5 overflow-y-auto max-h-[85vh] font-mono text-[9px] text-[var(--color-text)] relative"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="space-y-3 pt-1">
        {loadingConfig ? (
          <div className="p-4 text-center animate-pulse text-slate-400">Loading receipt details...</div>
        ) : (
          receiptBody
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          {showDownloadButton && (
            <button
              type="button"
              disabled={loadingConfig}
              onClick={handleDownloadJpg}
              className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-heading text-[9px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold border-none"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download JPG</span>
            </button>
          )}

          {showPrintButton && (
            <button
              type="button"
              disabled={loadingConfig}
              onClick={handlePrint}
              className="py-2.5 px-3 bg-[var(--bg-input)] hover:bg-slate-800 disabled:opacity-50 text-[var(--color-text)] border border-[var(--border-color)] font-heading text-[9px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Receipt</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
});

OfficialReceipt.displayName = 'OfficialReceipt';