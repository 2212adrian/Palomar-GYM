//src/components/ui/Input.tsx
import React, { forwardRef, useState } from 'react';

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
    const [uncontrolledPopulated, setUncontrolledPopulated] = useState<boolean>(
      () =>
        props.defaultValue !== undefined &&
        String(props.defaultValue).length > 0
    );

    const isControlled = props.value !== undefined;
    const isPopulated =
      controlledIsPopulated !== undefined
        ? controlledIsPopulated
        : isControlled
          ? String(props.value).length > 0
          : uncontrolledPopulated;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled && controlledIsPopulated === undefined) {
        setUncontrolledPopulated(e.target.value.length > 0);
      }
      onChange?.(e);
    };

    const getBorderClass = () => {
      if (error || shake) {
        return 'border-red-500 focus:border-red-500 focus:ring-red-500/20';
      }
      if (isPopulated && !error) {
        return 'border-emerald-500 focus:border-(--color-primary-light) focus:ring-(--color-primary)/20';
      }
      if (touched && !isPopulated) {
        return 'border-amber-500 focus:border-(--color-primary-light) focus:ring-(--color-primary)/20';
      }
      return 'border-slate-300 dark:border-white/10 focus:border-(--color-primary-light) focus:ring-(--color-primary)/20';
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
