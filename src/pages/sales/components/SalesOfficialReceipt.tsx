// src/pages/sales/components/SalesOfficialReceipt.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Download, Printer } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client'; 

interface SalesOfficialReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  tx: any;
}

export const SalesOfficialReceipt: React.FC<SalesOfficialReceiptProps> = ({
  isOpen,
  onClose,
  tx,
}) => {
  // --- CONFIGURATION STATES ---
  const [gymProfile, setGymProfile] = useState<any>(null);
  const [ratesConfig, setRatesConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // --- COMPATIBLE FIELD RESOLVERS ---
  const receiptNo = useMemo(() => tx?.receipt_no || tx?.id || 'N/A', [tx]);
  const paymentMethod = useMemo(() => tx?.payment_method || tx?.paymentMethod || 'Cash', [tx]);
  const amountReceived = useMemo(() => {
    const val = tx?.amount_received !== undefined ? tx.amount_received : tx?.amountReceived;
    return val !== null && val !== undefined ? Number(val) : null;
  }, [tx]);
  const changeCalculated = useMemo(() => {
    const val = tx?.change_calculated !== undefined ? tx.change_calculated : tx?.changeCalculated;
    return val !== null && val !== undefined ? Number(val) : 0;
  }, [tx]);
  const totalAmount = useMemo(() => {
    const val = tx?.total_amount !== undefined ? tx.total_amount : tx?.totalAmount;
    return val !== null && val !== undefined ? Number(val) : 0;
  }, [tx]);
  const createdAtStr = useMemo(() => tx?.created_at || tx?.createdAt, [tx]);
  const txDateStr = useMemo(() => {
    if (tx?.date) return tx.date;
    if (createdAtStr) {
      try {
        return format(parseISO(createdAtStr), 'yyyy-MM-dd');
      } catch {
        return 'N/A';
      }
    }
    return 'N/A';
  }, [tx, createdAtStr]);

  // Load backend branding & tax rates configuration profiles
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

  // --- DYNAMIC PARAMETER RESOLVERS ---
  const gymName = useMemo(() => gymProfile?.gym_name || 'WOLF PALOMAR GYM', [gymProfile]);
  const gymAddress = useMemo(() => gymProfile?.gym_address || '123 Sample Street, Barangay Central, Quezon City, Metro Manila', [gymProfile]);
  const staffContact = useMemo(() => {
    if (gymProfile?.contact_number_1) {
      return `${gymProfile.contact_name_1 || 'Staff'}: ${gymProfile.contact_number_1}`;
    }
    return 'Staff Contact: 09762607481';
  }, [gymProfile]);

  const vatEnabled = useMemo(() => {
    return ratesConfig?.vat_enabled !== undefined ? ratesConfig.vat_enabled : true;
  }, [ratesConfig]);

  const vatPercentage = useMemo(() => {
    return ratesConfig?.vat_percentage !== undefined ? Number(ratesConfig.vat_percentage) : 12.00;
  }, [ratesConfig]);

  const formattedTimeStr = useMemo(() => {
    if (!createdAtStr) return 'N/A';
    try {
      return format(parseISO(createdAtStr), 'hh:mm:ss a');
    } catch {
      return 'N/A';
    }
  }, [createdAtStr]);

  const receiptItems = useMemo(() => {
    if (!tx) return [];
    if (tx.items && tx.items.length > 0) return tx.items;
    
    // Fallback item translation
    return [{
      productName: tx.product_name || tx.productName || 'Catalog Product',
      quantity: tx.quantity || 1,
      price: totalAmount / (tx.quantity || 1)
    }];
  }, [tx, totalAmount]);

  // --- COMPREHENSIVE TAX MATRICES ---
  const { vatableSales, vatAmount } = useMemo(() => {
    const subtotal = totalAmount;
    if (vatEnabled && vatPercentage > 0) {
      const vatFactor = 1 + (vatPercentage / 100);
      const calculatedVatable = subtotal / vatFactor;
      return {
        vatableSales: calculatedVatable,
        vatAmount: subtotal - calculatedVatable
      };
    }
    return {
      vatableSales: subtotal,
      vatAmount: 0.00
    };
  }, [totalAmount, vatEnabled, vatPercentage]);

  // --- NATIVE ISOLATED SANDBOX PRINTER ---
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
          <title>Official Receipt - ${receiptNo}</title>
          ${stylesHtml}
          <style>
            @media print {
              body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
              }
              #thermal-receipt-card {
                width: 80mm !important;
                max-width: 100% !important;
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                padding: 10px !important;
                background: white !important;
                color: black !important;
                font-family: monospace !important;
              }
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
                setTimeout(function() {
                  window.frameElement.remove();
                }, 500);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  // --- HIGH FIDELITY CANVAS TEMPLATE DOWNLOAD ---
  const handleDownloadReceiptJpg = () => {
    if (!tx) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    
    // Determine dynamic vertical height allocations based on item sizes
    const baseHeight = 580;
    const itemsHeightBonus = receiptItems.length * 22;
    const cashMetaHeightBonus = (paymentMethod === 'Cash' && amountReceived !== null) ? 40 : 20;
    canvas.height = baseHeight + itemsHeightBonus + cashMetaHeightBonus;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background Canvas Fill
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gym Brand Header
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(gymName, 200, 45);

    // Multi-line wrap helper to securely isolate long store address values
    const drawWrappedText = (text: string, x: number, startY: number, maxWidth: number, lineHeight: number) => {
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#64748b';
      const words = text.split(' ');
      let line = '';
      let currentY = startY;

      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = words[n] + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
      return currentY;
    };

    const nextY = drawWrappedText(gymAddress, 200, 65, 340, 14);

    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(staffContact, 200, nextY + 16);

    const dividerY1 = nextY + 30;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, dividerY1); ctx.lineTo(370, dividerY1); ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('PRODUCT OFFICIAL RECEIPT', 200, dividerY1 + 20);

    const dividerY2 = dividerY1 + 35;
    ctx.beginPath(); ctx.moveTo(30, dividerY2); ctx.lineTo(370, dividerY2); ctx.stroke();

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

    let metadataY = dividerY2 + 25;
    renderRow('RECEIPT NO', receiptNo, metadataY);
    metadataY += 20;
    renderRow('PAYMENT METHOD', paymentMethod.toUpperCase(), metadataY);
    metadataY += 20;
    renderRow('TRANSACTION DATE', `${txDateStr} • ${formattedTimeStr}`, metadataY);
    metadataY += 20;
    renderRow('PROCESSED BY', 'STAFF', metadataY);

    const dividerY3 = metadataY + 20;
    ctx.beginPath(); ctx.moveTo(30, dividerY3); ctx.lineTo(370, dividerY3); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('PURCHASED ITEMS', 30, dividerY3 + 20);

    let itemY = dividerY3 + 45;
    receiptItems.forEach((item: any) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334155';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${item.quantity}x ${item.productName || item.product_name}`, 30, itemY);
      
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`₱${(item.price * item.quantity).toFixed(2)}`, 370, itemY);
      itemY += 22;
    });

    ctx.beginPath(); ctx.moveTo(30, itemY); ctx.lineTo(370, itemY); ctx.stroke();

    itemY += 20;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('SUBTOTAL', 30, itemY);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`₱${totalAmount.toFixed(2)}`, 370, itemY);

    itemY += 15;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    
    // Draw rounded block
    ctx.beginPath();
    const bx = 30; const by = itemY; const bw = 340; const bh = 34; const br = 10;
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('TOTAL PAID', 45, itemY + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#bf0202';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`₱${totalAmount.toFixed(2)}`, 355, itemY + 22);

    itemY += 52;
    if (paymentMethod === 'Cash' && amountReceived !== null) {
      renderRow('CASH RECEIVED', `₱${amountReceived.toFixed(2)}`, itemY);
      renderRow('CHANGE DUE', `₱${changeCalculated.toFixed(2)}`, itemY + 20);
      itemY += 40;
    } else if (paymentMethod === 'GCash' && (tx.reference_number || tx.referenceNumber)) {
      renderRow('GCASH REF NO', tx.reference_number || tx.referenceNumber, itemY);
      itemY += 20;
    }

    ctx.beginPath(); ctx.moveTo(30, itemY); ctx.lineTo(370, itemY); ctx.stroke();

    itemY += 18;
    if (vatEnabled) {
      renderRow('VATABLE SALES', `₱${vatableSales.toFixed(2)}`, itemY);
      renderRow(`VAT (${vatPercentage}% INCLUSIVE)`, `₱${vatAmount.toFixed(2)}`, itemY + 18);
      itemY += 40;
    } else {
      renderRow('', '₱0.00', itemY);
      itemY += 22;
    }

    ctx.beginPath(); ctx.moveTo(30, itemY); ctx.lineTo(370, itemY); ctx.stroke();

    itemY += 18;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('THIS SERVES AS YOUR SALES INVOICE', 200, itemY);
    ctx.font = '600 9px sans-serif';
    ctx.fillText(`Thank you for choosing ${gymProfile?.gym_name ? gymProfile.gym_name.replace('WOLF ', '') : 'Wolf Gym'}.`, 200, itemY + 16);

    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
    const link = document.createElement('a');
    link.download = `Palomar_Receipt_${receiptNo}.jpg`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Official Receipt JPG downloaded!');
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
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50 animate-fade-in"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-4 pt-2 leading-normal">
        <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-(--color-primary) to-(--color-primary-light) opacity-80" />

        {/* --- SKELETON LOADER VS THERMAL RECEIPT CARD --- */}
        {loadingConfig ? (
          <div className="bg-white p-4 border border-dashed border-slate-200 rounded-2xl text-black shadow-inner space-y-4 animate-pulse">
            <div className="text-center space-y-2">
              <div className="mx-auto w-10 h-10 bg-slate-200 rounded-full" />
              <div className="mx-auto h-3 w-32 bg-slate-200 rounded" />
              <div className="mx-auto h-2 w-48 bg-slate-100 rounded" />
              <div className="mx-auto h-2 w-36 bg-slate-100 rounded" />
            </div>

            <div className="border-b border-dashed border-slate-200" />
            <div className="mx-auto h-3 w-36 bg-slate-200 rounded" />
            <div className="border-b border-dashed border-slate-200" />

            <div className="space-y-2.5">
              <div className="flex justify-between">
                <div className="h-2 w-16 bg-slate-100 rounded" />
                <div className="h-2 w-20 bg-slate-200 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-2 w-24 bg-slate-100 rounded" />
                <div className="h-2 w-12 bg-slate-200 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-2 w-28 bg-slate-100 rounded" />
                <div className="h-2 w-24 bg-slate-200 rounded" />
              </div>
            </div>

            <div className="border-b border-dashed border-slate-200" />
            <div className="h-2.5 w-24 bg-slate-200 rounded" />
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-2 w-36 bg-slate-100 rounded" />
                <div className="h-2 w-10 bg-slate-200 rounded" />
              </div>
              <div className="flex justify-between">
                <div className="h-2 w-28 bg-slate-100 rounded" />
                <div className="h-2 w-10 bg-slate-200 rounded" />
              </div>
            </div>

            <div className="border-b border-dashed border-slate-200" />

            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-2 w-14 bg-slate-100 rounded" />
                <div className="h-2 w-10 bg-slate-200 rounded" />
              </div>
              <div className="h-10 w-full bg-slate-100 border border-slate-200/50 rounded-xl" />
            </div>
          </div>
        ) : (
          <div id="thermal-receipt-card" className="bg-white p-4 border border-dashed border-slate-200 rounded-2xl text-black shadow-inner space-y-4">
            <div className="text-center space-y-1">
              <img src="/favicon.svg" alt="Wolf Gym Logo" className="mx-auto w-10 h-10 object-contain mb-1" />
              <h4 className="font-heading text-xs tracking-wider text-slate-900 uppercase leading-none">{gymName}</h4>
              <p className="text-[8px] text-slate-500 uppercase tracking-tight max-w-[240px] mx-auto leading-normal">
                {gymAddress}
              </p>
              <p className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">{staffContact}</p>
            </div>

            <div className="border-b border-dashed border-slate-200" />
            <div className="text-center font-bold tracking-wider text-slate-900 uppercase text-[9px]">Product Official Receipt</div>
            <div className="border-b border-dashed border-slate-200" />

            <div className="space-y-1.5 text-[9px] text-slate-700">
              <div className="flex justify-between"><span className="text-slate-500">RECEIPT NO</span><span className="font-semibold">{receiptNo}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">PAYMENT METHOD</span><span className="font-semibold uppercase">{paymentMethod}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TRANSACTION DATE</span><span className="font-semibold">{txDateStr} • {formattedTimeStr}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">PROCESSED BY</span><span className="font-semibold uppercase">Staff</span></div>
            </div>

            <div className="border-b border-dashed border-slate-200" />

            <div className="space-y-2 text-left">
              <span className="text-slate-900 text-[9px] font-bold block uppercase tracking-wider">Purchased Items</span>
              <div className="space-y-1.5">
                {receiptItems.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-start text-[9px] text-slate-800">
                    <span>{item.quantity}x {item.productName || item.product_name}</span>
                    <span className="font-semibold font-mono">₱{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-dashed border-slate-200" />

            <div className="space-y-1.5 text-xs text-slate-900">
              <div className="flex justify-between font-bold text-[9px]"><span className="text-slate-500">SUBTOTAL</span><span>₱{totalAmount.toFixed(2)}</span></div>
              <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-xs">
                <span>TOTAL PAID</span><span className="text-[#bf0202]">₱{totalAmount.toFixed(2)}</span>
              </div>

              {paymentMethod === 'Cash' && amountReceived !== null && (
                <div className="space-y-1 pt-1 text-[9px] text-slate-500">
                  <div className="flex justify-between"><span>CASH RECEIVED</span><span>₱{amountReceived.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-slate-800"><span>CHANGE DUE</span><span>₱{changeCalculated.toFixed(2)}</span></div>
                </div>
              )}

              {paymentMethod === 'GCash' && (tx.reference_number || tx.referenceNumber) && (
                <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[8px] font-mono flex items-center justify-between text-slate-700">
                  <span>GCash REF NO:</span><span className="font-black text-emerald-600">{tx.reference_number || tx.referenceNumber}</span>
                </div>
              )}
            </div>

            <div className="border-b border-dashed border-slate-200" />
            <div className="space-y-1 text-[8px] text-slate-500 font-sans uppercase">
              {vatEnabled ? (
                <>
                  <div className="flex justify-between"><span>VATABLE SALES</span><span>₱{vatableSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>VAT ({vatPercentage}% INCLUSIVE)</span><span>₱{vatAmount.toFixed(2)}</span></div>
                </>
              ) : (
                <></>
              )}
            </div>

            <div className="border-b border-dashed border-slate-200" />
            <div className="text-center space-y-1 text-[8px] text-slate-400 font-sans">
              <p className="font-semibold uppercase tracking-wider">This serves as your Sales Invoice</p>
              <p>Thank you for choosing {gymProfile?.gym_name ? gymProfile.gym_name.replace('WOLF ', '') : 'Wolf Gym'}.</p>
            </div>
          </div>
        )}

        {/* --- CONTROL BLOCK ACTIONS --- */}
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
            className="py-3 px-4 bg-[var(--bg-input)] hover:bg-slate-800 disabled:opacity-50 text-[var(--color-text)] border border-[var(--border-color)] font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};