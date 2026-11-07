import { addDays, endOfMonth, startOfMonth, startOfWeek, today } from '../lib/format.js';

export const PRESETS = {
  today: { label: 'Hoje', range: () => [today(), today()] },
  week: { label: 'Semana', range: () => [startOfWeek(today()), addDays(startOfWeek(today()), 6)] },
  month: { label: 'Mês', range: () => [startOfMonth(today()), endOfMonth(today())] },
  last30: { label: '30 dias', range: () => [addDays(today(), -29), today()] },
  year: { label: 'Ano', range: () => [`${today().slice(0, 4)}-01-01`, `${today().slice(0, 4)}-12-31`] },
};

export function presetRange(key) {
  const [from, to] = PRESETS[key].range();
  return { preset: key, from, to };
}

/** Filtro de período: atalhos (dia, semana, mês...) + intervalo personalizado. */
export default function PeriodFilter({ value, onChange, presets = ['today', 'week', 'month', 'last30', 'year'] }) {
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <div className="chips">
        {presets.map((k) => (
          <button key={k} type="button" className={`chip ${value.preset === k ? 'active' : ''}`} onClick={() => onChange(presetRange(k))}>
            {PRESETS[k].label}
          </button>
        ))}
        <button type="button" className={`chip ${value.preset === 'custom' ? 'active' : ''}`} onClick={() => onChange({ ...value, preset: 'custom' })}>
          Personalizado
        </button>
      </div>
      {value.preset === 'custom' && (
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input"
            type="date"
            aria-label="Data inicial"
            value={value.from}
            onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
            style={{ width: 150, minHeight: 34 }}
          />
          <span className="muted">até</span>
          <input
            className="input"
            type="date"
            aria-label="Data final"
            value={value.to}
            min={value.from}
            onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
            style={{ width: 150, minHeight: 34 }}
          />
        </div>
      )}
    </div>
  );
}
