// src/pages/dashboard/components/InventoryAlertsSection.tsx
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-heading flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Inventory Alerts
            </h3>
            <p className="text-xs text-slate-500">
              Retail merchandise and supplements below safety threshold.
            </p>
          </div>
          <button
            onClick={onViewInventory || (() => navigate('/sales/products'))}
            className="text-xs font-semibold text-[#123c73] dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0"
          >
            View Inventory <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {lowStockItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            All inventory levels are healthy and above threshold.
          </div>
        ) : (
          <div className="space-y-2.5">
            {lowStockItems.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors gap-3"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {item.product_name}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{item.barcode_id}</span>
                      <span>•</span>
                      <span>{formatPHP(item.selling_price)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                    item.stock_quantity === 0
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                  }`}>
                    {item.stock_quantity === 0 ? 'Out of stock' : `${item.stock_quantity} remaining`}
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
          className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Manage Stock & Restock Products</span>
        </button>
      </div>
    </div>
  );
};
