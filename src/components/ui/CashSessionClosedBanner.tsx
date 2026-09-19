// src/components/ui/CashSessionClosedBanner.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, X, ArrowRight } from 'lucide-react';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { useAuthStore } from '../../stores/authStore';

const STORAGE_KEY = 'cash_session_closed_banner_dismissed';

export const CashSessionClosedBanner: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { isSessionOpen, isInitializing } = useCashSessionStore();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
  });

  // Reset or re-evaluate dismissal when user logs out or switches
  useEffect(() => {
    if (!user) {
      setDismissed(false);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === 'true');
    }
  }, [user]);

  // Do not show if:
  // 1. Not logged in
  // 2. Cash store is still initializing
  // 3. Cash drawer session is currently OPEN
  // 4. Banner was already dismissed via X during this login session
  if (!user || isInitializing || isSessionOpen || dismissed) {
    return null;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="w-full bg-[#123c73] hover:bg-[#0e305d] dark:bg-[#153460] dark:hover:bg-[#122c53] text-white px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md transition-colors z-40 select-none text-left shrink-0 border-b border-[#0e2c54]/60"
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        <div className="p-1 bg-white/20 rounded-lg shrink-0 text-white flex items-center justify-center">
          <Info className="w-4 h-4" />
        </div>
        <div className="text-xs sm:text-sm font-semibold truncate leading-tight">
          <span className="opacity-95">
            Cash drawer session is closed. Check-in entries and Recycle Bin are currently locked.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate('/cash')}
          className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-heading font-black uppercase px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-md tracking-wider transition-colors cursor-pointer text-white"
        >
          <span>Open Session</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
          aria-label="Dismiss banner"
          title="Dismiss notice"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default CashSessionClosedBanner;
