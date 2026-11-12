import { useMemo, useState } from "react";
import { ChartNoAxesCombined, ChevronLeft, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/investment-api";
import { entryPriceBandsFor, type EntryProfile } from "./invest-report-entry-bands";
import { priceHistoryFor } from "./invest-report-price-history";
import { investorProfiles } from "./invest-report-votes";

const windows = [
  { weeks: 12, label: "12 semanas" },
  { weeks: 26, label: "26 semanas" },
  { weeks: 52, label: "Histórico completo" },
];
const bandColors: Record<EntryProfile, string> = {
  Conservador: "#d97706",
  Moderado: "#0284c7",
  Arrojado: "#0d9488",
};
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
const dateLabel = (date: string) => fullDate.format(new Date(date));
const priceLabel = (cents: number) => formatBRL(cents / 100);
const control = "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50";

export default function InvestReportPriceHistory({ ticker, reportIso }: { ticker: string; reportIso: string }) {
  const history = useMemo(() => priceHistoryFor(ticker, reportIso), [ticker, reportIso]);
  const [weeks, setWeeks] = useState(history.length);
  const [end, setEnd] = useState(history.length);
  const [selectedIndex, setSelectedIndex] = useState(history.length - 1);
  const [shown, setShown] = useState<readonly EntryProfile[]>(investorProfiles);
  const entry = entryPriceBandsFor(ticker);
  if (!entry) return null;

  const start = end - weeks;
  const points = history.slice(start, end);
  const selected = points[selectedIndex];
  const lows = [...points.map(point => point.closeCents), ...entry.bands.map(band => band.low)];
  const highs = [...points.map(point => point.closeCents), ...entry.bands.map(band => band.high)];
  const domain = [Math.floor(Math.min(...lows) / 100) * 100 - 50, Math.ceil(Math.max(...highs) / 100) * 100 + 50];

  function changeWindow(nextWeeks: number) {
    setWeeks(nextWeeks);
    setEnd(history.length);
    setSelectedIndex(nextWeeks - 1);
  }

  function moveWindow(direction: number) {
    setEnd(current => Math.min(history.length, Math.max(weeks, current + direction * Math.floor(weeks / 2))));
    setSelectedIndex(weeks - 1);
  }

  function toggleBand(profile: EntryProfile) {
    setShown(current => current.includes(profile) ? current.filter(item => item !== profile) : [...current, profile]);
  }

  return <section aria-labelledby="price-history-title" className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex items-center gap-2">
      <ChartNoAxesCombined aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-800 dark:text-emerald-300" />
      <h2 id="price-history-title" className="text-xl font-bold">Histórico de preços e faixas de entrada</h2>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">{ticker} · Série semanal fictícia criada para o gráfico, independente da amostra dos pareceres.</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="Período do gráfico" className="flex flex-wrap gap-1.5">
        {windows.map(({ weeks: size, label }) => <button key={size} type="button" aria-pressed={weeks === size}
          onClick={() => changeWindow(size)} className={`${control} ${weeks === size ? "bg-[#245e46] text-white" : "bg-background hover:bg-muted"}`}>{label}</button>)}
      </div>
      <div role="group" aria-label="Deslocar período" className="flex flex-wrap gap-1.5">
        <button type="button" disabled={start === 0} onClick={() => moveWindow(-1)} className={`${control} bg-background hover:bg-muted`}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Anterior
        </button>
        <button type="button" disabled={end === history.length} onClick={() => moveWindow(1)} className={`${control} bg-background hover:bg-muted`}>
          Próximo <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
    <div role="group" aria-label="Faixas de entrada no gráfico" className="mt-3 grid gap-2 sm:grid-cols-3">
      {entry.bands.map(({ profile, low, high }) => {
        const active = shown.includes(profile);
        return <button key={profile} type="button" aria-pressed={active} onClick={() => toggleBand(profile)}
          className={`flex min-h-12 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${active ? "" : "text-muted-foreground opacity-65"}`}>
          <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm border-2" style={{ borderColor: bandColors[profile], backgroundColor: active ? bandColors[profile] : "transparent" }} />
          <span className="min-w-0"><span className="block text-xs font-semibold">{profile}</span><span className="block text-sm tabular-nums">{priceLabel(low)} a {priceLabel(high)}</span></span>
        </button>;
      })}
    </div>
    <figure aria-label="Linha de fechamentos fictícios com faixas de entrada sombreadas" className="mt-3 min-w-0 rounded-lg border border-border bg-background px-1 pb-2 pt-3 sm:px-2">
      <figcaption className="px-2 text-xs font-medium text-muted-foreground">
        R$/ação · {dateLabel(points[0].date)} a {dateLabel(points[points.length - 1].date)}
      </figcaption>
      <div className="h-[270px] min-w-0 sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 14, left: 0, bottom: 2 }} accessibilityLayer
            onClick={state => {
              const index = state?.activeTooltipIndex;
              if (index !== undefined && points[index]) setSelectedIndex(index);
            }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={date => shortDate.format(new Date(date))} minTickGap={28} tickMargin={8}
              tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            <YAxis domain={domain} tickFormatter={priceLabel} width={64} tickLine={false} axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
            {entry.bands.filter(band => shown.includes(band.profile)).map(({ profile, low, high }) =>
              <ReferenceArea key={profile} y1={low} y2={high} fill={bandColors[profile]} fillOpacity={0.18}
                stroke={bandColors[profile]} strokeOpacity={0.35} />)}
            <Tooltip labelFormatter={dateLabel} formatter={(value: number) => [priceLabel(value), "Fechamento fictício"]}
              contentStyle={{ background: "hsl(var(--card))", color: "hsl(var(--card-foreground))", borderColor: "hsl(var(--border))", borderRadius: 8 }}
              itemStyle={{ color: "hsl(var(--card-foreground))" }} />
            <Line type="linear" dataKey="closeCents" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false}
              activeDot={{ r: 4 }} isAnimationActive={false} />
            <ReferenceDot x={selected.date} y={selected.closeCents} r={5} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-44 flex-1">
        <label htmlFor="price-history-point" className="block text-xs font-semibold text-muted-foreground">Percorrer fechamentos semanais</label>
        <input id="price-history-point" type="range" min={0} max={points.length - 1} value={selectedIndex}
          aria-valuetext={`${dateLabel(selected.date)} · ${priceLabel(selected.closeCents)}`}
          onChange={event => setSelectedIndex(Number(event.currentTarget.value))} className="h-8 w-full accent-emerald-700" />
      </div>
      <output htmlFor="price-history-point" className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums">
        <time dateTime={selected.date}>{dateLabel(selected.date)}</time> · <strong>{priceLabel(selected.closeCents)}</strong>
      </output>
    </div>
    <a href="#estrategia-de-entrada" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">Ver cálculo das faixas e condições de revisão</a>
  </section>;
}
