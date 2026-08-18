// src/pages/sales/components/ProductFormModal.tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Tag, Barcode, Camera, ChevronDown, ChevronUp, 
  Settings, Loader2, CheckCircle2, AlertTriangle, Plus, Trash, 
  SwitchCamera, FolderPlus, Aperture
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

  showAdvanced: boolean;
  setShowAdvanced: (val: boolean) => void;
  saving: boolean;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: (e: React.FormEvent, bulkItems?: any[]) => void;
  onClose: () => void;
  existingProducts: { id: string; product_name: string; image_url: string | null }[]; 
  editingProductId?: string | null; 
}

const sessionLookupCache: Record<string, {
  product_name?: string;
  image_front_url?: string;
  quantity?: string;
  notFound?: boolean;
}> = {};

const formatQuantity = (qty: string): string => {
  if (!qty) return '';
  const clRegex = /^(\d+(?:\.\d+)?)\s*cl\b/i;
  const match = qty.trim().match(clRegex);
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num)) {
      return `${num * 10} ml`;
    }
  }
  return qty;
};

// Helper for clean, user-friendly image labels
const getFriendlyImageLabel = (url: string) => {
  if (!url) return '';
  if (url.startsWith('data:image/')) {
    return 'Camera Snapshot';
  }
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split('/').pop() || '';
    return filename ? `${parsed.hostname}/.../${filename}` : parsed.hostname;
  } catch {
    return url.length > 30 ? `${url.substring(0, 30)}...` : url;
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

  showAdvanced,
  setShowAdvanced,
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
  
  // Combined Input text state (ignores base64 data URLs)
  const [combinedInput, setCombinedInput] = useState<string>(
    formManufacturerBarcode || (formImageUrl && !formImageUrl.startsWith('data:image/') ? formImageUrl : '')
  );

  // Scanner States
  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Multi-Add Mode
  const [isMultiAddMode, setIsMultiAddMode] = useState(false);
  const [stagedItems, setStagedItems] = useState<any[]>([]);

  // Confirmation overlay
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'disable_multi_add' | 'close_modal';
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const isDuplicateName = useMemo(() => {
    const nameClean = formName.trim().toLowerCase();
    if (!nameClean) return false;
    return existingProducts.some(p => 
      p.product_name.toLowerCase() === nameClean && 
      p.id !== editingProductId
    );
  }, [formName, existingProducts, editingProductId]);

  const applyOFFData = (data: any, barcode: string) => {
    setFormManufacturerBarcode(barcode);
    setFormManufacturerSource('openfoodfacts');

    if (!formName) {
      const rawName = data.product_name || '';
      const weightVolume = formatQuantity(data.quantity || '');
      const combinedName = weightVolume ? `${rawName} - ${weightVolume}` : rawName;
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
        toast.success(`Success! Details for "${mappedData.product_name}" were automatically imported.`);
      } else {
        sessionLookupCache[trimmed] = { notFound: true };
        setFormManufacturerBarcode(trimmed);
        setFormManufacturerSource('manual');
        toast.info('Barcode info not found online. Product details can be typed manually.');
      }
    } catch {
      setFormManufacturerBarcode(trimmed);
      setFormManufacturerSource('manual');
    } finally {
      setApiLoading(false);
    }
  };

  // Auto-detect whether input is Image Web URL or Barcode
  const handleCombinedInputChange = (val: string) => {
    const trimmed = val.trim();
    setCombinedInput(val);

    const isUrl = /^https?:\/\/.+/i.test(trimmed) || /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(trimmed);
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

  // Load available devices when scanner starts
  useEffect(() => {
    if (showLiveScanner) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            if (!selectedCameraId) {
              setSelectedCameraId(devices[0].id);
            }
          }
        })
        .catch((err) => {
          console.warn('Could not list cameras:', err);
        });
    }
  }, [showLiveScanner]);

  // Camera start with automatic fallback on failure
  const startCameraWithFallback = async (camIdx = 0, cameraList = cameras) => {
    if (!cameraList || cameraList.length === 0 || isStartingRef.current) return;
    isStartingRef.current = true;

    const targetCam = cameraList[camIdx % cameraList.length];

    try {
      if (html5QrCodeRef.current?.isScanning) {
        await html5QrCodeRef.current.stop();
        try { html5QrCodeRef.current.clear(); } catch (e) {}
      }

      const qrReader = new Html5Qrcode('product-form-qr-reader');
      html5QrCodeRef.current = qrReader;

      await qrReader.start(
        targetCam.id,
        { fps: 10, qrbox: { width: 220, height: 160 } },
        (decodedText) => {
          setFormManufacturerBarcode(decodedText);
          setCombinedInput(decodedText);
          fetchProductFromOFF(decodedText);
          toast.success(`Scanned Code: ${decodedText}`);
          setShowLiveScanner(false);
        },
        () => {}
      );
    } catch (err) {
      console.warn(`Camera feed failure on camera ${targetCam.id}:`, err);
      if (camIdx === 0 && cameraList.length > 1) {
        toast.info('Primary camera unavailable. Switching to secondary camera...');
        isStartingRef.current = false;
        setTimeout(() => startCameraWithFallback(1, cameraList), 300);
        return;
      } else {
        toast.error('Unable to open camera feed on available cameras.');
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
          html5QrCodeRef.current.stop().then(() => {
            try { html5QrCodeRef.current?.clear(); } catch (e) {}
          }).catch(console.error);
        } else {
          try { html5QrCodeRef.current.clear(); } catch (e) {}
        }
      }
    };
  }, [showLiveScanner, cameras.length]);

  // Capture photo snapshot directly from live camera feed
  const handleCapturePhotoFromCamera = () => {
    try {
      const videoEl = document.querySelector('#product-form-qr-reader video') as HTMLVideoElement;
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
        toast.error('Unable to capture frame from active camera stream.');
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
      toast.success('Product photo captured from camera stream!');
      setShowLiveScanner(false);
    } catch (err) {
      console.error('Error capturing photo from camera:', err);
      toast.error('Failed to capture photo from camera.');
    }
  };

  const handleAttemptClose = () => {
    if (stagedItems.length > 0) {
      setConfirmDialog({
        isOpen: true,
        type: 'close_modal',
        message: `Closing this window will discard ${stagedItems.length} staged item(s) in your queue.`,
        onConfirm: () => {
          setStagedItems([]);
          setConfirmDialog(null);
          onClose();
        }
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
    const alertQty = (formHasStockLimit && formLowStockAlert.trim() !== '') ? parseInt(formLowStockAlert) || null : null;

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
      updated_at: new Date().toISOString()
    };

    setStagedItems((prev) => [...prev, newItem]);
    toast.success(`"${newItem.product_name}" added to queue.`);

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
        const stockQty = formHasStockLimit ? parseInt(formStockQuantity) || 0 : 0;
        const alertQty = (formHasStockLimit && formLowStockAlert.trim() !== '') ? parseInt(formLowStockAlert) || null : null;

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
          updated_at: new Date().toISOString()
        });
      }

      if (itemsToSave.length === 0) {
        toast.error('Creation queue is empty.');
        return;
      }

      onSave(e, itemsToSave);
    } else {
      onSave(e);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in text-xs text-(--color-text) font-sans">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative animate-scale-up">

        {/* INLINE CONFIRMATION OVERLAY */}
        {confirmDialog && confirmDialog.isOpen && (
          <div className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl p-5 max-w-xs w-full text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">Discard Queue?</h4>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="py-2.5 border border-(--border-color) bg-(--bg-page) text-slate-600 dark:text-slate-300 hover:text-(--color-text) rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.onConfirm}
                  className="py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-lg shadow-red-600/20 transition-all"
                >
                  Yes, Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-(--border-color) flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-xs tracking-widest uppercase text-(--color-text) font-mono">
              {isEditing ? 'EDIT PRODUCT' : 'ADD NEW PRODUCT'}
            </h3>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsMultiAddMode(!isMultiAddMode)}
                className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                  isMultiAddMode
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-(--border-color) hover:text-(--color-text)'
                }`}
              >
                {isMultiAddMode ? 'Multi-Add Active' : '+ Add Multiple'}
              </button>
            )}
          </div>
          <button 
            type="button"
            onClick={handleAttemptClose}
            className="text-slate-400 hover:text-(--color-text) cursor-pointer p-1 rounded-lg transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM CONTENT */}
        <form onSubmit={handleFormSubmission} className="p-5 space-y-4 text-xs overflow-y-auto max-h-[82vh] no-scrollbar text-left">
          
          {/* STAGED ITEMS QUEUE (Multi-Add Mode) */}
          {isMultiAddMode && stagedItems.length > 0 && (
            <div className="p-3 bg-(--bg-page) border border-blue-500/30 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                Staged Creation Queue ({stagedItems.length} items ready)
              </span>
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {stagedItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] bg-(--bg-card) px-3 py-1.5 border border-(--border-color) rounded-lg shadow-xs">
                    <span className="font-bold truncate max-w-[220px]">
                      {item.product_name} • ₱{item.selling_price.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStagedItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-600 font-bold uppercase text-[9px] cursor-pointer"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRODUCT NAME */}
          <div className="space-y-1.5">
            <label htmlFor="modal-product-name" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 font-mono block">
              PRODUCT NAME *
            </label>
            <div className="bg-(--bg-page) border border-(--border-color) focus-within:border-blue-500 rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                id="modal-product-name"
                type="text"
                required={!isMultiAddMode || stagedItems.length === 0}
                maxLength={100}
                placeholder="e.g. Water Bottle, Protein Shake"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-transparent outline-none w-full text-(--color-text) placeholder-slate-400 dark:placeholder-slate-500 text-xs font-semibold"
              />
            </div>
            {isDuplicateName && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-bold uppercase">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Notice: Product name already exists in inventory</span>
              </div>
            )}
          </div>

          {/* SELLING PRICE */}
          <div className="space-y-1.5">
            <label htmlFor="modal-product-price" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 font-mono block">
              SELLING PRICE (₱) *
            </label>
            <div className="bg-(--bg-page) border border-(--border-color) focus-within:border-blue-500 rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-colors">
              <span className="font-mono font-bold text-slate-400 text-xs shrink-0">₱</span>
              <input
                id="modal-product-price"
                type="number"
                step="0.01"
                min="0"
                required={!isMultiAddMode || stagedItems.length === 0}
                placeholder="0.00"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                className="bg-transparent outline-none w-full text-(--color-text) placeholder-slate-400 dark:placeholder-slate-500 text-xs font-mono font-bold"
              />
            </div>
          </div>

          {/* UNIFIED PRODUCT PHOTO & BARCODE SECTION */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 font-mono block">
              PRODUCT PHOTO / BARCODE
            </label>

            {/* IF PHOTO IS ATTACHED: HIDE INPUT BOX AND SHOW PHOTO TAKEN CARD ONLY */}
            {formImageUrl ? (
              <div className="space-y-1.5">
                <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <img 
                      src={formImageUrl} 
                      alt="Product Preview" 
                      className="w-12 h-12 rounded-lg object-cover border border-(--border-color) shrink-0 bg-white shadow-xs" 
                    />
                    <div className="min-w-0 text-left">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 truncate">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Photo Taken
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block font-mono mt-0.5">
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
                    className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    title="Remove photo to take or upload another"
                  >
                    <Trash className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                {/* SHOW BARCODE BADGE IF PRESENT WITH PHOTO */}
                {formManufacturerBarcode && (
                  <div className="flex items-center justify-between p-2 bg-(--bg-page) border border-(--border-color) rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">MFG Barcode:</span>
                      <span className="font-mono font-bold text-xs text-(--color-text)">{formManufacturerBarcode}</span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        {formManufacturerSource}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormManufacturerBarcode('');
                        setFormManufacturerSource('manual');
                      }}
                      className="text-red-500 hover:text-red-600 font-bold text-[9px] uppercase tracking-wider cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* IF NO PHOTO ATTACHED: SHOW INPUT BOX WITH PLUS, TEXT FIELD & CAMERA SCANNER */
              <div className="space-y-1.5">
                <div className="bg-(--bg-page) border border-(--border-color) focus-within:border-blue-500 rounded-xl px-2 py-1.5 flex items-center justify-between gap-2 transition-colors">
                  {/* Left Plus/Browse Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-white rounded-lg transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                    title="Browse image file from device"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    ) : (
                      <FolderPlus className="w-4 h-4" />
                    )}
                  </button>

                  {/* Center Text Input for Image URL / Barcode */}
                  <div className="flex-1 min-w-0 flex items-center gap-2 px-1">
                    {apiLoading ? (
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                    ) : (
                      <Barcode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <input
                      type="text"
                      placeholder="Paste Barcode or Image Web URL..."
                      value={combinedInput}
                      onChange={(e) => handleCombinedInputChange(e.target.value)}
                      className="bg-transparent outline-none w-full text-(--color-text) placeholder-slate-400 dark:placeholder-slate-500 text-xs font-mono font-medium truncate"
                    />
                  </div>

                  {/* Right Camera Icon Button */}
                  <button
                    type="button"
                    onClick={() => setShowLiveScanner(!showLiveScanner)}
                    className={`p-2 rounded-lg transition-all cursor-pointer shrink-0 ${
                      showLiveScanner 
                        ? 'bg-blue-600 text-white shadow-md animate-pulse' 
                        : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                    title="Scan barcode or snap photo with camera"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                {/* SHOW BARCODE BADGE IF PRESENT WITHOUT PHOTO */}
                {formManufacturerBarcode && (
                  <div className="flex items-center justify-between p-2 bg-(--bg-page) border border-(--border-color) rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">MFG Barcode:</span>
                      <span className="font-mono font-bold text-xs text-(--color-text)">{formManufacturerBarcode}</span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        {formManufacturerSource}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormManufacturerBarcode('');
                        setFormManufacturerSource('manual');
                      }}
                      className="text-red-500 hover:text-red-600 font-bold text-[9px] uppercase tracking-wider cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
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

            {/* LIVE CAMERA VIEWFINDER WITH SNAP PHOTO BUTTON */}
            {showLiveScanner && (
              <div className="mt-2 p-3 bg-zinc-950 border-2 border-blue-500/40 rounded-2xl relative text-center space-y-2 animate-fade-in text-white">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    CAMERA FEED ACTIVE
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLiveScanner(false)}
                    className="text-xs text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative w-full aspect-video max-w-xs mx-auto rounded-xl overflow-hidden bg-black border border-blue-500/40 flex items-center justify-center shadow-inner">
                  <div id="product-form-qr-reader" className="w-full h-full object-cover" />
                </div>

                {/* CAMERA CONTROLS: SNAP PHOTO & SWITCH CAMERA */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCapturePhotoFromCamera}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                    title="Capture photo frame directly from camera"
                  >
                    <Aperture className="w-3.5 h-3.5" />
                    <span>Snap Photo</span>
                  </button>

                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = cameras.findIndex((c) => c.id === selectedCameraId);
                        const nextIdx = (idx + 1) % cameras.length;
                        startCameraWithFallback(nextIdx, cameras);
                      }}
                      className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer border border-zinc-700"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      <span>Switch Camera</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {!formImageUrl && (
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-medium pt-1">
                Paste Barcode / Image URL, or tap <kbd className="px-1 py-0.2 bg-slate-200 dark:bg-slate-800 rounded text-blue-600 dark:text-blue-400 font-bold">+</kbd> to upload image file, or camera to scan/snap.
              </span>
            )}
          </div>

          {/* MORE OPTIONS (COLLAPSIBLE PROGRESSIVE DISCLOSURE) */}
          <div className="border border-(--border-color) rounded-xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-3 bg-(--bg-page) hover:opacity-90 flex items-center justify-between text-left cursor-pointer transition-colors border-none"
            >
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 font-mono">
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>MORE OPTIONS</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-4 bg-(--bg-card) border-t border-(--border-color) space-y-4 animate-slide-up text-left">
                
                {/* Inventory Control */}
                <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">Track stock</h4>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Turn this on if you want to keep track of how many are left.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formHasStockLimit}
                      onChange={(e) => setFormHasStockLimit(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#123c73] dark:text-[#bf0202] focus:ring-0 cursor-pointer accent-[#123c73] dark:accent-[#bf0202]"
                    />
                  </div>

                  {formHasStockLimit && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-(--border-color) animate-fade-in">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Current stock
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formStockQuantity}
                          onChange={(e) => setFormStockQuantity(e.target.value)}
                          className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-lg text-(--color-text) text-xs font-mono font-bold outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Low-stock alert
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Warn at 5 items left"
                          value={formLowStockAlert}
                          onChange={(e) => setFormLowStockAlert(e.target.value)}
                          className="w-full px-3 py-2 bg-(--bg-card) border border-(--border-color) rounded-lg text-(--color-text) text-xs font-mono font-bold outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Visibility Toggle */}
                <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">Available for sale</h4>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Allow staff and customers to select this product during sale.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formStatus === 'Active'}
                    onChange={(e) => setFormStatus(e.target.checked ? 'Active' : 'Inactive')}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#123c73] dark:text-[#bf0202] focus:ring-0 cursor-pointer accent-[#123c73] dark:accent-[#bf0202]"
                  />
                </div>

              </div>
            )}
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between gap-2 border-t border-(--border-color) pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAttemptClose}
                className="px-4 py-2.5 border border-(--border-color) bg-(--bg-page) text-slate-600 dark:text-slate-300 hover:text-(--color-text) rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Cancel
              </button>

              {isMultiAddMode && (
                <button
                  type="button"
                  onClick={handleAddCurrentToQueue}
                  className="px-3.5 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Queue</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#123c73] dark:bg-[#bf0202] hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-all shadow-lg shadow-black/10 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {isEditing 
                  ? 'Save Changes' 
                  : isMultiAddMode 
                    ? `Add ${stagedItems.length + (formName.trim() ? 1 : 0)} Products`
                    : 'Add Product'
                }
              </span>
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  );
};

export default ProductFormModal;