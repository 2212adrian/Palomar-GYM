import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { Modal } from '../../../components/ui/Modal';
import { Table } from '../../../components/ui/Table';
import type { Column } from '../../../components/ui/Table';
import { RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface DeletedProduct {
  id: string;
  barcode_id: string;
  product_name: string;
  image_url: string | null;
  selling_price: number;
  deleted_at: string;
}

interface ProductRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const ProductRecoveryModal: React.FC<ProductRecoveryModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess
}) => {
  const [deletedItems, setDeletedItems] = useState<DeletedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRestoring, setBulkRestoring] = useState(false);

  const fetchDeletedProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, barcode_id, product_name, image_url, selling_price, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setDeletedItems(data || []);
    } catch {
      console.warn('INTERNET_ERR: Could not fetch deleted products. Please check connection.')
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDeletedProducts();
      setSelectedIds([]);
    }
  }, [isOpen]);

  const handleRestore = async (item: DeletedProduct) => {
    try {
      setRestoringId(item.id);
      
      const { error } = await supabase
        .from('products')
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success(`"${item.product_name}" restored successfully.`);
      
      // Meticulous three-parameter audit log tracking standard
      await logAudit(
        'PRODUCT_RESTORED',
        `Restored product catalog entry "${item.product_name}" from recycle bin.`,
        item.id
      );

      setDeletedItems(prev => prev.filter(p => p.id !== item.id));
      setSelectedIds(prev => prev.filter(id => id !== item.id));
      onRestoreSuccess();
    } catch {
      toast.error('Failed to restore item.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return;

    const targets = deletedItems.filter(p => selectedIds.includes(p.id));

    try {
      setBulkRestoring(true);
      
      const { error } = await supabase
        .from('products')
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_at: new Date().toISOString()
        })
        .in('id', selectedIds);

      if (error) throw error;

      toast.success(`Successfully restored ${selectedIds.length} items.`);

      // Log audits with exact targetId trace references inside the batch loop
      for (const item of targets) {
        await logAudit(
          'PRODUCT_RESTORED',
          `Restored product catalog entry "${item.product_name}" from recycle bin.`,
          item.id
        );
      }

      setDeletedItems(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
      onRestoreSuccess();
    } catch {
      toast.error('Failed to perform bulk restoration.');
    } finally {
      setBulkRestoring(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === deletedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(deletedItems.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const columns: Column<DeletedProduct>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={deletedItems.length > 0 && selectedIds.length === deletedItems.length}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelectAll();
          }}
          className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
          title="Toggle Select All"
        />
      ),
      headerClassName: 'w-12 text-center',
      cellClassName: 'text-center p-0',
      render: (item) => (
        <label 
          className="flex items-center justify-center w-full h-11 py-2 cursor-pointer transition-colors hover:bg-slate-500/5 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(item.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelect(item.id);
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-110"
          />
        </label>
      )
    },
    {
      key: 'product_name',
      header: 'Product Name',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1 text-left">
          {item.image_url ? (
            <img 
              src={item.image_url} 
              alt={item.product_name} 
              className="w-10 h-10 rounded-xl object-cover border border-(--border-color) shrink-0 grayscale opacity-70" 
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-bold text-xs shadow-inner shrink-0">
              {item.product_name[0]}
            </div>
          )}
          <div className="min-w-0">
            <span className="font-semibold block truncate text-xs text-slate-900 dark:text-white">{item.product_name}</span>
            <span className="font-mono font-bold text-emerald-500 text-[10px]">₱{Number(item.selling_price).toFixed(2)}</span>
          </div>
        </div>
      )
    },
    {
      key: 'barcode_id',
      header: 'Barcode',
      sortable: true,
      render: (item) => (
        <span className="px-2.5 py-1 rounded-lg bg-(--bg-page) text-xs font-mono font-bold border border-(--border-color) text-(--color-text) opacity-90 tracking-wider">
          {item.barcode_id}
        </span>
      )
    },
    {
      key: 'deleted_at',
      header: 'Deleted At',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
          {new Date(item.deleted_at).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right justify-end',
      cellClassName: 'text-right py-1',
      render: (item) => (
        <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleRestore(item)}
            disabled={restoringId === item.id}
            className="flex items-center justify-center h-8 px-3 gap-1.5 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-white rounded-lg transition-all duration-200 cursor-pointer font-bold border border-amber-500/20 hover:scale-105 disabled:opacity-50"
            title="Restore Item"
          >
            {restoringId === item.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] font-heading tracking-wider uppercase">Restore</span>
          </button>
        </div>
      )
    }
  ];

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Recycle Bin"
      className="max-w-4xl text-left p-8"
    >
      <div className="space-y-4 font-body text-xs text-(--color-text)">
        <p className="text-slate-400 dark:text-slate-400 leading-relaxed text-left">
          The following products were soft-deleted from your catalog. Restoring them returns them immediately to active sales views. Items here are permanently purged after 30 days.
        </p>

        {/* Bulk Action Pin */}
        {selectedIds.length > 0 && (
          <div className="p-3 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between animate-fade-in text-left">
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              Selected {selectedIds.length} item(s) for recovery
            </span>
            <button
              onClick={handleBulkRestore}
              disabled={bulkRestoring}
              className="px-3 py-1.5 bg-(--color-primary) text-white hover:bg-(--color-primary-hover) rounded-lg font-heading tracking-wider uppercase text-[9px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {bulkRestoring ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              Restore Selection
            </button>
          </div>
        )}

        {/* Structured table wrapper for a clean layout */}
        <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto w-full">
          <Table<DeletedProduct>
            data={deletedItems}
            columns={columns}
            searchKeys={['product_name', 'barcode_id']}
            searchPlaceholder="Search deleted products by name or code..."
            itemsPerPage={5}
            loading={loading}
            onRowClick={(item) => toggleSelect(item.id)}
            getRowClassName={(item) => 
              selectedIds.includes(item.id) 
                ? 'bg-blue-500/10 dark:bg-blue-500/5 border-l-2 border-blue-500' 
                : ''
            }
          />
        </div>

        {/* Modal Close Action */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-(--border-color) bg-(--bg-card) hover:bg-slate-500/5 text-slate-500 dark:text-slate-400 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
          >
            Close Bin
          </button>
        </div>
      </div>
    </Modal>
  );
};