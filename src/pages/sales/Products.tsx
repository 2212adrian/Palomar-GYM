//src/pages/sales/Products.tsx
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal'; 
import { compressImage } from '../../lib/imageCompressor';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';
import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';

// Component imports
import { BarcodeComponent } from './components/BarcodeComponent';
import { ProductBulkActions } from './components/ProductBulkActions';
import { ProductFormModal } from './components/ProductFormModal';

// Redesigned Spreadsheet Bulk Editor import
import { BulkEditModal } from './components/BulkEditModal';

// Barcode Printing Module imports
import { BarcodePrintModal } from './components/barcode/BarcodePrintModal';
import type { PrintableItem } from './utils/barcodePdfHelper';

// Product Restoration Recovery Bin import
import { ProductRecoveryModal } from './components/ProductRecoveryModal';

// Shared Layout Header Context
import { HeaderActionsContext } from '../../routes';

import { 
  Plus, Pencil, Trash2, Layers, Package, PackageX, AlertTriangle, Search, X, Printer, Loader2, RotateCcw
} from 'lucide-react';

interface Product {
  id: string;
  barcode_id: string;
  product_name: string;
  image_url: string | null;
  selling_price: number;
  has_stock_limit: boolean;
  stock_quantity: number;
  low_stock_alert: number | null;
  status: 'Active' | 'Inactive';
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  
  // Clean, consolidated manufacturer database tracking
  manufacturer_barcode?: string | null;
  manufacturer_source?: string;
}

const menuContainerVariants: Variants = {
  hidden: { 
    opacity: 0,
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1
    }
  },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.02
    }
  }
};

const menuItemVariants: Variants = {
  hidden: { 
    opacity: 0, 
    y: 16, 
    scale: 0.88,
    filter: 'blur(3px)'
  },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    filter: 'blur(0px)',
    transition: { 
      type: 'spring' as const,
      stiffness: 260, 
      damping: 20 
    } 
  }
};


