// src/pages/members/components/MemberQRPrintModal.tsx
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, QrCode } from 'lucide-react';

interface Member {
  id: string;
  member_id: string;
  full_name: string;
}

interface MemberQRPrintModalProps {
  selectedIds: string[];
  members: Member[];
  onClose: () => void;
}

export const MemberQRPrintModal: React.FC<MemberQRPrintModalProps> = ({ 
  selectedIds, 
  members, 
  onClose 
}) => {
  const [printCollection, setPrintCollection] = useState<{ id: string; qty: number }[]>(() => {
    return selectedIds.map(id => ({ id, qty: 1 }));
  });

  const targets = useMemo(() => {
    return members.filter(m => printCollection.some(item => item.id === m.id));
  }, [members, printCollection]);

  const updateQty = (id: string, delta: number) => {
    setPrintCollection(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, qty: Math.max(1, item.qty + delta) };
      }
      return item;
    }));
  };

  const executePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let elementsMarkup = '';
    targets.forEach(m => {
      const collectionItem = printCollection.find(item => item.id === m.id);
      const qty = collectionItem ? collectionItem.qty : 1;
      const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(m.member_id)}`;

      for (let i = 0; i < qty; i++) {
        elementsMarkup += `
          <div class="qr-card">
            <div class="header">WOLF PALOMAR GYM</div>
            <div class="qr-container">
              <img src="${qrImageSrc}" alt="QR" />
            </div>
            <div class="member-name">${m.full_name.toUpperCase()}</div>
            <div class="member-id">${m.member_id}</div>
          </div>
        `;
      }
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Member QR Codes - Wolf Palomar Gym</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              @page { size: portrait; margin: 10mm; }
            }
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 15px;
              padding: 10px;
            }
            .qr-card {
              border: 1px solid #1a1a1a;
              border-radius: 12px;
              padding: 12px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: #fff;
              box-shadow: 0 4px 6px rgba(0,0,0,0.05);
              page-break-inside: avoid;
            }
            .header {
              font-size: 8px;
              font-weight: 900;
              letter-spacing: 2px;
              color: #bf0202;
              margin-bottom: 8px;
            }
            .qr-container img {
              width: 100px;
              height: 100px;
            }
            .member-name {
              font-size: 10px;
              font-weight: bold;
              color: #1a1a1a;
              margin-top: 6px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
            }
            .member-id {
              font-family: monospace;
              font-size: 8px;
              color: #666;
              margin-top: 2px;
            }
          </style>
        </head>
        <body>
          ${elementsMarkup}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in font-body text-xs text-slate-500">
      <div className="bg-slate-50 dark:bg-[#17191c] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-white/5 pb-3 text-slate-900 dark:text-white">
          <h3 className="font-heading tracking-widest uppercase flex items-center gap-1.5">
            <QrCode className="w-5 h-5 text-(--color-primary-light)" />
            <span>QR BATCH PRINT MANAGER</span>
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded bg-slate-100 dark:bg-neutral-900 border text-slate-400 hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] leading-relaxed">
          Configure printable layouts and quantities for selected access cards. QR sheets generate standard sizes optimized for print layouts.
        </p>

        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {targets.map(m => {
            const currentItem = printCollection.find(item => item.id === m.id);
            const qty = currentItem ? currentItem.qty : 1;

            return (
              <div key={m.id} className="p-3 bg-slate-100 dark:bg-zinc-900 rounded-xl border flex items-center justify-between gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <h5 className="font-bold text-slate-900 dark:text-white truncate">{m.full_name}</h5>
                  <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">{m.member_id}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0 select-none">
                  <button
                    type="button"
                    onClick={() => updateQty(m.id, -1)}
                    className="w-7 h-7 rounded-lg border bg-white dark:bg-zinc-800 flex items-center justify-center text-slate-655 cursor-pointer font-black border-none"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-slate-900 dark:text-white">{qty}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(m.id, 1)}
                    className="w-7 h-7 rounded-lg border bg-white dark:bg-zinc-800 flex items-center justify-center text-slate-655 cursor-pointer font-black border-none"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 dark:border-white/10 bg-transparent text-slate-500 rounded-xl font-heading text-[10px] tracking-wider uppercase cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={executePrint}
            className="flex-1 py-3 bg-[#1b365d] dark:bg-[#bf0202] text-white rounded-xl font-heading text-[10px] tracking-wider uppercase cursor-pointer font-bold flex items-center justify-center gap-1.5 shadow-md border-none"
          >
            <Printer className="w-4 h-4" />
            <span>Generate PDF Layout</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};