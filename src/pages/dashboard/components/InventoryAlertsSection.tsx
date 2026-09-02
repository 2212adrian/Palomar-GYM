import React from 'react';
import { Package, AlertTriangle, ArrowRight, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LowStockProductItem } from '../types';
import { formatPHP } from '../dashboardService';

interface InventoryAlertsSectionProps {
  lowStockItems: LowStockProductItem[];
  onViewInventory?: () => void;
}

export const InventoryAlertsSection: React.FC<InventoryAlertsSectionProps> = ({
  lowStockItems,
  onViewInventory,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-heading flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Inventory & Restock Alerts
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              Retail items and supplements below minimum threshold.
            </p>
          </div>
          <button
            onClick={onViewInventory || (() => navigate('/sales/products'))}
            className="text-xs font-bold text-[#123c73] dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>Manage</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {lowStockItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            All inventory levels are healthy and stocked.
          </div>
        ) : (
          <div className="space-y-2">
            {lowStockItems.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1e232d]/40 hover:bg-slate-100/80 dark:hover:bg-[#1e232d]/80 transition-colors gap-2 sm:gap-3"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.product_name}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{item.barcode_id}</span>
                      <span>•</span>
                      <span>{formatPHP(item.selling_price)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] sm:text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      item.stock_quantity === 0
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {item.stock_quantity === 0
                      ? 'Out of stock'
                      : `${item.stock_quantity} left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2">
        <button
          onClick={onViewInventory || (() => navigate('/sales/products'))}
          className="w-full py-2.5 bg-slate-100 dark:bg-[#1e232d] hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
        >
          <ShoppingCart className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>Go to Inventory Stock Register</span>
        </button>
      </div>
    </div>
  );
};
