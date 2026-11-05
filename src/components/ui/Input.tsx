//src/components/ui/Input.tsx
import React, { forwardRef, useState, useEffect } from 'react';

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
  (
    {
      label,
      icon,
      error,
      shake,
      touched,
      isPopulated: controlledIsPopulated,
      rightElement,
      className = '',
      onChange,
      autoCapitalize = 'none',
      autoCorrect = 'off',
      spellCheck = false,
      ...props
    },
    ref
  ) => {
    const [internalPopulated, setInternalPopulated] = useState<boolean>(() => {
      if (props.value !== undefined) {
        return String(props.value).length > 0;
      }
      if (props.defaultValue !== undefined) {
        return String(props.defaultValue).length > 0;
      }
      return false;
    });

    useEffect(() => {
      if (props.value !== undefined) {
        setInternalPopulated(String(props.value).length > 0);
      }
    }, [props.value]);

    const isPopulated =
      controlledIsPopulated !== undefined
        ? controlledIsPopulated
        : internalPopulated;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (controlledIsPopulated === undefined) {
        setInternalPopulated(e.target.value.length > 0);
      }
      onChange?.(e);
    };

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
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          spellCheck={spellCheck}
          onChange={handleChange}
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
