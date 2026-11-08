// src/components/ui/OfficialReceipt.tsx
import {
  useMemo,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
} from 'react';
import { format, parseISO } from 'date-fns';
import {
  X,
  Download,
  Printer,
  Share2,
  Copy,
  Check,
  QrCode,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from 'react-toastify';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { useAuthStore } from '../../stores/authStore';

export interface ReceiptItem {
  productName: string;
  quantity: number;
  price: number;
}

export interface GymProfileConfig {
  gym_name?: string;
  gym_address?: string;
  contact_name_1?: string;
  contact_number_1?: string;
  contact_name_2?: string;
  contact_number_2?: string;
  gym_logo?: string;
}

export interface RatesConfig {
  monthly_rate?: number;
  yearly_rate?: number;
  regular_walk_in?: number;
  student_walk_in?: number;
  yearly_walk_in?: number;
  gcash_fee?: number;
  new_card_fee?: number;
  vat_enabled?: boolean;
  vat_percentage?: number;
}

export interface ReceiptData {
  receiptType?: 'subscription' | 'walkin' | 'sales' | 'attendance' | 'card';
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
  handleDownloadJpg: () => Promise<void>;
  handleShareReceipt: () => Promise<void>;
  handleCopyImageToClipboard: () => Promise<void>;
}

interface OfficialReceiptProps {
  data: ReceiptData;
  variant?: 'modal' | 'inline';
  isOpen?: boolean;
  onClose?: () => void;
  showPrintButton?: boolean;
  showDownloadButton?: boolean;
  showShareButton?: boolean;
  isLoading?: boolean;
}

const DEFAULT_GYM_NAME = 'Wolf Palomar GYM Muaythai Boxing';
const DEFAULT_GYM_ADDRESS =
  '6B Judge A. Roldan St., Navotas City, Metro Manila';
const DEFAULT_CONTACTS = 'STAFF CONTACT: 09098893819 / 09054380792';
const DEFAULT_LOGO = '/favicon.svg';

const RECEIPT_TITLES: Record<
  NonNullable<ReceiptData['receiptType']>,
  string
> = {
  subscription: 'Subscription Official Receipt',
  walkin: 'Walk-In Official Receipt',
  sales: 'Product Official Receipt',
  attendance: 'Attendance Check-In Slip',
  card: 'Physical Card Official Receipt',
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

const GF_EXP: number[] = new Array(256);
const GF_LOG: number[] = new Array(256);
for (let i = 0, x = 1; i < 256; i++) {
  GF_EXP[i] = x;
  GF_LOG[x] = i;
  x <<= 1;
  if (x & 256) x ^= 0x11d;
}

const gfMul = (a: number, b: number): number => {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
};

const getQrGeneratorPoly = (degree: number): number[] => {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
};

const computeQrEC = (data: number[], ecCount: number): number[] => {
  const gen = getQrGeneratorPoly(ecCount);
  const remainder = new Array(ecCount).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        remainder[j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return remainder;
};

export const generateOfflineQrDataUrl = (text: string, pixelSize = 240): string => {
  const rawBytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) rawBytes.push(code);
    else if (code < 2048) {
      rawBytes.push((code >> 6) | 192, (code & 63) | 128);
    } else {
      rawBytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
    }
  }

  const QR_VERSIONS = [
    { version: 1, size: 21, dataCap: 17, totalData: 19, ecCount: 7, align: [] },
    { version: 2, size: 25, dataCap: 32, totalData: 34, ecCount: 10, align: [6, 18] },
    { version: 3, size: 29, dataCap: 53, totalData: 55, ecCount: 15, align: [6, 22] },
    { version: 4, size: 33, dataCap: 78, totalData: 80, ecCount: 20, align: [6, 26] },
    { version: 5, size: 37, dataCap: 106, totalData: 108, ecCount: 26, align: [6, 30] },
  ];

  let chosen = QR_VERSIONS[0];
  for (const v of QR_VERSIONS) {
    if (rawBytes.length <= v.dataCap) {
      chosen = v;
      break;
    }
    chosen = v;
  }

  const { size, totalData, ecCount, align } = chosen;

  const bitBuffer: number[] = [];
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  };

  appendBits(4, 4);
  appendBits(rawBytes.length, 8);
  for (const b of rawBytes) {
    appendBits(b, 8);
  }

  const maxDataBits = totalData * 8;
  const terminatorLen = Math.min(4, maxDataBits - bitBuffer.length);
  for (let i = 0; i < terminatorLen; i++) bitBuffer.push(0);
  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bitBuffer.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bitBuffer[i + b];
    dataCodewords.push(byte);
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < totalData) {
    dataCodewords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  const ecCodewords = computeQrEC(dataCodewords, ecCount);
  const fullCodewords = [...dataCodewords, ...ecCodewords];

  const matrix: (number | null)[][] = Array.from({ length: size }, () =>
    new Array(size).fill(null)
  );
  const isFunctionModule: boolean[][] = Array.from({ length: size }, () =>
    new Array(size).fill(false)
  );

  const setModule = (r: number, c: number, val: number, isFunc = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isFunc) isFunctionModule[r][c] = true;
    }
  };

  const drawFinder = (topR: number, leftC: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          setModule(topR + r, leftC + c, 1);
        } else {
          setModule(topR + r, leftC + c, 0);
        }
      }
    }
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (
          (r === -1 || r === 7 || c === -1 || c === 7) &&
          topR + r >= 0 &&
          topR + r < size &&
          leftC + c >= 0 &&
          leftC + c < size
        ) {
          setModule(topR + r, leftC + c, 0);
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let c = 8; c < size - 8; c++) {
    setModule(6, c, c % 2 === 0 ? 1 : 0);
  }
  for (let r = 8; r < size - 8; r++) {
    setModule(r, 6, r % 2 === 0 ? 1 : 0);
  }

  if (align.length > 0) {
    for (const r of align) {
      for (const c of align) {
        if (matrix[r][c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (
              Math.abs(dr) === 2 ||
              Math.abs(dc) === 2 ||
              (dr === 0 && dc === 0)
            ) {
              setModule(r + dr, c + dc, 1);
            } else {
              setModule(r + dr, c + dc, 0);
            }
          }
        }
      }
    }
  }

  setModule(4 * chosen.version + 9, 8, 1);

  const FORMAT_BITS = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = (FORMAT_BITS >> i) & 1;
    if (i < 6) setModule(8, i, bit);
    else if (i === 6) setModule(8, 7, bit);
    else if (i === 7) setModule(8, 8, bit);
    else if (i === 8) setModule(7, 8, bit);
    else setModule(14 - i, 8, bit);

    if (i < 8) setModule(size - 1 - i, 8, bit);
    else setModule(8, size - 15 + i, bit);
  }

  let fullBits: number[] = [];
  for (const cw of fullCodewords) {
    for (let b = 7; b >= 0; b--) {
      fullBits.push((cw >> b) & 1);
    }
  }

  let bitIdx = 0;
  let dir = -1;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    const rows = [];
    if (dir === -1) {
      for (let r = size - 1; r >= 0; r--) rows.push(r);
    } else {
      for (let r = 0; r < size; r++) rows.push(r);
    }
    dir = -dir;

    for (const r of rows) {
      for (const colOffset of [0, 1]) {
        const curC = c - colOffset;
        if (!isFunctionModule[r][curC]) {
          const rawBit = bitIdx < fullBits.length ? fullBits[bitIdx++] : 0;
          const mask = (r + curC) % 2 === 0 ? 1 : 0;
          matrix[r][curC] = rawBit ^ mask;
        }
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pixelSize, pixelSize);

  const quietZone = 2;
  const totalGrid = size + quietZone * 2;
  const moduleSize = pixelSize / totalGrid;

  ctx.fillStyle = '#000000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        ctx.fillRect(
          Math.floor((c + quietZone) * moduleSize),
          Math.floor((r + quietZone) * moduleSize),
          Math.ceil(moduleSize),
          Math.ceil(moduleSize)
        );
      }
    }
  }

  return canvas.toDataURL('image/png');
};

