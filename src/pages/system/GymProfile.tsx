import React from 'react';
import { Building } from 'lucide-react';

export const GymProfile: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 max-w-md mx-auto">
      <div className="p-3 bg-slate-50 dark:bg-[#13161a] border border-slate-200 dark:border-white/10 rounded-full">
        <Building className="w-8 h-8 text-slate-500 dark:text-slate-400" />
      </div>
      <div>
        <h3 className="text-lg font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100">
          Gym Profile
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-body">
          This sub-panel is prepared for consolidation. Next, we will connect this view to the respective database schema endpoints.
        </p>
      </div>
    </div>
  );
};