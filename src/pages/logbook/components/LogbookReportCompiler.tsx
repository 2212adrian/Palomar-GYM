// src/pages/logbook/components/LogbookReportCompiler.tsx
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

interface LogbookReportCompilerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: any[];
}

export const LogbookReportCompiler: React.FC<LogbookReportCompilerProps> = ({
  isOpen,
  onClose,
  logs,
}) => {
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Walk-In' | 'Existing Member' | 'New Membership'>('all');
  const [isCompiling, setIsCompiling] = useState(false);

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

  const filteredLogs = useMemo(() => {
    return logs.filter((l: any) => {
      if (l.deleted_at) return false;
      const logDate = l.timestamp ? format(new Date(l.timestamp), 'yyyy-MM-dd') : '';
      const isWithinRange = logDate >= startDate && logDate <= endDate;
      const isMatchingCategory = categoryFilter === 'all' || l.customerType === categoryFilter;
      return isWithinRange && isMatchingCategory;
    });
  }, [logs, startDate, endDate, categoryFilter]);

  const totalRevenue = useMemo(() => {
    return filteredLogs.reduce((acc, curr) => acc + (Number(curr.amountPaid) || 0), 0);
  }, [filteredLogs]);

  const handleCompilePdfReport = async () => {
    if (filteredLogs.length === 0) {
      toast.error('No check-in logs found for the selected range.');
      return;
    }

    try {
      setIsCompiling(true);
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([612, 792]);

      page.drawText('WOLF PALOMAR GYM - ATTENDANCE LOG REPORT', {
        x: 40, y: 740, size: 15, font: fontBold, color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText(`Date Range: ${startDate} to ${endDate}  |  Filter: ${categoryFilter.toUpperCase()}`, {
        x: 40, y: 715, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });

      page.drawRectangle({
        x: 40, y: 635, width: 532, height: 60,
        color: rgb(0.95, 0.96, 0.98), borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1,
      });

      page.drawText('ACCUMULATED REVENUE', { x: 50, y: 675, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`PHP ${totalRevenue.toFixed(2)}`, { x: 50, y: 650, size: 12, font: fontBold, color: rgb(0.07, 0.24, 0.45) });

      page.drawText('TOTAL CHECK-INS', { x: 230, y: 675, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`${filteredLogs.length} Checked In`, { x: 230, y: 650, size: 12, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

      const tableYStart = 600;
      page.drawRectangle({ x: 40, y: tableYStart, width: 532, height: 20, color: rgb(0.07, 0.24, 0.45) });

      page.drawText('SLIP ID', { x: 45, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('CUSTOMER NAME', { x: 140, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('CATEGORY', { x: 280, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('PAYMENT METHOD', { x: 410, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('AMOUNT PAID', { x: 500, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });

      let rowY = tableYStart - 18;
      filteredLogs.slice(0, 28).forEach((l: any, idx: number) => {
        if (idx % 2 === 1) {
          page.drawRectangle({ x: 40, y: rowY - 3, width: 532, height: 16, color: rgb(0.97, 0.98, 0.99) });
        }
        page.drawText(l.id, { x: 45, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(l.customerName, { x: 140, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(l.customerType, { x: 280, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(l.paymentMethod, { x: 410, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(`Php ${l.amountPaid.toFixed(2)}`, { x: 500, y: rowY, size: 7.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        rowY -= 18;
      });

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      saveAs(blob, `Logbook_Attendance_Report_${startDate}_to_${endDate}.pdf`);
      toast.success('Logbook PDF compiled successfully!');
      onClose();
    } catch {
      toast.error('Could not generate the PDF report.');
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Attendance Report Compiler"
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
        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Preset Ranges</label>
          <div className="grid grid-cols-5 gap-1 select-none">
            {(['day', 'week', 'month', 'prev_month', 'year'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleQuickPreset(preset)}
                className="py-1.5 px-0.5 rounded-lg border border-[var(--border-color)] bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[8px] sm:text-[9.5px] font-heading font-black tracking-wider uppercase cursor-pointer text-slate-600 dark:text-slate-355 text-center transition-colors"
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
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category Category</label>
          <div className="grid grid-cols-2 gap-2">
            {(['all', 'Walk-In', 'Existing Member', 'New Membership'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setCategoryFilter(method as any)}
                className={`py-2 rounded-lg text-[9px] font-heading tracking-widest uppercase transition-all border cursor-pointer ${
                  categoryFilter === method
                    ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white border-transparent font-bold'
                    : 'border-[var(--border-color)] text-slate-500'
                }`}
              >
                {method === 'all' ? 'All Logs' : method}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-[var(--border-color)] flex justify-between items-center animate-fade-in">
          <div>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Match Records</span>
            <div className="text-lg font-heading text-[var(--color-primary)] mt-0.5">{filteredLogs.length} Checked In</div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Revenue Collected</span>
            <div className="text-sm font-sans font-extrabold text-(--color-text) mt-0.5">₱{totalRevenue.toFixed(2)}</div>
          </div>
        </div>

        <Button
          onClick={handleCompilePdfReport}
          variant="primary"
          disabled={filteredLogs.length === 0 || isCompiling}
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
    </Modal>
  );
};