const getCachedGymProfile = (): GymProfileConfig => {
  try {
    const raw = localStorage.getItem('palomar_gym_profile');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    gym_name: DEFAULT_GYM_NAME,
    gym_address: DEFAULT_GYM_ADDRESS,
    contact_name_1: 'STAFF',
    contact_number_1: '09098893819',
    contact_name_2: 'ADMIN',
    contact_number_2: '09054380792',
    gym_logo: DEFAULT_LOGO,
  };
};

const getCachedRatesConfig = (): RatesConfig => {
  try {
    const raw = localStorage.getItem('palomar_rates_config');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    monthly_rate: 1000,
    yearly_rate: 10000,
    regular_walk_in: 100,
    student_walk_in: 80,
    yearly_walk_in: 60,
    gcash_fee: 10,
    new_card_fee: 100,
    vat_enabled: true,
    vat_percentage: 12,
  };
};

const loadQrImage = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const OfficialReceipt = forwardRef<
  OfficialReceiptRef,
  OfficialReceiptProps
>(
  (
    {
      data,
      variant = 'modal',
      isOpen = true,
      onClose,
      showPrintButton = true,
      showDownloadButton = true,
      showShareButton = true,
      isLoading = false,
    },
    ref
  ) => {
    const [gymProfile, setGymProfile] = useState<GymProfileConfig>(
      data.gymProfile || getCachedGymProfile()
    );
    const [ratesConfig, setRatesConfig] = useState<RatesConfig>(
      data.ratesConfig || getCachedRatesConfig()
    );
    const [loadingConfig,] = useState<boolean>(false);
    const [cardItems, setCardItems] = useState<ReceiptItem[]>([]);

    const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    const isUuid = (val?: string | null): boolean => {
      if (!val) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        val.trim()
      );
    };

    const isGenericStaff = (val?: string | null): boolean => {
      if (!val) return true;
      const lower = val.trim().toLowerCase();
      return (
        lower === 'staff' ||
        lower === 'admin staff' ||
        lower === 'staff (staff)' ||
        lower === 'frontdesk staff' ||
        lower === 'wolf palomar staff'
      );
    };

    const [actualReceiptNo, setActualReceiptNo] = useState<string>(
      data.receiptNo || 'RCPT-PREVIEW-001'
    );
    const [resolvedProcessor, setResolvedProcessor] = useState<string>(
      data.processedBy && !isGenericStaff(data.processedBy) ? data.processedBy : ''
    );

    const [, setIsResolvingProcessor] = useState<boolean>(false);

    useEffect(() => {
      setActualReceiptNo(data.receiptNo || 'RCPT-PREVIEW-001');
    }, [data.receiptNo]);

    const receiptType = useMemo(() => {
      const cType = (data.customerType || '').toLowerCase();
      if (
        data.receiptType === 'card' ||
        cType === 'physical card' ||
        cType === 'card'
      ) {
        return 'card';
      }
      if (data.receiptType) return data.receiptType;
      if (data.items && data.items.length > 0) return 'sales';
      if (cType.includes('walk-in')) return 'walkin';
      if (cType.includes('attendance')) return 'attendance';
      return 'subscription';
    }, [data.receiptType, data.items, data.customerType]);

    useEffect(() => {
      if (!isOpen || receiptType !== 'card') {
        setCardItems([]);
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      
      const fetchCardRecipients = async () => {
        const searchKey = data.paymentRef || data.receiptNo;
        if (!searchKey) return;

        let targetReceiptNumber = searchKey.replace(/^rcpt-/i, '');

        try {
          if (targetReceiptNumber.startsWith('CHK-')) {
            let attQuery = supabase.from('attendance').select('receipt_number');
            if (isUuid(targetReceiptNumber)) {
              attQuery = attQuery.eq('id', targetReceiptNumber);
            } else {
              attQuery = attQuery.or(
                `receipt_number.eq.${targetReceiptNumber},reference_number.eq.${targetReceiptNumber}`
              );
            }
            const { data: attRow } = await attQuery.maybeSingle();

            if (attRow?.receipt_number) {
              targetReceiptNumber = attRow.receipt_number;
              setActualReceiptNo(attRow.receipt_number);
            }
          }

          const { data: cardRows } = await supabase
            .from('cards')
            .select(
              `
            card_fee_paid,
            member_id,
            members (
              full_name,
              member_id
            )
          `
            )
            .eq('receipt_number', targetReceiptNumber);

          if (cardRows && cardRows.length > 0) {
            const totalCardFee = Number(data.cardFee || 0);
            const feePerMember =
              totalCardFee > 0 ? totalCardFee / cardRows.length : 10;

            const mapped = cardRows.map((row: any) => ({
              productName: `${row.members?.full_name || 'Member'} (#${row.members?.member_id || row.member_id})`,
              quantity: 1,
              price: Number(row.card_fee_paid || feePerMember),
            }));
            setCardItems(mapped);
          }
        } catch {
          // Keep offline resilience without hanging
        }
      };

      fetchCardRecipients();
    }, [isOpen, data.receiptNo, data.paymentRef, data.cardFee, receiptType]);

const displayItems = useMemo(() => {
      if (data.items && data.items.length > 0) return data.items;
      if (receiptType === 'card') return cardItems;
      return [];
    }, [data.items, cardItems, receiptType]);

    const timerRef = useRef<any>(null);
    const isNative = Capacitor.isNativePlatform();

    useEffect(() => {
      if (data.gymProfile) setGymProfile(data.gymProfile);
      if (data.ratesConfig) setRatesConfig(data.ratesConfig);
    }, [data.gymProfile, data.ratesConfig]);

    useEffect(() => {
      if (data.gymProfile && data.ratesConfig) {
        return;
      }
      if (variant === 'modal' && !isOpen) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      let isMounted = true;
      const fetchConfigs = async () => {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 2500)
          );

          const queryPromise = Promise.all([
            supabase.from('gym_profile').select('*').eq('id', 1).maybeSingle(),
            supabase.from('rates_config').select('*').eq('id', 1).maybeSingle(),
          ]);

          const [profileRes, ratesRes] = (await Promise.race([
            queryPromise,
            timeoutPromise,
          ])) as any;

          if (isMounted) {
            if (!profileRes?.error && profileRes?.data) {
              setGymProfile(profileRes.data);
              try {
                localStorage.setItem(
                  'palomar_gym_profile',
                  JSON.stringify(profileRes.data)
                );
              } catch {}
            }
            if (!ratesRes?.error && ratesRes?.data) {
              setRatesConfig(ratesRes.data);
              try {
                localStorage.setItem(
                  'palomar_rates_config',
                  JSON.stringify(ratesRes.data)
                );
              } catch {}
            }
          }
        } catch {
          // Graceful offline fallback from local cache without blocking receipt
        }
      };

      fetchConfigs();
      return () => {
        isMounted = false;
      };
    }, [isOpen, variant, data.gymProfile, data.ratesConfig]);

    const gymName = gymProfile?.gym_name || DEFAULT_GYM_NAME;
    const gymAddress = gymProfile?.gym_address || DEFAULT_GYM_ADDRESS;

    const contact1 = gymProfile?.contact_number_1
      ? `${gymProfile.contact_name_1 || 'STAFF'}: ${gymProfile.contact_number_1}`
      : null;
    const contact2 = gymProfile?.contact_number_2
      ? `${gymProfile.contact_name_2 || 'ADMIN'}: ${gymProfile.contact_number_2}`
      : null;
    const staffContact =
      [contact1, contact2].filter(Boolean).join(' / ') || DEFAULT_CONTACTS;
    const gymLogo = gymProfile?.gym_logo || DEFAULT_LOGO;

