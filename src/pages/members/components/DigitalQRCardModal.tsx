// src/pages/members/components/DigitalQRCardModal.tsx
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Eye } from 'lucide-react';
import type { Member, Subscription, MemberCard } from '../../../types/members';
import cardTemplateImg from '../../../assets/Member-Card-Template.webp';

interface DigitalQRCardModalProps {
  member: Member;
  subscription?: Subscription;
  card?: MemberCard;
  onClose: () => void;
  onOpenPrintModal?: (memberId: string) => void;
}

export const DigitalQRCardModal: React.FC<DigitalQRCardModalProps> = ({
  member,
  card,
  onClose,
  onOpenPrintModal,
}) => {
  // Format switch state: QR vs Manual Template
  const [selectedFormat] = useState<'QR' | 'Manual'>('QR');

  const issueDate = useMemo<string>(() => {
    if (card?.issued_at) {
      return new Date(card.issued_at).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  }, [card?.issued_at]);

  const expireDate = useMemo<string>(() => {
    if (card?.expires_at) {
      return new Date(card.expires_at).toISOString().split('T')[0];
    }
    const d = new Date();
    d.setFullYear(d.getFullYear() + 3); // Default +3 Years
    return d.toISOString().split('T')[0];
  }, [card?.expires_at]);

  // Payload string strictly uses secure UUID card token (or member_id fallback)
  const qrData = card?.card_number || member.member_id;
  const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrData)}`;

  // Expiration calculation logic
  const isExpired = useMemo(() => {
    if (!expireDate) return true;
    const exp = new Date(expireDate);
    exp.setHours(23, 59, 59, 999);
    return exp.getTime() < new Date().getTime();
  }, [expireDate]);

  const formattedIssue = useMemo(() => {
    try {
      return new Date(issueDate).toLocaleDateString();
    } catch {
      return issueDate;
    }
  }, [issueDate]);

  const formattedExpire = useMemo(() => {
    try {
      return new Date(expireDate).toLocaleDateString();
    } catch {
      return expireDate;
    }
  }, [expireDate]);

  // Trigger redirection to MemberCardPrintModal
  const handleRedirectToPrint = () => {
    onClose();
    if (onOpenPrintModal) {
      onOpenPrintModal(member.id);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-body text-xs text-white">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-xl shadow-2xl p-6 space-y-4 max-h-[95vh] overflow-y-auto no-scrollbar">
        
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-red-500" />
            <h3 className="font-heading text-sm font-black tracking-wider uppercase text-white">
              MEMBER CARD PREVIEW
            </h3>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ENLARGED 1:1 PIXEL-ACCURATE CARD PREVIEW */}
        {selectedFormat === 'QR' ? (
          <div className="flex justify-center select-none py-3">
            <div className="w-full max-w-115 aspect-[1.586/1] bg-black rounded-2xl p-3.5 flex flex-col justify-between border border-zinc-800 shadow-2xl relative overflow-hidden font-sans">
              
              {/* CARD TOP BRANDING HEADER */}
              <div className="text-center shrink-0">
                <div className="font-heading text-[15px] font-black tracking-wider text-white uppercase leading-none">
                  WOLF PALOMAR GYM
                </div>
                <div className="h-[1.5px] bg-[#dc2626] my-1 w-[94%] mx-auto" />
                <div className="font-heading text-[11px] font-black tracking-wider text-[#dc2626] uppercase leading-none">
                  MUAYTHAI BOXING
                </div>
                <div className="text-[7.5px] text-white font-semibold leading-tight mt-0.5">
                  6B Judge A. Roldan St., Navotas City, Metro Manila
                </div>
                <div className="text-[7.5px] text-white font-semibold leading-tight">
                  09098893819 / 09054380792
                </div>
              </div>

              {/* CARD MIDDLE GRID */}
              <div className="flex gap-3 items-center flex-1 my-1.5 min-h-0">
                
                {/* QR CODE CONTAINER */}
                <div className="bg-white p-1.5 rounded-xl w-28 h-28 flex items-center justify-center shrink-0 relative">
                  <img 
                    src={qrImageSrc} 
                    alt="Member QR Code" 
                    className="w-full h-full object-contain"
                    style={{ opacity: isExpired ? 0.25 : 1 }}
                  />
                  {isExpired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-600/90 text-white font-black text-[10px] uppercase tracking-wider rounded-xl leading-tight text-center">
                      <span>EXPIRED</span>
                      <span>BADGE</span>
                    </div>
                  )}
                </div>

                {/* DYNAMIC FIELDS WITH VISIBLE LABELS */}
                <div className="flex-1 flex flex-col justify-between h-full max-h-28 text-left">
                  
                  {/* FULL NAME */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] font-black text-white uppercase tracking-wider leading-none">
                      FULL NAME
                    </span>
                    <div className="bg-white text-black font-extrabold text-[11px] px-2 py-1 rounded-md truncate leading-tight shadow-inner">
                      {member.full_name.toUpperCase()}
                    </div>
                  </div>

                  {/* CONTACT NUMBER */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] font-black text-white uppercase tracking-wider leading-none">
                      CONTACT NUMBER
                    </span>
                    <div className="bg-white text-black font-extrabold text-[11px] px-2 py-1 rounded-md truncate leading-tight shadow-inner">
                      {member.phone || 'N/A'}
                    </div>
                  </div>

                  {/* DATES ROW */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[7.5px] font-black text-white uppercase tracking-wider leading-none">
                        ISSUE DATE
                      </span>
                      <div className="bg-white text-black font-extrabold text-[9px] px-1 py-1 rounded-md text-center leading-tight">
                        {formattedIssue}
                      </div>
                    </div>

                    <div className="w-[1.5px] h-6 bg-[#dc2626] shrink-0 mb-px" />

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[7.5px] font-black text-white uppercase tracking-wider leading-none">
                        EXPIRATION
                      </span>
                      <div 
                        className="bg-white font-extrabold text-[9px] px-1 py-1 rounded-md text-center leading-tight"
                        style={{ color: isExpired ? '#dc2626' : '#000000' }}
                      >
                        {formattedExpire}
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* CARD BOTTOM RULES FOOTER */}
              <div className="shrink-0">
                <div className="h-[1.5px] bg-[#dc2626] mb-1 w-full" />
                <div className="text-[6.5px] font-extrabold text-white text-center uppercase tracking-wider leading-tight">
                  NON-REFUNDABLE &nbsp;•&nbsp; NON-TRANSFERRABLE &nbsp;•&nbsp; BE RESPONSIBLE WITH EQUIPMENT
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* MANUAL TEMPLATE CARD PREVIEW */
          <div className="flex flex-col items-center gap-2 select-none py-3">
            <div className="w-full max-w-115 aspect-[1.586/1] rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl bg-black p-1 flex items-center justify-center">
              <img 
                src={cardTemplateImg} 
                alt="Manual Member Card Template Asset" 
                className="w-full h-full object-contain block"
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              Manual Blank Physical Card Asset
            </span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold cursor-pointer transition-colors"
          >
            Close Preview
          </button>
          
          <button
            type="button"
            onClick={handleRedirectToPrint}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold cursor-pointer flex items-center justify-center gap-2 shadow-md transition-colors border-none"
          >
            <Printer className="w-4 h-4" />
            <span>Go to Card Printing Portal</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};