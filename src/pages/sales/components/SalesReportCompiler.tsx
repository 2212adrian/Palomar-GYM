// src/pages/sales/components/SalesReportCompiler.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { X, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';

interface SalesReportCompilerProps {
  isOpen: boolean;
  onClose: () => void;
  transactions?: any[];
}

export const SalesReportCompiler: React.FC<SalesReportCompilerProps> = ({
  isOpen,
  onClose,
  transactions = [],
}) => {
  const [startDate, setStartDate] = useState(
    format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  );
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'Cash' | 'GCash'>(
    'all'
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [fetchedSales, setFetchedSales] = useState<any[]>([]);

  // Fetch sales records from Supabase across the full selected date range
  const loadDateRangeSales = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const startIso = `${startDate}T00:00:00`;
      const endIso = `${endDate}T23:59:59.999`;

      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .is('deleted_at', null)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFetchedSales(data || []);
    } catch (err) {
      console.warn(
        'Failed to load full date range sales, using passed transactions:',
        err
      );
      if (transactions && transactions.length > 0) {
        setFetchedSales(transactions);
      }
    } finally {
      setIsLoadingData(false);
    }
  }, [startDate, endDate, transactions]);

  useEffect(() => {
    if (isOpen) {
      loadDateRangeSales();
    }
  }, [isOpen, loadDateRangeSales]);

  // --- PRESETS LOGIC ---
  const handleQuickPreset = (
    preset: 'day' | 'week' | 'month' | 'prev_month' | 'year'
  ) => {
    const now = new Date();
    let startRange = now;
    let endRange = now;

    switch (preset) {
      case 'day':
        startRange = startOfDay(now);
        endRange = endOfDay(now);
        break;
      case 'week':
        startRange = startOfWeek(now, { weekStartsOn: 0 });
        endRange = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case 'month':
        startRange = startOfMonth(now);
        endRange = endOfMonth(now);
        break;
      case 'prev_month':
        const prev = subMonths(now, 1);
        startRange = startOfMonth(prev);
        endRange = endOfMonth(prev);
        break;
      case 'year':
        startRange = startOfYear(now);
        endRange = endOfYear(now);
        break;
    }

    setStartDate(format(startRange, 'yyyy-MM-dd'));
    setEndDate(format(endRange, 'yyyy-MM-dd'));
  };

  const currentDataset = fetchedSales.length > 0 ? fetchedSales : transactions;

  // Filter transactions with schema normalization and deletion exclusion
  const filteredReportTransactions = useMemo(() => {
    return currentDataset.filter((t: any) => {
      if (t.deleted_at) return false;

      // Extract transaction date
      const rawDate = t.created_at || t.date || t.timestamp;
      const txDate = rawDate ? format(new Date(rawDate), 'yyyy-MM-dd') : '';

      // Extract payment method
      const txMethod = (t.paymentMethod || t.payment_method || 'Cash').trim();

      const isWithinRange = txDate >= startDate && txDate <= endDate;
      const isMatchingMethod =
        paymentFilter === 'all' ||
        txMethod.toLowerCase() === paymentFilter.toLowerCase();

      return isWithinRange && isMatchingMethod;
    });
  }, [currentDataset, startDate, endDate, paymentFilter]);

  const totalAmount = useMemo(() => {
    return filteredReportTransactions.reduce((acc, t) => {
      const amt = Number(t.totalAmount ?? t.total_amount ?? 0);
      return acc + amt;
    }, 0);
  }, [filteredReportTransactions]);

  const totalUnits = useMemo(() => {
    return filteredReportTransactions.reduce((acc, t) => {
      const qty = Number(
        t.quantity ||
          (Array.isArray(t.items)
            ? t.items.reduce(
                (sum: number, i: any) => sum + Number(i.quantity || 1),
                0
              )
            : 1)
      );
      return acc + qty;
    }, 0);
  }, [filteredReportTransactions]);

  const handleCompilePdfReport = async () => {
    if (filteredReportTransactions.length === 0) {
      toast.error('No sales records were found for the selected date range.');
      return;
    }

    try {
      setIsCompiling(true);
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

      let page = doc.addPage([612, 792]);
      const { height } = page.getSize();
      let rowY = height - 190;

      // Header block
      page.drawRectangle({
        x: 40,
        y: height - 85,
        width: 532,
        height: 50,
        color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText('WOLF PALOMAR GYM - FINANCIAL SALES REPORT', {
        x: 55,
        y: height - 55,
        size: 13,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(
        `Date Range: ${startDate} to ${endDate}  |  Payment Filter: ${paymentFilter.toUpperCase()}`,
        {
          x: 55,
          y: height - 72,
          size: 8.5,
          font,
          color: rgb(0.85, 0.9, 1),
        }
      );

      const cashTotal = filteredReportTransactions
        .filter(
          (t) =>
            (t.paymentMethod || t.payment_method || '').toLowerCase() === 'cash'
        )
        .reduce(
          (acc, t) => acc + Number(t.totalAmount ?? t.total_amount ?? 0),
          0
        );

      const gcashTotal = filteredReportTransactions
        .filter(
          (t) =>
            (t.paymentMethod || t.payment_method || '').toLowerCase() ===
            'gcash'
        )
        .reduce(
          (acc, t) => acc + Number(t.totalAmount ?? t.total_amount ?? 0),
          0
        );

      // Summary panel box
      page.drawRectangle({
        x: 40,
        y: height - 155,
        width: 532,
        height: 55,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 1,
      });

      page.drawText('TOTAL REVENUE', {
        x: 55,
        y: height - 120,
        size: 8,
        font: fontBold,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText(`PHP ${totalAmount.toFixed(2)}`, {
        x: 55,
        y: height - 140,
        size: 13,
        font: fontBold,
        color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText('UNITS SOLD', {
        x: 190,
        y: height - 120,
        size: 8,
        font: fontBold,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText(`${totalUnits} Units`, {
        x: 190,
        y: height - 140,
        size: 13,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText('CASH VOLUME', {
        x: 310,
        y: height - 120,
        size: 8,
        font: fontBold,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText(`PHP ${cashTotal.toFixed(2)}`, {
        x: 310,
        y: height - 140,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText('GCASH VOLUME', {
        x: 440,
        y: height - 120,
        size: 8,
        font: fontBold,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText(`PHP ${gcashTotal.toFixed(2)}`, {
        x: 440,
        y: height - 140,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Table headers
      const tableYStart = height - 180;
      page.drawRectangle({
        x: 40,
        y: tableYStart,
        width: 532,
        height: 20,
        color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText('RECEIPT / ID', {
        x: 45,
        y: tableYStart + 6,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('DATE', {
        x: 140,
        y: tableYStart + 6,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('PRODUCT ITEMS', {
        x: 210,
        y: tableYStart + 6,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('METHOD', {
        x: 420,
        y: tableYStart + 6,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('TOTAL AMOUNT', {
        x: 495,
        y: tableYStart + 6,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      rowY = tableYStart - 18;

      filteredReportTransactions.forEach((t: any, idx: number) => {
        if (rowY < 50) {
          page = doc.addPage([612, 792]);
          page.drawRectangle({
            x: 40,
            y: height - 40,
            width: 532,
            height: 18,
            color: rgb(0.07, 0.24, 0.45),
          });
          page.drawText('RECEIPT / ID', {
            x: 45,
            y: height - 34,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          page.drawText('DATE', {
            x: 140,
            y: height - 34,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          page.drawText('PRODUCT ITEMS', {
            x: 210,
            y: height - 34,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          page.drawText('METHOD', {
            x: 420,
            y: height - 34,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          page.drawText('TOTAL AMOUNT', {
            x: 495,
            y: height - 34,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          rowY = height - 58;
        }

        if (idx % 2 === 1) {
          page.drawRectangle({
            x: 40,
            y: rowY - 3,
            width: 532,
            height: 16,
            color: rgb(0.97, 0.98, 0.99),
          });
        }

        const txId = String(t.receipt_no || t.id || 'N/A').slice(0, 14);
        const rawDate = t.created_at || t.date || t.timestamp;
        const txDate = rawDate
          ? format(new Date(rawDate), 'yyyy-MM-dd')
          : 'N/A';
        const txName =
          t.productName ||
          t.product_name ||
          (Array.isArray(t.items)
            ? t.items
                .map(
                  (i: any) => `${i.product_name || 'Item'} x${i.quantity || 1}`
                )
                .join(', ')
            : 'Sales Item');
        const txMethod = t.paymentMethod || t.payment_method || 'Cash';
        const txAmount = Number(t.totalAmount ?? t.total_amount ?? 0);

        page.drawText(txId, {
          x: 45,
          y: rowY,
          size: 7.5,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        page.drawText(txDate, {
          x: 140,
          y: rowY,
          size: 7.5,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });

        const truncatedName =
          txName.length > 38 ? txName.substring(0, 35) + '...' : txName;
        page.drawText(truncatedName, {
          x: 210,
          y: rowY,
          size: 7.5,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });

        page.drawText(txMethod, {
          x: 420,
          y: rowY,
          size: 7.5,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        page.drawText(`Php ${txAmount.toFixed(2)}`, {
          x: 495,
          y: rowY,
          size: 7.5,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });

        rowY -= 18;
      });

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      saveAs(blob, `Palomar_Sales_Report_${startDate}_to_${endDate}.pdf`);
      toast.success('Sales PDF report generated and downloaded successfully!');

      await logAudit(
        'REPORT_GENERATED',
        `Generated and downloaded Sales PDF report from ${startDate} to ${endDate} (${filteredReportTransactions.length} records, Total: ₱${totalAmount.toFixed(2)}).`
      );

      onClose();
    } catch {
      toast.error('Could not generate the PDF report. Please try again.');
    } finally {
      setIsCompiling(false);
    }
  };

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sales Report Compiler"
      className="max-w-lg p-6 overflow-y-auto max-h-[88vh] font-body text-xs text-left"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50 animate-fade-in"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-4 pt-2">
        {/* Presets */}
        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Quick Action Date Range Presets
          </label>
          <div className="grid grid-cols-5 gap-1 select-none">
            {(['day', 'week', 'month', 'prev_month', 'year'] as const).map(
              (preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleQuickPreset(preset)}
                  className="py-1.5 px-0.5 rounded-lg border border-[var(--border-color)] bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[8px] sm:text-[9.5px] font-heading font-black tracking-wider uppercase cursor-pointer text-center text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {preset.replace('_', ' ')}
                </button>
              )
            )}
          </div>
        </div>

        {/* Date Filters */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl outline-none font-semibold text-(--color-text)"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl outline-none font-semibold text-(--color-text)"
            />
          </div>
        </div>

        {/* Payment Filter */}
        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Payment Method
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['all', 'Cash', 'GCash'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentFilter(method)}
                className={`py-2 rounded-lg text-xs font-bold uppercase transition-all border cursor-pointer ${
                  paymentFilter === method
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-xs font-bold'
                    : 'border-[var(--border-color)] text-slate-500 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                {method === 'all' ? 'All Methods' : method}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Card */}
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-[var(--border-color)] flex justify-between items-center animate-fade-in">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Match Tally
              </span>
              {isLoadingData && (
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              )}
            </div>
            <div className="text-lg font-heading text-[var(--color-primary)] mt-0.5">
              {filteredReportTransactions.length} Records ({totalUnits} Units)
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              Accumulated Sum
            </span>
            <div className="text-sm font-sans font-extrabold text-(--color-text) mt-0.5">
              ₱
              {totalAmount.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <Button
          onClick={handleCompilePdfReport}
          variant="primary"
          disabled={
            filteredReportTransactions.length === 0 ||
            isCompiling ||
            isLoadingData
          }
          className="py-3 cursor-pointer w-full"
        >
          {isCompiling ? (
            <div className="flex items-center gap-1.5 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span>Compiling Document...</span>
            </div>
          ) : (
            'COMPILE PDF REPORT'
          )}
        </Button>
      </div>
    </Modal>,
    document.body
  );
};
