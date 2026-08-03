import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizes = {
  sm: 'w-[160px]',
  md: 'w-[200px] sm:w-[220px]',
  lg: 'w-[240px] sm:w-[260px]',
};

export function PhoneFrame({ children, className = '', size = 'md' }: Props) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[2.25rem] border-[7px] border-slate-900 bg-slate-900 shadow-phone ${sizes[size]} ${className}`}
    >
      <div className="mx-auto mt-2.5 h-1.5 w-14 rounded-full bg-slate-700" />
      <div className="m-1.5 rounded-[1.65rem] bg-stone-50">{children}</div>
    </div>
  );
}
