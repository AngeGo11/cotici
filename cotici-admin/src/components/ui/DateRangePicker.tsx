import { CalendarDays } from 'lucide-react';
import { Button } from './Button';

export interface DateRange {
  /** Format ISO court "AAAA-MM-JJ" (compatible input type=date et DRF). */
  from: string;
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: '', to: '' };

function shiftDays(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return { from: format(from), to: format(to) };
}

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Aujourd'hui", range: () => shiftDays(0) },
  { label: '7 jours', range: () => shiftDays(7) },
  { label: '30 jours', range: () => shiftDays(30) },
  { label: '90 jours', range: () => shiftDays(90) },
];

export function DateRangePicker({
  value,
  onChange,
  label = 'Periode',
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <span className="field-label">{label}</span>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xxs text-slate-900"
            aria-label="Date de debut"
          />
          <span className="text-xxs text-slate-400">au</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xxs text-slate-900"
            aria-label="Date de fin"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="ghost"
            onClick={() => onChange(preset.range())}
          >
            {preset.label}
          </Button>
        ))}
        {(value.from || value.to) && (
          <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_RANGE)}>
            Effacer
          </Button>
        )}
      </div>
    </div>
  );
}
