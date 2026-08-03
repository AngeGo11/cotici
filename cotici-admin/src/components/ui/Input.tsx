import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icon, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-9 w-full rounded-md border bg-white px-2.5 text-[13px] text-slate-900',
            'placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500',
            icon && 'pl-8',
            error ? 'border-red-400 focus:ring-red-300' : 'border-slate-300',
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xxs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xxs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={fieldId} className="field-label">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-md border bg-white px-2.5 py-2 text-[13px] text-slate-900',
          'placeholder:text-slate-400',
          error ? 'border-red-400' : 'border-slate-300',
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xxs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xxs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});
