import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pad, today } from '../lib/format.js';
import { WEEKDAYS_SHORT } from '../lib/constants.js';
import { Spinner } from './ui.jsx';

/** Calendário mensal que destaca os dias com horários disponíveis. */
export default function MiniCalendar({ month, onMonthChange, availability = {}, selected, onSelect, loading, minMonth }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = first.getDay();
  const t = today();
  const title = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    onMonthChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${pad(d)}`;
    const info = availability[date];
    const available = !!info?.available;
    cells.push(
      <button
        key={date}
        type="button"
        className={`minical-day ${available ? 'available' : ''} ${selected === date ? 'selected' : ''} ${date === t ? 'today' : ''}`}
        disabled={!available}
        title={available ? `${info.count} horário(s) disponível(is)` : info?.reason || ''}
        onClick={() => onSelect(date)}
        aria-label={`${d}${available ? ', disponível' : ', indisponível'}`}
      >
        {d}
      </button>,
    );
  }
  return (
    <div className="minical">
      <div className="minical-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} disabled={minMonth && month <= minMonth} aria-label="Mês anterior">
          <ChevronLeft />
        </button>
        <div className="row">
          <span className="title">{title}</span>
          {loading && <Spinner />}
        </div>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Próximo mês">
          <ChevronRight />
        </button>
      </div>
      <div className="minical-grid">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="minical-wd">
            {w}
          </div>
        ))}
        {cells}
      </div>
    </div>
  );
}
