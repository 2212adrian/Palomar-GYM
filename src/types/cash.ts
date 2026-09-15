// src/types/cash.ts

export type CashSessionStatus = 'open' | 'closed';

export type CashTransactionType = 'cash_in' | 'cash_out' | 'digital_in';

export interface DenominationCounts {
  bill_1000: number;
  bill_500: number;
  bill_200: number;
  bill_100: number;
  bill_50: number;
  bill_20: number;
  coin_20: number;
  coin_10: number;
  coin_5: number;
  coin_1: number;
  coin_025: number;
}

export const DENOMINATION_VALUES: Record<keyof DenominationCounts, { value: number; label: string; isBill: boolean }> = {
  bill_1000: { value: 1000, label: '₱1,000 Bill', isBill: true },
  bill_500: { value: 500, label: '₱500 Bill', isBill: true },
  bill_200: { value: 200, label: '₱200 Bill', isBill: true },
  bill_100: { value: 100, label: '₱100 Bill', isBill: true },
  bill_50: { value: 50, label: '₱50 Bill', isBill: true },
  bill_20: { value: 20, label: '₱20 Bill', isBill: true },
  coin_20: { value: 20, label: '₱20 Coin', isBill: false },
  coin_10: { value: 10, label: '₱10 Coin', isBill: false },
  coin_5: { value: 5, label: '₱5 Coin', isBill: false },
  coin_1: { value: 1, label: '₱1 Coin', isBill: false },
  coin_025: { value: 0.25, label: '25¢ Coin', isBill: false },
};

export interface CashSession {
  id: string;
  session_number: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  opened_by_name: string;
  closed_by: string | null;
  closed_by_name: string | null;
  status: CashSessionStatus;
  opening_float: number;
  closing_actual_cash: number | null;
  closing_expected_cash: number | null;
  discrepancy: number | null;
  discrepancy_reason: string | null;
  notes: string | null;
  denominations: Partial<DenominationCounts> | null;
  created_at: string;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  session_id: string;
  type: CashTransactionType;
  category: string;
  amount: number;
  reason: string;
  reference_number?: string | null;
  performed_by: string | null;
  performed_by_name: string;
  created_at: string;
}

export interface CashFlowMetrics {
  openingFloat: number;
  cashInTotal: number;
  cashOutTotal: number;
  digitalInTotal: number;
  cashSales: number;
  digitalSales: number;
  cashLogbook: number;
  digitalLogbook: number;
  expectedDrawerCash: number;
  totalDigitalCollections: number;
  totalSessionCollections: number;
}
