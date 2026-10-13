// src/components/ui/Button.tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'google';
  loading?: boolean;
  loadingLabel?: string;
  loadingSubtitle?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  loading,
  loadingLabel = 'TRANSMITTING...',
  loadingSubtitle,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyle =
    'w-full py-3.5 rounded-xl transition-all duration-200 cursor-pointer select-none flex items-center justify-center gap-2';

  const isDisabled = loading || disabled;

  const variantStyles = {
    primary: isDisabled
      ? 'font-heading text-slate-400 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 cursor-not-allowed'
      : 'font-heading text-white bg-[#1b365d] hover:bg-[#112246] dark:bg-[#bf0202] dark:hover:bg-[#9c0202]',

    danger: isDisabled
      ? 'font-heading text-slate-400 dark:text-zinc-500 bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 cursor-not-allowed'
      : 'font-heading text-white bg-red-600 hover:bg-red-700 border border-red-600',

    secondary: isDisabled
      ? 'font-body font-bold text-xs uppercase tracking-widest text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 cursor-not-allowed'
      : 'font-body font-bold text-xs uppercase tracking-widest text-slate-700 dark:text-slate-200 bg-slate-200/90 dark:bg-[#1a1a1a] border border-slate-300 dark:border-white/10 hover:bg-slate-300 dark:hover:bg-neutral-800',

    google: 'google-login-btn font-heading text-xs',
  };

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center">
          {loadingSubtitle ? (
            <>
              <span className="animate-pulse tracking-widest text-xs font-heading">
                {loadingLabel}
              </span>
              <span className="text-[8px] opacity-75 lowercase tracking-wider font-sans mt-0.5">
                {loadingSubtitle}
              </span>
            </>
          ) : (
            <Loader2 className="w-5 h-5 animate-spin" />
          )}
        </div>
      ) : (
        children
      )}
    </button>
  );
};
