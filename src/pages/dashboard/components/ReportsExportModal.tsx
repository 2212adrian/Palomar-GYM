// src/pages/dashboard/components/ReportsExportModal.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  endOfYear 
} from 'date-fns';
import { 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  CheckCircle,
  Calendar,
  Layers,
  Award,
  FileCheck2,
  Table as TableIcon,
  ShieldCheck,
  TrendingUp,
  X
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { supabase } from '../../../lib/supabase/client';
import type { BirReportItem, TopProductMetric, RevenueTimelinePoint } from '../types';
import { formatPHP } from '../dashboardService';

export type ReportCategoryType = 'bir' | 'sales' | 'attendance' | 'subscriptions' | 'combined' | 'inventory';

interface ReportsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: ReportCategoryType;
  birData?: BirReportItem[];
  topProducts?: TopProductMetric[];
  revenueTimeline?: RevenueTimelinePoint[];
}

interface ReportCategoryMeta {
  id: ReportCategoryType;
  title: string;
  shortLabel: string;
  badge: string;
  description: string;
  legalPurpose: string;
  columns: string[];
  filePrefix: string;
  icon: React.ElementType;
}

const REPORT_CATEGORIES: ReportCategoryMeta[] = [
  {
    id: 'bir',
    title: 'BIR Official Sales & Tax Register',
    shortLabel: 'BIR Sales & Tax',
    badge: 'BIR Form 2551Q / Non-VAT',
    description: 'Compliant Philippine Bureau of Internal Revenue sales book and official receipt ledger with breakdown of gross revenue, VAT-exempt transactions, and payment methods.',
    legalPurpose: 'Mandatory bookkeeping ledger for BIR quarterly percentage tax filing, audit inspection, and official receipt verification.',
    columns: ['OR / Ref #', 'Date & Time', 'Customer Name', 'TIN', 'Transaction Type', 'Gross Sales (₱)', 'VAT-Exempt (₱)', 'Net Sales (₱)', 'Payment Method', 'Status'],
    filePrefix: 'BIR_Official_Tax_Register',
    icon: ShieldCheck
  },
  {
    id: 'sales',
    title: 'Product Inventory & POS Sales Register',
    shortLabel: 'POS & Inventory',
    badge: 'Stock Velocity & POS',
    description: 'Itemized retail sales ledger capturing unit prices, barcode identities, quantity velocities, gross sales per item, and current shelf stock levels.',
    legalPurpose: 'Point-of-sale inventory audit, shrinkage monitoring, merchandise margin analysis, and reorder planning.',
    columns: ['Barcode ID', 'Product Name', 'Unit Price (₱)', 'Units Sold', 'Gross Sales (₱)', 'Stock Remaining', 'Restock Alert'],
    filePrefix: 'Product_Sales_Inventory',
    icon: FileSpreadsheet
  },
  {
    id: 'attendance',
    title: 'Gym Attendance & Facility Pass Log',
    shortLabel: 'Attendance Passes',
    badge: 'Logbook & Foot Traffic',
    description: 'Comprehensive physical and digital check-in logbook tracking member entries, walk-in day passes, cashier collections, and peak facility usage hours.',
    legalPurpose: 'Facility utilization verification, front-desk collection reconciliation, and physical safety occupancy tracking.',
    columns: ['Slip / Log #', 'Check-In Date', 'Customer Name', 'Access Category', 'Entry Fee (₱)', 'Payment Method', 'Payment Ref'],
    filePrefix: 'Gym_Attendance_Log',
    icon: Calendar
  },
  {
    id: 'subscriptions',
    title: 'Membership Subscriptions & Contracts',
    shortLabel: 'Memberships',
    badge: 'Contract & Membership',
    description: 'Active gym membership contracts, subscription intakes, recurring renewal revenue, plan packages, and active client terms.',
    legalPurpose: 'Membership recurring revenue reporting, contract expiration audit, and customer account status validation.',
    columns: ['Contract ID', 'Member Name', 'Plan Name', 'Contract Price (₱)', 'Start Date', 'End Date', 'Payment Method', 'Status'],
    filePrefix: 'Membership_Contracts',
    icon: Award
  },
  {
    id: 'combined',
    title: 'Consolidated Operations & Financial Summary',
    shortLabel: 'Combined Financial',
    badge: 'Executive Summary',
    description: 'Unified financial timeline combining retail point-of-sale proceeds, logbook day passes, and membership subscriptions into an executive financial statement.',
    legalPurpose: 'Executive management review, daily cash-up reconciliation, and multi-stream revenue growth analytics.',
    columns: ['Date', 'POS Sales (₱)', 'Logbook Passes (₱)', 'Subscriptions (₱)', 'Total Combined (₱)', 'Transactions Count'],
    filePrefix: 'Consolidated_Financial_Summary',
    icon: TrendingUp
  }
];