export const Products: React.FC = () => {
  const { user } = useAuthStore() as any;
  const itemsPerPage = useResponsiveItemsPerPage();
  const isMountedRef = useRef(true);
   useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isAdmin = 
    user?.app_metadata?.role === 'Admin' || 
    user?.app_metadata?.role === 'admin' || 
    user?.user_metadata?.role === 'Admin' || 
    user?.user_metadata?.role === 'admin' || 
    isSuperAdmin(user?.email);

  // Core Listings States
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  
  // Navigation & Modals Toggle States
  const [showFormModal, setShowFormModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false); 
  const [showBulkEditModal, setShowBulkEditModal] = useState(false); 
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false); 
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Selection States for Bulk actions
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Mobile Expandable Floating Action Button Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Form States (Single Edit)
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formHasStockLimit, setFormHasStockLimit] = useState(false);
  const [formStockQuantity, setFormStockQuantity] = useState('0');
  const [formLowStockAlert, setFormLowStockAlert] = useState('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [formImageUrl, setFormImageUrl] = useState('');

  // Minimal background tracker states
  const [formManufacturerBarcode, setFormManufacturerBarcode] = useState('');
  const [formManufacturerSource, setFormManufacturerSource] = useState('manual');

  const { setActions } = useContext(HeaderActionsContext);
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name', { ascending: true });

      if (error) throw error;
      if (isMountedRef.current) {
        setProducts(data || []);
      }
      setProducts(data || []);
    } catch {
      if (isMountedRef.current) {
        console.warn('INTERNET_ERR: Could not load your product items. Please Check your Connection.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel('inventory_realtime_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            setProducts((prev) => {
              if (prev.some((p) => p.id === newRecord.id)) return prev;
              return [...prev, newRecord as Product].sort((a, b) => a.product_name.localeCompare(b.product_name));
            });
          } else if (eventType === 'UPDATE') {
            const updated = newRecord as Product;
            
            if (updated.deleted_at) {
              setProducts((prev) => prev.filter((p) => p.id !== updated.id));
              setSelectedProductIds((prev) => prev.filter((id) => id !== updated.id));
            } else {
              setProducts((prev) => {
                const updatedList = prev.some(p => p.id === updated.id)
                  ? prev.map((p) => (p.id === updated.id ? updated : p))
                  : [...prev, updated];
                return updatedList.sort((a, b) => a.product_name.localeCompare(b.product_name));
              });
            }
          } else if (eventType === 'DELETE') {
            const targetId = oldRecord.id;
            setProducts((prev) => prev.filter((p) => p.id !== targetId));
            setSelectedProductIds((prev) => prev.filter((id) => id !== targetId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

 const location = useLocation();
  // Dynamically push the header action buttons to the unified layout container
  useEffect(() => {
    const updateHeaderActions = () => {
      // Only show the header actions if the user is an admin and NO rows are selected
      if (isAdmin && selectedProductIds.length === 0) {
        setActions(
          <>
            <button
              onClick={() => setShowRecoveryModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-[#161920] hover:bg-slate-200 dark:hover:bg-[#1e232d] text-(--color-text) border border-(--border-color) text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer"
              title="View and restore soft-deleted products"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
              <span>Recycle Bin</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1e232d] hover:bg-slate-800 text-white border border-white/5 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer"
              title="Quickly generate printable sheet labels"
            >
              <Printer className="w-3.5 h-3.5 text-blue-500" />
              <span>Print Sheet Labels</span>
            </button>

            <button
              onClick={handleCreateClick}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Item
            </button>
          </>
        );
      } else {
        // Clear actions if rows are selected or user is not authorized
        setActions(null);
      }
    };

    // Defer action registration until the parent layout mounts completely
    const timer = setTimeout(updateHeaderActions, 0);

    // Safely cleanup header slots on component unmount
    return () => {
      clearTimeout(timer);
      setActions(null);
    };
  }, [isAdmin, selectedProductIds.length, location.pathname, setActions]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error('Selected file exceeds maximum limit of 8MB.');
      return;
    }

    try {
      setUploading(true);
      const compressedFile = await compressImage(file, 10 * 1024);
      const fileExt = 'jpg';
      const fileName = `products/${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedFile, { 
          contentType: 'image/jpeg', 
          cacheControl: '3600', 
          upsert: true 
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      
      setFormImageUrl(urlData.publicUrl);
      toast.success(`Image processed successfully.`);
    } catch {
      toast.error('Image upload failed.');
    } finally {
      setUploading(false);
    }
  };
  

  const handleCreateClick = () => {
    setIsEditing(false);
    setSelectedProductId(null);
    setFormName('');
    setFormPrice('');
    setFormHasStockLimit(false);
    setFormStockQuantity('0');
    setFormLowStockAlert('');
    setFormStatus('Active');
    setFormImageUrl('');
    setShowAdvanced(false);

    // Reset Open Food Facts fields
    setFormManufacturerBarcode('');
    setFormManufacturerSource('manual');

    setShowFormModal(true);
  };

  const handleEditClick = (product: Product) => {
    setIsEditing(true);
    setSelectedProductId(product.id);
    setFormName(product.product_name);
    setFormPrice(product.selling_price.toString());
    setFormHasStockLimit(product.has_stock_limit);
    setFormStockQuantity(product.stock_quantity.toString());
    setFormLowStockAlert(product.low_stock_alert?.toString() || '');
    setFormStatus(product.status);
    setFormImageUrl(product.image_url || '');
    setShowAdvanced(false);

    // Populate Open Food Facts fields
    setFormManufacturerBarcode(product.manufacturer_barcode || '');
    setFormManufacturerSource(product.manufacturer_source || 'manual');

    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameClean = formName.trim();
    const priceNum = parseFloat(formPrice);

    if (!nameClean || nameClean.length > 100) {
      toast.error('Product name is required.');
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Please enter a valid price.');
      return;
    }

    const stockQty = formHasStockLimit ? parseInt(formStockQuantity) : 0;
    const alertQty = (formHasStockLimit && formLowStockAlert.trim() !== '') ? parseInt(formLowStockAlert) : null;

    try {
      setSaving(true);
      const productPayload = {
        product_name: nameClean,
        selling_price: priceNum,
        has_stock_limit: formHasStockLimit,
        stock_quantity: stockQty,
        low_stock_alert: alertQty,
        status: formStatus,
        image_url: formImageUrl.trim() || null,

        // Only save required columns to db
        manufacturer_barcode: formManufacturerBarcode.trim() || null,
        manufacturer_source: formManufacturerSource,

        updated_at: new Date().toISOString()
      };

      if (isEditing && selectedProductId) {
        const { error } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', selectedProductId);

        if (error) throw error;
        toast.success('Product updated.');

        try {
          await logAudit(
            'PRODUCT_UPDATED',
            `Updated product parameters for "${nameClean}".`,
            selectedProductId
          );
        } catch (auditError) {
          console.warn('Background audit logging failed silently:', auditError);
        }
        
        setSelectedProductIds(prev => prev.filter(id => id !== selectedProductId));
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(productPayload)
          .select()
          .single();

        if (error) throw error;
        toast.success('New product listed.');

        await logAudit(
          'PRODUCT_CREATED',
          `Created new product catalog entry "${nameClean}" priced at ₱${priceNum.toFixed(2)}.`,
          data?.id
        );
      }

      setShowFormModal(false);
      fetchProducts();
    } catch {
      toast.error('Failed to save parameters.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const targetProduct = products.find(p => p.id === id);

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Product removed.');

      await logAudit(
        'PRODUCT_DELETED',
        `Deleted product "${targetProduct?.product_name || 'Unknown Item'}" from catalog.`,
        id
      );

      setDeleteConfirmId(null);
      fetchProducts();
    } catch {
      toast.error('Action denied.');
    }
  };

  const handleBulkEditClick = () => {
    setShowBulkEditModal(true);
  };

  const handleSaveBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;

    const targetTitles = products
      .filter(p => selectedProductIds.includes(p.id))
      .map(p => p.product_name)
      .join(', ');

    try {
      setSaving(true);
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', selectedProductIds);

      if (error) throw error;

      toast.success(`Permanently deleted ${selectedProductIds.length} items.`);

      await logAudit(
        'BULK_PRODUCTS_DELETED',
        `Permanently deleted ${selectedProductIds.length} products: "${targetTitles}".`
      );
      setShowBulkDeleteModal(false);
      setSelectedProductIds([]);
      fetchProducts();
    } catch {
      toast.error('Failed to perform bulk deletion.');
    } finally {
      setSaving(false);
    }
  };

  const stats = {
    total: products.length,
    active: products.filter(p => p.status === 'Active').length,
    outOfStock: products.filter(p => p.has_stock_limit && p.stock_quantity === 0).length,
    lowStock: products.filter(p => p.has_stock_limit && p.low_stock_alert !== null && p.stock_quantity <= p.low_stock_alert && p.stock_quantity > 0).length
  };

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = query === '' || 
      p.product_name.toLowerCase().includes(query) ||
      p.barcode_id.toLowerCase().includes(query) ||
      (p.manufacturer_barcode && p.manufacturer_barcode.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (selectedStatusFilter === 'all') return true;
    if (selectedStatusFilter === 'active') return p.status === 'Active';
    if (selectedStatusFilter === 'inactive') return p.status === 'Inactive';
    if (selectedStatusFilter === 'low_stock') {
      return p.has_stock_limit && p.low_stock_alert !== null && p.stock_quantity <= p.low_stock_alert;
    }
    if (selectedStatusFilter === 'unlimited') return !p.has_stock_limit;
    return true;
  });

  const getRowStyle = (product: Product) => {
    const isSelected = selectedProductIds.includes(product.id);
    const isHidden = product.status === 'Inactive';

    if (isSelected) {
      return 'bg-blue-500/10 hover:bg-blue-500/15 border-l-2 border-blue-500 transition-colors duration-150';
    }
    if (isHidden) {
      return 'bg-slate-200/50 dark:bg-neutral-900/40 opacity-60 text-slate-455 dark:text-slate-500 transition-colors duration-150';
    }
    return '';
  };

  const handleRowClick = (product: Product) => {
    setSelectedProductIds(prev =>
      prev.includes(product.id)
        ? prev.filter(id => id !== product.id)
        : [...prev, product.id]
    );
  };

  const isSelectionActive = selectedProductIds.length > 0;

  const columns: Column<Product>[] = [
    {
      key: 'select',
      header: isSelectionActive ? (
        <div className="flex items-center justify-center h-full w-full py-1">
          <input
            type="checkbox"
            checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.includes(p.id))}
            onChange={(e) => {
              if (e.target.checked) {
                const currentIds = filteredProducts.map(p => p.id);
                setSelectedProductIds(prev => Array.from(new Set([...prev, ...currentIds])));
              } else {
                const currentIds = filteredProducts.map(p => p.id);
                setSelectedProductIds(prev => prev.filter(id => !currentIds.includes(id)));
              }
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
            title="Toggle Select All"
          />
        </div>
      ) : null, 
      headerClassName: 'w-12 text-center',
      cellClassName: 'text-center p-0', 
      render: (item) => isSelectionActive ? ( 
        <label className="flex items-center justify-center w-full h-11 py-2 cursor-pointer transition-colors hover:bg-slate-500/5 select-none" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedProductIds.includes(item.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedProductIds(prev => [...prev, item.id]);
              } else {
                setSelectedProductIds(prev => prev.filter(id => id !== item.id));
              }
            }}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-(--color-primary) transition-transform duration-150 hover:scale-110"
          />
        </label>
      ) : null
    },
    {
      key: 'barcode_id',
      header: 'Scan / Barcode',
      sortable: true,
      render: (item) => (
        <div className="relative group/tooltip inline-block">
          <span className="px-2.5 py-1 rounded-lg bg-(--bg-page) text-xs font-mono font-bold border border-(--border-color) text-(--color-text) opacity-90 block cursor-help tracking-wider active:scale-95 transition-transform select-none">
            {item.barcode_id}
          </span>
          {item.manufacturer_barcode && (
            <span className="mt-1 text-[9px] text-slate-500 dark:text-slate-400 font-mono block">
              MFG: {item.manufacturer_barcode}
            </span>
          )}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block z-50 bg-white p-2 rounded-xl border border-slate-200 shadow-xl pointer-events-none scale-95 animate-scale-up">
            <BarcodeComponent value={item.barcode_id} />
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white" />
          </div>
        </div>
      )
    },
    {
      key: 'product_name',
      header: 'Product Name',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1">
          {item.image_url ? (
            <img 
              src={item.image_url} 
              alt={item.product_name} 
              className={`w-12 h-12 rounded-xl object-cover border border-(--border-color) shrink-0 ${item.status === 'Inactive' ? 'grayscale opacity-75' : ''}`} 
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-bold text-lg shadow-inner shrink-0">
              {item.product_name[0]}
            </div>
          )}
          <span className="font-semibold tracking-wide block text-sm">{item.product_name}</span>
        </div>
      )
    },
    {
      key: 'selling_price',
      header: 'Price',
      sortable: true,
      render: (item) => (
        <span className="font-mono font-bold text-xs opacity-90">
          ₱{Number(item.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'stock_quantity',
      header: 'Inventory Stock',
      sortable: true,
      sortValue: (item) => item.has_stock_limit ? item.stock_quantity : 999999,
      render: (item) => {
        if (!item.has_stock_limit) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-[10px] text-blue-400 border border-blue-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              UNLIMITED
            </span>
          );
        }
        const isOut = item.stock_quantity === 0;
        const isLow = item.low_stock_alert !== null && item.stock_quantity <= item.low_stock_alert;
        if (isOut) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-[10px] text-red-500 border border-red-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              NO STOCK
            </span>
          );
        }
        if (isLow) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-[10px] text-amber-500 border border-amber-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              LOW ({item.stock_quantity})
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[10px] text-emerald-500 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {item.stock_quantity} UNITS
          </span>
        );
      }
    },
    {
      key: 'status',
      header: 'Show in Cashier',
      sortable: true,
      render: (item) => {
        if (item.status === 'Active') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[10px] text-emerald-400 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              VISIBLE
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-500/10 text-[10px] text-slate-400 border border-slate-500/20 rounded-full font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            HIDDEN
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'ACTIONS',
      headerClassName: 'text-right justify-end',
      cellClassName: 'text-right py-1',
      render: (item) => {
        if (!isAdmin) return <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">View Only</span>;
        
        const isSelected = selectedProductIds.includes(item.id);
        if (!isSelected) return null;

        return (
          <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleEditClick(item)}
              className="flex items-center justify-center h-8 w-8 bg-(--color-primary)/10 hover:bg-(--color-primary) text-(--color-primary-light) hover:text-white rounded-lg transition-all duration-200 cursor-pointer font-bold border border-(--color-primary)/20 hover:scale-110 shrink-0"
              title="Edit Product"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeleteConfirmId(item.id)}
              className="flex items-center justify-center h-8 w-8 bg-red-500/10 hover:bg-red-655 hover:text-white rounded-lg transition-all duration-200 cursor-pointer font-bold border border-red-500/20 hover:scale-110 shrink-0"
              title="Delete Product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
    }
  ];

  const printableItems: PrintableItem[] = products.map(p => ({
    id: p.id,
    barcode_id: p.barcode_id,
    product_name: p.product_name,
    selling_price: p.selling_price
  }));

  const selectedProductsForBulkEdit = products
    .filter(p => selectedProductIds.includes(p.id))
    .map(p => ({
      id: p.id,
      barcode_id: p.barcode_id,
      product_name: p.product_name,
      selling_price: p.selling_price,
      has_stock_limit: p.has_stock_limit,
      stock_quantity: p.stock_quantity,
      low_stock_alert: p.low_stock_alert,
      status: p.status,
      image_url: p.image_url,
    }));

  return (
    <div className="space-y-6">
      
      {/* 2. Responsive Overview Cards - Hidden on mobile viewports */}
      <div className="hidden md:grid grid-cols-4 gap-4">
        <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 border border-blue-500/20 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">VISIBLE</span>
            <span className="text-sm font-extrabold text-(--color-text) font-heading tracking-wide truncate block">
              {stats.active} / {stats.total} item/s
            </span>
          </div>
        </div>

        <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg text-green-500 border border-green-500/20 shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">IN STOCK</span>
            <span className="text-sm font-extrabold text-(--color-text) font-heading tracking-wide truncate block">
              {stats.total - stats.outOfStock} item/s
            </span>
          </div>
        </div>

        <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 border border-amber-500/20 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">LOW STOCK</span>
            <span className="text-sm font-extrabold text-(--color-text) font-heading tracking-wide truncate block">
              {stats.lowStock} Item/s
            </span>
          </div>
        </div>

        <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg text-red-500 border border-red-500/20 shrink-0">
            <PackageX className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">No Stock</span>
            <span className="text-sm font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block">
              {stats.outOfStock} Item/s
            </span>
          </div>
        </div>
      </div>

      {/* 3. Search and Status Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg-card) p-3 rounded-xl border border-(--border-color) shadow-xs mt-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name, barcode, or manufacturer barcode..."
            className="w-full pl-10 pr-10 py-2 border border-(--border-color) rounded-lg bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 transition-all font-medium"
          />

          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
              title="Clear search query"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filter:</span>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-(--bg-page) border border-(--border-color) rounded-lg text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all cursor-pointer"
          >
            <option value="all">ALL ITEMS</option>
            <option value="active">VISIBLE</option>
            <option value="inactive">HIDDEN</option>
            <option value="low_stock">LOW STOCK</option>
            <option value="unlimited">UNLIMITED STOCK</option>
          </select>
        </div>
      </div>

      {/* Bulk actions sticky pin bar */}
      {selectedProductIds.length > 0 && (
        <ProductBulkActions 
          selectedCount={selectedProductIds.length}
          onClear={() => setSelectedProductIds([])}
          onPrint={() => setShowPrintModal(true)} 
          onBulkEdit={handleBulkEditClick} 
          onBulkDelete={() => setShowBulkDeleteModal(true)} 
        />
      )}

      {/* 4. Products Table & Mobile Cards */}
      {loading ? (
        <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto w-full">
          <Table<Product>
            data={[]}
            columns={columns}
            itemsPerPage={itemsPerPage}
            loading={true}
          />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-12 text-center bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
          <div className="w-16 h-16 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <PackageX className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">No products found</h3>
            <p className="text-xs text-slate-455 max-w-xs mx-auto leading-relaxed">
              No items match your active search configurations.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* MOBILE VIEW: Mobile-first responsive touch layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
            {filteredProducts.map((product) => {
              const isSelected = selectedProductIds.includes(product.id);
              const isHidden = product.status === 'Inactive';
              
              return (
                <div 
                  key={product.id}
                  onClick={() => {
                    setSelectedProductIds(prev =>
                      prev.includes(product.id) ? prev.filter(id => id !== product.id) : [...prev, product.id]
                    );
                  }}
                  className={`p-4 border rounded-2xl relative flex flex-col gap-3 transition-all duration-150 cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500 shadow-sm' 
                      : isHidden
                        ? 'bg-slate-200/50 dark:bg-neutral-900/40 opacity-60 text-slate-455 dark:text-slate-500 border-(--border-color)'
                        : 'bg-(--bg-card) border-(--border-color) hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    {isSelectionActive ? (
                      <label className="flex items-center gap-2 cursor-pointer py-1 pr-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedProductIds(prev =>
                              prev.includes(product.id) ? prev.filter(id => id !== product.id) : [...prev, product.id]
                            );
                          }}
                          className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73]"
                        />
                        <span className="text-[10px] font-bold uppercase select-none">Select</span>
                      </label>
                    ) : (
                      <div className="w-1" /> 
                    )}
                    
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      product.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-455'
                    }`}>
                      {product.status === 'Active' ? 'VISIBLE' : 'HIDDEN'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 min-h-12 text-xs font-semibold">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.product_name} 
                          className={`w-12 h-12 rounded-xl object-cover border border-(--border-color) shrink-0 ${isHidden ? 'grayscale opacity-75' : ''}`} 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-bold text-lg shadow-inner shrink-0">
                          {product.product_name[0]}
                        </div>
                      )}
                      
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm truncate leading-snug">{product.product_name}</h4>
                        <p className="font-mono font-bold text-emerald-500 text-sm mt-0.5 leading-none">₱{product.selling_price.toFixed(2)}</p>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="bg-white p-1 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm shrink-0 w-full max-w-28 flex items-center justify-center animate-scale-up">
                        <BarcodeComponent value={product.barcode_id} />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-(--border-color) pt-2 text-[11px] leading-none">
                    <div className="space-y-1">
                      <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase text-[9px] block">Stock Status</span>
                      <span className="font-bold inline-block">
                        {!product.has_stock_limit ? (
                          <span className="text-blue-400">UNLIMITED</span>
                        ) : product.stock_quantity === 0 ? (
                          <span className="text-red-500">OUT OF STOCK</span>
                        ) : (
                          <span className="text-slate-350">{product.stock_quantity} UNITS</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="space-y-1 text-right">
                      <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase text-[9px] block">Code Number</span>
                      <span className="font-mono font-bold text-slate-400 dark:text-slate-300 inline-block">
                        {product.barcode_id}
                        {product.manufacturer_barcode && (
                          <span className="block text-[9px] text-slate-500 dark:text-slate-400 font-normal mt-1">MFG: {product.manufacturer_barcode}</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {isAdmin && isSelected && selectedProductIds.length === 1 && (
                    <div 
                      className="flex gap-2 mt-1 pt-2 border-t border-(--border-color) animate-slide-up"
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <button
                        onClick={() => handleEditClick(product)}
                        className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit Item
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(product.id)}
                        className="flex-1 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-655 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                      
                      <button
                        onClick={() => {
                          setSelectedProductIds(prev => prev.filter(id => id !== product.id));
                        }}
                        className="px-3 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer hover:bg-slate-350 dark:hover:bg-slate-750 transition-colors"
                        title="Close options"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP VIEW: Compact table layout */}
          <div className="hidden md:block p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
            <Table<Product>
              data={filteredProducts}
              columns={columns}
              itemsPerPage={itemsPerPage}
              loading={false}
              getRowClassName={getRowStyle}
              onRowClick={handleRowClick} 
            />
          </div>
        </>
      )}

      {/* 5. Create / Edit Form Modal */}
      {showFormModal && (
        <ProductFormModal 
          isEditing={isEditing}
          formName={formName}
          setFormName={setFormName}
          formPrice={formPrice}
          setFormPrice={setFormPrice}
          formHasStockLimit={formHasStockLimit}
          setFormHasStockLimit={setFormHasStockLimit}
          formStockQuantity={formStockQuantity}
          setFormStockQuantity={setFormStockQuantity}
          formLowStockAlert={formLowStockAlert}
          setFormLowStockAlert={setFormLowStockAlert}
          formStatus={formStatus}
          setFormStatus={setFormStatus}
          formImageUrl={formImageUrl}
          setFormImageUrl={setFormImageUrl}

          // Condensed manufacturer state transfers
          formManufacturerBarcode={formManufacturerBarcode}
          setFormManufacturerBarcode={setFormManufacturerBarcode}
          formManufacturerSource={formManufacturerSource}
          setFormManufacturerSource={setFormManufacturerSource}

          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          saving={saving}
          uploading={uploading}
          onFileUpload={handleFileUpload}
          onSave={handleSaveProduct}
          onClose={() => setShowFormModal(false)}
          existingProducts={products} 
          editingProductId={selectedProductId} 
        />
      )}

      {/* 6. Destructive Delete Confirm Dialog */}
      {deleteConfirmId && (() => {
        const productToDelete = products.find(p => p.id === deleteConfirmId);
        if (!productToDelete) return null;
        return (
          <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="bg-(--bg-card) border border-red-500/20 rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-5 animate-scale-up text-xs text-(--color-text)">
              
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-6 h-6 animate-bounce" />
              </div>

              <div className="space-y-1">
                <h4 className="font-heading text-sm tracking-wider uppercase text-red-500">
                  Confirm Deletion
                </h4>
                <p className="text-slate-455 text-[11px] font-medium leading-relaxed">
                  You are about to permanently delete this item from your store catalog. This action cannot be undone.
                </p>
              </div>

              <div className="p-4 bg-slate-100 dark:bg-[#1e232d] border border-(--border-color) rounded-2xl flex items-center gap-4 text-left shadow-inner">
                {productToDelete.image_url ? (
                  <img 
                    src={productToDelete.image_url} 
                    alt={productToDelete.product_name} 
                    className="w-16 h-16 rounded-xl object-cover border border-(--border-color) shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-heading text-lg uppercase shadow-inner">
                    {productToDelete.product_name[0]}
                  </div>
                )}
                
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest block leading-none">Catalog Item</span>
                  <h5 className="font-extrabold text-sm truncate leading-snug text-(--color-text)">
                    {productToDelete.product_name}
                  </h5>
                  
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[10px]">
                    <span className="font-mono font-bold text-slate-455">
                      {productToDelete.barcode_id}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="font-semibold text-emerald-500">
                      ₱{productToDelete.selling_price.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2.5 border border-(--border-color) bg-(--bg-card) text-slate-500 hover:text-slate-200 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
                >
                  No, Cancel
                </button>
                <button
                  onClick={() => handleDeleteProduct(productToDelete.id)}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-705 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 font-bold shadow-lg shadow-red-600/20"
                >
                  Confirm Delete
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 7. Barcode Print Workspace Modal */}
      {showPrintModal && (
        <BarcodePrintModal 
          products={printableItems}
          initialSelectedIds={selectedProductIds}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* 8. Spreadsheet Bulk Editor Modal */}
      {showBulkEditModal && (
        <BulkEditModal 
          isOpen={showBulkEditModal}
          onClose={() => setShowBulkEditModal(false)}
          selectedProducts={selectedProductsForBulkEdit}
          onSaveSuccess={() => {
            setSelectedProductIds([]);
            fetchProducts();
          }}
        />
      )}

      {/* 9. Bulk Deletion safety Confirmation Modal */}
      {showBulkDeleteModal && (
        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          title="Confirm Permanent Deletion"
        >
          <div className="space-y-4 text-center font-body text-xs">
            <p className="text-slate-655 dark:text-slate-400 font-medium">
              Are you sure you want to permanently delete these <strong>{selectedProductIds.length}</strong> selected products? This action will erase all barcode mappings and POS listings.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-500 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBulkDelete}
                disabled={saving}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 font-bold"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 10. Product Recovery Bin Modal */}
      {showRecoveryModal && (
        <ProductRecoveryModal
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          onRestoreSuccess={() => {
            fetchProducts();
          }}
        />
      )}

     {/* 
        11. Redesigned Mobile Expandable Floating Action Menu (FAB):
        Includes full backdrop overlays and staggered micro-interactions.
      */}
      {isAdmin && selectedProductIds.length === 0 && (
        <>
          {/* Backdrop Blur Focus Shield Overlay */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-35"
              />
            )}
          </AnimatePresence>

          {/* Floating Action Menu Container */}
          <div className="md:hidden fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3">
            <AnimatePresence>
              {isMobileMenuOpen && (
                <motion.div 
                  variants={menuContainerVariants}
                  initial="hidden"
                  animate="show"
                  exit="hidden"
                  className="flex flex-col items-end gap-2.5 mb-1"
                >
                  {/* Option 1: Recycle Bin */}
                  <motion.button
                    variants={menuItemVariants}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setShowRecoveryModal(true);
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 hover:bg-slate-850 dark:hover:bg-neutral-850 text-slate-100 border border-white/5 dark:border-white/10 text-[10px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-500" />
                    <span>Recycle Bin</span>
                  </motion.button>

                  {/* Option 2: Print Sheet Labels */}
                  <motion.button
                    variants={menuItemVariants}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setShowPrintModal(true);
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 hover:bg-slate-850 dark:hover:bg-neutral-850 text-slate-100 border border-white/5 dark:border-white/10 text-[10px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-blue-500" />
                    <span>Print Labels</span>
                  </motion.button>
                  
                  {/* Option 3: Add New Item */}
                  <motion.button
                    variants={menuItemVariants}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleCreateClick();
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 dark:bg-neutral-900/95 hover:bg-slate-850 dark:hover:bg-neutral-850 text-slate-100 border border-white/5 dark:border-white/10 text-[10px] font-heading tracking-widest uppercase rounded-2xl shadow-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-emerald-500" />
                    <span>Add Product</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Core Trigger Button */}
            <motion.button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              whileTap={{ scale: 0.9 }}
              animate={{
                backgroundColor: isMobileMenuOpen ? 'var(--color-primary)' : '#10b981',
                boxShadow: isMobileMenuOpen 
                  ? '0 10px 25px -5px rgba(0, 0, 0, 0.4)' 
                  : '0 10px 25px -5px rgba(16, 185, 129, 0.45)'
              }}
              className="flex items-center justify-center w-14 h-14 text-white rounded-full cursor-pointer border border-white/10 shadow-lg"
              title="Open actions menu"
            >
              <motion.div
                animate={{ rotate: isMobileMenuOpen ? 135 : 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 16 }}
              >
                <Plus className="w-6 h-6" />
              </motion.div>
            </motion.button>
          </div>
        </>
      )}

    </div>
  );
};