const vatEnabled = ratesConfig?.vat_enabled ?? true;
    const vatPercentage = Number(ratesConfig?.vat_percentage ?? 12);

    const receiptTitle = RECEIPT_TITLES[receiptType] || 'Official Receipt';

    const hasQr = useMemo(() => {
      const receiptNoUpper = (actualReceiptNo || data.receiptNo || '').toUpperCase();
      const paymentRefUpper = (data.paymentRef || '').toUpperCase();
      const qrValueUpper = (data.qrValue || '').toUpperCase();

      const startsWithChk =
        receiptNoUpper.startsWith('CHK-') ||
        receiptNoUpper.replace(/^RCPT-/, '').startsWith('CHK-') ||
        paymentRefUpper.startsWith('CHK-') ||
        paymentRefUpper.replace(/^RCPT-/, '').startsWith('CHK-') ||
        qrValueUpper.startsWith('CHK-');

      const customerTypeLower = (data.customerType || '').toLowerCase();
      const planTypeLower = (data.planType || '').toLowerCase();
      const isExistingMember =
        customerTypeLower.includes('existing member') ||
        customerTypeLower === 'member' ||
        planTypeLower.includes('existing member');

      if (startsWithChk || isExistingMember) {
        return false;
      }

      return receiptType === 'subscription' || receiptType === 'attendance';
    }, [
      actualReceiptNo,
      data.receiptNo,
      data.paymentRef,
      data.qrValue,
      data.customerType,
      data.planType,
      receiptType,
    ]);

    const paymentMethod = (data.paymentMethod || 'cash').toUpperCase();
    const isGCash = paymentMethod.includes('GCASH');

    const formattedPlanType = useMemo(() => {
      if (!data.planType) return '';
      let str = data.planType.trim();
      str = str.replace(/^subscribed\s+under\s+/i, '').trim();
      return str.toUpperCase();
    }, [data.planType]);

    const gcashFee = useMemo(() => {
      if (data.gcashFee !== undefined && data.gcashFee > 0)
        return data.gcashFee;
      return isGCash ? (ratesConfig?.gcash_fee ?? 10) : 0;
    }, [data.gcashFee, isGCash, ratesConfig]);

    const cardFee = data.cardFee || 0;

    const rawBasePrice = data.basePrice || 0;
    const basePrice = useMemo(() => {
      if (rawBasePrice > 0) {
        if (data.items && data.items.length > 0) return rawBasePrice;
        if (
          isGCash &&
          gcashFee > 0 &&
          rawBasePrice > gcashFee &&
          (data.gcashFee === 0 || data.gcashFee === undefined)
        ) {
          return rawBasePrice - gcashFee - cardFee;
        }
        return rawBasePrice;
      }
      return 0;
    }, [rawBasePrice, isGCash, gcashFee, cardFee, data.items, data.gcashFee]);

