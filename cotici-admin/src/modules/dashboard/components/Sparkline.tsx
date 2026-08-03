import { useMemo } from 'react';
import type { TimeSeriesPoint } from '@/lib/api/types';

/** Courbe SVG legere, sans dependance de graphes. */
export function Sparkline({
  points,
  height = 48,
  className,
}: {
  points: TimeSeriesPoint[];
  height?: number;
  className?: string;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = 100 / (points.length - 1);

    return values
      .map((value, index) => {
        const x = index * step;
        const y = height - ((value - min) / span) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points, height]);

  if (!path) {
    return (
      <div
        className="flex items-center justify-center text-xxs text-slate-400"
        style={{ height }}
      >
        Donnees insuffisantes
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height, width: '100%' }}
      role="img"
      aria-label="Evolution sur la periode"
    >
      <path d={path} fill="none" stroke="#009E60" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
