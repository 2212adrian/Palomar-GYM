// src/pages/members/components/MemberCardPrintModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Printer, Search, CheckSquare, Square, ZoomIn, ZoomOut, Maximize2, 
  ChevronDown, ChevronUp, Calendar, RefreshCw, CreditCard, QrCode,
  Download, Loader2, Lock, ShieldCheck, Sparkles, AlertTriangle
} from 'lucide-react';
import type { Member, Subscription, MemberCard } from '../../../types/members';
import { subscriptionService, cardService } from '../memberService';
import { toast } from 'react-toastify';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import cardTemplateImg from '../../../assets/Member-Card-Template.webp';

export type CardFormatType = 'qr_digital' | 'manual_template';

// Locked Grid Template Layout: 2 x 4 Grid (8 Cards per Letter Sheet)
const CARD_TEMPLATE_8_PER_SHEET = {
  id: '8_per_sheet',
  name: '8 Cards / Letter Sheet (2 x 4 Grid)',
  cardsPerPage: 8,
  cols: 2,
  rows: 4,
  cardWidthMm: 85.6,
  cardHeightMm: 53.98,
  marginTopMm: 10,
  marginLeftMm: 12,
  gapHorizontalMm: 8,
  gapVerticalMm: 8,
};

const LETTER_PAPER = { width: 215.9, height: 279.4, name: 'Letter (8.5" x 11")' };

interface MemberCardPrintModalProps {
  members: Member[];
  initialSelectedIds?: string[];
  onClose: () => void;
}

