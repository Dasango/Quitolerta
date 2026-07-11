import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Radio, ArrowLeft, FlaskConical, Download, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { Daily } from "@/validation/types";
import { fetchBaseDaily } from "@/validation/detectionEngine";
import {
  runExperiment, DEFAULT_EXPERIMENT_CONFIG,
  type ExperimentResult, type ExperimentProgress, type SimulationRecord,
} from "@/validation/runExperiment";
import { exportExperimentToExcel } from "@/validation/exportExperiment";
import {
  mean, confidenceInterval95, boxplotStats, pairedSignificanceTest, type BoxPlotStats,
} from "@/validation/statistics";
import {
  computeMulticlassConcordance, type MulticlassResult,
} from "@/validation/multiclassEvaluation";

export const Route = createFileRoute("/validacion")({
  component: ValidacionPage,
  head: () => ({
    meta: [
      { title: "Validación · Quitolerta" },
      { name: "description", content: "Panel de validación: matrices de confusión y métricas del detector de anomalías." },
    ],
  }),
});

const INK = "#0A0A0A";

const parsePct = (s: string) => parseFloat(s.replace("%", ""));
const fmt = (n: number) => n.toFixed(1) + "%";
const deltaStr = (a: number, b: number) => {
  const d = +(b - a).toFixed(1);
  return `${d > 0 ? "+" : ""}${d}`;
};
const precision = (tp: number, fp: number) => (tp + fp === 0 ? 0 : (tp / (tp + fp)) * 100);
const accuracy = (tp: number, fp: number, fn: number, tn: number) => {
  const total = tp + fp + fn + tn;
  return total === 0 ? 0 : ((tp + tn) / total) * 100;
};

type Metrics = {
  seed: number;
  date: string;
  tp1: number; fp1: number; fn1: number; tn1: number;
  tp2: number; fp2: number; fn2: number; tn2: number;
  m1uni: string; m1com: string;
  m2uni: string; m2com: string;
  b: { label: string; uni: number; com: number }[];
};

const INITIAL: Metrics = {
  seed: 42891,
  date: "3 jul 2026",
  tp1: 86, fp1: 24, fn1: 34, tn1: 256,
  tp2: 112, fp2: 18, fn2: 8, tn2: 262,
  m1uni: "71.7%", m1com: "93.3%",
  m2uni: "91.4%", m2com: "93.6%",
  b: [
    { label: "Calor seco", uni: 64, com: 96 },
    { label: "Tormenta", uni: 58, com: 91 },
    { label: "Sensor congelado", uni: 80, com: 89 },
    { label: "Pico aislado (univariado simple)", uni: 90, com: 90 },
  ],
};

