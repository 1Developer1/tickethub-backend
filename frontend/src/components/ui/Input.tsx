import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-secondary mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-11 px-3 rounded-lg border bg-white text-sm text-secondary',
            'placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'disabled:bg-gray-50 disabled:text-gray-400',
            error ? 'border-red-400' : 'border-gray-300',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        {!error && hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
