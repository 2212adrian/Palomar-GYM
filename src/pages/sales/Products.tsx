// src/pages/sales/Products.tsx
import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';
import { compressImage } from '../../lib/imageCompressor';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { toast } from 'react-toastify';
import { isSuperAdmin } from '../../constants/auth';
import { useNavbarStore } from '../../stores/useNavbarStore';
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
import { ProductRecoveryModal } from './components/ProductRecycleBin';

// Shared Layout Header Context
import { HeaderActionsContext } from '../../routes';

import {
  Plus,
  Pencil,
  Trash2,
  Layers,
  Package,
  PackageX,
  Search,
  X,
  Printer,
  Loader2,
  RotateCcw,
  Sparkles,
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

  manufacturer_barcode?: string | null;
  manufacturer_source?: string;
}

interface ProductDiff {
  type: 'added' | 'updated' | 'deleted';
  previous?: {
    product_name?: string;
    selling_price?: number;
    stock_quantity?: number;
    has_stock_limit?: boolean;
    status?: 'Active' | 'Inactive';
  };
  current?: {
    product_name?: string;
    selling_price?: number;
    stock_quantity?: number;
    has_stock_limit?: boolean;
    status?: 'Active' | 'Inactive';
  };
}

interface ProductsProps {
  hideHeaderActions?: boolean;
}

