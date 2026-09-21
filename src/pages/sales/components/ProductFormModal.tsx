// src/pages/sales/components/ProductFormModal.tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Tag,
  Barcode,
  Camera,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  SwitchCamera,
  FolderPlus,
  Aperture,
  Package,
  Sparkles,
  Coins,
  Infinity as InfinityIcon,
  Lock,
  Unlock,
  PackageCheck,
  BellRing,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Html5Qrcode } from 'html5-qrcode';

interface ProductFormModalProps {
  isEditing: boolean;
  formName: string;
  setFormName: (val: string) => void;
  formPrice: string;
  setFormPrice: (val: string) => void;
  formHasStockLimit: boolean;
  setFormHasStockLimit: (val: boolean) => void;
  formStockQuantity: string;
  setFormStockQuantity: (val: string) => void;
  formLowStockAlert: string;
  setFormLowStockAlert: (val: string) => void;
  formStatus: 'Active' | 'Inactive';
  setFormStatus: (val: 'Active' | 'Inactive') => void;
  formImageUrl: string;
  setFormImageUrl: (val: string) => void;

  formManufacturerBarcode: string;
  setFormManufacturerBarcode: (val: string) => void;
  formManufacturerSource: string;
  setFormManufacturerSource: (val: string) => void;

  showAdvanced?: boolean;
  setShowAdvanced?: (val: boolean) => void;
  saving: boolean;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: (e: React.FormEvent, bulkItems?: any[]) => void;
  onClose: () => void;
  existingProducts: {
    id: string;
    product_name: string;
    image_url: string | null;
  }[];
  editingProductId?: string | null;
}

const sessionLookupCache: Record<
  string,
  {
    product_name?: string;
    image_front_url?: string;
    quantity?: string;
    notFound?: boolean;
  }
> = {};

const formatQuantity = (qty: string): string => {
  if (!qty) return '';
  const clRegex = /^(\d+(?:\.\d+)?)\s*cl\b/i;
  const match = qty.trim().match(clRegex);
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num)) return `${num * 10} ml`;
  }
  return qty;
};

