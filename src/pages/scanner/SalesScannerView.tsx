// src/pages/sales/SalesScannerView.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ShoppingBag, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../../lib/supabase/client';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

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

interface SalesScannerViewProps {
  scannedCode: string | null;
  onClearScan: () => void;
}

interface ProductData {
  id: string;
  barcodeId: string;
  manufacturerBarcode?: string | null;
  productName: string;
  sellingPrice: number;
  stockQuantity: number;
  hasStockLimit: boolean;
  imageUrl?: string | null;
}

export const SalesScannerView: React.FC<SalesScannerViewProps> = ({
  scannedCode,
  onClearScan,
}) => {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!scannedCode) {
      setProductData(null);
      setNotFound(false);
      return;
    }

    const lookupProduct = async () => {
      setIsLoading(true);
      setNotFound(false);
      setProductData(null);

      try {
        const code = scannedCode.trim();
        let cleanMfg = code;
        if (cleanMfg.toUpperCase().startsWith('MFG:')) {
          cleanMfg = cleanMfg.substring(4).trim();
        } else if (cleanMfg.toUpperCase().startsWith('MFG-')) {
          cleanMfg = cleanMfg.substring(4).trim();
        } else if (cleanMfg.toUpperCase().startsWith('MFG')) {
          cleanMfg = cleanMfg.substring(3).trim();
        }

        const { data: product } = await supabase
          .from('products')
          .select('*')
          .is('deleted_at', null)
          .or(
            `barcode_id.ilike.${code},manufacturer_barcode.ilike.${code},barcode_id.ilike.${cleanMfg},manufacturer_barcode.ilike.${cleanMfg}`
          )
          .maybeSingle();

        if (product) {
          playBeepSound();
          setProductData({
            id: product.id,
            barcodeId: product.barcode_id,
            manufacturerBarcode: product.manufacturer_barcode || null,
            productName: product.product_name,
            sellingPrice: Number(product.selling_price || 0),
            stockQuantity: Number(product.stock_quantity || 0),
            hasStockLimit: Boolean(product.has_stock_limit),
            imageUrl: product.image_url || null,
          });
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error('Product lookup failed:', err);
        toast.error('Product lookup failed.');
      } finally {
        setIsLoading(false);
      }
    };

    lookupProduct();
  }, [scannedCode]);

  const handleAddToCart = () => {
    if (!productData) return;
    if (productData.hasStockLimit && productData.stockQuantity <= 0) {
      toast.error(`"${productData.productName}" is currently out of stock.`);
      return;
    }
    toast.success(`Added ${productData.productName} to Sales Cart!`);
    onClearScan();
    navigate('/sales');
  };

  if (!scannedCode) return null;

  return (
    <Modal
      isOpen={Boolean(scannedCode)}
      onClose={onClearScan}
      title="PRODUCT BARCODE SCANNER"
      className="w-full max-w-md mx-auto p-5 relative text-left animate-fade-in"
    >
      <button
        type="button"
        onClick={onClearScan}
        className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-slate-400 hover:text-(--color-text) hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {isLoading ? (
        <div className="py-8 text-center space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Reading Product Barcode...
          </p>
        </div>
      ) : productData ? (
        <div className="space-y-4 pt-1">
          <div className="p-4 bg-slate-50 dark:bg-zinc-900 border-2 border-(--border-color) rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> INVENTORY ITEM
              </span>
              <span className="font-mono text-xs text-slate-400">
                {productData.barcodeId}
                {productData.manufacturerBarcode &&
                  ` (MFG: ${productData.manufacturerBarcode})`}
              </span>
            </div>

            <h3 className="font-bold text-base text-(--color-text) uppercase">
              {productData.productName}
            </h3>

            <div className="flex items-center justify-between pt-2 border-t border-(--border-color)">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Stock Status
                </span>
                <span
                  className={`text-xs font-bold ${
                    !productData.hasStockLimit
                      ? 'text-blue-400'
                      : productData.stockQuantity > 5
                        ? 'text-emerald-500'
                        : productData.stockQuantity > 0
                          ? 'text-amber-500'
                          : 'text-rose-500'
                  }`}
                >
                  {!productData.hasStockLimit
                    ? 'UNLIMITED'
                    : `${productData.stockQuantity} units available`}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Price
                </span>
                <span className="font-mono font-black text-lg text-emerald-500">
                  ₱{productData.sellingPrice.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={handleAddToCart}
            disabled={
              productData.hasStockLimit && productData.stockQuantity <= 0
            }
            className="w-full py-3.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>ADD TO SALES CART</span>
          </Button>
        </div>
      ) : notFound ? (
        <div className="space-y-4 py-2 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-(--color-text) uppercase">
              PRODUCT NOT FOUND
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-1">
              "{scannedCode}"
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onClearScan}
            className="w-full py-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            TRY ANOTHER SCAN
          </Button>
        </div>
      ) : null}
    </Modal>
  );
};
