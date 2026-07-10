import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Radio, ArrowLeft } from "lucide-react";
import { useState } from "react";

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