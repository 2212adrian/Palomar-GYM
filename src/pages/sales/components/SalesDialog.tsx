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
  SwitchCamera,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { supabase } from '../../../lib/supabase/client';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { useSessionLock } from '../../../hooks/useSessionLock';
import beepSoundUrl from '../../../assets/beep-scanner.mp3';

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

const getCameraErrorMessage = (err: any): string => {
  const msg = typeof err === 'string' ? err : err?.message || String(err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('notallowederror') || lower.includes('permission'))
    return 'Permission denied by browser';
  if (lower.includes('notreadableerror') || lower.includes('in use'))
    return 'Camera is busy or in use';
  if (lower.includes('notfounderror')) return 'Camera hardware not found';
  return msg || 'Camera initialization failed';
};

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

  // Cash Session State
  const { isSessionOpen } = useCashSessionStore();
  const { isLocked, getLockReason } = useSessionLock();

  // Live Camera & Scanner State
  const [showLiveScanner, setShowLiveScanner] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const isSubmittingRef = useRef(false);

  const playBeepSound = () => {
    try {
      const audio = new Audio(beepSoundUrl);
      audio.currentTime = 0;
      audio.play().catch((err) => {
        console.warn('Audio playback prevented or failed:', err);
      });
    } catch (err) {
      console.warn('Audio creation error:', err);
    }
  };

  const stopAllCameraTracks = () => {
    if (scannerRef.current) {
      if (scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .then(() => {
            try {
              scannerRef.current?.clear();
            } catch (e) {}
          })
          .catch(() => {});
      } else {
        try {
          scannerRef.current.clear();
        } catch (e) {}
      }
      scannerRef.current = null;
    }

    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video) => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        video.srcObject = null;
      }
    });
  };

  // Fetch rates configurations
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

  const getProductName = (p: any) =>
    p.product_name || p.name || 'Unnamed Product';
  const getProductPrice = (p: any) =>
    Number(p.selling_price || p.sellingPrice || 0);
  const getProductStock = (p: any) =>
    p.stock_quantity !== undefined
      ? p.stock_quantity
      : p.stock !== undefined
        ? p.stock
        : 0;
  const getProductBarcode = (p: any) => p.barcode_id || p.barcode || 'N/A';
  const hasStockLimit = (p: any) =>
    p.has_stock_limit === true || p.hasStockLimit === true;

  useEffect(() => {
    if (isOpen) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setShowLiveScanner(false);
      setSearchTerm('');
    } else {
      stopAllCameraTracks();
    }
  }, [isOpen]);

  // Fetch camera list and default to back/rear camera when scanner becomes active
  useEffect(() => {
    if (showLiveScanner) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);

            // Find back/rear camera by label keywords
            const backCam = devices.find((d) => {
              const label = d.label.toLowerCase();
              return (
                label.includes('back') ||
                label.includes('rear') ||
                label.includes('environment') ||
                label.includes('facing back')
              );
            });

            // Default to back camera if found, otherwise fallback to first available
            const defaultCameraId = backCam ? backCam.id : devices[0].id;
            setSelectedCameraId(defaultCameraId);
          }
        })
        .catch((err) => {
          console.warn('Could not list cameras:', err);
        });
    } else {
      stopAllCameraTracks();
    }
  }, [showLiveScanner]);
  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    stopAllCameraTracks();
    setSelectedCameraId(cameras[nextIndex].id);
  };

  const handleBarcodeScanned = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setSearchTerm(trimmed);

    const exactMatch = products.find((p: any) => {
      if (p.hidden) return false;
      const bc = (p.barcode_id || p.barcode || '').toLowerCase();
      const mfg = (
        p.manufacturer_barcode ||
        p.manufacturerBarcode ||
        ''
      ).toLowerCase();
      return bc === trimmed.toLowerCase() || mfg === trimmed.toLowerCase();
    });

    if (exactMatch) {
      playBeepSound();
      handleAddToCart(exactMatch);
      toast.info(`Added ${getProductName(exactMatch)} to cart.`);
    }
  };

  // Live Camera Scanner lifecycle
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let isCancelled = false;

    if (showLiveScanner) {
      const timer = setTimeout(() => {
        const element = document.getElementById('sales-qr-reader');
        if (!element || isCancelled) return;

        try {
          html5QrCode = new Html5Qrcode('sales-qr-reader', {
            verbose: false,
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.UPC_A,
            ],
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
          });
          scannerRef.current = html5QrCode;

          const cameraConfig = selectedCameraId
            ? { deviceId: { exact: selectedCameraId } }
            : { facingMode: 'environment' };

          html5QrCode
            .start(
              cameraConfig,
              {
                fps: 25,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
                  width: Math.min(Math.floor(viewfinderWidth * 0.88), 380),
                  height: Math.min(Math.floor(viewfinderHeight * 0.45), 160),
                }),
                videoConstraints: {
                  ...cameraConfig,
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: 'environment',
                },
              },
              (decodedText) => {
                handleBarcodeScanned(decodedText);
                setShowLiveScanner(false);
                stopAllCameraTracks();
              },
              () => {}
            )
            .catch((err) => {
              if (!isCancelled) {
                const reason = getCameraErrorMessage(err);
                if (cameras.length > 1) {
                  const currentIndex = selectedCameraId
                    ? cameras.findIndex((c) => c.id === selectedCameraId)
                    : -1;
                  const nextCamera =
                    cameras[(currentIndex + 1) % cameras.length];
                  stopAllCameraTracks();
                  setSelectedCameraId(nextCamera.id);
                  toast.info(
                    `Switching camera: ${nextCamera.label || 'Next Camera'}`
                  );
                } else {
                  toast.error(`Camera Error: ${reason}`);
                  setShowLiveScanner(false);
                  stopAllCameraTracks();
                }
              }
            });
        } catch (e) {
          console.error('Sales scanner init error:', e);
        }
      }, 250);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
        stopAllCameraTracks();
      };
    }
  }, [showLiveScanner, selectedCameraId]);

  const handleStartScan = () => {
    setShowLiveScanner((prev) => !prev);
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return products.filter((p: any) => {
      if (p.hidden) return false;
      const name = getProductName(p).toLowerCase();
      const barcode = getProductBarcode(p).toLowerCase();
      const mfgBarcode = (
        p.manufacturer_barcode ||
        p.manufacturerBarcode ||
        ''
      ).toLowerCase();
      return name.includes(q) || barcode.includes(q) || mfgBarcode.includes(q);
    });
  }, [products, searchTerm]);

  const gcashFee = useMemo(() => {
    if (paymentMethod !== 'GCash') return 0;
    return ratesConfig?.gcash_fee !== undefined
      ? Number(ratesConfig.gcash_fee)
      : 10.0;
  }, [paymentMethod, ratesConfig]);

  const totalPayable = useMemo(() => {
    const cartTotal = cart.reduce(
      (sum, item) => sum + getProductPrice(item.product) * item.quantity,
      0
    );
    return cartTotal + gcashFee;
  }, [cart, gcashFee]);

  useEffect(() => {
    if (paymentMethod === 'Cash') {
      setAmountReceived(totalPayable > 0 ? totalPayable.toString() : '');
    } else {
      setAmountReceived('');
    }
  }, [paymentMethod, totalPayable]);

  const handleAddToCart = (product: any) => {
    const stock = getProductStock(product);
    const existingIndex = cart.findIndex(
      (item) => item.product.id === product.id
    );
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
    if (isSubmittingRef.current || isSuccess) return;

    if (isLocked) {
      toast.error(getLockReason('process sales transactions'));
      return;
    }

    if (cart.length === 0) {
      toast.error('Your shopping cart is empty.');
      return;
    }

    if (paymentMethod === 'Cash') {
      if (!isSessionOpen) {
        toast.error(
          'Cannot accept Cash: No active cash drawer session is open. Please open a cash session first in Cash Management.'
        );
        return;
      }
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
      const updatedProducts = products.map((p: any) => {
        const cartItem = cart.find((item) => item.product.id === p.id);
        if (cartItem) {
          const stock = getProductStock(p);
          const limitActive = hasStockLimit(p);
          if (limitActive) {
            const newStock = Math.max(0, stock - cartItem.quantity);
            return p.stock_quantity !== undefined
              ? { ...p, stock_quantity: newStock }
              : { ...p, stock: newStock };
          }
        }
        return p;
      });

      const now = new Date();
      const newTx = {
        id: `TX-${Math.floor(100000 + Math.random() * 900000)}`,
        items: cart.map((item) => ({
          productId: item.product.id,
          productName: getProductName(item.product),
          quantity: item.quantity,
          price: getProductPrice(item.product),
        })),
        productName: cart
          .map((item) => `${item.quantity}x ${getProductName(item.product)}`)
          .join(', '),
        barcode: cart.map((item) => getProductBarcode(item.product)).join(', '),
        quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
        paymentMethod,
        amountReceived:
          paymentMethod === 'Cash' ? Number(amountReceived) : null,
        changeCalculated:
          paymentMethod === 'Cash'
            ? Math.max(0, Number(amountReceived) - totalPayable)
            : null,
        referenceNumber: paymentMethod === 'GCash' ? referenceNumber : null,
        totalAmount: totalPayable,
        createdAt: now.toISOString(),
        date: format(now, 'yyyy-MM-dd'),
      };

      await onSaleSuccess(newTx, updatedProducts);

      setIsSuccess(true);
      stopAllCameraTracks();

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
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopAllCameraTracks();
        onClose();
      }}
      title={isSuccess ? 'SALE CONFIRMED' : 'RECORD SALE TRANSACTION'}
      className={`w-full max-w-md mx-auto my-auto ${
        isSuccess ? 'p-6 sm:p-8' : 'p-6'
      } overflow-y-auto max-h-[85vh] font-body relative text-left`}
    >
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => {
          stopAllCameraTracks();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50"
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
                  placeholder={
                    showLiveScanner
                      ? 'CAMERA SCANNER ACTIVE...'
                      : 'TYPE NAME OR SCAN BARCODE...'
                  }
                  disabled={isSubmitting || showLiveScanner}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-20 py-2.5 bg-(--bg-input) border border-(--border-color) rounded-xl text-xs font-bold transition-all uppercase ${
                    showLiveScanner
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-zinc-900 text-slate-400'
                      : 'text-(--color-text) focus:border-blue-500'
                  }`}
                  autoFocus
                />

                {searchTerm && !showLiveScanner && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-11 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-full text-slate-400 hover:text-(--color-text) transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={isSubmitting}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                    showLiveScanner
                      ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-500/50 animate-pulse'
                      : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  }`}
                  title="Scan Barcode / QR Code"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              </div>

              {/* LIVE CAMERA VIEWFINDER OVERLAY */}
              {showLiveScanner && (
                <div className="mt-2 p-3 bg-zinc-950 border-2 border-blue-500/40 rounded-2xl relative text-center animate-fade-in z-30 shadow-2xl space-y-2">
                  {/* CSS Reset for html5-qrcode video & shaded region */}
                  <style>{`
      #sales-qr-reader {
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        background: transparent !important;
        position: relative !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
      #sales-qr-reader__scan_region {
        width: 100% !important;
        height: 100% !important;
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        background: transparent !important;
      }
      #sales-qr-reader video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: 1rem !important;
      }
      #qr-shaded-region,
      #sales-qr-reader__scan_region svg,
      #sales-qr-reader__scan_region img,
      #sales-qr-reader__dashboard,
      #sales-qr-reader__dashboard_section,
      #sales-qr-reader__header_message {
        display: none !important;
      }
    `}</style>

                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      BARCODE SCANNER ACTIVE
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLiveScanner(false);
                        stopAllCameraTracks();
                      }}
                      className="text-xs text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* WIDE RECTANGULAR VIEWFINDER (Replaces aspect-square max-w-55) */}
                  <div className="relative w-full h-56 sm:h-64 rounded-2xl overflow-hidden bg-slate-950 border-2 border-blue-500/50 flex items-center justify-center shadow-inner">
                    <div id="sales-qr-reader" className="w-full h-full" />

                    {/* Barcode Reticle Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <div className="w-[88%] h-[48%] border border-blue-400/40 rounded-xl relative">
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-blue-400 rounded-tl" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-blue-400 rounded-tr" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-blue-400 rounded-bl" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-blue-400 rounded-br" />
                        <div className="w-full h-px bg-amber-400/40 absolute top-1/2 -translate-y-1/2" />
                      </div>
                    </div>
                  </div>

                  {/* CAMERA SWITCHER CONTROLS */}
                  {cameras.length > 1 && (
                    <div className="flex items-center justify-center pt-2">
                      <button
                        type="button"
                        onClick={handleCycleCamera}
                        className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-blue-400 border border-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
                      >
                        <SwitchCamera className="w-4 h-4" />
                        <span>Switch Camera</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEARCH RESULTS SUGGESTIONS */}
            {searchTerm && (
              <div className="max-h-40 overflow-y-auto border border-(--border-color) bg-(--bg-input) rounded-xl divide-y divide-(--border-color) shadow-inner">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((p: any) => {
                    const limitActive = hasStockLimit(p);
                    const stock = getProductStock(p);
                    const isOutOfStock = limitActive && stock <= 0;
                    const isLowStock =
                      limitActive &&
                      !isOutOfStock &&
                      p.low_stock_alert !== null &&
                      p.low_stock_alert !== undefined &&
                      stock <= p.low_stock_alert;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isOutOfStock || isSubmitting}
                        onClick={() => handleAddToCart(p)}
                        className={`w-full p-2.5 flex items-center justify-between text-left transition-all hover:bg-slate-200/50 dark:hover:bg-zinc-800 ${
                          isOutOfStock || isSubmitting
                            ? 'opacity-50 cursor-not-allowed pointer-events-none'
                            : 'cursor-pointer'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-(--color-text) uppercase">
                            {getProductName(p)}
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            Barcode: {getProductBarcode(p)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-heading text-(--color-text) font-bold">
                            ₱{getProductPrice(p).toFixed(2)}
                          </div>
                          <div className="text-[9px] font-sans font-bold">
                            {isOutOfStock ? (
                              <span className="text-red-500 font-black">
                                NO STOCK (0)
                              </span>
                            ) : isLowStock ? (
                              <span className="text-amber-500 dark:text-amber-400 font-black">
                                LOW STOCK ({stock})
                              </span>
                            ) : !limitActive ? (
                              <span className="text-blue-500 dark:text-blue-400">
                                UNLIMITED
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                Stock: {stock}
                              </span>
                            )}
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
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-blue-500" />
                  <span>Selected items ({cart.length})</span>
                </div>
                {cart.length > 0 && (
                  <span className="text-[10px] font-mono text-slate-400">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)} total
                    unit(s)
                  </span>
                )}
              </div>

              {cart.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {cart.map((item, idx) => (
                    <motion.div
                      key={item.product.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 rounded-xl bg-slate-100/90 dark:bg-zinc-900/90 border border-(--border-color) flex items-center justify-between gap-3 text-xs shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-(--color-text) truncate uppercase">
                          {getProductName(item.product)}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono font-bold">
                            ₱{getProductPrice(item.product).toFixed(2)}
                          </span>
                          {getProductBarcode(item.product) !== 'N/A' && (
                            <span className="text-[9px] font-mono text-slate-400 truncate">
                              • {getProductBarcode(item.product)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleUpdateQuantity(idx, -1)}
                          className="w-7 h-7 border border-(--border-color) bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center font-heading text-sm font-bold hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        >
                          -
                        </button>
                        <span className="font-mono w-6 text-center text-xs font-black text-(--color-text)">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleUpdateQuantity(idx, 1)}
                          className="w-7 h-7 border border-(--border-color) bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center font-heading text-sm font-bold hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                        >
                          +
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                /* ENHANCED EMPTY STATE WITH CENTERED CIRCLE ICON & DESCRIPTION */
                <div className="py-7 px-4 border-2 border-dashed border-(--border-color) rounded-2xl bg-slate-50/50 dark:bg-zinc-900/40 text-center flex flex-col items-center justify-center space-y-2.5 animate-fade-in select-none">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                    <ShoppingCart className="w-6 h-6 stroke-[2.2]" />
                  </div>

                  <div className="space-y-0.5">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Shopping Cart is Empty
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium max-w-xs leading-relaxed">
                      Search for a product name or scan an item barcode above to
                      begin recording this sale.
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    <QrCode className="w-3 h-3 text-blue-500" />
                    Barcode / QR Ready
                  </span>
                </div>
              )}
            </div>

            {/* PAYMENT METHOD SELECTOR */}
            {cart.length > 0 && (
              <div className="space-y-3 border-t border-(--border-color) pt-3">
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
                        : 'bg-transparent border-(--border-color) text-slate-500'
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
                        : 'bg-transparent border-(--border-color) text-slate-500'
                    }`}
                  >
                    GCASH
                  </button>
                </div>

                {paymentMethod === 'Cash' ? (
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">
                      Amount Received (PHP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">
                        ₱
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        disabled={isSubmitting}
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) font-mono font-bold text-sm"
                      />
                    </div>

                    {amountReceived && (
                      <div className="text-xs font-sans text-emerald-600 dark:text-emerald-400 mt-1 flex justify-between font-bold">
                        <span>Calculated Change:</span>
                        <span>
                          ₱
                          {Math.max(
                            0,
                            Number(amountReceived) - totalPayable
                          ).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">
                      GCash Reference Number
                    </label>
                    <input
                      type="text"
                      placeholder="Enter reference code..."
                      disabled={isSubmitting}
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-(--bg-page) border border-(--border-color) rounded-xl outline-none text-(--color-text) font-mono font-bold text-xs uppercase"
                    />

                    {referenceNumber.trim().length >= 6 && (
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans mt-1 flex items-center gap-1 font-bold">
                        <Check className="w-3.5 h-3.5" /> GCash reference code
                        recorded.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* RECEIPT SUMMARY BREAKDOWN */}
            {cart.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-(--border-color) space-y-1.5 text-xs font-sans">
                <div className="flex justify-between text-slate-500">
                  <span>Unique Items:</span>
                  <span className="font-bold text-(--color-text)">
                    {cart.length} items
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Total Units:</span>
                  <span className="font-bold text-(--color-text)">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                {paymentMethod === 'GCash' && gcashFee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>GCash Fee Applied:</span>
                    <span className="text-rose-500 font-bold">
                      +₱{gcashFee.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-(--border-color) pt-1.5 flex justify-between font-heading text-sm text-(--color-text)">
                  <span>TOTAL PAYABLE:</span>
                  <span className="text-(--color-primary) font-extrabold text-base">
                    ₱{totalPayable.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* SUBMIT BUTTON */}
            <div className="pt-3">
              <Button
                onClick={handleCompleteSale}
                disabled={cart.length === 0 || isSubmitting || isLocked}
                title={isLocked ? getLockReason('process sales transactions') : undefined}
                className={`py-3.5 w-full font-bold text-xs uppercase tracking-wider ${
                  isSubmitting || isLocked
                    ? 'opacity-50 cursor-not-allowed pointer-events-none'
                    : 'cursor-pointer'
                }`}
              >
                {isSubmitting
                  ? 'PROCESSING TRANSACTION...'
                  : 'COMPLETE TRANSACTION'}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sales-success"
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: {
                type: 'spring',
                damping: 24,
                stiffness: 280,
                duration: 0.4,
              },
            }}
            exit={{
              opacity: 0,
              scale: 0.9,
              y: -16,
              transition: { duration: 0.25, ease: 'easeInOut' },
            }}
            className="py-12 flex flex-col items-center justify-center space-y-4"
          >
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                damping: 18,
                stiffness: 300,
                delay: 0.08,
              }}
              className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl shadow-emerald-500/25 ring-4 ring-emerald-500/20"
            >
              <Check className="w-8 h-8 stroke-[3]" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="font-black text-xl text-(--color-text) uppercase tracking-wider font-heading text-center"
            >
              SALE AUTHORIZED
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.3 }}
              className="text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-xs text-center uppercase tracking-wide"
            >
              Transaction committed to ledger, stock inventory updated.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>,
    document.body
  );
};