const itemsSubtotal = useMemo(() => {
      if (data.items && data.items.length > 0) {
        return data.items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );
      }
      if (receiptType === 'card' && cardItems.length > 0) {
        return cardItems.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );
      }
      return basePrice;
    }, [data.items, cardItems, receiptType, basePrice]);

    const effectiveCardFee = useMemo(() => {
      if (receiptType === 'card' && cardItems.length > 0) {
        return 0;
      }
      return cardFee;
    }, [receiptType, cardItems.length, cardFee]);

    const subtotal = itemsSubtotal + effectiveCardFee + gcashFee;
    const totalDue = subtotal;

    const vatableSales = vatEnabled ? totalDue / (1 + vatPercentage / 100) : 0;
    const vatAmount = vatEnabled ? totalDue - vatableSales : 0;

    const receiptNo = actualReceiptNo;
    const authProfile = useAuthStore((s) => s.profile);
    const authUser = useAuthStore((s) => s.user);

    useEffect(() => {
      let isMounted = true;

      const resolveProcessorUser = async () => {
        if (data.processedBy && !isGenericStaff(data.processedBy)) {
          const trimmed = data.processedBy.trim();

          if (isUuid(trimmed)) {
            try {
              const { data: prof } = await supabase
                .from('profiles')
                .select('username, email, role')
                .eq('id', trimmed)
                .maybeSingle();

              if (isMounted) {
                setResolvedProcessor(prof?.email || prof?.username || trimmed);
                return;
              }
            } catch (err) {
              console.warn('Failed to resolve UUID to profile:', err);
            }
          }

          if (isMounted) {
            setResolvedProcessor(trimmed);
          }
          return;
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (isMounted) {
            if (data.processedBy && !isGenericStaff(data.processedBy)) {
              setResolvedProcessor(data.processedBy);
            } else if (authUser?.email) {
              setResolvedProcessor(authUser.email);
            } else if (authProfile?.username) {
              setResolvedProcessor(authProfile.username);
            }
            setIsResolvingProcessor(false);
          }
          return;
        }

        const searchKey = data.paymentRef || actualReceiptNo || data.receiptNo;
        const isPreview = !searchKey || searchKey.includes('PREVIEW');

        if (!isPreview && searchKey) {
          const cleanKey = searchKey.replace(/^rcpt-/i, '').trim();
          const rawKey = searchKey.trim();

          try {
            let processorIdentifier: string | null = null;

            const { data: rcptRow } = await supabase
              .from('receipts')
              .select('*')
              .or(`id.eq.${cleanKey},id.eq.${rawKey}`)
              .maybeSingle();

            if (rcptRow) {
              processorIdentifier =
                rcptRow.processed_by ||
                rcptRow.created_by ||
                rcptRow.user_id ||
                rcptRow.cashier ||
                rcptRow.staff_name ||
                rcptRow.staff_username ||
                null;
            }

            if (!processorIdentifier) {
              let subFilter = `receipt_number.eq.${cleanKey},receipt_number.eq.${rawKey}`;
              if (isUuid(cleanKey)) subFilter += `,id.eq.${cleanKey}`;
              if (isUuid(rawKey) && rawKey !== cleanKey) subFilter += `,id.eq.${rawKey}`;

              const { data: subRow } = await supabase
                .from('subscriptions')
                .select('*')
                .or(subFilter)
                .maybeSingle();

              if (subRow) {
                processorIdentifier =
                  subRow.processed_by ||
                  subRow.created_by ||
                  subRow.user_id ||
                  null;
              }
            }

            if (!processorIdentifier) {
              let attFilter = `receipt_number.eq.${cleanKey},receipt_number.eq.${rawKey}`;
              if (isUuid(cleanKey)) attFilter += `,id.eq.${cleanKey}`;
              if (isUuid(rawKey) && rawKey !== cleanKey) attFilter += `,id.eq.${rawKey}`;

              const { data: attRow } = await supabase
                .from('attendance')
                .select('*')
                .or(attFilter)
                .maybeSingle();

              if (attRow) {
                processorIdentifier =
                  attRow.processed_by ||
                  attRow.created_by ||
                  attRow.staff_username ||
                  attRow.user_id ||
                  null;
              }
            }

            if (!processorIdentifier) {
              let salesFilter = `receipt_no.eq.${rawKey},receipt_no.eq.${cleanKey}`;
              if (isUuid(rawKey)) salesFilter += `,id.eq.${rawKey}`;
              if (isUuid(cleanKey) && cleanKey !== rawKey) salesFilter += `,id.eq.${cleanKey}`;

              const { data: salesRow } = await supabase
                .from('sales')
                .select('*')
                .or(salesFilter)
                .maybeSingle();

              if (salesRow) {
                processorIdentifier =
                  salesRow.processed_by ||
                  salesRow.created_by ||
                  salesRow.user_id ||
                  salesRow.sold_by ||
                  salesRow.cashier ||
                  null;
              }
            }

            if (!processorIdentifier) {
              const { data: auditRow } = await supabase
                .from('audit_logs')
                .select('actor_username')
                .or(
                  `target_id.eq.${cleanKey},target_id.eq.${rawKey},target_id.eq.rcpt-${cleanKey}`
                )
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (
                auditRow?.actor_username &&
                auditRow.actor_username !== 'System'
              ) {
                processorIdentifier = auditRow.actor_username;
              }
            }

            if (!processorIdentifier) {
              const { data: detailAudit } = await supabase
                .from('audit_logs')
                .select('actor_username')
                .ilike('details', `%${cleanKey}%`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (
                detailAudit?.actor_username &&
                detailAudit.actor_username !== 'System'
              ) {
                processorIdentifier = detailAudit.actor_username;
              }
            }

            if (processorIdentifier) {
              const targetId = String(processorIdentifier).trim();

              if (isUuid(targetId)) {
                const { data: prof } = await supabase
                  .from('profiles')
                  .select('username, role')
                  .eq('id', targetId)
                  .maybeSingle();

                if (isMounted && prof?.username) {
                  setResolvedProcessor(
                    prof.role ? `${prof.username} (${prof.role})` : prof.username
                  );
                  setIsResolvingProcessor(false);
                  return;
                }
              } else if (!isGenericStaff(targetId)) {
                if (isMounted) {
                  setResolvedProcessor(targetId);
                  setIsResolvingProcessor(false);
                  return;
                }
              }
            }
          } catch (err) {
            console.warn('Failed to query transaction processor:', err);
          }
        }

        if (isMounted) {
          if (data.processedBy && !isGenericStaff(data.processedBy)) {
            setResolvedProcessor(data.processedBy);
          } else if (isPreview && authProfile?.username) {
            setResolvedProcessor(authProfile.username);
          } else if (isPreview && authUser?.email) {
            setResolvedProcessor(authUser.email.split('@')[0]);
          }
          setIsResolvingProcessor(false);
        }
      };

      resolveProcessorUser();

      return () => {
        isMounted = false;
      };
    }, [
      data.processedBy,
      actualReceiptNo,
      data.receiptNo,
      data.paymentRef,
      isOpen,
      authProfile,
      authUser,
    ]);

   const processedBy = useMemo(() => {
      const formatUsername = (val: string) => {
        if (!val.includes('@')) return val;
        const lower = val.toLowerCase();
        if (
          lower === 'wolf.palomar@gmail.com' ||
          lower === 'wolfpalomargym@gmail.com'
        ) {
          return 'SUPERADMIN';
        }
        if (authProfile?.username) {
          return authProfile.username;
        }
        return val.split('@')[0];
      };

      if (data.processedBy && !isGenericStaff(data.processedBy)) {
        return formatUsername(data.processedBy);
      }

      if (resolvedProcessor && !isGenericStaff(resolvedProcessor)) {
        return formatUsername(resolvedProcessor);
      }

      if (authProfile?.username) {
        return authProfile.username;
      }

      if (authUser?.email) {
        return authUser.email.toLowerCase().includes('wolf.palomar')
          ? 'SUPERADMIN'
          : authUser.email.split('@')[0];
      }

      return 'SUPERADMIN';
    }, [
      data.processedBy,
      resolvedProcessor,
      authProfile,
      authUser,
    ]);

    const gcashRefDisplay = data.gcashRefNo || data.paymentRef || 'N/A';

    const txDateStr = useMemo(() => {
      if (!data.transactionDate)
        return format(new Date(), 'MMM d, yyyy, h:mm:ss a');
      try {
        return format(parseISO(data.transactionDate), 'MMM d, yyyy, h:mm:ss a');
      } catch {
        return data.transactionDate;
      }
    }, [data.transactionDate]);

    const qrPayload = data.qrValue || receiptNo;
    const qrDataUrl = useMemo(() => {
      if (!hasQr) return '';
      try {
        return generateOfflineQrDataUrl(qrPayload, 240);
      } catch {
        return '';
      }
    }, [hasQr, qrPayload]);

    const generateReceiptCanvasDataUrl = async (): Promise<string | null> => {
      try {
        const canvas = document.createElement('canvas');
        const width = 400;
        const scale = 2;

let itemCount = 0;
        if (displayItems.length > 0)
          itemCount += displayItems.length + 1;
        let extraRows = 14;
        if (data.paymentRef && !isGCash) extraRows++;
        if (effectiveCardFee > 0) extraRows++;
        if (gcashFee > 0) extraRows++;
        if (isGCash || data.gcashRefNo) extraRows++;
        if (vatEnabled) extraRows += 2;

        const qrSectionHeight = hasQr ? 140 : 0;
        const height = 480 + extraRows * 20 + itemCount * 18 + qrSectionHeight;

        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, 10, width - 20, height - 20);

        ctx.fillStyle = '#bf0202';
        ctx.fillRect(10, 10, width - 20, 4);

        let y = 35;

        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(gymName.toUpperCase(), width / 2, y);
        y += 16;

        ctx.fillStyle = '#64748b';
        ctx.font = '8.5px system-ui, sans-serif';
        ctx.fillText(gymAddress.toUpperCase(), width / 2, y);
        y += 14;

        ctx.font = 'bold 8.5px system-ui, sans-serif';
        ctx.fillText(staffContact.toUpperCase(), width / 2, y);
        y += 18;

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
        ctx.font = 'bold 11px monospace';
        ctx.fillText(receiptTitle.toUpperCase(), width / 2, y);
        y += 16;

        // Balanced centered QR Code Section
        if (hasQr) {
          const qrBoxHeight = 120;
          const qrSize = 75;
          const qrX = (width - qrSize) / 2;

          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(35, y, width - 70, qrBoxHeight);
          ctx.strokeStyle = '#cbd5e1';
          ctx.strokeRect(35, y, width - 70, qrBoxHeight);

          // Header text inside QR Card
          ctx.textAlign = 'center';
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 8px system-ui, sans-serif';
          ctx.fillText('SCAN FOR CHECK-IN / ENTRY', width / 2, y + 14);

          // QR Code Container
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(qrX - 3, y + 20, qrSize + 6, qrSize + 6);
          ctx.strokeStyle = '#e2e8f0';
          ctx.strokeRect(qrX - 3, y + 20, qrSize + 6, qrSize + 6);

          const qrImg = qrDataUrl ? await loadQrImage(qrDataUrl) : null;
          if (qrImg) {
            ctx.drawImage(qrImg, qrX, y + 23, qrSize, qrSize);
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '8px monospace';
            ctx.fillText('[QR CODE]', width / 2, y + 60);
          }

          // Receipt code under QR
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9.5px monospace';
          ctx.fillText(receiptNo, width / 2, y + qrBoxHeight - 8);

          y += qrBoxHeight + 12;
          drawDashedLine(y);
          y += 16;
        }

        const renderRow = (
          label: string,
          value: string,
          isHighlight = false,
          fontColor = '#0f172a'
        ) => {
          ctx.textAlign = 'left';
          ctx.fillStyle = '#64748b';
          ctx.font = '9px monospace';
          ctx.fillText(label, 20, y);

          ctx.textAlign = 'right';
          ctx.fillStyle = fontColor;
          ctx.font = isHighlight ? 'bold 10px monospace' : '600 9px monospace';
          ctx.fillText(value, width - 20, y);
          y += 17;
        };

        renderRow('RECEIPT NO', receiptNo, true, '#0f172a');
        if (data.paymentRef && !isGCash)
          renderRow('PAYMENT REF', data.paymentRef, true, '#0284c7');
        renderRow(
          receiptType === 'subscription' ? 'MEMBER' : 'CUSTOMER',
          (data.customerName || 'Walk-In Guest').toUpperCase(),
          true,
          '#0f172a'
        );

        if (formattedPlanType) {
          renderRow(
            receiptType === 'subscription' ? 'PLAN TYPE' : 'LOGBOOK ENTRY',
            formattedPlanType,
            false,
            '#15803d'
          );
        }

        if (basePrice > 0) {
          renderRow(
            receiptType === 'subscription' ? 'MEMBERSHIP FEE' : 'BASE CHARGE',
            `₱${basePrice.toFixed(2)}`
          );
        }

if (effectiveCardFee > 0)
          renderRow('CARD FEE', `+₱${effectiveCardFee.toFixed(2)}`, false, '#2563eb');
        if (gcashFee > 0)
          renderRow(
            'GCASH CONVENIENCE FEE',
            `+₱${gcashFee.toFixed(2)}`,
            false,
            '#15803d'
          );

        renderRow('PAYMENT METHOD', paymentMethod, false, '#0f172a');
        if (isGCash || data.gcashRefNo)
          renderRow('GCASH REF NO', gcashRefDisplay, true, '#0284c7');

        renderRow('TRANSACTION DATE', txDateStr);
        renderRow('PROCESSED BY', processedBy);

        if (displayItems.length > 0) {
          drawDashedLine(y);
          y += 15;
          ctx.textAlign = 'left';
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 8.5px monospace';
          ctx.fillText(
            cardItems.length > 0
              ? `CARD RECIPIENTS (${displayItems.length} MEMBERS)`
              : 'PURCHASED ITEMS',
            20,
            y
          );
          y += 15;

          displayItems.forEach((item, idx) => {
            renderRow(
              `${idx + 1}. ${item.productName}`,
              `₱${(item.price * item.quantity).toFixed(2)}`
            );
          });
        }

        drawDashedLine(y);
        y += 18;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('SUBTOTAL', 20, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10.5px monospace';
        ctx.fillText(`₱${subtotal.toFixed(2)}`, width - 20, y);

        y += 16;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(20, y, width - 40, 34);
        ctx.strokeStyle = '#cbd5e1';
        ctx.strokeRect(20, y, width - 40, 34);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10.5px monospace';
        ctx.fillText('TOTAL DUE', 30, y + 21);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 13.5px monospace';
        ctx.fillText(`₱${totalDue.toFixed(2)}`, width - 30, y + 21);

        y += 48;

        drawDashedLine(y);
        y += 16;

        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 8.5px system-ui, sans-serif';
        ctx.fillText('RECIPIENT ACKNOWLEDGEMENT', width / 2, y);
        y += 28;

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(25, y);
        ctx.lineTo(210, y);
        ctx.moveTo(230, y);
        ctx.lineTo(width - 25, y);
        ctx.stroke();

        y += 13;
        ctx.fillStyle = '#64748b';
        ctx.font = '7.5px system-ui, sans-serif';
        ctx.fillText('SIGNATURE OVER PRINTED NAME', 117, y);
        ctx.fillText('DATE SIGNED', (230 + width - 25) / 2, y);

        y += 22;
        drawDashedLine(y);
        y += 16;

        ctx.textAlign = 'center';
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 8.5px system-ui, sans-serif';
        ctx.fillText('THIS SERVES AS YOUR SALES INVOICE', width / 2, y);
        y += 13;

        ctx.fillStyle = '#94a3b8';
        ctx.font = '8.5px system-ui, sans-serif';
        ctx.fillText('THANK YOU FOR CHOOSING WOLF GYM.', width / 2, y);

        return canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Canvas generation error:', err);
        return null;
      }
    };

    const createNativeReceiptFile = async (
      dataUrl: string,
      fileName: string,
      directory = Directory.Cache
    ) => {
      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) throw new Error('Receipt image data is invalid.');

      return Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory,
        recursive: true,
      });
    };

    const handlePrint = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const dataUrl = await generateReceiptCanvasDataUrl();
          if (!dataUrl) throw new Error('Failed to generate receipt image.');

          const fileName = `Official_Receipt_${receiptNo}.png`;
          const file = await createNativeReceiptFile(
            dataUrl,
            fileName,
            Directory.Cache
          );
          await Share.share({
            title: `Print Official Receipt - ${receiptNo}`,
            text: 'Choose your printer or print service to print this receipt.',
            files: [file.uri],
            dialogTitle: 'Print receipt',
          });
          return;
        }

        const content = document.getElementById('unified-thermal-receipt-card');
        if (!content) return;

        const iframe = document.createElement('iframe');
        Object.assign(iframe.style, {
          position: 'fixed',
          right: '0',
          bottom: '0',
          width: '0',
          height: '0',
          border: '0',
        });
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        let stylesHtml = '';
        document
          .querySelectorAll('style, link[rel="stylesheet"]')
          .forEach((el) => {
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
                .receipt-qr-container {
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: center !important;
                  text-align: center !important;
                  border: 1px dashed #000 !important;
                  padding: 2mm !important;
                  margin: 2mm auto !important;
                  width: 48mm !important;
                }
                .receipt-qr-img {
                  width: 22mm !important;
                  height: 22mm !important;
                  object-fit: contain !important;
                  display: block !important;
                  margin: 1mm auto !important;
                }
                .receipt-qr-label {
                  font-size: 7.5px !important;
                  font-weight: bold !important;
                  margin-bottom: 0.5mm !important;
                  display: block !important;
                  text-align: center !important;
                }
                .receipt-qr-code-text {
                  font-size: 8.5px !important;
                  font-weight: bold !important;
                  margin-top: 0.5mm !important;
                  display: block !important;
                  text-align: center !important;
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
                  try {
                    window.print();
                  } catch(e) {
                    console.warn('Window print failed:', e);
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
        doc.close();
        logAudit(
          'RECEIPT_PRINTED',
          `Printed official receipt #${receiptNo} for ${data.customerName || 'Customer'} (₱${totalDue.toFixed(2)} via ${paymentMethod}).`
        ).catch(() => {});
      } catch (err) {
        console.error('Print error:', err);
        toast.error('Could not initiate print.');
      }
    };

    const handleDownloadJpg = async () => {
      try {
        const dataUrl = await generateReceiptCanvasDataUrl();
        if (!dataUrl) {
          toast.error('Failed to export receipt image.');
          return;
        }

        const fileName = `Official_Receipt_${receiptNo}.png`;
        const blob = dataUrlToBlob(dataUrl);

        if (Capacitor.isNativePlatform()) {
          try {
            const file = await createNativeReceiptFile(
              dataUrl,
              fileName,
              Directory.Cache
            );
            await Share.share({
              title: `Save Official Receipt - ${receiptNo}`,
              text: `Official Receipt (${receiptNo}) from ${gymName}`,
              files: [file.uri],
              dialogTitle: 'Save receipt image to device',
            });
            setPreviewImgUrl(dataUrl);
          } catch (nativeErr: any) {
            if (nativeErr?.name === 'AbortError') return;
            console.warn('Native download fallback triggered:', nativeErr);
            setPreviewImgUrl(dataUrl);
            setIsPreviewOpen(true);
          }
          return;
        }

        try {
          saveAs(blob, fileName);
          toast.success('Official Receipt image downloaded!');
        } catch (saveErr) {
          console.warn('saveAs failed, attempting anchor fallback:', saveErr);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
          toast.success('Official Receipt image downloaded!');
        }

        setPreviewImgUrl(dataUrl);
      } catch (err) {
        console.error('Download error:', err);
        toast.error('Error exporting receipt image.');
      }
    };

    const handleShareReceipt = async () => {
      try {
        const dataUrl = await generateReceiptCanvasDataUrl();
        if (!dataUrl) {
          toast.error('Failed to generate receipt image.');
          return;
        }

        const fileName = `Official_Receipt_${receiptNo}.png`;
        const blob = dataUrlToBlob(dataUrl);

        if (Capacitor.isNativePlatform()) {
          const file = await createNativeReceiptFile(
            dataUrl,
            fileName,
            Directory.Cache
          );
          await Share.share({
            title: `Official Receipt - ${receiptNo}`,
            text: `Official Receipt (${receiptNo}) from ${gymName}`,
            files: [file.uri],
            dialogTitle: 'Share or save receipt image',
          });
          return;
        }

        if (
          typeof navigator !== 'undefined' &&
          navigator.share &&
          navigator.canShare
        ) {
          try {
            const file = new File([blob], fileName, { type: 'image/png' });

            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `Official Receipt - ${receiptNo}`,
                text: `Official Receipt (${receiptNo}) from ${gymName}`,
              });
              toast.success('Official Receipt shared!');
              return;
            }
          } catch (shareErr: any) {
            if (shareErr?.name === 'AbortError') return;
            console.warn('Web Share API failed:', shareErr);
          }
        }

        setPreviewImgUrl(dataUrl);
        setIsPreviewOpen(true);

        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            toast.success('Receipt image copied to clipboard!');
            return;
          }
        } catch {
          // Ignore fallback
        }

        toast.info('Hold or tap the receipt image to copy.');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to share receipt image:', err);
        toast.error('Error sharing receipt image.');
      }
    };

    const handleCopyImageToClipboard = async () => {
      try {
        const dataUrl = await generateReceiptCanvasDataUrl();
        if (!dataUrl) {
          toast.error('Failed to generate receipt image.');
          return;
        }

        const fileName = `Official_Receipt_${receiptNo}.png`;
        const blob = dataUrlToBlob(dataUrl);

        if (Capacitor.isNativePlatform()) {
          try {
            const file = await createNativeReceiptFile(
              dataUrl,
              fileName,
              Directory.Cache
            );
            await Share.share({
              title: `Copy or Share Receipt - ${receiptNo}`,
              text: `Official Receipt (${receiptNo})`,
              files: [file.uri],
              dialogTitle: 'Copy or Share Receipt Image',
            });
            return;
          } catch (nativeErr: any) {
            if (nativeErr?.name === 'AbortError') return;
          }
        }

        if (
          navigator.clipboard &&
          typeof window.ClipboardItem !== 'undefined'
        ) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            setCopied(true);
            toast.success('Receipt image copied to clipboard!');
            setTimeout(() => setCopied(false), 2500);
            return;
          } catch (clipErr) {
            console.warn(
              'Clipboard write failed, opening fallback preview:',
              clipErr
            );
          }
        }

        setPreviewImgUrl(dataUrl);
        setIsPreviewOpen(true);
        toast.info('Press & hold image below to copy or save.');
      } catch (err) {
        console.error('Clipboard copy error:', err);
        toast.error('Could not copy image automatically. Use Save / Share.');
      }
    };

    const handleTouchStartImage = () => {
      timerRef.current = setTimeout(() => {
        handleCopyImageToClipboard();
      }, 450);
    };

    const handleTouchEndImage = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    useImperativeHandle(ref, () => ({
      handlePrint,
      handleDownloadJpg,
      handleShareReceipt,
      handleCopyImageToClipboard,
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

        {/* Centered Compact QR Code Badge */}
        {hasQr && (
          <div className="receipt-qr-container flex flex-col items-center justify-center p-2 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] my-1.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[7px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1 receipt-qr-label">
              <QrCode className="w-3 h-3 text-[var(--color-primary-light)]" />
              <span>Scan For Check-In / Entry</span>
            </div>

            <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm inline-block">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Check-in QR Code"
                  className="receipt-qr-img w-20 h-20 object-contain block mx-auto"
                />
              ) : (
                <div className="w-20 h-20 flex items-center justify-center text-[8px] font-mono text-slate-400">
                  [QR READY]
                </div>
              )}
            </div>

            <span className="receipt-qr-code-text font-mono font-bold text-[8.5px] text-[var(--color-text)] tracking-wider uppercase mt-1 select-all">
              {receiptNo}
            </span>
          </div>
        )}

        <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

        {/* Metadata Table */}
        <div className="space-y-1 text-[8.5px]">
          <div className="flex justify-between">
            <span className="text-slate-500">RECEIPT NO</span>
            <span className="font-semibold text-[var(--color-text)]">
              {receiptNo}
            </span>
          </div>
          {data.paymentRef && !isGCash && (
            <div className="flex justify-between">
              <span className="text-slate-500">PAYMENT REF</span>
              <span className="font-semibold text-[var(--color-text)]">
                {data.paymentRef}
              </span>
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

          {formattedPlanType && (
            <div className="flex justify-between">
              <span className="text-slate-500">
                {receiptType === 'subscription' ? 'PLAN TYPE' : 'LOGBOOK ENTRY'}
              </span>
              <span className="font-semibold text-[var(--color-text)] uppercase text-right max-w-36">
                {formattedPlanType}
              </span>
            </div>
          )}

          {/* Product & Card Recipients Breakdown */}
          {displayItems.length > 0 && (
            <div className="py-1 space-y-0.5 border-y border-dashed border-[var(--border-color)] my-1">
              <span className="text-[7.5px] font-bold text-slate-500 uppercase block">
                {cardItems.length > 0
                  ? `Card Recipients (${displayItems.length} Members)`
                  : 'Purchased Items'}
              </span>
              {displayItems.map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center text-[8.5px]"
                >
                  <span className="truncate max-w-[200px]">
                    {item.productName}
                  </span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 font-mono shrink-0">
                    ₱{(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {basePrice > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">
                {receiptType === 'subscription'
                  ? 'MEMBERSHIP FEE'
                  : 'BASE CHARGE'}
              </span>
              <span className="font-semibold text-[var(--color-text)]">
                ₱{basePrice.toFixed(2)}
              </span>
            </div>
          )}

{effectiveCardFee > 0 && (
            <div className="flex justify-between text-blue-500">
              <span>CARD FEE</span>
              <span className="font-semibold">+₱${effectiveCardFee.toFixed(2)}</span>
            </div>
          )}

          {gcashFee > 0 && (
            <div className="flex justify-between text-emerald-500 font-bold">
              <span>GCASH CONVENIENCE FEE</span>
              <span className="font-semibold">+₱{gcashFee.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-slate-500">PAYMENT METHOD</span>
            <span className="font-semibold text-[var(--color-text)] uppercase">
              {paymentMethod}
            </span>
          </div>

          {(isGCash || data.gcashRefNo) && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-mono font-bold">
              <span>GCASH REF NO</span>
              <span>{gcashRefDisplay}</span>
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
            <span className="font-semibold text-[var(--color-text)]">
              {processedBy}
            </span>
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
            <span className="text-[var(--color-primary-light)] text-sm font-black">
              ₱{totalDue.toFixed(2)}
            </span>
          </div>

          {data.amountReceived !== undefined &&
            data.amountReceived !== null && (
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

        {/* Recipient Acknowledgement Section */}
        <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

        <div className="pt-1 pb-1 space-y-2">
          <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wider block text-center">
            RECIPIENT ACKNOWLEDGEMENT
          </span>
          <div className="grid grid-cols-2 gap-3 text-[7.5px]">
            <div>
              <div className="manual-signature-line border-b border-slate-400 dark:border-zinc-500 h-5" />
              <span className="text-slate-400 uppercase tracking-tight block text-center mt-1 font-sans">
                SIGNATURE OVER PRINTED NAME
              </span>
            </div>
            <div>
              <div className="manual-signature-line border-b border-slate-400 dark:border-zinc-500 h-5" />
              <span className="text-slate-400 uppercase tracking-tight block text-center mt-1 font-sans">
                DATE SIGNED
              </span>
            </div>
          </div>
        </div>

        <div className="border-b border-dashed border-[var(--border-color)] my-1.5" />

        {/* Footer */}
        <div className="text-center space-y-0.5 pt-0.5 text-[7.5px] text-slate-500 leading-tight">
          <p className="font-semibold uppercase tracking-wider">
            This serves as your Sales Invoice
          </p>
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
      <>
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
            {receiptBody}

            <div className="grid grid-cols-2 gap-2 pt-2">
              {isNative ? (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleShareReceipt}
                  className="col-span-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-heading text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold border-none"
                  title="Save or Share Receipt Image"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>Save / Share</span>
                </button>
              ) : (
                <>
                  {showDownloadButton && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleDownloadJpg}
                      className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-heading text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold border-none"
                      title="Download Receipt Image File"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span>Download</span>
                    </button>
                  )}

                  {showShareButton && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleShareReceipt}
                      className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-white font-heading text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold border-none"
                      title="Share Receipt Image"
                    >
                      <Share2 className="w-4 h-4 shrink-0" />
                      <span>Share</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                disabled={isLoading}
                onClick={handleCopyImageToClipboard}
                className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 text-white font-heading text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold border-none"
                title="Copy Image to Clipboard"
              >
                {copied ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-300" />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
                <span>{copied ? 'Copied!' : 'Copy Image'}</span>
              </button>

              {showPrintButton && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handlePrint}
                  className={`${
                    isNative ? 'col-span-2' : ''
                  } py-2.5 px-3 bg-slate-800 hover:bg-slate-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 active:scale-[0.98] disabled:opacity-50 text-slate-100 border border-slate-700 font-heading text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md font-bold`}
                  title="Print Thermal Receipt"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Print Receipt</span>
                </button>
              )}
            </div>
          </div>
        </Modal>

        {/* Image Preview Modal Fallback */}
        {isPreviewOpen && previewImgUrl && (
          <Modal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            title="RECEIPT IMAGE READY"
            className="max-w-md p-4 space-y-3 font-mono text-[9px] text-[var(--color-text)] relative z-[9999]"
          >
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1 pt-1">
              <p className="text-[10px] font-sans font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Hold Tap Image Below to Copy
              </p>
              <p className="text-[8.5px] font-sans text-slate-500 dark:text-slate-400">
                Press & hold the receipt image for 0.5s to copy it directly to
                your clipboard.
              </p>
            </div>

            <div className="p-2 bg-slate-100 dark:bg-zinc-900 border border-[var(--border-color)] rounded-2xl flex justify-center max-h-[55vh] overflow-y-auto">
              <img
                src={previewImgUrl}
                alt="Generated Official Receipt"
                onTouchStart={handleTouchStartImage}
                onTouchEnd={handleTouchEndImage}
                onTouchCancel={handleTouchEndImage}
                onMouseDown={handleTouchStartImage}
                onMouseUp={handleTouchEndImage}
                className="max-w-full h-auto object-contain rounded-lg shadow-md cursor-pointer select-none active:scale-[0.98] transition-transform"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyImageToClipboard}
                className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-heading text-[9px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold shadow-md"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied!' : 'Copy Image'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="py-2.5 px-3 bg-[var(--bg-input)] hover:bg-slate-800 text-[var(--color-text)] border border-[var(--border-color)] font-heading text-[9px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>
          </Modal>
        )}
      </>
    );
  }
);

OfficialReceipt.displayName = 'OfficialReceipt';
