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
  Info
} from 'lucide-react';
import { OfficialReceipt, type ReceiptData } from '../../components/ui/OfficialReceipt';

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

  const [monthlyRate, setMonthlyRate] = useState<number>(loadedConfig.monthlyRate);
  const [yearlyRate, setYearlyRate] = useState<number>(loadedConfig.yearlyRate);
  const [regularWalkIn, setRegularWalkIn] = useState<number>(loadedConfig.regularWalkIn);
  const [studentWalkIn, setStudentWalkIn] = useState<number>(loadedConfig.studentWalkIn);
  const [yearlyWalkIn, setYearlyWalkIn] = useState<number>(loadedConfig.yearlyWalkIn);
  const [gcashFee, setGcashFee] = useState<number>(loadedConfig.gcashFee);
  const [newCardFee, setNewCardFee] = useState<number>(loadedConfig.newCardFee);
  const [vatEnabled, setVatEnabled] = useState<boolean>(loadedConfig.vatEnabled);
  const [vatPercentage, setVatPercentage] = useState<number>(loadedConfig.vatPercentage);
  
  const [, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [, setInitialConfig] = useState<any>(loadedConfig);
  
  const [gymProfileData, setGymProfileData] = useState<any>(null);

  const initialConfigRef = useRef<any>(loadedConfig);
  const currentConfigRef = useRef<any>(null);

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

  const [previewPlan, setPreviewPlan] = useState<'monthly' | 'yearly' | 'regular_walkin' | 'student_walkin' | 'yearly_walkin'>('monthly');
  const [previewPaymentMethod, setPreviewPaymentMethod] = useState<'cash' | 'gcash'>('cash');
  const [previewNewCard, setPreviewNewCard] = useState<boolean>(false);
  const [showReceipt, setShowReceipt] = useState<boolean>(true);

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

      await logAudit(
        'SYSTEM_RATES_UPDATED',
        `Rates updated: Monthly sub = ₱${current.monthlyRate}, Yearly sub = ₱${current.yearlyRate}, Regular Walk-In = ₱${current.regularWalkIn}, Student Walk-In = ₱${current.studentWalkIn}, Yearly Member Walk-In = ₱${current.yearlyWalkIn}.`
      );

      setInitialConfig(current);
      initialConfigRef.current = current;
      toast.success('Rates and transaction rules saved to cloud database.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync modifications.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleSaveTrigger = () => handleSaveConfig();
    window.addEventListener('trigger-rates-save', handleSaveTrigger);
    return () => window.removeEventListener('trigger-rates-save', handleSaveTrigger);
  }, []);

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

  // Compute live receipt payload dynamically
  const getPreviewData = (): ReceiptData => {
    let basePrice = 0;
    let planType = '';
    let receiptType: ReceiptData['receiptType'] = 'subscription';

    switch (previewPlan) {
      case 'monthly':
        basePrice = monthlyRate;
        planType = 'MONTHLY SUBSCRIPTION';
        receiptType = 'subscription';
        break;
      case 'yearly':
        basePrice = yearlyRate;
        planType = 'YEARLY SUBSCRIPTION';
        receiptType = 'subscription';
        break;
      case 'regular_walkin':
        basePrice = regularWalkIn;
        planType = 'WALK-IN REGULAR FEE';
        receiptType = 'walkin';
        break;
      case 'student_walkin':
        basePrice = studentWalkIn;
        planType = 'WALK-IN STUDENT FEE';
        receiptType = 'walkin';
        break;
      case 'yearly_walkin':
        basePrice = yearlyWalkIn;
        planType = 'YEARLY MEMBER WALK-IN';
        receiptType = 'walkin';
        break;
    }

    const isSubscription = previewPlan === 'monthly' || previewPlan === 'yearly';

    return {
      receiptType,
      receiptNo: 'RCPT-LIVE-PREVIEW',
      paymentRef: isSubscription ? 'SUBPAY-LIVE-PREVIEW' : undefined,
      customerName: 'ATASHALY OCAP',
      planType,
      basePrice,
      cardFee: previewNewCard && isSubscription ? newCardFee : 0,
      gcashFee: previewPaymentMethod === 'gcash' ? gcashFee : 0,
      paymentMethod: previewPaymentMethod,
      processedBy: profile?.username || user?.user_metadata?.full_name || 'Staff',
      gymProfile: gymProfileData,
      ratesConfig: {
        vat_enabled: vatEnabled,
        vat_percentage: vatPercentage
      }
    };
  };

  return (
    <div className="space-y-6 font-body text-(--color-text)">
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
          Rates & Payments
        </h2>
        <p className="text-sm text-slate-400 mt-1 font-medium">
          Set membership costs, student discounts, walk-in prices, and receipts tax rules.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Forms */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-(--color-primary-light)" />
              Membership Plan Rates
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="monthlyRateInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Plan Rate</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="monthlyRateInput"
                    type="number"
                    value={monthlyRate}
                    onChange={(e) => setMonthlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="yearlyRateInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">Yearly Registration Fee</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="yearlyRateInput"
                    type="number"
                    value={yearlyRate}
                    onChange={(e) => setYearlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
              <User className="w-4 h-4 text-(--color-primary-light)" />
              Walk-In Daily Fees
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="regularWalkInInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">Regular Non-Member</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="regularWalkInInput"
                    type="number"
                    value={regularWalkIn}
                    onChange={(e) => setRegularWalkIn(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="studentWalkInInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">Student Non-Member</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="studentWalkInInput"
                    type="number"
                    value={studentWalkIn}
                    onChange={(e) => setStudentWalkIn(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="yearlyWalkInInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">Yearly Member Daily</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="yearlyWalkInInput"
                    type="number"
                    value={yearlyWalkIn}
                    onChange={(e) => setYearlyWalkIn(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
            <h3 className="text-sm font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-(--color-primary-light)" />
              Additional Charges
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="gcashFeeInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">GCash Extra Charge</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="gcashFeeInput"
                    type="number"
                    value={gcashFee}
                    onChange={(e) => setGcashFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="newCardFeeInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">New Card Fee</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">₱</span>
                  <input
                    id="newCardFeeInput"
                    type="number"
                    value={newCardFee}
                    onChange={(e) => setNewCardFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 bg-(--bg-card) border border-(--border-color) rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-heading tracking-wider uppercase text-(--color-text) flex items-center gap-2">
                <Percent className="w-4 h-4 text-(--color-primary-light)" />
                VAT Settings
              </h3>
              <button
                type="button"
                onClick={() => setVatEnabled(!vatEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                  vatEnabled ? 'bg-(--color-primary)' : 'bg-(--bg-input)'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  vatEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="grid gap-1.5">
                <label htmlFor="vatPercentageInput" className="text-xs font-bold uppercase tracking-wider text-slate-400">VAT Percentage (%)</label>
                <input
                  id="vatPercentageInput"
                  type="number"
                  disabled={!vatEnabled}
                  value={vatPercentage}
                  onChange={(e) => setVatPercentage(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-4 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) font-mono outline-none focus:ring-1 focus:ring-(--color-primary) disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Payment Calculator & Unified Live Receipt Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 bg-(--bg-card) border border-(--border-color) rounded-2xl shadow-xs space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-(--color-primary-light)" />
                  <h3 className="text-sm font-heading tracking-wider uppercase text-(--color-text)">
                    Live Receipt Preview
                  </h3>
                </div>
                <button
                  onClick={() => setShowReceipt(!showReceipt)}
                  className="text-[10px] font-heading tracking-wider uppercase text-(--color-primary-light) border border-(--border-color) px-2 py-1 rounded-md bg-(--bg-page)"
                >
                  {showReceipt ? 'Hide Receipt' : 'Show Receipt'}
                </button>
              </div>

              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-2.5 text-[11px] text-blue-400">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <span>Edit pricing parameters on the left to see live thermal receipt updates.</span>
              </div>

              {/* Scenario controls */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Select Scenario</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPreviewPlan('monthly')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                      previewPlan === 'monthly' ? 'bg-(--color-primary) text-white' : 'bg-(--bg-page) text-slate-400 border border-(--border-color)'
                    }`}
                  >
                    Monthly Sub
                  </button>
                  <button
                    onClick={() => setPreviewPlan('yearly')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                      previewPlan === 'yearly' ? 'bg-(--color-primary) text-white' : 'bg-(--bg-page) text-slate-400 border border-(--border-color)'
                    }`}
                  >
                    Yearly Sub
                  </button>
                  <button
                    onClick={() => { setPreviewPlan('regular_walkin'); setPreviewNewCard(false); }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                      previewPlan === 'regular_walkin' ? 'bg-(--color-primary) text-white' : 'bg-(--bg-page) text-slate-400 border border-(--border-color)'
                    }`}
                  >
                    Walk-In Regular
                  </button>
                  <button
                    onClick={() => { setPreviewPlan('student_walkin'); setPreviewNewCard(false); }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                      previewPlan === 'student_walkin' ? 'bg-(--color-primary) text-white' : 'bg-(--bg-page) text-slate-400 border border-(--border-color)'
                    }`}
                  >
                    Walk-In Student
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Payment Method</span>
                  <div className="flex bg-(--bg-page) p-1 rounded-lg border border-(--border-color)">
                    <button
                      onClick={() => setPreviewPaymentMethod('cash')}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        previewPaymentMethod === 'cash' ? 'bg-(--bg-input) text-(--color-text)' : 'text-slate-400'
                      }`}
                    >
                      Cash
                    </button>
                    <button
                      onClick={() => setPreviewPaymentMethod('gcash')}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${
                        previewPaymentMethod === 'gcash' ? 'bg-(--bg-input) text-(--color-text)' : 'text-slate-400'
                      }`}
                    >
                      GCash
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Options</span>
                  <button
                    disabled={previewPlan.includes('walkin')}
                    onClick={() => setPreviewNewCard(!previewNewCard)}
                    className={`w-full py-2 px-3 border rounded-lg text-[10px] font-bold uppercase ${
                      previewNewCard ? 'border-(--color-primary) text-(--color-primary-light)' : 'border-(--border-color) text-slate-400'
                    }`}
                  >
                    + Member Card
                  </button>
                </div>
              </div>
            </div>

            {/* Render Shared Receipt Component in Inline Mode */}
            {showReceipt && (
              <OfficialReceipt
                variant="inline"
                data={getPreviewData()}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
};