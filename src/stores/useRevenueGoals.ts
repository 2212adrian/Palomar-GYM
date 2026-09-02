// src/stores/useRevenueGoals.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { supabase } from '../lib/supabase/client';
import { useAuthStore } from './authStore';
import { isSuperAdmin } from '../constants/auth';

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
  yearly: 1800000,
};

export function useRevenueGoals() {
  const { user, profile } = useAuthStore() as any;

  // Determine if current active user is authorized (Admin or SuperAdmin)
  const isSuperAdminUser = isSuperAdmin(user?.email);
  const isAdmin = isSuperAdminUser || profile?.role === 'admin';

  const [timeframe, setTimeframe] = useState<GoalTimeframe>('daily');
  const [goalsConfig, setGoalsConfig] =
    useState<RevenueGoalsConfig>(DEFAULT_GOALS);
  const [logbookRevenue, setLogbookRevenue] = useState<number>(0);
  const [salesRevenue, setSalesRevenue] = useState<number>(0);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [trend, setTrend] = useState<'increasing' | 'decreasing' | 'neutral'>(
    'neutral'
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const prevTotalRef = useRef<number>(0);
  const isInitialMount = useRef<boolean>(true);

  // Fetch Goals Configuration from Supabase (Exclusive for Admin/Superadmin)
  const fetchGoalsConfig = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('revenue_goals')
        .select('daily, weekly, monthly, yearly')
        .eq('id', 'default_goals')
        .maybeSingle();

      if (error) {
        console.warn(
          'Could not fetch revenue_goals, using baseline:',
          error.message
        );
        return;
      }

      if (data) {
        setGoalsConfig({
          daily: Number(data.daily) || DEFAULT_GOALS.daily,
          weekly: Number(data.weekly) || DEFAULT_GOALS.weekly,
          monthly: Number(data.monthly) || DEFAULT_GOALS.monthly,
          yearly: Number(data.yearly) || DEFAULT_GOALS.yearly,
        });
      }
    } catch (err) {
      console.error('Error fetching revenue goals config from Supabase:', err);
    }
  }, [isAdmin]);

  // Update Goals Configuration in Supabase
  const updateGoals = async (newGoals: RevenueGoalsConfig) => {
    if (!isAdmin) {
      throw new Error(
        'Unauthorized: Only administrators can update revenue goals.'
      );
    }

    setGoalsConfig(newGoals);

    const { error } = await supabase.from('revenue_goals').upsert(
      {
        id: 'default_goals',
        daily: newGoals.daily,
        weekly: newGoals.weekly,
        monthly: newGoals.monthly,
        yearly: newGoals.yearly,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.error('Failed to update revenue_goals in Supabase:', error);
      throw error;
    }
  };

  // Calculate Date Boundaries
  const getDateRange = useCallback((tf: GoalTimeframe) => {
    const now = new Date();
    switch (tf) {
      case 'daily':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'weekly':
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        };
      case 'monthly':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'yearly':
        return { start: startOfYear(now), end: endOfYear(now) };
    }
  }, []);

  // Fetch live revenue for active timeframe
  const fetchRevenue = useCallback(async () => {
    // Strictly prohibit staff from querying financial aggregates
    if (!isAdmin) {
      setSalesRevenue(0);
      setLogbookRevenue(0);
      setTotalRevenue(0);
      setIsLoading(false);
      return;
    }

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
          .is('voided_at', null),
      ]);

      const salesSum = (salesRes.data || []).reduce(
        (sum, item: any) => sum + Number(item.total_amount || 0),
        0
      );
      const attSum = (attendanceRes.data || []).reduce(
        (sum, item: any) => sum + Number(item.entry_fee || 0),
        0
      );
      const subsSum = (subsRes.data || []).reduce(
        (sum, item: any) => sum + Number(item.price || 0),
        0
      );

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
  }, [timeframe, getDateRange, isAdmin]);

  // Initial Load
  useEffect(() => {
    fetchGoalsConfig();
    fetchRevenue();
  }, [fetchGoalsConfig, fetchRevenue]);

  // Realtime live subscription to sales, attendance, subscriptions, and revenue_goals
  useEffect(() => {
    if (!isAdmin) return;

    // Generate an isolated channel name to prevent subscribe() collisions across instances
    const channelId = `revenue-goals-sync-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase.channel(channelId);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          fetchRevenue();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          fetchRevenue();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => {
          fetchRevenue();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'revenue_goals' },
        () => {
          fetchGoalsConfig();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRevenue, fetchGoalsConfig, isAdmin]);

  const currentGoalTarget = goalsConfig[timeframe] || DEFAULT_GOALS[timeframe];
  const progressPercent =
    currentGoalTarget > 0
      ? Math.min(100, Math.round((totalRevenue / currentGoalTarget) * 100))
      : 0;
  const remainingAmount = Math.max(0, currentGoalTarget - totalRevenue);
  const isGoalAchieved = totalRevenue >= currentGoalTarget;

  return {
    timeframe,
    setTimeframe,
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
    isAdmin,
    refreshRevenue: fetchRevenue,
  };
}
