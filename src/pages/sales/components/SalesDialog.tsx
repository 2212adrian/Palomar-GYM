// src/pages/sales/components/SalesDialog.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { 
  Search, 
  Check, 
  X, 
  ShoppingCart, 
  QrCode, 
  RefreshCw, 
  Camera as CameraIcon, 
  SwitchCamera 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client';

interface SalesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onSaleSuccess: (newTx: any, updatedProducts: any[]) => Promise<void> | void;
}

interface CartItem {
  product: any;
  quantity: number;
}

export const SalesDialog: React.FC<SalesDialogProps> = ({
  isOpen,
  onClose,
  products,
  onSaleSuccess,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [ratesConfig, setRatesConfig] = useState<any>(null);

  // Live Camera & Scanner State
  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [isScanningLoading, setIsScanningLoading] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Synchronous ref to instantly block spam clicks
  const isSubmittingRef = useRef(false);

  // Fetch rates configurations from database
  useEffect(() => {
    const fetchRatesConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('rates_config')
          .select('*')
          .eq('id', 1)
          .single();
        if (!error && data) {
          setRatesConfig(data);
        }
      } catch (err) {
        console.error('Error fetching rates_config inside SalesDialog:', err);
      }
    };
    if (isOpen) {
      fetchRatesConfig();
    }
  }, [isOpen]);

  // Schema-independent helper attributes
  const getProductName = (p: any) => p.product_name || p.name || 'Unnamed Product';
  const getProductPrice = (p: any) => Number(p.selling_price || p.sellingPrice || 0);
  const getProductStock = (p: any) => p.stock_quantity !== undefined ? p.stock_quantity : (p.stock !== undefined ? p.stock : 0);
  const getProductBarcode = (p: any) => p.barcode_id || p.barcode || 'N/A';
  const hasStockLimit = (p: any) => p.has_stock_limit === true || p.hasStockLimit === true;

  // Reset submit references & states when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setShowLiveScanner(false);
      setSearchTerm('');
    }
  }, [isOpen]);

  // Fetch available camera devices when live scanner becomes active
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

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  const handleBarcodeScanned = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setSearchTerm(trimmed);
    toast.success(`Scanned: ${trimmed}`);

    // Exact product match lookup
    const exactMatch = products.find((p: any) => {
      if (p.hidden) return false;
      const bc = (p.barcode_id || p.barcode || '').toLowerCase();
      const mfg = (p.manufacturer_barcode || p.manufacturerBarcode || '').toLowerCase();
      return bc === trimmed.toLowerCase() || mfg === trimmed.toLowerCase();
    });

    if (exactMatch) {
      handleAddToCart(exactMatch);
      toast.info(`Added ${getProductName(exactMatch)} to cart.`);
    }
  };

  // Live Camera Scanner lifecycle effect
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (showLiveScanner) {
      const element = document.getElementById('sales-qr-reader');
      if (element) {
        html5QrCode = new Html5Qrcode('sales-qr-reader');
        const cameraConfig = selectedCameraId ? selectedCameraId : { facingMode: 'environment' };

        html5QrCode
          .start(
            cameraConfig,
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              handleBarcodeScanned(decodedText);
              setShowLiveScanner(false);
            },
            () => {}
          )
          .catch((err) => {
            console.error('Live camera start failed:', err);
            
            // Auto-fallback: switch to the next available camera if multiple exist
            if (cameras.length > 1) {
              const currentIndex = selectedCameraId
                ? cameras.findIndex((c) => c.id === selectedCameraId)
                : -1;
              const nextIndex = (currentIndex + 1) % cameras.length;
              const nextCamera = cameras[nextIndex];

              try { html5QrCode?.clear(); } catch (e) {}
              setSelectedCameraId(nextCamera.id);
              toast.info(`Camera unavailable. Switching to ${nextCamera.label || 'next camera'}...`);
            } else {
              toast.error('Unable to access camera feed.');
              setShowLiveScanner(false);
            }
          });
      }
    }

    return () => {
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode
            .stop()
            .then(() => {
              try { html5QrCode?.clear(); } catch (e) {}
            })
            .catch(console.error);
        } else {
          try { html5QrCode.clear(); } catch (e) {}
        }
      }
    };
  }, [showLiveScanner, selectedCameraId]);

  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const status = await CapacitorCamera.checkPermissions();
      if (status.camera !== 'granted') {
        const requestRes = await CapacitorCamera.requestPermissions({ permissions: ['camera'] });
        if (requestRes.camera !== 'granted') {
          toast.error('Camera permission was denied.');
          return false;
        }
      }
      return true;
    } catch (err) {
      console.warn('Permission request failed:', err);
      return true;
    }
  };

  const scanImageFile = async (file: File) => {
    let html5QrCode: Html5Qrcode | null = null;
    try {
      html5QrCode = new Html5Qrcode('sales-qr-reader-hidden');
      const decodedText = await html5QrCode.scanFile(file, false);
      if (decodedText) {
        handleBarcodeScanned(decodedText);
        return true;
      }
    } catch (err) {
      console.warn('Scan file failed:', err);
      toast.error('No valid barcode or QR code detected in image.');
    } finally {
      if (html5QrCode) {
        try { html5QrCode.clear(); } catch (e) {}
      }
    }
    return false;
  };

  const handleCapacitorCameraScan = async () => {
    setIsScanningLoading(true);
    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      if (photo && photo.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const file = new File([blob], 'scanned_barcode.jpg', { type: blob.type || 'image/jpeg' });
        await scanImageFile(file);
      }
    } catch (error: any) {
      if (
        error?.message !== 'User cancelled photos app' && 
        error?.message !== 'User cancelled photo'
      ) {
        console.warn('Capacitor camera error:', error);
        setShowLiveScanner(true);
      }
    } finally {
      setIsScanningLoading(false);
    }
  };

  const handleStartScan = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    if (Capacitor.isNativePlatform()) {
      await handleCapacitorCameraScan();
    } else {
      setShowLiveScanner((prev) => !prev);
    }
  };

  // Product instant lookup
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return products.filter((p: any) => {
      if (p.hidden) return false;
      const name = getProductName(p).toLowerCase();
      const barcode = getProductBarcode(p).toLowerCase();
      const mfgBarcode = (p.manufacturer_barcode || p.manufacturerBarcode || '').toLowerCase();
      return name.includes(q) || barcode.includes(q) || mfgBarcode.includes(q);
    });
  }, [products, searchTerm]);

  // Compute GCash Convenience Fee based on payment method
  const gcashFee = useMemo(() => {
    if (paymentMethod !== 'GCash') return 0;
    return ratesConfig?.gcash_fee !== undefined ? Number(ratesConfig.gcash_fee) : 10.00;
  }, [paymentMethod, ratesConfig]);

  // Compute total payable amount (includes GCash fee if applicable)
  const totalPayable = useMemo(() => {
    const cartTotal = cart.reduce((sum, item) => sum + (getProductPrice(item.product) * item.quantity), 0);
    return cartTotal + gcashFee;
  }, [cart, gcashFee]);

  // AUTOMATIC CASH RECEIVED: Prefills exact total cost to speed up transactions
  useEffect(() => {
    if (paymentMethod === 'Cash') {
      setAmountReceived(totalPayable > 0 ? totalPayable.toString() : '');
    } else {
      setAmountReceived('');
    }
  }, [paymentMethod, totalPayable]);

  const handleAddToCart = (product: any) => {
    const stock = getProductStock(product);
    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    const limitActive = hasStockLimit(product);

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (!limitActive || currentQty < stock) {
        const updatedCart = [...cart];
        updatedCart[existingIndex].quantity += 1;
        setCart(updatedCart);
      } else {
        toast.error('Cannot add more. Stock limit reached.');
      }
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    setSearchTerm(''); 
  };

  const handleUpdateQuantity = (idx: number, delta: number) => {
    const updatedCart = [...cart];
    const item = updatedCart[idx];
    const stock = getProductStock(item.product);
    const newQty = item.quantity + delta;
    const limitActive = hasStockLimit(item.product);

    if (newQty <= 0) {
      updatedCart.splice(idx, 1);
    } else {
      if (!limitActive || newQty <= stock) {
        item.quantity = newQty;
      } else {
        toast.error('Limit reached. Cannot exceed available inventory.');
        return;
      }
    }
    setCart(updatedCart);
  };

  const handleCompleteSale = async () => {
    if (isSubmittingRef.current || isSuccess) {
      return;
    }

    if (cart.length === 0) {
      toast.error('Your shopping cart is empty.');
      return;
    }

    if (paymentMethod === 'Cash') {
      const received = Number(amountReceived);
      if (isNaN(received) || received < totalPayable) {
        toast.error('Insufficient cash received.');
        return;
      }
    } else {
      if (!referenceNumber.trim() || referenceNumber.trim().length < 6) {
        toast.error('A valid GCash reference number is required.');
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true); 

    try {
      // Process Stock Update for each cart item
      const updatedProducts = products.map((p: any) => {
        const cartItem = cart.find(item => item.product.id === p.id);
        if (cartItem) {
          const stock = getProductStock(p);
          const limitActive = hasStockLimit(p);
          if (limitActive) {
            const newStock = Math.max(0, stock - cartItem.quantity);
            if (p.stock_quantity !== undefined) {
              return { ...p, stock_quantity: newStock };
            } else {
              return { ...p, stock: newStock };
            }
          }
        }
        return p;
      });

      const now = new Date();
      const newTx = {
        id: `TX-${Math.floor(100000 + Math.random() * 900000)}`,
        items: cart.map(item => ({
          productId: item.product.id,
          productName: getProductName(item.product),
          quantity: item.quantity,
          price: getProductPrice(item.product),
        })),
        productName: cart.map(item => `${item.quantity}x ${getProductName(item.product)}`).join(', '),
        barcode: cart.map(item => getProductBarcode(item.product)).join(', '),
        quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
        paymentMethod,
        amountReceived: paymentMethod === 'Cash' ? Number(amountReceived) : null,
        changeCalculated: paymentMethod === 'Cash' ? Math.max(0, Number(amountReceived) - totalPayable) : null,
        referenceNumber: paymentMethod === 'GCash' ? referenceNumber : null,
        totalAmount: totalPayable,
        createdAt: now.toISOString(),
        date: format(now, 'yyyy-MM-dd'),
      };

      // Await database insertion FIRST before displaying success modal
      await onSaleSuccess(newTx, updatedProducts);

      // Only display success modal if insertion succeeded
      setIsSuccess(true);

      setTimeout(() => {
        setIsSuccess(false);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setCart([]);
        setSearchTerm('');
        setAmountReceived('');
        setReferenceNumber('');
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Sale execution error:', err);
      // Reset submit state on error so user can retry
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="RECORD SALE TRANSACTION"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body relative text-left"
    >
      <div id="sales-qr-reader-hidden" className="hidden" aria-hidden="true" />

      <button
        type="button"
        disabled={isSubmitting}
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
        aria-label="Close Dialog"
      >
        <X className="w-5 h-5" />
      </button>

      <AnimatePresence mode="wait">
        {!isSuccess ? (
          <motion.div
            key="sales-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4 text-left pt-2"
          >
            {/* SEARCH INPUT & BARCODE SCANNER BUTTON */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Search Product or Scan Barcode
              </label>

              <div className="relative group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500" />
                <input
                  type="text"
                  placeholder={showLiveScanner ? "CAMERA SCANNER ACTIVE..." : "TYPE NAME OR SCAN BARCODE..."}
                  disabled={isSubmitting || showLiveScanner}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-20 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-xs font-bold transition-all uppercase ${
                    showLiveScanner 
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-zinc-900 text-slate-400' 
                      : 'text-[var(--color-text)] focus:border-blue-500'
                  }`}
                  autoFocus
                />

                {searchTerm && !showLiveScanner && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-11 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-full text-slate-400 hover:text-[var(--color-text)] transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={isScanningLoading || isSubmitting}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                    showLiveScanner 
                      ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-500/50 animate-pulse' 
                      : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                  title="Scan Barcode / QR Code"
                >
                  {isScanningLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <QrCode className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* LIVE CAMERA VIEWFINDER OVERLAY */}
              {showLiveScanner && (
                <div className="mt-2 p-3 bg-zinc-950 border-2 border-blue-500/40 rounded-2xl relative text-center animate-fade-in z-30 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      BARCODE SCANNER ACTIVE
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLiveScanner(false)}
                      className="text-xs text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative w-full aspect-square max-w-55 mx-auto rounded-2xl overflow-hidden bg-black border-2 border-dashed border-blue-500/50 flex items-center justify-center shadow-inner">
                    <div id="sales-qr-reader" className="w-full h-full object-cover" />
                    
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <div className="w-full h-full border-2 border-blue-500 rounded-xl relative animate-pulse">
                        <div className="absolute -top-1 -left-1 w-3.5 h-3.5 border-t-4 border-l-4 border-blue-400" />
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 border-t-4 border-r-4 border-blue-400" />
                        <div className="absolute -bottom-1 -left-1 w-3.5 h-3.5 border-b-4 border-l-4 border-blue-400" />
                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 border-b-4 border-r-4 border-blue-400" />
                      </div>
                    </div>
                  </div>

                  {/* CAMERA SWITCHER CONTROLS */}
                  {cameras.length > 0 && (
                    <div className="flex items-center justify-between gap-2 pt-1 max-w-55 mx-auto">
                      <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-1.5 w-full">
                        <CameraIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <select
                          value={selectedCameraId}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                          className="w-full bg-transparent text-[10px] font-bold text-slate-200 outline-none cursor-pointer truncate"
                        >
                          {cameras.map((cam, idx) => (
                            <option key={cam.id} value={cam.id} className="bg-zinc-900 text-white">
                              {cam.label || `Camera ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      {cameras.length > 1 && (
                        <button
                          type="button"
                          onClick={handleCycleCamera}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-xl transition-colors cursor-pointer border border-zinc-700 shrink-0"
                          title="Switch Camera"
                        >
                          <SwitchCamera className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {Capacitor.isNativePlatform() && (
                    <button
                      type="button"
                      onClick={handleCapacitorCameraScan}
                      className="text-[11px] font-bold text-amber-400 hover:underline uppercase tracking-wider block mx-auto cursor-pointer"
                    >
                      Snap Photo with Native Camera
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* SEARCH RESULTS SUGGESTIONS */}
            {searchTerm && (
              <div className="max-h-40 overflow-y-auto border border-[var(--border-color)] bg-[var(--bg-input)] rounded-xl divide-y divide-[var(--border-color)] shadow-inner">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((p: any) => {
                    const limitActive = hasStockLimit(p);
                    const isOutOfStock = limitActive && getProductStock(p) <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isOutOfStock || isSubmitting}
                        onClick={() => handleAddToCart(p)}
                        className={`w-full p-2.5 flex items-center justify-between text-left transition-all hover:bg-slate-200/50 dark:hover:bg-zinc-800 ${
                          isOutOfStock || isSubmitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-[var(--color-text)] uppercase">{getProductName(p)}</div>
                          <div className="text-[9px] text-slate-500 font-mono">Barcode: {getProductBarcode(p)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-heading text-[var(--color-text)] font-bold">₱{getProductPrice(p).toFixed(2)}</div>
                          <div className="text-[9px] font-sans font-bold text-slate-400">
                            {isOutOfStock ? 'OUT OF STOCK' : (!limitActive ? 'UNLIMITED' : `Stock: ${getProductStock(p)}`)}
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-slate-500">
                    No matching products found.
                  </div>
                )}
              </div>
            )}

            {/* SHOPPING CART LIST */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase">
                <ShoppingCart className="w-4 h-4" />
                <span>Selected items ({cart.length})</span>
              </div>

              {cart.length > 0 ? (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {cart.map((item, idx) => (
                    <motion.div
                      key={item.product.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-[var(--color-text)] truncate uppercase">{getProductName(item.product)}</h4>
                        <span className="text-[10px] text-[var(--color-primary)] font-heading font-bold mt-0.5 block">₱{getProductPrice(item.product).toFixed(2)}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleUpdateQuantity(idx, -1)}
                          className="w-7 h-7 border border-[var(--border-color)] bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center font-heading hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <span className="font-heading w-4 text-center text-xs font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleUpdateQuantity(idx, 1)}
                          className="w-7 h-7 border border-[var(--border-color)] bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center font-heading hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border border-dashed border-[var(--border-color)] rounded-xl text-center text-xs text-slate-400">
                  Cart is empty. Search or scan a barcode to add products.
                </div>
              )}
            </div>

            {/* PAYMENT METHOD SELECTOR */}
            {cart.length > 0 && (
              <div className="space-y-3 border-t border-[var(--border-color)] pt-3">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Choose Payment Method
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setPaymentMethod('Cash')}
                    className={`py-2.5 rounded-xl font-heading text-xs font-bold uppercase tracking-wider border transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                      paymentMethod === 'Cash'
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-sm'
                        : 'bg-transparent border-[var(--border-color)] text-slate-500'
                    }`}
                  >
                    CASH
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setPaymentMethod('GCash')}
                    className={`py-2.5 rounded-xl font-heading text-xs font-bold uppercase tracking-wider border transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                      paymentMethod === 'GCash'
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-sm'
                        : 'bg-transparent border-[var(--border-color)] text-slate-500'
                    }`}
                  >
                    GCASH
                  </button>
                </div>

                {paymentMethod === 'Cash' ? (
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">Amount Received (PHP)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        disabled={isSubmitting}
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-[var(--bg-page)] border border-[var(--border-color)] rounded-xl outline-none text-[var(--color-text)] font-mono font-bold text-sm"
                      />
                    </div>
                    
                    {amountReceived && (
                      <div className="text-xs font-sans text-emerald-600 dark:text-emerald-400 mt-1 flex justify-between font-bold">
                        <span>Calculated Change:</span>
                        <span>₱{Math.max(0, Number(amountReceived) - totalPayable).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">GCash Reference Number</label>
                    <input
                      type="text"
                      placeholder="Enter reference code..."
                      disabled={isSubmitting}
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-page)] border border-[var(--border-color)] rounded-xl outline-none text-[var(--color-text)] font-mono font-bold text-xs uppercase"
                    />
                    
                    {referenceNumber.trim().length >= 6 && (
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans mt-1 flex items-center gap-1 font-bold">
                        <Check className="w-3.5 h-3.5" /> GCash reference code recorded.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* RECEIPT SUMMARY BREAKDOWN */}
            {cart.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-[var(--border-color)] space-y-1.5 text-xs font-sans">
                <div className="flex justify-between text-slate-500">
                  <span>Unique Items:</span>
                  <span className="font-bold text-[var(--color-text)]">{cart.length} items</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Total Units:</span>
                  <span className="font-bold text-[var(--color-text)]">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                {paymentMethod === 'GCash' && gcashFee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>GCash Fee Applied:</span>
                    <span className="text-rose-500 font-bold">+₱{gcashFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-[var(--border-color)] pt-1.5 flex justify-between font-heading text-sm text-[var(--color-text)]">
                  <span>TOTAL PAYABLE:</span>
                  <span className="text-[var(--color-primary)] font-extrabold text-base">
                    ₱{totalPayable.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* SUBMIT BUTTON */}
            <div className="pt-3">
              <Button
                onClick={handleCompleteSale}
                disabled={cart.length === 0 || isSubmitting}
                className={`py-3.5 w-full font-bold text-xs uppercase tracking-wider ${isSubmitting ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
              >
                {isSubmitting ? 'PROCESSING TRANSACTION...' : 'COMPLETE TRANSACTION'}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sales-success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="py-12 flex flex-col items-center justify-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-pulse">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="font-heading text-lg font-bold tracking-wider text-[var(--color-text)] uppercase">
              SALE AUTHORIZED
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs text-center font-body animate-pulse uppercase font-semibold">
              Transaction committed to ledger, stock inventory updated.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>,
    document.body
  );
};