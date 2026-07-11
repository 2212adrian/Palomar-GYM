//src/pages/sales/components/ProductFormModal.tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { 
  X, ImageIcon, Loader2, Upload, CheckCircle2, 
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

  // Background metadata tracking states (aligned to database columns)
  formManufacturerBarcode: string;
  setFormManufacturerBarcode: (val: string) => void;
  formManufacturerSource: string;
  setFormManufacturerSource: (val: string) => void;

  showAdvanced: boolean;
  setShowAdvanced: (val: boolean) => void;
  saving: boolean;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: (e: React.FormEvent) => void;
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
  
  // Matches centiliter patterns like "33 cl", "33cl", "25 cl e" (case-insensitive)
  const clRegex = /^(\d+(?:\.\d+)?)\s*cl\b/i;
  const match = qty.trim().match(clRegex);
  
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num)) {
      return `${num * 10} ml`; // Converts centiliters to milliliters
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

    // Combine raw name and auto-formatted quantity parameter (e.g., "Coca-Cola - 330 ml")
    if (!formName) {
      const rawName = data.product_name || '';
      const weightVolume = formatQuantity(data.quantity || '');
      const combinedName = weightVolume ? `${rawName} - ${weightVolume}` : rawName;
      setFormName(combinedName);
    }
    // Replace the scanned barcode string in the image field with the actual web image URL
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

      // Project the name, image, and quantity parameters to display complete details
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
        toast.success('Product details imported.');
      } else {
        sessionLookupCache[trimmed] = { notFound: true };
        
        setFormManufacturerBarcode(trimmed);
        setFormManufacturerSource('manual');
        toast.info('Barcode recorded as manual entry.');
      }
    } catch {
      setFormManufacturerBarcode(trimmed);
      setFormManufacturerSource('manual');
    } finally {
      setApiLoading(false);
    }
  };

  // Inspect image URL field changes directly to check for barcode strings
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

    // Only wipe out the barcode if they were in the middle of typing a raw numeric barcode and cleared it
    const wasTypingBarcode = /^\d+$/.test(formImageUrl);
    
    if (!cleaned && wasTypingBarcode) {
      setFormManufacturerBarcode('');
      setFormManufacturerSource('manual');
    }
  };
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-scale-up text-(--color-text)">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-(--border-color) flex items-center justify-between">
          <h3 className="font-heading text-xs tracking-widest uppercase text-(--color-text) flex items-center gap-2">
            <span>{isEditing ? 'Edit Store Product' : 'Add New Store Product'}</span>
          </h3>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 cursor-pointer p-1 rounded-lg border-none bg-transparent"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-5 space-y-4 text-xs overflow-y-auto max-h-[80vh] no-scrollbar text-left">
          
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
                required
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
                required
                min="0"
                label="0.00"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Product Image / Photo (Autofills Product Name and Image URL when Barcode is pasted) */}
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
                    className="text-red-500 hover:text-red-650 cursor-pointer font-bold text-[9px] uppercase tracking-wider transition-colors border-none bg-transparent"
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

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-(--border-color) pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-red-500/20 hover:border-red-500/30 text-red-500 dark:text-red-400 bg-transparent hover:bg-red-500/5 dark:hover:bg-red-500/10 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200"
            >
              Cancel
            </button>
            <Button
              type="submit"
              loading={saving}
              className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all duration-200"
            >
              {isEditing ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};