// Helper to convert Uint8Array / ArrayBuffer to Base64 for Capacitor Filesystem
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const MemberCardPrintModal: React.FC<MemberCardPrintModalProps> = ({
  members,
  initialSelectedIds = [],
  onClose,
}) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cards, setCards] = useState<MemberCard[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [subsData, cardsData] = await Promise.all([
          subscriptionService.getAll(),
          cardService.getAll()
        ]);
        if (isMounted) {
          setSubscriptions(subsData);
          setCards(cardsData);
        }
      } catch (err) {
        console.error('Error loading cards or subscriptions:', err);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  const getMemberCard = (memberId: string) => {
    return cards.find((c: MemberCard) => c.member_id === memberId && c.status === 'Active' && c.card_type !== 'None');
  };

  const getMemberSub = (memberId: string) => {
    return subscriptions.find((s: Subscription) => s.member_id === memberId && s.status === 'Active');
  };

  // Check if active card exists in system
  const isCardIssued = (memberId: string) => {
    return Boolean(getMemberCard(memberId));
  };

  const [cardFormat, setCardFormat] = useState<CardFormatType>('qr_digital');
  
  // DEFAULT CHECKED: Generate Fresh QR Tokens is ON by default when clicking print
  const [rerollQrTokens, setRerollQrTokens] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Reissue Confirmation Modal State
  const [showReissueConfirmModal, setShowReissueConfirmModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'print' | 'download' | null>(null);

  // Helper: Is member eligible for selection based on rerollQrTokens setting
  const isMemberEligible = (memberId: string) => {
    const hasActiveCard = isCardIssued(memberId);
    if (!hasActiveCard) return true; // Always eligible if no card issued yet
    return rerollQrTokens; // Eligible if re-issuing / fresh QR token generation is enabled
  };

  // Default selection: Preserve members selected in the member list
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (initialSelectedIds.length > 0) {
      return initialSelectedIds;
    }
    return members.filter(m => !isCardIssued(m.member_id)).map(m => m.id);
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState<number>(100);
  const [copiesPerMember,] = useState<number>(1);
  const [manualCardCount, setManualCardCount] = useState<number>(8);
  const [activeMobileTab, setActiveMobileTab] = useState<'configure' | 'preview'>('configure');

  // Accordion state for validity/replacement: COLLAPSED BY DEFAULT
  const [isExpiryConfigOpen, setIsExpiryConfigOpen] = useState(false);

  // Locked Issue Date (Automatic to current date)
  const issueDate = useMemo(() => new Date().toISOString().split('T')[0], []);
    
  // Expiration Configuration Override - DEFAULT +3 YEARS (1095 Days)
  const [customExpireDate, setCustomExpireDate] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 3); // Exact +3 years
    return d.toISOString().split('T')[0];
  });

  const [overrideDates, setOverrideDates] = useState<boolean>(true);

  // Validation Flag: Expiration date cannot be earlier than issue date
  const isInvalidDate = customExpireDate < issueDate;

  // Unselect all members upon closing modal
  const handleCloseModal = () => {
    setSelectedIds([]);
    onClose();
  };

  // Helper to check active quick-add preset
  const getActivePresetDays = () => {
    if (!overrideDates) return null;
    const start = new Date(issueDate).getTime();
    const end = new Date(customExpireDate).getTime();
    const diffDays = Math.round((end - start) / (1000 * 3600 * 24));
    
    if (diffDays >= 28 && diffDays <= 31) return 30;
    if (diffDays >= 360 && diffDays <= 366) return 365;
    if (diffDays >= 1090 && diffDays <= 1100) return 1095;
    return null;
  };

  const activePresetDays = getActivePresetDays();

  // Handle Fresh QR / Reissue Checkbox Toggle
  const handleRerollToggle = (checked: boolean) => {
    setRerollQrTokens(checked);
    if (!checked) {
      // Automatically deselect members who already have active cards when reissuing is turned OFF
      setSelectedIds(prev => prev.filter(id => {
        const m = members.find(mem => mem.id === id);
        return m ? !isCardIssued(m.member_id) : true;
      }));
      toast.info('Reissuing disabled: Active cardholders removed from selection.');
    } else {
      toast.success('Reissuing enabled: Active cardholders unlocked for replacement card print.');
    }
  };

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return members.filter(m =>
      q === '' ||
      m.full_name.toLowerCase().includes(q) ||
      m.member_id.toLowerCase().includes(q) ||
      m.phone.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const selectedMembersList = useMemo(() => {
    return members.filter(m => selectedIds.includes(m.id));
  }, [members, selectedIds]);

  // List of active cardholders selected who will be reissued
  const reissuingMembers = useMemo(() => {
    if (cardFormat !== 'qr_digital') return [];
    return selectedMembersList.filter(m => isCardIssued(m.member_id));
  }, [cardFormat, selectedMembersList, cards]);

  const expandedCardsList = useMemo(() => {
    const list: Member[] = [];
    selectedMembersList.forEach(m => {
      for (let i = 0; i < copiesPerMember; i++) {
        list.push(m);
      }
    });
    return list;
  }, [selectedMembersList, copiesPerMember]);

  // Effective Cards List depending on Card Format
  const effectiveCardsList = useMemo(() => {
    if (cardFormat === 'manual_template') {
      return Array.from({ length: manualCardCount }).map((_, idx) => ({
        id: `manual-card-${idx}`,
        member_id: `TEMPLATE-${idx + 1}`,
        full_name: 'MANUAL TEMPLATE CARD',
        phone: '',
        email: '',
        gender: 'Male',
        birthday: '2000-01-01',
        emergency_contact_name: 'Gym Staff',
        relationship: 'Counter',
        emergency_contact_phone: '09762607481',
        address: 'Navotas City',
        status: 'Active' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }
    return expandedCardsList;
  }, [cardFormat, manualCardCount, expandedCardsList]);

  const template = CARD_TEMPLATE_8_PER_SHEET;
  const totalPagesRequired = Math.ceil(effectiveCardsList.length / template.cardsPerPage) || 1;

  const zoomFactor = zoom / 100;
  const paperWidthMm = LETTER_PAPER.width;
  const paperHeightMm = LETTER_PAPER.height;

  const scaledWidthMm = paperWidthMm * zoomFactor;
  const scaledHeightMm = (paperHeightMm * totalPagesRequired) * zoomFactor + (20 * totalPagesRequired * zoomFactor);

  const applyPresetDays = (days: number) => {
    setOverrideDates(true);
    const d = new Date(issueDate);
    if (days === 1095 || days === 3) {
      d.setFullYear(d.getFullYear() + 3); // Exact +3 Years
    } else if (days === 365 || days === 1) {
      d.setFullYear(d.getFullYear() + 1); // Exact +1 Year
    } else {
      d.setDate(d.getDate() + days);
    }
    const newExpDate = d.toISOString().split('T')[0];
    if (newExpDate < issueDate) {
      toast.error('Expiration date cannot be earlier than the issue date.');
      setCustomExpireDate(issueDate);
    } else {
      setCustomExpireDate(newExpDate);
    }
  };

  const handleToggleMember = (member: Member) => {
    const eligible = isMemberEligible(member.member_id);
    if (!eligible) {
      toast.info(`${member.full_name} already has an active card. Turn ON "Generate Fresh QR Tokens" below to reissue.`);
      return;
    }
    setSelectedIds(prev =>
      prev.includes(member.id) ? prev.filter(id => id !== member.id) : [...prev, member.id]
    );
  };

  const handleSelectAllEligible = () => {
    const eligibleIds = members
      .filter(m => isMemberEligible(m.member_id))
      .map(m => m.id);
    setSelectedIds(eligibleIds);
  };

  // Select only members who currently do not have a card issued yet
  const handleSelectNoCardsOnly = () => {
    const noCardIds = members
      .filter(m => !isCardIssued(m.member_id) && isMemberEligible(m.member_id))
      .map(m => m.id);
    setSelectedIds(noCardIds);
    if (noCardIds.length === 0) {
      toast.info('All members in list already have an active card issued.');
    } else {
      toast.success(`Selected ${noCardIds.length} member(s) with no card issued.`);
    }
  };

  // Update card storage records in Supabase when issuing
  const persistCardIssuance = async () => {
    if (cardFormat !== 'qr_digital') return;

    try {
      const expIso = new Date(customExpireDate).toISOString();
      for (const m of selectedMembersList) {
        await cardService.issue(m.member_id, 'QR', 'Counter Staff', expIso);
      }
    } catch (e) {
      console.error('Failed to persist card issuance in Supabase:', e);
    }
  };

  // Helper to build high-res PDF bytes
  const buildPdfDocument = async (): Promise<{ pdfBytes: Uint8Array; fileName: string }> => {
    const loadBase64Image = async (url: string): Promise<HTMLImageElement> => {
      const response = await fetch(url);
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });
    };

    const cardTemplateImgObj = await loadBase64Image(cardTemplateImg);
    const pdfDoc = await PDFDocument.create();

    const scale = 300 / 25.4; // 11.811 px per mm
    const sheetWidthPx = Math.round(LETTER_PAPER.width * scale);  // 2550 px
    const sheetHeightPx = Math.round(LETTER_PAPER.height * scale); // 3300 px

    for (let pageIdx = 0; pageIdx < totalPagesRequired; pageIdx++) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = sheetWidthPx;
      pageCanvas.height = sheetHeightPx;
      const ctx = pageCanvas.getContext('2d');
      if (!ctx) continue;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

      const pageStartIndex = pageIdx * template.cardsPerPage;
      const pageItems = effectiveCardsList.slice(pageStartIndex, pageStartIndex + template.cardsPerPage);

      for (let idx = 0; idx < pageItems.length; idx++) {
        const m = pageItems[idx];
        const col = idx % template.cols;
        const row = Math.floor(idx / template.cols);

        const cardX = (template.marginLeftMm + col * (template.cardWidthMm + template.gapHorizontalMm)) * scale;
        const cardY = (template.marginTopMm + row * (template.cardHeightMm + template.gapVerticalMm)) * scale;
        const cardW = template.cardWidthMm * scale;
        const cardH = template.cardHeightMm * scale;

        if (cardFormat === 'manual_template') {
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 3.5 * scale);
          else ctx.rect(cardX, cardY, cardW, cardH);
          ctx.clip();
          ctx.drawImage(cardTemplateImgObj, cardX, cardY, cardW, cardH);
          ctx.restore();
        } else {
          const sub = getMemberSub(m.member_id);
          const activeSubExp = sub?.end_date ? new Date(sub.end_date).toISOString().split('T')[0] : 'NO ACTIVE PLAN';
          const finalExpDate = overrideDates ? customExpireDate : (sub?.end_date ? activeSubExp : customExpireDate);
          const isExp = new Date(finalExpDate) < new Date();
          const card = getMemberCard(m.member_id);
          const qrPayload = card?.card_number || m.member_id;
          const qrRawUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;
          const qrImgObj = await loadBase64Image(qrRawUrl);

          ctx.save();

          // 1. Black Card Background
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 3.5 * scale);
          else ctx.rect(cardX, cardY, cardW, cardH);
          ctx.fill();
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1 * scale;
          ctx.stroke();

          // Header Line
ctx.fillStyle = '#dc2626';
ctx.fillRect(cardX + cardW * 0.04, cardY + 6.8 * scale, cardW * 0.92, 0.35 * scale);

// Subtitle (MUAYTHAI BOXING)
ctx.fillStyle = '#dc2626';
ctx.font = `900 ${Math.round(2.7 * scale)}px Arial, sans-serif`;
ctx.fillText('MUAYTHAI BOXING', cardX + cardW / 2, cardY + 10.2 * scale);

          // Subtitle
          ctx.fillStyle = '#dc2626';
          ctx.font = `900 ${Math.round(2.7 * scale)}px Arial, sans-serif`;
          ctx.fillText('MUAYTHAI BOXING', cardX + cardW / 2, cardY + 10.2 * scale);

          // Address & Contact
          ctx.fillStyle = '#ffffff';
          ctx.font = `600 ${Math.round(1.5 * scale)}px Arial, sans-serif`;
          ctx.fillText('6B Judge A. Roldan St., Navotas City, Metro Manila', cardX + cardW / 2, cardY + 12.3 * scale);
          ctx.fillText('09098893819 / 09054380792', cardX + cardW / 2, cardY + 14.1 * scale);

          // 3. QR Code Box
          const qrSize = 22 * scale;
          const qrX = cardX + 3.5 * scale;
          const qrY = cardY + 16.5 * scale;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(qrX, qrY, qrSize, qrSize, 2 * scale);
          else ctx.rect(qrX, qrY, qrSize, qrSize);
          ctx.fill();

          if (isExp) ctx.globalAlpha = 0.25;
          ctx.drawImage(qrImgObj, qrX + 1.5 * scale, qrY + 1.5 * scale, qrSize - 3 * scale, qrSize - 3 * scale);
          ctx.globalAlpha = 1.0;

          if (isExp) {
            ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(qrX, qrY, qrSize, qrSize, 2 * scale);
            else ctx.rect(qrX, qrY, qrSize, qrSize);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${Math.round(1.8 * scale)}px Arial, sans-serif`;
            ctx.fillText('EXPIRED', qrX + qrSize / 2, qrY + qrSize / 2 - 0.5 * scale);
            ctx.fillText('BADGE', qrX + qrSize / 2, qrY + qrSize / 2 + 2 * scale);
          }

          // 4. Details Section
          const detailsX = qrX + qrSize + 3 * scale;
          const detailsY = cardY + 16.5 * scale;
          const detailsW = cardX + cardW - detailsX - 3.5 * scale;

          ctx.textAlign = 'left';

          // FULL NAME
          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(1.6 * scale)}px Arial, sans-serif`;
          ctx.fillText('FULL NAME', detailsX, detailsY + 1.8 * scale);

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(detailsX, detailsY + 2.5 * scale, detailsW, 5.2 * scale, 1 * scale);
          else ctx.rect(detailsX, detailsY + 2.5 * scale, detailsW, 5.2 * scale);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = `800 ${Math.round(2.1 * scale)}px Arial, sans-serif`;
          ctx.fillText(m.full_name.toUpperCase().substring(0, 22), detailsX + 1.5 * scale, detailsY + 6 * scale);

          // CONTACT NUMBER
          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(1.6 * scale)}px Arial, sans-serif`;
          ctx.fillText('CONTACT NUMBER', detailsX, detailsY + 9.8 * scale);

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(detailsX, detailsY + 10.5 * scale, detailsW, 5.2 * scale, 1 * scale);
          else ctx.rect(detailsX, detailsY + 10.5 * scale, detailsW, 5.2 * scale);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = `800 ${Math.round(2.1 * scale)}px Arial, sans-serif`;
          ctx.fillText(m.phone || 'N/A', detailsX + 1.5 * scale, detailsY + 14 * scale);

          // DATES ROW
          const boxHalfW = (detailsW - 1.2 * scale) / 2;

          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(1.5 * scale)}px Arial, sans-serif`;
          ctx.fillText('ISSUE DATE', detailsX, detailsY + 17.8 * scale);
          ctx.fillText('EXPIRATION', detailsX + boxHalfW + 1.2 * scale, detailsY + 17.8 * scale);

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(detailsX, detailsY + 18.5 * scale, boxHalfW, 4.8 * scale, 1 * scale);
          else ctx.rect(detailsX, detailsY + 18.5 * scale, boxHalfW, 4.8 * scale);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = `800 ${Math.round(1.8 * scale)}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(new Date(issueDate).toLocaleDateString(), detailsX + boxHalfW / 2, detailsY + 21.8 * scale);

          // Vertical Dates Divider Line
ctx.fillStyle = '#dc2626';
ctx.fillRect(detailsX + boxHalfW + 0.45 * scale, detailsY + 17.5 * scale, 0.3 * scale, 6 * scale);

          const expX = detailsX + boxHalfW + 1.2 * scale;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(expX, detailsY + 18.5 * scale, boxHalfW, 4.8 * scale, 1 * scale);
          else ctx.rect(expX, detailsY + 18.5 * scale, boxHalfW, 4.8 * scale);
          ctx.fill();

          ctx.fillStyle = isExp ? '#dc2626' : '#000000';
          ctx.font = `800 ${Math.round(1.8 * scale)}px Arial, sans-serif`;
          ctx.fillText(new Date(finalExpDate).toLocaleDateString(), expX + boxHalfW / 2, detailsY + 21.8 * scale);

          const footerY = cardY + cardH - 5 * scale;
          ctx.fillStyle = '#dc2626';
ctx.fillRect(cardX, footerY, cardW, 0.35 * scale);

          ctx.fillStyle = '#ffffff';
          ctx.font = `800 ${Math.round(1.35 * scale)}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('NON-REFUNDABLE  •  NON-TRANSFERRABLE  •  BE RESPONSIBLE WITH EQUIPMENT', cardX + cardW / 2, footerY + 3.2 * scale);

          ctx.restore();
        }
      }

      const pngDataUrl = pageCanvas.toDataURL('image/png', 1.0);
      const embeddedPng = await pdfDoc.embedPng(pngDataUrl);

      const pdfPage = pdfDoc.addPage([612, 792]); // Letter Size
      pdfPage.drawImage(embeddedPng, {
        x: 0,
        y: 0,
        width: 612,
        height: 792,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const fileName = `Wolf_Palomar_Gym_Member_Cards_${new Date().toISOString().split('T')[0]}.pdf`;

    return { pdfBytes, fileName };
  };

  const handlePrint = async () => {
    await persistCardIssuance();

    if (Capacitor.isNativePlatform()) {
      setIsGeneratingPdf(true);
      try {
        const { pdfBytes, fileName } = await buildPdfDocument();
        const base64Data = arrayBufferToBase64(pdfBytes.buffer as ArrayBuffer);

        // 1. Save PDF file to native device cache
        const file = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true,
        });

        // 2. Notify user that file is ready and saved
        toast.success('Print PDF ready! Opening print options...');

        // 3. Open native share / print sheet
        await Share.share({
          title: `Print Member Credential Cards`,
          text: `Choose your printer or print service to print member cards layout sheet.`,
          files: [file.uri],
          dialogTitle: 'Print Member Cards',
        });
      } catch (err: any) {
        // 4. Safely filter out standard user cancellations/dismissals on Android/iOS
        const errMsg = String(err?.message || err || '').toLowerCase();
        const isUserCancel = 
          err?.name === 'AbortError' || 
          errMsg.includes('cancel') || 
          errMsg.includes('dismiss') ||
          errMsg.includes('user canceled');

        if (!isUserCancel) {
          console.error('Native print share error:', err);
          toast.error('Could not open print options.');
        }
      } finally {
        setIsGeneratingPdf(false);
      }
      return;
    }

    // WEB BROWSER PRINT FALLBACK
    let pagesHtml = '';

    for (let pageIdx = 0; pageIdx < totalPagesRequired; pageIdx++) {
      const pageStartIndex = pageIdx * template.cardsPerPage;
      const pageItems = effectiveCardsList.slice(pageStartIndex, pageStartIndex + template.cardsPerPage);

      let cardsGridHtml = '';
      pageItems.forEach(m => {
        if (cardFormat === 'manual_template') {
          cardsGridHtml += `
            <div class="card manual-card">
              <img src="${cardTemplateImg}" alt="Manual Member Card Template" class="template-img" />
            </div>
          `;
        } else {
          const sub = getMemberSub(m.member_id);
          const activeSubExp = sub?.end_date ? new Date(sub.end_date).toISOString().split('T')[0] : 'NO ACTIVE PLAN';
          const finalExpDate = overrideDates ? customExpireDate : (sub?.end_date ? activeSubExp : customExpireDate);
          
          const isExp = new Date(finalExpDate) < new Date();
          const card = getMemberCard(m.member_id);
          const qrPayload = card?.card_number || m.member_id;
          const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;

          cardsGridHtml += `
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
                  <img src="${qrImg}" alt="QR" style="opacity: ${isExp ? '0.25' : '1'};" />
                  ${isExp ? '<div class="expired-overlay"><span>EXPIRED</span><span>BADGE</span></div>' : ''}
                </div>

                <div class="details">
                  <div class="field-group">
                    <span class="field-label">FULL NAME</span>
                    <div class="field-box">${m.full_name.toUpperCase()}</div>
                  </div>

                  <div class="field-group">
                    <span class="field-label">CONTACT NUMBER</span>
                    <div class="field-box">${m.phone || 'N/A'}</div>
                  </div>

                  <div class="dates-row">
                    <div class="field-group">
                      <span class="field-label">ISSUE DATE</span>
                      <div class="field-box">${new Date(issueDate).toLocaleDateString()}</div>
                    </div>
                    <div class="vertical-red-divider"></div>
                    <div class="field-group">
                      <span class="field-label">EXPIRATION</span>
                      <div class="field-box" style="color: ${isExp ? '#dc2626' : '#000000'}">${new Date(finalExpDate).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div class="red-line"></div>
                <div class="footer-text">
                  NON-REFUNDABLE &nbsp;•&nbsp; NON-TRANSFERRABLE &nbsp;•&nbsp; BE RESPONSIBLE WITH EQUIPMENT
                </div>
              </div>
            </div>
          `;
        }
      });

      pagesHtml += `
        <div class="page-sheet">
          <div class="cards-grid" style="
            padding-top: ${template.marginTopMm}mm;
            padding-left: ${template.marginLeftMm}mm;
            grid-template-columns: repeat(${template.cols}, ${template.cardWidthMm}mm);
            gap: ${template.gapVerticalMm}mm ${template.gapHorizontalMm}mm;
          ">
            ${cardsGridHtml}
          </div>
        </div>
      `;
    }

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

    const printDoc = iframe.contentWindow?.document;
    if (!printDoc) return;

    printDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Member Credential Cards Batch Print</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; background: #fff; }
              @page { size: ${paperWidthMm}mm ${paperHeightMm}mm; margin: 0; }
              .page-sheet { page-break-after: always; }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              background: #ffffff;
              color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              -webkit-text-size-adjust: none;
            }
            .page-sheet {
              width: ${paperWidthMm}mm;
              height: ${paperHeightMm}mm;
              background: #ffffff;
              box-sizing: border-box;
              overflow: hidden;
              position: relative;
            }
            .cards-grid {
              display: grid;
              align-content: start;
              align-items: start;
            }
            .card {
              width: ${template.cardWidthMm}mm;
              height: ${template.cardHeightMm}mm;
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
              line-height: 1;
            }
            .card.manual-card {
              padding: 0;
              background: #000000;
              border-radius: 3.5mm;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .template-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
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
            .qr-wrapper img { width: 100%; height: 100%; object-fit: contain; }
            .expired-overlay {
              position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
              background: rgba(220, 38, 38, 0.85); color: #ffffff; font-size: 5pt; font-weight: 900; text-transform: uppercase; text-align: center; border-radius: 2mm; line-height: 1.1;
            }

            .field-group { 
              position: relative !important;
              display: flex !important; 
              flex-direction: column !important; 
              align-items: flex-start !important;
              width: 100% !important;
              margin: 0 !important; 
              padding: 0 !important; 
              flex-shrink: 0 !important; 
            }

            .field-label { 
              position: static !important;
              top: auto !important;
              left: auto !important;
              right: auto !important;
              bottom: auto !important;
              transform: none !important;
              display: block !important; 
              font-size: 4.5pt !important; 
              color: #ffffff !important; 
              font-weight: 800 !important; 
              letter-spacing: 0.3px !important; 
              text-transform: uppercase !important; 
              margin-bottom: 0.4mm !important; 
              line-height: 1 !important; 
              flex-shrink: 0 !important; 
              opacity: 1 !important; 
              visibility: visible !important; 
            }

            .field-box {
              position: relative !important;
              width: 100% !important;
              background: #ffffff !important; 
              color: #000000 !important; 
              border-radius: 1mm !important; 
              padding: 0.6mm 1.2mm !important;
              font-family: Arial, sans-serif !important; 
              font-size: 6pt !important; 
              font-weight: 800 !important; 
              white-space: nowrap !important; 
              overflow: hidden !important; 
              text-overflow: ellipsis !important; 
              line-height: 1.1 !important; 
              box-sizing: border-box !important;
            }

            .details {
              position: relative !important;
              flex: 1 !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              min-width: 0 !important;
              height: 100% !important;
              max-height: 23mm !important;
              text-align: left !important;
              box-sizing: border-box !important;
            }
            .dates-row { display: flex; gap: 1mm; align-items: flex-end; }
            .dates-row .field-group { flex: 1; min-width: 0; }
            .dates-row .field-box { font-size: 5pt; text-align: center; padding: 0.5mm 0.4mm; }
            .vertical-red-divider { width: 0.3mm; height: 6mm; background-color: #dc2626; flex-shrink: 0; margin-bottom: 0.2mm; }

            .footer-text {
              font-family: Arial, sans-serif; font-size: 3.6pt; color: #ffffff; font-weight: 800; text-align: center; letter-spacing: 0.2px; text-transform: uppercase; margin-top: 0.2mm; line-height: 1;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                try {
                  window.print();
                } catch(e) {
                  console.warn('Print error:', e);
                }
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
    printDoc.close();
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    toast.info('Generating high-resolution 300 DPI PDF file...');

    try {
      await persistCardIssuance();

      const { pdfBytes, fileName } = await buildPdfDocument();

      if (Capacitor.isNativePlatform()) {
        const base64Data = arrayBufferToBase64(pdfBytes.buffer as ArrayBuffer);
        const file = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true
        });

        await Share.share({
          title: `Member Cards PDF - ${fileName}`,
          text: `Official Member Cards PDF from Wolf Palomar Gym`,
          files: [file.uri],
          dialogTitle: 'Save / Share PDF'
        });

        toast.success('Member Cards PDF ready for sharing/saving!');
        return;
      }

      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      try {
        saveAs(pdfBlob, fileName);
        toast.success('300 DPI PDF downloaded successfully!');
      } catch (saveErr) {
        console.warn('saveAs failed, attempting anchor fallback:', saveErr);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('300 DPI PDF downloaded successfully!');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to generate PDF file:', err);
        toast.error('Failed to generate PDF document. Please try again.');
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Click Trigger for Print with Validation and Reissue Confirmation Check
  const handlePrintClick = () => {
    if (isInvalidDate) {
      toast.error('Expiration date cannot be earlier than the issue date.');
      return;
    }

    if (cardFormat === 'qr_digital') {
      if (selectedMembersList.length === 0) {
        toast.error('Please select at least one member card to print.');
        return;
      }
      const invalidMembers = selectedMembersList.filter(m => !isMemberEligible(m.member_id));
      if (invalidMembers.length > 0) {
        toast.error(`Cannot print: ${invalidMembers[0].full_name} has an active card. Enable Reissuing to print.`);
        return;
      }
    }

    if (cardFormat === 'manual_template' && manualCardCount < 1) {
      toast.error('Please specify at least 1 template card copy.');
      return;
    }

    if (reissuingMembers.length > 0) {
      setPendingAction('print');
      setShowReissueConfirmModal(true);
    } else {
      handlePrint();
    }
  };

  // Click Trigger for PDF Download with Validation and Reissue Confirmation Check
  const handleDownloadClick = () => {
    if (isInvalidDate) {
      toast.error('Expiration date cannot be earlier than the issue date.');
      return;
    }

    if (cardFormat === 'qr_digital') {
      if (selectedMembersList.length === 0) {
        toast.error('Please select at least one member card.');
        return;
      }
      const invalidMembers = selectedMembersList.filter(m => !isMemberEligible(m.member_id));
      if (invalidMembers.length > 0) {
        toast.error(`Cannot download PDF: ${invalidMembers[0].full_name} has an active card. Enable Reissuing first.`);
        return;
      }
    }

    if (cardFormat === 'manual_template' && manualCardCount < 1) {
      toast.error('Please specify at least 1 template card copy.');
      return;
    }

    if (reissuingMembers.length > 0) {
      setPendingAction('download');
      setShowReissueConfirmModal(true);
    } else {
      handleDownloadPdf();
    }
  };

  // Execute Reissuance Action from Confirmation Modal
  const handleConfirmReissue = async () => {
    setShowReissueConfirmModal(false);
    const action = pendingAction;
    setPendingAction(null);

    if (action === 'print') {
      await handlePrint();
    } else if (action === 'download') {
      await handleDownloadPdf();
    }
  };

  const isActionDisabled = isGeneratingPdf || isInvalidDate || (cardFormat === 'qr_digital' ? selectedMembersList.length === 0 : manualCardCount < 1);

  return createPortal(
    <div className="fixed inset-0 z-[16000] bg-[var(--bg-page)] flex flex-col font-body text-[var(--color-text)] select-none animate-fade-in">
      
      {/* SCOPED STYLES FOR LIVE PREVIEW */}
      <style>{`
        .card-sheet-container .page-sheet {
          width: ${paperWidthMm}mm;
          height: ${paperHeightMm}mm;
          background: #ffffff;
          box-sizing: border-box;
          overflow: hidden;
          position: relative;
        }
        .card-sheet-container .cards-grid {
          display: grid;
          align-content: start;
          align-items: start;
        }
        .card-sheet-container .card {
          width: ${template.cardWidthMm}mm;
          height: ${template.cardHeightMm}mm;
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
          -webkit-text-size-adjust: none;
        }
        .card-sheet-container .card.manual-card {
          padding: 0;
          background: #000000;
          border-radius: 3.5mm;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card-sheet-container .template-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .card-sheet-container .header { text-align: center; }
        .card-sheet-container .gym-title { font-family: 'Freshman', 'Arial Black', Impact, sans-serif; font-size: 9.5pt; font-weight: 900; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; line-height: 1; margin: 0; }
        .card-sheet-container .header-red-line { height: 0.35mm; background-color: #dc2626; margin: 0.6mm auto 0.5mm auto; width: 92%; }
        .card-sheet-container .gym-subtitle { font-family: 'Freshman', 'Arial Black', Impact, sans-serif; font-size: 7pt; font-weight: 900; color: #dc2626; text-transform: uppercase; line-height: 1; margin: 0; }
        .card-sheet-container .gym-address, .card-sheet-container .gym-contact { font-family: Arial, sans-serif; font-size: 4pt; color: #ffffff; line-height: 1.1; font-weight: 600; margin: 0; }
        .card-sheet-container .red-line { height: 0.35mm; background-color: #dc2626; margin: 0.6mm 0; width: 100%; }

        .card-sheet-container .main-content { display: flex; gap: 2.5mm; align-items: center; flex: 1; min-height: 0; margin: 0.5mm 0; }
        .card-sheet-container .qr-wrapper {
          background: #ffffff; padding: 1.2mm; border-radius: 2mm; display: flex; align-items: center; justify-content: center;
          width: 22mm; height: 22mm; box-sizing: border-box; flex-shrink: 0; position: relative;
        }
        .card-sheet-container .qr-wrapper img { width: 100%; height: 100%; object-fit: contain; }
        .card-sheet-container .expired-overlay {
          position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: rgba(220, 38, 38, 0.85); color: #ffffff; font-size: 5pt; font-weight: 900; text-transform: uppercase; text-align: center; border-radius: 2mm; line-height: 1.1;
        }

        .card-sheet-container .details { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; height: 100%; max-height: 23mm; text-align: left; box-sizing: border-box; }
        .card-sheet-container .field-group { text-align: left; display: flex; flex-direction: column; flex-shrink: 0; margin: 0; padding: 0; }
        .card-sheet-container .field-label {
          font-size: 4.5pt !important; color: #ffffff !important; font-weight: 800 !important; letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 0.3mm !important; line-height: 1 !important; display: block !important; flex-shrink: 0 !important; opacity: 1 !important; visibility: visible !important;
        }
        .card-sheet-container .field-box {
          background: #ffffff; color: #000000; border-radius: 1mm; padding: 0.6mm 1.2mm;
          font-family: Arial, sans-serif; font-size: 6pt; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; box-sizing: border-box;
        }
        .card-sheet-container .dates-row { display: flex; gap: 1mm; align-items: flex-end; }
        .card-sheet-container .dates-row .field-group { flex: 1; min-width: 0; }
        .card-sheet-container .dates-row .field-box { font-size: 5pt; text-align: center; padding: 0.5mm 0.4mm; }
        .card-sheet-container .vertical-red-divider { width: 0.3mm; height: 6mm; background-color: #dc2626; flex-shrink: 0; margin-bottom: 0.2mm; }

        .card-sheet-container .footer-text {
          font-family: Arial, sans-serif; font-size: 3.6pt; color: #ffffff; font-weight: 800; text-align: center; letter-spacing: 0.2px; text-transform: uppercase; margin-top: 0.2mm; line-height: 1;
        }
      `}</style>

      {/* Top Header Bar */}
      <div className="px-6 py-4 border-b border-(--border-color) bg-[var(--bg-card)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
            <Printer className="w-5 h-5 animate-pulse" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-heading tracking-widest uppercase text-[var(--color-text)]">PRINT MEMBER CREDENTIAL CARDS</h2>
            <p className="text-[10px] text-slate-400 font-bold block mt-0.5">
              Select members, set validity dates, print physical sheets or download official PDF files.
            </p>
          </div>
        </div>
        <button 
          onClick={handleCloseModal}
          className="p-1.5 bg-slate-100/5 hover:bg-slate-100/10 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer border border-(--border-color)"
          title="Close print portal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Tab Switchers */}
      <div className="flex md:hidden bg-slate-900/50 p-1 rounded-xl border border-white/5 mx-6 mt-4 shrink-0">
        <button
          type="button"
          onClick={() => setActiveMobileTab('configure')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-lg cursor-pointer ${
            activeMobileTab === 'configure' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'
          }`}
        >
          Configure
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab('preview')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-lg cursor-pointer ${
            activeMobileTab === 'preview' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'
          }`}
        >
          Layout Preview
        </button>
      </div>

      {/* Main Grid Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden mt-2 md:mt-0">
        
        {/* LEFT CONTROL SIDEBAR PANEL */}
        <div className={`lg:col-span-4 border-r border-(--border-color) bg-[var(--bg-card)] p-5 flex flex-col justify-between overflow-hidden h-full ${
          activeMobileTab === 'configure' ? 'flex' : 'hidden md:flex'
        }`}>
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
            
            {/* Card Format Choice */}
            <div className="p-3 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl space-y-2 text-left shrink-0">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                Card Type Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCardFormat('qr_digital')}
                  className={`p-2.5 rounded-xl border text-[10px] font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    cardFormat === 'qr_digital'
                      ? 'bg-blue-600 text-white border-transparent shadow-md'
                      : 'bg-[var(--bg-page)] border-(--border-color) text-slate-400 hover:text-[var(--color-text)]'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Digital QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCardFormat('manual_template')}
                  className={`p-2.5 rounded-xl border text-[10px] font-heading font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    cardFormat === 'manual_template'
                      ? 'bg-amber-600 text-white border-transparent shadow-md'
                      : 'bg-[var(--bg-page)] border-(--border-color) text-slate-400 hover:text-[var(--color-text)]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Manual Template</span>
                </button>
              </div>
            </div>

            {/* Selection Drawer vs Manual Copies Count */}
            {cardFormat === 'manual_template' ? (
              <div className="p-3.5 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl flex flex-col flex-1 min-h-0 overflow-hidden space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Manual Template Copies
                  </h4>
                  <span className="text-[10px] font-mono font-bold text-amber-500">
                    Blank Card Asset
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                  Manual templates use pre-printed physical design assets. Specify how many blank cards you need on your print sheet layout.
                </p>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                    Number of Cards to Print
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={manualCardCount}
                      onChange={(e) => setManualCardCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 p-2 bg-[var(--bg-page)] border border-(--border-color) rounded-xl text-xs font-mono font-bold text-[var(--color-text)] outline-none focus:border-amber-500"
                    />
                    <div className="flex gap-1.5 flex-1 overflow-x-auto">
                      {[1, 4, 8, 16].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setManualCardCount(num)}
                          className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-bold border transition-all cursor-pointer ${
                            manualCardCount === num
                              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                              : 'bg-[var(--bg-page)] border-(--border-color) text-slate-400 hover:text-[var(--color-text)]'
                          }`}
                        >
                          {num} {num === 1 ? 'Card' : 'Cards'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Members</h4>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">
                      {selectedIds.length}/{members.length}
                    </span>
                  </div>
                  
                  {/* ACTION BUTTONS */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectNoCardsOnly}
                      className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                      title="Select members who do not have an active card issued yet"
                    >
                      <CreditCard className="w-3 h-3" />
                      <span>No Cards</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectAllEligible}
                      className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                      title="Select all eligible members"
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>Select All</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-zinc-700 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                      title="Clear all selections"
                    >
                      <X className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                <div className="relative shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter members..."
                    className="w-full pl-9 pr-3 py-1.5 border border-(--border-color) rounded-xl bg-[var(--bg-page)] text-xs text-[var(--color-text)] outline-none focus:border-blue-500 transition-all font-medium"
                  />
                </div>

                {/* MEMBER SELECTION LIST */}
                 <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 select-none">
                  {filteredMembers.map(m => {
                    const hasActiveCard = isCardIssued(m.member_id);
                    const eligible = isMemberEligible(m.member_id);
                    const isSelected = selectedIds.includes(m.id);

                    return (
                      <div
                        key={m.id}
                        onClick={() => handleToggleMember(m)}
                        className={`w-full py-2 px-2.5 rounded-xl flex items-center justify-between gap-2 transition-all box-border ${
                          !eligible
                            ? 'opacity-50 cursor-not-allowed bg-slate-200/50 dark:bg-zinc-900/20 border border-transparent'
                            : isSelected 
                              ? 'bg-blue-500/10 border border-blue-500 text-[var(--color-text)] cursor-pointer shadow-xs' 
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900/40 border border-transparent text-slate-700 dark:text-slate-300 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {!eligible ? (
                            <Lock className="w-4 h-4 shrink-0 text-slate-400" />
                          ) : isSelected ? (
                            <CheckSquare className="w-4 h-4 shrink-0 text-blue-500" />
                          ) : (
                            <Square className="w-4 h-4 shrink-0 text-slate-500" />
                          )}
                          <div className="min-w-0 text-left">
                            <span className="font-semibold block truncate text-xs">{m.full_name}</span>
                            <span className="font-mono text-[9px] text-slate-400">{m.member_id}</span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          {hasActiveCard ? (
                            rerollQrTokens ? (
                              <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-md border uppercase bg-blue-500/10 text-blue-500 border-blue-500/20 flex items-center gap-1">
                                <ShieldCheck className="w-2.5 h-2.5" /> Reissue Ready
                              </span>
                            ) : (
                              <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-md border uppercase bg-slate-500/10 text-slate-400 border-slate-500/20">
                                Card Active (Locked)
                              </span>
                            )
                          ) : (
                            <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-md border uppercase bg-amber-500/10 text-amber-500 border-amber-500/20">
                              No Card
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Accordion: Card Validity & Replacement Configurator */}
            {cardFormat === 'qr_digital' && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsExpiryConfigOpen(!isExpiryConfigOpen)}
                  className="w-full flex items-center justify-between p-3.5 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl cursor-pointer text-left"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span>Card Validity & Replacement</span>
                  </div>
                  {isExpiryConfigOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {isExpiryConfigOpen && (
                  <div className="p-4 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl space-y-3 shrink-0 animate-slide-up text-left">
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                          Issue Date <span className="text-[8px] text-slate-500 font-normal">(Automatic)</span>
                        </label>
                        <input
                          type="text"
                          value={new Date(issueDate).toLocaleDateString()}
                          readOnly
                          disabled
                          tabIndex={-1}
                          className="w-full p-2 bg-[var(--bg-page)]/50 border border-(--border-color) rounded-xl text-xs font-mono font-bold text-slate-500 cursor-not-allowed outline-none select-none pointer-events-none"
                        />
                      </div>
                                    
                      {/* EXPIRATION DATE */}
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Expiration Date</label>
                        <input
                          type="date"
                          min={issueDate}
                          value={customExpireDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOverrideDates(true);
                            if (val && val < issueDate) {
                              toast.error('Expiration date cannot be earlier than Issue Date!');
                              setCustomExpireDate(issueDate);
                            } else {
                              setCustomExpireDate(val);
                            }
                          }}
                          onBlur={(e) => {
                            if (!e.target.value || e.target.value < issueDate) {
                              setCustomExpireDate(issueDate);
                            }
                          }}
                          className={`w-full p-2 bg-[var(--bg-page)] border rounded-xl text-xs font-mono font-bold outline-none transition-all ${
                            isInvalidDate ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-(--border-color) text-[var(--color-text)]'
                          }`}
                        />
                      </div>
                    </div>

                    {/* INLINE VALIDATION WARNING BOX */}
                    {isInvalidDate && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 flex items-center gap-2 text-[10px] font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                        <span>Expiration date cannot be earlier than Issue Date ({new Date(issueDate).toLocaleDateString()}). Printing is disabled.</span>
                      </div>
                    )}

                    {/* QUICK PRESETS */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[8px] font-bold text-slate-400 uppercase mr-1">Quick Add:</span>
                      
                      <button
                        type="button"
                        onClick={() => applyPresetDays(30)}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase transition-all cursor-pointer ${
                          activePresetDays === 30
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        +30D
                      </button>

                      <button
                        type="button"
                        onClick={() => applyPresetDays(365)}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase transition-all cursor-pointer ${
                          activePresetDays === 365
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        +1 Year
                      </button>

                      <button
                        type="button"
                        onClick={() => applyPresetDays(1095)}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1 ${
                          activePresetDays === 1095
                            ? 'bg-blue-600 text-white shadow-md font-extrabold border border-white/20'
                            : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <Sparkles className="w-2.5 h-2.5" /> +3 Years (Default)
                      </button>

                      <button
                        type="button"
                        onClick={() => setOverrideDates(false)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-heading font-bold uppercase cursor-pointer flex items-center gap-1 border ${
                          !overrideDates 
                            ? 'bg-blue-600 text-white border-transparent' 
                            : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        }`}
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Sync Sub
                      </button>
                    </div>

                    {/* Reroll QR Toggle */}
                    <div className="pt-2 border-t border-(--border-color)">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rerollQrTokens}
                          onChange={(e) => handleRerollToggle(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 text-left">
                          <span className="text-[10px] font-bold text-[var(--color-text)] block leading-tight">
                            Generate Fresh QR Tokens (Allow Reissuing)
                          </span>
                          <span className="text-[8px] text-slate-400 block mt-0.5 leading-relaxed">
                            When <strong className="text-blue-500">ON</strong>, members with existing cards can be selected to receive a replacement card. Old cards will be automatically deactivated.
                          </span>
                        </div>
                      </label>
                    </div>

                  </div>
                )}
              </div>
            )}

          </div>

          {/* Action Row Panel for DESKTOP */}
          <div className="hidden md:block pt-4 mt-auto border-t border-(--border-color) shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePrintClick}
                disabled={isActionDisabled}
                className={`py-3 px-3 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-heading tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md font-extrabold border-none ${
                  isInvalidDate
                    ? 'bg-slate-600 cursor-not-allowed opacity-40'
                    : cardFormat === 'manual_template' 
                      ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer' 
                      : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>Print ({effectiveCardsList.length})</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadClick}
                disabled={isActionDisabled}
                className={`py-3 px-3 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-heading tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md font-extrabold border border-slate-700 ${
                  isInvalidDate
                    ? 'bg-slate-800 cursor-not-allowed opacity-40'
                    : 'bg-slate-800 hover:bg-slate-700 cursor-pointer'
                }`}
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PREVIEW PANEL */}
        <div className={`lg:col-span-8 bg-[var(--bg-page)] p-6 flex flex-col justify-between overflow-hidden relative pb-28 md:pb-6 ${
          activeMobileTab === 'preview' ? 'flex' : 'hidden md:flex'
        }`}>
          
          {/* Zoom floating toolbar */}
          <div className="absolute top-4 right-4 z-10 animate-fade-in">
            <div className="bg-[var(--bg-input)] border border-(--border-color) p-2 rounded-xl flex items-center justify-between gap-3 text-xs w-fit shadow-lg">
              <button 
                onClick={() => setZoom(prev => Math.max(50, prev - 25))}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Zoom layout preview out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono font-bold text-[10px] tracking-wider text-[var(--color-text)] w-12 text-center select-none">
                {zoom}%
              </span>
              <button 
                onClick={() => setZoom(prev => Math.min(150, prev + 25))}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Zoom layout preview in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-white/10" />
              <button 
                onClick={() => setZoom(100)}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Reset zoom actual scale"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live Page Layout Sheet */}
          <div className="flex-1 flex flex-col h-full bg-[var(--bg-card)] rounded-3xl p-5 border border-(--border-color) overflow-hidden shadow-xs card-sheet-container">
            <div className="flex justify-between items-center pb-4 border-b border-(--border-color) mb-4 shrink-0">
              <div className="text-left">
                <h4 className="text-xs font-heading uppercase tracking-widest text-[var(--color-text)]">Live Card Sheet Layout</h4>
                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                  Format: {template.name} • Mode: {cardFormat === 'manual_template' ? 'Manual Template Asset' : 'Digital Dynamic QR'}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-bold text-blue-500 block">
                  {effectiveCardsList.length} Total Cards
                </span>
                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                  Requires {totalPagesRequired} {totalPagesRequired === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start gap-6 no-scrollbar">
              <div 
                style={{
                  width: `${scaledWidthMm}mm`,
                  height: `${scaledHeightMm}mm`,
                }}
                className="mx-auto relative shrink-0"
              >
                <div 
                  style={{ 
                    transform: `scale(${zoomFactor})`, 
                    transformOrigin: 'top left',
                    width: `${paperWidthMm}mm`,
                    height: `${paperHeightMm * totalPagesRequired}mm` 
                  }}
                  className="absolute top-0 left-0"
                >
                  {Array.from({ length: totalPagesRequired }).map((_, pageIdx) => {
                    const pageStartIndex = pageIdx * template.cardsPerPage;
                    const pageCards = effectiveCardsList.slice(pageStartIndex, pageStartIndex + template.cardsPerPage);
                    return (
                      <div 
                        key={`page-${pageIdx}`}
                        className="page-sheet bg-white shadow-2xl relative border border-slate-300 overflow-hidden mx-auto shrink-0 mb-6 origin-top animate-fade-in"
                        style={{
                          width: `${paperWidthMm}mm`,
                          height: `${paperHeightMm}mm`,
                        }}
                      >
                        <div 
                          className="cards-grid"
                          style={{
                            paddingTop: `${template.marginTopMm}mm`,
                            paddingLeft: `${template.marginLeftMm}mm`,
                            gridTemplateColumns: `repeat(${template.cols}, ${template.cardWidthMm}mm)`,
                            gap: `${template.gapVerticalMm}mm ${template.gapHorizontalMm}mm`,
                          }}
                        >
                          {pageCards.map((m, idx) => {
                            if (cardFormat === 'manual_template') {
                              return (
                                <div
                                  key={`preview-${pageIdx}-${idx}`}
                                  className="card manual-card"
                                  style={{
                                    width: `${template.cardWidthMm}mm`,
                                    height: `${template.cardHeightMm}mm`,
                                  }}
                                >
                                  <img 
                                    src={cardTemplateImg} 
                                    alt="Manual Member Card Template" 
                                    className="template-img"
                                  />
                                </div>
                              );
                            }

                            const sub = getMemberSub(m.member_id);
                            const activeSubExp = sub?.end_date ? new Date(sub.end_date).toISOString().split('T')[0] : 'NO ACTIVE PLAN';
                            const finalExpDate = overrideDates ? customExpireDate : (sub?.end_date ? activeSubExp : customExpireDate);
                            const isExp = new Date(finalExpDate) < new Date();
                            const card = getMemberCard(m.member_id);
                            const qrPayload = card?.card_number || m.member_id;
                            const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;

                            return (
                              <div 
                                key={`preview-${pageIdx}-${idx}-${m.id}`}
                                className="card"
                                style={{
                                  width: `${template.cardWidthMm}mm`,
                                  height: `${template.cardHeightMm}mm`,
                                }}
                              >
                                {/* CARD TOP HEADER */}
                                <div className="header">
                                  <div className="gym-title">WOLF PALOMAR GYM</div>
                                  <div className="header-red-line" />
                                  <div className="gym-subtitle">MUAYTHAI BOXING</div>
                                  <div className="gym-address">6B Judge A. Roldan St., Navotas City, Metro Manila</div>
                                  <div className="gym-contact">09098893819 / 09054380792</div>
                                </div>

                                {/* CARD MIDDLE GRID */}
                                <div className="main-content" style={{ display: 'flex', gap: '2.5mm', alignItems: 'center', flex: 1, minHeight: 0, margin: '0.5mm 0' }}>
                                  
                                  {/* QR Code Container */}
                                  <div className="qr-wrapper" style={{ background: '#ffffff', padding: '1.2mm', borderRadius: '2mm', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22mm', height: '22mm', flexShrink: 0, position: 'relative' }}>
                                    <img 
                                      src={qrImg} 
                                      alt="QR" 
                                      style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isExp ? 0.25 : 1 }} 
                                    />
                                    {isExp && (
                                      <div className="expired-overlay" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(220, 38, 38, 0.85)', color: '#ffffff', fontSize: '5pt', fontWeight: 900, textTransform: 'uppercase', textAlign: 'center', borderRadius: '2mm', lineHeight: 1.1 }}>
                                        <span>EXPIRED</span>
                                        <span>BADGE</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Dynamic Fields */}
                                  <div className="details" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, height: '100%', textAlign: 'left' }}>
                                    
                                    {/* FULL NAME */}
                                    <div className="field-group" style={{ display: 'flex', flexDirection: 'column', position: 'static', margin: 0, padding: 0 }}>
                                      <span style={{ position: 'static', top: 'auto', left: 'auto', display: 'block', fontSize: '4.5pt', color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.3mm', lineHeight: 1 }}>
                                        FULL NAME
                                      </span>
                                      <div className="field-box" style={{ background: '#ffffff', color: '#000000', borderRadius: '1mm', padding: '0.6mm 1.2mm', fontSize: '6pt', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>
                                        {m.full_name.toUpperCase()}
                                      </div>
                                    </div>

                                    {/* CONTACT NUMBER */}
                                    <div className="field-group" style={{ display: 'flex', flexDirection: 'column', position: 'static', margin: 0, padding: 0 }}>
                                      <span style={{ position: 'static', top: 'auto', left: 'auto', display: 'block', fontSize: '4.5pt', color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.3mm', lineHeight: 1 }}>
                                        CONTACT NUMBER
                                      </span>
                                      <div className="field-box" style={{ background: '#ffffff', color: '#000000', borderRadius: '1mm', padding: '0.6mm 1.2mm', fontSize: '6pt', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>
                                        {m.phone || 'N/A'}
                                      </div>
                                    </div>

                                    {/* DATES ROW */}
                                    <div className="dates-row" style={{ display: 'flex', gap: '1mm', alignItems: 'flex-end' }}>
                                      <div className="field-group" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, position: 'static', margin: 0, padding: 0 }}>
                                        <span style={{ position: 'static', top: 'auto', left: 'auto', display: 'block', fontSize: '4.5pt', color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.3mm', lineHeight: 1 }}>
                                          ISSUE DATE
                                        </span>
                                        <div className="field-box" style={{ background: '#ffffff', color: '#000000', borderRadius: '1mm', padding: '0.5mm 0.4mm', fontSize: '5pt', fontWeight: 800, textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                          {new Date(issueDate).toLocaleDateString()}
                                        </div>
                                      </div>

                                      <div className="vertical-red-divider" style={{ width: '0.3mm', height: '6mm', backgroundColor: '#dc2626', flexShrink: 0, marginBottom: '0.2mm' }} />

                                      <div className="field-group" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, position: 'static', margin: 0, padding: 0 }}>
                                        <span style={{ position: 'static', top: 'auto', left: 'auto', display: 'block', fontSize: '4.5pt', color: '#ffffff', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.3mm', lineHeight: 1 }}>
                                          EXPIRATION
                                        </span>
                                        <div className="field-box" style={{ background: '#ffffff', color: isExp ? '#dc2626' : '#000000', borderRadius: '1mm', padding: '0.5mm 0.4mm', fontSize: '5pt', fontWeight: 800, textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                          {new Date(finalExpDate).toLocaleDateString()}
                                        </div>
                                      </div>
                                    </div>

                                  </div>

                                </div>

                                {/* FOOTER */}
                                <div>
                                  <div className="red-line" />
                                  <div className="footer-text">
                                    NON-REFUNDABLE &nbsp;•&nbsp; NON-TRANSFERRABLE &nbsp;•&nbsp; BE RESPONSIBLE WITH EQUIPMENT
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* MOBILE PERSISTENT BOTTOM ACTION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg-card)]/95 backdrop-blur-md border-t border-(--border-color) z-200 shadow-2xl">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handlePrintClick}
            disabled={isActionDisabled}
            className={`py-3 px-3 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-heading tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md font-extrabold border-none ${
              isInvalidDate
                ? 'bg-slate-600 cursor-not-allowed opacity-40'
                : cardFormat === 'manual_template' 
                  ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer' 
                  : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Print ({effectiveCardsList.length})</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={isActionDisabled}
            className={`py-3 px-3 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-heading tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md font-extrabold border border-slate-700 ${
              isInvalidDate
                ? 'bg-slate-800 cursor-not-allowed opacity-40'
                : 'bg-slate-800 hover:bg-slate-700 cursor-pointer'
            }`}
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* STRICT REISSUE OVERWRITE CONFIRMATION MODAL */}
      {showReissueConfirmModal && (
        <div className="fixed inset-0 z-[17000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--bg-card)] border border-(--border-color) rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-3 text-amber-500 border-b border-(--border-color) pb-3">
              <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="font-heading font-black text-sm uppercase tracking-wider text-[var(--color-text)]">
                  Confirm Card Overwrite & Reissue
                </h3>
                <span className="text-[10px] text-amber-500 font-bold block mt-0.5">
                  Previous Member Card Will Be Invalidated
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              You are reissuing cards for <strong className="text-amber-400">{reissuingMembers.length} member(s)</strong> who already have active issued cards. 
              Generating new QR tokens will <strong className="text-rose-400 underline">permanently invalidate their previous physical cards upon scanner check-in</strong>.
            </p>

            {/* List affected active members */}
            <div className="p-3 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                Affected Cardholders:
              </span>
              {reissuingMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs font-mono py-1 px-2 rounded-lg bg-[var(--bg-page)] border border-(--border-color)">
                  <span className="font-bold text-[var(--color-text)] truncate mr-2">{m.full_name}</span>
                  <span className="text-slate-400 text-[10px] shrink-0">{m.member_id}</span>
                </div>
              ))}
            </div>

            <div className="p-2.5 bg-slate-800/60 border border-slate-700 rounded-xl text-[10px] font-mono font-bold text-slate-300 flex items-center justify-between">
              <span>New Expiration Date:</span>
              <span className="text-emerald-400 font-extrabold">{new Date(customExpireDate).toLocaleDateString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowReissueConfirmModal(false);
                  setPendingAction(null);
                }}
                className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-heading font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReissue}
                className="py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white text-xs font-heading font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors shadow-lg"
              >
                Overwrite & Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};