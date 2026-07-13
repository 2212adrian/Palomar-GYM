// src/pages/sales/components/SalesDialog.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Search, Plus, Trash2, Check, X, ShoppingCart 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';

interface SalesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  onSaleSuccess: (newTx: any, updatedProducts: any[]) => void;
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

  // Schema-independent helper attributes
  const getProductName = (p: any) => p.product_name || p.name || 'Unnamed Product';
  const getProductPrice = (p: any) => Number(p.selling_price || p.sellingPrice || 0);
  const getProductStock = (p: any) => p.stock_quantity !== undefined ? p.stock_quantity : (p.stock !== undefined ? p.stock : -1);
  const getProductBarcode = (p: any) => p.barcode_id || p.barcode || 'N/A';

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

  // Compute total payable amount
  const totalPayable = useMemo(() => {
    return cart.reduce((sum, item) => sum + (getProductPrice(item.product) * item.quantity), 0);
  }, [cart]);

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

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      const hasLimit = stock !== null && stock !== undefined && stock !== -1;
      if (!hasLimit || currentQty < stock) {
        const updatedCart = [...cart];
        updatedCart[existingIndex].quantity += 1;
        setCart(updatedCart);
      } else {
        toast.error('Cannot add more. Stock limit reached.');
      }
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    setSearchTerm(''); // Reset search input on selection
  };

  const handleUpdateQuantity = (idx: number, delta: number) => {
    const updatedCart = [...cart];
    const item = updatedCart[idx];
    const stock = getProductStock(item.product);
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      updatedCart.splice(idx, 1);
    } else {
      const hasLimit = stock !== null && stock !== undefined && stock !== -1;
      if (!hasLimit || newQty <= stock) {
        item.quantity = newQty;
      } else {
        toast.error('Limit reached. Cannot exceed available inventory.');
        return;
      }
    }
    setCart(updatedCart);
  };

  const handleCompleteSale = () => {
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

    // Process Stock Update for each cart item
    const updatedProducts = products.map((p: any) => {
      const cartItem = cart.find(item => item.product.id === p.id);
      if (cartItem) {
        const stock = getProductStock(p);
        if (stock !== null && stock !== undefined && stock !== -1) {
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

    // Register Transaction Object (Formated to handle multiple items under one ledger card)
    const now = new Date();
    const newTx = {
      id: `TX-${Math.floor(100000 + Math.random() * 900000)}`,
      items: cart.map(item => ({
        productId: item.product.id,
        productName: getProductName(item.product),
        quantity: item.quantity,
        price: getProductPrice(item.product),
      })),
      // For legacy display compatibility: Join list with commas
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

    setIsSuccess(true);

    setTimeout(() => {
      onSaleSuccess(newTx, updatedProducts);
      setIsSuccess(false);
      setCart([]);
      setSearchTerm('');
      setAmountReceived('');
      setReferenceNumber('');
      onClose();
    }, 1500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="RECORD SALE TRANSACTION"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body relative"
    >
      {/* EXPLICIT CLOSE BUTTON */}
      <button
        type="button"
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
            {/* Product search lookup */}
            <div className="field-wrap">
              <input
                type="text"
                placeholder=" "
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="field-input"
              />
              <label className="field-label">
                <Search className="w-3.5 h-3.5" />
                Search and Add Products
              </label>
            </div>

            {/* Instant matching list */}
            {searchTerm && (
              <div className="max-h-40 overflow-y-auto border border-[var(--border-color)] bg-[var(--bg-input)] rounded-xl divide-y divide-[var(--border-color)] shadow-inner">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((p: any) => {
                    const isOutOfStock = getProductStock(p) === 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => handleAddToCart(p)}
                        className={`w-full p-2.5 flex items-center justify-between text-left transition-all hover:bg-slate-200/50 dark:hover:bg-zinc-800 ${
                          isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-[var(--color-text)]">{getProductName(p)}</div>
                          <div className="text-[9px] text-slate-500 font-mono">Barcode: {getProductBarcode(p)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-heading text-[var(--color-text)]">₱{getProductPrice(p)}</div>
                          <div className="text-[9px] font-sans font-bold text-slate-400">
                            {isOutOfStock ? 'OUT OF STOCK' : `Stock: ${getProductStock(p)}`}
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

            {/* Dynamic Multi-item Shopping Cart */}
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
                        <h4 className="font-bold text-[var(--color-text)] truncate">{getProductName(item.product)}</h4>
                        <span className="text-[10px] text-[var(--color-primary)] font-heading mt-0.5 block">₱{getProductPrice(item.product).toFixed(2)}</span>
                      </div>

                      {/* Item Quantity control counter */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, -1)}
                          className="w-7 h-7 border border-[var(--border-color)] bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center font-heading hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-heading w-4 text-center text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(idx, 1)}
                          className="w-7 h-7 border border-[var(--border-color)] bg-slate-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center font-heading hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border border-dashed border-[var(--border-color)] rounded-xl text-center text-xs text-slate-400">
                  Cart is empty. Search products above to add items.
                </div>
              )}
            </div>

            {/* Payment Methods */}
            {cart.length > 0 && (
              <div className="space-y-3 border-t border-[var(--border-color)] pt-3">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Choose Payment Method
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Cash')}
                    className={`py-2.5 rounded-xl font-heading text-xs uppercase tracking-wider border transition-all cursor-pointer ${
                      paymentMethod === 'Cash'
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-sm'
                        : 'bg-transparent border-[var(--border-color)] text-slate-500'
                    }`}
                  >
                    CASH
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('GCash')}
                    className={`py-2.5 rounded-xl font-heading text-xs uppercase tracking-wider border transition-all cursor-pointer ${
                      paymentMethod === 'GCash'
                        ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-sm'
                        : 'bg-transparent border-[var(--border-color)] text-slate-500'
                    }`}
                  >
                    GCASH
                  </button>
                </div>

                {paymentMethod === 'Cash' ? (
                  <div className="field-wrap pt-1">
                    <input
                      type="number"
                      placeholder=" "
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      className="field-input"
                    />
                    <label className="field-label">Amount Received (PHP)</label>
                    
                    {amountReceived && (
                      <div className="text-xs font-sans text-emerald-600 dark:text-emerald-400 mt-1 flex justify-between">
                        <span>Calculated Change:</span>
                        <span className="font-extrabold">
                          ₱{Math.max(0, Number(amountReceived) - totalPayable).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="field-wrap pt-1">
                    <input
                      type="text"
                      placeholder=" "
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="field-input uppercase"
                    />
                    <label className="field-label">GCash Reference Number</label>
                    
                    {referenceNumber.trim().length >= 6 && (
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans mt-1 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> GCash reference successfully recorded.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Total summary block */}
            {cart.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-[var(--border-color)] space-y-1 text-xs font-sans">
                <div className="flex justify-between text-slate-500">
                  <span>Unique Items:</span>
                  <span>{cart.length} items</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Total Units:</span>
                  <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="border-t border-[var(--border-color)] pt-1.5 flex justify-between font-heading text-sm text-[var(--color-text)]">
                  <span>TOTAL PAYABLE:</span>
                  <span className="text-[var(--color-primary)]">
                    ₱{totalPayable.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-3">
              <Button
                onClick={handleCompleteSale}
                variant="primary"
                disabled={cart.length === 0}
                className="py-3.5 cursor-pointer"
              >
                COMPLETE TRANSACTION
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
            <h2 className="font-heading text-lg tracking-wider text-[var(--color-text)]">
              SALE AUTHORIZED
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs text-center font-body animate-pulse">
              Transaction has been committed to the ledger, and stock inventory was updated.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
};