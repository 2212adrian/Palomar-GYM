import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { compressImage } from '../../lib/imageCompressor';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import { 
  Plus, Pencil, Trash2, Loader2, Upload, AlertTriangle, 
  Layers, Package, PackageX, X, Image as ImageIcon,
  ChevronDown, ChevronUp, SlidersHorizontal, CheckCircle2,
  Sparkles, Tag, DollarSign, Eye
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
  created_at: string;
  updated_at: string;
}

export const Products: React.FC = () => {
  const { user } = useAuthStore() as any;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsPerPage = useResponsiveItemsPerPage();
  
  // Dynamic authorization check
  const isAdmin = 
    user?.app_metadata?.role === 'Admin' || 
    user?.app_metadata?.role === 'admin' || 
    user?.user_metadata?.role === 'Admin' || 
    user?.user_metadata?.role === 'admin' || 
    user?.email === 'wolf.palomar@gmail.com';

  // Product Directory States
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Dynamic Custom Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  
  // Modal / Form States
  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Advanced Settings Drawer Toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formHasStockLimit, setFormHasStockLimit] = useState(false);
  const [formStockQuantity, setFormStockQuantity] = useState('0');
  const [formLowStockAlert, setFormLowStockAlert] = useState('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [formImageUrl, setFormImageUrl] = useState('');

  // Fetch Inventory Products
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('product_name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch {
      toast.error('Could not fetch active inventory listings.');
    } finally {
      setLoading(false);
    }
  };

  // Setup Postgres Realtime Database Subscriptions
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
            setProducts((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p)).sort((a, b) => a.product_name.localeCompare(b.product_name))
            );
          } else if (eventType === 'DELETE') {
            const targetId = oldRecord.id;
            setProducts((prev) => prev.filter((p) => p.id !== targetId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const recordAuditLog = async (action: string, details: any) => {
    try {
      if (!user) return;
      await supabase.from('audit_logs').insert({
        action,
        user_id: user.id,
        details: JSON.stringify(details),
        created_at: new Date().toISOString()
      });
    } catch {
      // Gracefully prevent background errors from interrupting workspace actions
    }
  };

  // Iteratively compresses files under 8MB down to 10KB target
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
      
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedFile, { 
          contentType: 'image/jpeg', 
          cacheControl: '3600', 
          upsert: true 
        });

      if (error) throw error;

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        
        setFormImageUrl(publicUrl);
        toast.success(`Image compressed cleanly to ${(compressedFile.size / 1024).toFixed(1)}KB!`);
      }
    } catch {
      toast.error('Image compression or upload handshake failed.');
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
    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameClean = formName.trim();
    const priceNum = parseFloat(formPrice);

    if (!nameClean || nameClean.length > 100) {
      toast.error('Product name is required and must be under 100 characters.');
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Please enter a valid non-negative selling price.');
      return;
    }

    const stockQty = formHasStockLimit ? parseInt(formStockQuantity) : 0;
    const alertQty = (formHasStockLimit && formLowStockAlert.trim() !== '') ? parseInt(formLowStockAlert) : null;

    if (formHasStockLimit && (isNaN(stockQty) || stockQty < 0)) {
      toast.error('Stock quantity must be a non-negative number.');
      return;
    }

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
        updated_at: new Date().toISOString()
      };

      if (isEditing && selectedProductId) {
        const { error } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', selectedProductId);

        if (error) throw error;
        toast.success('Product updated successfully.');
        await recordAuditLog('PRODUCT_UPDATED', { id: selectedProductId, name: nameClean });
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(productPayload)
          .select()
          .single();

        if (error) throw error;
        toast.success('New product listed in inventory.');
        if (data) {
          await recordAuditLog('PRODUCT_CREATED', { id: data.id, name: nameClean });
        }
      }

      setShowFormModal(false);
      fetchProducts();
    } catch {
      toast.error('Failed to submit product parameters.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Product removed from records.');
      await recordAuditLog('PRODUCT_DELETED', { id });
      setDeleteConfirmId(null);
      fetchProducts();
    } catch {
      toast.error('Action denied. Verification or network failure.');
    }
  };

  // Card stats calculations
  const stats = {
    total: products.length,
    active: products.filter(p => p.status === 'Active').length,
    outOfStock: products.filter(p => p.has_stock_limit && p.stock_quantity === 0).length,
    lowStock: products.filter(p => p.has_stock_limit && p.low_stock_alert !== null && p.stock_quantity <= p.low_stock_alert && p.stock_quantity > 0).length
  };

  // Perform dynamic search and status filtering together in Products layout
  const filteredProducts = products.filter((p) => {
    // 1. Search Query Match
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = query === '' || 
      p.product_name.toLowerCase().includes(query) ||
      p.barcode_id.toLowerCase().includes(query);

    if (!matchesSearch) return false;

    // 2. Friendly Filter Selector Match
    if (selectedStatusFilter === 'all') return true;
    if (selectedStatusFilter === 'active') return p.status === 'Active';
    if (selectedStatusFilter === 'inactive') return p.status === 'Inactive';
    if (selectedStatusFilter === 'low_stock') {
      return p.has_stock_limit && p.low_stock_alert !== null && p.stock_quantity <= p.low_stock_alert;
    }
    if (selectedStatusFilter === 'unlimited') return !p.has_stock_limit;
    return true;
  });

  // Define structured Columns for the React <Table> Component (Disabled default search inputs inside table)
  const columns: Column<Product>[] = [
    {
      key: 'barcode_id',
      header: 'BARCODE ID',
      sortable: true,
      render: (item) => (
        <span className="px-2.5 py-1 rounded-lg bg-(--bg-page) text-xs font-mono font-bold border border-(--border-color) text-(--color-text) opacity-90">
          {item.barcode_id}
        </span>
      )
    },
    {
      key: 'product_name',
      header: 'ITEM PROFILE NAME',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3 py-1">
          {item.image_url ? (
            <img 
              src={item.image_url} 
              alt={item.product_name} 
              className="w-10 h-10 rounded-xl object-cover border border-(--border-color) bg-(--bg-page)" 
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-heading text-xs uppercase shadow-inner">
              {item.product_name[0]}
            </div>
          )}
          <span className="font-semibold text-(--color-text) tracking-wide block text-sm">{item.product_name}</span>
        </div>
      )
    },
    {
      key: 'selling_price',
      header: 'RETAIL PRICE',
      sortable: true,
      sortValue: (item) => Number(item.selling_price),
      render: (item) => (
        <span className="font-mono font-bold text-(--color-text) text-xs opacity-90">
          ₱{Number(item.selling_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'stock_quantity',
      header: 'AVAILABLE STOCK',
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
              OUT
            </span>
          );
        }
        if (isLow) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-[10px] text-amber-500 border border-amber-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              LOW STOCK ({item.stock_quantity})
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
      header: 'STATUS',
      sortable: true,
      render: (item) => {
        if (item.status === 'Active') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[10px] text-emerald-400 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ACTIVE
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-500/10 text-[10px] text-slate-400 border border-slate-500/20 rounded-full font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            INACTIVE
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'ACTIONS',
      headerClassName: 'text-right justify-end',
      cellClassName: 'text-right',
      render: (item) => {
        if (!isAdmin) return <span className="text-xs text-slate-400 dark:text-slate-500">View Only</span>;
        return (
          <div className="flex items-center gap-3.5 justify-end">
            <button
              onClick={() => handleEditClick(item)}
              className="px-3.5 py-1.5 bg-(--color-primary)/10 hover:bg-(--color-primary) text-(--color-primary-light) hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-(--color-primary)/20 flex items-center gap-1.5"
              title="Edit Product"
            >
              <Pencil className="w-3 h-3" />
              EDIT
            </button>
            <button
              onClick={() => setDeleteConfirmId(item.id)}
              className="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white text-[10px] font-heading tracking-wider uppercase rounded-lg transition-all cursor-pointer font-bold border border-red-500/20 flex items-center gap-1.5"
              title="Delete Product"
            >
              <Trash2 className="w-3 h-3" />
              DELETE
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 font-body min-h-screen text-(--color-text) rounded-3xl pt-2">
      
      {/* 1. Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
            PRODUCT INVENTORY
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-medium">
            Manage your store inventory, check barcode ID mappings, adjust unit stock counts, and configure alerts.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleCreateClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <Plus className="w-3.5 h-3.5" />
            ADD NEW PRODUCT
          </button>
        )}
      </div>

      {/* 2. KPI Score Cards */}
      <div className="hidden md:grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ACTIVE ITEMS</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wide mt-0.5 block">
              {stats.active} / {stats.total} LISTED
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Visible on Register</span>
          </div>
        </div>

        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-xl text-green-500 border border-green-500/20">
            <Package className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">AVAILABLE ITEMS</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block">
              {stats.total - stats.outOfStock} IN STOCK
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Ready for checkout</span>
          </div>
        </div>

        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">LOW STOCK ALERTS</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block">
              {stats.lowStock} WARNINGS
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Threshold triggers</span>
          </div>
        </div>

        <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-xl text-red-500 border border-red-500/20">
            <PackageX className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DEPLETED STOCK</span>
            <span className="text-lg font-extrabold text-(--color-text) font-heading tracking-wider mt-0.5 block">
              {stats.outOfStock} RUNOUTS
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">Requires replenishment</span>
          </div>
        </div>
      </div>

      {/* 3. Unified Filter Deck & Search Block (Consolidated in one row) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg-card) p-4 rounded-2xl border border-(--border-color) shadow-xs mt-6">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search inventory items by name or barcode mappings..."
            className="w-full pl-10 pr-4 py-2.5 border border-(--border-color) rounded-xl bg-(--bg-page) text-xs text-(--color-text) outline-none focus:border-slate-400 transition-all font-medium"
          />
          <Plus className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 rotate-45" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status:</span>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            title="Filter products by inventory status"
            aria-label="Filter products by status"
            className="px-3.5 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl text-xs text-(--color-text) font-semibold outline-none focus:border-slate-400 transition-all cursor-pointer"
          >
            <option value="all">ALL</option>
            <option value="active">ACTIVE</option>
            <option value="inactive">INACTIVE</option>
            <option value="low_stock">LOW STOCK</option>
            <option value="unlimited">UNLIMITED STOCK</option>
          </select>
        </div>
      </div>

      {/* 4. Products Table (With Active Sub-filtering) */}
      {filteredProducts.length === 0 ? (
        <div className="p-12 text-center bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
          <div className="w-16 h-16 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <PackageX className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">No products found</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {products.length === 0 
                ? "Your product inventory database is currently empty. Want to add a product?" 
                : "No items match your active search configurations and stock status filters."}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleCreateClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-heading tracking-widest uppercase rounded-xl shadow-md hover:scale-102 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              ADD NEW INVENTORY PRODUCT
            </button>
          )}
        </div>
      ) : (
        <div className="p-1 rounded-2xl border border-(--border-color) bg-(--bg-card) overflow-x-auto lg:overflow-x-visible w-full">
          <Table<Product>
            data={filteredProducts}
            columns={columns}
            itemsPerPage={itemsPerPage}
            loading={loading}
            loadingLabel="Accessing product specifications..."
          />
        </div>
      )}

      {/* 5. Form Modal (Create & Edit) */}
      {showFormModal && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-scale-up text-(--color-text)">
            
            <div className="px-5 py-4 border-b border-(--border-color) flex items-center justify-between">
              <h3 className="font-heading text-xs tracking-widest uppercase text-(--color-text) flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#123c73] dark:text-[#bf0202]" />
                <span>{isEditing ? 'Modify Product Specifications' : 'Add New Inventory Product'}</span>
              </h3>
              <button 
                onClick={() => setShowFormModal(false)}
                title="Close editing window"
                aria-label="Close Modal"
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-4 text-xs overflow-y-auto max-h-[80vh] no-scrollbar text-left">
              
              {/* Product Cover Graphic (Placed on Top) */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Product Cover Graphic</span>
                </label>
                
                <div className="grid gap-3">
                  <Input
                    type="text"
                    icon={<ImageIcon className="w-3.5 h-3.5 text-slate-400" />}
                    label="Image Address (URL)"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                  />
                  
                  {/* File Upload Dropzone with Live Compression Metrics */}
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative border-2 border-dashed border-(--border-color) rounded-2xl p-4 bg-(--bg-page) text-center transition-all hover:opacity-85 cursor-pointer"
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center justify-center py-2 space-y-2">
                        <Loader2 className="w-6 h-6 animate-spin text-[#123c73] dark:text-[#bf0202]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse text-slate-400">
                          Compressing image down to 10KB...
                        </span>
                      </div>
                    ) : formImageUrl ? (
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-14 h-14 rounded-xl border border-(--border-color) overflow-hidden shadow-sm relative">
                          <img src={formImageUrl} alt="Product Cover" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); setFormImageUrl(''); }} 
                            className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-md p-0.5 hover:bg-red-700 transition-colors"
                            title="Remove Cover Image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Image Ready
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2 space-y-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-300 transition-all">
                        <Upload className="w-6 h-6 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Drag & drop image or local upload</span>
                        <span className="text-[8px]">Max upload size is 8MB (Auto compressed to 10KB target)</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                      title="Choose local image file"
                    />
                  </div>
                </div>
              </div>

              {/* Required Core Fields (Always Visible) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <label htmlFor="form-product-name" className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>Product Name *</span>
                  </label>
                  <Input
                    id="form-product-name"
                    type="text"
                    required
                    maxLength={100}
                    label="E.g., Protein Powder Whey 1LB"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="form-product-price" className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
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

              {/* Advanced Parameters Group/Drawer (Collapsible accordion block at the very bottom) */}
              <div className="border border-(--border-color) rounded-2xl overflow-hidden transition-all duration-300">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between p-4 bg-(--bg-page) border-b border-(--border-color) transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-[10px] font-heading tracking-widest uppercase text-slate-400">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                    <span>Advanced Configurations</span>
                  </div>
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <div 
                  className={`transition-all duration-300 ease-in-out overflow-hidden bg-(--bg-page) ${
                    showAdvanced ? 'max-h-[500px] opacity-100 p-4 space-y-4 border-t-0' : 'max-h-0 opacity-0 pointer-events-none'
                  }`}
                >
                  {/* Status Selection */}
                  <div className="grid gap-1.5">
                    <label htmlFor="form-product-status" className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      <span>Display Status *</span>
                    </label>
                    <select
                      id="form-product-status"
                      title="Select product visibility"
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full px-4 py-3 bg-(--bg-card) border border-(--border-color) rounded-xl text-(--color-text) outline-none focus:border-slate-400 transition-all font-semibold cursor-pointer"
                    >
                      <option value="Active">Active (Visible in POS Storefront)</option>
                      <option value="Inactive">Inactive (Hidden from POS)</option>
                    </select>
                  </div>

                  {/* Stock tracking configuration box */}
                  <div className="p-4 bg-(--bg-card) border border-(--border-color) rounded-xl space-y-4 text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Track stock limits</h4>
                        <p className="text-[9px] text-slate-450 mt-0.5">Toggle if inventory items can go out of stock</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={formHasStockLimit}
                        onChange={(e) => setFormHasStockLimit(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-white/10 text-(--color-primary) focus:ring-0 cursor-pointer accent-(--color-primary)"
                        title="Enable stock tracking"
                      />
                    </div>

                    {formHasStockLimit && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 animate-slide-up">
                        <div className="grid gap-1.5">
                          <label htmlFor="form-product-stock" className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                            In-Stock Quantity *
                          </label>
                          <Input
                            id="form-product-stock"
                            type="number"
                            min="0"
                            required={formHasStockLimit}
                            label="Quantity in box"
                            value={formStockQuantity}
                            onChange={(e) => setFormStockQuantity(e.target.value)}
                          />
                        </div>

                        <div className="grid gap-1.5">
                          <label htmlFor="form-product-alert" className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                            Low Stock Warning Mark
                          </label>
                          <Input
                            id="form-product-alert"
                            type="number"
                            min="0"
                            label="E.g., Warn at 5 remaining"
                            value={formLowStockAlert}
                            onChange={(e) => setFormLowStockAlert(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-(--border-color) pt-4">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-(--border-color) text-slate-300 bg-(--bg-card) hover:opacity-90 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  loading={saving}
                  className="px-5 py-2.5 max-w-[150px]"
                >
                  {isEditing ? 'Save Details' : 'Publish Product'}
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 6. Destructive Delete Confirm Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-(--bg-card) border border-(--border-color) rounded-2xl w-full max-w-sm shadow-xl p-5 text-center space-y-4 animate-scale-up text-xs">
            
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="space-y-1.5 text-left">
              <h4 className="font-heading text-xs tracking-wider uppercase text-(--color-text)">
                Confirm Deletion
              </h4>
              <p className="text-slate-400 font-bold">
                Are you sure you want to delete this product? This will remove all barcode lookups and POS mappings.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border border-(--border-color) bg-(--bg-card) text-slate-300 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
              >
                No, Cancel
              </button>
              <button
                onClick={() => handleDeleteProduct(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};