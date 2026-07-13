// src/pages/sales/components/SalesReportCompiler.tsx
import React, { useState, useMemo } from 'react';
import { 
  format, startOfDay, endOfDay, 
  startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, 
  subMonths, startOfYear, endOfYear 
} from 'date-fns';
import { X, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

interface SalesReportCompilerProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: any[];
}

export const SalesReportCompiler: React.FC<SalesReportCompilerProps> = ({
  isOpen,
  onClose,
  transactions,
}) => {
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'Cash' | 'GCash'>('all');
  const [isCompiling, setIsCompiling] = useState(false);

  // --- RECONSTRUCTED PRESETS LOGIC ---
  const handleQuickPreset = (preset: 'day' | 'week' | 'month' | 'prev_month' | 'year') => {
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

  const filteredReportTransactions = useMemo(() => {
    return transactions.filter((t: any) => {
      const isWithinRange = t.date >= startDate && t.date <= endDate;
      const isMatchingMethod = paymentFilter === 'all' || t.paymentMethod === paymentFilter;
      return isWithinRange && isMatchingMethod;
    });
  }, [transactions, startDate, endDate, paymentFilter]);

  const totalAmount = useMemo(() => {
    return filteredReportTransactions.reduce((acc, t) => acc + (t.totalAmount || 0), 0);
  }, [filteredReportTransactions]);

  const handleCompilePdfReport = async () => {
    if (filteredReportTransactions.length === 0) {
      toast.error('No matching transactions found.');
      return;
    }

    try {
      setIsCompiling(true);
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([612, 792]);

      // Header block
      page.drawText('WOLF PALOMAR GYM - FINANCIAL SALES REPORT', {
        x: 40,
        y: 740,
        size: 15,
        font: fontBold,
        color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText(`Date Range: ${startDate} to ${endDate}  |  Payment Filter: ${paymentFilter.toUpperCase()}`, {
        x: 40,
        y: 715,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });

      const totalQty = filteredReportTransactions.reduce((acc, t) => acc + (t.quantity || 0), 0);
      const cashTotal = filteredReportTransactions.filter(t => t.paymentMethod === 'Cash').reduce((acc, t) => acc + (t.totalAmount || 0), 0);
      const gcashTotal = filteredReportTransactions.filter(t => t.paymentMethod === 'GCash').reduce((acc, t) => acc + (t.totalAmount || 0), 0);

      // summary panel box
      page.drawRectangle({
        x: 40,
        y: 635,
        width: 532,
        height: 60,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.9, 0.9, 0.9),
        borderWidth: 1,
      });

      page.drawText('TOTAL REVENUE', { x: 50, y: 675, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`PHP ${totalAmount.toFixed(2)}`, { x: 50, y: 650, size: 12, font: fontBold, color: rgb(0.07, 0.24, 0.45) });

      page.drawText('UNITS SOLD', { x: 190, y: 675, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`${totalQty} Units`, { x: 190, y: 650, size: 12, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

      page.drawText('CASH VOLUME', { x: 310, y: 675, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`PHP ${cashTotal.toFixed(2)}`, { x: 310, y: 650, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

      page.drawText('GCASH VOLUME', { x: 440, y: 675, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`PHP ${gcashTotal.toFixed(2)}`, { x: 440, y: 650, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

      // Table headers
      const tableYStart = 600;
      page.drawRectangle({
        x: 40,
        y: tableYStart,
        width: 532,
        height: 20,
        color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText('TRANSACTION ID', { x: 45, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('DATE', { x: 140, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('PRODUCT ITEMS', { x: 210, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('METHOD', { x: 420, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('TOTAL AMOUNT', { x: 495, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });

      let rowY = tableYStart - 18;
      const maxRowsOnPage = 28;
      const rowsToPrint = filteredReportTransactions.slice(0, maxRowsOnPage);

      rowsToPrint.forEach((t: any, idx: number) => {
        if (idx % 2 === 1) {
          page.drawRectangle({
            x: 40,
            y: rowY - 3,
            width: 532,
            height: 16,
            color: rgb(0.97, 0.98, 0.99),
          });
        }

        page.drawText(t.id || 'N/A', { x: 45, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(t.date || 'N/A', { x: 140, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        
        const truncatedName = t.productName.length > 38 ? t.productName.substring(0, 35) + '...' : t.productName;
        page.drawText(truncatedName, { x: 210, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        
        page.drawText(t.paymentMethod || 'N/A', { x: 420, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(`Php ${Number(t.totalAmount || 0).toFixed(2)}`, { x: 495, y: rowY, size: 7.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

        rowY -= 18;
      });

      page.drawText('Palomar Gym Management System 2.0 Official PDF Export', {
        x: 40,
        y: 40,
        size: 8,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      saveAs(blob, `Palomar_Sales_Report_${startDate}_to_${endDate}.pdf`);
      toast.success('Sales PDF exported!');
      onClose();
    } catch {
      toast.error('Failed to compile report.');
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sales Report Compiler"
      className="max-w-md p-6 overflow-y-auto max-h-[85vh] font-body text-xs text-left"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50 animate-fade-in"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-4 pt-2">
        {/* --- PRESETS CONTAINER GRID --- */}
        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Action Date Range Presets</label>
          <div className="grid grid-cols-5 gap-1 select-none">
            {(['day', 'week', 'month', 'prev_month', 'year'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleQuickPreset(preset)}
                className="py-1.5 px-0.5 rounded-lg border border-[var(--border-color)] bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[8px] sm:text-[9.5px] font-heading font-black tracking-wider uppercase cursor-pointer text-center text-slate-600 dark:text-slate-350 transition-colors"
              >
                {preset.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl outline-none font-semibold text-(--color-text)"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl outline-none font-semibold text-(--color-text)"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Method</label>
          <div className="grid grid-cols-3 gap-2">
            {(['all', 'Cash', 'GCash'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentFilter(method)}
                className={`py-2 rounded-lg text-xs font-bold uppercase transition-all border cursor-pointer ${
                  paymentFilter === method
                    ? 'bg-[#123c73] dark:bg-[#bf0202] text-white border-transparent shadow-sm font-bold'
                    : 'border-[var(--border-color)] text-slate-500'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-[var(--border-color)] flex justify-between items-center animate-fade-in">
          <div>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Match Tally</span>
            <div className="text-lg font-heading text-[var(--color-primary)] mt-0.5">{filteredReportTransactions.length} Records</div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Accumulated Sum</span>
            <div className="text-sm font-sans font-extrabold text-(--color-text) mt-0.5">₱{totalAmount.toFixed(2)}</div>
          </div>
        </div>

        <Button
          onClick={handleCompilePdfReport}
          variant="primary"
          disabled={filteredReportTransactions.length === 0 || isCompiling}
          className="py-3 cursor-pointer"
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
    </Modal>
  );
};