const getFriendlyImageLabel = (url: string) => {
  if (!url) return '';
  if (url.startsWith('data:image/')) return 'Camera Snapshot';
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split('/').pop() || '';
    return filename ? `${parsed.hostname}/.../${filename}` : parsed.hostname;
  } catch {
    return url.length > 20 ? `${url.substring(0, 20)}...` : url;
  }
};

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isEditing,
  formName,
  setFormName,
  formPrice,
  setFormPrice,
  formHasStockLimit,
  setFormHasStockLimit,
  formStockQuantity,
  setFormStockQuantity,
  formLowStockAlert,
  setFormLowStockAlert,
  formStatus,
  setFormStatus,
  formImageUrl,
  setFormImageUrl,

  formManufacturerBarcode,
  setFormManufacturerBarcode,
  formManufacturerSource,
  setFormManufacturerSource,

  saving,
  uploading,
  onFileUpload,
  onSave,
  onClose,
  existingProducts,
  editingProductId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStartingRef = useRef(false);
  const [apiLoading, setApiLoading] = useState(false);
  const lastFetchedBarcode = useRef<string>('');

  const [combinedInput, setCombinedInput] = useState<string>(
    formManufacturerBarcode ||
      (formImageUrl && !formImageUrl.startsWith('data:image/')
        ? formImageUrl
        : '')
  );

  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const [isMultiAddMode, setIsMultiAddMode] = useState(false);
  const [stagedItems, setStagedItems] = useState<any[]>([]);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'disable_multi_add' | 'close_modal';
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const isLocked = formStatus === 'Inactive';
  const isInfiniteStock = !formHasStockLimit;

  const isDuplicateName = useMemo(() => {
    const nameClean = formName.trim().toLowerCase();
    if (!nameClean) return false;
    return existingProducts.some(
      (p) =>
        p.product_name.toLowerCase() === nameClean && p.id !== editingProductId
    );
  }, [formName, existingProducts, editingProductId]);

  const applyOFFData = (data: any, barcode: string) => {
    setFormManufacturerBarcode(barcode);
    setFormManufacturerSource('openfoodfacts');

    if (!formName) {
      const rawName = data.product_name || '';
      const weightVolume = formatQuantity(data.quantity || '');
      const combinedName = weightVolume
        ? `${rawName} - ${weightVolume}`
        : rawName;
      setFormName(combinedName);
    }
    if (data.image_front_url) {
      setFormImageUrl(data.image_front_url);
    }
  };

  const fetchProductFromOFF = async (barcode: string) => {
    const trimmed = barcode?.trim() || '';
    if (!trimmed || !/^\d{8,14}$/.test(trimmed)) return;

    if (sessionLookupCache[trimmed]) {
      const cached = sessionLookupCache[trimmed];
      if (!cached.notFound) {
        applyOFFData(cached, trimmed);
      } else {
        setFormManufacturerBarcode(trimmed);
        setFormManufacturerSource('manual');
      }
      return;
    }

    try {
      setApiLoading(true);
      lastFetchedBarcode.current = trimmed;

      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${trimmed}.json?fields=product_name,image_front_url,quantity`
      );

      if (!res.ok) throw new Error();

      const data = await res.json();

      if (data.status === 1 && data.product) {
        const prod = data.product;
        const mappedData = {
          product_name: prod.product_name || '',
          image_front_url: prod.image_front_url || '',
          quantity: prod.quantity || '',
          notFound: false,
        };

        sessionLookupCache[trimmed] = mappedData;
        applyOFFData(mappedData, trimmed);
        toast.success(
          `Details for "${mappedData.product_name}" auto-imported!`
        );
      } else {
        sessionLookupCache[trimmed] = { notFound: true };
        setFormManufacturerBarcode(trimmed);
        setFormManufacturerSource('manual');
      }
    } catch {
      setFormManufacturerBarcode(trimmed);
      setFormManufacturerSource('manual');
    } finally {
      setApiLoading(false);
    }
  };

  const handleCombinedInputChange = (val: string) => {
    const trimmed = val.trim();
    setCombinedInput(val);

    const isUrl =
      /^https?:\/\/.+/i.test(trimmed) ||
      /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(trimmed);
    const isBarcodeDigits = /^\d{8,14}$/.test(trimmed);

    if (isUrl) {
      setFormImageUrl(trimmed);
    } else if (isBarcodeDigits) {
      setFormManufacturerBarcode(trimmed);
      if (trimmed !== lastFetchedBarcode.current) {
        fetchProductFromOFF(trimmed);
      }
    } else if (!trimmed) {
      setFormImageUrl('');
      setFormManufacturerBarcode('');
    }
  };

  const handleToggleStatus = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFormStatus(formStatus === 'Active' ? 'Inactive' : 'Active');
  };

  useEffect(() => {
    if (showLiveScanner) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            const backCam = devices.find(
              (d) =>
                d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment')
            );
            setSelectedCameraId(backCam ? backCam.id : devices[0].id);
          }
        })
        .catch((err) => console.warn('Camera enumeration error:', err));
    }
  }, [showLiveScanner]);

  const startCameraWithFallback = async (camIdx = 0, cameraList = cameras) => {
    if (!cameraList || cameraList.length === 0 || isStartingRef.current) return;
    isStartingRef.current = true;

    const targetCam = cameraList[camIdx % cameraList.length];

    try {
      if (html5QrCodeRef.current?.isScanning) {
        await html5QrCodeRef.current.stop();
        try {
          html5QrCodeRef.current.clear();
        } catch (e) {}
      }

      const qrReader = new Html5Qrcode('product-form-qr-reader');
      html5QrCodeRef.current = qrReader;

      await qrReader.start(
        targetCam.id,
        {
          fps: 25,
          qrbox: (w, h) => ({
            width: Math.min(Math.floor(w * 0.88), 360),
            height: Math.min(Math.floor(h * 0.5), 160),
          }),
          videoConstraints: {
            deviceId: { exact: targetCam.id },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment',
          },
        },
        (decodedText) => {
          setFormManufacturerBarcode(decodedText);
          setCombinedInput(decodedText);
          fetchProductFromOFF(decodedText);
          toast.success(`Scanned: ${decodedText}`);
          setShowLiveScanner(false);
        },
        () => {}
      );
    } catch (err) {
      console.warn(`Camera feed failure on camera ${targetCam.id}:`, err);
      if (camIdx === 0 && cameraList.length > 1) {
        isStartingRef.current = false;
        setTimeout(() => startCameraWithFallback(1, cameraList), 250);
      } else {
        toast.error('Unable to access camera feed.');
        setShowLiveScanner(false);
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  useEffect(() => {
    if (showLiveScanner && cameras.length > 0 && !isStartingRef.current) {
      startCameraWithFallback(0, cameras);
    }

    return () => {
      isStartingRef.current = false;
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current
            .stop()
            .then(() => {
              try {
                html5QrCodeRef.current?.clear();
              } catch (e) {}
            })
            .catch(console.error);
        } else {
          try {
            html5QrCodeRef.current.clear();
          } catch (e) {}
        }
      }
    };
  }, [showLiveScanner, cameras.length]);

  const handleCapturePhotoFromCamera = () => {
    try {
      const videoEl = document.querySelector(
        '#product-form-qr-reader video'
      ) as HTMLVideoElement;
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
        toast.error('Camera feed is still initializing.');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      setFormImageUrl(dataUrl);
      toast.success('Photo snapshot captured!');
      setShowLiveScanner(false);
    } catch (err) {
      console.error('Snapshot capture error:', err);
      toast.error('Failed to capture photo frame.');
    }
  };

  const handleAttemptClose = () => {
    if (stagedItems.length > 0) {
      setConfirmDialog({
        isOpen: true,
        type: 'close_modal',
        message: `Closing will discard ${stagedItems.length} product(s) in your staging queue.`,
        onConfirm: () => {
          setStagedItems([]);
          setConfirmDialog(null);
          onClose();
        },
      });
      return;
    }
    onClose();
  };

  const handleAddCurrentToQueue = () => {
    const nameClean = formName.trim();
    const priceNum = parseFloat(formPrice);

    if (!nameClean) {
      toast.error('Product name is required.');
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Please enter a valid price.');
      return;
    }

    const stockQty = formHasStockLimit ? parseInt(formStockQuantity) || 0 : 0;
    const alertQty =
      formHasStockLimit && formLowStockAlert.trim() !== ''
        ? parseInt(formLowStockAlert) || null
        : null;

    const newItem = {
      product_name: nameClean,
      selling_price: priceNum,
      has_stock_limit: formHasStockLimit,
      stock_quantity: stockQty,
      low_stock_alert: alertQty,
      status: formStatus,
      image_url: formImageUrl.trim() || null,
      manufacturer_barcode: formManufacturerBarcode.trim() || null,
      manufacturer_source: formManufacturerSource,
      updated_at: new Date().toISOString(),
    };

    setStagedItems((prev) => [...prev, newItem]);
    toast.success(`"${newItem.product_name}" queued!`);

    setFormName('');
    setFormPrice('');
    setFormImageUrl('');
    setCombinedInput('');
    setFormHasStockLimit(false);
    setFormStockQuantity('0');
    setFormLowStockAlert('');
    setFormManufacturerBarcode('');
    setFormManufacturerSource('manual');
  };

  const handleFormSubmission = (e: React.FormEvent) => {
    e.preventDefault();

    if (isMultiAddMode) {
      const currentName = formName.trim();
      const currentPrice = parseFloat(formPrice);
      let itemsToSave = [...stagedItems];

      if (currentName && !isNaN(currentPrice) && currentPrice >= 0) {
        const stockQty = formHasStockLimit
          ? parseInt(formStockQuantity) || 0
          : 0;
        const alertQty =
          formHasStockLimit && formLowStockAlert.trim() !== ''
            ? parseInt(formLowStockAlert) || null
            : null;

        itemsToSave.push({
          product_name: currentName,
          selling_price: currentPrice,
          has_stock_limit: formHasStockLimit,
          stock_quantity: stockQty,
          low_stock_alert: alertQty,
          status: formStatus,
          image_url: formImageUrl.trim() || null,
          manufacturer_barcode: formManufacturerBarcode.trim() || null,
          manufacturer_source: formManufacturerSource,
          updated_at: new Date().toISOString(),
        });
      }

      if (itemsToSave.length === 0) {
        toast.error('Queue is empty. Fill the fields or add to queue.');
        return;
      }

      onSave(e, itemsToSave);
    } else {
      onSave(e);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-500 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans select-none overflow-x-hidden">
      <div
        className={`bg-(--bg-card) border rounded-3xl w-full max-w-lg min-w-0 shadow-2xl overflow-hidden relative flex flex-col max-h-[94vh] transition-all duration-300 ${
          isLocked
            ? 'border-slate-500/30 dark:border-slate-700/60 shadow-slate-900/20'
            : 'border-(--border-color)'
        }`}
      >
        {/* CONFIRMATION OVERLAY */}
        {confirmDialog && confirmDialog.isOpen && (
          <div className="absolute inset-0 z-100 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl p-5 max-w-xs w-full text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-(--color-text) uppercase tracking-wider">
                  Discard Items?
                </h4>
                <p className="text-(--color-text)/60 text-xs mt-1 leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="py-2.5 border border-(--border-color) bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text) rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.onConfirm}
                  className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-md transition-all"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOP HEADER */}
        <div
          className={`px-3.5 sm:px-5 py-3 border-b flex items-center justify-between gap-2 min-w-0 shrink-0 transition-colors duration-300 ${
            isLocked
              ? 'bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-800'
              : 'bg-(--bg-card) border-(--border-color)'
          }`}
        >
          {/* Title and Multi-Add Pill */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shadow-xs shrink-0 transition-colors duration-300 ${
                isLocked
                  ? 'bg-slate-500/10 border border-slate-500/20 text-slate-500'
                  : 'bg-[#123c73]/10 dark:bg-[#bf0202]/15 border border-[#123c73]/20 dark:border-[#bf0202]/30 text-[#123c73] dark:text-[#bf0202]'
              }`}
            >
              {isLocked ? (
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
              ) : (
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-black text-xs sm:text-sm uppercase tracking-wide text-(--color-text) truncate">
                  {isEditing ? 'Edit Product' : 'Add Product'}
                </h3>
                {!isEditing && !isLocked && (
                  <button
                    type="button"
                    onClick={() => setIsMultiAddMode(!isMultiAddMode)}
                    className={`text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full border transition-all cursor-pointer shrink-0 ${
                      isMultiAddMode
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-sm'
                        : 'bg-(--bg-input) text-(--color-text)/70 border-(--border-color) hover:text-(--color-text)'
                    }`}
                  >
                    {isMultiAddMode ? '⚡ Multi' : '+ Batch'}
                  </button>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-(--color-text)/60 truncate block">
                {isLocked
                  ? 'Item inactive and locked from sales'
                  : 'Item name, price, stock & barcode'}
              </p>
            </div>
          </div>

          {/* RIGHT HEADER ACTIONS: ACTIVE/INACTIVE TOGGLE + CLOSE BUTTON */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Active for Sale Switch */}
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-all duration-300 select-none ${
                formStatus === 'Active'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                  : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300/60'
              }`}
              title={
                formStatus === 'Active'
                  ? 'Item is Active. Click to deactivate & lock.'
                  : 'Item is Inactive. Click to reactivate.'
              }
            >
              {formStatus === 'Active' ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
                {formStatus === 'Active' ? 'Active' : 'Inactive'}
              </span>

              {/* Pill Switch */}
              <div
                className={`w-6 sm:w-7 h-3.5 sm:h-4 rounded-full flex items-center p-0.5 transition-colors duration-200 shrink-0 ${
                  formStatus === 'Active'
                    ? 'bg-emerald-500 justify-end'
                    : 'bg-slate-400 dark:bg-slate-600 justify-start'
                }`}
              >
                <div className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-white shadow-xs" />
              </div>
            </button>

            {/* Modal Close Button */}
            <button
              type="button"
              onClick={handleAttemptClose}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-(--bg-input) hover:bg-(--bg-card) text-(--color-text)/60 hover:text-(--color-text) border border-(--border-color) flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE FORM BODY (MOBILE FRIENDLY & NO HORIZONTAL OVERFLOW) */}
        <form
          onSubmit={handleFormSubmission}
          className="p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto overflow-x-hidden max-h-[calc(94vh-130px)] text-left min-w-0 w-full"
        >
          {/* INACTIVE / LOCKED BANNER */}
          {isLocked && (
            <div className="p-2.5 sm:p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-center gap-2 animate-fade-in text-amber-600 dark:text-amber-400 min-w-0">
              <Lock className="w-4 h-4 shrink-0" />
              <span className="text-[11px] sm:text-xs font-bold leading-tight break-words">
                Item is Inactive (Locked). Toggle{' '}
                <span className="font-extrabold underline">Active</span> at the
                top to unlock editing, or click{' '}
                <span className="font-extrabold">Save as Inactive</span> below.
              </span>
            </div>
          )}

          {/* MULTI-ADD STAGED QUEUE BANNER */}
          {isMultiAddMode && stagedItems.length > 0 && (
            <div className="p-2.5 sm:p-3 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl space-y-2 animate-fade-in min-w-0">
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-black text-[#123c73] dark:text-[#bf0202] uppercase tracking-wider flex items-center gap-1 truncate">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  Staged Queue ({stagedItems.length})
                </span>
                <span className="text-[9px] sm:text-[10px] text-(--color-text)/50 font-medium shrink-0">
                  Will save together
                </span>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {stagedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-xs bg-(--bg-card) px-2.5 py-1 border border-(--border-color) rounded-xl shadow-xs min-w-0"
                  >
                    <span className="font-bold text-(--color-text) truncate text-[10px] sm:text-[11px] uppercase min-w-0 flex-1 pr-2">
                      {item.product_name} • ₱{item.selling_price.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStagedItems((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FORM FIELDSET FOR LOCKING */}
          <fieldset
            disabled={isLocked}
            className={`space-y-3 sm:space-y-4 min-w-0 w-full transition-all duration-300 ${
              isLocked
                ? 'opacity-40 pointer-events-none grayscale-[40%]'
                : 'opacity-100'
            }`}
          >
            {/* SECTION 1: BASIC INFO */}
            <div className="p-3 sm:p-4 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl space-y-3 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-(--color-text)/60 block">
                Basic Info
              </span>

              {/* Product Name */}
              <div className="space-y-1 min-w-0">
                <label
                  htmlFor="modal-product-name"
                  className="text-xs font-bold text-(--color-text)/80 flex items-center gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5 text-[#123c73] dark:text-[#bf0202] shrink-0" />
                  <span>Product Name</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  id="modal-product-name"
                  type="text"
                  required={!isMultiAddMode || stagedItems.length === 0}
                  maxLength={100}
                  placeholder="e.g. Bottled Water 500ml, Whey Protein"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 sm:py-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs font-bold text-(--color-text) placeholder:text-(--color-text)/30 outline-none focus:border-slate-400 dark:focus:border-white focus:ring-1 focus:ring-slate-400/20 dark:focus:ring-white/20 transition-all uppercase min-w-0"
                />
                {isDuplicateName && (
                  <div className="flex items-center gap-1.5 pt-0.5 text-[10px] font-bold text-amber-500">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>Product already exists in inventory</span>
                  </div>
                )}
              </div>

              {/* Selling Price */}
              <div className="space-y-1 min-w-0">
                <label
                  htmlFor="modal-product-price"
                  className="text-xs font-bold text-(--color-text)/80 flex items-center gap-1.5"
                >
                  <Coins className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Selling Price</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative min-w-0">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm pointer-events-none">
                    ₱
                  </span>
                  <input
                    id="modal-product-price"
                    type="number"
                    step="1"
                    min="0"
                    required={!isMultiAddMode || stagedItems.length === 0}
                    placeholder="0.00"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 sm:py-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-sm font-mono font-bold text-emerald-500 placeholder:text-(--color-text)/30 outline-none focus:border-slate-400 dark:focus:border-white focus:ring-1 focus:ring-slate-400/20 dark:focus:ring-white/20 transition-all min-w-0"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: INFINITE STOCK / STOCK COUNT RULES */}
            <div className="p-3 sm:p-4 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl space-y-2.5 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <InfinityIcon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isInfiniteStock
                          ? 'text-[#123c73] dark:text-[#bf0202]'
                          : 'text-(--color-text)/50'
                      }`}
                    />
                    <h4 className="text-xs font-bold text-(--color-text) uppercase truncate">
                      Infinite Stock
                    </h4>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-(--color-text)/60 leading-snug break-words">
                    {isInfiniteStock
                      ? 'No inventory counting needed. Always in stock.'
                      : 'Inventory is counted. Warning triggers when low.'}
                  </p>
                </div>

                {/* Infinite Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isInfiniteStock}
                    onChange={(e) => setFormHasStockLimit(!e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors duration-200 flex items-center p-0.5 ${
                      isInfiniteStock
                        ? 'bg-[#123c73] dark:bg-[#bf0202]'
                        : 'bg-(--bg-card) border border-(--border-color)'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out ${
                        isInfiniteStock ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </label>
              </div>

              {/* WHEN INFINITE IS OFF: SHOW STOCK LIMIT FIELDS */}
              {!isInfiniteStock && (
                <div className="pt-2.5 border-t border-(--border-color) space-y-2.5 animate-fade-in min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1 min-w-0">
                      <label
                        htmlFor="modal-stock-qty"
                        className="text-[10px] font-bold uppercase tracking-wider text-(--color-text)/80 flex items-center gap-1"
                      >
                        <PackageCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Current In-Stock</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="modal-stock-qty"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={formStockQuantity}
                        onChange={(e) => setFormStockQuantity(e.target.value)}
                        className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-(--color-text) text-xs font-mono font-bold outline-none focus:border-slate-400 dark:focus:border-white focus:ring-1 focus:ring-slate-400/20 dark:focus:ring-white/20 min-w-0"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label
                        htmlFor="modal-low-stock"
                        className="text-[10px] font-bold uppercase tracking-wider text-(--color-text)/80 flex items-center gap-1"
                      >
                        <BellRing className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Low Stock Alert</span>
                      </label>
                      <input
                        id="modal-low-stock"
                        type="number"
                        min="0"
                        placeholder="e.g. 5"
                        value={formLowStockAlert}
                        onChange={(e) => setFormLowStockAlert(e.target.value)}
                        className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-(--color-text) text-xs font-mono font-bold outline-none focus:border-slate-400 dark:focus:border-white focus:ring-1 focus:ring-slate-400/20 dark:focus:ring-white/20 min-w-0"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-(--color-text)/50 italic leading-tight">
                    Low-stock badge alerts you when quantity reaches this value.
                  </p>
                </div>
              )}
            </div>

            {/* SECTION 3: IMAGE & BARCODE */}
            <div className="p-3 sm:p-4 bg-(--bg-input)/50 border border-(--border-color) rounded-2xl space-y-2.5 min-w-0">
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-(--color-text)/70 flex items-center gap-1.5 truncate">
                  <Barcode className="w-3.5 h-3.5 text-[#123c73] dark:text-[#bf0202] shrink-0" />
                  Image & Barcode
                </span>
                <span className="text-[10px] text-(--color-text)/50 font-medium shrink-0">
                  Optional
                </span>
              </div>

              {/* ATTACHED PHOTO CARD */}
              {formImageUrl ? (
                <div className="p-2.5 sm:p-3 bg-(--bg-card) border border-(--border-color) rounded-xl flex items-center justify-between gap-2 shadow-xs min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <img
                      src={formImageUrl}
                      alt="Product"
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover border border-(--border-color) shrink-0 bg-(--bg-input)"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 truncate">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        Attached
                      </span>
                      <span className="text-[10px] text-(--color-text)/50 truncate block font-mono">
                        {getFriendlyImageLabel(formImageUrl)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFormImageUrl('');
                      setCombinedInput(formManufacturerBarcode || '');
                    }}
                    className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                </div>
              ) : (
                /* ACTION BUTTONS & BARCODE INPUT */
                <div className="space-y-2 min-w-0">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="py-2.5 px-3 bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-[#1e232d] border border-(--border-color) text-(--color-text) rounded-xl text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      {uploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#123c73] dark:text-[#bf0202]" />
                      ) : (
                        <FolderPlus className="w-3.5 h-3.5 text-[#123c73] dark:text-[#bf0202]" />
                      )}
                      <span>Upload</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowLiveScanner(!showLiveScanner)}
                      className={`py-2.5 px-3 border rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 ${
                        showLiveScanner
                          ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent ring-2 ring-white/30 animate-pulse'
                          : 'bg-(--bg-card) hover:bg-slate-100 dark:hover:bg-[#1e232d] border-(--border-color) text-(--color-text)'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5 text-[#123c73] dark:text-[#bf0202]" />
                      <span>Scan/Snap</span>
                    </button>
                  </div>

                  {/* Input field */}
                  <div className="relative min-w-0">
                    <input
                      type="text"
                      placeholder="Paste barcode or image URL..."
                      value={combinedInput}
                      onChange={(e) =>
                        handleCombinedInputChange(e.target.value)
                      }
                      className="w-full pl-8 pr-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-xl text-xs font-mono font-medium text-(--color-text) placeholder:text-(--color-text)/30 outline-none focus:border-slate-400 dark:focus:border-white focus:ring-1 focus:ring-slate-400/20 dark:focus:ring-white/20 transition-all min-w-0"
                    />
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-(--color-text)/40">
                      {apiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#123c73] dark:text-[#bf0202]" />
                      ) : (
                        <Barcode className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* RECORDED BARCODE BADGE */}
              {formManufacturerBarcode && (
                <div className="flex items-center justify-between gap-2 p-2 bg-(--bg-card) border border-(--border-color) rounded-xl min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                    <span className="text-[9px] font-bold text-(--color-text)/50 uppercase shrink-0">
                      Barcode:
                    </span>
                    <span className="font-mono font-bold text-xs text-[#123c73] dark:text-[#bf0202] truncate max-w-[130px] sm:max-w-none">
                      {formManufacturerBarcode}
                    </span>
                    <span className="px-1 py-0.5 rounded text-[7px] font-black uppercase bg-[#123c73]/10 dark:bg-[#bf0202]/15 text-[#123c73] dark:text-[#bf0202] shrink-0">
                      {formManufacturerSource}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormManufacturerBarcode('');
                      setFormManufacturerSource('manual');
                    }}
                    className="text-rose-500 hover:text-rose-600 text-[10px] font-bold uppercase cursor-pointer shrink-0"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileUpload}
                disabled={uploading}
                className="hidden"
              />

              {/* CAMERA VIEWFINDER */}
              {showLiveScanner && (
                <div className="p-2.5 bg-(--bg-page) border border-(--border-color) rounded-2xl relative text-center space-y-2 animate-fade-in text-(--color-text) shadow-xl min-w-0">
                  <style>{`
                    #product-form-qr-reader {
                      width: 100% !important;
                      height: 100% !important;
                      border: none !important;
                      background: transparent !important;
                      position: relative !important;
                      overflow: hidden !important;
                    }
                    #product-form-qr-reader__scan_region {
                      width: 100% !important;
                      height: 100% !important;
                      position: absolute !important;
                      inset: 0 !important;
                      display: flex !important;
                      align-items: center !important;
                      justify-content: center !important;
                      overflow: hidden !important;
                      background: transparent !important;
                    }
                    #product-form-qr-reader video {
                      width: 100% !important;
                      height: 100% !important;
                      object-fit: cover !important;
                      position: absolute !important;
                      inset: 0 !important;
                      border-radius: 0.75rem !important;
                    }
                    #qr-shaded-region,
                    #product-form-qr-reader__scan_region svg,
                    #product-form-qr-reader__scan_region img,
                    #product-form-qr-reader__dashboard,
                    #product-form-qr-reader__dashboard_section,
                    #product-form-qr-reader__header_message {
                      display: none !important;
                    }
                  `}</style>

                  <div className="flex items-center justify-between border-b border-(--border-color) pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Camera Active
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLiveScanner(false)}
                      className="text-xs text-(--color-text)/60 hover:text-(--color-text) p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden bg-black border border-(--border-color) flex items-center justify-center">
                    <div
                      id="product-form-qr-reader"
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
                      <div className="w-[85%] h-[50%] border border-white/40 rounded-xl relative">
                        <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white rounded-tl" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white rounded-tr" />
                        <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white rounded-bl" />
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white rounded-br" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleCapturePhotoFromCamera}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                    >
                      <Aperture className="w-3.5 h-3.5" />
                      <span>Snap Photo</span>
                    </button>

                    {cameras.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = cameras.findIndex(
                            (c) => c.id === selectedCameraId
                          );
                          startCameraWithFallback(
                            (idx + 1) % cameras.length,
                            cameras
                          );
                        }}
                        className="px-3 py-1.5 bg-(--bg-card) hover:bg-(--bg-input) text-(--color-text) border border-(--border-color) rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-[#123c73] dark:text-[#bf0202]" />
                        <span>Switch</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* STICKY FOOTER ACTIONS */}
          <div className="flex items-center justify-between gap-2 border-t border-(--border-color) bg-(--bg-card) pt-3 sm:pt-4 shrink-0 rounded-b-3xl min-w-0 w-full">
            <button
              type="button"
              onClick={handleAttemptClose}
              className="flex-1 sm:flex-none px-3.5 sm:px-5 py-2.5 border border-(--border-color) bg-(--bg-input) hover:bg-slate-200 dark:hover:bg-[#1e232d] text-(--color-text) rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors text-center"
            >
              Cancel
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-none justify-end min-w-0">
              {isMultiAddMode && !isLocked && (
                <button
                  type="button"
                  onClick={handleAddCurrentToQueue}
                  className="px-3 sm:px-4 py-2.5 bg-[#123c73]/10 dark:bg-[#bf0202]/15 hover:bg-[#123c73]/20 text-[#123c73] dark:text-red-400 border border-[#123c73]/30 dark:border-[#bf0202]/30 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1 active:scale-95 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Queue</span>
                </button>
              )}

              <button
                type="submit"
                disabled={saving}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 font-heading font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-1.5 active:scale-95 border border-white/10 cursor-pointer min-w-0 truncate ${
                  isLocked
                    ? 'bg-slate-600 hover:bg-slate-700 text-white shadow-slate-600/20'
                    : 'bg-[#123c73] dark:bg-[#bf0202] hover:bg-[#0c2950] dark:hover:bg-[#9c0202] text-white shadow-[#123c73]/20 dark:shadow-[#bf0202]/20'
                }`}
              >
                {saving && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                )}
                <span className="truncate">
                  {isEditing
                    ? isLocked
                      ? 'Save as Inactive'
                      : 'Save Changes'
                    : isMultiAddMode
                      ? `Save All (${
                          stagedItems.length + (formName.trim() ? 1 : 0)
                        })`
                      : 'Add Product'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ProductFormModal;
