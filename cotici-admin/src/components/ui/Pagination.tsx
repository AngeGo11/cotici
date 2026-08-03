import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import { Button } from './Button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  loading?: boolean;
}

export function Pagination({
  page,
  pageSize,
  count,
  onPageChange,
  onPageSizeChange,
  loading = false,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
      <p className="text-xxs text-slate-500">
        {count === 0
          ? 'Aucun element'
          : `${formatNumber(from)} – ${formatNumber(to)} sur ${formatNumber(count)}`}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xxs text-slate-500">
            Par page
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-7 rounded border border-slate-300 bg-white px-1.5 text-xxs"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden />}
          >
            Precedent
          </Button>
          <span className="px-2 text-xxs tabular text-slate-500">
            {page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount || loading}
            onClick={() => onPageChange(page + 1)}
          >
            Suivant
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