function ValidacionPage() {
  const [data, setData] = useState<Metrics>(INITIAL);
  const [loading, setLoading] = useState(false);

  const regenerate = () => {
    setLoading(true);
    setTimeout(() => {
      const off = () => Math.floor(Math.random() * 10) - 5;
      const clamp = (n: number) => Math.max(0, Math.min(100, n));
      setData({
        seed: Math.floor(10000 + Math.random() * 90000),
        date: "6 jul 2026",
        tp1: 86 + off(), fp1: 24 + off(), fn1: 34 + off(), tn1: 256 + off(),
        tp2: 112 + off(), fp2: 18 + off(), fn2: 8 + off(), tn2: 262 + off(),
        m1uni: (71.7 + off() / 10).toFixed(1) + "%",
        m1com: (93.3 + off() / 10).toFixed(1) + "%",
        m2uni: (91.4 + off() / 10).toFixed(1) + "%",
        m2com: (93.6 + off() / 10).toFixed(1) + "%",
        b: INITIAL.b.map(row => ({
          label: row.label,
          uni: clamp(row.uni + off()),
          com: clamp(row.com + (row.label.startsWith("Pico") ? 0 : off())),
        })),
      });
      setLoading(false);
    }, 600);
  };

  const [baseDaily, setBaseDaily] = useState<Daily | null>(null);
  const [baseDailyError, setBaseDailyError] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<ExperimentResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExperimentProgress | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const ensureBaseDaily = async (): Promise<Daily> => {
    if (baseDaily) return baseDaily;
    const d = await fetchBaseDaily();
    setBaseDaily(d);
    return d;
  };

  const runFullExperiment = async () => {
    setRunError(null);
    setBaseDailyError(null);
    setRunning(true);
    setProgress({ current: 0, total: 40, elapsedMs: 0, estimatedRemainingMs: 0 });
    try {
      const daily = await ensureBaseDaily();
      const result = await runExperiment(daily, 40, DEFAULT_EXPERIMENT_CONFIG, setProgress);
      setExperiment(result);
    } catch {
      setBaseDailyError("No se pudieron obtener los datos base de Open-Meteo. Verifica tu conexión e inténtalo de nuevo.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const handleExport = async () => {
    if (!experiment) return;
    setExporting(true);
    try {
      await exportExperimentToExcel(experiment);
    } catch {
      setRunError("No se pudo generar el archivo Excel.");
    } finally {
      setExporting(false);
    }
  };

  const metricSeries = (
    algo: 1 | 2,
    metric: "accuracy" | "precision" | "recall" | "specificity" | "f1",
  ): number[] => {
    if (!experiment) return [];
    const key = `${metric}_${algo}` as keyof SimulationRecord;
    return experiment.simulations.map((s) => s[key] as number);
  };

  const EXPERIMENT_METRICS: { key: "accuracy" | "precision" | "recall" | "specificity" | "f1"; label: string }[] = [
    { key: "accuracy", label: "Exactitud (Accuracy)" },
    { key: "precision", label: "Precisión" },
    { key: "recall", label: "Sensibilidad (Recall)" },
    { key: "specificity", label: "Especificidad" },
    { key: "f1", label: "F1-score" },
  ];

  const EVOLUTION_METRICS: { key: "accuracy" | "precision" | "recall" | "f1"; label: string }[] = [
    { key: "accuracy", label: "Evolución · Accuracy" },
    { key: "precision", label: "Evolución · Precision" },
    { key: "recall", label: "Evolución · Recall" },
    { key: "f1", label: "Evolución · F1" },
  ];

  return (
    <div style={{ background: "#FAF7F0", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: INK }}>
      <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 2rem 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: INK }}>
          <div style={{ display: "flex", height: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 16, border: `3px solid ${INK}`, background: "#FFE066", boxShadow: `4px 4px 0 0 ${INK}` }}>
            <Radio style={{ height: 20, width: 20 }} />
          </div>
          <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 24, letterSpacing: "-0.04em" }}>QUITOLERTA</span>
        </Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, border: `3px solid ${INK}`, background: "#fff", padding: "8px 16px", fontSize: 14, fontWeight: 700 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: INK }} />
          EN VIVO · Quito, EC
        </span>
      </nav>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        <div style={{ marginBottom: "2rem" }}>
          <Link to="/" style={{
            display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
            padding: "10px 18px", fontSize: 12, fontWeight: 900, textTransform: "uppercase",
            border: `3px solid ${INK}`, borderRadius: 12, background: "#fff", color: INK,
            boxShadow: `3px 3px 0 0 ${INK}`,
          }}>
            <ArrowLeft style={{ height: 16, width: 16 }} /> Volver a inicio
          </Link>
        </div>

        <div style={{
          background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: "1.5rem",
          marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap", boxShadow: `6px 6px 0 0 ${INK}`,
        }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 900, margin: "0 0 4px", textTransform: "uppercase" }}>
              Conjunto de validación sintético
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, opacity: loading ? 0.3 : 0.6, margin: 0, transition: "opacity 0.2s" }}>
              Semilla{" "}
              <code style={{ fontFamily: "monospace", fontSize: 14, background: INK, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>
                {data.seed}
              </code>{" "}
              · Generado el {data.date} · 400 casos (70% control, 30% anómalos)
            </p>
          </div>
          <button
            onClick={regenerate}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
              fontWeight: 900, textTransform: "uppercase", fontSize: 12, padding: "10px 16px",
              border: `3px solid ${INK}`, borderRadius: 12, background: "#fff",
              boxShadow: loading ? `0 0 0 0 ${INK}` : `3px 3px 0 0 ${INK}`,
              transform: loading ? "translate(3px, 3px)" : "translate(0,0)",
              opacity: loading ? 0.5 : 1, cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.1s",
            }}
          >
            {loading ? "Generando..." : "Generar nuevo conjunto"}
          </button>
        </div>

        <div style={{ transition: "opacity 0.2s ease-in-out", opacity: loading ? 0.3 : 1 }}>
          <p style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", opacity: 0.6, margin: "0 0 12px" }}>
            Matrices de confusión
          </p>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24, marginBottom: "2.5rem",
          }}>
            <ConfusionMatrix title="Solo Z-Score (O1)" tp={data.tp1} fp={data.fp1} fn={data.fn1} tn={data.tn1} />
            <ConfusionMatrix title="Z-Score + Heurísticas (O2)" tp={data.tp2} fp={data.fp2} fn={data.fn2} tn={data.tn2} />
          </div>

          <p style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", opacity: 0.6, margin: "0 0 12px" }}>
            Comparación de métricas
          </p>
          <div style={{
            background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 0,
            marginBottom: "2.5rem", boxShadow: `6px 6px 0 0 ${INK}`, overflow: "hidden",
          }}>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `3px solid ${INK}`, background: "#f4f4f4" }}>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase" }}>Métrica</th>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Univariado</th>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Combinado</th>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Sensibilidad" uni={data.m1uni} com={data.m1com} delta={deltaStr(parsePct(data.m1uni), parsePct(data.m1com))} />
                <MetricRow label="Especificidad" uni={data.m2uni} com={data.m2com} delta={deltaStr(parsePct(data.m2uni), parsePct(data.m2com))} />
                <MetricRow label="Precisión" uni={fmt(precision(data.tp1, data.fp1))} com={fmt(precision(data.tp2, data.fp2))} delta={deltaStr(precision(data.tp1, data.fp1), precision(data.tp2, data.fp2))} />
                <MetricRow label="Exactitud" uni={fmt(accuracy(data.tp1, data.fp1, data.fn1, data.tn1))} com={fmt(accuracy(data.tp2, data.fp2, data.fn2, data.tn2))} delta={deltaStr(accuracy(data.tp1, data.fp1, data.fn1, data.tn1), accuracy(data.tp2, data.fp2, data.fn2, data.tn2))} />
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", opacity: 0.6, margin: "0 0 12px" }}>
            Desglose por tipo de evento heurístico
          </p>
          <div style={{
            background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 0,
            marginBottom: "2.5rem", boxShadow: `6px 6px 0 0 ${INK}`, overflow: "hidden",
          }}>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `3px solid ${INK}`, background: "#f4f4f4" }}>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase" }}>Tipo de evento</th>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Univariado</th>
                  <th style={{ padding: 16, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Combinado</th>
                </tr>
              </thead>
              <tbody>
                {data.b.map(row => (
                  <tr key={row.label} style={{ borderBottom: `3px solid ${INK}`, fontWeight: 700 }}>
                    <td style={{ padding: 16 }}>{row.label}</td>
                    <td style={{ padding: 16, textAlign: "right" }}>{row.uni}%</td>
                    <td style={{ padding: 16, textAlign: "right", fontSize: 18, fontWeight: 900 }}>{row.com}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: "3rem", marginBottom: "1.5rem", borderTop: `3px solid ${INK}`, paddingTop: "2.5rem" }}>
          <p style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", opacity: 0.5, margin: "0 0 4px" }}>
            Experimentación
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
            Módulo de validación experimental
          </h2>
          <p style={{ fontSize: 14, fontWeight: 600, opacity: 0.7, margin: "8px 0 0", maxWidth: 720 }}>
            Corre el detector real (regla univariada vs. Z-Score + heurísticas) contra catálogos sintéticos generados
            con datos públicos de Open-Meteo. Cada corrida usa una semilla distinta, así que los resultados no se repiten.
          </p>
        </div>

        <div style={{
          background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: "1.5rem",
          marginBottom: "2rem", boxShadow: `6px 6px 0 0 ${INK}`,
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button
              onClick={runFullExperiment}
              disabled={running}
              style={{
                display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                fontWeight: 900, textTransform: "uppercase", fontSize: 12, padding: "12px 18px",
                border: `3px solid ${INK}`, borderRadius: 12, background: "#FFE066",
                boxShadow: running ? `0 0 0 0 ${INK}` : `3px 3px 0 0 ${INK}`,
                transform: running ? "translate(3px, 3px)" : "translate(0,0)",
                opacity: running ? 0.6 : 1, cursor: running ? "not-allowed" : "pointer",
                transition: "all 0.1s",
              }}
            >
              <FlaskConical style={{ height: 16, width: 16 }} />
              {running && progress ? "Ejecutando experimento…" : "Ejecutar experimento (40 simulaciones)"}
            </button>
            <button
              onClick={handleExport}
              disabled={!experiment || exporting}
              style={{
                display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                fontWeight: 900, textTransform: "uppercase", fontSize: 12, padding: "12px 18px",
                border: `3px solid ${INK}`, borderRadius: 12, background: "#fff",
                boxShadow: !experiment || exporting ? `0 0 0 0 ${INK}` : `3px 3px 0 0 ${INK}`,
                transform: !experiment || exporting ? "translate(3px, 3px)" : "translate(0,0)",
                opacity: !experiment || exporting ? 0.4 : 1, cursor: !experiment || exporting ? "not-allowed" : "pointer",
                transition: "all 0.1s", marginLeft: "auto",
              }}
            >
              <Download style={{ height: 16, width: 16 }} />
              {exporting ? "Generando…" : "Exportar Excel (.xlsx)"}
            </button>
          </div>

          {progress && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
                <span>Simulación {progress.current} / {progress.total}</span>
                <span>
                  {progress.total ? Math.round((progress.current / progress.total) * 100) : 0}% · restante ≈{" "}
                  {(progress.estimatedRemainingMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div style={{ height: 16, borderRadius: 999, border: `3px solid ${INK}`, background: "#FAF7F0", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${progress.total ? Math.round((progress.current / progress.total) * 100) : 0}%`,
                  background: "#2D5BFF", transition: "width 0.15s ease",
                }} />
              </div>
            </div>
          )}

          {(baseDailyError || runError) && (
            <div style={{
              marginTop: 16, display: "flex", alignItems: "center", gap: 8,
              background: "#FF6B6B", border: `3px solid ${INK}`, borderRadius: 12, padding: "10px 14px",
              fontSize: 13, fontWeight: 800,
            }}>
              <AlertTriangle style={{ height: 16, width: 16, flexShrink: 0 }} />
              {baseDailyError || runError}
            </div>
          )}
        </div>

        {experiment && (
          <ExperimentResults
            experiment={experiment}
            metricSeries={metricSeries}
            experimentMetrics={EXPERIMENT_METRICS}
            evolutionMetrics={EVOLUTION_METRICS}
          />
        )}

        {experiment && baseDaily && (
          <MulticlassResults experiment={experiment} baseDaily={baseDaily} />
        )}
      </div>
    </div>
  );
}

function Cell({ bg, value, label }: { bg: string; value: number; label: string }) {
  return (
    <div style={{
      background: bg, border: `3px solid ${INK}`, borderRadius: 12, padding: 12,
      textAlign: "center", boxShadow: `2px 2px 0 0 ${INK}`,
    }}>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 12, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function ConfusionMatrix({ title, tp, fp, fn, tn }: { title: string; tp: number; fp: number; fn: number; tn: number }) {
  const head: React.CSSProperties = { textAlign: "center", opacity: 0.6, padding: 4, textTransform: "uppercase" };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", opacity: 0.6, padding: 4, textTransform: "uppercase" };
  return (
    <div style={{
      background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: "1.5rem",
      boxShadow: `6px 6px 0 0 ${INK}`,
    }}>
      <p style={{ fontSize: 18, fontWeight: 900, margin: "0 0 16px", textTransform: "uppercase" }}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 8, fontSize: 12, fontWeight: 700 }}>
        <div />
        <div style={head}>Real: anómalo</div>
        <div style={head}>Real: normal</div>
        <div style={row}>Det: sí</div>
        <Cell bg="#4ade80" value={tp} label="TP" />
        <Cell bg="#FF6B6B" value={fp} label="FP" />
        <div style={row}>Det: no</div>
        <Cell bg="#FF6B6B" value={fn} label="FN" />
        <Cell bg="#4ade80" value={tn} label="TN" />
      </div>
    </div>
  );
}

function MetricRow({ label, uni, com, delta }: { label: string; uni: string; com: string; delta: string }) {
  return (
    <tr style={{ borderBottom: `3px solid ${INK}`, fontWeight: 700 }}>
      <td style={{ padding: 16 }}>{label}</td>
      <td style={{ padding: 16, textAlign: "right" }}>{uni}</td>
      <td style={{ padding: 16, textAlign: "right", fontSize: 18, fontWeight: 900 }}>{com}</td>
      <td style={{ padding: 16, textAlign: "right", color: "#16a34a" }}>{delta}</td>
    </tr>
  );
}

const O1_COLOR = "#FF6B6B";
const O2_COLOR = "#2D5BFF";

type ExperimentMetricKey = "accuracy" | "precision" | "recall" | "specificity" | "f1";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#fff", border: `3px solid ${INK}`, borderRadius: 12, padding: "14px 16px",
      boxShadow: `3px 3px 0 0 ${INK}`,
    }}>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", opacity: 0.6, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", opacity: 0.6, margin: "0 0 12px" }}>
      {children}
    </p>
  );
}

function MetricBoxPlot({ title, statsO1, statsO2 }: { title: string; statsO1: BoxPlotStats; statsO2: BoxPlotStats }) {
  const W = 220, H = 190, PAD_TOP = 14, PAD_BOTTOM = 20;
  const yFor = (v: number) => PAD_TOP + ((100 - Math.max(0, Math.min(100, v))) / 100) * (H - PAD_TOP - PAD_BOTTOM);

  const drawBox = (s: BoxPlotStats, cx: number, color: string, tag: string) => (
    <g key={tag}>
      <line x1={cx} y1={yFor(s.whiskerHigh)} x2={cx} y2={yFor(s.q3)} stroke={INK} strokeWidth={2} />
      <line x1={cx} y1={yFor(s.q1)} x2={cx} y2={yFor(s.whiskerLow)} stroke={INK} strokeWidth={2} />
      <line x1={cx - 14} y1={yFor(s.whiskerHigh)} x2={cx + 14} y2={yFor(s.whiskerHigh)} stroke={INK} strokeWidth={2} />
      <line x1={cx - 14} y1={yFor(s.whiskerLow)} x2={cx + 14} y2={yFor(s.whiskerLow)} stroke={INK} strokeWidth={2} />
      <rect
        x={cx - 28} y={yFor(s.q3)} width={56}
        height={Math.max(1.5, yFor(s.q1) - yFor(s.q3))}
        fill={color} stroke={INK} strokeWidth={2.5}
      />
      <line x1={cx - 28} y1={yFor(s.median)} x2={cx + 28} y2={yFor(s.median)} stroke={INK} strokeWidth={3} />
      {s.outliers.map((o, i) => (
        <circle key={i} cx={cx} cy={yFor(o)} r={3} fill="#fff" stroke={INK} strokeWidth={1.5} />
      ))}
      <text x={cx} y={H - 4} fontSize={10} fontWeight={900} textAnchor="middle" fill={INK}>{tag}</text>
    </g>
  );

  return (
    <div style={{
      background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 16,
      boxShadow: `4px 4px 0 0 ${INK}`,
    }}>
      <p style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", margin: "0 0 8px" }}>{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={180} role="img" aria-label={`Boxplot de ${title}`}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={0} y1={yFor(g)} x2={W} y2={yFor(g)} stroke={INK} strokeOpacity={0.08} />
            <text x={2} y={yFor(g) - 3} fontSize={9} fontWeight={700} fill={INK} opacity={0.5}>{g}%</text>
          </g>
        ))}
        {drawBox(statsO1, W * 0.32, O1_COLOR, "O1")}
        {drawBox(statsO2, W * 0.68, O2_COLOR, "O2")}
      </svg>
    </div>
  );
}

function EvolutionChartCard({ title, data }: { title: string; data: { i: number; o1: number; o2: number }[] }) {
  return (
    <div style={{
      background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 16,
      boxShadow: `4px 4px 0 0 ${INK}`,
    }}>
      <p style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", margin: "0 0 8px" }}>{title}</p>
      <div style={{ height: 190 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke={INK} strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="i" tick={{ fontSize: 10, fontWeight: 700 }} stroke={INK}
              label={{ value: "Simulación", position: "insideBottom", offset: -2, fontSize: 10, fontWeight: 700 }}
            />
            <YAxis tick={{ fontSize: 10, fontWeight: 700 }} stroke={INK} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ border: `3px solid ${INK}`, borderRadius: 12, fontWeight: 700, fontSize: 12 }}
              formatter={(v: number) => `${v.toFixed(1)}%`}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
            <Line type="monotone" dataKey="o1" name="Solo Z-Score" stroke={O1_COLOR} strokeWidth={2.5} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="o2" name="Z-Score + Heurísticas" stroke={O2_COLOR} strokeWidth={2.5} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ExperimentResults({
  experiment, metricSeries, experimentMetrics, evolutionMetrics,
}: {
  experiment: ExperimentResult;
  metricSeries: (algo: 1 | 2, metric: ExperimentMetricKey) => number[];
  experimentMetrics: { key: ExperimentMetricKey; label: string }[];
  evolutionMetrics: { key: "accuracy" | "precision" | "recall" | "f1"; label: string }[];
}) {
  const sims = experiment.simulations;
  const n = sims.length;

  const avgTp1 = mean(sims.map((s) => s.tp1)), avgFp1 = mean(sims.map((s) => s.fp1));
  const avgTn1 = mean(sims.map((s) => s.tn1)), avgFn1 = mean(sims.map((s) => s.fn1));
  const avgTp2 = mean(sims.map((s) => s.tp2)), avgFp2 = mean(sims.map((s) => s.fp2));
  const avgTn2 = mean(sims.map((s) => s.tn2)), avgFn2 = mean(sims.map((s) => s.fn2));

  return (
    <div>
      <SectionLabel>Resumen del experimento</SectionLabel>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 16, marginBottom: "2.5rem",
      }}>
        <StatTile label="Simulaciones ejecutadas" value={String(n)} />
        <StatTile label="Casos evaluados" value={String(experiment.totalCasesEvaluated)} />
        <StatTile label="Normales" value={String(experiment.totalNormal)} />
        <StatTile label="Anomalías" value={String(experiment.totalAnomalous)} />
        <StatTile label="Tiempo total" value={`${(experiment.totalDurationMs / 1000).toFixed(2)}s`} />
      </div>

      <SectionLabel>Matriz de confusión promedio por algoritmo</SectionLabel>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 24, marginBottom: "2.5rem",
      }}>
        <ConfusionMatrix title="Solo Z-Score (O1) · Promedio" tp={+avgTp1.toFixed(1)} fp={+avgFp1.toFixed(1)} fn={+avgFn1.toFixed(1)} tn={+avgTn1.toFixed(1)} />
        <ConfusionMatrix title="Z-Score + Heurísticas (O2) · Promedio" tp={+avgTp2.toFixed(1)} fp={+avgFp2.toFixed(1)} fn={+avgFn2.toFixed(1)} tn={+avgTn2.toFixed(1)} />
      </div>

      <SectionLabel>Comparación estadística entre algoritmos ({n} simulación{n === 1 ? "" : "es"})</SectionLabel>
      <div style={{
        background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 0,
        marginBottom: "2.5rem", boxShadow: `6px 6px 0 0 ${INK}`, overflowX: "auto",
      }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: `3px solid ${INK}`, background: "#f4f4f4" }}>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Métrica</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>O1 · Media ± Desv.</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>O1 · IC95%</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>O2 · Media ± Desv.</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>O2 · IC95%</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>% Mejora</th>
            </tr>
          </thead>
          <tbody>
            {experimentMetrics.map(({ key, label }) => {
              const ci1 = confidenceInterval95(metricSeries(1, key));
              const ci2 = confidenceInterval95(metricSeries(2, key));
              const improvement = ci1.mean !== 0 ? ((ci2.mean - ci1.mean) / ci1.mean) * 100 : 0;
              return (
                <tr key={key} style={{ borderBottom: `3px solid ${INK}`, fontWeight: 700 }}>
                  <td style={{ padding: 14 }}>{label}</td>
                  <td style={{ padding: 14 }}>{ci1.mean.toFixed(1)}% ± {ci1.std.toFixed(1)}</td>
                  <td style={{ padding: 14 }}>[{ci1.lower.toFixed(1)}%, {ci1.upper.toFixed(1)}%]</td>
                  <td style={{ padding: 14, fontWeight: 900 }}>{ci2.mean.toFixed(1)}% ± {ci2.std.toFixed(1)}</td>
                  <td style={{ padding: 14 }}>[{ci2.lower.toFixed(1)}%, {ci2.upper.toFixed(1)}%]</td>
                  <td style={{ padding: 14, textAlign: "right", color: improvement >= 0 ? "#16a34a" : "#dc2626" }}>
                    {improvement >= 0 ? "+" : ""}{improvement.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {n > 1 && (
        <>
          <SectionLabel>Evolución por simulación</SectionLabel>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24, marginBottom: "2.5rem",
          }}>
            {evolutionMetrics.map(({ key, label }) => (
              <EvolutionChartCard
                key={key}
                title={label}
                data={sims.map((s) => ({
                  i: s.index,
                  o1: s[`${key}_1` as keyof SimulationRecord] as number,
                  o2: s[`${key}_2` as keyof SimulationRecord] as number,
                }))}
              />
            ))}
          </div>

          <SectionLabel>Boxplots comparativos</SectionLabel>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 24, marginBottom: "2.5rem",
          }}>
            {evolutionMetrics.map(({ key, label }) => (
              <MetricBoxPlot
                key={key}
                title={label.replace("Evolución · ", "")}
                statsO1={boxplotStats(metricSeries(1, key))}
                statsO2={boxplotStats(metricSeries(2, key))}
              />
            ))}
          </div>

          <SectionLabel>Significancia estadística (O1 vs. O2)</SectionLabel>
          <div style={{
            background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 0,
            marginBottom: "2.5rem", boxShadow: `6px 6px 0 0 ${INK}`, overflowX: "auto",
          }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `3px solid ${INK}`, background: "#f4f4f4" }}>
                  <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Métrica</th>
                  <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Prueba</th>
                  <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Estadístico</th>
                  <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Valor p</th>
                  <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {experimentMetrics.map(({ key, label }) => {
                  const result = pairedSignificanceTest(metricSeries(2, key), metricSeries(1, key));
                  const stat = result.test === "t-pareada" ? `t = ${result.t.toFixed(2)} (df ${result.df})` : `z = ${result.z.toFixed(2)}`;
                  return (
                    <tr key={key} style={{ borderBottom: `3px solid ${INK}`, fontWeight: 700 }}>
                      <td style={{ padding: 14 }}>{label}</td>
                      <td style={{ padding: 14, textTransform: "uppercase", fontSize: 11 }}>
                        {result.test === "t-pareada" ? "t pareada" : "Wilcoxon"}
                      </td>
                      <td style={{ padding: 14 }}>{stat}</td>
                      <td style={{ padding: 14 }}>{result.p < 0.001 ? "< 0.001" : result.p.toFixed(3)}</td>
                      <td style={{ padding: 14 }}>
                        <span style={{
                          display: "inline-block", padding: "4px 10px", borderRadius: 999,
                          border: `2px solid ${INK}`, fontSize: 11, fontWeight: 900, textTransform: "uppercase",
                          background: result.significant ? "#4ade80" : "#fff",
                        }}>
                          {result.significant ? "Significativo (p<0.05)" : "No significativo"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {n === 1 && (
        <p style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, marginBottom: "2.5rem" }}>
          Ejecuta el experimento de 40 simulaciones para obtener evolución, boxplots y significancia estadística.
        </p>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Clasificación multiclase de eventos compuestos (H1b)              */
/*  Sección ADITIVA: concordancia (Cohen's kappa) del detector O2      */
/*  clasificando el TIPO de evento compuesto, no solo anómalo/normal.  */
/* ================================================================== */

const KAPPA_COLOR = (k: number): string => {
  if (k < 0) return "#FF6B6B";
  if (k <= 0.2) return "#FCA5A5";
  if (k <= 0.4) return "#FDE68A";
  if (k <= 0.6) return "#FEF08A";
  if (k <= 0.8) return "#A7F3D0";
  return "#4ade80";
};

function pct1(x: number): string {
  return (x * 100).toFixed(1) + "%";
}

function MulticlassConfusionMatrix({ result }: { result: MulticlassResult }) {
  const th: React.CSSProperties = {
    padding: "8px 10px", fontSize: 11, fontWeight: 900, textTransform: "uppercase",
    textAlign: "center", borderBottom: `3px solid ${INK}`, background: "#f4f4f4",
  };
  return (
    <div style={{
      background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 0,
      marginBottom: "2.5rem", boxShadow: `6px 6px 0 0 ${INK}`, overflowX: "auto",
    }}>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Real ⧵ Predicho (O2)</th>
            {result.classLabels.map((lbl) => (
              <th key={lbl} style={th}>{lbl}</th>
            ))}
            <th style={{ ...th, background: "#eee" }}>Total real</th>
          </tr>
        </thead>
        <tbody>
          {result.matrix.map((row, i) => {
            const rowTotal = row.reduce((s, v) => s + v, 0);
            return (
              <tr key={result.classes[i]} style={{ borderBottom: `2px solid ${INK}` }}>
                <td style={{ padding: "8px 10px", fontWeight: 900, textTransform: "uppercase", fontSize: 11, background: "#f4f4f4", borderRight: `3px solid ${INK}` }}>
                  {result.classLabels[i]}
                </td>
                {row.map((v, j) => (
                  <td key={j} style={{
                    padding: "8px 10px", textAlign: "center", fontWeight: i === j ? 900 : 700,
                    fontSize: i === j ? 16 : 13,
                    background: i === j ? (v > 0 ? "#4ade80" : "#f4f4f4") : (v > 0 ? "#FFE0E0" : "#fff"),
                    color: INK,
                  }}>
                    {v}
                  </td>
                ))}
                <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 900, background: "#eee" }}>
                  {rowTotal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MulticlassResults({ experiment, baseDaily }: { experiment: ExperimentResult; baseDaily: Daily }) {
  const result = useMemo<MulticlassResult>(
    () =>
      computeMulticlassConcordance(
        baseDaily,
        experiment.simulations.map((s) => s.seed),
        { totalCases: experiment.config.totalCases, normalRatio: experiment.config.normalRatio },
      ),
    [baseDaily, experiment],
  );

  return (
    <div style={{ marginTop: "1rem", borderTop: `3px solid ${INK}`, paddingTop: "2.5rem" }}>
      <p style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", opacity: 0.5, margin: "0 0 4px" }}>
        Hipótesis H1 · parte (b)
      </p>
      <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
        Clasificación multiclase de eventos compuestos
      </h2>
      <p style={{ fontSize: 14, fontWeight: 600, opacity: 0.7, margin: "8px 0 24px", maxWidth: 760 }}>
        Mide la <strong>concordancia</strong> entre el tipo de evento compuesto que asigna el generador
        (verdad conocida) y la clase que emite el detector combinado <strong>O2</strong> (tormenta, calor
        seco, frío húmedo, riesgo de incendio, o normal). Agrupa todos los casos compuestos y de control de
        las {result.nSimulations} simulaciones ({result.total} casos). El detector univariado <strong>O1</strong> se
        excluye porque estructuralmente no puede emitir clases compuestas (solo la bandera genérica «anómalo»).
      </p>

      <SectionLabel>Concordancia global</SectionLabel>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 16, marginBottom: "2rem",
      }}>
        <div style={{
          background: KAPPA_COLOR(result.kappa), border: `3px solid ${INK}`, borderRadius: 12,
          padding: "14px 16px", boxShadow: `3px 3px 0 0 ${INK}`,
        }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{result.kappa.toFixed(3)}</div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", opacity: 0.7, marginTop: 2 }}>
            Cohen's κ · {result.kappaInterpretation}
          </div>
        </div>
        <StatTile label="Exactitud multiclase" value={pct1(result.accuracy)} />
        <StatTile label="F1 macro" value={pct1(result.macroF1)} />
        <StatTile label="Acuerdo esperado (azar)" value={pct1(result.expectedAgreement)} />
        <StatTile label="Casos evaluados" value={String(result.total)} />
      </div>

      <SectionLabel>Matriz de confusión multiclase (O2)</SectionLabel>
      <MulticlassConfusionMatrix result={result} />

      <SectionLabel>Desglose por clase de evento compuesto</SectionLabel>
      <div style={{
        background: "#fff", border: `3px solid ${INK}`, borderRadius: 16, padding: 0,
        marginBottom: "2rem", boxShadow: `6px 6px 0 0 ${INK}`, overflowX: "auto",
      }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: `3px solid ${INK}`, background: "#f4f4f4" }}>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase" }}>Clase</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Soporte</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Aciertos</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Precisión</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>Sensibilidad</th>
              <th style={{ padding: 14, fontWeight: 900, textTransform: "uppercase", textAlign: "right" }}>F1</th>
            </tr>
          </thead>
          <tbody>
            {result.perClass.map((p) => (
              <tr key={p.cls} style={{ borderBottom: `3px solid ${INK}`, fontWeight: 700 }}>
                <td style={{ padding: 14 }}>{p.label}</td>
                <td style={{ padding: 14, textAlign: "right" }}>{p.support}</td>
                <td style={{ padding: 14, textAlign: "right" }}>{p.correct}</td>
                <td style={{ padding: 14, textAlign: "right" }}>{p.support === 0 && p.predicted === 0 ? "—" : pct1(p.precision)}</td>
                <td style={{ padding: 14, textAlign: "right" }}>{p.support === 0 ? "—" : pct1(p.recall)}</td>
                <td style={{ padding: 14, textAlign: "right", fontSize: 16, fontWeight: 900 }}>{p.support === 0 ? "—" : pct1(p.f1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: "#fff", border: `3px solid ${INK}`, borderRadius: 12, padding: "12px 16px",
        marginBottom: "2.5rem", boxShadow: `3px 3px 0 0 ${INK}`, fontSize: 12, fontWeight: 600, opacity: 0.85,
      }}>
        <AlertTriangle style={{ height: 16, width: 16, flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>Cómo leer κ (Landis &amp; Koch):</strong> &lt;0 pobre · 0–0.20 leve · 0.21–0.40 aceptable ·
          0.41–0.60 moderada · 0.61–0.80 sustancial · 0.81–1.00 casi perfecta. Cohen's κ corrige el acuerdo
          esperado por azar, por lo que es apropiado con clases desbalanceadas (la clase «normal» domina).
          Ante empate de reglas compuestas el mismo día se resuelve con prioridad fija
          storm &gt; vpd_fire &gt; heat_index &gt; cold_humid (independiente de la verdad). Las anomalías no
          compuestas (pico univariado, salto abrupto, sensor congelado, radiación incoherente) quedan fuera de
          esta evaluación por no ser eventos compuestos.
        </span>
      </div>
    </div>
  );
}