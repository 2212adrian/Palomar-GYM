// src/pages/sales/components/ProductFormModal.tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { 
  X, ImageIcon, Loader2, Upload, CheckCircle2, Plus, Trash,
  Tag, DollarSign, SlidersHorizontal, ChevronUp, ChevronDown, Eye, AlertTriangle
} from 'lucide-react';
import { toast } from 'react-toastify';

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
  const [apiLoading, setApiLoading] = useState(false);
  const lastFetchedBarcode = useRef<string>('');

  // Local states for bulk additions
  const [isMultiAddMode, setIsMultiAddMode] = useState(false);
  const [stagedItems, setStagedItems] = useState<any[]>([]);

  // State for custom inline confirmation overlay
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

  const isDuplicateImage = useMemo(() => {
    const imgClean = formImageUrl.trim().toLowerCase();
    if (!imgClean) return false;
    return existingProducts.some(p => 
      p.image_url?.toLowerCase() === imgClean && 
      p.id !== editingProductId
    );
  }, [formImageUrl, existingProducts, editingProductId]);

  const applyOFFData = (data: any, barcode: string) => {
    setFormManufacturerBarcode(barcode);
    setFormManufacturerSource('openfoodfacts');

    if (!formName) {
      const rawName = data.product_name || '';
      const weightVolume = formatQuantity(data.quantity || '');
      const combinedName = weightVolume ? `${rawName} - ${weightVolume}` : rawName;
      setFormName(combinedName);
    }
    setFormImageUrl(data.image_front_url || '');
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
        toast.info('Barcode details are not available. Custom data can be typed manually.');
      }
    } catch {
      setFormManufacturerBarcode(trimmed);
      setFormManufacturerSource('manual');
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    const trimmed = formImageUrl?.trim() || '';
    if (!trimmed || !/^\d{8,14}$/.test(trimmed)) {
      return;
    }

    if (trimmed === lastFetchedBarcode.current) {
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      fetchProductFromOFF(trimmed);
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [formImageUrl]);

  const handleImageUrlChange = (val: string) => {
    const cleaned = val.replace(/\s+/g, '');
    setFormImageUrl(cleaned);

    const wasTypingBarcode = /^\d+$/.test(formImageUrl);
    if (!cleaned && wasTypingBarcode) {
      setFormManufacturerBarcode('');
      setFormManufacturerSource('manual');
    }
  };

  // Safe Multi-Add Toggle with custom modal verification
  const handleToggleMultiAddMode = (checked: boolean) => {
    if (!checked && stagedItems.length > 0) {
      setConfirmDialog({
        isOpen: true,
        type: 'disable_multi_add',
        message: `Disabling Multi-Add Mode will clear all ${stagedItems.length} staged items currently in your queue.`,
        onConfirm: () => {
          setIsMultiAddMode(false);
          setStagedItems([]);
          setConfirmDialog(null);
        }
      });
      return;
    }
    setIsMultiAddMode(checked);
  };

  // Safe Modal Close (via X or Cancel) with custom modal verification
  const handleAttemptClose = () => {
    if (stagedItems.length > 0) {
      setConfirmDialog({
        isOpen: true,
        type: 'close_modal',
        message: `Closing this modal will permanently discard all ${stagedItems.length} staged items currently in your queue.`,
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
      toast.error('Product name is required to stage an item.');
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Please enter a valid price to stage an item.');
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
    toast.success(`Success! "${newItem.product_name}" (1x) has been successfully added to your creation queue.`);

    // Clear form states for next entry
    setFormName('');
    setFormPrice('');
    setFormImageUrl('');
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

      // Automatically include inputs in current form fields if valid
      if (currentName && !isNaN(currentPrice) && currentPrice >= 0) {
        const stockQty = formHasStockLimit ? parseInt(formStockQuantity) || 0 : 0;
        const alertQty = (formHasStockLimit && formLowStockAlert.trim() !== '') ? parseInt(formLowStockAlert) || null : null;

        const currentStagedItem = {
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
        };
        itemsToSave.push(currentStagedItem);
      }

      if (itemsToSave.length === 0) {
        toast.error('Staging queue is empty. Please configure and add at least one product.');
        return;
      }

      onSave(e, itemsToSave);
    } else {
      onSave(e);
    }
  };

  const isSaveDisabled = useMemo(() => {
    if (isMultiAddMode) {
      const hasFormContent = formName.trim().length > 0 && parseFloat(formPrice) >= 0;
      return stagedItems.length === 0 && !hasFormContent;
    }
    return false;
  }, [isMultiAddMode, stagedItems.length, formName, formPrice]);

  return createPortal(
    <div className="fixed inset-0 z-[16000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in text-xs text-(--color-text)">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-scale-up relative">
        
        {/* --- CUSTOM BEAUTIFUL INLINE CONFIRMATION OVERLAY --- */}
        {confirmDialog && confirmDialog.isOpen && (
          <div className="absolute inset-0 z-[17000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl p-5 max-w-xs w-full text-center space-y-4 shadow-2xl animate-scale-up">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="font-heading text-xs uppercase tracking-wider text-amber-500 font-bold leading-none">Discard Queue?</h4>
                <p className="text-slate-450 dark:text-slate-400 text-[10px] leading-relaxed pt-1.5">
                  {confirmDialog.message}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="py-2.5 border border-(--border-color) bg-(--bg-page) text-slate-500 dark:text-slate-450 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.onConfirm}
                  className="py-2.5 bg-red-650 bg-red-900 hover:bg-red-700 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer font-bold shadow-lg shadow-red-500/15 transition-all"
                >
                  Yes, Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-(--border-color) flex items-center justify-between">
          <h3 className="font-heading text-xs tracking-widest uppercase text-(--color-text) flex items-center gap-2">
            <span>{isEditing ? 'Edit Store Product' : 'Add New Store Product'}</span>
          </h3>
          <button 
            type="button"
            onClick={handleAttemptClose}
            className="text-slate-400 hover:text-slate-200 cursor-pointer p-1 rounded-lg border-none bg-transparent"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmission} className="p-5 space-y-4 text-xs overflow-y-auto max-h-[80vh] no-scrollbar text-left">
          
          {/* Multi-Add Toggle Header Panel */}
          {!isEditing && (
            <div className="flex items-center justify-between p-3 bg-blue-500/5 border border-dashed border-(--border-color) rounded-xl">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Multi-Add Mode</h4>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">Build a queue of items to save them all in one go</p>
              </div>
              <input
                type="checkbox"
                checked={isMultiAddMode}
                onChange={(e) => handleToggleMultiAddMode(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-(--color-primary) focus:ring-0 cursor-pointer accent-(--color-primary)"
              />
            </div>
          )}

          {/* Staged Items list panel */}
          {isMultiAddMode && stagedItems.length > 0 && (
            <div className="p-3.5 bg-slate-100 dark:bg-neutral-900/60 border border-(--border-color) rounded-xl space-y-2 animate-scale-up">
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block leading-none">
                Staged Creation Queue ({stagedItems.length} items staged)
              </span>
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1 text-slate-800 dark:text-slate-200">
                {stagedItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] bg-(--bg-card) px-3 py-1.5 border border-(--border-color) rounded-lg shadow-sm">
                    <span className="font-bold truncate max-w-[240px]">
                      {item.product_name} • ₱{item.selling_price.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStagedItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-750 font-bold uppercase text-[9px] tracking-wider transition-colors border-none bg-transparent cursor-pointer"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Core Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="form-product-name" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Product Name *</span>
              </label>
              <Input
                id="form-product-name"
                type="text"
                required={!isMultiAddMode || stagedItems.length === 0}
                maxLength={100}
                label="e.g., Water Bottle, Protein Shake"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              {isDuplicateName && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 rounded-xl text-[10px] font-bold uppercase tracking-wider mt-1.5 animate-slide-up">
                  <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                  <span>Caution: This item name already exists in database</span>
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="form-product-price" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Selling Price (₱) *</span>
              </label>
              <Input
                id="form-product-price"
                type="number"
                step="0.01"
                required={!isMultiAddMode || stagedItems.length === 0}
                min="0"
                label="0.00"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Product Image / Photo */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Product Image / Photo</span>
            </label>
            
            <div className="grid gap-3">
              <Input
                type="text"
                icon={apiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                )}
                label="Paste Barcode to autofill, or use Image Web Address"
                value={formImageUrl}
                onChange={(e) => handleImageUrlChange(e.target.value)}
              />

              {/* SAVED MFG BARCODE VISIBILITY BADGE */}
              {formManufacturerBarcode && (
                <div className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-neutral-900/60 border border-(--border-color) rounded-xl mt-0.5 animate-scale-up">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">MFG Barcode:</span>
                    <span className="font-mono font-bold text-xs text-(--color-text)">{formManufacturerBarcode}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                      formManufacturerSource === 'openfoodfacts' 
                        ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400' 
                        : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                    }`}>
                      {formManufacturerSource}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormManufacturerBarcode('');
                      setFormManufacturerSource('manual');
                    }}
                    className="text-red-500 hover:text-red-655 cursor-pointer font-bold text-[9px] uppercase tracking-wider transition-colors border-none bg-transparent"
                    title="Remove manufacturer barcode from product"
                  >
                    Remove
                  </button>
                </div>
              )}
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-(--border-color) rounded-2xl p-4 bg-(--bg-page) text-center transition-all hover:opacity-85 cursor-pointer"
              >
                {uploading ? (
                  <div className="flex flex-col items-center justify-center py-2 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#123c73] dark:text-[#bf0202]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse text-slate-500 dark:text-slate-400">
                      Compressing photo...
                    </span>
                  </div>
                ) : formImageUrl && !/^\d+$/.test(formImageUrl) ? (
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-14 h-14 rounded-xl border border-(--border-color) overflow-hidden shadow-sm relative mx-auto bg-white">
                      <img src={formImageUrl} alt="Product Cover" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); setFormImageUrl(''); }} 
                        className="absolute top-0.5 right-0.5 bg-red-650 text-white rounded-md p-0.5 hover:bg-red-700 transition-colors cursor-pointer border-none"
                        title="Remove Image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[9px] font-bold text-emerald-500 uppercase flex items-center gap-1 justify-center">
                      <CheckCircle2 className="w-3 h-3" />
                      Image URL Resolved
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-2 space-y-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all">
                    <Upload className="w-6 h-6 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Tap to select photo from device</span>
                    <span className="text-[8px]">Auto compressed for loading speed</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </div>
              
              {isDuplicateImage && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 rounded-xl text-[10px] font-bold uppercase tracking-wider mt-0.5 animate-slide-up">
                  <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                  <span>Caution: This photo/image URL is already in use by another item</span>
                </div>
              )}
            </div>
          </div>

          {/* Advanced Options Section */}
          <div className="border border-(--border-color) rounded-2xl overflow-hidden transition-all duration-300">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-4 bg-(--bg-page) border-b border-(--border-color) transition-all text-left cursor-pointer border-none"
            >
              <div className="flex items-center gap-2 text-[10px] font-heading tracking-widest uppercase text-slate-500 dark:text-slate-400">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Stock Control & Visibility</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              )}
            </button>

            <div 
              className={`transition-all duration-300 ease-in-out overflow-hidden bg-(--bg-page) ${
                showAdvanced ? 'max-h-[500px] opacity-100 p-4 space-y-4 border-t-0' : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              <div className="grid gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Show to Customers?</span>
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full px-4 py-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-(--color-text) outline-none focus:border-slate-400 transition-all font-semibold cursor-pointer"
                >
                  <option value="Active">Yes (Visible in Storefront / Register)</option>
                  <option value="Inactive">No (Hidden / Out of Stock)</option>
                </select>
              </div>

              <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-xl space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Track inventory counts</h4>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">Toggle this if you want to keep track of remaining quantity</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formHasStockLimit}
                    onChange={(e) => setFormHasStockLimit(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-(--color-primary) focus:ring-0 cursor-pointer accent-(--color-primary)"
                  />
                </div>

                {formHasStockLimit && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 animate-slide-up">
                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Total quantity in stock
                      </label>
                      <Input
                        type="number"
                        min="0"
                        required={formHasStockLimit}
                        label="Available quantity"
                        value={formStockQuantity}
                        onChange={(e) => setFormStockQuantity(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Warn me when stock reaches
                      </label>
                      <Input
                        type="number"
                        min="0"
                        label="e.g., Warn at 5 items remaining"
                        value={formLowStockAlert}
                        onChange={(e) => setFormLowStockAlert(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons Footer row */}
          <div className="flex items-center justify-between gap-2 border-t border-(--border-color) pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAttemptClose}
                className="px-4 py-2 border border-red-500/20 hover:border-red-500/30 text-red-500 dark:text-red-400 bg-transparent hover:bg-red-500/5 dark:hover:bg-red-500/10 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200"
              >
                Cancel
              </button>
              
              {isMultiAddMode && (
                <button
                  type="button"
                  onClick={handleAddCurrentToQueue}
                  className="px-4 py-2 bg-[#123c73]/10 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer hover:bg-blue-500/10 transition-all duration-200 flex items-center gap-1 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Queue</span>
                </button>
              )}
            </div>

            <Button
              type="submit"
              loading={saving}
              disabled={isSaveDisabled}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200"
            >
              {isEditing 
                ? 'Save Changes' 
                : isMultiAddMode 
                  ? `Add ${stagedItems.length + (formName.trim().length > 0 ? 1 : 0)} Items`
                  : 'Add Item'
              }
            </Button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  );
};