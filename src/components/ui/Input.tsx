//src/components/ui/Input.tsx
import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  error?: boolean;
  shake?: boolean;
  touched?: boolean;
  isPopulated?: boolean;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, error, shake, touched, isPopulated, rightElement, className = '', ...props }, ref) => {
    
    // Semantic Border Classes
    // Red = incorrect, Green = valid input, Yellow = touched empty warning, Default/Blue on focus
    const getBorderClass = () => {
      if (error || shake) {
        return 'border-red-500 focus:border-red-500 focus:ring-red-500/20';
      }
      if (isPopulated && !error) {
        return 'border-emerald-500 focus:border-blue-500 focus:ring-blue-500/20';
      }
      if (touched && !isPopulated) {
        return 'border-amber-500 focus:border-blue-500 focus:ring-blue-500/20';
      }
      return 'border-slate-300 dark:border-white/10 focus:border-blue-500 focus:ring-blue-500/20';
    };

    return (
      <div className="field-wrap">
        <input
          ref={ref}
          placeholder=" "
          className={`field-input ${getBorderClass()} ${shake ? 'shake-error' : ''} ${className}`}
          {...props}
        />
        <label className="field-label">
          {icon}
          <span>{label}</span>
        </label>
        {rightElement && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';