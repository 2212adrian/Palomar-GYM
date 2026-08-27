// src/pages/logbook/components/LogbookReportCompiler.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { supabase } from '../../../lib/supabase/client';

interface LogbookReportCompilerProps {
  isOpen: boolean;
  onClose: () => void;
  logs?: any[];
}

export const LogbookReportCompiler: React.FC<LogbookReportCompilerProps> = ({
  isOpen,
  onClose,
  logs = [],
}) => {
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Walk-In' | 'Existing Member' | 'New Membership'>('all');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [fetchedLogs, setFetchedLogs] = useState<any[]>([]);

  // Fetch attendance records from Supabase across the full selected date range
  const loadDateRangeData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const startIso = `${startDate}T00:00:00`;
      const endIso = `${endDate}T23:59:59.999`;

      const [attRes, subsRes] = await Promise.all([
        supabase
          .from('attendance')
          .select('*')
          .is('deleted_at', null)
          .gte('check_in_time', startIso)
          .lte('check_in_time', endIso)
          .order('check_in_time', { ascending: false }),
        supabase
          .from('subscriptions')
          .select('*, members(full_name, phone)')
          .is('voided_at', null)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false })
      ]);

      const attList = (attRes.data || []).map((a: any) => ({
        id: a.id ? String(a.id).slice(0, 8).toUpperCase() : `ATT-${Date.now().toString().slice(-4)}`,
        timestamp: a.check_in_time,
        customerName: a.customer_name || 'Guest',
        customerType: a.customer_type || 'Walk-In',
        categoryOrPlan: a.plan_name || (a.customer_type === 'Walk-In' ? 'Day Pass' : 'Member Check-in'),
        paymentMethod: a.payment_method || 'Cash',
        amountPaid: Number(a.entry_fee || 0),
        deleted_at: a.deleted_at
      }));

      const subsList = (subsRes.data || []).map((s: any) => ({
        id: s.id ? String(s.id).slice(0, 8).toUpperCase() : `SUB-${Date.now().toString().slice(-4)}`,
        timestamp: s.created_at,
        customerName: s.members?.full_name || 'Member',
        customerType: 'New Membership',
        categoryOrPlan: s.plan_name || 'Membership Plan',
        paymentMethod: s.payment_method || 'Cash',
        amountPaid: Number(s.price || 0),
        deleted_at: s.voided_at
      }));

      const combined = [...attList, ...subsList].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setFetchedLogs(combined);
    } catch (err) {
      console.warn('Failed to load full range attendance logs, using local logs:', err);
      if (logs && logs.length > 0) {
        setFetchedLogs(logs);
      }
    } finally {
      setIsLoadingData(false);
    }
  }, [startDate, endDate, logs]);

  useEffect(() => {
    if (isOpen) {
      loadDateRangeData();
    }
  }, [isOpen, loadDateRangeData]);

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

  const currentDataset = fetchedLogs.length > 0 ? fetchedLogs : logs;

  const filteredLogs = useMemo(() => {
    return currentDataset.filter((l: any) => {
      if (l.deleted_at) return false;
      const rawDate = l.timestamp || l.check_in_time || l.created_at;
      const logDate = rawDate ? format(new Date(rawDate), 'yyyy-MM-dd') : '';
      const isWithinRange = logDate >= startDate && logDate <= endDate;
      
      const itemCustomerType = (l.customerType || l.customer_type || '').trim();
      let isMatchingCategory = false;
      if (categoryFilter === 'all') {
        isMatchingCategory = true;
      } else if (categoryFilter === 'Walk-In') {
        isMatchingCategory = itemCustomerType.toLowerCase().includes('walk');
      } else if (categoryFilter === 'Existing Member') {
        isMatchingCategory = itemCustomerType.toLowerCase().includes('exist') || itemCustomerType === 'Member';
      } else if (categoryFilter === 'New Membership') {
        isMatchingCategory = itemCustomerType.toLowerCase().includes('new') || itemCustomerType.toLowerCase().includes('sub') || Boolean(l.isSubscription);
      }

      return isWithinRange && isMatchingCategory;
    });
  }, [currentDataset, startDate, endDate, categoryFilter]);

  const totalRevenue = useMemo(() => {
    return filteredLogs.reduce((acc, curr) => acc + (Number(curr.amountPaid || curr.entry_fee || 0)), 0);
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
      
      let page = doc.addPage([612, 792]);
      const { height } = page.getSize();
      let rowY = height - 190;

      // Header Block
      page.drawRectangle({
        x: 40,
        y: height - 85,
        width: 532,
        height: 50,
        color: rgb(0.07, 0.24, 0.45),
      });

      page.drawText('WOLF PALOMAR GYM - ATTENDANCE & LOGBOOK REPORT', {
        x: 55, y: height - 55, size: 13, font: fontBold, color: rgb(1, 1, 1),
      });

      page.drawText(`Date Range: ${startDate} to ${endDate}  |  Category: ${categoryFilter.toUpperCase()}`, {
        x: 55, y: height - 72, size: 8.5, font, color: rgb(0.85, 0.9, 1),
      });

      // KPI Summary Box
      page.drawRectangle({
        x: 40, y: height - 155, width: 532, height: 55,
        color: rgb(0.95, 0.96, 0.98), borderColor: rgb(0.85, 0.88, 0.92), borderWidth: 1,
      });

      page.drawText('ACCUMULATED REVENUE', { x: 55, y: height - 120, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`PHP ${totalRevenue.toFixed(2)}`, { x: 55, y: height - 140, size: 13, font: fontBold, color: rgb(0.07, 0.24, 0.45) });

      page.drawText('TOTAL CHECK-INS / ENTRIES', { x: 250, y: height - 120, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`${filteredLogs.length} Records`, { x: 250, y: height - 140, size: 13, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

      page.drawText('GENERATED DATE', { x: 440, y: height - 120, size: 8, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(format(new Date(), 'yyyy-MM-dd'), { x: 440, y: height - 140, size: 11, font, color: rgb(0.3, 0.3, 0.3) });

      // Table Header
      const tableYStart = height - 180;
      page.drawRectangle({ x: 40, y: tableYStart, width: 532, height: 20, color: rgb(0.07, 0.24, 0.45) });

      page.drawText('ID / SLIP', { x: 45, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('CUSTOMER NAME', { x: 130, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('CATEGORY', { x: 270, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('PAYMENT', { x: 400, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('AMOUNT PAID', { x: 490, y: tableYStart + 6, size: 8, font: fontBold, color: rgb(1, 1, 1) });

      rowY = tableYStart - 18;

      filteredLogs.forEach((l: any, idx: number) => {
        if (rowY < 50) {
          page = doc.addPage([612, 792]);
          // Header on subsequent pages
          page.drawRectangle({ x: 40, y: height - 40, width: 532, height: 18, color: rgb(0.07, 0.24, 0.45) });
          page.drawText('ID / SLIP', { x: 45, y: height - 34, size: 8, font: fontBold, color: rgb(1, 1, 1) });
          page.drawText('CUSTOMER NAME', { x: 130, y: height - 34, size: 8, font: fontBold, color: rgb(1, 1, 1) });
          page.drawText('CATEGORY', { x: 270, y: height - 34, size: 8, font: fontBold, color: rgb(1, 1, 1) });
          page.drawText('PAYMENT', { x: 400, y: height - 34, size: 8, font: fontBold, color: rgb(1, 1, 1) });
          page.drawText('AMOUNT PAID', { x: 490, y: height - 34, size: 8, font: fontBold, color: rgb(1, 1, 1) });
          rowY = height - 58;
        }

        if (idx % 2 === 1) {
          page.drawRectangle({ x: 40, y: rowY - 3, width: 532, height: 16, color: rgb(0.97, 0.98, 0.99) });
        }

        const idStr = String(l.id || '').slice(0, 10);
        const nameStr = String(l.customerName || 'Guest').slice(0, 24);
        const typeStr = String(l.customerType || 'Walk-In').slice(0, 18);
        const payStr = String(l.paymentMethod || 'Cash').slice(0, 12);
        const amt = Number(l.amountPaid || l.entry_fee || 0);

        page.drawText(idStr, { x: 45, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(nameStr, { x: 130, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(typeStr, { x: 270, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(payStr, { x: 400, y: rowY, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(`Php ${amt.toFixed(2)}`, { x: 490, y: rowY, size: 7.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        rowY -= 18;
      });

      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      saveAs(blob, `Attendance_Report_${startDate}_to_${endDate}.pdf`);
      toast.success('Attendance Report compiled successfully!');
      onClose();
    } catch (err: any) {
      toast.error('Could not generate the PDF report.');
    } finally {
      setIsCompiling(false);
    }
  };

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Attendance Report Compiler"
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
        {/* Quick Presets */}
        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Preset Ranges</label>
          <div className="grid grid-cols-5 gap-1 select-none">
            {(['day', 'week', 'month', 'prev_month', 'year'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleQuickPreset(preset)}
                className="py-1.5 px-0.5 rounded-lg border border-[var(--border-color)] bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[8px] sm:text-[9.5px] font-heading font-black tracking-wider uppercase cursor-pointer text-slate-600 dark:text-slate-300 text-center transition-colors"
              >
                {preset.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Date Inputs */}
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

        {/* Category Filters */}
        <div className="grid gap-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category Filter</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['all', 'Walk-In', 'Existing Member', 'New Membership'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`py-2 px-1 rounded-lg text-[9.5px] font-heading tracking-wider uppercase transition-all border cursor-pointer text-center whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white border-transparent font-bold shadow-xs'
                    : 'border-[var(--border-color)] text-slate-500 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                {cat === 'all' ? 'All Logs' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Result Box */}
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-[var(--border-color)] flex justify-between items-center animate-fade-in">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Match Records</span>
              {isLoadingData && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
            </div>
            <div className="text-lg font-heading text-[var(--color-primary)] mt-0.5">
              {filteredLogs.length} Checked In
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Revenue Collected</span>
            <div className="text-sm font-sans font-extrabold text-(--color-text) mt-0.5">
              ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <Button
          onClick={handleCompilePdfReport}
          variant="primary"
          disabled={filteredLogs.length === 0 || isCompiling || isLoadingData}
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
