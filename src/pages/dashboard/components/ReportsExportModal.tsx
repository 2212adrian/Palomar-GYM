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
import { logAudit } from '../../../lib/supabase/audit';
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

export const ReportsExportModal: React.FC<ReportsExportModalProps> = ({
  isOpen,
  onClose,
  initialType = 'bir',
  birData: _birData = [],
  topProducts: _topProducts = [],
  revenueTimeline: _revenueTimeline = []
}) => {
  const normalizedInitial = (initialType === 'inventory' ? 'sales' : initialType) as ReportCategoryType;
  const [reportType, setReportType] = useState<ReportCategoryType>(normalizedInitial);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [previewTab, setPreviewTab] = useState<'showcase' | 'details'>('showcase');

  // VAT configuration from system rates
  const [vatPercentage, setVatPercentage] = useState<number>(12);

  // Live category datasets loaded from Supabase
  const [liveBirData, setLiveBirData] = useState<any[]>([]);
  const [liveSalesData, setLiveSalesData] = useState<any[]>([]);
  const [liveAttendanceData, setLiveAttendanceData] = useState<any[]>([]);
  const [liveSubsData, setLiveSubsData] = useState<any[]>([]);
  const [liveCombinedData, setLiveCombinedData] = useState<any[]>([]);

  // Fetch VAT percentage from rates_config on load
  useEffect(() => {
    const fetchVatConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('rates_config')
          .select('vat_percentage, vat_enabled')
          .limit(1)
          .maybeSingle();

        if (!error && data && data.vat_percentage !== null && data.vat_percentage !== undefined) {
          setVatPercentage(Number(data.vat_percentage));
        }
      } catch (err) {
        console.warn('Could not load rates_config VAT percentage:', err);
      }
    };
    fetchVatConfig();
  }, []);

  // Sync initialType whenever the modal opens or selected type changes
  useEffect(() => {
    if (isOpen && initialType) {
      const norm = (initialType === 'inventory' ? 'sales' : initialType) as ReportCategoryType;
      setReportType(norm);
    }
  }, [isOpen, initialType]);

  const reportCategories: ReportCategoryMeta[] = useMemo(() => [
    {
      id: 'bir',
      title: 'BIR Official Sales & Tax Register',
      shortLabel: 'BIR Sales & Tax',
      badge: 'BIR Form 2551Q / Non-VAT',
      description: `Compliant Philippine Bureau of Internal Revenue sales book and official receipt ledger with breakdown of gross revenue, VAT-exempt transactions, ${vatPercentage}% VAT computation, and net sales.`,
      legalPurpose: 'Mandatory bookkeeping ledger for BIR quarterly percentage tax filing, audit inspection, and official receipt verification.',
      columns: ['OR / Ref #', 'Date & Time', 'Customer Name', 'Transaction Type', 'Gross Sales (₱)', 'VAT-Exempt (₱)', `VAT (${vatPercentage}%) (₱)`, 'Net Sales (₱)', 'Payment Method', 'Status'],
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
      columns: ['Barcode ID', 'Product Name', 'Unit Price (₱)', 'Units Sold', 'Gross Sales (₱)', 'Stock Remaining'],
      filePrefix: 'Product_Sales_Inventory',
      icon: FileSpreadsheet
    },
    {
      id: 'attendance',
      title: 'Gym Attendance & Facility Pass Log',
      shortLabel: 'Attendance Passes',
      badge: 'Logbook & Foot Traffic',
      description: 'Comprehensive check-in logbook aggregating member and walk-in visits into a unified customer pass summary with visit counts and total fees.',
      legalPurpose: 'Facility utilization verification, front-desk collection reconciliation, and physical safety occupancy tracking.',
      columns: ['Customer Name', 'Access Category', 'Total Visits (Qty)', 'Total Fees Paid (₱)', 'Latest Check-In', 'Payment Method'],
      filePrefix: 'Gym_Attendance_Log',
      icon: Calendar
    },
    {
      id: 'subscriptions',
      title: 'Membership Subscriptions & Contracts',
      shortLabel: 'Memberships',
      badge: 'Contract & Membership',
      description: 'Gym membership contracts, subscription intakes, recurring renewal revenue, plan packages, and active client terms.',
      legalPurpose: 'Membership recurring revenue reporting, contract expiration audit, and customer account validation.',
      columns: ['Contract ID', 'Member Name', 'Plan Name', 'Contract Price (₱)', 'Start Date', 'End Date', 'Payment Method'],
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
      columns: ['Date', 'Sales (₱)', 'Logbook (₱)', 'Subscription (₱)', 'Total Revenue (₱)', 'Transaction Count'],
      filePrefix: 'Consolidated_Financial_Summary',
      icon: TrendingUp
    }
  ], [vatPercentage]);

  const selectedCategoryMeta = useMemo(() => {
    return reportCategories.find(c => c.id === reportType) || reportCategories[0];
  }, [reportType, reportCategories]);

  const loadCategoryData = useCallback(async () => {
    if (!isOpen) return;
    try {
      setIsLoadingLive(true);
      const startIso = `${startDate}T00:00:00`;
      const endIso = `${endDate}T23:59:59.999`;

      // ─── 1. BIR TAX REGISTER ───
      if (reportType === 'bir') {
        const [salesRes, attRes, subsRes] = await Promise.all([
          supabase.from('sales').select('*').is('deleted_at', null).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('attendance').select('*').is('deleted_at', null).gte('check_in_time', startIso).lte('check_in_time', endIso),
          supabase.from('subscriptions').select('*, members(full_name, phone)').is('voided_at', null).gte('created_at', startIso).lte('created_at', endIso)
        ]);

        const items: any[] = [];
        const vatRate = vatPercentage > 0 ? vatPercentage / 100 : 0.12;

        (salesRes.data || []).forEach((s: any) => {
          const gross = Number(s.total_amount || 0);
          const vatAmt = gross > 0 ? (gross * vatRate) / (1 + vatRate) : 0;
          const net = gross - vatAmt;
          items.push({
            receipt_no: s.receipt_no || `SLS-${String(s.id).slice(0, 6)}`,
            date: s.created_at,
            customer_name: s.product_name || 'POS Customer',
            transaction_type: 'Product Sale',
            gross_sales: gross,
            vat_exempt_sales: gross,
            vat_amount: vatAmt,
            net_sales: net,
            payment_method: s.payment_method || 'Cash',
            payment_ref: s.reference_number || s.payment_ref || undefined,
            status: 'Valid'
          });
        });

        (attRes.data || []).filter((a: any) => Number(a.entry_fee || 0) > 0).forEach((a: any) => {
          const gross = Number(a.entry_fee || 0);
          const vatAmt = gross > 0 ? (gross * vatRate) / (1 + vatRate) : 0;
          const net = gross - vatAmt;
          items.push({
            receipt_no: a.receipt_number || `LOG-${String(a.id).slice(0, 6)}`,
            date: a.check_in_time,
            customer_name: a.customer_name || 'Walk-In Guest',
            transaction_type: 'Walk-In Entry',
            gross_sales: gross,
            vat_exempt_sales: gross,
            vat_amount: vatAmt,
            net_sales: net,
            payment_method: a.payment_method || 'Cash',
            payment_ref: a.gcash_ref_no || a.payment_ref || undefined,
            status: 'Valid'
          });
        });

        (subsRes.data || []).forEach((sub: any) => {
          const gross = Number(sub.price || 0);
          const vatAmt = gross > 0 ? (gross * vatRate) / (1 + vatRate) : 0;
          const net = gross - vatAmt;
          items.push({
            receipt_no: sub.receipt_number || `SUB-${String(sub.id).slice(0, 6)}`,
            date: sub.created_at,
            customer_name: sub.members?.full_name || 'Member',
            transaction_type: 'Gym Subscription',
            gross_sales: gross,
            vat_exempt_sales: gross,
            vat_amount: vatAmt,
            net_sales: net,
            payment_method: sub.payment_method || 'Cash',
            payment_ref: undefined,
            status: 'Valid'
          });
        });

        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLiveBirData(items);

      // ─── 2. POS & INVENTORY SALES REGISTER ───
      } else if (reportType === 'sales') {
        const [salesRes, prodRes] = await Promise.all([
          supabase.from('sales').select('*').is('deleted_at', null).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('products').select('*').is('deleted_at', null)
        ]);

        const allSales = salesRes.data || [];
        const allProds = prodRes.data || [];

        const prodMap: Record<string, { barcode: string; name: string; price: number; stock: number; sold: number; revenue: number }> = {};
        
        // Populate all existing products
        allProds.forEach(p => {
          prodMap[p.id] = {
            barcode: p.barcode_id || p.manufacturer_barcode || `BC-${String(p.id).slice(0, 6)}`,
            name: p.product_name,
            price: Number(p.selling_price || 0),
            stock: Number(p.stock_quantity ?? p.stock ?? 0),
            sold: 0,
            revenue: 0
          };
        });

        // Parse all sales in the date range
        allSales.forEach(s => {
          const itemsParsed: { id?: string; name: string; barcode?: string; qty: number; unitPrice: number; subtotal: number }[] = [];

          if (s.items) {
            let rawItems = s.items;
            if (typeof rawItems === 'string') {
              try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; }
            }
            if (Array.isArray(rawItems) && rawItems.length > 0) {
              rawItems.forEach((i: any) => {
                const pid = i.productId || i.product_id || i.id;
                const pname = (i.productName || i.product_name || i.name || i.title || '').trim();
                const qty = Number(i.quantity || i.qty || 1) || 1;
                const price = Number(i.price || i.selling_price || i.unit_price || 0);
                const sub = Number(i.subtotal || (price * qty) || 0);
                itemsParsed.push({ id: pid, name: pname, barcode: i.barcode_id || i.barcode, qty, unitPrice: price, subtotal: sub });
              });
            }
          }

          if (itemsParsed.length === 0 && s.product_name) {
            const rawStr = String(s.product_name).trim();
            const parts = rawStr.split(',').map(p => p.trim()).filter(Boolean);
            const totalAmount = Number(s.total_amount || 0);
            const fallbackQty = Number(s.quantity || 1) || 1;

            parts.forEach(part => {
              const match = part.match(/^(.*?)\s*\(([0-9]+)x\)$/i);
              if (match) {
                const name = match[1].trim();
                const qty = parseInt(match[2], 10) || 1;
                itemsParsed.push({ name, qty, unitPrice: 0, subtotal: 0 });
              } else {
                itemsParsed.push({ name: part, qty: fallbackQty, unitPrice: 0, subtotal: totalAmount });
              }
            });

            if (itemsParsed.length > 0 && totalAmount > 0) {
              const totalUnits = itemsParsed.reduce((sum, it) => sum + it.qty, 0) || 1;
              itemsParsed.forEach(it => {
                if (it.subtotal === 0) {
                  it.subtotal = (totalAmount / totalUnits) * it.qty;
                  it.unitPrice = it.subtotal / it.qty;
                }
              });
            }
          }

          // Aggregate into prodMap
          itemsParsed.forEach(item => {
            let target: { barcode: string; name: string; price: number; stock: number; sold: number; revenue: number } | undefined = undefined;

            if (item.id && prodMap[item.id]) {
              target = prodMap[item.id];
            } else if (item.name) {
              const cleanItemName = item.name.toLowerCase().trim();
              const foundKey = Object.keys(prodMap).find(k => {
                const pName = prodMap[k].name.toLowerCase().trim();
                return pName === cleanItemName || cleanItemName.includes(pName) || pName.includes(cleanItemName);
              });
              if (foundKey) {
                target = prodMap[foundKey];
              }
            }

            if (target) {
              target.sold += item.qty;
              target.revenue += item.subtotal > 0 ? item.subtotal : (target.price * item.qty);
            } else if (item.name) {
              const fallbackKey = `c-${item.name.toLowerCase().trim()}`;
              if (!prodMap[fallbackKey]) {
                prodMap[fallbackKey] = {
                  barcode: item.barcode || 'PR-0000',
                  name: item.name,
                  price: item.unitPrice || (item.qty > 0 ? item.subtotal / item.qty : 0),
                  stock: 0,
                  sold: 0,
                  revenue: 0
                };
              }
              prodMap[fallbackKey].sold += item.qty;
              prodMap[fallbackKey].revenue += item.subtotal > 0 ? item.subtotal : (prodMap[fallbackKey].price * item.qty);
            }
          });
        });

        const list = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue || b.sold - a.sold);
        setLiveSalesData(list);

      // ─── 3. ATTENDANCE PASSES (AGGREGATED BY CUSTOMER NAME) ───
      } else if (reportType === 'attendance') {
        const { data } = await supabase
          .from('attendance')
          .select('*')
          .is('deleted_at', null)
          .gte('check_in_time', startIso)
          .lte('check_in_time', endIso)
          .order('check_in_time', { ascending: false });

        const rawList = data || [];
        const aggregatedMap = new Map<string, {
          customer_name: string;
          customer_type: string;
          visits_count: number;
          total_fees: number;
          latest_checkin: string;
          payment_method: string;
        }>();

        rawList.forEach((a: any) => {
          const rawName = (a.customer_name || 'Walk-In Guest').trim();
          const key = rawName.toLowerCase();

          if (!aggregatedMap.has(key)) {
            aggregatedMap.set(key, {
              customer_name: rawName,
              customer_type: a.customer_type || 'Walk-In',
              visits_count: 0,
              total_fees: 0,
              latest_checkin: a.check_in_time,
              payment_method: a.payment_method || 'Cash'
            });
          }

          const entry = aggregatedMap.get(key)!;
          entry.visits_count += 1;
          entry.total_fees += Number(a.entry_fee || 0);

          if (new Date(a.check_in_time).getTime() > new Date(entry.latest_checkin).getTime()) {
            entry.latest_checkin = a.check_in_time;
            entry.payment_method = a.payment_method || entry.payment_method;
          }
          if (a.customer_type === 'Existing Member' || a.customer_type === 'Member' || a.customer_type === 'New Membership') {
            entry.customer_type = 'Member';
          }
        });

        const aggregatedList = Array.from(aggregatedMap.values()).sort((a, b) => b.visits_count - a.visits_count || b.total_fees - a.total_fees);
        setLiveAttendanceData(aggregatedList);

      // ─── 4. MEMBERSHIP SUBSCRIPTIONS ───
      } else if (reportType === 'subscriptions') {
        const { data } = await supabase
          .from('subscriptions')
          .select('*, members(full_name, phone)')
          .is('voided_at', null)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        setLiveSubsData(data || []);

      // ─── 5. CONSOLIDATED OPERATIONS & FINANCIAL SUMMARY ───
      } else if (reportType === 'combined') {
        const [salesRes, attRes, subsRes] = await Promise.all([
          supabase.from('sales').select('created_at, total_amount').is('deleted_at', null).gte('created_at', startIso).lte('created_at', endIso),
          supabase.from('attendance').select('check_in_time, entry_fee').is('deleted_at', null).gte('check_in_time', startIso).lte('check_in_time', endIso),
          supabase.from('subscriptions').select('created_at, price').is('voided_at', null).gte('created_at', startIso).lte('created_at', endIso)
        ]);

        const salesList = salesRes.data || [];
        const attList = attRes.data || [];
        const subsList = subsRes.data || [];

        const dayMap = new Map<string, {
          date: string;
          sales: number;
          logbook: number;
          subscription: number;
          totalRevenue: number;
          transactionCount: number;
        }>();

        salesList.forEach((s: any) => {
          const dKey = format(new Date(s.created_at), 'yyyy-MM-dd');
          if (!dayMap.has(dKey)) {
            dayMap.set(dKey, { date: dKey, sales: 0, logbook: 0, subscription: 0, totalRevenue: 0, transactionCount: 0 });
          }
          const row = dayMap.get(dKey)!;
          const amt = Number(s.total_amount || 0);
          row.sales += amt;
          row.totalRevenue += amt;
          row.transactionCount += 1;
        });

        attList.forEach((a: any) => {
          const dKey = format(new Date(a.check_in_time), 'yyyy-MM-dd');
          if (!dayMap.has(dKey)) {
            dayMap.set(dKey, { date: dKey, sales: 0, logbook: 0, subscription: 0, totalRevenue: 0, transactionCount: 0 });
          }
          const row = dayMap.get(dKey)!;
          const amt = Number(a.entry_fee || 0);
          row.logbook += amt;
          row.totalRevenue += amt;
          row.transactionCount += 1;
        });

        subsList.forEach((sub: any) => {
          const dKey = format(new Date(sub.created_at), 'yyyy-MM-dd');
          if (!dayMap.has(dKey)) {
            dayMap.set(dKey, { date: dKey, sales: 0, logbook: 0, subscription: 0, totalRevenue: 0, transactionCount: 0 });
          }
          const row = dayMap.get(dKey)!;
          const amt = Number(sub.price || 0);
          row.subscription += amt;
          row.totalRevenue += amt;
          row.transactionCount += 1;
        });

        const combinedList = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
        setLiveCombinedData(combinedList);
      }
    } catch (err) {
      console.warn('Error loading live export dataset:', err);
    } finally {
      setIsLoadingLive(false);
    }
  }, [isOpen, reportType, startDate, endDate, vatPercentage]);

  useEffect(() => {
    loadCategoryData();
  }, [loadCategoryData]);

  // Quick Preset Filters
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
      const gross = liveAttendanceData.reduce((acc, a) => acc + Number(a.total_fees || 0), 0);
      const totalVisits = liveAttendanceData.reduce((acc, a) => acc + Number(a.visits_count || 1), 0);
      return {
        count: liveAttendanceData.length,
        totalValue: gross,
        label: 'Pass Collections',
        secondary: `${totalVisits} Total Check-Ins (${liveAttendanceData.length} Unique Guests)`
      };
    } else if (reportType === 'subscriptions') {
      const gross = liveSubsData.reduce((acc, s) => acc + Number(s.price || 0), 0);
      return {
        count: liveSubsData.length,
        totalValue: gross,
        label: 'Subscription Revenue',
        secondary: `${liveSubsData.length} Membership Contracts`
      };
    } else {
      const gross = liveCombinedData.reduce((acc, r) => acc + r.totalRevenue, 0);
      const totalTx = liveCombinedData.reduce((acc, r) => acc + r.transactionCount, 0);
      return {
        count: liveCombinedData.length,
        totalValue: gross,
        label: 'Consolidated Revenue',
        secondary: `${totalTx} Total Transactions Across Streams`
      };
    }
  }, [reportType, liveBirData, liveSalesData, liveAttendanceData, liveSubsData, liveCombinedData]);

  // ─── 1. EXPORT TO CSV (EXCEL COMPATIBLE) ───
  const handleExportCSV = async () => {
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
        csvContent += `"Receipt / Ref #","Date / Time","Customer Name","Transaction Type","Gross Sales (PHP)","VAT-Exempt Sales (PHP)","VAT (${vatPercentage}%) (PHP)","Net Sales (PHP)","Payment Method","Status"\n`;
        liveBirData.forEach(item => {
          csvContent += `"${item.receipt_no}","${item.date}","${item.customer_name}","${item.transaction_type}","${item.gross_sales.toFixed(2)}","${item.vat_exempt_sales.toFixed(2)}","${item.vat_amount.toFixed(2)}","${item.net_sales.toFixed(2)}","${item.payment_method}","${item.status}"\n`;
        });
      } else if (reportType === 'sales') {
        csvContent += `"Barcode ID","Product Name","Unit Selling Price (PHP)","Units Sold","Gross Sales (PHP)","Current Stock"\n`;
        liveSalesData.forEach(p => {
          csvContent += `"${p.barcode}","${p.name}","${p.price.toFixed(2)}","${p.sold}","${p.revenue.toFixed(2)}","${p.stock}"\n`;
        });
      } else if (reportType === 'attendance') {
        csvContent += `"Customer Name","Access Category","Total Visits (Qty)","Total Fees Paid (PHP)","Latest Check-In","Payment Method"\n`;
        liveAttendanceData.forEach((a: any) => {
          csvContent += `"${a.customer_name}","${a.customer_type}","${a.visits_count}","${Number(a.total_fees || 0).toFixed(2)}","${a.latest_checkin}","${a.payment_method}"\n`;
        });
      } else if (reportType === 'subscriptions') {
        csvContent += `"Contract ID","Member Name","Plan Name","Contract Price (PHP)","Start Date","End Date","Payment Method"\n`;
        liveSubsData.forEach((s: any) => {
          const cid = s.receipt_number || (s.id ? `SUB-${String(s.id).slice(0, 6)}` : 'N/A');
          csvContent += `"${cid}","${s.members?.full_name || 'Member'}","${s.plan_type ? s.plan_type.toUpperCase() : 'Standard Plan'}","${Number(s.price || 0).toFixed(2)}","${s.start_date || s.created_at}","${s.end_date || 'Ongoing'}","${s.payment_method || 'Cash'}"\n`;
        });
      } else {
        csvContent += `"Date","Sales (PHP)","Logbook (PHP)","Subscription (PHP)","Total Revenue (PHP)","Transaction Count"\n`;
        liveCombinedData.forEach(r => {
          csvContent += `"${r.date}","${r.sales.toFixed(2)}","${r.logbook.toFixed(2)}","${r.subscription.toFixed(2)}","${r.totalRevenue.toFixed(2)}","${r.transactionCount}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = `PalomarGym_${selectedCategoryMeta.filePrefix}_${startDate}_to_${endDate}.csv`;
      saveAs(blob, filename);
      toast.success(`Exported ${filename} successfully!`);
      
      await logAudit(
        'REPORT_GENERATED',
        `Exported ${selectedCategoryMeta.title} (CSV) from ${startDate} to ${endDate} (${categoryStats.count} records, Total: ₱${categoryStats.totalValue.toFixed(2)}).`
      );
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
      let page = pdfDoc.addPage([841.89, 595.28]); // Landscape A4
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let y = height - 35;

      // Header Banner
      page.drawRectangle({
        x: 25,
        y: y - 45,
        width: width - 50,
        height: 50,
        color: rgb(0.07, 0.23, 0.45),
      });

      page.drawText('WOLF PALOMAR FITNESS GYM', {
        x: 40,
        y: y - 18,
        size: 13,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(selectedCategoryMeta.title.toUpperCase(), {
        x: 40,
        y: y - 32,
        size: 9,
        font: fontBold,
        color: rgb(0.85, 0.9, 1),
      });

      page.drawText(`Compliance Standard: ${selectedCategoryMeta.badge} • Date Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, {
        x: 40,
        y: y - 42,
        size: 7,
        font,
        color: rgb(0.75, 0.85, 0.95),
      });

      y -= 60;

      // KPI Metric Ribbon
      page.drawRectangle({
        x: 25,
        y: y - 28,
        width: width - 50,
        height: 30,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 1,
      });

      page.drawText(`Reporting Period: ${startDate} to ${endDate}`, { x: 35, y: y - 13, size: 8, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(`Total Records: ${categoryStats.count}`, { x: 35, y: y - 23, size: 7.5, font, color: rgb(0.3, 0.3, 0.3) });

      page.drawText(`Total Value: PHP ${categoryStats.totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, {
        x: width - 260,
        y: y - 13,
        size: 8.5,
        font: fontBold,
        color: rgb(0.07, 0.23, 0.45),
      });
      page.drawText(`Scope: ${categoryStats.secondary}`, { x: width - 260, y: y - 23, size: 7.5, font, color: rgb(0.3, 0.3, 0.3) });

      y -= 40;

      const drawTableHeaders = (headers: { label: string; x: number }[]) => {
        page.drawRectangle({
          x: 25,
          y: y - 4,
          width: width - 50,
          height: 16,
          color: rgb(0.07, 0.23, 0.45),
        });
        headers.forEach(h => {
          page.drawText(h.label, { x: h.x, y, size: 7, font: fontBold, color: rgb(1, 1, 1) });
        });
        y -= 15;
      };

      const checkPageBreak = () => {
        if (y < 35) {
          page = pdfDoc.addPage([841.89, 595.28]);
          y = height - 35;
          return true;
        }
        return false;
      };

      // BIR PDF
      if (reportType === 'bir') {
        const headers = [
          { label: 'OR / REF #', x: 30 },
          { label: 'DATE & TIME', x: 130 },
          { label: 'CUSTOMER NAME', x: 235 },
          { label: 'TYPE', x: 375 },
          { label: 'GROSS (PHP)', x: 460 },
          { label: 'VAT-EXEMPT', x: 540 },
          { label: `VAT (${vatPercentage}%)`, x: 615 },
          { label: 'NET SALES', x: 685 },
          { label: 'PAYMENT', x: 745 },
          { label: 'STATUS', x: 790 },
        ];
        drawTableHeaders(headers);

        liveBirData.forEach((row, idx) => {
          if (checkPageBreak()) drawTableHeaders(headers);
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 25, y: y - 3, width: width - 50, height: 13, color: rgb(0.97, 0.98, 0.99) });
          }
          page.drawText(String(row.receipt_no).slice(0, 15), { x: 30, y, size: 6.5, font, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(String(row.date).slice(0, 16), { x: 130, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.customer_name).slice(0, 22), { x: 235, y, size: 6.5, font, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.transaction_type).slice(0, 14), { x: 375, y, size: 6.5, font, color: rgb(0.2, 0.2, 0.2) });
          page.drawText(row.gross_sales.toFixed(2), { x: 460, y, size: 6.5, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(row.vat_exempt_sales.toFixed(2), { x: 540, y, size: 6.5, font, color: rgb(0.4, 0.4, 0.4) });
          page.drawText(row.vat_amount.toFixed(2), { x: 615, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(row.net_sales.toFixed(2), { x: 685, y, size: 6.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.payment_method), { x: 745, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.status), { x: 790, y, size: 6.5, font: fontBold, color: rgb(0.06, 0.6, 0.35) });
          y -= 13;
        });

      // POS SALES PDF
      } else if (reportType === 'sales') {
        const headers = [
          { label: 'BARCODE ID', x: 30 },
          { label: 'PRODUCT NAME', x: 150 },
          { label: 'UNIT PRICE (PHP)', x: 400 },
          { label: 'UNITS SOLD', x: 520 },
          { label: 'GROSS SALES (PHP)', x: 630 },
          { label: 'STOCK REMAINING', x: 740 },
        ];
        drawTableHeaders(headers);

        liveSalesData.forEach((row, idx) => {
          if (checkPageBreak()) drawTableHeaders(headers);
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 25, y: y - 3, width: width - 50, height: 13, color: rgb(0.97, 0.98, 0.99) });
          }
          page.drawText(String(row.barcode).slice(0, 18), { x: 30, y, size: 6.5, font, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(String(row.name).slice(0, 42), { x: 150, y, size: 6.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(row.price.toFixed(2), { x: 400, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(`${row.sold} units`, { x: 520, y, size: 6.5, font: fontBold, color: rgb(0.06, 0.6, 0.35) });
          page.drawText(row.revenue.toFixed(2), { x: 630, y, size: 6.5, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(`${row.stock} in stock`, { x: 740, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          y -= 13;
        });

      // ATTENDANCE PASSES PDF
      } else if (reportType === 'attendance') {
        const headers = [
          { label: 'CUSTOMER / MEMBER NAME', x: 30 },
          { label: 'ACCESS CATEGORY', x: 250 },
          { label: 'TOTAL VISITS (QTY)', x: 410 },
          { label: 'TOTAL FEES PAID (PHP)', x: 540 },
          { label: 'LATEST CHECK-IN', x: 680 },
          { label: 'PAYMENT METHOD', x: 770 },
        ];
        drawTableHeaders(headers);

        liveAttendanceData.forEach((row: any, idx: number) => {
          if (checkPageBreak()) drawTableHeaders(headers);
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 25, y: y - 3, width: width - 50, height: 13, color: rgb(0.97, 0.98, 0.99) });
          }
          page.drawText(String(row.customer_name).slice(0, 32), { x: 30, y, size: 6.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.customer_type || 'Walk-In'), { x: 250, y, size: 6.5, font, color: rgb(0.2, 0.2, 0.2) });
          page.drawText(`${row.visits_count} visits`, { x: 410, y, size: 6.5, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(Number(row.total_fees || 0).toFixed(2), { x: 540, y, size: 6.5, font: fontBold, color: rgb(0.06, 0.6, 0.35) });
          page.drawText(String(row.latest_checkin).slice(0, 16), { x: 680, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.payment_method || 'Cash'), { x: 770, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          y -= 13;
        });

      // MEMBERSHIPS PDF (STATUS REMOVED)
      } else if (reportType === 'subscriptions') {
        const headers = [
          { label: 'CONTRACT ID', x: 30 },
          { label: 'MEMBER NAME', x: 150 },
          { label: 'PLAN NAME', x: 320 },
          { label: 'PRICE (PHP)', x: 480 },
          { label: 'START DATE', x: 590 },
          { label: 'END DATE', x: 680 },
          { label: 'PAYMENT', x: 770 },
        ];
        drawTableHeaders(headers);

        liveSubsData.forEach((row: any, idx: number) => {
          if (checkPageBreak()) drawTableHeaders(headers);
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 25, y: y - 3, width: width - 50, height: 13, color: rgb(0.97, 0.98, 0.99) });
          }
          const cid = row.receipt_number || `SUB-${String(row.id).slice(0, 6)}`;
          page.drawText(cid.slice(0, 16), { x: 30, y, size: 6.5, font, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(String(row.members?.full_name || 'Member').slice(0, 24), { x: 150, y, size: 6.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(String(row.plan_type ? row.plan_type.toUpperCase() : 'Monthly Pass').slice(0, 22), { x: 320, y, size: 6.5, font, color: rgb(0.2, 0.2, 0.2) });
          page.drawText(Number(row.price || 0).toFixed(2), { x: 480, y, size: 6.5, font: fontBold, color: rgb(0.06, 0.6, 0.35) });
          page.drawText(String(row.start_date || row.created_at).slice(0, 10), { x: 590, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.end_date || 'Ongoing').slice(0, 10), { x: 680, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(String(row.payment_method || 'Cash'), { x: 770, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          y -= 13;
        });

      // CONSOLIDATED SUMMARY PDF
      } else {
        const headers = [
          { label: 'DATE', x: 30 },
          { label: 'SALES (PHP)', x: 160 },
          { label: 'LOGBOOK (PHP)', x: 300 },
          { label: 'SUBSCRIPTION (PHP)', x: 440 },
          { label: 'TOTAL REVENUE (PHP)', x: 590 },
          { label: 'TRANSACTION COUNT', x: 725 },
        ];
        drawTableHeaders(headers);

        liveCombinedData.forEach((row, idx) => {
          if (checkPageBreak()) drawTableHeaders(headers);
          if (idx % 2 === 1) {
            page.drawRectangle({ x: 25, y: y - 3, width: width - 50, height: 13, color: rgb(0.97, 0.98, 0.99) });
          }
          page.drawText(row.date, { x: 30, y, size: 6.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
          page.drawText(row.sales.toFixed(2), { x: 160, y, size: 6.5, font, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(row.logbook.toFixed(2), { x: 300, y, size: 6.5, font, color: rgb(0.06, 0.6, 0.35) });
          page.drawText(row.subscription.toFixed(2), { x: 440, y, size: 6.5, font, color: rgb(0.5, 0.2, 0.7) });
          page.drawText(row.totalRevenue.toFixed(2), { x: 590, y, size: 6.5, font: fontBold, color: rgb(0.07, 0.23, 0.45) });
          page.drawText(`${row.transactionCount} transactions`, { x: 725, y, size: 6.5, font, color: rgb(0.3, 0.3, 0.3) });
          y -= 13;
        });
      }

      // Footer
      page.drawText('Palomar Gym System 2.0 • Official Compliance & Audit Export', {
        x: 300,
        y: 15,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const filename = `PalomarGym_${selectedCategoryMeta.filePrefix}_${startDate}.pdf`;
      saveAs(blob, filename);
      toast.success(`Generated ${filename} successfully!`);

      await logAudit(
        'REPORT_GENERATED',
        `Generated and downloaded ${selectedCategoryMeta.title} (PDF) for ${startDate} (${categoryStats.count} records, Total: ₱${categoryStats.totalValue.toFixed(2)}).`
      );
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
            {reportCategories.map(cat => {
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
                    {/* BIR TABLE PREVIEW (TIN REMOVED) */}
                    {reportType === 'bir' && liveBirData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-[#123c73] dark:text-blue-400">{row.receipt_no}</td>
                        <td className="p-2.5 whitespace-nowrap text-slate-500">{String(row.date).slice(0, 16)}</td>
                        <td className="p-2.5 font-medium">{row.customer_name}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px]">{row.transaction_type}</span></td>
                        <td className="p-2.5 font-bold">₱{row.gross_sales.toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500">₱{row.vat_exempt_sales.toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500">₱{row.vat_amount.toFixed(2)}</td>
                        <td className="p-2.5 font-bold">₱{row.net_sales.toFixed(2)}</td>
                        <td className="p-2.5">{row.payment_method}</td>
                        <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-bold">{row.status}</td>
                      </tr>
                    ))}

                    {/* POS & INVENTORY TABLE PREVIEW (STATUS ACTIVE REMOVED) */}
                    {reportType === 'sales' && liveSalesData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{row.barcode}</td>
                        <td className="p-2.5 font-bold">{row.name}</td>
                        <td className="p-2.5 font-mono">₱{row.price.toFixed(2)}</td>
                        <td className="p-2.5 font-extrabold text-emerald-600 dark:text-emerald-400">{row.sold} units</td>
                        <td className="p-2.5 font-bold">₱{row.revenue.toFixed(2)}</td>
                        <td className="p-2.5 font-mono">{row.stock} in stock</td>
                      </tr>
                    ))}

                    {/* ATTENDANCE PASSES TABLE PREVIEW (AGGREGATED VISITS) */}
                    {reportType === 'attendance' && liveAttendanceData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-bold">{row.customer_name}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-bold">{row.customer_type}</span></td>
                        <td className="p-2.5 font-extrabold text-[#123c73] dark:text-blue-400">{row.visits_count} visits</td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">₱{Number(row.total_fees || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500 whitespace-nowrap">{String(row.latest_checkin).slice(0, 16)}</td>
                        <td className="p-2.5">{row.payment_method || 'Cash'}</td>
                      </tr>
                    ))}

                    {/* SUBSCRIPTIONS TABLE PREVIEW (STATUS REMOVED) */}
                    {reportType === 'subscriptions' && liveSubsData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-mono text-xs font-bold text-purple-600 dark:text-purple-400">{row.receipt_number || `SUB-${String(row.id).slice(0, 6)}`}</td>
                        <td className="p-2.5 font-bold">{row.members?.full_name || 'Member'}</td>
                        <td className="p-2.5 font-medium">{row.plan_type ? row.plan_type.toUpperCase() : 'Monthly Pass'}</td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">₱{Number(row.price || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500">{String(row.start_date || row.created_at).slice(0, 10)}</td>
                        <td className="p-2.5 text-slate-500">{String(row.end_date || 'Ongoing').slice(0, 10)}</td>
                        <td className="p-2.5">{row.payment_method || 'Cash'}</td>
                      </tr>
                    ))}

                    {/* CONSOLIDATED FINANCIAL SUMMARY */}
                    {reportType === 'combined' && liveCombinedData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                        <td className="p-2.5 font-bold">{row.date}</td>
                        <td className="p-2.5 font-mono">₱{row.sales.toFixed(2)}</td>
                        <td className="p-2.5 font-mono">₱{row.logbook.toFixed(2)}</td>
                        <td className="p-2.5 font-mono">₱{row.subscription.toFixed(2)}</td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">₱{row.totalRevenue.toFixed(2)}</td>
                        <td className="p-2.5">{row.transactionCount} transactions</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
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
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono text-[10px] font-bold">.PDF (Landscape A4)</span>
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