export const Products: React.FC<ProductsProps> = ({
  hideHeaderActions = false,
}) => {
  const { user } = useAuthStore() as any;
  const itemsPerPage = useResponsiveItemsPerPage();
  const isMountedRef = useRef(true);
  const isNavFloatingOpen = Boolean(useNavbarStore((s) => s.activeFloating));

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

  // Temporary Change Highlighting Tracker (Cleared on Toast Dismiss)
  const [activeDiffs, setActiveDiffs] = useState<Record<string, ProductDiff>>(
    {}
  );

  // Helper to clear highlight for an item
  const clearDiff = (productId: string) => {
    setActiveDiffs((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

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
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Selection States for Bulk actions
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

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
  const [formManufacturerSource, setFormManufacturerSource] =
    useState('manual');

  const { setActions } = useContext(HeaderActionsContext);

  // Silent sync enabled by default for zero skeleton flicker
  const fetchProducts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name', { ascending: true });

      if (error) throw error;
      if (isMountedRef.current) {
        setProducts(data || []);
      }
    } catch {
      if (isMountedRef.current) {
        console.warn(
          'INTERNET_ERR: Could not load your product items. Please Check your Connection.'
        );
      }
    } finally {
      if (isMountedRef.current && !silent) {
        setLoading(false);
      }
    }
  };

  const stats = useMemo(
    () => ({
      total: products.length,
      active: products.filter((p) => p.status === 'Active').length,
      inStock: products.filter(
        (p) => !p.has_stock_limit || p.stock_quantity > 0
      ).length,
      outOfStock: products.filter(
        (p) => p.has_stock_limit && p.stock_quantity === 0
      ).length,
      lowStock: products.filter(
        (p) =>
          p.has_stock_limit &&
          p.low_stock_alert !== null &&
          p.stock_quantity <= p.low_stock_alert &&
          p.stock_quantity > 0
      ).length,
    }),
    [products]
  );

  // Broadcast Products Telemetry to Topbar
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('products-kpi-update', {
        detail: stats,
      })
    );
  }, [stats]);

  useEffect(() => {
    const handleCreate = () => handleCreateClick();
    const handlePrint = () => setShowPrintModal(true);
    const handleRecovery = () => setShowRecoveryModal(true);

    window.addEventListener('trigger-product-create', handleCreate);
    window.addEventListener('trigger-product-print', handlePrint);
    window.addEventListener('trigger-product-recovery', handleRecovery);

    return () => {
      window.removeEventListener('trigger-product-create', handleCreate);
      window.removeEventListener('trigger-product-print', handlePrint);
      window.removeEventListener('trigger-product-recovery', handleRecovery);
    };
  }, [products]);

  useEffect(() => {
    fetchProducts(false); // Initial load displays the skeleton

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
              return [...prev, newRecord as Product].sort((a, b) =>
                a.product_name.localeCompare(b.product_name)
              );
            });
          } else if (eventType === 'UPDATE') {
            const updated = newRecord as Product;

            if (updated.deleted_at) {
              setProducts((prev) => prev.filter((p) => p.id !== updated.id));
              setSelectedProductIds((prev) =>
                prev.filter((id) => id !== updated.id)
              );
            } else {
              setProducts((prev) => {
                const updatedList = prev.some((p) => p.id === updated.id)
                  ? prev.map((p) => (p.id === updated.id ? updated : p))
                  : [...prev, updated];
                return updatedList.sort((a, b) =>
                  a.product_name.localeCompare(b.product_name)
                );
              });
            }
          } else if (eventType === 'DELETE') {
            const targetId = oldRecord.id;
            setProducts((prev) => prev.filter((p) => p.id !== targetId));
            setSelectedProductIds((prev) =>
              prev.filter((id) => id !== targetId)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Dispatch selection changes to custom window event
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('product-selection-change', {
        detail: selectedProductIds.length,
      })
    );
  }, [selectedProductIds]);

  const location = useLocation();

  useEffect(() => {
    if (hideHeaderActions) return;

    const updateHeaderActions = () => {
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
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1e232d] hover:bg-slate-800 text-white border border-white/5 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer animate-fade-in"
              title="Quickly generate printable sheet labels"
            >
              <Printer className="w-3.5 h-3.5 text-blue-500" />
              <span>Print Sheet Labels</span>
            </button>

            <button
              onClick={handleCreateClick}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] font-heading tracking-widest uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10 animate-fade-in"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Item
            </button>
          </>
        );
      } else {
        setActions(null);
      }
    };

    const timer = setTimeout(updateHeaderActions, 0);

    return () => {
      clearTimeout(timer);
      setActions(null);
    };
  }, [
    isAdmin,
    selectedProductIds.length,
    location.pathname,
    setActions,
    hideHeaderActions,
  ]);

  // Auto-highlight product from notification redirection
  useEffect(() => {
    if (location.state?.highlightProductId && products.length > 0) {
      const targetId = location.state.highlightProductId;
      const target = products.find((p) => p.id === targetId);
      if (target) {
        setSelectedProductIds([targetId]);
        setSearchQuery(target.product_name);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, products]);

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
          upsert: true,
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
    setFormManufacturerBarcode(product.manufacturer_barcode || '');
    setFormManufacturerSource(product.manufacturer_source || 'manual');
    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent, bulkItems?: any[]) => {
    e.preventDefault();

    try {
      setSaving(true);

      if (bulkItems && bulkItems.length > 0) {
        const { data, error } = await supabase
          .from('products')
          .insert(bulkItems)
          .select();

        if (error) throw error;

        if (data) {
          const newProducts = data as Product[];
          setProducts((prev) =>
            [...prev, ...newProducts].sort((a, b) =>
              a.product_name.localeCompare(b.product_name)
            )
          );

          // Mark bulk items as added
          setActiveDiffs((prev) => {
            const next = { ...prev };
            newProducts.forEach((p) => {
              next[p.id] = { type: 'added' };
            });
            return next;
          });

          toast.success(
            `Successfully saved ${bulkItems.length} products to inventory.`,
            {
              autoClose: 4000,
              onClose: () => {
                newProducts.forEach((p) => clearDiff(p.id));
              },
            }
          );
        }

        const itemsList = bulkItems
          .map(
            (item) =>
              `\t- ${item.product_name} (₱${item.selling_price.toFixed(2)})`
          )
          .join('\n');
        const auditDetails = `Successfully listed ${bulkItems.length} new products to your store catalog:\n\n${itemsList}`;

        await logAudit('BULK_PRODUCTS_CREATED', auditDetails);
      } else {
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
        const alertQty =
          formHasStockLimit && formLowStockAlert.trim() !== ''
            ? parseInt(formLowStockAlert)
            : null;

        const productPayload = {
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

        if (isEditing && selectedProductId) {
          const targetProduct = products.find(
            (p) => p.id === selectedProductId
          );
          const changes: string[] = [];

          const previousState = targetProduct
            ? {
                product_name: targetProduct.product_name,
                selling_price: targetProduct.selling_price,
                stock_quantity: targetProduct.stock_quantity,
                has_stock_limit: targetProduct.has_stock_limit,
                status: targetProduct.status,
              }
            : undefined;

          if (targetProduct) {
            if (targetProduct.product_name !== nameClean) {
              changes.push(
                `Name: "${targetProduct.product_name}" -> "${nameClean}"`
              );
            }
            const oldPrice = Number(targetProduct.selling_price || 0);
            if (oldPrice !== priceNum) {
              changes.push(
                `Price: ₱${oldPrice.toFixed(2)} -> ₱${priceNum.toFixed(2)}`
              );
            }
            const oldStock = Number(targetProduct.stock_quantity ?? 0);
            if (targetProduct.has_stock_limit !== formHasStockLimit) {
              changes.push(
                `Stock Type: ${targetProduct.has_stock_limit ? 'Limited' : 'Unlimited'} -> ${formHasStockLimit ? 'Limited' : 'Unlimited'}`
              );
            } else if (formHasStockLimit && oldStock !== stockQty) {
              changes.push(`Stock Count: ${oldStock} -> ${stockQty}`);
            }
            const oldAlert = targetProduct.low_stock_alert ?? null;
            if (oldAlert !== alertQty) {
              changes.push(
                `Low Stock Alert: ${oldAlert ?? 'None'} -> ${alertQty ?? 'None'}`
              );
            }
            if (targetProduct.status !== formStatus) {
              changes.push(`Status: ${targetProduct.status} -> ${formStatus}`);
            }
          }

          // Optimistically update product in local state
          setProducts((prev) =>
            prev
              .map((p) =>
                p.id === selectedProductId
                  ? ({ ...p, ...productPayload } as Product)
                  : p
              )
              .sort((a, b) => a.product_name.localeCompare(b.product_name))
          );

          // Register before/after highlight
          const editedId = selectedProductId;
          setActiveDiffs((prev) => ({
            ...prev,
            [editedId]: {
              type: 'updated',
              previous: previousState,
              current: {
                product_name: nameClean,
                selling_price: priceNum,
                stock_quantity: stockQty,
                has_stock_limit: formHasStockLimit,
                status: formStatus,
              },
            },
          }));

          const { error } = await supabase
            .from('products')
            .update(productPayload)
            .eq('id', selectedProductId);

          if (error) throw error;

          toast.success(`Updated "${nameClean}".`, {
            autoClose: 4000,
            onClose: () => clearDiff(editedId),
          });

          const auditDetails =
            changes.length > 0
              ? `Updated product "${nameClean}": ${changes.join(', ')}`
              : `Updated product details for "${nameClean}".`;

          try {
            await logAudit('PRODUCT_UPDATED', auditDetails, selectedProductId);
          } catch (auditError) {
            console.warn(
              'Background audit logging failed silently:',
              auditError
            );
          }

          setSelectedProductIds((prev) =>
            prev.filter((id) => id !== selectedProductId)
          );
        } else {
          const { data, error } = await supabase
            .from('products')
            .insert(productPayload)
            .select()
            .single();

          if (error) throw error;

          if (data) {
            const newProduct = data as Product;
            // Prepend new product so it is immediately visible
            setProducts((prev) => [
              newProduct,
              ...prev.filter((p) => p.id !== newProduct.id),
            ]);

            // Register newly added highlight
            setActiveDiffs((prev) => ({
              ...prev,
              [newProduct.id]: {
                type: 'added',
                current: {
                  product_name: newProduct.product_name,
                  selling_price: newProduct.selling_price,
                },
              },
            }));

            toast.success(`New product "${nameClean}" listed.`, {
              autoClose: 4000,
              onClose: () => clearDiff(newProduct.id),
            });
          }

          await logAudit(
            'PRODUCT_CREATED',
            `Created new product catalog entry "${nameClean}" priced at ₱${priceNum.toFixed(2)}.`,
            data?.id
          );
        }
      }

      setShowFormModal(false);
      fetchProducts(true); // Silent sync in background
    } catch {
      toast.error('Failed to save parameters.');
      fetchProducts(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const targetProduct = products.find((p) => p.id === id);
    if (!targetProduct) return;

    setDeleteConfirmId(null);

    // Keep row in memory, but show as deleted highlight
    setActiveDiffs((prev) => ({
      ...prev,
      [id]: {
        type: 'deleted',
        previous: {
          product_name: targetProduct.product_name,
          selling_price: targetProduct.selling_price,
        },
      },
    }));

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error) throw error;

      await logAudit(
        'PRODUCT_DELETED',
        `Moved product "${targetProduct?.product_name || 'Unknown Item'}" to Recycle Bin.`,
        id
      );

      // Once toast dismisses, cleanly purge the row from state
      toast.success(`Moved "${targetProduct.product_name}" to Recycle Bin.`, {
        autoClose: 4000,
        onClose: () => {
          setProducts((prev) => prev.filter((p) => p.id !== id));
          setSelectedProductIds((prev) => prev.filter((pId) => pId !== id));
          clearDiff(id);
        },
      });

      fetchProducts(true);
    } catch {
      clearDiff(id);
      toast.error('Action denied.');
    }
  };

  const handleBulkEditClick = () => {
    if (selectedProductIds.length === 1) {
      const singleProduct = products.find(
        (p) => p.id === selectedProductIds[0]
      );
      if (singleProduct) {
        handleEditClick(singleProduct);
        return;
      }
    }
    setShowBulkEditModal(true);
  };

  const handleSaveBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;

    const idsToDelete = [...selectedProductIds];
    const targetTitles = products
      .filter((p) => idsToDelete.includes(p.id))
      .map((p) => p.product_name)
      .join(', ');

    setShowBulkDeleteModal(false);
    setSelectedProductIds([]);

    // Register all IDs as deleted in highlights
    setActiveDiffs((prev) => {
      const next = { ...prev };
      idsToDelete.forEach((id) => {
        next[id] = { type: 'deleted' };
      });
      return next;
    });

    try {
      setSaving(true);
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      await logAudit(
        'BULK_PRODUCTS_DELETED',
        `Moved ${idsToDelete.length} products to Recycle Bin: "${targetTitles}".`
      );

      toast.success(`Moved ${idsToDelete.length} items to Recycle Bin.`, {
        autoClose: 4000,
        onClose: () => {
          setProducts((prev) =>
            prev.filter((p) => !idsToDelete.includes(p.id))
          );
          idsToDelete.forEach((id) => clearDiff(id));
        },
      });

      fetchProducts(true);
    } catch {
      idsToDelete.forEach((id) => clearDiff(id));
      setSelectedProductIds(idsToDelete);
      toast.error('Failed to perform bulk deletion.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      query === '' ||
      p.product_name.toLowerCase().includes(query) ||
      p.barcode_id.toLowerCase().includes(query) ||
      (p.manufacturer_barcode &&
        p.manufacturer_barcode.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (selectedStatusFilter === 'all') return true;
    if (selectedStatusFilter === 'active') return p.status === 'Active';
    if (selectedStatusFilter === 'inactive') return p.status === 'Inactive';
    if (selectedStatusFilter === 'low_stock') {
      return (
        p.has_stock_limit &&
        p.low_stock_alert !== null &&
        p.stock_quantity <= p.low_stock_alert
      );
    }
    if (selectedStatusFilter === 'unlimited') return !p.has_stock_limit;
    return true;
  });

  const isAllSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedProductIds.includes(p.id));
  const isSomeSelected = selectedProductIds.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map((p) => p.id));
    }
  };

  // Row Styling with Active Change Highlights
  const getRowStyle = (product: Product) => {
    const isSelected = selectedProductIds.includes(product.id);
    const diff = activeDiffs[product.id];
    const isHidden = product.status === 'Inactive';

    if (diff?.type === 'deleted') {
      return '!bg-rose-500/15 dark:!bg-rose-950/40 border-l-4 !border-rose-500 text-rose-950 dark:text-rose-200 opacity-75 pointer-events-none transition-all duration-300';
    }
    if (diff?.type === 'added') {
      return '!bg-emerald-500/15 dark:!bg-emerald-950/40 border-l-4 !border-emerald-500 shadow-sm transition-all duration-300';
    }
    if (diff?.type === 'updated') {
      return '!bg-blue-500/15 dark:!bg-blue-950/40 border-l-4 !border-blue-500 shadow-sm transition-all duration-300';
    }

    if (isSelected) {
      return 'group !bg-[#123c73]/10 dark:!bg-[#bf0202]/15 border-l-2 border-[#123c73] dark:border-[#bf0202] transition-colors duration-150';
    }
    if (isHidden) {
      return 'group bg-slate-100/50 dark:bg-[#161920]/40 hover:!bg-slate-200/50 dark:hover:!bg-[#1e232d]/50 opacity-60 text-slate-400 dark:text-slate-500 transition-colors duration-150';
    }
    return 'group hover:!bg-slate-100/70 dark:hover:!bg-[#1e232d]/60 transition-colors duration-150';
  };

  const handleRowClick = (product: Product) => {
    if (activeDiffs[product.id]?.type === 'deleted') return;
    setSelectedProductIds((prev) =>
      prev.includes(product.id)
        ? prev.filter((id) => id !== product.id)
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
            ref={(el) => {
              if (el) el.indeterminate = isSomeSelected;
            }}
            checked={isAllSelected}
            onChange={handleToggleSelectAll}
            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-105"
            title="Toggle Select All"
          />
        </div>
      ) : null,
      headerClassName: 'w-12 text-center',
      cellClassName: 'text-center p-0',
      render: (item) => {
        const isDeleted = activeDiffs[item.id]?.type === 'deleted';
        if (isDeleted) return null;

        return isSelectionActive ? (
          <label
            className="flex items-center justify-center w-full h-11 py-2 cursor-pointer transition-colors hover:bg-slate-500/5 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectedProductIds.includes(item.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedProductIds((prev) => [...prev, item.id]);
                } else {
                  setSelectedProductIds((prev) =>
                    prev.filter((id) => id !== item.id)
                  );
                }
              }}
              className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73] transition-transform duration-150 hover:scale-110"
            />
          </label>
        ) : null;
      },
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

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/tooltip:flex flex-col items-center z-[100] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl pointer-events-none min-w-[220px] max-w-[280px] animate-scale-up">
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-[6px] border-transparent border-b-white dark:border-b-slate-900" />
            <div className="bg-white p-3 rounded-xl border border-slate-100 dark:border-slate-800 w-full flex items-center justify-center overflow-hidden">
              <BarcodeComponent
                value={item.barcode_id}
                width={2}
                height={50}
                margin={0}
                displayValue={false}
              />
            </div>
            <div className="mt-2 text-center w-full px-1">
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {item.product_name}
              </p>
              <p className="text-[10px] font-mono text-slate-400 font-semibold tracking-wider mt-0.5">
                {item.barcode_id}
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'product_name',
      header: 'Product Name',
      sortable: true,
      render: (item) => {
        const diff = activeDiffs[item.id];
        const isAdded = diff?.type === 'added';
        const isUpdated = diff?.type === 'updated';
        const isDeleted = diff?.type === 'deleted';
        const oldName = diff?.previous?.product_name;
        const nameChanged = oldName && oldName !== item.product_name;

        return (
          <div className="flex items-center gap-3 py-1">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.product_name}
                className={`w-12 h-12 rounded-xl object-cover border border-(--border-color) shrink-0 ${
                  item.status === 'Inactive' || isDeleted
                    ? 'grayscale opacity-60'
                    : ''
                }`}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-455 font-bold text-lg shadow-inner shrink-0">
                {item.product_name[0]}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-semibold tracking-wide block text-sm ${
                    isDeleted
                      ? 'line-through text-rose-600 dark:text-rose-400'
                      : ''
                  }`}
                >
                  {item.product_name}
                </span>

                {/* Badges for active state changes */}
                {isAdded && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500 text-white font-mono text-[9px] font-extrabold uppercase tracking-wider shadow-xs animate-bounce">
                    <Sparkles className="w-2.5 h-2.5" /> NEW
                  </span>
                )}
                {isUpdated && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-mono text-[9px] font-extrabold uppercase tracking-wider shadow-xs">
                    UPDATED
                  </span>
                )}
                {isDeleted && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rose-600 text-white font-mono text-[9px] font-extrabold uppercase tracking-wider shadow-xs">
                    REMOVED
                  </span>
                )}
              </div>

              {/* Before/After Name Difference */}
              {isUpdated && nameChanged && (
                <span className="text-[10px] text-slate-400 line-through font-mono block mt-0.5">
                  was: "{oldName}"
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'selling_price',
      header: 'Price',
      sortable: true,
      headerClassName: 'text-right justify-end pr-6',
      cellClassName: 'text-right pr-6',
      render: (item) => {
        const diff = activeDiffs[item.id];
        const oldPrice = diff?.previous?.selling_price;
        const priceChanged =
          oldPrice !== undefined && oldPrice !== item.selling_price;
        const isDeleted = diff?.type === 'deleted';

        return (
          <div className="inline-flex flex-col items-end justify-center font-mono text-[13px]">
            {priceChanged && (
              <div className="text-[10px] font-mono text-slate-400 line-through leading-none mb-0.5">
                ₱{Number(oldPrice).toFixed(2)}
              </div>
            )}
            <div
              className={`inline-flex items-center gap-1 font-bold ${
                priceChanged
                  ? 'text-blue-600 dark:text-blue-400'
                  : isDeleted
                    ? 'line-through text-rose-500 opacity-60'
                    : 'opacity-95'
              }`}
            >
              <span className="text-slate-400 font-medium select-none">₱</span>
              <span>
                {Number(item.selling_price).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'stock_quantity',
      header: 'Inventory Stock',
      sortable: true,
      headerClassName: 'text-center justify-center',
      cellClassName: 'text-center',
      sortValue: (item) =>
        item.has_stock_limit ? item.stock_quantity : 999999,
      render: (item) => {
        const diff = activeDiffs[item.id];
        const oldStock = diff?.previous?.stock_quantity;
        const stockChanged =
          oldStock !== undefined && oldStock !== item.stock_quantity;

        if (stockChanged) {
          return (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-[10px] font-mono font-bold rounded-full border border-blue-500/30 text-blue-600 dark:text-blue-400">
              <span className="text-slate-400 line-through">{oldStock}</span>
              <span>→</span>
              <span className="font-extrabold">
                {item.stock_quantity} UNITS
              </span>
            </div>
          );
        }

        if (!item.has_stock_limit) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-[11px] text-blue-400 border border-blue-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              UNLIMITED
            </span>
          );
        }
        const isOut = item.stock_quantity === 0;
        const isLow =
          item.low_stock_alert !== null &&
          item.stock_quantity <= item.low_stock_alert;

        if (isOut) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-[11px] text-red-500 border border-red-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              NO STOCK
            </span>
          );
        }
        if (isLow) {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-[11px] text-amber-500 border border-amber-500/20 rounded-full font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              LOW ({item.stock_quantity})
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-[11px] text-emerald-500 border border-emerald-500/20 rounded-full font-bold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {item.stock_quantity} UNITS
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (item) => {
        const diff = activeDiffs[item.id];
        if (diff?.type === 'deleted') {
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/15 text-[10px] text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-full font-bold tracking-wider uppercase">
              <Trash2 className="w-3 h-3" /> DELETING
            </span>
          );
        }

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
      },
    },
    {
      key: 'actions',
      header: 'ACTIONS',
      headerClassName: 'text-right justify-end',
      cellClassName: 'text-right py-1',
      render: (item) => {
        const diff = activeDiffs[item.id];
        if (diff?.type === 'deleted') {
          return (
            <span className="text-[10px] font-mono font-bold text-rose-500 italic pr-2">
              Pending toast...
            </span>
          );
        }

        if (!isAdmin)
          return (
            <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">
              View Only
            </span>
          );

        const isSelected = selectedProductIds.includes(item.id);
        if (isSelected) return null;

        return (
          <div
            className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Edit Button */}
            <button
              onClick={() => handleEditClick(item)}
              className="flex items-center justify-center h-8 w-8 rounded-xl border transition-all duration-200 cursor-pointer shadow-xs active:scale-95 shrink-0
    bg-slate-100 text-slate-700 border-slate-200 hover:bg-[#123c73] hover:text-white hover:border-[#123c73]
    dark:bg-[#1e232d] dark:text-slate-200 dark:border-white/10 dark:hover:bg-[#bf0202] dark:hover:text-white dark:hover:border-[#bf0202]"
              title="Edit Product"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            {/* Delete Button */}
            <button
              onClick={() => setDeleteConfirmId(item.id)}
              className="flex items-center justify-center h-8 w-8 rounded-xl border transition-all duration-200 cursor-pointer shadow-xs active:scale-95 shrink-0
    bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-600 hover:text-white hover:border-rose-600
    dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 dark:hover:bg-rose-600 dark:hover:text-white dark:hover:border-rose-600"
              title="Delete Product"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    },
  ];

  const printableItems: PrintableItem[] = products.map((p) => ({
    id: p.id,
    barcode_id: p.barcode_id,
    product_name: p.product_name,
    selling_price: p.selling_price,
  }));

  const selectedProductsForBulkEdit = products
    .filter((p) => selectedProductIds.includes(p.id))
    .map((p) => ({
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
      {/* Search and Status Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-(--bg-card) p-3 rounded-xl border border-(--border-color) shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name, barcode, or manufacturer barcode..."
            className="w-full pl-10 pr-10 py-2 border border-(--border-color) rounded-lg bg-(--bg-input) text-xs text-(--color-text) placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-[#123c73] dark:focus:border-[#bf0202] transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-(--color-text) cursor-pointer p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-[#161920] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Filter:
          </span>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-(--bg-input) border border-(--border-color) rounded-lg text-xs text-(--color-text) font-semibold outline-none focus:border-[#123c73] dark:focus:border-[#bf0202] transition-all cursor-pointer"
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
      {selectedProductIds.length > 0 &&
        createPortal(
          <ProductBulkActions
            selectedCount={selectedProductIds.length}
            onClear={() => setSelectedProductIds([])}
            onPrint={() => setShowPrintModal(true)}
            onBulkEdit={handleBulkEditClick}
            onBulkDelete={() => setShowBulkDeleteModal(true)}
          />,
          document.body
        )}

      {/* Products Table & Mobile Cards */}
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
          <div className="w-16 h-16 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto text-slate-455">
            <PackageX className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-heading text-sm uppercase tracking-widest text-(--color-text)">
              No products found
            </h3>
            <p className="text-xs text-slate-455 max-w-xs mx-auto leading-relaxed">
              No items match your active search configurations.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* MOBILE VIEW */}
          <div className="space-y-3 md:hidden">
            {isSelectionActive && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-500/10 border border-(--border-color) rounded-xl select-none min-h-[48px]">
                <label
                  className="flex items-center gap-3 cursor-pointer py-2 px-2 -ml-1 rounded-lg hover:bg-slate-500/10 active:scale-[0.98] transition-all flex-1 min-h-[44px]"
                  onClick={() => {
                    const isAllSelected =
                      filteredProducts.length > 0 &&
                      filteredProducts.every((p) =>
                        selectedProductIds.includes(p.id)
                      );
                    if (isAllSelected) {
                      setSelectedProductIds([]);
                    } else {
                      setSelectedProductIds(filteredProducts.map((p) => p.id));
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    ref={(el) => {
                      if (el) {
                        const isAllSelected =
                          filteredProducts.length > 0 &&
                          filteredProducts.every((p) =>
                            selectedProductIds.includes(p.id)
                          );
                        el.indeterminate =
                          selectedProductIds.length > 0 && !isAllSelected;
                      }
                    }}
                    checked={
                      filteredProducts.length > 0 &&
                      filteredProducts.every((p) =>
                        selectedProductIds.includes(p.id)
                      )
                    }
                    onChange={() => {}}
                    className="w-5 h-5 rounded border-slate-300 dark:border-white/20 text-blue-600 accent-[#123c73] cursor-pointer shrink-0"
                  />
                  <span className="text-xs font-bold text-(--color-text)">
                    Selected Products{' '}
                    <span className="font-mono text-slate-400 font-normal">
                      ({selectedProductIds.length}/{filteredProducts.length})
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setSelectedProductIds([])}
                  className="text-[11px] font-bold text-rose-500 uppercase tracking-wider px-3 py-2 hover:bg-rose-500/10 rounded-lg active:scale-95 transition-all shrink-0 min-h-[44px] flex items-center"
                >
                  Deselect All
                </button>
              </div>
            )}

            {/* Mobile Product Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProducts.map((product) => {
                const isSelected = selectedProductIds.includes(product.id);
                const isHidden = product.status === 'Inactive';
                const diff = activeDiffs[product.id];
                const isAdded = diff?.type === 'added';
                const isUpdated = diff?.type === 'updated';
                const isDeleted = diff?.type === 'deleted';
                const oldPrice = diff?.previous?.selling_price;
                const oldStock = diff?.previous?.stock_quantity;

                return (
                  <div
                    key={product.id}
                    onClick={() => {
                      if (isDeleted) return;
                      setSelectedProductIds((prev) =>
                        prev.includes(product.id)
                          ? prev.filter((id) => id !== product.id)
                          : [...prev, product.id]
                      );
                    }}
                    className={`p-4 border rounded-2xl relative flex flex-col gap-3 transition-all duration-200 cursor-pointer ${
                      isDeleted
                        ? '!bg-rose-500/15 border-rose-500 opacity-75 pointer-events-none'
                        : isAdded
                          ? '!bg-emerald-500/15 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                          : isUpdated
                            ? '!bg-blue-500/15 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                            : isSelected
                              ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500 shadow-sm'
                              : isHidden
                                ? 'bg-slate-200/50 dark:bg-neutral-900/40 opacity-60 text-slate-455 dark:text-slate-500 border-(--border-color)'
                                : 'bg-(--bg-card) border-(--border-color) hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      {isSelectionActive && !isDeleted ? (
                        <label
                          className="flex items-center gap-2 cursor-pointer py-1.5 pr-4 min-h-[36px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedProductIds((prev) =>
                                prev.includes(product.id)
                                  ? prev.filter((id) => id !== product.id)
                                  : [...prev, product.id]
                              );
                            }}
                            className="w-5 h-5 rounded border-slate-300 dark:border-white/10 text-blue-600 cursor-pointer accent-[#123c73]"
                          />
                          <span className="text-[10px] font-bold uppercase select-none">
                            Select
                          </span>
                        </label>
                      ) : (
                        <div className="w-1" />
                      )}

                      <div className="flex items-center gap-1.5">
                        {isAdded && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-xs">
                            NEW
                          </span>
                        )}
                        {isUpdated && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                            UPDATED
                          </span>
                        )}
                        {isDeleted && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-600 text-white shadow-xs">
                            REMOVED
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            product.status === 'Active'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-slate-500/10 text-slate-455'
                          }`}
                        >
                          {product.status === 'Active' ? 'VISIBLE' : 'HIDDEN'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 min-h-12 text-xs font-semibold">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.product_name}
                            className={`w-12 h-12 rounded-xl object-cover border border-(--border-color) shrink-0 ${
                              isHidden || isDeleted
                                ? 'grayscale opacity-65'
                                : ''
                            }`}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-400 font-bold text-lg shadow-inner shrink-0">
                            {product.product_name[0]}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <h4
                            className={`font-semibold text-sm truncate leading-snug ${
                              isDeleted ? 'line-through text-rose-500' : ''
                            }`}
                          >
                            {product.product_name}
                          </h4>

                          <div className="flex items-center gap-1.5 mt-0.5 font-mono">
                            {oldPrice !== undefined &&
                              oldPrice !== product.selling_price && (
                                <span className="text-xs text-slate-400 line-through">
                                  ₱{oldPrice.toFixed(2)}
                                </span>
                              )}
                            <p className="font-bold text-emerald-500 text-sm leading-none">
                              ₱{product.selling_price.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="bg-white p-2 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm shrink-0 flex items-center justify-center animate-scale-up">
                          <BarcodeComponent
                            value={product.barcode_id}
                            width={2}
                            height={36}
                            margin={8}
                            displayValue={false}
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-(--border-color) pt-2 text-[11px] leading-none">
                      <div className="space-y-1">
                        <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase text-[9px] block">
                          Stock Status
                        </span>
                        <span className="font-bold inline-block">
                          {oldStock !== undefined &&
                          oldStock !== product.stock_quantity ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono">
                              <span className="line-through text-slate-400">
                                {oldStock}
                              </span>
                              <span>→</span>
                              <span className="text-blue-500">
                                {product.stock_quantity} UNITS
                              </span>
                            </span>
                          ) : !product.has_stock_limit ? (
                            <span className="text-blue-400">UNLIMITED</span>
                          ) : product.stock_quantity === 0 ? (
                            <span className="text-red-500">OUT OF STOCK</span>
                          ) : (
                            <span className="text-slate-350">
                              {product.stock_quantity} UNITS
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="space-y-1 text-right">
                        <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase text-[9px] block">
                          Code Number
                        </span>
                        <span className="font-mono font-bold text-slate-400 dark:text-slate-300 inline-block">
                          {product.barcode_id}
                          {product.manufacturer_barcode && (
                            <span className="block text-[9px] text-slate-500 dark:text-slate-400 font-normal mt-1">
                              MFG: {product.manufacturer_barcode}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {isAdmin &&
                      isSelected &&
                      selectedProductIds.length === 1 &&
                      !isDeleted && (
                        <div
                          className="flex gap-2 mt-1 pt-2 border-t border-(--border-color) animate-slide-up"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleEditClick(product)}
                            className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors min-h-[44px]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Item
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(product.id)}
                            className="flex-1 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-655 hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>

                          <button
                            onClick={() => {
                              setSelectedProductIds((prev) =>
                                prev.filter((id) => id !== product.id)
                              );
                            }}
                            className="px-3 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer hover:bg-slate-350 dark:hover:bg-slate-750 transition-colors min-h-[44px]"
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
          </div>

          {/* DESKTOP VIEW */}
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

          {/* QUICK ACTION: ADD NEW PRODUCT BUTTON (DESKTOP & TABLET ONLY) */}
          {isAdmin && (
            <motion.button
              whileHover={{ scale: 1.008 }}
              whileTap={{ scale: 0.985 }}
              type="button"
              onClick={handleCreateClick}
              className="hidden sm:flex w-full py-3.5 px-4 rounded-2xl bg-[#123c73] hover:bg-[#0e2f5a] dark:bg-[#bf0202] dark:hover:bg-[#a10202] text-white font-heading font-black text-xs sm:text-sm tracking-wider uppercase items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border border-white/10 group mt-4 select-none"
            >
              <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300 shrink-0">
                <Plus className="w-4 h-4 text-white" />
              </div>
              <span>ADD NEW PRODUCT</span>
            </motion.button>
          )}
        </>
      )}

      {/* Create / Edit Form Modal */}
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

      {/* Destructive Delete Confirm Dialog */}
      {deleteConfirmId &&
        createPortal(
          (() => {
            const productToDelete = products.find(
              (p) => p.id === deleteConfirmId
            );
            if (!productToDelete) return null;
            return (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in text-xs text-(--color-text)">
                <div className="bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-5 animate-scale-up">
                  <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Trash2 className="w-6 h-6 animate-bounce" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-heading text-sm tracking-wider uppercase text-red-500">
                      Confirm Deletion
                    </h4>
                    <p className="text-slate-455 text-[11px] font-medium leading-relaxed font-sans">
                      You are about to move this item to your products recycle
                      bin. You can recover it from the Recycle Bin within 30
                      days.
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
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest block leading-none">
                        Catalog Item
                      </span>
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
                      className="px-5 py-2.5 bg-red-655 bg-red-900 hover:bg-red-700 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 font-bold shadow-lg shadow-red-600/20"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

      {/* Barcode Print Workspace Modal */}
      {showPrintModal && (
        <BarcodePrintModal
          products={printableItems}
          initialSelectedIds={selectedProductIds}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Spreadsheet Bulk Editor Modal */}
      {showBulkEditModal && (
        <BulkEditModal
          isOpen={showBulkEditModal}
          onClose={() => setShowBulkEditModal(false)}
          selectedProducts={selectedProductsForBulkEdit}
          onSaveSuccess={() => {
            setSelectedProductIds([]);
            fetchProducts(true);
          }}
        />
      )}

      {/* Bulk Deletion Confirmation Modal */}
      {showBulkDeleteModal &&
        createPortal(
          <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="bg-(--bg-card) border border-(--border-color) rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-5 animate-scale-up text-xs text-(--color-text)">
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-6 h-6 animate-bounce" />
              </div>

              <div className="space-y-1">
                <h4 className="font-heading text-sm tracking-wider uppercase text-red-500">
                  Confirm Deletion
                </h4>
                <p className="text-slate-455 text-[11px] font-medium leading-relaxed font-sans">
                  You are about to move these{' '}
                  <strong>{selectedProductIds.length}</strong> selected products
                  to your products recycle bin. You can restore them from the
                  Recycle Bin within 30 days.
                </p>
              </div>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 my-4">
                {products
                  .filter((p) => selectedProductIds.includes(p.id))
                  .map((productToDelete) => (
                    <div
                      key={productToDelete.id}
                      className="p-3 bg-slate-100 dark:bg-[#1e232d] border border-(--border-color) rounded-2xl flex items-center gap-4 text-left shadow-inner"
                    >
                      {productToDelete.image_url ? (
                        <img
                          src={productToDelete.image_url}
                          alt={productToDelete.product_name}
                          className="w-12 h-12 rounded-xl object-cover border border-(--border-color) shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-(--bg-page) border border-(--border-color) flex items-center justify-center text-slate-450 font-heading text-lg uppercase shadow-inner">
                          {productToDelete.product_name[0]}
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="text-[9px] font-heading font-black tracking-widest text-rose-500 uppercase block leading-none">
                          Catalog Item
                        </span>
                        <h5 className="font-bold text-xs truncate leading-snug text-(--color-text)">
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
                  ))}
              </div>

              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="px-4 py-2.5 border border-(--border-color) bg-(--bg-card) text-slate-500 hover:text-slate-200 rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer"
                >
                  No, Cancel
                </button>
                <button
                  onClick={handleSaveBulkDelete}
                  disabled={saving}
                  className="px-5 py-2.5 bg-red-655 bg-red-900 hover:bg-red-700 text-white rounded-xl text-[10px] font-heading tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 font-bold shadow-lg shadow-red-600/20"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Product Recovery Bin Modal */}
      <ProductRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        onRestoreSuccess={() => {
          fetchProducts(true);
        }}
      />

      {/* MOBILE DIRECT ACTION BOTTOM BAR FOR PRODUCTS */}
      {location.pathname.startsWith('/sales/products') &&
        selectedProductIds.length === 0 &&
        createPortal(
          <div
            className={`md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 h-14 bg-(--bg-card)/95 border border-(--border-color) rounded-2xl flex items-center justify-between px-3.5 z-[190] shadow-2xl transition-all duration-300 ease-in-out ${
              isNavFloatingOpen
                ? 'translate-y-24 opacity-0 pointer-events-none'
                : 'translate-y-0 opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-heading font-bold text-(--color-text) select-none min-w-0 pr-2">
              <div className="flex items-center gap-1 text-[#123c73] dark:text-[#bf0202] shrink-0">
                <Package className="w-3.5 h-3.5" />
                <span className="text-[11px]">{products.length} Products</span>
              </div>
              <span className="text-slate-300 dark:text-zinc-700">•</span>
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] truncate">
                  {stats.active} Active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(true)}
                  className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                  title="Recycle Bin"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                title="Print Sheet Labels"
              >
                <Printer className="w-4 h-4" />
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleCreateClick}
                  className="h-9 px-3 rounded-xl bg-[#123c73] dark:bg-[#bf0202] text-white flex items-center justify-center gap-1 text-xs font-heading font-bold uppercase tracking-wider shadow-md border border-white/10 cursor-pointer active:scale-95 transition-transform"
                  title="Add New Item"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-[10px] hidden xs:inline">Add</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
