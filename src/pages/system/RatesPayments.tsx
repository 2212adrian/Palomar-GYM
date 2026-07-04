import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { toast } from 'react-toastify';
import { 
  CreditCard, 
  Smartphone, 
  Percent, 
  User, 
  Receipt,
  Loader2,
  Info
} from 'lucide-react';

const getInitialRatesConfig = () => {
  const saved = localStorage.getItem('palomar_rates_config');
  const defaultConfig = {
    monthlyRate: 800,
    yearlyRate: 8000,
    regularWalkIn: 100,
    studentWalkIn: 80,
    yearlyWalkIn: 50,
    gcashFee: 10,
    newCardFee: 150,
    vatEnabled: true,
    vatPercentage: 12
  };
  if (saved) {
    try {
      return { ...defaultConfig, ...JSON.parse(saved) };
    } catch {
      return defaultConfig;
    }
  }
  return defaultConfig;
};

export const RatesPayments: React.FC = () => {
  const loadedConfig = getInitialRatesConfig();
  const { profile, user } = useAuthStore();

  // 1. Reactive state configuration settings
  const [monthlyRate, setMonthlyRate] = useState<number>(loadedConfig.monthlyRate);
  const [yearlyRate, setYearlyRate] = useState<number>(loadedConfig.yearlyRate);
  const [regularWalkIn, setRegularWalkIn] = useState<number>(loadedConfig.regularWalkIn);
  const [studentWalkIn, setStudentWalkIn] = useState<number>(loadedConfig.studentWalkIn);
  const [yearlyWalkIn, setYearlyWalkIn] = useState<number>(loadedConfig.yearlyWalkIn);
  const [gcashFee, setGcashFee] = useState<number>(loadedConfig.gcashFee);
  const [newCardFee, setNewCardFee] = useState<number>(loadedConfig.newCardFee);
  const [vatEnabled, setVatEnabled] = useState<boolean>(loadedConfig.vatEnabled);
  const [vatPercentage, setVatPercentage] = useState<number>(loadedConfig.vatPercentage);
  
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialConfig, setInitialConfig] = useState<any>(loadedConfig);
  
  // Dynamic business brand state to feed the receipt header
  const [gymProfileData, setGymProfileData] = useState<any>(null);

  // Refs guarantee event listeners always access the correct states without stale closures or re-binding
  const initialConfigRef = useRef<any>(loadedConfig);
  const currentConfigRef = useRef<any>(null);

  // Sync current config ref on every render state change
  currentConfigRef.current = {
    monthlyRate,
    yearlyRate,
    regularWalkIn,
    studentWalkIn,
    yearlyWalkIn,
    gcashFee,
    newCardFee,
    vatEnabled,
    vatPercentage
  };

  // Fetch configuration parameters directly from Supabase rates_config table
  const fetchRatesConfig = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('rates_config')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;

      if (data) {
        setMonthlyRate(Number(data.monthly_rate));
        setYearlyRate(Number(data.yearly_rate));
        setRegularWalkIn(Number(data.regular_walk_in));
        setStudentWalkIn(Number(data.student_walk_in));
        setYearlyWalkIn(Number(data.yearly_walk_in));
        setGcashFee(Number(data.gcash_fee));
        setNewCardFee(Number(data.new_card_fee));
        setVatEnabled(data.vat_enabled);
        setVatPercentage(Number(data.vat_percentage));

        const parsedConfig = {
          monthlyRate: Number(data.monthly_rate),
          yearlyRate: Number(data.yearly_rate),
          regularWalkIn: Number(data.regular_walk_in),
          studentWalkIn: Number(data.student_walk_in),
          yearlyWalkIn: Number(data.yearly_walk_in),
          gcashFee: Number(data.gcash_fee),
          newCardFee: Number(data.new_card_fee),
          vatEnabled: data.vat_enabled,
          vatPercentage: Number(data.vat_percentage)
        };
        setInitialConfig(parsedConfig);
        initialConfigRef.current = parsedConfig;
      }
    } catch (err: any) {
      console.warn('Failed to load cloud configuration, using default variables:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch active branding context to render dynamically in the thermal receipt
  const fetchGymProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('gym_profile')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;
      if (data) {
        setGymProfileData(data);
      }
    } catch (err: any) {
      console.warn('Failed to retrieve active branding parameters for live receipts:', err.message);
    }
  };

  useEffect(() => {
    fetchRatesConfig();
    fetchGymProfile();
  }, []);

  // 2. Receipt Preview States (Cash simulation states completely removed)
  const [previewPlan, setPreviewPlan] = useState<'monthly' | 'yearly' | 'regular_walkin' | 'student_walkin' | 'yearly_walkin'>('monthly');
  const [previewPaymentMethod, setPreviewPaymentMethod] = useState<'cash' | 'gcash'>('cash');
  const [previewNewCard, setPreviewNewCard] = useState<boolean>(false);
  const [showReceipt, setShowReceipt] = useState<boolean>(true); // Receipt collapse toggle
  const [currentTimeString, setCurrentTimeString] = useState<string>(''); // Live clock string

  // Real-time clock synchronization for the simulated receipt transaction date
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeString(
        now.toLocaleDateString('en-US', { 
          timeZone: 'Asia/Manila', 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        }) + ', ' + 
        now.toLocaleTimeString('en-US', { 
          timeZone: 'Asia/Manila', 
          hour: 'numeric', 
          minute: '2-digit', 
          second: '2-digit', 
          hour12: true 
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000); // Tick once per second
    return () => clearInterval(interval);
  }, []);

  // Compute dirty state
  const isDirty = initialConfig && (
    monthlyRate !== initialConfig.monthlyRate ||
    yearlyRate !== initialConfig.yearlyRate ||
    regularWalkIn !== initialConfig.regularWalkIn ||
    studentWalkIn !== initialConfig.studentWalkIn ||
    yearlyWalkIn !== initialConfig.yearlyWalkIn ||
    gcashFee !== initialConfig.gcashFee ||
    newCardFee !== initialConfig.newCardFee ||
    vatEnabled !== initialConfig.vatEnabled ||
    vatPercentage !== initialConfig.vatPercentage
  );

  const handleSaveConfig = async () => {
    setIsSaving(true);
    const current = currentConfigRef.current;
    try {
      const { error } = await supabase
        .from('rates_config')
        .update({
          monthly_rate: current.monthlyRate,
          yearly_rate: current.yearlyRate,
          regular_walk_in: current.regularWalkIn,
          student_walk_in: current.studentWalkIn,
          yearly_walk_in: current.yearlyWalkIn,
          gcash_fee: current.gcashFee,
          new_card_fee: current.newCardFee,
          vat_enabled: current.vatEnabled,
          vat_percentage: current.vatPercentage,
          updated_at: new Date().toISOString(),
          updated_by: user?.id
        })
        .eq('id', 1);

      if (error) throw error;

      // Log the system change (DB automatic trigger also logs this; this serves as client-side backup)
      await logAudit(
        'SYSTEM_RATES_UPDATED',
        `Rates updated: Monthly sub = ₱${current.monthlyRate}, Yearly sub = ₱${current.yearlyRate}, Regular Walk-In = ₱${current.regularWalkIn}, Student Walk-In = ₱${current.studentWalkIn}, Yearly Member Walk-In = ₱${current.yearlyWalkIn}.`
      );

      setInitialConfig(current);
      initialConfigRef.current = current; // Keep ref updated
      toast.success('Rates and transaction rules saved to cloud database.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync modifications.');
    } finally {
      setIsSaving(false);
    }
  };

  // Bind saving trigger to custom portal event (No state variables in dependency array)
  useEffect(() => {
    const handleSaveTrigger = () => {
      handleSaveConfig();
    };
    window.addEventListener('trigger-rates-save', handleSaveTrigger);
    return () => window.removeEventListener('trigger-rates-save', handleSaveTrigger);
  }, []);

  // Bind cancel trigger to revert states immediately (No state variables in dependency array)
  useEffect(() => {
    const handleCancelTrigger = () => {
      const config = initialConfigRef.current;
      if (config) {
        setMonthlyRate(config.monthlyRate);
        setYearlyRate(config.yearlyRate);
        setRegularWalkIn(config.regularWalkIn);
        setStudentWalkIn(config.studentWalkIn);
        setYearlyWalkIn(config.yearlyWalkIn);
        setGcashFee(config.gcashFee);
        setNewCardFee(config.newCardFee);
        setVatEnabled(config.vatEnabled);
        setVatPercentage(config.vatPercentage);
        toast.info('Changes discarded.');
      }
    };
    window.addEventListener('trigger-rates-cancel', handleCancelTrigger);
    return () => window.removeEventListener('trigger-rates-cancel', handleCancelTrigger);
  }, []);

  // Sync state with parent component
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('settings-dirty-state', { 
      detail: { isDirty, isSaving } 
    }));
  }, [isDirty, isSaving]);

  // Clean up dirty state on unmount
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('settings-dirty-state', { 
        detail: { isDirty: false, isSaving: false } 
      }));
    };
  }, []);

  // Dynamic BIR VAT Calculations
  const calculateReceipt = () => {
    let basePrice = 0;
    let description = '';

    switch (previewPlan) {
      case 'monthly':
        basePrice = monthlyRate;
        description = 'MONTHLY SUBSCRIPTION';
        break;
      case 'yearly':
        basePrice = yearlyRate;
        description = 'YEARLY SUBSCRIPTION';
        break;
      case 'regular_walkin':
        basePrice = regularWalkIn;
        description = 'WALK-IN REGULAR FEE';
        break;
      case 'student_walkin':
        basePrice = studentWalkIn;
        description = 'WALK-IN STUDENT FEE';
        break;
      case 'yearly_walkin':
        basePrice = yearlyWalkIn;
        description = 'YEARLY MEMBER WALK-IN';
        break;
    }

    let extraCharges = 0;

    // GCash Surcharge
    if (previewPaymentMethod === 'gcash') {
      extraCharges += gcashFee;
    }

    // New Card Fee Surcharge
    const isSubscription = previewPlan === 'monthly' || previewPlan === 'yearly';
    if (previewNewCard && isSubscription) {
      extraCharges += newCardFee;
    }

    const subtotal = basePrice + extraCharges;
    const totalDue = subtotal;

    let vatableSales = 0;
    let vatAmount = 0;
    let vatExemptSales = 0;
    let zeroRatedSales = 0;

    if (vatEnabled) {
      vatableSales = totalDue / (1 + (vatPercentage / 100));
      vatAmount = totalDue - vatableSales;
    } else {
      vatExemptSales = totalDue;
    }

    return {
      basePrice, // Exposed base price to render separately from extra fees
      description,
      subtotal,
      totalDue,
      vatableSales,
      vatAmount,
      vatExemptSales,
      zeroRatedSales
    };
  };

  const receipt = calculateReceipt();

  const isSubscription = previewPlan === 'monthly' || previewPlan === 'yearly';
  const processedByUsername = profile?.username || user?.user_metadata?.full_name || 'Staff';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 max-w-md mx-auto">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-[#bf0202]" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading system rates database settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-body">
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">
          Rates & Payments
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Set membership costs, student discounts, walk-in prices, and receipts tax rules.
        </p>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Setup Forms */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Group 1: Subscriptions */}
          <div className="p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Membership Plan Rates
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="monthlyRateInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Monthly Plan Rate</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                  <input
                    id="monthlyRateInput"
                    type="number"
                    value={monthlyRate}
                    placeholder="0"
                    title="Monthly Plan Rate"
                    onChange={(e) => setMonthlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
  <label htmlFor="yearlyRateInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Yearly Registration Fee</label>
  <div className="relative">
    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
    <input
      id="yearlyRateInput"
      type="number"
      value={yearlyRate}
      placeholder="0"
      title="Yearly Plan Rate"
      // CHANGE THIS LINE:
      onChange={(e) => setYearlyRate(Math.max(0, parseInt(e.target.value) || 0))}
      className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
    />
  </div>
</div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Monthly subscriptions grant free daily entry. Yearly memberships grant a discounted daily rate.</p>
          </div>

          {/* Group 2: Regular & Student Walk-In Fees */}
          <div className="p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Walk-In Daily Fees
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="regularWalkInInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Regular Non-Member</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                  <input
                    id="regularWalkInInput"
                    type="number"
                    value={regularWalkIn}
                    placeholder="0"
                    title="Regular Walk-In Fee"
                    onChange={(e) => setRegularWalkIn(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="studentWalkInInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Student Non-Member</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                  <input
                    id="studentWalkInInput"
                    type="number"
                    value={studentWalkIn}
                    placeholder="0"
                    title="Student Walk-In Fee"
                    onChange={(e) => setStudentWalkIn(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="yearlyWalkInInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Yearly Member Daily</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                  <input
                    id="yearlyWalkInInput"
                    type="number"
                    value={yearlyWalkIn}
                    placeholder="0"
                    title="Yearly Member Walk-In Fee"
                    onChange={(e) => setYearlyWalkIn(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Student discounts apply to walk-in visitors only. Yearly members pay a heavily discounted daily rate.</p>
          </div>

          {/* Group 3: Surcharges & Miscellaneous */}
          <div className="p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
              Additional Charges
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="gcashFeeInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">GCash Extra Charge</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                  <input
                    id="gcashFeeInput"
                    type="number"
                    value={gcashFee}
                    placeholder="0"
                    title="GCash Extra Charge"
                    onChange={(e) => setGcashFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Convenience fee added when paying via GCash transfer.</p>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="newCardFeeInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">New Card Fee</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-sm">₱</span>
                  <input
                    id="newCardFeeInput"
                    type="number"
                    value={newCardFee}
                    placeholder="0"
                    title="New Card Fee"
                    onChange={(e) => setNewCardFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] transition-all"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">For printing new or replacement QR Membership Cards.</p>
              </div>
            </div>
          </div>

          {/* Group 4: VAT rules */}
          <div className="p-5 bg-slate-50/30 dark:bg-neutral-900/10 border border-slate-200 dark:border-white/5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Percent className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
                VAT Settings
              </h3>
              
              <button
                type="button"
                onClick={() => setVatEnabled(!vatEnabled)}
                aria-label="Toggle VAT Calculations"
                title="Toggle VAT Calculations"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                  vatEnabled ? 'bg-blue-600 dark:bg-[#bf0202]' : 'bg-slate-200 dark:bg-neutral-800'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  vatEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="grid gap-1.5">
                <label htmlFor="vatPercentageInput" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">VAT Percentage (%)</label>
                <div className="relative">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-xs">%</span>
                  <input
                    id="vatPercentageInput"
                    type="number"
                    disabled={!vatEnabled}
                    value={vatPercentage}
                    placeholder="0"
                    title="VAT Percentage"
                    onChange={(e) => setVatPercentage(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-4 pr-8 py-2.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-slate-100 dark:bg-[#13161a] text-slate-900 dark:text-slate-100 font-mono outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-[#bf0202] disabled:opacity-50 transition-all"
                  />
                </div>
              </div>
              <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 leading-normal">
                <span>Toggle to enable or disable VAT computations in receipts. Standard BIR compliance in the Philippines requires 12% inclusive VAT.</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Side: Interactive Payment Calculator & BIR Thermal Receipt */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="p-6 bg-slate-50 dark:bg-[#111315] border border-slate-200 dark:border-white/5 rounded-2xl shadow-xs space-y-5 flex flex-col h-full justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-500 dark:text-[#bf0202]" />
                  <h3 className="text-sm font-heading tracking-wider uppercase text-slate-900 dark:text-white">
                    Live Receipt Preview
                  </h3>
                </div>
                
                {/* Collapsible Toggle */}
                <button
                  onClick={() => setShowReceipt(!showReceipt)}
                  className="text-[10px] font-heading tracking-wider uppercase text-blue-600 dark:text-[#bf0202] hover:opacity-85 transition-opacity cursor-pointer border border-blue-500/20 dark:border-red-500/20 px-2 py-1 rounded-md bg-white dark:bg-[#161920]"
                >
                  {showReceipt ? 'Hide Receipt' : 'Show Receipt'}
                </button>
              </div>
              
              {/* Context usability instructions callout as requested */}
              <div className="p-3 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/15 dark:border-blue-500/20 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Edit your pricing parameters on the left, and instantly see how the customer's live thermal receipt looks on the right.</span>
              </div>

              {/* Calculator Settings: Product/Check-In Selectors */}
              <div className="space-y-2.5 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">1. Select Purchase Scenario</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPreviewPlan('monthly')}
                    className={`py-2 px-3 rounded-lg text-left text-xs transition-all cursor-pointer font-semibold ${
                      previewPlan === 'monthly'
                        ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs'
                        : 'bg-white dark:bg-[#161920] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/50 dark:border-white/5'
                    }`}
                  >
                    Monthly Sub
                  </button>
                  <button
                    onClick={() => setPreviewPlan('yearly')}
                    className={`py-2 px-3 rounded-lg text-left text-xs transition-all cursor-pointer font-semibold ${
                      previewPlan === 'yearly'
                        ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs'
                        : 'bg-white dark:bg-[#161920] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/50 dark:border-white/5'
                    }`}
                  >
                    Yearly Sub
                  </button>
                  <button
                    onClick={() => {
                      setPreviewPlan('regular_walkin');
                      setPreviewNewCard(false);
                    }}
                    className={`py-2 px-3 rounded-lg text-left text-xs transition-all cursor-pointer font-semibold ${
                      previewPlan === 'regular_walkin'
                        ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs'
                        : 'bg-white dark:bg-[#161920] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/50 dark:border-white/5'
                    }`}
                  >
                    Walk-In Regular
                  </button>
                  <button
                    onClick={() => {
                      setPreviewPlan('student_walkin');
                      setPreviewNewCard(false);
                    }}
                    className={`py-2 px-3 rounded-lg text-left text-xs transition-all cursor-pointer font-semibold ${
                      previewPlan === 'student_walkin'
                        ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs'
                        : 'bg-white dark:bg-[#161920] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/50 dark:border-white/5'
                    }`}
                  >
                    Walk-In Student
                  </button>
                  <button
                    onClick={() => {
                      setPreviewPlan('yearly_walkin');
                      setPreviewNewCard(false);
                    }}
                    className={`col-span-2 py-2 px-3 rounded-lg text-left text-xs transition-all cursor-pointer font-semibold ${
                      previewPlan === 'yearly_walkin'
                        ? 'bg-blue-600 dark:bg-[#bf0202] text-white shadow-xs'
                        : 'bg-white dark:bg-[#161920] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200/50 dark:border-white/5'
                    }`}
                  >
                    Yearly Member Daily Entry (₱{yearlyWalkIn})
                  </button>
                </div>
              </div>

              {/* Calculator Settings: Payment Gateway & Card fees toggles */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">2. Payment Method</span>
                  <div className="flex bg-white dark:bg-[#161920] p-1 rounded-lg border border-slate-200/50 dark:border-white/5">
                    <button
                      onClick={() => setPreviewPaymentMethod('cash')}
                      className={`flex-1 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        previewPaymentMethod === 'cash'
                          ? 'bg-slate-200 dark:bg-neutral-800 text-slate-900 dark:text-white'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                      }`}
                    >
                      Cash
                    </button>
                    <button
                      onClick={() => setPreviewPaymentMethod('gcash')}
                      className={`flex-1 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        previewPaymentMethod === 'gcash'
                          ? 'bg-slate-200 dark:bg-neutral-800 text-slate-900 dark:text-white'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                      }`}
                    >
                      GCash
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">3. Card Options</span>
                  <button
                    disabled={previewPlan === 'regular_walkin' || previewPlan === 'student_walkin' || previewPlan === 'yearly_walkin'}
                    onClick={() => setPreviewNewCard(!previewNewCard)}
                    className={`w-full py-2 px-3 border rounded-lg text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all ${
                      previewNewCard 
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:border-[#bf0202] dark:bg-[#bf0202]/10 dark:text-[#bf0202]' 
                        : 'border-slate-200 dark:border-white/5 text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    + Member Card
                  </button>
                </div>
              </div>
            </div>

            {/* BIR Thermal Receipt - Collapsible based on state */}
            {showReceipt && (
              <div className="border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-[#0d0f12] p-5 shadow-md space-y-4 font-mono text-[10px] text-slate-800 dark:text-slate-300 relative overflow-hidden transition-all duration-300 leading-normal animate-slide-up">
                
                {/* Paper indicator bar - Updated to bg-linear-to-r for Tailwind v4 */}
                <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-blue-500 to-[#1b365d] dark:from-red-600 dark:to-[#bf0202] opacity-80" />

               {/* Receipt Header - Populated dynamically from cloud storage */}
                <div className="text-center space-y-1">
                  <img 
                    src={gymProfileData?.gym_logo || "/favicon.svg"} 
                    alt="Wolf Gym Logo" 
                    className="mx-auto w-10 h-10 object-contain mb-1.5" 
                  />
                  <h4 className="font-heading text-xs tracking-wider text-slate-900 dark:text-white uppercase leading-none">
                    {gymProfileData?.gym_name || "WOLF PALOMAR GYM"}
                  </h4>
                  <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-tight leading-normal max-w-[200px] mx-auto text-center">
                    {gymProfileData?.gym_address || "123 Sample Street, Barangay Central, Quezon City, Metro Manila, Philippines"}
                  </p>
                  <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                    {gymProfileData?.contact_number_1 ? `Staff Contact: ${gymProfileData.contact_number_1}` : "Staff Contact: 09762607481"}
                    {gymProfileData?.contact_number_2 && ` / ${gymProfileData.contact_number_2}`}
                  </p>
                </div>

                <div className="border-b border-dashed border-slate-300 dark:border-white/10 my-2" />
                
                <div className="text-center font-bold tracking-wider text-slate-900 dark:text-white uppercase text-[9px]">
                  {isSubscription ? 'Subscription Official Receipt' : 'Walk-In Official Receipt'}
                </div>

                {/* Scanning Reference QR Block - Conditionally hidden for non-subscriptions */}
                {isSubscription && (
                  <div className="flex items-center gap-3.5 py-1 bg-slate-50 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-white/5 animate-slide-up">
                    <svg className="w-12 h-12 text-slate-800 dark:text-slate-200 shrink-0 select-none" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 3h6v6H3V3zm1 1v4h4V4H4zm1 1h2v2H5V5zm6-2h2v2h-2V3zm3 0h2v2h-2V3zm3 0h4v6h-4V3zm1 1v4h2V4h-2zm1 1h1v2h-1V5zM3 15h6v6H3v-6zm1 1v4h4v-4H4zm1 1h2v2H5v-2zm8-2h1v1h-1v-1zm1 1h1v1h-1v-1zm1-1h1v1h-1v-1zm2 0h2v1h-2v-1zm1 2h1v1h-1v-1zm1-2h1v1h-1v-1zm-4 4h2v1h-2v-1zm3 0h1v1h-1v-1zm2-2h1v1h-1v-1zm-6 3h1v1h-1v-1zm2 0h1v1h-1v-1zm2 0h2v1h-2v-1zm1-3h1v1h-1v-1z"/>
                    </svg>
                    <div className="text-[8px] font-mono leading-tight overflow-hidden">
                      <span className="text-slate-400 font-bold block">SCAN FOR REF</span>
                      <span className="text-slate-800 dark:text-slate-200 font-black block tracking-tight uppercase">RCPT-20260302-073920-R2XVX</span>
                    </div>
                  </div>
                )}

                <div className="border-b border-dashed border-slate-300 dark:border-white/10 my-2" />

                {/* BIR Transaction Details metadata fields */}
                <div className="space-y-1.5 text-[9px]">
                  {/* Dynamic receipt identifiers - Conditionally hidden for non-subscriptions */}
                  {isSubscription && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">RECEIPT NO</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">RCPT-20260302-073920-R2XVX</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">PAYMENT REF</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">SUBPAY-20260302-073454-OM4PY</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isSubscription ? 'MEMBER' : 'NON-MEMBER'}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">ATASHALY OCAP</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isSubscription ? 'PLAN TYPE' : 'LOGBOOK ENTRY'}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase text-right max-w-32">
                      {receipt.description}
                    </span>
                  </div>

                  {/* Explicit Base Charge Line Item */}
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isSubscription ? 'MEMBERSHIP FEE' : 'WALK-IN CHARGE'}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      ₱{receipt.basePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Separate Card Fee Line Item */}
                  {previewNewCard && (previewPlan === 'monthly' || previewPlan === 'yearly') && (
                    <div className="flex justify-between animate-slide-up">
                      <span className="text-slate-400">CARD FEE</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        +₱{newCardFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {/* Separate GCash Fee Line Item */}
                  {previewPaymentMethod === 'gcash' && (
                    <div className="flex justify-between animate-slide-up">
                      <span className="text-slate-400">GCASH CONVENIENCE FEE</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        +₱{gcashFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-slate-400">PAYMENT METHOD</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{previewPaymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">TRANSACTION DATE</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-right max-w-32">
                      {currentTimeString}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">PROCESSED BY</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{processedByUsername}</span>
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-300 dark:border-white/10 my-2" />

                {/* Subtotal & Totals with high readability borders */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>SUBTOTAL</span>
                    <span>₱{receipt.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {/* Total Due highlighted box matching screenshot */}
                  <div className="flex justify-between items-center bg-slate-50 dark:bg-zinc-950/40 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-extrabold text-sm">
                    <span>TOTAL DUE</span>
                    <span className="text-[#1b365d] dark:text-[#bf0202]">₱{receipt.totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {/* Simulated cash drawer computations fully removed here as requested */}
                </div>

                {/* Dynamic BIR Tax breakdown (Fully hidden instead of displaying zero when VAT is disabled) */}
                {vatEnabled && (
                  <>
                    <div className="border-b border-dashed border-slate-300 dark:border-white/10 my-2" />
                    <div className="space-y-1 text-[9px] text-slate-500 dark:text-slate-400 animate-slide-up">
                      <div className="flex justify-between">
                        <span>VATABLE SALES</span>
                        <span>₱{receipt.vatableSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>VAT ({vatPercentage}%)</span>
                        <span>₱{receipt.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>VAT EXEMPT SALES</span>
                        <span>₱{receipt.vatExemptSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ZERO-RATED SALES</span>
                        <span>₱{receipt.zeroRatedSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="border-b border-dashed border-slate-300 dark:border-white/10 my-2" />

                {/* Invoice verification guidelines footer */}
                <div className="text-center space-y-2 pt-1.5 text-[8px] text-slate-400 leading-normal">
                  <p className="font-semibold uppercase tracking-wider">This serves as your Sales Invoice <br /> {vatEnabled ? '(Vat-Inclusive)' : '(Non-Vat)'}</p>
                  <div className="font-medium uppercase tracking-widest text-slate-500 dark:text-slate-300 space-y-0.5">
                    <p>Thank you for choosing Wolf Gym.</p>
                    <p>We look forward to seeing you again.</p>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};