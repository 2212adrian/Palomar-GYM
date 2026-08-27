// src/pages/scanner/ScannerPage.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  QrCode, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  SwitchCamera,
  ArrowRight,
  ShoppingBag,
  User,
  ShieldCheck,
  RotateCcw,
  Calendar,
  Clock,
  CircleDollarSign,
  CreditCard,
  Smartphone,
  Plus,
  Minus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Package,
  Zap,
  Camera,
  Check,
  Flashlight,
  FlashlightOff,
  Barcode as BarcodeIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../stores/authStore';
import { scannerService, parseScannedMemberCode, type HybridScanResult, type HybridProductResult } from './scannerService';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase/client';
import { ImageZoomModal } from './ImageZoomModal';

import beepSoundUrl from '../../assets/beep-scanner.mp3';

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

const releaseCameraHardware = () => {
  try {
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
  } catch (err) {
    console.warn('Error releasing camera hardware:', err);
  }
};

export const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore() as any;

  // Active Scanner References
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const isCameraRunningRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const isExitingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Scan Debounce / Cooldown Ref
  const lastScannedRef = useRef<{ code: string; timestamp: number }>({ code: '', timestamp: 0 });

  // Manual Input Ref
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  // Overlay Visibility State
  const [isOpen, setIsOpen] = useState(true);

  // Scan Mode: 'qr' (square reticle) vs 'barcode' (rectangle reticle)
  const [scanMode, setScanMode] = useState<'qr' | 'barcode'>('qr');

  // Scanner State & Scan FX Animation State ('idle' | 'scanning' | 'success')
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<'idle' | 'scanning' | 'success'>('idle');
  const [scanResult, setScanResult] = useState<HybridScanResult | null>(null);

  // Flashlight / Torch State
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);

  // Photo Zoom Modal State
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);

  // Product Cart & Recently Scanned State
  const [productCart, setProductCart] = useState<Array<{ product: HybridProductResult; quantity: number }>>([]);
  const [lastScannedProduct, setLastScannedProduct] = useState<{ product: HybridProductResult; quantity: number } | null>(null);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [salePaymentMethod, setSalePaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [saleAmountReceived, setSaleAmountReceived] = useState('');
  const [saleReferenceNumber, setSaleReferenceNumber] = useState('');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const productCartRef = useRef(productCart);
  productCartRef.current = productCart;

  // Administrative Override Toggle & Attendance Payment Settlement
  const [adminOverride, setAdminOverride] = useState(false);
  const [isPaymentConfirmed, setIsPaymentConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash'>('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Dynamic Rates Configuration State
  const [yearlyMemberFee, setYearlyMemberFee] = useState(50);
  const [gcashFeeRate, setGcashFeeRate] = useState(10);

  // Camera Devices State & Saved Preference
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('preferred_camera_id') || '';
  });

  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);

  useEffect(() => {
    if (manualInputRef.current && document.activeElement === manualInputRef.current) {
      manualInputRef.current.blur();
    }
  }, []);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const { data } = await supabase
          .from('rates_config')
          .select('yearly_walk_in, gcash_fee')
          .eq('id', 1)
          .maybeSingle();

        if (data) {
          setYearlyMemberFee(Number(data.yearly_walk_in) || 50);
          setGcashFeeRate(Number(data.gcash_fee) ?? 10);
        }
      } catch (err) {
        console.warn('Failed to load rates_config:', err);
      }
    };
    fetchRates();
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            const savedCameraId = localStorage.getItem('preferred_camera_id');
            const cameraExists = savedCameraId && devices.some((d) => d.id === savedCameraId);

            if (cameraExists) {
              setSelectedCameraId(savedCameraId!);
            } else if (!selectedCameraId || !devices.some((d) => d.id === selectedCameraId)) {
              const backCam = devices.find((d) => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('rear') || 
                d.label.toLowerCase().includes('environment')
              );
              const defaultId = backCam ? backCam.id : devices[0].id;
              setSelectedCameraId(defaultId);
              localStorage.setItem('preferred_camera_id', defaultId);
            }
          }
        })
        .catch((err) => console.warn('Camera enumeration error:', err));
    }
  }, []);

  const entryFee = useMemo(() => {
    if (!scanResult?.member) return 0;
    const isYearly = scanResult.member.membershipPlan.toLowerCase().includes('year');
    return isYearly ? yearlyMemberFee : 0;
  }, [scanResult, yearlyMemberFee]);

  const totalEntryFee = useMemo(() => {
    if (entryFee === 0) return 0;
    return paymentMethod === 'GCash' ? entryFee + gcashFeeRate : entryFee;
  }, [entryFee, paymentMethod, gcashFeeRate]);

  const cartSubtotal = useMemo(() => {
    return productCart.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  }, [productCart]);

  const cartGcashFee = useMemo(() => {
    return salePaymentMethod === 'GCash' ? gcashFeeRate : 0;
  }, [salePaymentMethod, gcashFeeRate]);

  const cartTotalPayable = useMemo(() => {
    return cartSubtotal + cartGcashFee;
  }, [cartSubtotal, cartGcashFee]);

  useEffect(() => {
    if (salePaymentMethod === 'Cash') {
      setSaleAmountReceived(cartTotalPayable > 0 ? cartTotalPayable.toString() : '');
    } else {
      setSaleAmountReceived('');
    }
  }, [salePaymentMethod, cartTotalPayable]);

  useEffect(() => {
    setAdminOverride(false);
    setIsPaymentConfirmed(false);
    setPaymentMethod('Cash');
    setReferenceNumber('');
  }, [scanResult]);

  const stopCameraHardware = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    try {
      if (qrScannerRef.current) {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        await qrScannerRef.current.clear();
      }
    } catch (err) {
      console.warn('Camera stop warning:', err);
    } finally {
      qrScannerRef.current = null;
      isCameraRunningRef.current = false;
      releaseCameraHardware();
      isStoppingRef.current = false;
      setTorchEnabled(false);
      setHasTorchCapability(false);
    }
  }, []);

  const triggerSuccessAnimation = () => {
    setScanFeedback('success');
    setTimeout(() => {
      setScanFeedback('idle');
    }, 1200);
  };

  const toggleTorch = async () => {
    try {
      const videoElement = document.querySelector('#hybrid-qr-reader video') as HTMLVideoElement | null;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const nextTorch = !torchEnabled;
          await track.applyConstraints({
            advanced: [{ torch: nextTorch } as any]
          });
          setTorchEnabled(nextTorch);
        }
      }
    } catch (err) {
      toast.warn('Flashlight not supported on this device/camera.');
    }
  };

  // Synchronous Scan Processing Pipeline
  const handleProcessScan = async (rawCode: string) => {
    let cleanCode = rawCode.replace(/[\x00-\x1F\x7F-\x9F\uFFFD]/g, '').trim();
    if (!cleanCode) return;

    const now = Date.now();
    const SCAN_COOLDOWN_MS = 1200;

    if (lastScannedRef.current.code.toUpperCase() === cleanCode.toUpperCase() && 
        now - lastScannedRef.current.timestamp < SCAN_COOLDOWN_MS) {
      return;
    }
    lastScannedRef.current = { code: cleanCode, timestamp: now };

    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    setScanFeedback('scanning');

    try {
      const currentCart = productCartRef.current;
      const isCartMode = currentCart.length > 0;
      const result = await scannerService.processHybridScan(cleanCode);

      if (isCartMode && (result.type !== 'product' || !result.product)) {
        toast.error('Cart mode active: only product barcodes (PR-XXXX / MFG) are allowed.', {
          toastId: 'cart-only-products'
        });
        return;
      }

      if (result.type === 'product' && result.product) {
        const scannedProduct = result.product;
        const availableStock = Number(scannedProduct.stockQuantity) || 0;

        if (scannedProduct.status === 'Inactive' || scannedProduct.isHidden) {
          toast.error(`❌ "${scannedProduct.productName}" is INACTIVE/HIDDEN.`, {
            toastId: `hidden-${scannedProduct.id}`
          });
          return;
        }

        if (scannedProduct.hasStockLimit && availableStock <= 0) {
          toast.error(`❌ "${scannedProduct.productName}" is OUT OF STOCK.`, {
            toastId: `out-of-stock-${scannedProduct.id}`
          });
          return;
        }

        const existingItem = currentCart.find((item) => item.product.id === scannedProduct.id);
        const currentQty = existingItem ? existingItem.quantity : 0;
        const targetQty = currentQty + 1;

        if (scannedProduct.hasStockLimit && targetQty > availableStock) {
          toast.error(`⚠️ Max stock reached! Only ${availableStock} unit(s) available for "${scannedProduct.productName}".`, {
            toastId: `stock-limit-${scannedProduct.id}`
          });
          return;
        }

        playBeepSound();
        triggerSuccessAnimation();

        setProductCart((prev) => {
          const existingIdx = prev.findIndex((item) => item.product.id === scannedProduct.id);
          if (existingIdx > -1) {
            const updated = [...prev];
            updated[existingIdx] = { ...updated[existingIdx], quantity: targetQty, product: scannedProduct };
            return updated;
          }
          return [...prev, { product: scannedProduct, quantity: 1 }];
        });

        setLastScannedProduct({ product: scannedProduct, quantity: targetQty });

        toast.success(`Scanned: ${scannedProduct.productName} (${targetQty}x)`, {
          toastId: `cart-scan-${scannedProduct.id}`
        });
      } else if (result.type === 'member' || result.type === 'registration') {
        if (result.type === 'member' && result.member) {
          const todayDateStr = new Date().toISOString().split('T')[0];
          const { data: todayAtt } = await supabase
            .from('attendance')
            .select('id')
            .is('deleted_at', null)
            .eq('member_id', result.member.memberId)
            .gte('check_in_time', `${todayDateStr}T00:00:00.000Z`)
            .lte('check_in_time', `${todayDateStr}T23:59:59.999Z`)
            .limit(1);

          result.member.alreadyCheckedInToday = Boolean(todayAtt && todayAtt.length > 0);
        }

        playBeepSound();
        triggerSuccessAnimation();
        await stopCameraHardware();
        setScanResult(result);
      } else {
        toast.error(`Unrecognized code: "${cleanCode.length > 25 ? cleanCode.substring(0, 25) + '...' : cleanCode}"`, {
          toastId: 'unrecognized-code-toast'
        });
      }
    } catch (err) {
      toast.error('Failed to process scanned code.');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setScanFeedback('idle');
    }
  };

  const handleNativeMLKitScan = async () => {
    try {
      if (Capacitor.getPlatform() === 'android') {
        const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!available) {
          toast.info('Downloading Google Barcode Module...');
          await BarcodeScanner.installGoogleBarcodeScannerModule();
        }
      }

      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        toast.error('Camera permission denied.');
        return;
      }

      const nativeFormats = scanMode === 'qr'
        ? [BarcodeFormat.QrCode]
        : [
            BarcodeFormat.Code128,
            BarcodeFormat.Code39,
            BarcodeFormat.Code93,
            BarcodeFormat.Ean13,
            BarcodeFormat.Ean8,
            BarcodeFormat.UpcA,
            BarcodeFormat.UpcE,
            BarcodeFormat.Itf
          ];

      const { barcodes } = await BarcodeScanner.scan({
        formats: nativeFormats
      });

      if (barcodes && barcodes.length > 0) {
        const detectedCode = barcodes[0].rawValue || barcodes[0].displayValue;
        if (detectedCode) {
          await handleProcessScan(detectedCode);
        }
      }
    } catch (err: any) {
      if (err?.message && !err.message.toLowerCase().includes('cancel')) {
        console.error('ML Kit scan error:', err);
        toast.error('Native scan failed.');
      }
    }
  };

  // Web Camera Lifecycle (restarts when camera or scanMode changes)
  useEffect(() => {
    if (Capacitor.isNativePlatform() || (scanResult && (scanResult.type === 'member' || scanResult.type === 'registration'))) {
      return;
    }

    let isMounted = true;

    const restartScanner = async () => {
      if (qrScannerRef.current) {
        try {
          if (qrScannerRef.current.isScanning) {
            await qrScannerRef.current.stop();
          }
          await qrScannerRef.current.clear();
        } catch (e) {}
        qrScannerRef.current = null;
      }
      releaseCameraHardware();

      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!isMounted || isExitingRef.current) return;

      const readerElement = document.getElementById('hybrid-qr-reader');
      if (!readerElement) return;

      try {
        const formatsToSupport = scanMode === 'qr'
          ? [Html5QrcodeSupportedFormats.QR_CODE]
          : [
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.CODE_93,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.ITF,
            ];

        const scanner = new Html5Qrcode('hybrid-qr-reader', {
          verbose: false,
          formatsToSupport,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true // Dramatically increases mobile scan responsiveness
          }
        });
        qrScannerRef.current = scanner;

        const cameraConfig = selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode: 'environment' };

        // Dynamic ROI / QrBox sizing based on mode
        const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
          if (scanMode === 'qr') {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edgeSize = Math.floor(minEdge * 0.72);
            return { width: edgeSize, height: edgeSize };
          } else {
            const width = Math.min(Math.floor(viewfinderWidth * 0.88), 380);
            const height = Math.min(Math.floor(viewfinderHeight * 0.38), 160);
            return { width, height };
          }
        };

        await scanner.start(
          cameraConfig,
          {
            fps: 25,
            qrbox: qrboxFunction,
            videoConstraints: {
              ...cameraConfig,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'environment'
            }
          },
          async (decodedText) => {
            if (isMounted && !isExitingRef.current) {
              await handleProcessScan(decodedText);
            }
          },
          () => {}
        );
        isCameraRunningRef.current = true;

        try {
          const videoElement = document.querySelector('#hybrid-qr-reader video') as HTMLVideoElement | null;
          if (videoElement && videoElement.srcObject) {
            const stream = videoElement.srcObject as MediaStream;
            const track = stream.getVideoTracks()[0];
            if (track && track.getCapabilities) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.torch) {
                setHasTorchCapability(true);
              }
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                } as any);
              }
            }
          }
        } catch (e) {}
      } catch (err) {
        console.warn('Camera start/switch error:', err);
      }
    };

    restartScanner();

    return () => {
      isMounted = false;
      stopCameraHardware();
    };
  }, [selectedCameraId, scanResult?.type, scanMode]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || isProcessing) return;
    await handleProcessScan(manualCode);
    setManualCode('');
  };

  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    localStorage.setItem('preferred_camera_id', cameraId);
  };

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    handleCameraChange(cameras[nextIndex].id);
  };

  const handleUpdateCartQty = (idx: number, delta: number) => {
    const item = productCart[idx];
    if (!item) return;
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      const updated = productCart.filter((_, i) => i !== idx);
      setProductCart(updated);
      if (lastScannedProduct?.product.id === item.product.id) {
        setLastScannedProduct(updated.length > 0 ? updated[updated.length - 1] : null);
      }
      if (updated.length === 0) {
        setIsCartExpanded(false);
        setLastScannedProduct(null);
      }
      return;
    }

    const availableStock = Number(item.product.stockQuantity) || 0;
    if (item.product.hasStockLimit && newQty > availableStock) {
      toast.error(`⚠️ Cannot exceed available stock (${availableStock}) for "${item.product.productName}".`, {
        toastId: `cart-qty-limit-${item.product.id}`
      });
      return;
    }

    const updated = [...productCart];
    updated[idx] = { ...item, quantity: newQty };
    setProductCart(updated);
    if (lastScannedProduct?.product.id === item.product.id) {
      setLastScannedProduct({ ...item, quantity: newQty });
    }
  };

  const handleClearCart = () => {
    setProductCart([]);
    setLastScannedProduct(null);
    setIsCartExpanded(false);
    toast.info('Product cart cleared. Hybrid mode restored.');
  };

  const handlePlaceOrder = async () => {
    if (productCart.length === 0 || isSubmittingSale) return;

    if (salePaymentMethod === 'Cash') {
      const received = Number(saleAmountReceived);
      if (isNaN(received) || received < cartTotalPayable) {
        toast.error('Insufficient cash received.');
        return;
      }
    } else {
      if (!saleReferenceNumber.trim() || saleReferenceNumber.trim().length < 6) {
        toast.error('Please enter a valid GCash reference number (min 6 characters).');
        return;
      }
    }

    setIsSubmittingSale(true);
    try {
      const itemsArray = productCart.map((item) => ({
        productId: item.product.id,
        productName: item.product.productName,
        quantity: item.quantity,
        price: item.product.sellingPrice,
      }));

      const productNameSummary = productCart
        .map((item) => `${item.quantity}x ${item.product.productName}`)
        .join(', ');

      const { data: insertedSale, error } = await supabase
        .from('sales')
        .insert([
          {
            items: itemsArray,
            product_name: productNameSummary,
            payment_method: salePaymentMethod,
            amount_received: salePaymentMethod === 'Cash' ? Number(saleAmountReceived) : null,
            change_calculated: salePaymentMethod === 'Cash' ? Math.max(0, Number(saleAmountReceived) - cartTotalPayable) : null,
            total_amount: cartTotalPayable,
            gcash_fee_applied: salePaymentMethod === 'GCash' ? gcashFeeRate : 0,
            reference_number: salePaymentMethod === 'GCash' ? saleReferenceNumber.trim() : null,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      for (const item of productCart) {
        if (item.product.hasStockLimit) {
          const newStock = Math.max(0, item.product.stockQuantity - item.quantity);
          await supabase
            .from('products')
            .update({ stock_quantity: newStock })
            .eq('id', item.product.id);
        }
      }

      const itemsList = productCart.map((i) => `\t- ${i.product.productName} (${i.quantity}x)`).join('\n');
      await supabase.from('audit_logs').insert([
        {
          action: 'SALE_RECORDED',
          details: `Recorded scanner sale transaction: ${insertedSale?.receipt_no || insertedSale?.id}\nPayment Method: ${salePaymentMethod}\nTotal Amount: ₱${cartTotalPayable.toFixed(2)}\n\nItems Purchased:\n${itemsList}`,
          actor_username: user?.email || 'System',
        },
      ]);

      toast.success('Sale successfully placed and recorded!');

      isExitingRef.current = true;
      await stopCameraHardware();
      setProductCart([]);
      setLastScannedProduct(null);
      setIsOpen(false);
      setTimeout(() => navigate('/sales', { replace: true }), 200);
    } catch (err: any) {
      console.error('Error placing order:', err);
      toast.error(err.message || 'Failed to place order.');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleConfirmCheckIn = async () => {
    if (!scanResult?.member || isSubmittingCheckIn) return;

    if (scanResult.member.alreadyCheckedInToday && !adminOverride) {
      toast.error('Duplicate attendance requires override confirmation.');
      return;
    }

    if (entryFee > 0) {
      if (!isPaymentConfirmed) {
        toast.error(`Please confirm that payment of ₱${totalEntryFee.toFixed(2)} was received.`);
        return;
      }
      if (paymentMethod === 'GCash' && referenceNumber.trim().length < 6) {
        toast.error('Please enter a valid GCash reference number (min 6 characters).');
        return;
      }
    }

    setIsSubmittingCheckIn(true);
    try {
      const todayDateStr = new Date().toISOString().split('T')[0];
      const { data: existingActive } = await supabase
        .from('attendance')
        .select('id')
        .is('deleted_at', null)
        .eq('member_id', scanResult.member.memberId)
        .gte('check_in_time', `${todayDateStr}T00:00:00.000Z`)
        .lte('check_in_time', `${todayDateStr}T23:59:59.999Z`)
        .limit(1);

      if (existingActive && existingActive.length > 0 && !adminOverride) {
        toast.error('Member already has an active check-in today. Toggle Override to proceed.');
        setIsSubmittingCheckIn(false);
        return;
      }

      const { error: insertErr } = await supabase
        .from('attendance')
        .insert([{
          member_id: scanResult.member.memberId,
          customer_name: scanResult.member.fullName.toUpperCase(),
          customer_type: 'Existing Member',
          check_in_time: new Date().toISOString(),
          plan_name: scanResult.member.membershipPlan,
          entry_fee: totalEntryFee,
          base_price: entryFee,
          gcash_fee: paymentMethod === 'GCash' ? gcashFeeRate : 0,
          card_fee: 0,
          gcash_ref_no: paymentMethod === 'GCash' ? referenceNumber.trim() : null,
          payment_method: paymentMethod,
          staff_name: user?.email || 'Scanner Station'
        }]);

      if (insertErr) throw insertErr;

      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('logbook_sanitized_')) {
          sessionStorage.removeItem(key);
        }
      });

      toast.success(`Attendance check-in logged for ${scanResult.member.fullName}!`);
      
      isExitingRef.current = true;
      await stopCameraHardware();
      setScanResult(null);
      setIsOpen(false);
      setTimeout(() => navigate('/logbook', { replace: true, state: { refreshed: Date.now() } }), 200);
    } catch (err: any) {
      console.error('Check-in failed:', err);
      toast.error(err.message || 'Check-in failed.');
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  const handleScanAgain = () => {
    setScanResult(null);
    setScanFeedback('idle');
  };

  const handleRedirectToAttendance = async () => {
    isExitingRef.current = true;
    await stopCameraHardware();
    const rawName = scanResult?.member?.fullName || parseScannedMemberCode(scanResult?.rawCode || '').memberIdPart;
    setScanResult(null);
    setIsOpen(false);
    setTimeout(() => {
      navigate('/logbook', { state: { openAttendanceModal: true, initialSearch: rawName } });
    }, 200);
  };

  const handleCloseScanner = async () => {
    isExitingRef.current = true;
    await stopCameraHardware();
    setIsOpen(false);
    setTimeout(() => {
      navigate(-1);
    }, 200);
  };

  const isLockedByDuplicate = Boolean(
    scanResult?.member?.alreadyCheckedInToday && !adminOverride
  );

  const isLockedByPayment = Boolean(
    entryFee > 0 &&
      (!isPaymentConfirmed ||
        (paymentMethod === 'GCash' && referenceNumber.trim().length < 6))
  );

  const isCartMode = productCart.length > 0;

  return createPortal(
    <>
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key="scanner-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-300 bg-slate-950/95 dark:bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-between p-3 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] overflow-y-auto font-sans select-none"
          >
            <div id="scanner-hidden-file-reader" className="hidden" aria-hidden="true" />

            <style>{`
              #hybrid-qr-reader {
                width: 100% !important;
                height: 100% !important;
                border: none !important;
                background: transparent !important;
                position: relative !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: hidden !important;
              }
              #hybrid-qr-reader__scan_region {
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
              #hybrid-qr-reader video {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
                position: absolute !important;
                inset: 0 !important;
                border-radius: 1.5rem !important;
              }
              #qr-shaded-region,
              #hybrid-qr-reader__scan_region svg,
              #hybrid-qr-reader__scan_region img,
              #hybrid-qr-reader__dashboard,
              #hybrid-qr-reader__dashboard_section,
              #hybrid-qr-reader__header_message {
                display: none !important;
              }
            `}</style>

            {/* TOP HEADER BAR */}
            <motion.div 
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-lg flex items-center justify-between px-3.5 py-2 bg-slate-900/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shrink-0 z-10"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                  isCartMode 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                    : scanMode === 'barcode'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                    : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                }`}>
                  {isCartMode ? (
                    <ShoppingBag className="w-5 h-5" />
                  ) : scanMode === 'barcode' ? (
                    <BarcodeIcon className="w-5 h-5" />
                  ) : (
                    <QrCode className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="font-heading text-xs sm:text-sm text-white uppercase tracking-wider flex items-center gap-1.5 font-bold">
                    {isCartMode 
                      ? 'PRODUCT CART SCANNER' 
                      : scanMode === 'barcode' 
                      ? 'BARCODE LASER SCANNER' 
                      : 'QR CODE SCANNER'}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px] sm:max-w-[280px]">
                    {isCartMode
                      ? `Cart Active (${productCart.reduce((s, i) => s + i.quantity, 0)} Items) • PR-XXXX & MFG`
                      : scanMode === 'barcode'
                      ? 'Target 1D product barcodes in rectangular box'
                      : 'Target Member QR or Pre-Reg in square box'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {hasTorchCapability && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      torchEnabled 
                        ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]' 
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-300'
                    }`}
                    title="Toggle Flashlight"
                  >
                    {torchEnabled ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCloseScanner}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95"
                  title="Close Scanner"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </motion.div>

            {/* SCAN MODE TOGGLE BAR: QR vs. BARCODE */}
            <div className="w-full max-w-xs mt-2 mb-1 flex items-center p-1 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg z-10">
              <button
                type="button"
                onClick={() => setScanMode('qr')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  scanMode === 'qr'
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR CODE</span>
              </button>

              <button
                type="button"
                onClick={() => setScanMode('barcode')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  scanMode === 'barcode'
                    ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <BarcodeIcon className="w-3.5 h-3.5" />
                <span>BARCODE</span>
              </button>
            </div>

            {/* CENTER VIEWPORT */}
            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-lg my-auto py-1 gap-3">
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  boxShadow: scanFeedback === 'success' 
                    ? '0 0 50px rgba(16, 185, 129, 0.5)' 
                    : scanMode === 'barcode'
                    ? '0 0 40px rgba(245, 158, 11, 0.25)'
                    : '0 0 40px rgba(6, 182, 212, 0.25)'
                }}
                transition={{ 
                  layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
                  duration: 0.3 
                }}
                className={`relative rounded-3xl overflow-hidden bg-slate-950 border-2 transition-all duration-300 ${
                  isCartExpanded 
                    ? 'w-36 sm:w-44 h-36 sm:h-44' 
                    : 'w-full max-w-[420px] sm:max-w-[460px] h-[340px] sm:h-[380px]'
                } ${
                  scanFeedback === 'success'
                    ? 'border-emerald-400 ring-4 ring-emerald-500/30'
                    : scanMode === 'barcode'
                    ? 'border-amber-500/60'
                    : 'border-cyan-500/60'
                }`}
              >
                {Capacitor.isNativePlatform() ? (
                  <div className="flex flex-col items-center justify-center p-4 text-center space-y-3 h-full">
                    <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center animate-pulse">
                      <Zap className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        {scanMode === 'barcode' ? 'ML Kit Barcode Laser' : 'ML Kit QR Scanner'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                        Instant hardware barcode & QR detection.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleNativeMLKitScan}
                      className="px-5 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Scan {scanMode === 'barcode' ? 'Barcode' : 'QR Code'}</span>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div id="hybrid-qr-reader" className="w-full h-full" />

                    {/* DYNAMIC RETICLE HUD OVERLAY: SQUARE (QR) vs. RECTANGLE (BARCODE) */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <motion.div 
                        layout
                        initial={false}
                        animate={{
                          width: scanMode === 'qr' ? '220px' : '90%',
                          height: scanMode === 'qr' ? '220px' : '110px',
                          borderRadius: scanMode === 'qr' ? '24px' : '16px'
                        }}
                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        className="relative flex items-center justify-center border border-white/15"
                      >
                        {/* 4 Corners */}
                        <div className={`absolute -top-1 -left-1 w-6 h-6 border-t-[3.5px] border-l-[3.5px] rounded-tl-xl transition-colors duration-300 ${
                          scanFeedback === 'success' ? 'border-emerald-400' : scanMode === 'barcode' ? 'border-amber-400' : 'border-cyan-400'
                        }`} />
                        <div className={`absolute -top-1 -right-1 w-6 h-6 border-t-[3.5px] border-r-[3.5px] rounded-tr-xl transition-colors duration-300 ${
                          scanFeedback === 'success' ? 'border-emerald-400' : scanMode === 'barcode' ? 'border-amber-400' : 'border-cyan-400'
                        }`} />
                        <div className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-[3.5px] border-l-[3.5px] rounded-bl-xl transition-colors duration-300 ${
                          scanFeedback === 'success' ? 'border-emerald-400' : scanMode === 'barcode' ? 'border-amber-400' : 'border-cyan-400'
                        }`} />
                        <div className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-[3.5px] border-r-[3.5px] rounded-br-xl transition-colors duration-300 ${
                          scanFeedback === 'success' ? 'border-emerald-400' : scanMode === 'barcode' ? 'border-amber-400' : 'border-cyan-400'
                        }`} />

                        {/* Center Target Indicator */}
                        {scanMode === 'qr' ? (
                          <div className="w-8 h-8 relative opacity-35 flex items-center justify-center">
                            <div className="w-full h-[1.5px] bg-cyan-300 absolute" />
                            <div className="h-full w-[1.5px] bg-cyan-300 absolute" />
                          </div>
                        ) : (
                          <div className="w-full h-[1px] bg-amber-400/25 absolute" />
                        )}

                        {/* Animated Laser Scanning Line */}
                        {scanFeedback !== 'success' && (
                          <motion.div 
                            animate={{ y: ['-110%', '110%'] }}
                            transition={{ 
                              repeat: Infinity, 
                              repeatType: 'reverse',
                              duration: scanMode === 'barcode' ? 1.0 : 1.6, 
                              ease: 'easeInOut' 
                            }}
                            className={`absolute left-2 right-2 h-0.5 rounded-full ${
                              scanMode === 'barcode'
                                ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_18px_#f59e0b]'
                                : 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_18px_#22d3ee]'
                            }`}
                          />
                        )}
                      </motion.div>
                    </div>

                    {/* Camera Control Badges */}
                    {cameras.length > 0 && !isCartExpanded && (
                      <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10 gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase text-slate-200 tracking-wider shrink-0">
                          <span className={`w-2 h-2 rounded-full ${
                            isProcessing 
                              ? 'bg-amber-400 animate-ping' 
                              : scanMode === 'barcode' 
                              ? 'bg-amber-400 animate-pulse' 
                              : 'bg-cyan-400 animate-pulse'
                          }`} />
                          <span>{isProcessing ? 'Processing...' : `${scanMode.toUpperCase()} Active`}</span>
                        </div>

                        <div className="pointer-events-auto flex items-center gap-1.5">
                          {cameras.length > 1 ? (
                            <>
                              <div className="hidden sm:flex items-center bg-black/75 backdrop-blur-md border border-white/15 rounded-xl px-2 py-1 shadow-md">
                                <Camera className="w-3.5 h-3.5 text-cyan-400 mr-1.5 shrink-0" />
                                <select
                                  value={selectedCameraId}
                                  onChange={(e) => handleCameraChange(e.target.value)}
                                  className="bg-transparent text-white text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer max-w-[160px] truncate"
                                >
                                  {cameras.map((cam, idx) => (
                                    <option key={cam.id} value={cam.id} className="bg-zinc-900 text-white">
                                      {cam.label || `Camera ${idx + 1}`}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={handleCycleCamera}
                                className="sm:hidden px-3 py-1 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md text-white border border-white/15 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md"
                                title="Switch Camera"
                              >
                                <SwitchCamera className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Switch</span>
                              </button>
                            </>
                          ) : (
                            <div className="px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-slate-300 border border-white/10 text-[10px] font-bold flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5 text-slate-400" />
                              <span className="truncate max-w-[100px]">{cameras[0]?.label || 'Camera'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <AnimatePresence>
                      {scanFeedback === 'success' && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 1.2 }}
                          transition={{ duration: 0.25 }}
                          className="absolute inset-0 bg-emerald-500/35 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-20"
                        >
                          <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-[0_0_40px_#10b981] animate-bounce">
                            <Check className="w-9 h-9 stroke-[3]" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>

              {/* RECENTLY SCANNED PRODUCT BANNER */}
              <AnimatePresence mode="wait">
                {lastScannedProduct && (
                  <motion.div
                    key={lastScannedProduct.product.id + '-' + lastScannedProduct.quantity}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="w-full max-w-lg bg-zinc-900/95 border-2 border-emerald-500/50 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 shrink-0 z-20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        onClick={() => {
                          if (lastScannedProduct.product.imageUrl) {
                            setZoomImage({
                              url: lastScannedProduct.product.imageUrl,
                              title: `${lastScannedProduct.product.productName} (${lastScannedProduct.product.barcodeId})`
                            });
                          }
                        }}
                        className={`w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-700/80 overflow-hidden flex items-center justify-center shrink-0 relative ${
                          lastScannedProduct.product.imageUrl ? 'cursor-pointer group' : ''
                        }`}
                      >
                        {lastScannedProduct.product.imageUrl ? (
                          <>
                            <img 
                              src={lastScannedProduct.product.imageUrl} 
                              alt={lastScannedProduct.product.productName} 
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110" 
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                          </>
                        ) : (
                          <Package className="w-6 h-6 text-emerald-400" />
                        )}
                      </div>

                      <div className="min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Recently Scanned
                          </span>
                          <span className="text-[9px] font-mono text-zinc-400 truncate">
                            {lastScannedProduct.product.barcodeId}
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-white uppercase truncate mt-0.5">
                          {lastScannedProduct.product.productName}
                        </h4>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          ₱{lastScannedProduct.product.sellingPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 pl-1">
                      <span className="text-[9px] uppercase font-bold text-zinc-400">In Cart</span>
                      <motion.span 
                        key={lastScannedProduct.quantity}
                        initial={{ scale: 1.25 }}
                        animate={{ scale: 1 }}
                        className="text-xs sm:text-sm font-mono font-black text-white bg-emerald-600 px-3 py-1 rounded-xl shadow-md border border-emerald-400/40"
                      >
                        {lastScannedProduct.quantity}x
                      </motion.span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* BOTTOM SEARCH & CART DRAWER */}
            <div className="w-full max-w-lg space-y-2 shrink-0 z-20">
              <motion.form 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleManualSubmit} 
                className="relative group w-full"
              >
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-cyan-400 pointer-events-none z-10 transition-colors" />
                <input
                  ref={manualInputRef}
                  type="text"
                  autoFocus={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder={
                    isCartMode 
                      ? "ENTER PRODUCT BARCODE (PR-XXXX / MFG)..." 
                      : scanMode === 'barcode'
                      ? "ENTER PRODUCT BARCODE / MFG ID..."
                      : "ENTER REG-ID, MEMBER ID, OR PHONE..."
                  }
                  className="w-full pl-10 pr-24 py-2.5 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/80 rounded-2xl text-[11px] sm:text-xs font-bold uppercase transition-all outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder-zinc-400 shadow-xl"
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isProcessing}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-heading text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer active:scale-95 z-10 shadow-sm"
                >
                  {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'SEARCH'}
                </button>
              </motion.form>

              {productCart.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="w-full bg-zinc-900/95 backdrop-blur-2xl border-2 border-emerald-500/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300"
                >
                  <div 
                    onClick={() => setIsCartExpanded(!isCartExpanded)}
                    className="p-3 bg-zinc-900/95 flex items-center justify-between cursor-pointer border-b border-zinc-800/80 select-none hover:bg-zinc-850 transition-colors shrink-0 gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 text-left">
                        <h4 className="text-xs font-bold uppercase text-white tracking-wider truncate">
                          Cart ({productCart.reduce((s, i) => s + i.quantity, 0)} Items)
                        </h4>
                        <span className="text-[10px] font-mono font-extrabold text-emerald-400 block">
                          ₱{cartSubtotal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearCart();
                        }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Clear Cart"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        className="p-1.5 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        {isCartExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isCartExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="p-3 space-y-3 border-t border-zinc-800/80 text-left overflow-y-auto max-h-[42vh]"
                      >
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                          {productCart.map((item, idx) => (
                            <div
                              key={item.product.id}
                              className={`p-2 rounded-2xl border flex items-center justify-between gap-2 text-xs transition-all ${
                                lastScannedProduct?.product.id === item.product.id
                                  ? 'bg-emerald-950/40 border-emerald-500/50 shadow-inner'
                                  : 'bg-zinc-950/80 border-zinc-800'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/80 overflow-hidden flex items-center justify-center shrink-0">
                                {item.product.imageUrl ? (
                                  <img src={item.product.imageUrl} alt={item.product.productName} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-4 h-4 text-zinc-400" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <h5 className="font-bold text-white uppercase truncate text-[11px]">
                                  {item.product.productName}
                                </h5>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                    ₱{item.product.sellingPrice.toFixed(2)}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 font-mono">
                                    {item.product.barcodeId}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCartQty(idx, -1)}
                                  className="w-5 h-5 rounded-lg bg-zinc-800 text-white flex items-center justify-center font-bold hover:bg-zinc-700 transition-colors cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-mono font-bold w-4 text-center text-xs text-white">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCartQty(idx, 1)}
                                  className="w-5 h-5 rounded-lg bg-zinc-800 text-white flex items-center justify-center font-bold hover:bg-zinc-700 transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                            Payment Settlement Method
                          </span>

                          <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-950 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setSalePaymentMethod('Cash')}
                              className={`py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                salePaymentMethod === 'Cash'
                                  ? 'bg-cyan-600 text-white shadow-xs'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              <CircleDollarSign className="w-3 h-3" /> Cash
                            </button>
                            <button
                              type="button"
                              onClick={() => setSalePaymentMethod('GCash')}
                              className={`py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                salePaymentMethod === 'GCash'
                                  ? 'bg-cyan-600 text-white shadow-xs'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              <CreditCard className="w-3 h-3" /> GCash
                            </button>
                          </div>

                          {salePaymentMethod === 'Cash' ? (
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold uppercase text-zinc-400 block">
                                Amount Received (PHP)
                              </label>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold font-mono text-xs">₱</span>
                                <input
                                  type="number"
                                  value={saleAmountReceived}
                                  onChange={(e) => setSaleAmountReceived(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full pl-7 pr-2 py-1 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs font-bold outline-none focus:border-cyan-500 text-white"
                                />
                              </div>
                              {saleAmountReceived && (
                                <div className="text-[10px] font-bold text-emerald-400 flex justify-between pt-0.5">
                                  <span>Change Due:</span>
                                  <span className="font-mono">₱{Math.max(0, Number(saleAmountReceived) - cartTotalPayable).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold uppercase text-zinc-400 block">
                                GCash Reference Number
                              </label>
                              <input
                                type="text"
                                value={saleReferenceNumber}
                                onChange={(e) => setSaleReferenceNumber(e.target.value)}
                                placeholder="ENTER REF NO. (MIN 6 DIGITS)..."
                                className="w-full px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-xs font-bold uppercase outline-none focus:border-cyan-500 text-white"
                              />
                            </div>
                          )}

                          <div className="p-2 bg-zinc-950/90 rounded-xl border border-zinc-800 space-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between text-zinc-400">
                              <span>Subtotal:</span>
                              <span className="font-bold text-white">₱{cartSubtotal.toFixed(2)}</span>
                            </div>
                            {salePaymentMethod === 'GCash' && (
                              <div className="flex justify-between text-zinc-400">
                                <span>GCash Fee:</span>
                                <span className="text-amber-400 font-bold">+₱{cartGcashFee.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold text-white pt-1 border-t border-zinc-800 text-xs">
                              <span>TOTAL PAYABLE:</span>
                              <span className="text-emerald-400 font-extrabold">₱{cartTotalPayable.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="primary"
                          onClick={handlePlaceOrder}
                          disabled={isSubmittingSale || productCart.length === 0}
                          className="w-full py-3 text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <ShoppingBag className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">
                            {isSubmittingSale ? 'Placing Order...' : `Place Order (₱${cartTotalPayable.toFixed(2)})`}
                          </span>
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>

            {/* MEMBER / REGISTRATION VERIFICATION MODAL */}
            {scanResult && (scanResult.type === 'member' || scanResult.type === 'registration') && (
              <Modal
                isOpen={!!scanResult}
                onClose={handleScanAgain}
                title={
                  scanResult.type === 'registration' ? 'PRE-REGISTRATION TICKET' : 'MEMBER PHOTO VERIFICATION'
                }
                className="w-full max-w-lg md:max-w-xl mx-auto p-5 sm:p-6 my-auto max-h-[90vh] overflow-y-auto relative text-left animate-fade-in z-350"
              >
                <button
                  type="button"
                  onClick={handleScanAgain}
                  className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>

                {scanResult.type === 'registration' && scanResult.registration && (
                  <div className="space-y-4 pt-2">
                    <div className="p-4 bg-blue-50/60 dark:bg-zinc-900/80 border border-blue-200 dark:border-blue-500/30 rounded-2xl space-y-3 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 shrink-0" /> LOBBY TICKET
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700">
                          {scanResult.registration.id}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white uppercase tracking-wide leading-tight">
                          {scanResult.registration.full_name}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-1">
                          Phone: {scanResult.registration.phone} {scanResult.registration.email ? `• ${scanResult.registration.email}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-200 dark:border-zinc-800 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">Status</span>
                          <span className="font-extrabold text-amber-600 dark:text-amber-400 uppercase">{scanResult.registration.status}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">Preferred Plan</span>
                          <span className="font-extrabold text-blue-600 dark:text-blue-400 uppercase">
                            {scanResult.registration.preferred_plan}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleScanAgain}
                        className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span>Scan Again</span>
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        onClick={async () => {
                          isExitingRef.current = true;
                          await stopCameraHardware();
                          setIsOpen(false);
                          setTimeout(() => {
                            navigate('/members/plans', {
                              state: {
                                openWizard: true,
                                initialStep: 1,
                                initialIntakeMode: 'Manual',
                                prefillData: scanResult.registration
                              }
                            });
                          }, 200);
                        }}
                        className="flex-1 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>Enroll Member</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </Button>
                    </div>
                  </div>
                )}

                {scanResult.type === 'member' && scanResult.member && (
                  <div className="pt-2">
                    <div className="flex flex-col sm:flex-row items-stretch gap-4">
                      <div 
                        onClick={() => {
                          if (scanResult.member?.avatarUrl) {
                            setZoomImage({
                              url: scanResult.member.avatarUrl,
                              title: `${scanResult.member.fullName} (${scanResult.member.memberId})`
                            });
                          }
                        }}
                        className={`group w-full sm:w-44 h-48 sm:h-auto min-h-55 rounded-2xl overflow-hidden bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 shadow-inner flex items-center justify-center relative shrink-0 transition-all ${
                          scanResult.member.avatarUrl ? 'cursor-pointer hover:border-cyan-500/60' : ''
                        }`}
                        title={scanResult.member.avatarUrl ? "Click to Zoom Photo" : undefined}
                      >
                        {scanResult.member.avatarUrl ? (
                          <>
                            <img 
                              src={scanResult.member.avatarUrl} 
                              alt={scanResult.member.fullName} 
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                            />
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-[11px] font-bold uppercase tracking-wider backdrop-blur-[2px]">
                              <Maximize2 className="w-4 h-4 text-cyan-400" />
                              <span>Click to Zoom</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 dark:text-zinc-600 space-y-1.5">
                            <User className="w-14 h-14 stroke-[1.3]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">No Photo</span>
                          </div>
                        )}

                        <div className="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/15 flex items-center gap-1 text-[9px] font-bold text-emerald-400 uppercase tracking-wider shadow-sm z-10">
                          <ShieldCheck className="w-3 h-3" /> Identity Check
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-between space-y-3 min-w-0">
                        <div>
                          <h3 className="font-heading text-lg font-black text-slate-900 dark:text-white uppercase tracking-wide leading-tight truncate">
                            {scanResult.member.fullName}
                          </h3>
                          <p className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-0.5 truncate">
                            {scanResult.member.memberId} {scanResult.member.phone ? `• ${scanResult.member.phone}` : ''}
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap pt-2">
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                              scanResult.member.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                              scanResult.member.status === 'Expires Soon' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                              'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            }`}>
                              {scanResult.member.status}
                            </span>

                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-zinc-700 uppercase truncate">
                              {scanResult.member.membershipPlan}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-0.5">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-cyan-500" /> Valid Until
                            </span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs block">
                              {scanResult.member.expDate}
                            </span>
                          </div>

                          <div className="p-2 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-0.5">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase flex items-center gap-1">
                              <Clock className="w-3 h-3 text-emerald-500" /> Remaining
                            </span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs block">
                              {scanResult.member.remainingDays} Days Left
                            </span>
                          </div>
                        </div>

                        {entryFee > 0 ? (
                          <div className="p-2.5 bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-2 text-left">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                                Entry Fee Settlement
                              </span>
                              <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                                Total: ₱{totalEntryFee.toFixed(2)}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200/60 dark:bg-zinc-950 rounded-lg">
                              <button
                                type="button"
                                onClick={() => setPaymentMethod('Cash')}
                                className={`py-1 text-[10px] font-bold uppercase rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                  paymentMethod === 'Cash'
                                    ? 'bg-cyan-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <CircleDollarSign className="w-3 h-3" /> Cash
                              </button>
                              <button
                                type="button"
                                onClick={() => setPaymentMethod('GCash')}
                                className={`py-1 text-[10px] font-bold uppercase rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                  paymentMethod === 'GCash'
                                    ? 'bg-cyan-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                <CreditCard className="w-3 h-3" /> GCash
                              </button>
                            </div>

                            {paymentMethod === 'GCash' && (
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                                  GCash Reference Number
                                </label>
                                <input
                                  type="text"
                                  value={referenceNumber}
                                  onChange={(e) => setReferenceNumber(e.target.value)}
                                  placeholder="ENTER REF NO. (MIN 6 DIGITS)..."
                                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg font-mono text-xs font-bold uppercase outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
                                />
                              </div>
                            )}

                            <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
                              <input
                                type="checkbox"
                                checked={isPaymentConfirmed}
                                onChange={(e) => setIsPaymentConfirmed(e.target.checked)}
                                className="w-4 h-4 rounded border-emerald-500 text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
                              />
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                Confirmed payment of ₱{totalEntryFee.toFixed(2)} received ({paymentMethod})
                              </span>
                            </label>
                          </div>
                        ) : (
                          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center gap-1.5 font-bold text-[10px] uppercase">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>No Fee (Monthly Plan)</span>
                          </div>
                        )}

                        {scanResult.member.alreadyCheckedInToday && (
                          <div className="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase truncate">
                              ⚠️ Checked in today
                            </span>
                            <label className="inline-flex items-center gap-1.5 text-[10px] font-bold cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={adminOverride}
                                onChange={(e) => setAdminOverride(e.target.checked)}
                                className="w-3.5 h-3.5 rounded text-cyan-600 accent-cyan-600 cursor-pointer"
                              />
                              <span>Override</span>
                            </label>
                          </div>
                        )}

                        {scanResult.member.status === 'Active' || scanResult.member.status === 'Expires Soon' ? (
                          <div className="flex items-center gap-2 pt-2 mt-auto">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handleScanAgain}
                              className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                              <span>SCAN AGAIN</span>
                            </Button>

                            <Button
                              type="button"
                              variant="primary"
                              onClick={handleConfirmCheckIn}
                              disabled={isSubmittingCheckIn || isLockedByDuplicate || isLockedByPayment}
                              className="flex-1 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="whitespace-nowrap">
                                {isSubmittingCheckIn 
                                  ? 'Logging...' 
                                  : isLockedByDuplicate 
                                  ? 'Override Req.'
                                  : isLockedByPayment
                                  ? 'Payment Req.'
                                  : 'Confirm Entry'}
                              </span>
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-2 mt-auto">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handleScanAgain}
                              className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                              <span>Scan Again</span>
                            </Button>

                            <Button
                              type="button"
                              variant="primary"
                              onClick={handleRedirectToAttendance}
                              className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <span className="whitespace-nowrap">Walk-In Pass</span>
                              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Modal>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {zoomImage && (
        <ImageZoomModal
          isOpen={!!zoomImage}
          imageUrl={zoomImage.url}
          title={zoomImage.title}
          onClose={() => setZoomImage(null)}
        />
      )}
    </>,
    document.body
  );
};

export default ScannerPage;