export const ReportsExportModal: React.FC<ReportsExportModalProps> = ({
  isOpen,
  onClose,
  initialType = 'bir',
  birData = [],
  topProducts = [],
  revenueTimeline = []
}) => {
  const normalizedInitial = (initialType === 'inventory' ? 'sales' : initialType) as ReportCategoryType;
  const [reportType, setReportType] = useState<ReportCategoryType>(normalizedInitial);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [previewTab, setPreviewTab] = useState<'showcase' | 'details'>('showcase');

  // Live category datasets loaded from Supabase
  const [liveBirData, setLiveBirData] = useState<BirReportItem[]>(birData);
  const [liveSalesData, setLiveSalesData] = useState<any[]>([]);
  const [liveAttendanceData, setLiveAttendanceData] = useState<any[]>([]);
  const [liveSubsData, setLiveSubsData] = useState<any[]>([]);

  const selectedCategoryMeta = useMemo(() => {
    return REPORT_CATEGORIES.find(c => c.id === reportType) || REPORT_CATEGORIES[0];
  }, [reportType]);

  // Fetch full live category data when date range or category changes
  const loadCategoryData = useCallback(async () => {
    if (!isOpen) return;
    try {
      setIsLoadingLive(true);
      const startIso = `${startDate}T00:00:00`;
      const endIso = `${endDate}T23:59:59.999`;

      if (reportType === 'bir') {
        const [salesRes, attRes, subsRes] = await Promise.all([
          supabase.from('sales').select('*').is('deleted_at', null).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('attendance').select('*').is('deleted_at', null).gte('check_in_time', startIso).lte('check_in_time', endIso),
          supabase.from('subscriptions').select('*, members(full_name, phone)').is('voided_at', null).gte('created_at', startIso).lte('created_at', endIso)
        ]);

        const items: BirReportItem[] = [];
        (salesRes.data || []).forEach((s: any) => {
          const gross = Number(s.total_amount || 0);
          items.push({
            receipt_no: s.receipt_no || `SLS-${String(s.id).slice(0, 6)}`,
            date: s.created_at,
            customer_name: s.customer_name || 'Counter Customer',
            tin_number: s.tin_number || 'N/A',
            transaction_type: 'Product Sale',
            gross_sales: gross,
            vat_exempt_sales: gross,
            vatable_sales: 0,
            vat_amount: 0,
            net_sales: gross,
            payment_method: s.payment_method || 'Cash',
            payment_ref: s.payment_ref || undefined,
            status: 'Valid'
          });
        });

        (attRes.data || []).filter((a: any) => Number(a.entry_fee || 0) > 0).forEach((a: any) => {
          const gross = Number(a.entry_fee || 0);
          items.push({
            receipt_no: `LOG-${String(a.id).slice(0, 6)}`,
            date: a.check_in_time,
            customer_name: a.customer_name || 'Walk-In Guest',
            tin_number: 'N/A',
            transaction_type: 'Walk-In Entry',
            gross_sales: gross,
            vat_exempt_sales: gross,
            vatable_sales: 0,
            vat_amount: 0,
            net_sales: gross,
            payment_method: a.payment_method || 'Cash',
            payment_ref: a.payment_ref || undefined,
            status: 'Valid'
          });
        });

        (subsRes.data || []).forEach((sub: any) => {
          const gross = Number(sub.price || 0);
          items.push({
            receipt_no: `SUB-${String(sub.id).slice(0, 6)}`,
            date: sub.created_at,
            customer_name: sub.members?.full_name || 'Member',
            tin_number: 'N/A',
            transaction_type: 'Gym Subscription',
            gross_sales: gross,
            vat_exempt_sales: gross,
            vatable_sales: 0,
            vat_amount: 0,
            net_sales: gross,
            payment_method: sub.payment_method || 'Cash',
            payment_ref: undefined,
            status: 'Valid'
          });
        });

        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLiveBirData(items.length > 0 ? items : birData);
      } else if (reportType === 'sales') {
        const [salesRes, prodRes] = await Promise.all([
          supabase.from('sales').select('*').is('deleted_at', null).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('products').select('*').is('deleted_at', null)
        ]);

        const allSales = salesRes.data || [];
        const allProds = prodRes.data || [];

        const prodMap: Record<string, { barcode: string; name: string; price: number; stock: number; sold: number; revenue: number }> = {};
        allProds.forEach(p => {
          prodMap[p.id] = {
            barcode: p.barcode_id || `BC-${p.id.slice(0, 4)}`,
            name: p.product_name,
            price: Number(p.selling_price || 0),
            stock: Number(p.stock || 0),
            sold: 0,
            revenue: 0
          };
        });

        allSales.forEach(s => {
          if (s.product_id && prodMap[s.product_id]) {
            const qty = Number(s.quantity || 1);
            prodMap[s.product_id].sold += qty;
            prodMap[s.product_id].revenue += Number(s.total_amount || 0);
          } else if (Array.isArray(s.items)) {
            s.items.forEach((i: any) => {
              const pid = i.product_id || i.id;
              if (pid && prodMap[pid]) {
                const qty = Number(i.quantity || 1);
                prodMap[pid].sold += qty;
                prodMap[pid].revenue += Number(i.subtotal || (i.price * qty) || 0);
              }
            });
          }
        });

        const list = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue);
        if (list.length === 0 && topProducts.length > 0) {
          setLiveSalesData(topProducts.map(p => ({
            barcode: p.barcode_id,
            name: p.product_name,
            price: p.selling_price,
            stock: p.current_stock,
            sold: p.total_sold,
            revenue: p.total_revenue
          })));
        } else {
          setLiveSalesData(list);
        }
      } else if (reportType === 'attendance') {
        const { data } = await supabase
          .from('attendance')
          .select('*')
          .is('deleted_at', null)
          .gte('check_in_time', startIso)
          .lte('check_in_time', endIso)
          .order('check_in_time', { ascending: false });

        setLiveAttendanceData(data || []);
      } else if (reportType === 'subscriptions') {
        const { data } = await supabase
          .from('subscriptions')
          .select('*, members(full_name, phone, status)')
          .is('voided_at', null)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        setLiveSubsData(data || []);
      }
    } catch (err) {
      console.warn('Error loading live export dataset:', err);
    } finally {
      setIsLoadingLive(false);
    }
  }, [isOpen, reportType, startDate, endDate, birData]);

  useEffect(() => {
    loadCategoryData();
  }, [loadCategoryData]);

  // Presets
  const handleQuickPreset = (preset: 'today' | 'week' | 'month' | 'last_month' | 'year') => {
    const now = new Date();
    let s = now;
    let e = now;

    switch (preset) {
      case 'today':
        s = startOfDay(now);
        e = endOfDay(now);
        break;
      case 'week':
        s = startOfWeek(now, { weekStartsOn: 0 });
        e = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case 'month':
        s = startOfMonth(now);
        e = endOfMonth(now);
        break;
      case 'last_month':
        const prev = subMonths(now, 1);
        s = startOfMonth(prev);
        e = endOfMonth(prev);
        break;
      case 'year':
        s = startOfYear(now);
        e = endOfYear(now);
        break;
    }

    setStartDate(format(s, 'yyyy-MM-dd'));
    setEndDate(format(e, 'yyyy-MM-dd'));
  };

  // Metrics for Current Category
  const categoryStats = useMemo(() => {
    if (reportType === 'bir') {
      const gross = liveBirData.reduce((acc, i) => acc + i.gross_sales, 0);
      return {
        count: liveBirData.length,
        totalValue: gross,
        label: 'Gross Receipts',
        secondary: `${liveBirData.filter(i => i.payment_method === 'Cash').length} Cash / ${liveBirData.filter(i => i.payment_method === 'GCash').length} GCash`
      };
    } else if (reportType === 'sales') {
      const gross = liveSalesData.reduce((acc, p) => acc + p.revenue, 0);
      const units = liveSalesData.reduce((acc, p) => acc + p.sold, 0);
      return {
        count: liveSalesData.length,
        totalValue: gross,
        label: 'POS Sales Volume',
        secondary: `${units} Units Sold`
      };
    } else if (reportType === 'attendance') {
      const gross = liveAttendanceData.reduce((acc, a) => acc + Number(a.entry_fee || 0), 0);
      const walkins = liveAttendanceData.filter(a => a.customer_type === 'Walk-In').length;
      return {
        count: liveAttendanceData.length,
        totalValue: gross,
        label: 'Pass Collections',
        secondary: `${walkins} Walk-In / ${liveAttendanceData.length - walkins} Members`
      };
    } else if (reportType === 'subscriptions') {
      const gross = liveSubsData.reduce((acc, s) => acc + Number(s.price || 0), 0);
      return {
        count: liveSubsData.length,
        totalValue: gross,
        label: 'Subscription Revenue',
        secondary: `${liveSubsData.length} Active Contracts`
      };
    } else {
      const gross = revenueTimeline.reduce((acc, r) => acc + r.totalRevenue, 0);
      return {
        count: revenueTimeline.length,
        totalValue: gross,
        label: 'Consolidated Revenue',
        secondary: `${revenueTimeline.reduce((acc, r) => acc + r.transactionsCount, 0)} Total Tx`
      };
    }
  }, [reportType, liveBirData, liveSalesData, liveAttendanceData, liveSubsData, revenueTimeline]);

  // ─── 1. EXPORT TO CSV (EXCEL COMPATIBLE WITH UTF-8 BOM) ───
  const handleExportCSV = () => {
    try {
      setIsExporting(true);
      let csvContent = '\uFEFF'; // UTF-8 BOM for Microsoft Excel
      const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

      csvContent += `WOLF PALOMAR FITNESS GYM - ${selectedCategoryMeta.title.toUpperCase()}\n`;
      csvContent += `Generated On: ${nowStr}\n`;
      csvContent += `Reporting Period: ${startDate} to ${endDate}\n`;
      csvContent += `Total Records: ${categoryStats.count} | Summary Value: PHP ${categoryStats.totalValue.toFixed(2)}\n`;
      csvContent += `Compliance Standard: ${selectedCategoryMeta.badge}\n\n`;

      if (reportType === 'bir') {
        csvContent += `"Date / Time","Receipt / Ref #","Customer Name","TIN","Transaction Type","Gross Sales (PHP)","VAT-Exempt Sales","Net Sales","Payment Method","Payment Ref","Status"\n`;
        liveBirData.forEach(item => {
          csvContent += `"${item.date}","${item.receipt_no}","${item.customer_name}","${item.tin_number || 'N/A'}","${item.transaction_type}","${item.gross_sales.toFixed(2)}","${item.vat_exempt_sales.toFixed(2)}","${item.net_sales.toFixed(2)}","${item.payment_method}","${item.payment_ref || ''}","${item.status}"\n`;
        });
      } else if (reportType === 'sales') {
        csvContent += `"Barcode ID","Product Name","Unit Selling Price (PHP)","Total Units Sold","Total Gross Revenue (PHP)","Current Stock","Status"\n`;
        liveSalesData.forEach(p => {
          const status = p.stock <= 0 ? 'OUT OF STOCK' : p.stock <= 5 ? 'LOW STOCK' : 'IN STOCK';
          csvContent += `"${p.barcode}","${p.name}","${p.price.toFixed(2)}","${p.sold}","${p.revenue.toFixed(2)}","${p.stock}","${status}"\n`;
        });
      } else if (reportType === 'attendance') {
        csvContent += `"Log / Slip #","Check-In Date","Customer / Member Name","Access Category","Entry Fee (PHP)","Payment Method","Payment Ref"\n`;
        liveAttendanceData.forEach((a: any) => {
          const slip = a.id ? `ATT-${String(a.id).slice(0, 6)}` : 'N/A';
          csvContent += `"${slip}","${a.check_in_time}","${a.customer_name || 'Guest'}","${a.customer_type || 'Walk-In'}","${Number(a.entry_fee || 0).toFixed(2)}","${a.payment_method || 'Cash'}","${a.payment_ref || ''}"\n`;
        });
      } else if (reportType === 'subscriptions') {
        csvContent += `"Contract ID","Member Name","Plan Name","Price (PHP)","Start Date","End Date","Payment Method","Status"\n`;
        liveSubsData.forEach((s: any) => {
          const cid = s.id ? `SUB-${String(s.id).slice(0, 6)}` : 'N/A';
          csvContent += `"${cid}","${s.members?.full_name || 'Member'}","${s.plan_name || 'Standard Plan'}","${Number(s.price || 0).toFixed(2)}","${s.start_date || s.created_at}","${s.end_date || 'Ongoing'}","${s.payment_method || 'Cash'}","${s.status || 'Active'}"\n`;
        });
      } else {
        csvContent += `"Date","POS Product Sales (PHP)","Logbook Passes (PHP)","Total Revenue (PHP)","Transaction Count"\n`;
        revenueTimeline.forEach(r => {
          csvContent += `"${r.date}","${r.salesRevenue.toFixed(2)}","${r.logbookRevenue.toFixed(2)}","${r.totalRevenue.toFixed(2)}","${r.transactionsCount}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = `PalomarGym_${selectedCategoryMeta.filePrefix}_${startDate}_to_${endDate}.csv`;
      saveAs(blob, filename);
      toast.success(`Exported ${filename} successfully!`);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── 2. EXPORT TO OFFICIAL PDF REPORT ───
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([595.28, 841.89]); // A4 Portrait
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let y = height - 40;

      // Header Banner
      page.drawRectangle({
        x: 30,
        y: y - 50,
        width: width - 60,
        height: 60,
        color: rgb(0.07, 0.23, 0.45),
      });

      page.drawText('WOLF PALOMAR FITNESS GYM', {
        x: 45,
        y: y - 20,
        size: 14,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(selectedCategoryMeta.title.toUpperCase(), {
        x: 45,
        y: y - 36,
        size: 9.5,
        font: fontBold,
        color: rgb(0.85, 0.9, 1),
      });

      page.drawText(`Compliance Standard: ${selectedCategoryMeta.badge}`, {
        x: 45,
        y: y - 48,
        size: 7.5,
        font,
        color: rgb(0.75, 0.85, 0.95),
      });

      y -= 75;

      // Meta KPIs box
      page.drawRectangle({
        x: 30,
        y: y - 35,
        width: width - 60,
        height: 40,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 1,
      });

      page.drawText(`Period: ${startDate} to ${endDate}`, { x: 42, y: y - 16, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(`Total Records: ${categoryStats.count}`, { x: 42, y: y - 28, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

      page.drawText(`Total Volume: PHP ${categoryStats.totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, {
        x: width - 230,
        y: y - 16,
        size: 9,
        font: fontBold,
        color: rgb(0.07, 0.23, 0.45),
      });
      page.drawText(`Audit Scope: ${categoryStats.secondary}`, { x: width - 230, y: y - 28, size: 8, font, color: rgb(0.3, 0.3, 0.3) });

      y -= 52;

      // Table Headers
      page.drawRectangle({
        x: 30,
        y: y - 4,
        width: width - 60,
        height: 18,
        color: rgb(0.07, 0.23, 0.45),
      });

      if (reportType === 'bir') {
        page.drawText('OR / REF #', { x: 35, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('DATE', { x: 130, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('CUSTOMER / DETAILS', { x: 210, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('PAYMENT', { x: 380, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('GROSS (PHP)', { x: 490, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });

        y -= 16;
        liveBirData.slice(0, 32).forEach((row, idx) => {
          if (y < 45) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - 45;
          }
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 30, y: y - 4, width: width - 60, height: 15, color: rgb(0.97, 0.98, 0.99) });
          }
          page.drawText(String(row.receipt_no).slice(0, 16), { x: 35, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.date).slice(0, 10), { x: 130, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.customer_name).slice(0, 24), { x: 210, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.payment_method), { x: 380, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(row.gross_sales.toFixed(2), { x: 490, y, size: 7, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          y -= 16;
        });
      } else if (reportType === 'sales') {
        page.drawText('BARCODE', { x: 35, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('PRODUCT NAME', { x: 120, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('PRICE', { x: 300, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('SOLD', { x: 370, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('STOCK', { x: 430, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('GROSS (PHP)', { x: 490, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });

        y -= 16;
        liveSalesData.slice(0, 32).forEach((row, idx) => {
          if (y < 45) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - 45;
          }
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 30, y: y - 4, width: width - 60, height: 15, color: rgb(0.97, 0.98, 0.99) });
          }
          page.drawText(String(row.barcode).slice(0, 14), { x: 35, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.name).slice(0, 26), { x: 120, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(row.price.toFixed(2), { x: 300, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.sold), { x: 370, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.stock), { x: 430, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(row.revenue.toFixed(2), { x: 490, y, size: 7, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          y -= 16;
        });
      } else {
        page.drawText('IDENTIFIER', { x: 35, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('DATE / PERIOD', { x: 130, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('DESCRIPTION / PLAN', { x: 230, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('PAYMENT', { x: 390, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        page.drawText('AMOUNT (PHP)', { x: 490, y, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });

        y -= 16;
        const genericRows = reportType === 'attendance' ? liveAttendanceData : liveSubsData;
        genericRows.slice(0, 32).forEach((row: any, idx: number) => {
          if (y < 45) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - 45;
          }
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 30, y: y - 4, width: width - 60, height: 15, color: rgb(0.97, 0.98, 0.99) });
          }
          const idVal = row.id ? String(row.id).slice(0, 12) : `REC-${idx + 1}`;
          const dateVal = String(row.check_in_time || row.created_at || startDate).slice(0, 10);
          const descVal = String(row.customer_name || row.members?.full_name || row.plan_name || 'Standard Record').slice(0, 24);
          const payVal = String(row.payment_method || 'Cash');
          const amtVal = Number(row.entry_fee || row.price || 0);

          page.drawText(idVal, { x: 35, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(dateVal, { x: 130, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(descVal, { x: 230, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(payVal, { x: 390, y, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(amtVal.toFixed(2), { x: 490, y, size: 7, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          y -= 16;
        });
      }

      // Footer
      page.drawText('Palomar Gym System 2.0 • Official Compliance & Audit Export', {
        x: 150,
        y: 25,
        size: 7.5,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const filename = `PalomarGym_${selectedCategoryMeta.filePrefix}_${startDate}.pdf`;
      saveAs(blob, filename);
      toast.success(`Generated ${filename} successfully!`);
    } catch (err: any) {
      toast.error(`PDF generation failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Reports & Compliance Export Hub"
      className="max-w-4xl w-full text-left p-6 max-h-[90vh] overflow-y-auto"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer z-50 animate-fade-in"
      >
        <X className="w-4.5 h-4.5" />
      </button>

      <div className="space-y-6 pt-1">
        {/* ─── 1. REPORT CATEGORY SELECTOR CARDS ─── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-heading font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Select Report Category
            </label>
            <span className="text-[10px] text-slate-500 font-mono">5 Formats Available</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 select-none">
            {REPORT_CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isSelected = reportType === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setReportType(cat.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5 cursor-pointer relative ${
                    isSelected
                      ? 'border-[#123c73] dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 text-[#123c73] dark:text-blue-200 shadow-xs ring-1 ring-[#123c73] dark:ring-blue-500'
                      : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-[#123c73] dark:text-blue-400' : 'text-slate-400'}`} />
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold font-heading block leading-snug">{cat.shortLabel}</span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 block truncate mt-0.5 font-medium">
                      {cat.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── 2. SHOWCASE & CATEGORY DETAILS SHOWCASE CARD ─── */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60 p-4 space-y-4 animate-fade-in">
          {/* Category Details Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-xs shrink-0">
                <selectedCategoryMeta.icon className="w-5 h-5 text-[#123c73] dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                    {selectedCategoryMeta.title}
                  </h3>
                  <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-bold border border-emerald-500/20">
                    {selectedCategoryMeta.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {selectedCategoryMeta.description}
                </p>
              </div>
            </div>

            {/* View Switcher */}
            <div className="flex items-center bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setPreviewTab('showcase')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  previewTab === 'showcase'
                    ? 'bg-[#123c73] dark:bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Data Showcase</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('details')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  previewTab === 'details'
                    ? 'bg-[#123c73] dark:bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>File Specs</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Live Data Showcase / Table Preview */}
          {previewTab === 'showcase' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider">
                    Live Record Sample ({categoryStats.count} Matches)
                  </span>
                  {isLoadingLive && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Target File: <strong className="text-slate-700 dark:text-slate-300 font-mono">{selectedCategoryMeta.filePrefix}.csv</strong>
                </span>
              </div>

              {/* Showcase Mini Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xs max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 font-heading font-bold border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-10">
                      {selectedCategoryMeta.columns.map((col, idx) => (
                        <th key={idx} className="p-2.5 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-900 text-slate-700 dark:text-slate-300 font-body">
                    {reportType === 'bir' && liveBirData.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-[#123c73] dark:text-blue-400">{row.receipt_no}</td>
                        <td className="p-2.5 whitespace-nowrap text-slate-500">{String(row.date).slice(0, 16)}</td>
                        <td className="p-2.5 font-medium">{row.customer_name}</td>
                        <td className="p-2.5 font-mono text-slate-400">{row.tin_number || 'N/A'}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px]">{row.transaction_type}</span></td>
                        <td className="p-2.5 font-bold">₱{row.gross_sales.toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500">₱{row.vat_exempt_sales.toFixed(2)}</td>
                        <td className="p-2.5 font-bold">₱{row.net_sales.toFixed(2)}</td>
                        <td className="p-2.5">{row.payment_method}</td>
                        <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-bold">{row.status}</td>
                      </tr>
                    ))}

                    {reportType === 'sales' && liveSalesData.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{row.barcode}</td>
                        <td className="p-2.5 font-bold">{row.name}</td>
                        <td className="p-2.5 font-mono">₱{row.price.toFixed(2)}</td>
                        <td className="p-2.5 font-extrabold text-emerald-600 dark:text-emerald-400">{row.sold} units</td>
                        <td className="p-2.5 font-bold">₱{row.revenue.toFixed(2)}</td>
                        <td className="p-2.5 font-mono">{row.stock} in stock</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.stock <= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                            {row.stock <= 0 ? 'OUT OF STOCK' : 'ACTIVE'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {reportType === 'attendance' && liveAttendanceData.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-[#123c73] dark:text-blue-400">ATT-{String(row.id).slice(0, 6)}</td>
                        <td className="p-2.5 text-slate-500 whitespace-nowrap">{String(row.check_in_time).slice(0, 16)}</td>
                        <td className="p-2.5 font-bold">{row.customer_name || 'Guest'}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-bold">{row.customer_type || 'Walk-In'}</span></td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">₱{Number(row.entry_fee || 0).toFixed(2)}</td>
                        <td className="p-2.5">{row.payment_method || 'Cash'}</td>
                        <td className="p-2.5 font-mono text-slate-400">{row.payment_ref || 'N/A'}</td>
                      </tr>
                    ))}

                    {reportType === 'subscriptions' && liveSubsData.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-purple-600 dark:text-purple-400">SUB-{String(row.id).slice(0, 6)}</td>
                        <td className="p-2.5 font-bold">{row.members?.full_name || 'Member'}</td>
                        <td className="p-2.5 font-medium">{row.plan_name || 'Membership Plan'}</td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">₱{Number(row.price || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500">{String(row.start_date || row.created_at).slice(0, 10)}</td>
                        <td className="p-2.5 text-slate-500">{String(row.end_date || 'Ongoing').slice(0, 10)}</td>
                        <td className="p-2.5">{row.payment_method || 'Cash'}</td>
                        <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-bold">{row.status || 'Active'}</td>
                      </tr>
                    ))}

                    {reportType === 'combined' && revenueTimeline.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-bold">{row.date}</td>
                        <td className="p-2.5 font-mono">₱{row.salesRevenue.toFixed(2)}</td>
                        <td className="p-2.5 font-mono">₱{row.logbookRevenue.toFixed(2)}</td>
                        <td className="p-2.5 font-mono">₱0.00</td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">₱{row.totalRevenue.toFixed(2)}</td>
                        <td className="p-2.5">{row.transactionsCount} entries</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Tab 2: Compliance & Metadata Specs */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2 p-3 bg-white dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800">
                <h4 className="font-heading font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                  Legal & Bookkeeping Purpose
                </h4>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedCategoryMeta.legalPurpose}
                </p>
                <div className="pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Standard Exports:</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono text-[10px] font-bold">.CSV (UTF-8 Excel)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono text-[10px] font-bold">.PDF (A4 Vector)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-3 bg-white dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800">
                <h4 className="font-heading font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  Exported Column Schema
                </h4>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedCategoryMeta.columns.map((col, idx) => (
                    <span key={idx} className="px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 text-[10px] font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── 3. DATE FILTERS & PRESETS ─── */}
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-heading font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Date Filter Presets:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 select-none">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'year', label: 'This Year' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleQuickPreset(preset.id as any)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white font-semibold outline-none focus:ring-1 focus:ring-[#123c73]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white font-semibold outline-none focus:ring-1 focus:ring-[#123c73]"
              />
            </div>
          </div>
        </div>

        {/* ─── 4. SUMMARY METRIC ACCUMULATOR ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Matching Records</span>
            <div className="text-lg font-heading font-black text-slate-900 dark:text-white mt-0.5">
              {categoryStats.count} items
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
              {categoryStats.label}
            </span>
            <div className="text-lg font-heading font-black text-[#123c73] dark:text-blue-300 mt-0.5">
              {formatPHP(categoryStats.totalValue)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Audit Scope</span>
            <div className="text-xs font-heading font-bold text-emerald-800 dark:text-emerald-300 mt-1 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{categoryStats.secondary}</span>
            </div>
          </div>
        </div>

        {/* ─── 5. ACTION BUTTONS ─── */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-zinc-800">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-full sm:w-auto text-xs py-3 px-4 cursor-pointer"
          >
            Close
          </Button>

          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full sm:w-auto text-xs py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs select-none disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            <span>Export CSV (Excel Format)</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="w-full sm:w-auto text-xs py-3 px-4 rounded-xl bg-[#123c73] hover:bg-[#0d2e5a] text-white font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs select-none disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>Download Official PDF</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
