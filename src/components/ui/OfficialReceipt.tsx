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
  
  gymProfile?: {
    gym_name?: string;
    gym_address?: string;
    contact_number_1?: string;
    contact_number_2?: string;
    gym_logo?: string;
  };
  ratesConfig?: {
    vat_enabled?: boolean;
    vat_percentage?: number;
  };
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

export const OfficialReceipt = forwardRef<OfficialReceiptRef, OfficialReceiptProps>(({
  data,
  variant = 'modal',
  isOpen = true,
  onClose,
  showPrintButton = true,
  showDownloadButton = true,
  isLoading = false
}, ref) => {
  const [gymProfile, setGymProfile] = useState<any>(data.gymProfile || null);
  const [ratesConfig, setRatesConfig] = useState<any>(data.ratesConfig || null);
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
          if (!profileRes.error) setGymProfile(profileRes.data);
          if (!ratesRes.error) setRatesConfig(ratesRes.data);
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

  const gymName = gymProfile?.gym_name || "WOLF PALOMAR GYM";
  const gymAddress = gymProfile?.gym_address || "6B JUDGE A. ROLDAN ST., NAVOTAS CITY, METRO MANILA";
  const staffContact = gymProfile?.contact_number_1
    ? `STAFF CONTACT: ${gymProfile.contact_number_1}${gymProfile.contact_number_2 ? ` / ${gymProfile.contact_number_2}` : ''}`
    : "STAFF CONTACT: 09762607481 / 09123456789";
  const gymLogo = gymProfile?.gym_logo || "/favicon.svg";

  const vatEnabled = ratesConfig?.vat_enabled ?? true;
  const vatPercentage = Number(ratesConfig?.vat_percentage ?? 12);

  const receiptType = data.receiptType || (data.items && data.items.length > 0 ? 'sales' : 'subscription');
  const titleMap = {
    subscription: 'Subscription Official Receipt',
    walkin: 'Walk-In Official Receipt',
    sales: 'Product Official Receipt',
    attendance: 'Attendance Check-In Slip'
  };
  const receiptTitle = titleMap[receiptType] || 'Official Receipt';

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
      <!DOCTYPE html>
      <html>
        <head>
          <title>${receiptTitle} - ${receiptNo}</title>
          ${stylesHtml}
          <style>
            @media print {
              @page { size: 80mm auto; margin: 0; }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                width: 80mm !important;
              }
              #unified-thermal-receipt-card {
                width: 80mm !important;
                max-width: 80mm !important;
                border: none !important;
                box-shadow: none !important;
                padding: 8px 12px !important;
                font-family: monospace, sans-serif !important;
                color: #000000 !important;
                background: #ffffff !important;
              }
              #unified-thermal-receipt-card * {
                color: #000000 !important;
                background: transparent !important;
                box-shadow: none !important;
                text-shadow: none !important;
              }
              #unified-thermal-receipt-card img {
                max-width: 48px !important;
                max-height: 48px !important;
                object-fit: contain !important;
                filter: grayscale(100%) contrast(200%) !important;
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

  // --- JPG CANVAS DOWNLOAD HANDLER (INK-SAVING WHITE PAPER LAYOUT) ---
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

    const [logoImg, qrImg] = await Promise.all([
      loadImage(gymLogo),
      loadImage((receiptType === 'subscription' || receiptType === 'attendance') ? qrImageUrl : '')
    ]);

    const canvas = document.createElement('canvas');
    const scale = 2; // High-DPI 2x scale
    const width = 420;

    let itemCount = 0;
    if (data.items && data.items.length > 0) itemCount += data.items.length + 1;
    let extraRows = 8;
    if (data.paymentRef) extraRows++;
    if (cardFee > 0) extraRows++;
    if (gcashFee > 0) extraRows++;
    if (vatEnabled) extraRows += 2;

    const baseHeight = 440 + (extraRows * 22) + (itemCount * 20) + (qrImg ? 70 : 0);
    const height = baseHeight;

    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    // Clean White Paper Background (Zero Printer Ink Waste)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Outer Border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Top Red Accent Line
    ctx.fillStyle = '#bf0202';
    ctx.fillRect(10, 10, width - 20, 4);

    let y = 32;

    // Gym Logo
    if (logoImg) {
      ctx.drawImage(logoImg, width / 2 - 20, y, 40, 40);
      y += 48;
    } else {
      y += 10;
    }

    // Gym Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(gymName.toUpperCase(), width / 2, y);
    y += 16;

    ctx.fillStyle = '#64748b';
    ctx.font = '8px system-ui, sans-serif';
    ctx.fillText(gymAddress.toUpperCase(), width / 2, y);
    y += 14;

    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillText(staffContact.toUpperCase(), width / 2, y);
    y += 18;

    const drawDashedLine = (lineY: number) => {
      ctx.strokeStyle = '#cbd5e1';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(24, lineY);
      ctx.lineTo(width - 24, lineY);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    drawDashedLine(y);
    y += 18;

    // Receipt Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(receiptTitle.toUpperCase(), width / 2, y);
    y += 16;

    // QR Code Box (Light Faint Fill)
    if (qrImg) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(24, y, width - 48, 60);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(24, y, width - 48, 60);

      ctx.drawImage(qrImg, 34, y + 6, 48, 48);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('SCAN FOR REF', 92, y + 22);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(receiptNo, 92, y + 40);

      y += 72;
    }

    drawDashedLine(y);
    y += 20;

    // Detail Rows
    const renderRow = (label: string, value: string, isHighlight = false, fontColor = '#0f172a') => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(label, 24, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = fontColor;
      ctx.font = isHighlight ? 'bold 10px monospace' : '600 9px monospace';
      ctx.fillText(value, width - 24, y);
      y += 18;
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
      y += 16;
      data.items.forEach(item => {
        renderRow(`${item.quantity}x ${item.productName}`, `₱${(item.price * item.quantity).toFixed(2)}`);
      });
    }

    drawDashedLine(y);
    y += 20;

    // Subtotal
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('SUBTOTAL', 24, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`₱${subtotal.toFixed(2)}`, width - 24, y);

    y += 16;

    // Total Due Box (Ink-saving Light Container)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(24, y, width - 48, 36);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(24, y, width - 48, 36);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('TOTAL DUE', 36, y + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#dc2626'; // Highlighted price accent
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`₱${totalDue.toFixed(2)}`, width - 36, y + 22);

    y += 50;

    // Footer
    drawDashedLine(y);
    y += 16;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillText('THIS SERVES AS YOUR SALES INVOICE', width / 2, y);
    y += 14;

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
      className="border border-(--border-color) rounded-2xl bg-(--bg-page) p-5 shadow-md space-y-4 font-mono text-[10px] text-(--color-text) relative overflow-hidden leading-normal"
    >
      <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-(--color-primary) to-(--color-primary-light) opacity-80" />

      {/* Store Branding */}
      <div className="text-center space-y-1">
        <img
          src={gymLogo}
          alt="Gym Logo"
          className="mx-auto w-10 h-10 object-contain mb-1.5"
        />
        <h4 className="font-heading text-xs tracking-wider text-(--color-text) uppercase leading-none">
          {gymName}
        </h4>
        <p className="text-[8px] text-slate-500 uppercase tracking-tight leading-normal max-w-52 mx-auto">
          {gymAddress}
        </p>
        <p className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">
          {staffContact}
        </p>
      </div>

      <div className="border-b border-dashed border-(--border-color) my-2" />

      <div className="text-center font-bold tracking-wider text-(--color-text) uppercase text-[9px]">
        {receiptTitle}
      </div>

      {/* QR Code Block */}
      {(receiptType === 'subscription' || receiptType === 'attendance') && (
        <div className="flex items-center gap-3.5 py-1 bg-(--bg-card) p-2.5 rounded-xl border border-(--border-color)">
          <img
            src={qrImageUrl}
            alt="Check-in QR Code"
            className="w-12 h-12 object-contain shrink-0 rounded bg-white p-0.5"
          />
          <div className="text-[8px] font-mono leading-tight overflow-hidden text-left">
            <span className="text-slate-500 font-bold block">SCAN FOR REF</span>
            <span className="text-(--color-text) font-black block tracking-tight uppercase break-all">
              {receiptNo}
            </span>
          </div>
        </div>
      )}

      <div className="border-b border-dashed border-(--border-color) my-2" />

      {/* Metadata Table */}
      <div className="space-y-1.5 text-[9px]">
        <div className="flex justify-between">
          <span className="text-slate-500">RECEIPT NO</span>
          <span className="font-semibold text-(--color-text)">{receiptNo}</span>
        </div>
        {data.paymentRef && (
          <div className="flex justify-between">
            <span className="text-slate-500">PAYMENT REF</span>
            <span className="font-semibold text-(--color-text)">{data.paymentRef}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">
            {receiptType === 'subscription' ? 'MEMBER' : 'CUSTOMER'}
          </span>
          <span className="font-semibold text-(--color-text) uppercase truncate max-w-36">
            {data.customerName || 'Walk-In Guest'}
          </span>
        </div>

        {data.planType && (
          <div className="flex justify-between">
            <span className="text-slate-500">
              {receiptType === 'subscription' ? 'PLAN TYPE' : 'LOGBOOK ENTRY'}
            </span>
            <span className="font-semibold text-(--color-text) uppercase text-right max-w-32">
              {data.planType}
            </span>
          </div>
        )}

        {/* Product Items Breakdown if POS Sales */}
        {data.items && data.items.length > 0 && (
          <div className="py-1 space-y-1 border-y border-dashed border-(--border-color) my-1">
            <span className="text-[8px] font-bold text-slate-500 uppercase block">Purchased Items</span>
            {data.items.map((item, i) => (
              <div key={i} className="flex justify-between text-[9px]">
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
            <span className="font-semibold text-(--color-text)">
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
          <span className="font-semibold text-(--color-text) uppercase">{paymentMethod}</span>
        </div>

        {data.gcashRefNo && (
          <div className="flex justify-between text-emerald-600">
            <span>GCASH REF NO</span>
            <span className="font-bold">{data.gcashRefNo}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-slate-500">TRANSACTION DATE</span>
          <span className="font-semibold text-(--color-text) text-right max-w-32">
            {txDateStr}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">PROCESSED BY</span>
          <span className="font-semibold text-(--color-text) uppercase">{processedBy}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-(--border-color) my-2" />

      {/* Totals */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between font-bold">
          <span>SUBTOTAL</span>
          <span>₱{subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center bg-(--bg-card) border border-(--border-color) rounded-xl px-3 py-2 text-(--color-text) font-extrabold text-sm">
          <span>TOTAL DUE</span>
          <span className="text-(--color-primary-light)">₱{totalDue.toFixed(2)}</span>
        </div>

        {data.amountReceived !== undefined && data.amountReceived !== null && (
          <div className="pt-1 text-[9px] space-y-0.5 text-slate-500 font-mono">
            <div className="flex justify-between">
              <span>CASH RECEIVED</span>
              <span>₱{data.amountReceived.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-(--color-text)">
              <span>CHANGE DUE</span>
              <span>₱{(data.changeDue || 0).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tax Breakdown */}
      {vatEnabled && (
        <>
          <div className="border-b border-dashed border-(--border-color) my-2" />
          <div className="space-y-1 text-[9px] text-slate-500">
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

      <div className="border-b border-dashed border-(--border-color) my-2" />

      <div className="text-center space-y-1 pt-1 text-[8px] text-slate-500 leading-normal">
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
        <div className="border border-(--border-color) rounded-2xl bg-(--bg-page) p-5 animate-pulse space-y-3">
          <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-1/2 mx-auto" />
          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-3/4 mx-auto" />
          <div className="h-24 bg-slate-200 dark:bg-white/10 rounded" />
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
      className="max-w-sm p-6 overflow-y-auto max-h-[85vh] font-mono text-[10px] text-(--color-text) relative"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      )}

      <div className="space-y-4 pt-2">
        {loadingConfig ? (
          <div className="p-6 text-center animate-pulse text-slate-400">Loading receipt details...</div>
        ) : (
          receiptBody
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          {showDownloadButton && (
            <button
              type="button"
              disabled={loadingConfig}
              onClick={handleDownloadJpg}
              className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold"
            >
              <Download className="w-4 h-4" />
              <span>Download JPG</span>
            </button>
          )}

          {showPrintButton && (
            <button
              type="button"
              disabled={loadingConfig}
              onClick={handlePrint}
              className="py-3 px-4 bg-(--bg-input) hover:bg-slate-800 disabled:opacity-50 text-(--color-text) border border-(--border-color) font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
});

OfficialReceipt.displayName = 'OfficialReceipt';