import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export interface PaginationState {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Remet a la premiere page (a appeler quand un filtre change). */
  reset: () => void;
  /** Calcule le nombre total de pages a partir du "count" DRF. */
  pageCount: (count: number) => number;
  /** Bornes affichables : "1 – 25 sur 312". */
  range: (count: number) => { from: number; to: number };
}

export function usePagination(initialPageSize = DEFAULT_PAGE_SIZE): PaginationState {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const reset = useCallback(() => setPage(1), []);

  const pageCount = useCallback(
    (count: number) => Math.max(1, Math.ceil(count / pageSize)),
    [pageSize],
  );

  const range = useCallback(
    (count: number) => {
      if (count === 0) return { from: 0, to: 0 };
      const from = (page - 1) * pageSize + 1;
      const to = Math.min(page * pageSize, count);
      return { from, to };
    },
    [page, pageSize],
  );

  return useMemo(
    () => ({ page, pageSize, setPage, setPageSize, reset, pageCount, range }),
    [page, pageSize, setPageSize, reset, pageCount, range],
  );
}
