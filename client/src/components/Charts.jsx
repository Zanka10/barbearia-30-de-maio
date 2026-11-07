// Gráficos (Chart.js) no tema escuro. Séries únicas em prata (identidade preto + cromado): sem legenda, eixo único, tooltip no hover.
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { money } from '../lib/format.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Inter', system-ui, sans-serif";
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = '#8f8a82';

const ACCENT = '#d6d9de';
const GRID = 'rgba(255,255,255,0.06)';

const tooltip = (fmt) => ({
  backgroundColor: '#1c1c20',
  borderColor: '#3a3a41',
  borderWidth: 1,
  titleColor: '#f2efe9',
  bodyColor: '#c9c4bb',
  padding: 10,
  displayColors: false,
  callbacks: { label: (ctx) => fmt(ctx.parsed[ctx.chart.options.indexAxis === 'y' ? 'x' : 'y']) },
});

const baseOptions = (fmt, { horizontal = false, tickFmt } = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: horizontal ? 'y' : 'x',
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false }, tooltip: tooltip(fmt) },
  scales: {
    [horizontal ? 'y' : 'x']: { grid: { display: false }, border: { color: '#3a3a41' }, ticks: { autoSkip: true, maxRotation: 0, color: '#c9c4bb' } },
    [horizontal ? 'x' : 'y']: {
      beginAtZero: true,
      grid: { color: GRID },
      border: { display: false },
      ticks: { precision: 0, callback: tickFmt || ((v) => v), maxTicksLimit: 6 },
    },
  },
});

export function BarChart({ labels, values, format = (v) => v, tickFormat, horizontal = false, height }) {
  return (
    <div className="chart-box" style={height ? { height } : undefined}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: ACCENT,
              hoverBackgroundColor: '#ffffff',
              borderRadius: 4,
              borderSkipped: 'start',
              maxBarThickness: horizontal ? 18 : 28,
            },
          ],
        }}
        options={baseOptions(format, { horizontal, tickFmt: tickFormat })}
      />
    </div>
  );
}

export function LineChart({ labels, values, format = (v) => v, tickFormat, height }) {
  return (
    <div className="chart-box" style={height ? { height } : undefined}>
      <Line
        data={{
          labels,
          datasets: [
            {
              data: values,
              borderColor: ACCENT,
              borderWidth: 2,
              backgroundColor: 'rgba(214,217,222,0.08)',
              fill: true,
              cubicInterpolationMode: 'monotone',
              pointRadius: labels.length > 40 ? 0 : 3,
              pointHoverRadius: 5,
              pointBackgroundColor: ACCENT,
              pointBorderColor: '#141416',
              pointBorderWidth: 2,
            },
          ],
        }}
        options={baseOptions(format, { tickFmt: tickFormat })}
      />
    </div>
  );
}

export const moneyTick = (v) => (v >= 100000 ? `R$ ${(v / 100000).toFixed(0)}k` : `R$ ${Math.round(v / 100)}`);
export const moneyFmt = (v) => money(v);
