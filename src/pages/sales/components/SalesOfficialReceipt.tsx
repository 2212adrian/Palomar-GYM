// src/pages/sales/components/SalesOfficialReceipt.tsx
import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Download, Printer } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';

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
  const formattedTimeStr = useMemo(() => {
    if (!tx || !tx.createdAt) return 'N/A';
    try {
      return format(parseISO(tx.createdAt), 'hh:mm:ss a');
    } catch {
      return 'N/A';
    }
  }, [tx]);

  const receiptItems = useMemo(() => {
    if (!tx) return [];
    if (tx.items && tx.items.length > 0) return tx.items;
    return [{
      productName: tx.productName || 'Catalog Product',
      quantity: tx.quantity || 1,
      price: Number(tx.totalAmount || 0) / (tx.quantity || 1)
    }];
  }, [tx]);

  const subtotal = tx?.totalAmount || 0;
  const vatableSales = subtotal / 1.12;
  const vatAmount = subtotal - vatableSales;

  // --- NATIVE ISOLATED SANDBOX PRINTER (Guarantees zero outer UI leakage) ---
  const handlePrintReceipt = () => {
    const content = document.getElementById('thermal-receipt-card');
    if (!content) return;

    // Create a hidden iframe
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

    // Load active layout stylesheets
    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
      stylesHtml += el.outerHTML;
    });

    // Write ONLY the isolated thermal element with explicit CSS reset
    doc.write(`
      <html>
        <head>
          <title>Official Receipt</title>
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

  // --- HIGH FIDELITY JPEG COMPILER (Matches original receipt visual styling) ---
  const handleDownloadReceiptJpg = () => {
    if (!tx) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('WOLF PALOMAR GYM', 200, 45);

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('Palomar Gym Center, Barangay Central', 200, 65);
    ctx.fillText('Quezon City, Metro Manila, Philippines', 200, 80);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('Staff Contact: 09762607481', 200, 95);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, 115); ctx.lineTo(370, 115); ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('PRODUCT OFFICIAL RECEIPT', 200, 135);

    ctx.beginPath(); ctx.moveTo(30, 150); ctx.lineTo(370, 150); ctx.stroke();

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

    renderRow('RECEIPT NO', tx.id, 175);
    renderRow('PAYMENT METHOD', tx.paymentMethod.toUpperCase(), 195);
    renderRow('TRANSACTION DATE', `${tx.date} • ${formattedTimeStr}`, 215);
    renderRow('PROCESSED BY', 'STAFF', 235);

    ctx.beginPath(); ctx.moveTo(30, 255); ctx.lineTo(370, 255); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('PURCHASED ITEMS', 30, 275);

    let itemY = 300;
    receiptItems.forEach((item: any) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334155';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${item.quantity}x ${item.productName}`, 30, itemY);
      
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
    ctx.fillText(`₱${subtotal.toFixed(2)}`, 370, itemY);

    itemY += 15;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    
    // Draw rounded block
    ctx.beginPath();
    const x = 30; const y = itemY; const w = 340; const h = 32; const r = 10;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('TOTAL PAID', 45, itemY + 20);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#bf0202';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`₱${subtotal.toFixed(2)}`, 355, itemY + 20);

    itemY += 50;
    if (tx.paymentMethod === 'Cash' && tx.amountReceived !== null) {
      renderRow('CASH RECEIVED', `₱${tx.amountReceived.toFixed(2)}`, itemY);
      renderRow('CHANGE DUE', `₱${(tx.changeCalculated || 0).toFixed(2)}`, itemY + 20);
      itemY += 40;
    } else if (tx.paymentMethod === 'GCash' && tx.referenceNumber) {
      renderRow('GCASH REF NO', tx.referenceNumber, itemY);
      itemY += 20;
    }

    ctx.beginPath(); ctx.moveTo(30, itemY); ctx.lineTo(370, itemY); ctx.stroke();

    itemY += 18;
    renderRow('VATABLE SALES', `₱${vatableSales.toFixed(2)}`, itemY);
    renderRow('VAT (12% INCLUSIVE)', `₱${vatAmount.toFixed(2)}`, itemY + 18);

    itemY += 45;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('THIS SERVES AS YOUR SALES INVOICE', 200, itemY);
    ctx.font = '600 9px sans-serif';
    ctx.fillText('Thank you for choosing Wolf Gym.', 200, itemY + 16);

    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
    const link = document.createElement('a');
    link.download = `Palomar_Receipt_${tx.id}.jpg`;
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

        {/* --- PURE THERMAL RECEIPT CARD CONTAINER --- */}
        <div id="thermal-receipt-card" className="bg-white p-4 border border-dashed border-slate-200 rounded-2xl text-black shadow-inner space-y-4">
          <div className="text-center space-y-1">
            <img src="/favicon.svg" alt="Wolf Gym Logo" className="mx-auto w-10 h-10 object-contain mb-1" />
            <h4 className="font-heading text-xs tracking-wider text-slate-900 uppercase leading-none">WOLF PALOMAR GYM</h4>
            <p className="text-[8px] text-slate-500 uppercase tracking-tight max-w-[200px] mx-auto leading-normal">
              Palomar Gym Center, Barangay Central, Quezon City, Metro Manila, Philippines
            </p>
            <p className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">Staff Contact: 09762607481</p>
          </div>

          <div className="border-b border-dashed border-slate-200" />
          <div className="text-center font-bold tracking-wider text-slate-900 uppercase text-[9px]">Product Official Receipt</div>
          <div className="border-b border-dashed border-slate-200" />

          <div className="space-y-1.5 text-[9px] text-slate-700">
            <div className="flex justify-between"><span className="text-slate-500">RECEIPT NO</span><span className="font-semibold">{tx.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">PAYMENT METHOD</span><span className="font-semibold uppercase">{tx.paymentMethod}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">TRANSACTION DATE</span><span className="font-semibold">{tx.date} • {formattedTimeStr}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">PROCESSED BY</span><span className="font-semibold uppercase">Staff</span></div>
          </div>

          <div className="border-b border-dashed border-slate-200" />

          <div className="space-y-2 text-left">
            <span className="text-slate-900 text-[9px] font-bold block uppercase tracking-wider">Purchased Items</span>
            <div className="space-y-1.5">
              {receiptItems.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[9px] text-slate-800">
                  <span>{item.quantity}x {item.productName}</span>
                  <span className="font-semibold font-mono">₱{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-b border-dashed border-slate-200" />

          <div className="space-y-1.5 text-xs text-slate-900">
            <div className="flex justify-between font-bold text-[9px]"><span className="text-slate-500">SUBTOTAL</span><span>₱{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-extrabold text-xs">
              <span>TOTAL PAID</span><span className="text-[#bf0202]">₱{subtotal.toFixed(2)}</span>
            </div>

            {tx.paymentMethod === 'Cash' && tx.amountReceived !== null && (
              <div className="space-y-1 pt-1 text-[9px] text-slate-500">
                <div className="flex justify-between"><span>CASH RECEIVED</span><span>₱{tx.amountReceived.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-slate-800"><span>CHANGE DUE</span><span>₱{(tx.changeCalculated || 0).toFixed(2)}</span></div>
              </div>
            )}

            {tx.paymentMethod === 'GCash' && tx.referenceNumber && (
              <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[8px] font-mono flex items-center justify-between text-slate-700">
                <span>GCash REF NO:</span><span className="font-black text-emerald-600">{tx.referenceNumber}</span>
              </div>
            )}
          </div>

          <div className="border-b border-dashed border-slate-200" />
          <div className="space-y-1 text-[8px] text-slate-500 font-sans uppercase">
            <div className="flex justify-between"><span>VATABLE SALES</span><span>₱{vatableSales.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>VAT (12% INCLUSIVE)</span><span>₱{vatAmount.toFixed(2)}</span></div>
          </div>

          <div className="border-b border-dashed border-slate-200" />
          <div className="text-center space-y-1 text-[8px] text-slate-400 font-sans">
            <p className="font-semibold uppercase tracking-wider">This serves as your Sales Invoice</p>
            <p>Thank you for choosing Wolf Gym.</p>
          </div>
        </div>

        {/* --- ACTIONS ROW: Safely isolated from the card view during prints --- */}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleDownloadReceiptJpg}
            className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold"
          >
            <Download className="w-4 h-4" />
            <span>Download JPG</span>
          </button>
          <button
            type="button"
            onClick={handlePrintReceipt}
            className="py-3 px-4 bg-[var(--bg-input)] hover:bg-slate-800 text-[var(--color-text)] border border-[var(--border-color)] font-heading text-[9.5px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};