// src/stores/useRevenueGoals.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  startOfDay, endOfDay, 
  startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, 
  startOfYear, endOfYear 
} from 'date-fns';
import { supabase } from '../lib/supabase/client';

export type GoalTimeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RevenueGoalsConfig {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

const DEFAULT_GOALS: RevenueGoalsConfig = {
  daily: 5000,
  weekly: 35000,
  monthly: 150000,
  yearly: 1800000
};

const STORAGE_KEY_GOALS = 'palomar_revenue_goals_config_v1';
const STORAGE_KEY_TIMEFRAME = 'palomar_revenue_goals_timeframe_v1';

export function getStoredGoals(): RevenueGoalsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOALS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        daily: Number(parsed.daily) || DEFAULT_GOALS.daily,
        weekly: Number(parsed.weekly) || DEFAULT_GOALS.weekly,
        monthly: Number(parsed.monthly) || DEFAULT_GOALS.monthly,
        yearly: Number(parsed.yearly) || DEFAULT_GOALS.yearly
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_GOALS;
}

export function saveStoredGoals(goals: RevenueGoalsConfig) {
  try {
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    window.dispatchEvent(new Event('palomar-goals-updated'));
  } catch (err) {
    console.error('Failed to save goals in localStorage:', err);
  }
}

export function useRevenueGoals() {
  const [timeframe, setTimeframe] = useState<GoalTimeframe>(() => {
    try {
      const tf = localStorage.getItem(STORAGE_KEY_TIMEFRAME) as GoalTimeframe;
      if (tf && ['daily', 'weekly', 'monthly', 'yearly'].includes(tf)) {
        return tf;
      }
    } catch {}
    return 'daily';
  });

  const [goalsConfig, setGoalsConfig] = useState<RevenueGoalsConfig>(getStoredGoals);
  const [logbookRevenue, setLogbookRevenue] = useState<number>(0);
  const [salesRevenue, setSalesRevenue] = useState<number>(0);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [trend, setTrend] = useState<'increasing' | 'decreasing' | 'neutral'>('neutral');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const prevTotalRef = useRef<number>(0);
  const isInitialMount = useRef<boolean>(true);

  const updateTimeframe = (tf: GoalTimeframe) => {
    setTimeframe(tf);
    try {
      localStorage.setItem(STORAGE_KEY_TIMEFRAME, tf);
    } catch {}
  };

  const updateGoals = (newGoals: RevenueGoalsConfig) => {
    setGoalsConfig(newGoals);
    saveStoredGoals(newGoals);
  };

  // Calculate Date Boundaries
  const getDateRange = useCallback((tf: GoalTimeframe) => {
    const now = new Date();
    switch (tf) {
      case 'daily':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'weekly':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'monthly':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'yearly':
        return { start: startOfYear(now), end: endOfYear(now) };
    }
  }, []);

  // Fetch live revenue for active timeframe
  const fetchRevenue = useCallback(async () => {
    try {
      const { start, end } = getDateRange(timeframe);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const [salesRes, attendanceRes, subsRes] = await Promise.all([
        supabase
          .from('sales')
          .select('total_amount')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .is('deleted_at', null),
        supabase
          .from('attendance')
          .select('entry_fee')
          .gte('check_in_time', startIso)
          .lte('check_in_time', endIso)
          .is('deleted_at', null),
        supabase
          .from('subscriptions')
          .select('price')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .is('voided_at', null)
      ]);

      const salesSum = (salesRes.data || []).reduce((sum, item: any) => sum + Number(item.total_amount || 0), 0);
      const attSum = (attendanceRes.data || []).reduce((sum, item: any) => sum + Number(item.entry_fee || 0), 0);
      const subsSum = (subsRes.data || []).reduce((sum, item: any) => sum + Number(item.price || 0), 0);

      const calculatedLogbook = attSum + subsSum;
      const calculatedTotal = salesSum + calculatedLogbook;

      setSalesRevenue(salesSum);
      setLogbookRevenue(calculatedLogbook);
      setTotalRevenue(calculatedTotal);

      if (!isInitialMount.current) {
        if (calculatedTotal > prevTotalRef.current) {
          setTrend('increasing');
        } else if (calculatedTotal < prevTotalRef.current) {
          setTrend('decreasing');
        } else {
          setTrend('neutral');
        }
      } else {
        isInitialMount.current = false;
      }
      prevTotalRef.current = calculatedTotal;
    } catch (err) {
      console.error('Error fetching revenue goals data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, getDateRange]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  // Sync when goals are updated from any view
  useEffect(() => {
    const handleGoalUpdate = () => {
      setGoalsConfig(getStoredGoals());
    };
    window.addEventListener('palomar-goals-updated', handleGoalUpdate);
    return () => window.removeEventListener('palomar-goals-updated', handleGoalUpdate);
  }, []);

  // Realtime live subscription to sales, attendance, subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('revenue-goals-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchRevenue();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        fetchRevenue();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        fetchRevenue();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRevenue]);

  const currentGoalTarget = goalsConfig[timeframe] || 5000;
  const progressPercent = currentGoalTarget > 0 ? Math.min(100, Math.round((totalRevenue / currentGoalTarget) * 100)) : 0;
  const remainingAmount = Math.max(0, currentGoalTarget - totalRevenue);
  const isGoalAchieved = totalRevenue >= currentGoalTarget;

  return {
    timeframe,
    setTimeframe: updateTimeframe,
    goalsConfig,
    updateGoals,
    logbookRevenue,
    salesRevenue,
    totalRevenue,
    currentGoalTarget,
    progressPercent,
    remainingAmount,
    isGoalAchieved,
    trend,
    isLoading,
    refreshRevenue: fetchRevenue
  };
}
