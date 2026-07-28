// src/pages/members/components/ManualCardTemplateModal.tsx

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, CreditCard } from 'lucide-react';
import type { Member } from '../../../types/members';
import cardTemplateImg from '../../../assets/Member-Card-Template.webp';

interface ManualCardTemplateModalProps {
  member: Member;
  onClose: () => void;
}

export const ManualCardTemplateModal: React.FC<ManualCardTemplateModalProps> = ({
  member,
  onClose,
}) => {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Manual Card Template - ${member.full_name}</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; background: #000; }
              @page { size: 85.6mm 53.98mm; margin: 0; }
            }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: #000000;
            }
            .card-container {
              width: 85.6mm;
              height: 53.98mm;
              border-radius: 3.5mm;
              overflow: hidden;
              background: #000000;
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
            }
            .card-container img {
              width: 100%;
              height: 100%;
              object-fit: contain; /* FIXED: Prevents cutting off top & bottom text */
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="card-container">
            <img src="${cardTemplateImg}" alt="Palomar Gym Physical Card Template" />
          </div>
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
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-body text-xs text-(--color-text)">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-(--border-color) pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-500" />
            <h3 className="font-heading text-sm font-bold tracking-wider uppercase">
              MANUAL PHYSICAL CARD TEMPLATE
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-(--bg-page) border border-(--border-color) text-slate-400 hover:text-(--color-text) cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed text-left">
          Official printable physical card background template for manually filled client passes.
        </p>

        {/* Template Image Preview Container - FIXED: Padding + object-contain */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[400px] aspect-[1.586/1] rounded-2xl overflow-hidden border border-zinc-800 shadow-xl bg-black p-1.5 flex items-center justify-center">
            <img 
              src={cardTemplateImg} 
              alt="Physical Member Card Template" 
              className="w-full h-full object-contain block"
            />
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            Template Reference • Unmodified Full Asset
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-(--bg-page) border border-(--border-color) text-slate-400 hover:text-(--color-text) rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold cursor-pointer transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold cursor-pointer flex items-center justify-center gap-2 shadow-md transition-colors border-none"
          >
            <Printer className="w-4 h-4" />
            <span>Print Template Sheet</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};