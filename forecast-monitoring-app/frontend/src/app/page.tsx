"use client";

import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

dayjs.extend(utc);

type DataPoint = {
  time: string;
  actual: number;
  forecast: number;
  publishTime?: string;
  cutoffTime?: string;
  horizonHours?: number;
};

type ChartPoint = {
  time: string;
  label: string;
  actual?: number;
  [key: string]: string | number | undefined;
};

type TimeDisplayMode = "local" | "utc";

type QualityMetric = {
  horizon: number;
  points: number;
  mae: number;
  rmse: number;
  bias: number;
  p99: number;
};

const HORIZON_OPTIONS = [0, 4, 8, 12, 24, 36, 48];
const FORECAST_COLORS: Record<number, string> = {
  0: "#0891B2",
  4: "#F97316",
  8: "#16A34A",
  12: "#7C3AED",
  24: "#0EA5A8",
  36: "#D97706",
  48: "#BE185D",
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function defaultRange(hoursBack = 12) {
  const end = dayjs().utc().startOf("hour").subtract(1, "hour");
  const start = end.subtract(hoursBack, "hour");
  return {
    startInput: start.local().format("YYYY-MM-DDTHH:mm"),
    endInput: end.local().format("YYYY-MM-DDTHH:mm"),
  };
}

function applyPreset(hoursBack: number) {
  return defaultRange(hoursBack);
}

function toCsv(rows: Array<Record<string, string | number | undefined>>): string {
  if (rows.length === 0) {
    return "";
  }
  const headers = Array.from(rows.reduce((acc, row) => {
    Object.keys(row).forEach((key) => acc.add(key));
    return acc;
  }, new Set<string>()));
  const escapeValue = (value: string | number | undefined) => {
    if (value === undefined || value === null) {
      return "";
    }
    const text = String(value).replaceAll("\"", "\"\"");
    return `\"${text}\"`;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeValue(row[header])).join(","));
  }
  return lines.join("\n");
}

function metricFromRows(horizon: number, rows: DataPoint[]): QualityMetric {
  if (rows.length === 0) {
    return { horizon, points: 0, mae: 0, rmse: 0, bias: 0, p99: 0 };
  }
  const errors = rows.map((row) => row.forecast - row.actual);
  const absErrors = errors.map((err) => Math.abs(err));
  const mae = absErrors.reduce((sum, value) => sum + value, 0) / absErrors.length;
  const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length);
  const bias = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const sortedAbs = [...absErrors].sort((a, b) => a - b);
  const p99Index = Math.min(sortedAbs.length - 1, Math.floor(0.99 * sortedAbs.length));
  const p99 = sortedAbs[p99Index] ?? 0;
  return {
    horizon,
    points: rows.length,
    mae,
    rmse,
    bias,
    p99,
  };
}

function formatTime(value: string, mode: TimeDisplayMode): string {
  return mode === "utc"
    ? dayjs.utc(value).format("MMM D, HH:mm [UTC]")
    : dayjs.utc(value).local().format("MMM D, HH:mm");
}

function FocusTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-sm">
      <p className="text-xs font-semibold text-[var(--color-text-primary)]">{label}</p>
      <div className="mt-2 flex flex-col gap-1 text-xs">
        {payload.map((entry) => (
          <p key={entry.name} className="text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text-primary)]">{entry.name}:</span>{" "}
            {Number(entry.value ?? 0).toFixed(0)} MW
          </p>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const defaults = useMemo(() => defaultRange(), []);
  const [startInput, setStartInput] = useState(defaults.startInput);
  const [endInput, setEndInput] = useState(defaults.endInput);
  const [selectedHorizons, setSelectedHorizons] = useState<number[]>([4, 24]);
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("local");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowsByHorizon, setRowsByHorizon] = useState<Record<number, DataPoint[]>>({});
  const [selectedExplainTime, setSelectedExplainTime] = useState<string>("");
  const [selectedExplainHorizon, setSelectedExplainHorizon] = useState<number>(4);
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);

  const sortedHorizons = useMemo(
    () => [...selectedHorizons].sort((a, b) => a - b),
    [selectedHorizons],
  );

  const chartData = useMemo<ChartPoint[]>(() => {
    const allTimes = new Set<string>();
    for (const horizon of sortedHorizons) {
      (rowsByHorizon[horizon] ?? []).forEach((row) => allTimes.add(row.time));
    }
    const orderedTimes = Array.from(allTimes).sort((a, b) => dayjs.utc(a).valueOf() - dayjs.utc(b).valueOf());
    return orderedTimes.map((time) => {
      const point: ChartPoint = {
        time,
        label: formatTime(time, timeDisplayMode),
      };
      for (const horizon of sortedHorizons) {
        const row = (rowsByHorizon[horizon] ?? []).find((item) => item.time === time);
        if (row) {
          point.actual = row.actual;
          point[`forecast_${horizon}`] = row.forecast;
        }
      }
      return point;
    });
  }, [rowsByHorizon, sortedHorizons, timeDisplayMode]);

  const qualityMetrics = useMemo(() => {
    return sortedHorizons.map((horizon) => metricFromRows(horizon, rowsByHorizon[horizon] ?? []));
  }, [rowsByHorizon, sortedHorizons]);

  const explainTimes = useMemo(() => {
    const chosen = rowsByHorizon[selectedExplainHorizon] ?? [];
    return chosen.map((item) => item.time);
  }, [rowsByHorizon, selectedExplainHorizon]);

  const explainRecord = useMemo(() => {
    if (!selectedExplainTime) {
      return null;
    }
    return (rowsByHorizon[selectedExplainHorizon] ?? []).find((item) => item.time === selectedExplainTime) ?? null;
  }, [rowsByHorizon, selectedExplainHorizon, selectedExplainTime]);

  const totalPoints = useMemo(() => {
    return sortedHorizons.reduce((sum, horizon) => sum + (rowsByHorizon[horizon]?.length ?? 0), 0);
  }, [rowsByHorizon, sortedHorizons]);

  const primaryHorizon = sortedHorizons[0] ?? 4;

  async function fetchData() {
    const start = dayjs(startInput);
    const end = dayjs(endInput);

    if (!start.isValid() || !end.isValid()) {
      setError("Please enter valid start and end datetimes.");
      return;
    }
    if (!end.isAfter(start)) {
      setError("End datetime must be after start datetime.");
      return;
    }
    if (selectedHorizons.length === 0) {
      setError("Select at least one forecast horizon.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const requests = sortedHorizons.map(async (horizon) => {
        const response = await axios.get<DataPoint[]>(`${API_BASE_URL}/data`, {
          params: {
            start: start.utc().toISOString(),
            end: end.utc().toISOString(),
            horizon,
            includeMeta: true,
          },
        });
        return { horizon, rows: response.data };
      });

      const responses = await Promise.all(requests);
      const next: Record<number, DataPoint[]> = {};
      for (const result of responses) {
        next[result.horizon] = result.rows;
      }
      setRowsByHorizon(next);

      const explainHorizon = next[selectedExplainHorizon]?.length ? selectedExplainHorizon : primaryHorizon;
      const firstTime = next[explainHorizon]?.[0]?.time ?? "";
      setSelectedExplainHorizon(explainHorizon);
      setSelectedExplainTime(firstTime);

      const nonEmpty = Object.values(next).some((rows) => rows.length > 0);
      if (!nonEmpty) {
        setError("No data returned for this range. Try a shorter range or lower horizon.");
      }
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        const detail = requestError.response?.data?.detail;
        setError(detail ? String(detail) : "Unable to load data from backend API.");
      } else {
        setError("Unexpected error while loading data.");
      }
      setRowsByHorizon({});
    } finally {
      setLoading(false);
    }
  }

  function toggleHorizon(horizon: number) {
    setSelectedHorizons((current) => {
      if (current.includes(horizon)) {
        return current.filter((item) => item !== horizon);
      }
      return [...current, horizon].sort((a, b) => a - b);
    });
  }

  function applyRangePreset(hoursBack: number) {
    const preset = applyPreset(hoursBack);
    setStartInput(preset.startInput);
    setEndInput(preset.endInput);
  }

  function exportCurrentCsv() {
    const exportRows: Array<Record<string, string | number | undefined>> = [];
    for (const horizon of sortedHorizons) {
      for (const row of rowsByHorizon[horizon] ?? []) {
        exportRows.push({
          time: row.time,
          horizon,
          actual: row.actual,
          forecast: row.forecast,
          publishTime: row.publishTime,
          cutoffTime: row.cutoffTime,
          error: row.forecast - row.actual,
          absError: Math.abs(row.forecast - row.actual),
        });
      }
    }
    const csvText = toCsv(exportRows);
    if (!csvText) {
      setError("No rows to export. Load data first.");
      return;
    }
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = dayjs().format("YYYYMMDD_HHmmss");
    a.href = url;
    a.download = `forecast_export_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    fetchData();
    // Run once on initial render for a quick default chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(155deg,#e8f1ff_0%,#f4f7fc_40%,#f7fbff_100%)] text-[var(--color-text-primary)]">
      <div className="pointer-events-none absolute -left-24 top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,#93c5fd_0%,rgba(147,197,253,0)_72%)]" />
      <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,#c4b5fd_0%,rgba(196,181,253,0)_68%)]" />
      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 pb-12 sm:gap-4 sm:p-4 lg:p-6">
        <header className="glass-panel neo-card soft-glow rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            Forecast Monitoring
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
            Wind Actuals vs Forecast Explorer
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)] sm:text-base">
            Compare observed generation with horizon-filtered forecasts from BMRS. Use comparison mode, quality scorecards, explainability details, and CSV export.
          </p>
        </header>

        <section className="glass-panel neo-card sticky top-0 z-20 grid grid-cols-1 gap-3 rounded-2xl p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Start DateTime</span>
            <input
              aria-label="Start datetime"
              type="datetime-local"
              value={startInput}
              onChange={(event) => setStartInput(event.target.value)}
              className="neo-inset rounded-lg border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">End DateTime</span>
            <input
              aria-label="End datetime"
              type="datetime-local"
              value={endInput}
              onChange={(event) => setEndInput(event.target.value)}
              className="neo-inset rounded-lg border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Time Display</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-label="Display local time"
                onClick={() => setTimeDisplayMode("local")}
                className={`rounded-lg border px-3 py-2 text-sm transition focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${timeDisplayMode === "local" ? "soft-glow border-[var(--color-brand-strong)] bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_100%)] text-white" : "neo-inset border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] text-[var(--color-text-secondary)]"}`}
              >
                Local
              </button>
              <button
                type="button"
                aria-label="Display UTC time"
                onClick={() => setTimeDisplayMode("utc")}
                className={`rounded-lg border px-3 py-2 text-sm transition focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${timeDisplayMode === "utc" ? "soft-glow border-[var(--color-brand-strong)] bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_100%)] text-white" : "neo-inset border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] text-[var(--color-text-secondary)]"}`}
              >
                UTC
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button type="button" aria-label="Preset last 24 hours" onClick={() => applyRangePreset(24)} className="neo-inset rounded-lg border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] px-2 py-1 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]">24h</button>
              <button type="button" aria-label="Preset last 7 days" onClick={() => applyRangePreset(24 * 7)} className="neo-inset rounded-lg border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] px-2 py-1 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]">7d</button>
              <button type="button" aria-label="Preset last 30 days" onClick={() => applyRangePreset(24 * 30)} className="neo-inset rounded-lg border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] px-2 py-1 transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]">30d</button>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:col-span-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Horizon Comparison</span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {HORIZON_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Toggle horizon ${option} hours`}
                  aria-pressed={selectedHorizons.includes(option)}
                  onClick={() => toggleHorizon(option)}
                  className={`rounded-full border px-3 py-1 text-xs transition focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${selectedHorizons.includes(option) ? "soft-glow border-[var(--color-brand-strong)] bg-[linear-gradient(140deg,#dbeafe_0%,#bfdbfe_100%)] text-[var(--color-brand-strong)]" : "neo-inset border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] text-[var(--color-text-secondary)] hover:brightness-95"}`}
                >
                  {option}h
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2 lg:col-span-5 lg:justify-end">
            <button
              type="button"
              aria-label="Refresh data"
              onClick={fetchData}
              disabled={loading}
              className="soft-glow rounded-lg bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_55%,#3b82f6_100%)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh Data"}
            </button>
            <button
              type="button"
              aria-label="Export data as CSV"
              onClick={exportCurrentCsv}
              className="neo-inset rounded-lg border border-[var(--color-border-strong)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            >
              Export CSV
            </button>
          </div>
        </section>

        <section className="glass-panel neo-card rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Generation Trend (Comparison Mode)</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Points: {chartData.length}</p>
          </div>

          {loading ? (
              <div className="grid h-[360px] gap-3 rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,#f7fbff_0%,#eef4ff_100%)] p-4">
                <div className="shimmer h-4 w-1/3 rounded" />
                <div className="shimmer h-full rounded" />
                <div className="shimmer h-4 w-1/2 rounded" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 text-center text-sm text-[var(--color-text-secondary)]">
              No chart data available. Try a shorter range or fewer horizons.
            </div>
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#E5E7EB" />
                  <XAxis dataKey="label" minTickGap={36} tick={{ fontSize: 12, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} width={52} />
                  <Tooltip content={<FocusTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="#1D4ED8"
                    strokeWidth={3.4}
                    strokeOpacity={hoveredSeries && hoveredSeries !== "actual" ? 0.6 : 1}
                    dot={false}
                    onMouseEnter={() => setHoveredSeries("actual")}
                    onMouseLeave={() => setHoveredSeries(null)}
                  />
                  {sortedHorizons.map((horizon) => {
                    const seriesKey = `forecast_${horizon}`;
                    const isActive = hoveredSeries === null || hoveredSeries === seriesKey;
                    return (
                      <Line
                        key={horizon}
                        type="monotone"
                        dataKey={seriesKey}
                        name={`Forecast ${horizon}h`}
                        stroke={FORECAST_COLORS[horizon]}
                        strokeWidth={2.1}
                        strokeOpacity={isActive ? 1 : 0.45}
                        dot={false}
                        onMouseEnter={() => setHoveredSeries(seriesKey)}
                        onMouseLeave={() => setHoveredSeries(null)}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-sm text-[#991B1B]">
              {error} Try reducing range or selecting fewer horizons.
            </p>
          )}
        </section>

        <section className="glass-panel neo-card rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Forecast Quality Scorecard</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Total rows: {totalPoints}</p>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6ff_100%)] p-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="shimmer h-8 rounded" />
                ))}
              </div>
            ) : qualityMetrics.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                No scorecard rows yet. Fetch data to populate quality metrics.
              </p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-secondary)]">
                    <th className="px-2 py-2">Horizon</th>
                    <th className="px-2 py-2 text-right">Points</th>
                    <th className="px-2 py-2 text-right text-[var(--color-text-primary)]">MAE</th>
                    <th className="px-2 py-2 text-right text-[var(--color-text-primary)]">RMSE</th>
                    <th className="px-2 py-2 text-right">Bias</th>
                    <th className="px-2 py-2 text-right">P99</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityMetrics.map((metric, idx) => (
                    <tr
                      key={metric.horizon}
                      className={`border-b border-[var(--color-border)]/70 ${idx % 2 === 0 ? "bg-white" : "bg-[var(--color-surface-subtle)]/70"}`}
                    >
                      <td className="px-2 py-2 font-semibold">{metric.horizon}h</td>
                      <td className="px-2 py-2 text-right tabular-nums">{metric.points}</td>
                      <td className="px-2 py-2 text-right font-semibold text-[var(--color-text-primary)] tabular-nums">{metric.mae.toFixed(1)} MW</td>
                      <td className="px-2 py-2 text-right font-semibold text-[var(--color-text-primary)] tabular-nums">{metric.rmse.toFixed(1)} MW</td>
                      <td className="px-2 py-2 text-right tabular-nums">{metric.bias.toFixed(1)} MW</td>
                      <td className="px-2 py-2 text-right tabular-nums">{metric.p99.toFixed(1)} MW</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="glass-panel neo-card rounded-2xl p-4 sm:p-5">
          <h2 className="mb-3 text-xl font-semibold">Explainability Panel</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Horizon</span>
              <select
                aria-label="Select explainability horizon"
                value={selectedExplainHorizon}
                onChange={(event) => {
                  const nextHorizon = Number(event.target.value);
                  setSelectedExplainHorizon(nextHorizon);
                  setSelectedExplainTime((rowsByHorizon[nextHorizon] ?? [])[0]?.time ?? "");
                }}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                {sortedHorizons.map((horizon) => (
                  <option key={horizon} value={horizon}>{horizon}h</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Target Time</span>
              <select
                aria-label="Select target time for explainability"
                value={selectedExplainTime}
                onChange={(event) => setSelectedExplainTime(event.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
              >
                {explainTimes.map((time) => (
                  <option key={time} value={time}>{formatTime(time, timeDisplayMode)}</option>
                ))}
              </select>
            </label>
          </div>

          {explainRecord ? (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6ff_100%)] p-3 sm:grid-cols-2 lg:grid-cols-3">
              <p className="neo-inset rounded-md border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm"><strong className="block text-xs text-[var(--color-text-secondary)]">Target Time</strong><span className="font-mono text-[13px]">{formatTime(explainRecord.time, timeDisplayMode)}</span></p>
              <p className="neo-inset rounded-md border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm"><strong className="block text-xs text-[var(--color-text-secondary)]">Actual</strong><span className="font-mono text-[13px]">{explainRecord.actual.toFixed(1)} MW</span></p>
              <p className="neo-inset rounded-md border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm"><strong className="block text-xs text-[var(--color-text-secondary)]">Forecast</strong><span className="font-mono text-[13px]">{explainRecord.forecast.toFixed(1)} MW</span></p>
              <p className="neo-inset rounded-md border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm"><strong className="block text-xs text-[var(--color-text-secondary)]">Cutoff Time</strong><span className="font-mono text-[13px]">{explainRecord.cutoffTime ? formatTime(explainRecord.cutoffTime, timeDisplayMode) : "N/A"}</span></p>
              <p className="neo-inset rounded-md border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm"><strong className="block text-xs text-[var(--color-text-secondary)]">Selected Publish Time</strong><span className="font-mono text-[13px]">{explainRecord.publishTime ? formatTime(explainRecord.publishTime, timeDisplayMode) : "N/A"}</span></p>
              <p className="neo-inset rounded-md border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2 text-sm"><strong className="block text-xs text-[var(--color-text-secondary)]">Selection Reason</strong><span className="font-mono text-[13px]">Latest publish time at or before cutoff for this target interval.</span></p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
              No explainability row selected. Fetch data, then choose a horizon and target time.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
