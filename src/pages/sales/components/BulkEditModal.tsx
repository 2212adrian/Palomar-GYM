// src/pages/sales/components/BulkEditModal.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
          ? 'bg-blue-500/5 dark:bg-blue-500/5 border-l-2 border-blue-500'
          : 'hover:bg-slate-100/30 dark:hover:bg-neutral-900/10'
      }`}
    >
      <td className="py-2.5 px-4 align-middle text-center">
        {modified ? (
          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 font-extrabold text-[8px] uppercase tracking-wider animate-pulse">
            Edited
          </span>
        ) : (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        )}
      </td>

      <td className="py-2.5 px-4 align-middle text-center">
        <div
          onClick={() => rowUploadingId !== p.id && fileRef.current?.click()}
          className="relative w-9 h-9 rounded-xl border border-(--border-color) bg-(--bg-page) flex items-center justify-center overflow-hidden cursor-pointer transition-opacity hover:opacity-85 mx-auto"
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
            <ImageIcon className="w-4 h-4 text-slate-500" />
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

      <td className="py-2.5 px-4 align-middle font-mono font-bold text-slate-500 dark:text-slate-455">
        {p.barcode_id}
      </td>

      <td className="py-2.5 px-4 align-middle">
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
          className="w-full px-3 py-1.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-medium"
        />
      </td>

      <td className="py-2.5 px-4 align-middle">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-semibold font-mono">
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
            className="w-full pl-6 pr-2 py-1.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-semibold font-mono"
          />
        </div>
      </td>

      <td className="py-2.5 px-4 align-middle">
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
          className="w-full px-3 py-1.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-bold"
        >
          <option value="Unlimited">Unlimited</option>
          <option value="Limited">Limited</option>
        </select>
      </td>

      <td className="py-2.5 px-4 align-middle">
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
            className="w-full px-3 py-1.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-bold font-mono"
          />
        ) : (
          <span className="text-[10px] font-bold text-slate-455 tracking-wider uppercase ml-1 block select-none">
            Unlimited
          </span>
        )}
      </td>

      <td className="py-2.5 px-4 align-middle">
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
            className="w-full px-3 py-1.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-bold font-mono"
          />
        ) : (
          <span className="text-[10px] font-bold text-slate-455 tracking-wider uppercase ml-1 block select-none">
            Disabled
          </span>
        )}
      </td>

      <td className="py-2.5 px-4 align-middle text-center">
        <button
          type="button"
          onClick={() => {
            const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
            setEditedProducts((prev) =>
              prev.map((item) =>
                item.id === p.id ? { ...item, status: nextStatus } : item
              )
            );
          }}
          className={`p-1.5 border rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center ${
            p.status === 'Active'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20'
          }`}
        >
          {p.status === 'Active' ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>
      </td>

      <td className="py-2.5 px-4 align-middle text-center">
        <button
          type="button"
          onClick={() => handleResetRow(p.id)}
          disabled={!modified}
          className="p-1.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer inline-flex items-center justify-center"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
};

// 2. MOBILE VIEW COMPONENT: Highly polished, fully aligned, vertical form cards
const BulkEditCard: React.FC<BulkEditRowProps> = ({
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
      className={`p-4 border rounded-2xl flex flex-col gap-4 transition-all duration-150 text-left bg-[var(--bg-card)] shrink-0 ${
        modified
          ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/5 shadow-xs'
          : 'border-(--border-color)'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {modified ? (
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 font-extrabold text-[8px] uppercase tracking-wider animate-pulse">
              Edited
            </span>
          ) : (
            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[8px] uppercase tracking-wider">
              Unchanged
            </span>
          )}
          <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-xs">
            {p.barcode_id}
          </span>
        </div>

        <div
          onClick={() => rowUploadingId !== p.id && fileRef.current?.click()}
          className="relative w-10 h-10 rounded-xl border border-(--border-color) bg-(--bg-page) flex items-center justify-center overflow-hidden cursor-pointer"
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
            <ImageIcon className="w-4 h-4 text-slate-500" />
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
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Product Name *
        </label>
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
          className="w-full px-3 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-medium"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Price *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold font-mono">
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
              className="w-full pl-6 pr-2 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-semibold font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Cashier Show
          </label>
          <button
            type="button"
            onClick={() => {
              const nextStatus = p.status === 'Active' ? 'Inactive' : 'Active';
              setEditedProducts((prev) =>
                prev.map((item) =>
                  item.id === p.id ? { ...item, status: nextStatus } : item
                )
              );
            }}
            className={`w-full py-2 border rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
              p.status === 'Active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
            }`}
          >
            {p.status === 'Active' ? (
              <>
                <Eye className="w-3.5 h-3.5 animate-pulse" />
                <span>Visible</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hidden</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Stock Type
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
          className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-bold"
        >
          <option value="Unlimited">Unlimited</option>
          <option value="Limited">Limited</option>
        </select>
      </div>

      {p.has_stock_limit && (
        <div className="grid grid-cols-2 gap-3 animate-slide-up">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
              className="w-full px-3 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-bold font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Low Warn Mark
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
              className="w-full px-3 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-bold font-mono"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={() => handleResetRow(p.id)}
          disabled={!modified}
          className="px-3 py-1.5 rounded-xl border border-(--border-color) bg-(--bg-page) text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>Reset Item</span>
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
    'all' | 'edited' | 'visible' | 'hidden'
  >('all');
  const [saving, setSaving] = useState(false);
  const [rowUploadingId, setRowUploadingId] = useState<string | null>(null);

  const [quickVisibility, setQuickVisibility] = useState<'Active' | 'Inactive'>(
    'Active'
  );
  const [quickStockType, setQuickHasStockLimit] = useState(false);

  const [priceAdjType, setPriceAdjType] = useState<
    'pct_inc' | 'pct_dec' | 'flat_inc' | 'flat_dec' | 'fixed'
  >('pct_inc');
  const [priceAdjValue, setPriceAdjValue] = useState('');

  const isRowModified = (current: EditState) => {
    const original = originalMap.get(current.id);
    if (!original) return false;

    const originalAlert = original.low_stock_alert?.toString() || '';
    return (
      current.product_name !== original.product_name ||
      parseFloat(current.selling_price) !== original.selling_price ||
      current.has_stock_limit !== original.has_stock_limit ||
      (current.has_stock_limit &&
        parseInt(current.stock_quantity) !== original.stock_quantity) ||
      (current.has_stock_limit && current.low_stock_alert !== originalAlert) ||
      current.status !== original.status ||
      current.image_url !== original.image_url
    );
  };

  const modifiedCount = useMemo(() => {
    return editedProducts.filter(isRowModified).length;
  }, [editedProducts]);

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
  };

  const handleApplyQuickVisibility = () => {
    setEditedProducts((prev) =>
      prev.map((p) => ({ ...p, status: quickVisibility }))
    );
    toast.info(
      `Updated visibility status to ${quickVisibility === 'Active' ? 'Visible' : 'Hidden'} for all rows.`
    );
  };

  const handleApplyQuickStockType = () => {
    setEditedProducts((prev) =>
      prev.map((p) => ({ ...p, has_stock_limit: quickStockType }))
    );
    toast.info(
      `Updated stock tracking parameter to ${quickStockType ? 'Limited' : 'Unlimited'} for all rows.`
    );
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

    toast.info('Applied price adjustments to selected items.');
    setPriceAdjValue('');
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
      toast.error('Could not upload row cover image.');
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
      if (activeFilter === 'visible') return p.status === 'Active';
      if (activeFilter === 'hidden') return p.status === 'Inactive';
      return true;
    });
  }, [editedProducts, searchQuery, activeFilter]);

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
            return `Product "${p.product_name}" alert mark cannot be negative.`;
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
            changes.push(
              `Name: "${original.product_name}" -> "${p.product_name.trim()}"`
            );
          }

          const priceNum = parseFloat(p.selling_price);
          if (priceNum !== original.selling_price) {
            changes.push(
              `Price: ₱${original.selling_price.toFixed(2)} -> ₱${priceNum.toFixed(2)}`
            );
          }

          if (p.status !== original.status) {
            changes.push(`Visibility: ${original.status} -> ${p.status}`);
          }

          if (p.has_stock_limit !== original.has_stock_limit) {
            changes.push(
              `Stock Type: ${original.has_stock_limit ? 'Limited' : 'Unlimited'} -> ${p.has_stock_limit ? 'Limited' : 'Unlimited'}`
            );
          } else if (p.has_stock_limit) {
            const qtyNum = parseInt(p.stock_quantity) || 0;
            if (qtyNum !== original.stock_quantity) {
              changes.push(
                `Stock Count: ${original.stock_quantity} -> ${qtyNum}`
              );
            }
            const lowAlertOriginal = original.low_stock_alert?.toString() || '';
            if (p.low_stock_alert !== lowAlertOriginal) {
              changes.push(
                `Low Alert Warning: ${lowAlertOriginal || 'None'} -> ${p.low_stock_alert || 'None'}`
              );
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
          stock_quantity: p.has_stock_limit
            ? parseInt(p.stock_quantity) || 0
            : 0,
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

      toast.success(`Successfully saved ${modifiedItems.length} products.`);

      try {
        await logAudit(
          'BULK_PRODUCTS_UPDATED',
          `Updated ${modifiedItems.length} products via spreadsheet editor: ${auditDetails}`
        );
      } catch (auditError) {
        console.warn('Background audit logging failed silently:', auditError);
      }

      onSaveSuccess();
      onClose();
    } catch {
      toast.error('Bulk editor save transaction failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Uses React Portals to guarantee this modal mounts at the body root (z-index safe)
  return createPortal(
    <div className="fixed inset-0 z-[16000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in text-xs text-(--color-text)">
      <div className="bg-(--bg-card) border border-(--border-color) rounded-3xl w-[95vw] max-w-[1400px] h-[92vh] max-h-[95vh] shadow-2xl flex flex-col overflow-hidden animate-scale-up">
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-(--border-color) flex items-center justify-between shrink-0 bg-[var(--bg-card)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
              <SlidersHorizontal className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-heading tracking-widest uppercase">
                Spreadsheet Bulk Editor
              </h2>
              <span className="text-[10px] text-slate-455 font-bold block mt-0.5">
                Quickly edit name, price, stock limits, and display settings for
                selected items.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-100/5 hover:bg-slate-100/10 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer border border-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL CONTENT WORKSPACE */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col min-h-0 bg-(--bg-page)">
          {/* TOP TOOLBAR */}
          <div className="hidden xl:grid grid-cols-1 xl:grid-cols-12 gap-4 shrink-0 bg-(--bg-card) border border-(--border-color) p-4 rounded-2xl shadow-sm">
            <div className="xl:col-span-4 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items by name or scan code..."
                  className="w-full pl-9 pr-3 py-2 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 transition-all font-medium"
                />
              </div>

              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {(['all', 'edited', 'visible', 'hidden'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer bg-slate-100 dark:bg-[#1e232d] text-slate-400 dark:text-slate-455 hover:bg-slate-200"
                  >
                    {f === 'all'
                      ? 'All Selected'
                      : f === 'edited'
                        ? 'Edited Only'
                        : f === 'visible'
                          ? 'Visible'
                          : 'Hidden'}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="xl:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 border-t xl:border-t-0 xl:border-l border-(--border-color) pt-4 xl:pt-0 xl:pl-4">
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Set Visibility
                </span>
                <div className="flex gap-1.5">
                  <select
                    value={quickVisibility}
                    onChange={(e) => setQuickVisibility(e.target.value as any)}
                    className="flex-1 px-3 py-1.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-semibold"
                  >
                    <option value="Active">Visible</option>
                    <option value="Inactive">Hidden</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyQuickVisibility}
                    className="p-2 bg-blue-500 hover:bg-blue-600 rounded-xl text-white cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Set Stock limits
                </span>
                <div className="flex gap-1.5">
                  <select
                    value={quickStockType ? 'Limited' : 'Unlimited'}
                    onChange={(e) =>
                      setQuickHasStockLimit(e.target.value === 'Limited')
                    }
                    className="flex-1 px-3 py-1.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) outline-none cursor-pointer font-semibold"
                  >
                    <option value="Unlimited">Unlimited</option>
                    <option value="Limited">Limited</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyQuickStockType}
                    className="p-2 bg-blue-500 hover:bg-blue-600 rounded-xl text-white cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Batch Price Adjuster
                </span>
                <div className="flex gap-1">
                  <select
                    value={priceAdjType}
                    onChange={(e) => setPriceAdjType(e.target.value as any)}
                    className="px-2 py-1.5 bg-(--bg-page) border border-(--border-color) rounded-xl text-[10px] text-(--color-text) outline-none cursor-pointer font-bold w-24 shrink-0"
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
                    placeholder="Value"
                    value={priceAdjValue}
                    onChange={(e) => setPriceAdjValue(e.target.value)}
                    className="flex-1 min-w-[50px] px-2 py-1.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 font-semibold font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPriceAdjustment}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1 shrink-0"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE/TABLET VIEW */}
          <div className="md:hidden flex flex-col gap-4 overflow-y-auto no-scrollbar pb-[100px] flex-1">
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

          {/* DESKTOP VIEW */}
          <div className="hidden md:flex flex-col flex-1 border border-(--border-color) rounded-2xl overflow-hidden bg-(--bg-card) min-h-0">
            <div className="flex-1 overflow-auto no-scrollbar">
              <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
                <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#13161a] border-b border-(--border-color)">
                  <tr>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-16 text-center">
                      Status
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-14 text-center">
                      Image
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-28">
                      Barcode ID
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider">
                      Product Name *
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-32">
                      Price *
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-36">
                      Stock Type
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-32">
                      Quantity
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-32">
                      Low Alert
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-24 text-center">
                      Cashier
                    </th>
                    <th className="py-3 px-4 text-slate-400 uppercase font-bold tracking-wider w-16 text-center">
                      Reset
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-(--border-color)">
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
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-(--border-color) flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 bg-[var(--bg-card)]">
          <div className="flex items-center gap-1.5 justify-center md:justify-start w-full md:w-auto">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-[10px] text-slate-500 dark:text-slate-405 font-semibold uppercase tracking-wider">
              {editedProducts.length} Selected • {modifiedCount} Changed
            </span>
          </div>

          <div className="grid grid-cols-2 md:flex md:items-center gap-2.5 w-full md:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-(--border-color) text-slate-500 dark:text-slate-400 bg-(--bg-card) hover:opacity-90 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              disabled={modifiedCount === 0}
              className="px-4 py-2.5 border border-slate-200 dark:border-white/10 text-slate-500 bg-slate-200/5 hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer text-center"
            >
              Reset All
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || modifiedCount === 0}
              className="col-span-2 md:col-span-1 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:pointer-events-none text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 font-bold text-center"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
