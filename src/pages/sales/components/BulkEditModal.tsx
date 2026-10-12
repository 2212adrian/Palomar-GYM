// src/pages/sales/components/BulkEditModal.tsx
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase/client';
import { compressImage } from '../../../lib/imageCompressor';
import {
  X,
  Search,
  SlidersHorizontal,
  Check,
  Image as ImageIcon,
  Loader2,
  Info,
  Eye,
  EyeOff,
  RefreshCcw,
  Wand2,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { logAudit } from '../../../lib/supabase/audit';

export interface BulkEditProduct {
  id: string;
  barcode_id: string;
  product_name: string;
  image_url: string | null;
  selling_price: number;
  has_stock_limit: boolean;
  stock_quantity: number;
  low_stock_alert: number | null;
  status: 'Active' | 'Inactive';
}

interface EditState {
  id: string;
  barcode_id: string;
  product_name: string;
  selling_price: string;
  has_stock_limit: boolean;
  stock_quantity: string;
  low_stock_alert: string;
  status: 'Active' | 'Inactive';
  image_url: string | null;
}

interface BulkEditRowProps {
  p: EditState;
  modified: boolean;
  rowUploadingId: string | null;
  onRowImageUpload: (id: string, file: File) => void;
  setEditedProducts: React.Dispatch<React.SetStateAction<EditState[]>>;
  handleResetRow: (id: string) => void;
}

// 1. DESKTOP VIEW COMPONENT: Horizontal Spreadsheet Row
const BulkEditRow: React.FC<BulkEditRowProps> = ({
  p,
  modified,
  rowUploadingId,
  onRowImageUpload,
  setEditedProducts,
  handleResetRow,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <tr
      className={`transition-colors relative ${
        modified
          ? 'bg-blue-500/10 dark:bg-blue-500/10 border-l-4 border-blue-600'
          : 'hover:bg-slate-50 dark:hover:bg-white/5'
      }`}
    >
      {/* Modification Status Indicator */}
      <td className="py-2.5 px-3 align-middle text-center w-14">
        {modified ? (
          <span className="inline-block px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-extrabold text-[10px] uppercase tracking-wider border border-blue-200 dark:border-blue-500/30">
            Edited
          </span>
        ) : (
          <span className="inline-block w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
        )}
      </td>

      {/* Product Image */}
      <td className="py-2.5 px-3 align-middle text-center w-14">
        <div
          onClick={() => rowUploadingId !== p.id && fileRef.current?.click()}
          className="relative w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#161920] flex items-center justify-center overflow-hidden cursor-pointer transition-opacity hover:opacity-85 mx-auto"
          title="Change image"
        >
          {rowUploadingId === p.id ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          ) : p.image_url ? (
            <img
              src={p.image_url}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-4 h-4 text-slate-400" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRowImageUpload(p.id, file);
            }}
            className="hidden"
          />
        </div>
      </td>

      {/* Barcode ID */}
      <td className="py-2.5 px-3 align-middle font-mono font-bold text-slate-600 dark:text-slate-300 w-28 text-xs">
        {p.barcode_id}
      </td>

      {/* Product Name */}
      <td className="py-2.5 px-3 align-middle">
        <input
          type="text"
          value={p.product_name}
          maxLength={100}
          onChange={(e) => {
            const val = e.target.value;
            setEditedProducts((prev) =>
              prev.map((item) =>
                item.id === p.id ? { ...item, product_name: val } : item
              )
            );
          }}
          className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#151922] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-semibold"
        />
      </td>

      {/* Price */}
      <td className="py-2.5 px-3 align-middle w-28">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400 font-semibold font-mono text-xs">
            ₱
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={p.selling_price}
            onChange={(e) => {
              const val = e.target.value;
              setEditedProducts((prev) =>
                prev.map((item) =>
                  item.id === p.id ? { ...item, selling_price: val } : item
                )
              );
            }}
            className="w-full pl-6 pr-2 py-1.5 border border-slate-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#151922] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-bold font-mono text-right"
          />
        </div>
      </td>

      {/* Stock Type */}
      <td className="py-2.5 px-3 align-middle w-32">
        <select
          value={p.has_stock_limit ? 'Limited' : 'Unlimited'}
          onChange={(e) => {
            const limit = e.target.value === 'Limited';
            setEditedProducts((prev) =>
              prev.map((item) =>
                item.id === p.id ? { ...item, has_stock_limit: limit } : item
              )
            );
          }}
          className="w-full px-2.5 py-1.5 bg-white dark:bg-[#151922] border border-slate-300 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none cursor-pointer font-semibold"
        >
          <option value="Unlimited">Unlimited</option>
          <option value="Limited">Limited</option>
        </select>
      </td>

      {/* Stock Quantity */}
      <td className="py-2.5 px-3 align-middle w-28 text-center">
        {p.has_stock_limit ? (
          <input
            type="number"
            min="0"
            value={p.stock_quantity}
            onChange={(e) => {
              const val = e.target.value;
              setEditedProducts((prev) =>
                prev.map((item) =>
                  item.id === p.id ? { ...item, stock_quantity: val } : item
                )
              );
            }}
            className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#151922] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-bold font-mono text-center"
          />
        ) : (
          <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
        )}
      </td>

      {/* Low Alert Threshold */}
      <td className="py-2.5 px-3 align-middle w-28 text-center">
        {p.has_stock_limit ? (
          <input
            type="number"
            min="0"
            placeholder="None"
            value={p.low_stock_alert}
            onChange={(e) => {
              const val = e.target.value;
              setEditedProducts((prev) =>
                prev.map((item) =>
                  item.id === p.id ? { ...item, low_stock_alert: val } : item
                )
              );
            }}
            className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#151922] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-mono text-center"
          />
        ) : (
          <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
        )}
      </td>

      {/* Visibility Status */}
      <td className="py-2.5 px-3 align-middle text-center w-28">
        <button
          type="button"
          onClick={() => {
            const next = p.status === 'Active' ? 'Inactive' : 'Active';
            setEditedProducts((prev) =>
              prev.map((item) =>
                item.id === p.id ? { ...item, status: next } : item
              )
            );
          }}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors flex items-center justify-center gap-1.5 mx-auto w-24 ${
            p.status === 'Active'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          }`}
        >
          {p.status === 'Active' ? (
            <>
              <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Visible</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
              <span>Hidden</span>
            </>
          )}
        </button>
      </td>

      {/* Reset Row */}
      <td className="py-2.5 px-3 align-middle text-center w-14">
        <button
          type="button"
          onClick={() => handleResetRow(p.id)}
          disabled={!modified}
          className="p-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-[#151922] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
          title="Reset item changes"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

// 2. MOBILE CARD VIEW COMPONENT
interface BulkEditCardProps {
  p: EditState;
  modified: boolean;
  rowUploadingId: string | null;
  onRowImageUpload: (id: string, file: File) => void;
  setEditedProducts: React.Dispatch<React.SetStateAction<EditState[]>>;
  handleResetRow: (id: string) => void;
}

const BulkEditCard: React.FC<BulkEditCardProps> = ({
  p,
  modified,
  rowUploadingId,
  onRowImageUpload,
  setEditedProducts,
  handleResetRow,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`p-4 rounded-2xl border transition-all space-y-3.5 ${
        modified
          ? 'bg-blue-50/70 border-blue-300 dark:bg-blue-500/10 dark:border-blue-500/40 shadow-xs'
          : 'bg-white dark:bg-[#151922] border-slate-200 dark:border-white/10'
      }`}
    >
      {/* Top Header: Image + Name + Barcode + Modified badge */}
      <div className="flex items-start gap-3">
        <div
          onClick={() => rowUploadingId !== p.id && fileRef.current?.click()}
          className="relative w-12 h-12 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#1b202c] flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
        >
          {rowUploadingId === p.id ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          ) : p.image_url ? (
            <img
              src={p.image_url}
              alt="Thumbnail"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-slate-400" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRowImageUpload(p.id, file);
            }}
            className="hidden"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-slate-600 dark:text-slate-300 font-bold truncate">
              {p.barcode_id}
            </span>
            {modified && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 font-extrabold text-[10px] uppercase tracking-wider shrink-0 border border-blue-200 dark:border-blue-500/30">
                Edited
              </span>
            )}
          </div>
          <input
            type="text"
            value={p.product_name}
            maxLength={100}
            onChange={(e) => {
              const val = e.target.value;
              setEditedProducts((prev) =>
                prev.map((item) =>
                  item.id === p.id ? { ...item, product_name: val } : item
                )
              );
            }}
            className="w-full mt-1.5 px-3 py-1.5 border border-slate-300 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#12161f] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-semibold"
          />
        </div>
      </div>

      {/* Row 1: Price and Visibility */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Selling Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400 font-semibold font-mono text-xs">
              ₱
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={p.selling_price}
              onChange={(e) => {
                const val = e.target.value;
                setEditedProducts((prev) =>
                  prev.map((item) =>
                    item.id === p.id ? { ...item, selling_price: val } : item
                  )
                );
              }}
              className="w-full pl-7 pr-3 py-2 border border-slate-300 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#12161f] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-bold font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Visibility
          </label>
          <button
            type="button"
            onClick={() => {
              const next = p.status === 'Active' ? 'Inactive' : 'Active';
              setEditedProducts((prev) =>
                prev.map((item) =>
                  item.id === p.id ? { ...item, status: next } : item
                )
              );
            }}
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors flex items-center justify-center gap-1.5 min-h-[38px] ${
              p.status === 'Active'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {p.status === 'Active' ? (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Visible</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Hidden</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Stock Type */}
      <div className="space-y-1">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Stock Limits
        </label>
        <select
          value={p.has_stock_limit ? 'Limited' : 'Unlimited'}
          onChange={(e) => {
            const limit = e.target.value === 'Limited';
            setEditedProducts((prev) =>
              prev.map((item) =>
                item.id === p.id ? { ...item, has_stock_limit: limit } : item
              )
            );
          }}
          className="w-full px-3 py-2 bg-slate-50 dark:bg-[#12161f] border border-slate-300 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none cursor-pointer font-bold min-h-[38px]"
        >
          <option value="Unlimited">Unlimited Stock</option>
          <option value="Limited">Limited Stock (Track Units)</option>
        </select>
      </div>

      {/* Row 3 (Conditional): Stock Count and Low Alert */}
      {p.has_stock_limit && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Stock Count
            </label>
            <input
              type="number"
              min="0"
              value={p.stock_quantity}
              onChange={(e) => {
                const val = e.target.value;
                setEditedProducts((prev) =>
                  prev.map((item) =>
                    item.id === p.id ? { ...item, stock_quantity: val } : item
                  )
                );
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#12161f] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-bold font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Low Alert
            </label>
            <input
              type="number"
              min="0"
              placeholder="None"
              value={p.low_stock_alert}
              onChange={(e) => {
                const val = e.target.value;
                setEditedProducts((prev) =>
                  prev.map((item) =>
                    item.id === p.id ? { ...item, low_stock_alert: val } : item
                  )
                );
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#12161f] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>
      )}

      {/* Card Footer: Reset */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={() => handleResetRow(p.id)}
          disabled={!modified}
          className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#12161f] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 disabled:pointer-events-none text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: BulkEditProduct[];
  onSaveSuccess: () => void;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  isOpen,
  onClose,
  selectedProducts,
  onSaveSuccess,
}) => {
  useEffect(() => {
    document.body.classList.add('print-portal-open');
    return () => {
      document.body.classList.remove('print-portal-open');
    };
  }, []);

  const originalMap = useMemo(() => {
    return new Map(selectedProducts.map((p) => [p.id, p]));
  }, [selectedProducts]);

  const [editedProducts, setEditedProducts] = useState<EditState[]>(() => {
    return selectedProducts.map((p) => ({
      id: p.id,
      barcode_id: p.barcode_id,
      product_name: p.product_name,
      selling_price: p.selling_price.toString(),
      has_stock_limit: p.has_stock_limit,
      stock_quantity: p.stock_quantity.toString(),
      low_stock_alert: p.low_stock_alert?.toString() || '',
      status: p.status,
      image_url: p.image_url,
    }));
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'edited' | 'limited' | 'unlimited' | 'visible' | 'hidden'
  >('all');
  const [saving, setSaving] = useState(false);
  const [rowUploadingId, setRowUploadingId] = useState<string | null>(null);

  // Contained Batch Actions menu state
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const [batchTab, setBatchTab] = useState<'price' | 'stock' | 'visibility'>(
    'price'
  );
  const batchMenuRef = useRef<HTMLDivElement>(null);

  // Contained tool states
  const [quickVisibility, setQuickVisibility] = useState<'Active' | 'Inactive'>(
    'Active'
  );
  const [quickStockType, setQuickStockType] = useState<boolean>(true);
  const [priceAdjType, setPriceAdjType] = useState<
    'pct_inc' | 'pct_dec' | 'flat_inc' | 'flat_dec' | 'fixed'
  >('pct_inc');
  const [priceAdjValue, setPriceAdjValue] = useState('');

  // Close batch popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        batchMenuRef.current &&
        !batchMenuRef.current.contains(e.target as Node)
      ) {
        setBatchMenuOpen(false);
      }
    };
    if (batchMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [batchMenuOpen]);

  const isRowModified = useCallback(
    (current: EditState) => {
      const original = originalMap.get(current.id);
      if (!original) return false;

      const originalAlert = original.low_stock_alert?.toString() || '';

      return (
        current.product_name !== original.product_name ||
        parseFloat(current.selling_price) !== original.selling_price ||
        current.has_stock_limit !== original.has_stock_limit ||
        (current.has_stock_limit &&
          parseInt(current.stock_quantity) !== original.stock_quantity) ||
        (current.has_stock_limit &&
          current.low_stock_alert !== originalAlert) ||
        current.status !== original.status ||
        current.image_url !== original.image_url
      );
    },
    [originalMap]
  );

  const modifiedCount = useMemo(() => {
    return editedProducts.filter(isRowModified).length;
  }, [editedProducts, isRowModified]);

  const handleResetRow = (id: string) => {
    const original = originalMap.get(id);
    if (!original) return;

    setEditedProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return {
          id: original.id,
          barcode_id: original.barcode_id,
          product_name: original.product_name,
          selling_price: original.selling_price.toString(),
          has_stock_limit: original.has_stock_limit,
          stock_quantity: original.stock_quantity.toString(),
          low_stock_alert: original.low_stock_alert?.toString() || '',
          status: original.status,
          image_url: original.image_url,
        };
      })
    );
  };

  const handleResetAll = () => {
    setEditedProducts(
      selectedProducts.map((p) => ({
        id: p.id,
        barcode_id: p.barcode_id,
        product_name: p.product_name,
        selling_price: p.selling_price.toString(),
        has_stock_limit: p.has_stock_limit,
        stock_quantity: p.stock_quantity.toString(),
        low_stock_alert: p.low_stock_alert?.toString() || '',
        status: p.status,
        image_url: p.image_url,
      }))
    );
    toast.info('Reset all product edits.');
  };

  // Contained batch actions handlers
  const handleApplyQuickVisibility = () => {
    setEditedProducts((prev) =>
      prev.map((p) => ({ ...p, status: quickVisibility }))
    );
    toast.success(
      `Set visibility to ${quickVisibility === 'Active' ? 'Visible' : 'Hidden'} for all rows.`
    );
    setBatchMenuOpen(false);
  };

  const handleApplyQuickStockType = () => {
    setEditedProducts((prev) =>
      prev.map((p) => ({ ...p, has_stock_limit: quickStockType }))
    );
    toast.success(
      `Set stock tracking to ${quickStockType ? 'Limited' : 'Unlimited'} for all rows.`
    );
    setBatchMenuOpen(false);
  };

  const handleApplyPriceAdjustment = () => {
    const val = parseFloat(priceAdjValue);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid non-negative adjustment value.');
      return;
    }

    setEditedProducts((prev) =>
      prev.map((p) => {
        const currentPrice = parseFloat(p.selling_price) || 0;
        let adjustedPrice = currentPrice;

        switch (priceAdjType) {
          case 'pct_inc':
            adjustedPrice = currentPrice * (1 + val / 100);
            break;
          case 'pct_dec':
            adjustedPrice = Math.max(0, currentPrice * (1 - val / 100));
            break;
          case 'flat_inc':
            adjustedPrice = currentPrice + val;
            break;
          case 'flat_dec':
            adjustedPrice = Math.max(0, currentPrice - val);
            break;
          case 'fixed':
            adjustedPrice = val;
            break;
        }

        return { ...p, selling_price: adjustedPrice.toFixed(2) };
      })
    );

    toast.success('Applied batch price adjustments.');
    setPriceAdjValue('');
    setBatchMenuOpen(false);
  };

  const handleRowImageUpload = async (id: string, file: File) => {
    try {
      setRowUploadingId(id);
      const compressed = await compressImage(file, 10 * 1024);
      const fileExt = 'jpg';
      const fileName = `products/bulk-${id}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressed, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setEditedProducts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          return { ...p, image_url: urlData.publicUrl };
        })
      );

      toast.success('Image uploaded successfully.');
    } catch {
      toast.error('Could not upload image.');
    } finally {
      setRowUploadingId(null);
    }
  };

  const displayedProducts = useMemo(() => {
    return editedProducts.filter((p) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        query === '' ||
        p.product_name.toLowerCase().includes(query) ||
        p.barcode_id.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      if (activeFilter === 'all') return true;
      if (activeFilter === 'edited') return isRowModified(p);
      if (activeFilter === 'limited') return p.has_stock_limit;
      if (activeFilter === 'unlimited') return !p.has_stock_limit;
      if (activeFilter === 'visible') return p.status === 'Active';
      if (activeFilter === 'hidden') return p.status === 'Inactive';
      return true;
    });
  }, [editedProducts, searchQuery, activeFilter, isRowModified]);

  const validationError = useMemo(() => {
    for (const p of editedProducts) {
      if (!p.product_name.trim())
        return `Product "${p.barcode_id}" name cannot be empty.`;

      const price = parseFloat(p.selling_price);
      if (isNaN(price) || price < 0)
        return `Product "${p.product_name}" must have a non-negative selling price.`;

      if (p.has_stock_limit) {
        const qty = parseInt(p.stock_quantity);
        if (isNaN(qty) || qty < 0)
          return `Product "${p.product_name}" stock count cannot be negative.`;

        if (p.low_stock_alert.trim() !== '') {
          const alert = parseInt(p.low_stock_alert);
          if (isNaN(alert) || alert < 0)
            return `Product "${p.product_name}" alert threshold cannot be negative.`;
        }
      }
    }
    return null;
  }, [editedProducts]);

  const handleSaveAll = async () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const modifiedItems = editedProducts.filter(isRowModified);
    if (modifiedItems.length === 0) {
      toast.info('No changes were detected.');
      return;
    }

    try {
      setSaving(true);
      const auditDetails = modifiedItems
        .map((p) => {
          const original = originalMap.get(p.id);
          if (!original) return `"${p.product_name.trim()}"`;

          const changes: string[] = [];
          if (p.product_name.trim() !== original.product_name) {
            changes.push(`Name: "${original.product_name}" -> "${p.product_name.trim()}"`);
          }
          const priceNum = parseFloat(p.selling_price);
          if (priceNum !== original.selling_price) {
            changes.push(`Price: ₱${original.selling_price.toFixed(2)} -> ₱${priceNum.toFixed(2)}`);
          }
          if (p.status !== original.status) {
            changes.push(`Visibility: ${original.status} -> ${p.status}`);
          }
          if (p.has_stock_limit !== original.has_stock_limit) {
            changes.push(
              `Stock Type: ${original.has_stock_limit ? 'Limited' : 'Unlimited'} -> ${p.has_stock_limit ? 'Limited' : 'Unlimited'}`
            );
          } else if (p.has_stock_limit) {
            const enteredStock = parseInt(p.stock_quantity) || 0;
            if (enteredStock !== original.stock_quantity) {
              changes.push(`Stock Count: ${original.stock_quantity} -> ${enteredStock}`);
            }
          }
          return `"${original.product_name}" [${changes.join(', ')}]`;
        })
        .join('; ');

      const updatePromises = modifiedItems.map((p) => {
        const payload = {
          product_name: p.product_name.trim(),
          selling_price: parseFloat(p.selling_price),
          has_stock_limit: p.has_stock_limit,
          stock_quantity: p.has_stock_limit ? parseInt(p.stock_quantity) || 0 : 0,
          low_stock_alert:
            p.has_stock_limit && p.low_stock_alert.trim() !== ''
              ? parseInt(p.low_stock_alert)
              : null,
          status: p.status,
          image_url: p.image_url,
          updated_at: new Date().toISOString(),
        };
        return supabase.from('products').update(payload).eq('id', p.id);
      });

      const results = await Promise.all(updatePromises);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) throw new Error('Bulk update failed');

      try {
        await logAudit(
          'BULK_PRODUCTS_UPDATED',
          `Updated ${modifiedItems.length} products via spreadsheet editor: ${auditDetails}`
        );
      } catch (auditErr) {
        console.warn('Audit logging skipped:', auditErr);
      }

      toast.success(`Successfully saved ${modifiedItems.length} products.`);
      onSaveSuccess();
      onClose();
    } catch {
      toast.error('Bulk editor save transaction failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[16000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 text-xs text-(--color-text) animate-fade-in">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-none sm:rounded-3xl w-full max-w-7xl h-full sm:h-[94vh] max-h-[100vh] sm:max-h-[96vh] md:h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-scale-up">
        {/* MODAL HEADER: Clean, unbothered, distinct Blue theme */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-(--border-color) flex items-center justify-between shrink-0 bg-white dark:bg-[#141820]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center shadow-xs shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-heading font-extrabold tracking-wider uppercase text-slate-900 dark:text-white">
                  Spreadsheet Bulk Editor
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 font-mono text-[10px] font-bold border border-blue-200 dark:border-blue-500/30 hidden xs:inline-block">
                  CATALOG EDITOR
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-normal mt-0.5">
                Edit product names, pricing, stock tracking limits, and visibility in bulk.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer active:scale-95 border border-slate-200 dark:border-white/10"
            title="Close Editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKSPACE CONTENT */}
        <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-5 gap-3 bg-(--bg-page) overflow-hidden">
          {/* RESPONSIVE TOP TOOLBAR: Clean and contained outside! */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0">
            {/* Search Input + Contained Batch Tools */}
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or barcode..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-white/10 rounded-xl bg-white dark:bg-[#151922] text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 transition-all font-medium shadow-xs"
                />
              </div>

              {/* CONTAINED BATCH TOOLS BUTTON & POPOVER */}
              <div className="relative shrink-0" ref={batchMenuRef}>
                <button
                  type="button"
                  onClick={() => setBatchMenuOpen(!batchMenuOpen)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs ${
                    batchMenuOpen
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-[#151922] border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Open batch modification tools"
                >
                  <Wand2 className="w-3.5 h-3.5 text-blue-500" />
                  <span>Batch Tools</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      batchMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Contained Popover Container */}
                {batchMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 p-4 rounded-2xl bg-white dark:bg-[#151922] border border-slate-300 dark:border-white/10 shadow-2xl animate-scale-up text-xs">
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-white/10 mb-3">
                      <span className="font-heading font-extrabold uppercase tracking-wider text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Wand2 className="w-4 h-4 text-blue-500" />
                        Contained Batch Tools
                      </span>
                      <button
                        type="button"
                        onClick={() => setBatchMenuOpen(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Tabs: Price, Stock Limits, Visibility */}
                    <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#10141c] border border-slate-200 dark:border-white/10 mb-3">
                      <button
                        type="button"
                        onClick={() => setBatchTab('price')}
                        className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                          batchTab === 'price'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Pricing
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchTab('stock')}
                        className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                          batchTab === 'stock'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Stock Limits
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchTab('visibility')}
                        className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                          batchTab === 'visibility'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Visibility
                      </button>
                    </div>

                    {/* Tab 1: Price Adjuster */}
                    {batchTab === 'price' && (
                      <div className="space-y-2.5 animate-fade-in">
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                          Adjust selling prices across all displayed product rows.
                        </p>
                        <div className="flex gap-1.5">
                          <select
                            value={priceAdjType}
                            onChange={(e) => setPriceAdjType(e.target.value as any)}
                            className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#12161f] border border-slate-300 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white outline-none font-bold"
                          >
                            <option value="pct_inc">% Raise</option>
                            <option value="pct_dec">% Lower</option>
                            <option value="flat_inc">₱ Add</option>
                            <option value="flat_dec">₱ Deduct</option>
                            <option value="fixed">Set Fixed</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            placeholder="Amount / %"
                            value={priceAdjValue}
                            onChange={(e) => setPriceAdjValue(e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-[#12161f] text-xs font-mono font-bold outline-none focus:border-blue-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyPriceAdjustment}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          Apply Price Adjustment
                        </button>
                      </div>
                    )}

                    {/* Tab 2: Stock Tracking Limit */}
                    {batchTab === 'stock' && (
                      <div className="space-y-2.5 animate-fade-in">
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                          Toggle stock quantity tracking limits for all rows.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setQuickStockType(true)}
                            className={`p-2.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all ${
                              quickStockType
                                ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400'
                                : 'bg-slate-50 dark:bg-[#12161f] border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Limited Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickStockType(false)}
                            className={`p-2.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all ${
                              !quickStockType
                                ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400'
                                : 'bg-slate-50 dark:bg-[#12161f] border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Unlimited Stock
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyQuickStockType}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          Set Stock Limits for All Rows
                        </button>
                      </div>
                    )}

                    {/* Tab 3: Catalog Visibility */}
                    {batchTab === 'visibility' && (
                      <div className="space-y-2.5 animate-fade-in">
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                          Set catalog visibility status for all rows at once.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setQuickVisibility('Active')}
                            className={`p-2.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all ${
                              quickVisibility === 'Active'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-emerald-400'
                                : 'bg-slate-50 dark:bg-[#12161f] border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Visible (Active)
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickVisibility('Inactive')}
                            className={`p-2.5 rounded-xl border text-center font-bold text-xs cursor-pointer transition-all ${
                              quickVisibility === 'Inactive'
                                ? 'bg-slate-200 text-slate-800 border-slate-400 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-200'
                                : 'bg-slate-50 dark:bg-[#12161f] border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Hidden (Inactive)
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyQuickVisibility}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                          Set Visibility for All Rows
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Horizontal Scroll Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 py-0.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'edited', label: `Edited (${modifiedCount})` },
                  { id: 'limited', label: 'Limited' },
                  { id: 'unlimited', label: 'Unlimited' },
                  { id: 'visible', label: 'Visible' },
                  { id: 'hidden', label: 'Hidden' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                    activeFilter === f.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#151922] border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* DESKTOP SPREADSHEET TABLE (md and above) */}
          <div className="hidden md:flex flex-col flex-1 border border-(--border-color) rounded-2xl overflow-hidden bg-white dark:bg-[#141820] min-h-0 shadow-xs">
            <div className="flex-1 overflow-auto no-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#1a1f2c] border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-14 text-center">
                      Status
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-14 text-center">
                      Image
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-28">
                      Barcode ID
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300">
                      Product Name *
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-blue-700 dark:text-blue-400 w-28 text-right">
                      Price *
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-32">
                      Stock Type
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-28 text-center">
                      Quantity
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-28 text-center">
                      Low Alert
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-28 text-center">
                      Visibility
                    </th>
                    <th className="py-3 px-3 uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 w-14 text-center">
                      Reset
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {displayedProducts.map((p) => {
                    const modified = isRowModified(p);
                    return (
                      <BulkEditRow
                        key={p.id}
                        p={p}
                        modified={modified}
                        rowUploadingId={rowUploadingId}
                        onRowImageUpload={handleRowImageUpload}
                        setEditedProducts={setEditedProducts}
                        handleResetRow={handleResetRow}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE CARDS VIEW (below md) */}
          <div className="md:hidden flex-1 overflow-y-auto no-scrollbar space-y-3 pb-4">
            {displayedProducts.map((p) => {
              const modified = isRowModified(p);
              return (
                <BulkEditCard
                  key={p.id}
                  p={p}
                  modified={modified}
                  rowUploadingId={rowUploadingId}
                  onRowImageUpload={handleRowImageUpload}
                  setEditedProducts={setEditedProducts}
                  handleResetRow={handleResetRow}
                />
              );
            })}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-(--border-color) flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 bg-slate-50 dark:bg-[#12161f]">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-xs uppercase font-bold tracking-wider">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              {editedProducts.length} items total • {modifiedCount} modified
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleResetAll}
              disabled={modifiedCount === 0}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-[#1a1f2c] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Reset All
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-[#1a1f2c] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || modifiedCount === 0}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:pointer-events-none text-xs font-extrabold uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Changes ({modifiedCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
