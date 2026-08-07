import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, QrCode, Calendar, AlertTriangle, RefreshCw, DollarSign, Users, Dumbbell } from 'lucide-react';
import type { Member, Subscription, MemberCard } from '../../../types/members';
import cardTemplateImg from '../../../assets/Member-Card-Template.webp';

interface DigitalQRCardModalProps {
  member: Member;
  subscription?: Subscription;
  card?: MemberCard;
  onClose: () => void;
}

export const DigitalQRCardModal: React.FC<DigitalQRCardModalProps> = ({
  member,
  subscription,
  card,
  onClose,
}) => {
  // Format switch state: QR vs Manual
  const [selectedFormat, setSelectedCardFormat] = useState<'QR' | 'Manual'>('QR');

  const [issueDate, setIssueDate] = useState<string>(() => {
    if (card?.issued_at) {
      return new Date(card.issued_at).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  });

  const [expireDate, setExpireDate] = useState<string>(() => {
    if (card?.expires_at) {
      return new Date(card.expires_at).toISOString().split('T')[0];
    }
    const d = new Date();
    d.setFullYear(d.getFullYear() + 3); // Default exact +3 Years (2026-08-07 -> 2029-08-07)
    return d.toISOString().split('T')[0];
  });

  // Payload string strictly uses MEMBER_ID:EXPIRYDATE
  const qrData = card?.card_number || `${member.member_id}:${expireDate}`;
  const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

  const [showConfig, setShowConfig] = useState<boolean>(true);

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

  const applyPresetDays = (days: number) => {
    const d = new Date(issueDate);
    if (days === 1095 || days === 3) {
      d.setFullYear(d.getFullYear() + 3); // Exact +3 Years
    } else if (days === 365 || days === 1) {
      d.setFullYear(d.getFullYear() + 1); // Exact +1 Year
    } else {
      d.setDate(d.getDate() + days);
    }
    setExpireDate(d.toISOString().split('T')[0]);
  };

  const syncWithSubscription = () => {
    if (subscription?.end_date) {
      setExpireDate(new Date(subscription.end_date).toISOString().split('T')[0]);
    } else {
      applyPresetDays(1095);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    if (selectedFormat === 'Manual') {
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
                object-fit: contain;
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
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Digital QR Card - ${member.full_name}</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; background: #000; }
              @page { size: 85.6mm 53.98mm; margin: 0; }
            }
            body {
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: #000000;
              color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .card {
              width: 85.6mm;
              height: 53.98mm;
              background-color: #000000;
              border-radius: 3.5mm;
              padding: 2mm 3mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1px solid #1a1a1a;
              position: relative;
              overflow: hidden;
              line-height: 1;
            }
            .header { text-align: center; }
            .gym-title { font-family: 'Freshman', 'Arial Black', Impact, sans-serif; font-size: 9.5pt; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; line-height: 1; margin: 0; }
            .header-red-line { height: 0.35mm; background-color: #dc2626; margin: 0.6mm auto 0.5mm auto; width: 92%; }
            .gym-subtitle { font-family: 'Freshman', 'Arial Black', Impact, sans-serif; font-size: 7pt; font-weight: 900; color: #dc2626; text-transform: uppercase; line-height: 1; margin: 0; }
            .gym-address, .gym-contact { font-family: Arial, sans-serif; font-size: 4pt; color: #ffffff; line-height: 1.1; font-weight: 600; margin: 0; }
            .red-line { height: 0.35mm; background-color: #dc2626; margin: 0.6mm 0; width: 100%; }

            .main-content { display: flex; gap: 2.5mm; align-items: center; flex: 1; min-height: 0; margin: 0.5mm 0; }
            .qr-wrapper {
              background: #ffffff; padding: 1.2mm; border-radius: 2mm; display: flex; align-items: center; justify-content: center;
              width: 22mm; height: 22mm; box-sizing: border-box; flex-shrink: 0; position: relative;
            }
            .qr-wrapper img { width: 100%; height: 100%; object-fit: contain; opacity: ${isExpired ? '0.3' : '1'}; }
            .expired-overlay {
              position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
              background: rgba(220, 38, 38, 0.85); color: #ffffff; font-size: 5pt; font-weight: 900; text-transform: uppercase; text-align: center; border-radius: 2mm; line-height: 1.1;
            }

            .details {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-width: 0;
              height: 100%;
              max-height: 23mm;
              text-align: left;
              box-sizing: border-box;
            }
            .field-group {
              display: flex;
              flex-direction: column;
              flex-shrink: 0;
              margin: 0;
              padding: 0;
            }
            .field-label { 
              font-size: 4.5pt !important; 
              color: #ffffff !important; 
              font-weight: 800 !important; 
              letter-spacing: 0.3px; 
              text-transform: uppercase; 
              margin-bottom: 0.3mm !important; 
              line-height: 1 !important; 
              display: block !important; 
              flex-shrink: 0 !important; 
            }
            .field-box {
              background: #ffffff; 
              color: #000000; 
              border-radius: 1mm; 
              padding: 0.6mm 1.2mm;
              font-family: Arial, sans-serif; 
              font-size: 6pt; 
              font-weight: 800; 
              white-space: nowrap; 
              overflow: hidden; 
              text-overflow: ellipsis; 
              line-height: 1.1;
              box-sizing: border-box;
            }
            .dates-row { display: flex; gap: 1mm; align-items: flex-end; }
            .dates-row .field-group { flex: 1; min-width: 0; }
            .dates-row .field-box { font-size: 5pt; text-align: center; padding: 0.5mm 0.4mm; }
            .vertical-red-divider { width: 0.3mm; height: 6mm; background-color: #dc2626; flex-shrink: 0; margin-bottom: 0.2mm; }

            .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 0.2mm; font-family: Arial, sans-serif; font-size: 3.6pt; color: #ffffff; font-weight: 800; }
            .footer-divider { width: 0.3mm; height: 3.2mm; background-color: #dc2626; flex-shrink: 0; }
            .footer-item { display: flex; align-items: center; gap: 0.8mm; flex: 1; justify-content: center; }
            .footer-two-line { display: flex; flex-direction: column; line-height: 1.0; text-align: left; }
            .icon-circle {
              width: 2.8mm; height: 2.8mm; border-radius: 50%; border: 0.25mm solid #dc2626; color: #ffffff;
              display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; background: #000;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div class="gym-title">WOLF PALOMAR GYM</div>
              <div class="header-red-line"></div>
              <div class="gym-subtitle">MUAYTHAI BOXING</div>
              <div class="gym-address">6B Judge A. Roldan St., Navotas City, Metro Manila</div>
              <div class="gym-contact">09098893819 / 09054380792</div>
            </div>

            <div class="main-content">
              <div class="qr-wrapper">
                <img src="${qrImageSrc}" alt="QR Code" />
                ${isExpired ? '<div class="expired-overlay"><span>EXPIRED</span><span>BADGE</span></div>' : ''}
              </div>

              <div class="details">
                <div class="field-group">
                  <span class="field-label">FULL NAME</span>
                  <div class="field-box">${member.full_name.toUpperCase()}</div>
                </div>

                <div class="field-group">
                  <span class="field-label">CONTACT NUMBER</span>
                  <div class="field-box">${member.phone || 'N/A'}</div>
                </div>

                <div class="dates-row">
                  <div class="field-group">
                    <span class="field-label">ISSUE DATE</span>
                    <div class="field-box">${formattedIssue}</div>
                  </div>
                  <div class="vertical-red-divider"></div>
                  <div class="field-group">
                    <span class="field-label">CARD EXPIRATION</span>
                    <div class="field-box" style="color: ${isExpired ? '#dc2626' : '#000000'}">${formattedExpire}</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="red-line"></div>
              <div class="footer">
                <div class="footer-item">
                  <div class="icon-circle">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
                      <line x1="12" y1="2" x2="12" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      <line x1="3" y1="21" x2="21" y2="3" stroke="#dc2626" stroke-width="2.5" />
                    </svg>
                  </div>
                  <span>NON-REFUNDABLE</span>
                </div>
                <div class="footer-divider"></div>
                <div class="footer-item">
                  <div class="icon-circle">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                      <line x1="3" y1="21" x2="21" y2="3" stroke="#dc2626" stroke-width="2.5" />
                    </svg>
                  </div>
                  <span>NON-TRANSFERRABLE</span>
                </div>
                <div class="footer-divider"></div>
                <div class="footer-item">
                  <div class="icon-circle">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
                      <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
                    </svg>
                  </div>
                  <div class="footer-two-line">
                    <span>BE RESPONSIBLE</span>
                    <span>WHEN RETURNING EQUIPMENTS</span>
                  </div>
                </div>
              </div>
            </div>
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
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-body text-xs text-white">
      
      {/* SCOPED PREVIEW STYLES */}
      <style>{`
        .single-qr-card .card {
          width: 85.6mm;
          height: 53.98mm;
          background-color: #000000;
          border-radius: 3.5mm;
          padding: 2mm 3mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border: 1px solid #1a1a1a;
          position: relative;
          overflow: hidden;
          color: #ffffff;
          font-family: Arial, sans-serif;
          text-align: left;
          line-height: 1;
        }
        .single-qr-card .header { text-align: center; }
        .single-qr-card .gym-title { font-family: 'Freshman', 'Arial Black', Impact, sans-serif; font-size: 9.5pt; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; line-height: 1; margin: 0; }
        .single-qr-card .header-red-line { height: 0.35mm; background-color: #dc2626; margin: 0.6mm auto 0.5mm auto; width: 92%; }
        .single-qr-card .gym-subtitle { font-family: 'Freshman', 'Arial Black', Impact, sans-serif; font-size: 7pt; font-weight: 900; color: #dc2626; text-transform: uppercase; line-height: 1; margin: 0; }
        .single-qr-card .gym-address, .single-qr-card .gym-contact { font-family: Arial, sans-serif; font-size: 4pt; color: #ffffff; line-height: 1.1; font-weight: 600; margin: 0; }
        .single-qr-card .red-line { height: 0.35mm; background-color: #dc2626; margin: 0.6mm 0; width: 100%; }

        .single-qr-card .main-content { display: flex; gap: 2.5mm; align-items: center; flex: 1; min-height: 0; margin: 0.5mm 0; }
        .single-qr-card .qr-wrapper {
          background: #ffffff; padding: 1.2mm; border-radius: 2mm; display: flex; align-items: center; justify-content: center;
          width: 22mm; height: 22mm; box-sizing: border-box; flex-shrink: 0; position: relative;
        }
        .single-qr-card .qr-wrapper img { width: 100%; height: 100%; object-fit: contain; }
        .single-qr-card .expired-overlay {
          position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: rgba(220, 38, 38, 0.85); color: #ffffff; font-size: 5pt; font-weight: 900; text-transform: uppercase; text-align: center; border-radius: 2mm; line-height: 1.1;
        }

        .single-qr-card .details { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; height: 100%; max-height: 23mm; text-align: left; box-sizing: border-box; }
        .single-qr-card .field-group { display: flex; flex-direction: column; flex-shrink: 0; text-align: left; margin: 0; padding: 0; }
        .single-qr-card .field-label {
          font-size: 4.5pt !important; color: #ffffff !important; font-weight: 800 !important; letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 0.3mm !important; line-height: 1 !important; display: block !important; flex-shrink: 0 !important; opacity: 1 !important; visibility: visible !important;
        }
        .single-qr-card .field-box {
          background: #ffffff; color: #000000; border-radius: 1mm; padding: 0.6mm 1.2mm;
          font-family: Arial, sans-serif; font-size: 6pt; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; box-sizing: border-box;
        }
        .single-qr-card .dates-row { display: flex; gap: 1mm; align-items: flex-end; }
        .single-qr-card .dates-row .field-group { flex: 1; min-width: 0; }
        .single-qr-card .dates-row .field-box { font-size: 5pt; text-align: center; padding: 0.5mm 0.4mm; }
        .single-qr-card .vertical-red-divider { width: 0.3mm; height: 6mm; background-color: #dc2626; flex-shrink: 0; margin-bottom: 0.2mm; }

        .single-qr-card .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 0.2mm; font-family: Arial, sans-serif; font-size: 3.6pt; color: #ffffff; font-weight: 800; }
        .single-qr-card .footer-divider { width: 0.3mm; height: 3.2mm; background-color: #dc2626; flex-shrink: 0; }
        .single-qr-card .footer-item { display: flex; align-items: center; gap: 0.8mm; flex: 1; justify-content: center; }
        .single-qr-card .footer-two-line { display: flex; flex-direction: column; line-height: 1.0; text-align: left; }
        .single-qr-card .icon-circle {
          width: 2.8mm; height: 2.8mm; border-radius: 50%; border: 0.25mm solid #dc2626; color: #ffffff;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; background: #000;
        }
      `}</style>

      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5">
        
        {/* Modal Header with Format Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-red-500" />
            <h3 className="font-heading text-sm font-black tracking-wider uppercase text-white">
              CREDENTIAL BADGE CONFIGURATOR
            </h3>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => setSelectedCardFormat('QR')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  selectedFormat === 'QR' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                QR Card
              </button>
              <button
                type="button"
                onClick={() => setSelectedCardFormat('Manual')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  selectedFormat === 'Manual' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Manual Card
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* EXPIRATION & CONFIGURATION CONTROLS (Only visible for QR mode) */}
        {selectedFormat === 'QR' && (
          <div className="p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl space-y-3 text-left">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-red-500" /> Card Validity & Expiry Configuration
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="text-[9px] font-bold uppercase text-red-400 hover:underline cursor-pointer"
              >
                {showConfig ? 'Hide Config' : 'Edit Dates'}
              </button>
            </div>

            {showConfig && (
              <div className="space-y-3 pt-1 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Issue Date</label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full p-2 bg-black border border-zinc-800 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Expiration Date</label>
                    <input
                      type="date"
                      value={expireDate}
                      onChange={(e) => setExpireDate(e.target.value)}
                      className="w-full p-2 bg-black border border-zinc-800 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase mr-1">Quick Add:</span>
                  <button
                    type="button"
                    onClick={() => applyPresetDays(30)}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer"
                  >
                    +30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetDays(365)}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer"
                  >
                    +1 Year
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetDays(1095)}
                    className="px-2.5 py-1 bg-red-600/30 text-red-400 border border-red-500/30 hover:bg-red-600/40 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer"
                  >
                    +3 Years (Default)
                  </button>
                  <button
                    type="button"
                    onClick={syncWithSubscription}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[9px] font-heading font-bold uppercase cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Sync Plan
                  </button>
                </div>
              </div>
            )}

            {/* Expiration Alert Banner */}
            {isExpired && (
              <div className="p-2.5 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2 text-red-400 text-[10px] font-bold">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>Card Expiration Date has passed! This QR code will render as <strong>EXPIRED / INVALID</strong> upon scanning.</span>
              </div>
            )}
          </div>
        )}

        {/* 1:1 CARD PREVIEW (QR vs MANUAL SWITCH) */}
        {selectedFormat === 'QR' ? (
          <div className="flex justify-center select-none single-qr-card">
            <div className="card">
              
              {/* CARD TOP BRANDING HEADER */}
              <div className="header">
                <div className="gym-title">WOLF PALOMAR GYM</div>
                <div className="header-red-line" />
                <div className="gym-subtitle">MUAYTHAI BOXING</div>
                <div className="gym-address">6B Judge A. Roldan St., Navotas City, Metro Manila</div>
                <div className="gym-contact">09098893819 / 09054380792</div>
              </div>

              {/* CARD MIDDLE GRID */}
              <div className="main-content">
                
                {/* QR CODE CONTAINER */}
                <div className="qr-wrapper">
                  <img 
                    src={qrImageSrc} 
                    alt="Member QR Code" 
                    style={{ opacity: isExpired ? 0.25 : 1 }}
                  />
                  {isExpired && (
                    <div className="expired-overlay">
                      <span>EXPIRED</span>
                      <span>BADGE</span>
                    </div>
                  )}
                </div>

                {/* DYNAMIC FIELDS */}
                <div className="details">
                  <div className="field-group">
                    <span className="field-label">FULL NAME</span>
                    <div className="field-box">{member.full_name.toUpperCase()}</div>
                  </div>

                  <div className="field-group">
                    <span className="field-label">CONTACT NUMBER</span>
                    <div className="field-box">{member.phone || 'N/A'}</div>
                  </div>

                  <div className="dates-row">
                    <div className="field-group">
                      <span className="field-label">ISSUE DATE</span>
                      <div className="field-box">{formattedIssue}</div>
                    </div>
                    <div className="vertical-red-divider" />
                    <div className="field-group">
                      <span className="field-label">CARD EXPIRATION</span>
                      <div 
                        className="field-box" 
                        style={{ color: isExpired ? '#dc2626' : '#000000' }}
                      >
                        {formattedExpire}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* CARD BOTTOM RULES FOOTER */}
              <div>
                <div className="red-line" />
                <div className="footer">
                  <div className="footer-item">
                    <div className="icon-circle">
                      <DollarSign className="w-2.5 h-2.5 text-white" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-[1px] bg-red-600 -rotate-45" />
                      </div>
                    </div>
                    <span>NON-REFUNDABLE</span>
                  </div>
                  <div className="footer-divider" />
                  <div className="footer-item">
                    <div className="icon-circle">
                      <Users className="w-2.5 h-2.5 text-white" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-[1px] bg-red-600 -rotate-45" />
                      </div>
                    </div>
                    <span>NON-TRANSFERRABLE</span>
                  </div>
                  <div className="footer-divider" />
                  <div className="footer-item">
                    <div className="icon-circle">
                      <Dumbbell className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="footer-two-line">
                      <span>BE RESPONSIBLE</span>
                      <span>WHEN RETURNING EQUIPMENTS</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* MANUAL TEMPLATE CARD PREVIEW */
          <div className="flex flex-col items-center gap-2 select-none">
            <div className="w-full max-w-[400px] aspect-[1.586/1] rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl bg-black p-1.5 flex items-center justify-center">
              <img 
                src={cardTemplateImg} 
                alt="Manual Member Card Template Asset" 
                className="w-full h-full object-contain block"
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              Manual Card Template Asset • Full Unmodified Design
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className={`flex-1 py-2.5 text-white rounded-xl font-heading text-[10px] tracking-wider uppercase font-bold cursor-pointer flex items-center justify-center gap-2 shadow-md transition-colors border-none ${
              selectedFormat === 'Manual' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>{selectedFormat === 'Manual' ? 'Print Manual Template' : 'Print Official QR Card'}</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};