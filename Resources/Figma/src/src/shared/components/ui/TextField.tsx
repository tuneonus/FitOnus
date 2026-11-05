import React, { useId } from 'react';
import { cn } from '../../utils/cn';

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  trailing?: React.ReactNode;
  suffix?: string;
  hideLabel?: boolean;
};

export function TextField({
  label,
  error,
  hint,
  trailing,
  suffix,
  hideLabel,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-msg`;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={cn('text-[13px] font-medium text-ink', hideLabel && 'sr-only')}>
        
        {label}
      </label>
      <div
        className={cn(
          'flex h-[52px] items-center gap-2 rounded-2xl border bg-surface px-4 transition-colors duration-150 focus-within:border-ink',
          !hideLabel && 'mt-1.5',
          error ? 'border-bad' : 'border-line'
        )}>
        
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted/70"
          {...rest} />
        
        {suffix && <span className="text-[14px] text-muted">{suffix}</span>}
        {trailing}
      </div>
      {error ?
      <p id={messageId} role="alert" className="mt-1.5 text-[12.5px] text-bad">
          {error}
        </p> :

      hint &&
      <p id={messageId} className="mt-1.5 text-[12.5px] text-muted">
            {hint}
          </p>

      }
    </div>);

}