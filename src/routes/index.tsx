"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, CartesianGrid, Area, AreaChart, Brush,
} from "recharts";
import {
  Wind, Droplets, Thermometer, CloudRain, Sun, AlertTriangle, MapPin, Activity, Sparkles, ArrowRight, Radio, ZoomIn, Flame, Snowflake, CloudLightning, Layers, Cloud, Info, MousePointer2,
} from "lucide-react";
import { Filter, Zap, Gauge, AlertOctagon, Download } from "lucide-react";
import ExcelJS from "exceljs";
import fileSaver from "file-saver";
const { saveAs } = fileSaver;
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import quitoHero from "@/assets/FondoInvestigacion.png";
import starDeco from "@/assets/Estrella.png";

function StarDeco({ side, top = "10%", size = 260, rotate = 0 }: { side: "left" | "right"; top?: string; size?: number; rotate?: number }) {
  const pos = side === "left" ? { left: `-${Math.round(size / 2)}px` } : { right: `-${Math.round(size / 2)}px` };
  return (
    <img
      src={starDeco}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute z-0 select-none opacity-90 hidden md:block"
      style={{ ...pos, top, width: size, height: size, transform: `rotate(${rotate}deg)`, filter: "drop-shadow(4px 4px 0 rgba(0,0,0,0.15))" }}
    />
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quitolerta — Sensores Ambientales de Quito" },
      { name: "description", content: "Un año de datos del clima de Quito, Ecuador, explicados de forma simple. Descubre cuándo la temperatura, el viento, la lluvia o la humedad se salen de lo normal." },
      { property: "og:title", content: "Quitolerta — Sensores Ambientales de Quito" },
      { property: "og:description", content: "Un año de datos del clima de Quito, con avisos automáticos cuando algo sale de lo normal." },
    ],
  }),
  component: Quitolerta,
});

// ---------- Custom Cursor ----------
function CustomCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 35, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 500, damping: 35, mass: 0.5 });
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const move = (e: MouseEvent) => { x.set(e.clientX - 2); y.set(e.clientY - 2); };
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      setHover(!!t.closest("button, a, [data-cursor-hover]"));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", over);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseover", over); };
  }, [x, y]);

  return (
    <motion.div
      aria-hidden
      style={{ translateX: sx, translateY: sy }}
      className="pointer-events-none fixed left-0 top-0 z-[9999] hidden md:block"
    >
      <motion.div
        animate={{ scale: hover ? 1.18 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <MousePointer2 className="h-8 w-8" fill={COLORS.blue} stroke={COLORS.ink} strokeWidth={2.5} />
      </motion.div>
    </motion.div>
  );
}

// ---------- Data ----------
type Daily = {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  temperature_2m_mean: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  shortwave_radiation_sum: number[];
  relative_humidity_2m_mean?: number[];
};
type Current = {
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  precipitation: number;
  weather_code?: number;
};
type Hourly = {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  weather_code: number[];
};

// FUENTES DIFERENCIADAS (requisito del documento):
//   • Archive API  (archive-api.open-meteo.com/v1/archive) → línea base
//     histórica de 365 días. Este reanálisis tiene un retraso inherente de
//     ~2 días, por eso `end` se fija a hoy-2. Alimenta el panel, el motor de
//     detección de anomalías y las estadísticas (μ, σ, z-scores).
//   • Forecast API (api.open-meteo.com/v1/forecast, campo `current`) → lectura
//     en TIEMPO REAL. Alimenta el resumen "Hoy en Quito" (data.current): sin
//     retraso de 2 días. Las alertas por regla de "Hoy en Quito" siguen
//     calculándose sobre el último día del histórico porque requieren la serie
//     diaria completa, que solo provee la Archive API.
// Ambas se consultan en paralelo y se mantienen separadas: la Forecast API NO
// altera la construcción de la línea base de 365 días.
async function fetchData(): Promise<{ daily: Daily; current: Current; hourly: Hourly | null }> {
  const end = new Date();
  end.setDate(end.getDate() - 2); // archive lags ~2 days
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const archive = `https://archive-api.open-meteo.com/v1/archive?latitude=-0.1807&longitude=-78.4678&start_date=${fmt(start)}&end_date=${fmt(end)}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,shortwave_radiation_sum&hourly=relative_humidity_2m&timezone=America%2FGuayaquil`;
  // weather_code (actual + por hora) y precipitation_probability por hora se
  // agregan solo para alimentar la animación del mapa y el resumen "Pronóstico
  // por horas" (Brecha: mapa con animación + panel-resumen). No afectan la
  // línea base de 365 días ni el motor de detección de anomalías.
  const live = `https://api.open-meteo.com/v1/forecast?latitude=-0.1807&longitude=-78.4678&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=America%2FGuayaquil`;

  const [a, l] = await Promise.all([fetch(archive).then(r => r.json()), fetch(live).then(r => r.json())]);
  // Aggregate hourly humidity to daily means
  const daily: Daily = a.daily;
  if (a.hourly?.relative_humidity_2m && a.hourly?.time) {
    const byDay = new Map<string, number[]>();
    a.hourly.time.forEach((t: string, i: number) => {
      const d = t.slice(0, 10);
      const v = a.hourly.relative_humidity_2m[i];
      if (v == null) return;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(v);
    });
    daily.relative_humidity_2m_mean = daily.time.map(d => {
      const arr = byDay.get(d);
      return arr && arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN;
    });
  }
  return { daily, current: l.current, hourly: l.hourly ?? null };
}

// Traduce el código WMO de Open-Meteo a una de las 3 animaciones del mapa.
function weatherCodeToCondition(code: number | null | undefined): "rain" | "sunny" | "cloudy" {
  if (code == null) return "cloudy";
  if (code === 0 || code === 1) return "sunny";
  if ([2, 3, 45, 48].includes(code)) return "cloudy";
  return "rain"; // lluvia, llovizna, tormenta, nieve (poco común en Quito)
}

// ---------- Anomaly detection (z-score) ----------
// Umbral |Z| ≥ 2.2: se adopta el valor de las BASES TEÓRICAS del documento de
// investigación (no el |Z| ≥ 2 que aparece en la tabla de validación de
// instrumentos). El documento es internamente inconsistente entre ambas
// secciones; se resuelve la ambigüedad a favor de las bases teóricas (2.2),
// que es más conservador y reduce falsos positivos. Mantener sincronizado con
// la regla univariada de detectAllRules() y con detectionEngine.ts.
function detectAnomalies(values: number[], times: string[], threshold = 2.2) {
  const valid = values.filter(v => v !== null && !Number.isNaN(v));
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
  const std = Math.sqrt(variance) || 1;
  const anomalies: { date: string; value: number; z: number; index: number }[] = [];
  values.forEach((v, i) => {
    if (v == null || Number.isNaN(v)) return;
    const z = (v - mean) / std;
    if (Math.abs(z) >= threshold) anomalies.push({ date: times[i], value: v, z, index: i });
  });
  return { mean, std, anomalies };
}

// ---------- UI primitives ----------
const COLORS = {
  bg: "#FAF7F0",
  ink: "#0A0A0A",
  blue: "#2D5BFF",
  yellow: "#FFE066",
  coral: "#FF6B6B",
  mint: "#6BE5C7",
  lilac: "#C9B6FF",
};

function Brick({
  children, className = "", color = "#fff", rotate = 0,
}: { children: React.ReactNode; className?: string; color?: string; rotate?: number }) {
  return (
    <div
      className={`relative rounded-[28px] border-[3px] border-black ${className}`}
      style={{
        background: color,
        boxShadow: "8px 8px 0 0 #0A0A0A",
        transform: `rotate(${rotate}deg)`,
      }}
    >
      {children}
    </div>
  );
}

function BounceButton({
  children, color = COLORS.blue, onClick, className = "",
}: { children: React.ReactNode; color?: string; onClick?: () => void; className?: string }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3, x: -3, boxShadow: "11px 11px 0 0 #0A0A0A" }}
      whileTap={{ y: 2, x: 2, boxShadow: "3px 3px 0 0 #0A0A0A" }}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
      className={`inline-flex items-center gap-2 rounded-2xl border-[3px] border-black px-6 py-3 font-black uppercase tracking-tight text-black ${className}`}
      style={{ background: color, boxShadow: "6px 6px 0 0 #0A0A0A" }}
    >
      {children}
    </motion.button>
  );
}

// ---------- Tooltip informativo (hover) ----------
// Envuelve cualquier elemento y muestra una explicación breve en lenguaje
// simple al pasar el cursor (o al hacer foco, para accesibilidad por teclado).
function InfoTip({
  text, color, children, side = "top",
}: { text: string; color?: string; children: React.ReactNode; side?: "top" | "bottom" }) {
  return (
    <span tabIndex={0} className="group/tip relative inline-flex outline-none">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-xl border-[3px] border-black bg-white p-2.5 text-left text-[11px] font-bold normal-case leading-snug text-black opacity-0 shadow-[4px_4px_0_0_#0A0A0A] transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        {color && (
          <span className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-black align-middle" style={{ background: color }} />
        )}
        {text}
      </span>
    </span>
  );
}

// ---------- Animación de clima superpuesta al mapa ----------
// Se dibuja SOBRE el iframe del mapa con opacidad parcial (pointer-events:none)
// para que el mapa siga siendo visible y utilizable. No sustituye al mapa, es
// una capa decorativa que comunica de un vistazo si llueve, hace sol o está
// nublado en Quito ahora mismo.
// Alto de referencia del contenedor del mapa (coincide con el h-[400px] del
// mapa en la sección MAPA). Se usa para animar la lluvia en píxeles reales de
// borde a borde — con porcentajes relativos al propio elemento (18px) apenas
// se movía una fracción de la altura visible.
const MAP_OVERLAY_HEIGHT = 400;

function WeatherOverlay({ condition }: { condition: "rain" | "sunny" | "cloudy" }) {
  if (condition === "rain") {
    const drops = Array.from({ length: 40 });
    return (
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(45,91,255,0.22), rgba(45,91,255,0.10))" }} />
        {drops.map((_, i) => {
          const left = (i * 53) % 100;
          const delay = (i % 9) * 0.22;
          const duration = 0.6 + (i % 5) * 0.12;
          const height = 20 + (i % 4) * 6;
          return (
            <motion.span
              key={i}
              className="absolute block w-[3px] rounded-full"
              style={{ left: `${left}%`, top: -30, height, background: "rgba(45,91,255,0.75)" }}
              animate={{ y: [0, MAP_OVERLAY_HEIGHT + 60], opacity: [0, 1, 1, 0] }}
              transition={{ duration, delay, repeat: Infinity, ease: "linear" }}
            />
          );
        })}
      </div>
    );
  }
  if (condition === "sunny") {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {/* Baño cálido cubriendo todo el mapa, no solo la esquina */}
        <div className="absolute inset-0" style={{ background: "rgba(255,224,102,0.20)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 78% 22%, rgba(255,224,102,0.75), rgba(255,224,102,0.15) 60%, transparent 85%)" }} />
        <motion.div
          className="absolute right-[10%] top-[12%]"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          >
            <Sun className="h-24 w-24" style={{ color: COLORS.yellow, filter: "drop-shadow(0 0 22px rgba(255,224,102,0.95))" }} strokeWidth={2.5} />
          </motion.div>
        </motion.div>
      </div>
    );
  }
  // nublado
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(10,10,10,0.05))" }} />
      {[
        { top: "6%", size: 60, dur: 30, delay: 0, op: 0.75 },
        { top: "22%", size: 42, dur: 24, delay: 4, op: 0.6 },
        { top: "40%", size: 52, dur: 34, delay: 9, op: 0.65 },
        { top: "58%", size: 38, dur: 20, delay: 2, op: 0.55 },
        { top: "76%", size: 46, dur: 28, delay: 12, op: 0.6 },
      ].map((c, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ top: c.top }}
          initial={{ x: "-20%" }}
          animate={{ x: "120%" }}
          transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: "linear" }}
        >
          <Cloud className="text-white" style={{ width: c.size, height: c.size, opacity: c.op, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))" }} strokeWidth={2.5} fill="white" />
        </motion.div>
      ))}
    </div>
  );
}

// ---------- Sensor configs ----------
const SENSORS = [
  { key: "temperature_2m_mean", label: "Temperatura", unit: "°C", icon: Thermometer, color: COLORS.coral },
  { key: "precipitation_sum", label: "Precipitación", unit: "mm", icon: CloudRain, color: COLORS.blue },
  { key: "wind_speed_10m_max", label: "Viento máx.", unit: "km/h", icon: Wind, color: COLORS.mint },
  { key: "shortwave_radiation_sum", label: "Radiación solar", unit: "MJ/m²", icon: Sun, color: COLORS.yellow },
  { key: "relative_humidity_2m_mean", label: "Humedad", unit: "%", icon: Droplets, color: COLORS.lilac },
] as const;

// Explicación simple de cada opción del filtro "Variable" (tooltip al hover).
const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  Todos: "Muestra las anomalías de todas las variables, sin filtrar por sensor.",
  Multi: "Anomalías que combinan varias señales a la vez (por ejemplo, temperatura + humedad + viento).",
  Temperatura: "Qué tan caliente o frío está el aire.",
  "Precipitación": "Cuánta lluvia cayó ese día.",
  "Viento máx.": "La velocidad más fuerte que alcanzó el viento ese día.",
  "Radiación solar": "Cuánta energía del sol llegó a la superficie ese día.",
  Humedad: "Cuánta agua hay en el aire (humedad relativa).",
};

// ---------- Physical indices ----------
// Heat Index (NOAA Rothfusz regression). Inputs: T °C, RH %. Output: °C.
function heatIndexC(tC: number, rh: number): number {
  if (tC == null || rh == null || Number.isNaN(tC) || Number.isNaN(rh)) return NaN;
  const T = tC * 9 / 5 + 32; // °F
  const R = rh;
  // Simple form for T < 80°F; otherwise full regression
  if (T < 80) {
    const hi = 0.5 * (T + 61 + (T - 68) * 1.2 + R * 0.094);
    return (hi - 32) * 5 / 9;
  }
  const hi =
    -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
    - 6.83783e-3 * T * T - 5.481717e-2 * R * R
    + 1.22874e-3 * T * T * R + 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
  return (hi - 32) * 5 / 9;
}
// Vapor Pressure Deficit en kPa (Tetens). Inputs: T °C, RH %.
function vpdKPa(tC: number, rh: number): number {
  if (tC == null || rh == null || Number.isNaN(tC) || Number.isNaN(rh)) return NaN;
  const svp = 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
  return svp * (1 - rh / 100);
}

function zScores(values: number[]) {
  const valid = values.filter(v => v != null && !Number.isNaN(v));
  if (!valid.length) return values.map(() => 0);
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const std = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length) || 1;
  return values.map(v => (v == null || Number.isNaN(v) ? 0 : (v - mean) / std));
}

// ---------- Unified rule-based anomaly detection ----------
export type RuleKey =
  | "univariate"
  | "heat_index"
  | "vpd_fire"
  | "cold_humid"
  | "storm"
  | "sensor_frozen"
  | "abrupt_jump"
  | "radiation_inconsistent";

// Nivel de criticidad de una alerta (Objetivo específico 3 del documento):
// clasifica el evento por severidad, de forma independiente a su "base"
// metodológica (físico / estadístico / plausibilidad).
export type Criticality = "bajo" | "medio" | "alto" | "crítico";

export type RuleEvent = {
  date: string;
  index: number;
  rule: RuleKey;
  ruleLabel: string;
  variable: string; // sensor label or "Multi"
  description: string;
  icon: typeof Flame;
  color: string;
  signals: { label: string; value: string; z?: number }[];
  basis: "físico" | "estadístico" | "plausibilidad";
  // Campo adicional (opcional): se calcula centralmente con criticalityOf().
  criticality?: Criticality;
};

// Estilo visual por nivel de criticidad, reutilizando la paleta existente.
const CRITICALITY_STYLES: Record<Criticality, { label: string; bg: string; fg: string }> = {
  bajo: { label: "Bajo", bg: COLORS.mint, fg: COLORS.ink },
  medio: { label: "Medio", bg: COLORS.yellow, fg: COLORS.ink },
  alto: { label: "Alto", bg: COLORS.coral, fg: COLORS.ink },
  crítico: { label: "Crítico", bg: COLORS.ink, fg: "#fff" },
};

// Deriva la criticidad a partir de la magnitud del z-score y del tipo de regla.
// - Reglas de peligro ambiental directo (incendio, tormenta, calor) → alto/crítico.
// - Reglas de fallo de sensor / calidad de dato → medio.
// - Univariada → escalado puro por |z|.
function criticalityOf(e: RuleEvent): Criticality {
  const zs = e.signals
    .map((s) => s.z)
    .filter((z): z is number => typeof z === "number");
  const maxAbsZ = zs.length ? Math.max(...zs.map((z) => Math.abs(z))) : 0;

  const hazardRules: RuleKey[] = ["vpd_fire", "storm", "heat_index"];
  const dataQualityRules: RuleKey[] = ["abrupt_jump", "sensor_frozen", "radiation_inconsistent"];

  if (e.rule === "univariate") {
    if (maxAbsZ >= 4) return "crítico";
    if (maxAbsZ >= 3) return "alto";
    if (maxAbsZ >= 2.5) return "medio";
    return "bajo";
  }
  if (hazardRules.includes(e.rule)) {
    return maxAbsZ >= 2.5 ? "crítico" : "alto";
  }
  if (e.rule === "cold_humid") {
    return maxAbsZ >= 2.5 ? "alto" : "medio";
  }
  if (dataQualityRules.includes(e.rule)) {
    return "medio";
  }
  return "medio";
}

// Physical max plausible day-to-day delta per variable (Quito climatology)
const JUMP_LIMITS: Record<string, number> = {
  temperature_2m_mean: 8,        // °C
  precipitation_sum: 60,          // mm
  wind_speed_10m_max: 35,         // km/h
  shortwave_radiation_sum: 20,    // MJ/m²
  relative_humidity_2m_mean: 45,  // %
};

// Pipeline de detección (secuencia explícita del documento):
//   ETAPA 1 · Limpieza      → se toman las series con `?? []` y el manejo de
//             nulos es null-safe posición-a-posición (zScores() los ignora en
//             el cálculo y devuelve z=0 para ellos; cada regla salta null/NaN).
//             NO se filtran/eliminan elementos: los índices deben permanecer
//             alineados con daily.time para las reglas que comparan días
//             vecinos (salto abrupto, sensor congelado) y para los puntos del
//             gráfico. Reindexar rompería esas reglas.
//   ETAPA 2 · Normalización → z-scores por variable (zT, zP, zW, zR, zH).
//   ETAPA 3 · Evaluación    → las 8 reglas se evalúan en paralelo sobre la
//             misma serie normalizada.
//   ETAPA 4 · Estructuración→ cada hallazgo se empuja como RuleEvent.
//   ETAPA 5 · Orden         → se ordena cronológicamente antes de retornar.
function detectAllRules(daily: Daily): RuleEvent[] {
  // ETAPA 1 · Limpieza (null-safe, sin reindexar)
  const t = daily.temperature_2m_mean ?? [];
  const p = daily.precipitation_sum ?? [];
  const w = daily.wind_speed_10m_max ?? [];
  const r = daily.shortwave_radiation_sum ?? [];
  const h = daily.relative_humidity_2m_mean ?? [];
  // ETAPA 2 · Normalización (Z-scores por variable)
  const zT = zScores(t), zP = zScores(p), zW = zScores(w), zR = zScores(r), zH = zScores(h);
  const events: RuleEvent[] = [];

  // ETAPA 3 · Evaluación paralela de las 8 reglas
  // --- 1) Univariate per-sensor (|z| ≥ 2.2) ---
  SENSORS.forEach(s => {
    const vals = (daily[s.key] as number[]) ?? [];
    const { mean, std } = (() => {
      const valid = vals.filter(v => v != null && !Number.isNaN(v));
      const m = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
      const sd = Math.sqrt(valid.reduce((a, b) => a + (b - m) ** 2, 0) / (valid.length || 1)) || 1;
      return { mean: m, std: sd };
    })();
    vals.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) return;
      const z = (v - mean) / std;
      // |Z| ≥ 2.2 según las bases teóricas del documento (ver nota en detectAnomalies).
      if (Math.abs(z) >= 2.2) {
        events.push({
          date: daily.time[i], index: i, rule: "univariate",
          ruleLabel: "Univariada (|z|≥2.2)", variable: s.label,
          description: `${s.label} registró ${v.toFixed(1)} ${s.unit}, un valor ${z > 0 ? "mucho más alto" : "mucho más bajo"} de lo habitual en Quito (lo normal ronda los ${mean.toFixed(1)} ${s.unit}).`,
          icon: AlertTriangle, color: z > 0 ? COLORS.coral : COLORS.blue,
          signals: [{ label: s.label, value: `${v.toFixed(1)} ${s.unit}`, z }],
          basis: "estadístico",
        });
      }
    });
  });

  daily.time.forEach((date, i) => {
    const sig = (label: string, value: string, z?: number) => ({ label, value, z });

    // --- 2) Calor seco vía Heat Index NOAA (físico) ---
    // NOTA: el documento define esta regla solo con temperatura y humedad
    // (T + RH → Heat Index). El requisito adicional de radiación (zR >= 0.5)
    // es un REFINAMIENTO INTENCIONAL del equipo para el contexto andino de
    // Quito: exige sol fuerte para diferenciar "calor seco" real de un simple
    // valor alto de HI, reduciendo falsos positivos. No modificar sin revisar.
    const hi = heatIndexC(t[i], h[i]);
    if (!Number.isNaN(hi) && hi >= 27 && zR[i] >= 0.5) {
      const level = hi >= 41 ? "Peligro" : hi >= 32 ? "Precaución extrema" : "Precaución";
      events.push({
        date, index: i, rule: "heat_index",
        ruleLabel: "Calor seco (Heat Index NOAA)", variable: "Multi",
        description: `El Heat Index (índice de calor de la NOAA) combina temperatura y humedad para calcular cuánto calor se siente en realidad. Hoy marca ${hi.toFixed(1)}°C, nivel «${level}». A pleno sol en Quito, la sensación puede subir hasta 8°C más.`,
        icon: Flame, color: COLORS.yellow,
        signals: [
          sig("HI", `${hi.toFixed(1)} °C`),
          sig("Temp", `${t[i]?.toFixed(1)} °C`),
          sig("Humedad", `${h[i]?.toFixed(0)}%`),
          sig("Radiación", `${r[i]?.toFixed(1)} MJ/m²`, zR[i]),
        ],
        basis: "físico",
      });
    }

    // --- 3) Riesgo de incendio vía VPD (físico) + viento + lluvia ---
    // NOTA: el documento define esta regla solo con temperatura y humedad
    // (T + RH → VPD de Tetens). Las condiciones adicionales de viento
    // (zW >= 1.2) y de poca lluvia (zP <= -0.3) son un REFINAMIENTO
    // INTENCIONAL del equipo: el fuego se propaga con atmósfera seca (VPD),
    // viento que lo empuja y ausencia de lluvia. Eleva la especificidad de la
    // alerta de incendio. No modificar sin revisar.
    const vpd = vpdKPa(t[i], h[i]);
    if (!Number.isNaN(vpd) && vpd >= 1.5 && zW[i] >= 1.2 && zP[i] <= -0.3) {
      events.push({
        date, index: i, rule: "vpd_fire",
        ruleLabel: "Riesgo de incendio (VPD ≥ 1.5 kPa)", variable: "Multi",
        description: `El VPD (déficit de presión de vapor) mide qué tan seco está el aire: mientras más alto, más fácil se propaga el fuego. Hoy está en ${vpd.toFixed(2)} kPa, y se suma viento fuerte con poca lluvia — una combinación de riesgo de incendio.`,
        icon: Flame, color: COLORS.coral,
        signals: [
          sig("VPD", `${vpd.toFixed(2)} kPa`),
          sig("Humedad", `${h[i]?.toFixed(0)}%`),
          sig("Viento", `${w[i]?.toFixed(1)} km/h`, zW[i]),
          sig("Lluvia", `${p[i]?.toFixed(1)} mm`, zP[i]),
        ],
        basis: "físico",
      });
    }

    // --- 4) Tormenta: lluvia alta + viento fuerte (estadístico, asimétrico) ---
    if (zP[i] >= 1.5 && zW[i] >= 1.2) {
      events.push({
        date, index: i, rule: "storm",
        ruleLabel: "Tormenta (lluvia z≥1.5 + viento z≥1.2)", variable: "Multi",
        description: "Cayó mucha más lluvia de lo normal junto con viento fuerte al mismo tiempo. Esta combinación puede causar inundaciones o deslizamientos en las laderas de Quito.",
        icon: CloudLightning, color: COLORS.blue,
        signals: [
          sig("Lluvia", `${p[i]?.toFixed(1)} mm`, zP[i]),
          sig("Viento", `${w[i]?.toFixed(1)} km/h`, zW[i]),
        ],
        basis: "estadístico",
      });
    }

    // --- 5) Frío húmedo (estadístico puro: no hay índice tropical-montaña estándar) ---
    if (zT[i] <= -1.5 && zH[i] >= 1) {
      events.push({
        date, index: i, rule: "cold_humid",
        ruleLabel: "Frío húmedo (estadístico)", variable: "Multi",
        description: "La temperatura bajó y la humedad subió al mismo tiempo — una sensación de frío húmedo poco común en Quito.",
        icon: Snowflake, color: COLORS.mint,
        signals: [
          sig("Temp", `${t[i]?.toFixed(1)} °C`, zT[i]),
          sig("Humedad", `${h[i]?.toFixed(0)}%`, zH[i]),
        ],
        basis: "estadístico",
      });
    }

    // --- 6) Salto abrupto día a día (plausibilidad física) ---
    if (i > 0) {
      SENSORS.forEach(s => {
        const arr = (daily[s.key] as number[]) ?? [];
        const a = arr[i], b = arr[i - 1];
        if (a == null || b == null) return;
        const d = Math.abs(a - b);
        const lim = JUMP_LIMITS[s.key];
        if (lim && d > lim) {
          events.push({
            date, index: i, rule: "abrupt_jump",
            ruleLabel: "Salto abrupto (fallo de sensor)", variable: s.label,
            description: `${s.label} cambió de golpe: ${d.toFixed(1)} ${s.unit} en un solo día, más de lo que es físicamente esperable en Quito. Esto suele indicar una falla del sensor, no un cambio real del clima.`,
            icon: Zap, color: COLORS.lilac,
            signals: [
              sig("Δ24h", `${d.toFixed(1)} ${s.unit}`),
              sig("Hoy", `${a.toFixed(1)} ${s.unit}`),
              sig("Ayer", `${b.toFixed(1)} ${s.unit}`),
            ],
            basis: "plausibilidad",
          });
        }
      });
    }

    // --- 7) Sensor congelado: 3+ días consecutivos con valor idéntico ---
    if (i >= 2) {
      SENSORS.forEach(s => {
        const arr = (daily[s.key] as number[]) ?? [];
        const a = arr[i], b = arr[i - 1], c = arr[i - 2];
        if (a == null || b == null || c == null) return;
        // Ignore precipitation (legítimamente puede ser 0 muchos días seguidos)
        if (s.key === "precipitation_sum") return;
        if (a === b && b === c) {
          events.push({
            date, index: i, rule: "sensor_frozen",
            ruleLabel: "Sensor congelado (3+ lecturas idénticas)", variable: s.label,
            description: `${s.label} reportó el mismo valor exacto (${a.toFixed(2)} ${s.unit}) tres días seguidos. Es muy poco probable que ocurra de forma natural: seguramente el sensor se quedó "congelado" y dejó de actualizar.`,
            icon: AlertOctagon, color: COLORS.lilac,
            signals: [sig(s.label, `${a.toFixed(2)} ${s.unit} ×3`)],
            basis: "plausibilidad",
          });
        }
      });
    }

    // --- 8) Radiación incoherente: muy baja en día sin lluvia, o físicamente excesiva ---
    if (r[i] != null && !Number.isNaN(r[i])) {
      if (r[i] < 2 && (p[i] ?? 0) < 1) {
        events.push({
          date, index: i, rule: "radiation_inconsistent",
          ruleLabel: "Radiación incoherente", variable: "Radiación solar",
          description: `El sensor de radiación solar marcó un valor muy bajo (${r[i].toFixed(1)} MJ/m²) en un día sin lluvia. Como Quito está sobre la línea ecuatorial, eso es muy poco probable — puede ser un error de lectura del sensor.`,
          icon: Gauge, color: COLORS.lilac,
          signals: [sig("Radiación", `${r[i].toFixed(1)} MJ/m²`), sig("Lluvia", `${(p[i] ?? 0).toFixed(1)} mm`)],
          basis: "plausibilidad",
        });
      } else if (r[i] > 35) {
        events.push({
          date, index: i, rule: "radiation_inconsistent",
          ruleLabel: "Radiación incoherente", variable: "Radiación solar",
          description: `El sensor de radiación solar marcó ${r[i].toFixed(1)} MJ/m², por encima del máximo físicamente posible en Quito (~33 MJ/m²). Probablemente es un error de lectura del sensor.`,
          icon: Gauge, color: COLORS.lilac,
          signals: [sig("Radiación", `${r[i].toFixed(1)} MJ/m²`)],
          basis: "plausibilidad",
        });
      }
    }
  });

  // ETAPA 4 · Estructuración: cada hallazgo ya se empujó como RuleEvent arriba.
  // Se completa con el nivel de criticidad (campo adicional, no altera el resto).
  events.forEach((e) => { e.criticality = criticalityOf(e); });

  // ETAPA 5 · Orden cronológico (más reciente primero)
  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}

const RANGES = [
  { key: "7", label: "Esta semana", days: 7 },
  { key: "30", label: "Último mes", days: 30 },
  { key: "90", label: "3 meses", days: 90 },
  { key: "180", label: "6 meses", days: 180 },
  { key: "365", label: "Año", days: 365 },
] as const;

// ---------- Main ----------
function Quitolerta() {
  const [data, setData] = useState<{ daily: Daily; current: Current; hourly: Hourly | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<typeof SENSORS[number]["key"]>("temperature_2m_mean");
  const [rangeDays, setRangeDays] = useState<number>(365);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  useEffect(() => {
    fetchData().then(setData).catch(e => setErr(String(e)));
  }, []);

  const activeSensor = SENSORS.find(s => s.key === active)!;

  const chartData = useMemo(() => {
    if (!data) return { rows: [], anomalies: [] as ReturnType<typeof detectAnomalies>["anomalies"], mean: 0, std: 0 };
    const allValues = (data.daily[active] as number[]) ?? [];
    const allTimes = data.daily.time;
    const startIdx = Math.max(0, allTimes.length - rangeDays);
    const values = allValues.slice(startIdx);
    const times = allTimes.slice(startIdx);
    const { mean, std, anomalies } = detectAnomalies(values, times);
    const rows = times.map((t, i) => ({
      date: t,
      value: values[i],
      label: new Date(t).toLocaleDateString("es-EC", { month: "short", day: "numeric" }),
    }));
    return { rows, anomalies, mean, std };
  }, [data, active, rangeDays]);

  const allEvents = useMemo(() => (data ? detectAllRules(data.daily) : []), [data]);

  const [ruleFilter, setRuleFilter] = useState<Set<RuleKey>>(new Set());
  const [varFilter, setVarFilter] = useState<string>("Todos");
  const [simulatedAnomalies, setSimulatedAnomalies] = useState<RuleEvent[]>([]);
  const [showSimMenu, setShowSimMenu] = useState(false);
  const [page, setPage] = useState(1);

  const simulateAnomaly = (rule: RuleKey) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const randSensor = () => SENSORS[Math.floor(Math.random() * SENSORS.length)];

    let event: RuleEvent;
    switch (rule) {
      case "univariate": {
        const s = randSensor();
        const fakeValue = (Math.random() * 80 + 10).toFixed(1);
        event = {
          date: dateStr, index: -1, rule: "univariate",
          ruleLabel: "SIMULADA · Univariada (|z|≥2.2)", variable: s.label,
          description: `⚠️ Simulada: ${s.label} con un valor de ${fakeValue} ${s.unit}, muy alejado de lo normal en Quito.`,
          icon: AlertTriangle, color: COLORS.coral,
          signals: [{ label: s.label, value: `${fakeValue} ${s.unit}`, z: 3.0 }],
          basis: "estadístico",
        };
        break;
      }
      case "heat_index": {
        event = {
          date: dateStr, index: -1, rule: "heat_index",
          ruleLabel: "SIMULADA · Calor seco (HI NOAA)", variable: "Multi",
          description: `⚠️ Simulada: el Heat Index (índice de calor NOAA) llega a nivel "Precaución extrema" con 34°C de temperatura y 55% de humedad — se siente más calor del que marca el termómetro.`,
          icon: Flame, color: COLORS.yellow,
          signals: [
            { label: "HI", value: "36.2 °C" },
            { label: "Temp", value: "34.0 °C" },
            { label: "Humedad", value: "55%", z: 0.8 },
          ],
          basis: "físico",
        };
        break;
      }
      case "vpd_fire": {
        event = {
          date: dateStr, index: -1, rule: "vpd_fire",
          ruleLabel: "SIMULADA · Riesgo incendio (VPD)", variable: "Multi",
          description: `⚠️ Simulada: el VPD (qué tan seco está el aire) llega a 2.1 kPa, sumado a viento fuerte de 45 km/h — condiciones de riesgo de incendio.`,
          icon: Flame, color: COLORS.coral,
          signals: [
            { label: "VPD", value: "2.10 kPa" },
            { label: "Humedad", value: "22%" },
            { label: "Viento", value: "45.0 km/h", z: 1.8 },
            { label: "Lluvia", value: "0.0 mm", z: -0.6 },
          ],
          basis: "físico",
        };
        break;
      }
      case "storm": {
        event = {
          date: dateStr, index: -1, rule: "storm",
          ruleLabel: "SIMULADA · Tormenta", variable: "Multi",
          description: `⚠️ Simulada: 48 mm de lluvia junto con viento de 52 km/h — condiciones típicas de tormenta.`,
          icon: CloudLightning, color: COLORS.blue,
          signals: [
            { label: "Lluvia", value: "48.0 mm", z: 2.1 },
            { label: "Viento", value: "52.0 km/h", z: 1.6 },
          ],
          basis: "estadístico",
        };
        break;
      }
      case "cold_humid": {
        event = {
          date: dateStr, index: -1, rule: "cold_humid",
          ruleLabel: "SIMULADA · Frío húmedo", variable: "Multi",
          description: `⚠️ Simulada: temperatura de 6°C junto con 92% de humedad — frío húmedo poco común en Quito.`,
          icon: Snowflake, color: COLORS.mint,
          signals: [
            { label: "Temp", value: "6.0 °C", z: -1.8 },
            { label: "Humedad", value: "92%", z: 1.2 },
          ],
          basis: "estadístico",
        };
        break;
      }
      case "abrupt_jump": {
        const s = randSensor();
        event = {
          date: dateStr, index: -1, rule: "abrupt_jump",
          ruleLabel: "SIMULADA · Salto abrupto", variable: s.label,
          description: `⚠️ Simulada: ${s.label} saltó 18.5 ${s.unit} en un solo día — un cambio más brusco de lo físicamente posible, típico de una falla de sensor.`,
          icon: Zap, color: COLORS.lilac,
          signals: [
            { label: "Δ24h", value: `18.5 ${s.unit}` },
            { label: "Hoy", value: "28.3" },
            { label: "Ayer", value: "9.8" },
          ],
          basis: "plausibilidad",
        };
        break;
      }
      case "sensor_frozen": {
        const s = randSensor();
        event = {
          date: dateStr, index: -1, rule: "sensor_frozen",
          ruleLabel: "SIMULADA · Sensor congelado", variable: s.label,
          description: `⚠️ Simulada: ${s.label} reportó exactamente 21.30 ${s.unit} tres días seguidos — un sensor probablemente atascado.`,
          icon: AlertOctagon, color: COLORS.lilac,
          signals: [{ label: s.label, value: "21.30 ×3" }],
          basis: "plausibilidad",
        };
        break;
      }
      case "radiation_inconsistent": {
        event = {
          date: dateStr, index: -1, rule: "radiation_inconsistent",
          ruleLabel: "SIMULADA · Radiación incoherente", variable: "Radiación solar",
          description: `⚠️ Simulada: el sensor de radiación solar marca solo 0.8 MJ/m² en un día sin lluvia — físicamente muy improbable estando Quito en el ecuador.`,
          icon: Gauge, color: COLORS.lilac,
          signals: [
            { label: "Radiación", value: "0.8 MJ/m²" },
            { label: "Lluvia", value: "0.0 mm" },
          ],
          basis: "plausibilidad",
        };
        break;
      }
    }
    event.criticality = criticalityOf(event);
    setSimulatedAnomalies(prev => [event, ...prev]);
    setShowSimMenu(false);
  };

  const clearSimulated = () => {
    setSimulatedAnomalies([]);
    setShowSimMenu(false);
  };

  const allEventsWithSim = useMemo(() => [...simulatedAnomalies, ...allEvents], [allEvents, simulatedAnomalies]);

  // `desc` explica en lenguaje simple qué detecta cada regla — se muestra en
  // el tooltip al pasar el cursor sobre su botón (reemplaza a la antigua
  // sección separada "¿Por qué cada color?").
  const ruleCatalog: { key: RuleKey; label: string; color: string; desc: string }[] = [
    { key: "univariate", label: "Univariada Z", color: COLORS.coral, desc: "Un sensor (temperatura, lluvia, viento, radiación o humedad) marca un valor muy distinto a lo habitual en Quito." },
    { key: "heat_index", label: "Calor seco (HI NOAA)", color: COLORS.yellow, desc: "Combina temperatura y humedad (Heat Index NOAA) para saber cuánto calor se siente de verdad, aunque el termómetro no lo parezca tanto." },
    { key: "vpd_fire", label: "Incendio (VPD)", color: COLORS.coral, desc: "Mide qué tan seco está el aire (VPD) junto con viento fuerte y poca lluvia: condiciones que facilitan un incendio." },
    { key: "storm", label: "Tormenta", color: COLORS.blue, desc: "Lluvia muy intensa junto con viento fuerte al mismo tiempo — riesgo de inundación o daños." },
    { key: "cold_humid", label: "Frío húmedo", color: COLORS.mint, desc: "Temperatura baja y humedad alta a la vez: una sensación de frío húmedo poco común en Quito." },
    { key: "abrupt_jump", label: "Salto abrupto", color: COLORS.lilac, desc: "Un sensor cambió de golpe en un solo día, más de lo físicamente posible — probable falla técnica." },
    { key: "sensor_frozen", label: "Sensor congelado", color: COLORS.lilac, desc: "Un sensor repitió exactamente el mismo valor varios días seguidos — probablemente se quedó atascado." },
    { key: "radiation_inconsistent", label: "Radiación incoherente", color: COLORS.lilac, desc: "El sensor de radiación solar marcó un valor imposible para Quito: demasiado bajo sin lluvia, o demasiado alto." },
  ];

  const variableOptions = useMemo(() => {
    const set = new Set<string>(["Todos", "Multi", ...SENSORS.map(s => s.label)]);
    return Array.from(set);
  }, []);

  const filteredEvents = useMemo(() => {
    return allEventsWithSim.filter(e =>
      (ruleFilter.size === 0 || ruleFilter.has(e.rule)) &&
      (varFilter === "Todos" || e.variable === varFilter) &&
      (!dateFrom || e.date >= dateFrom) &&
      (!dateTo || e.date <= dateTo)
    );
  }, [allEventsWithSim, ruleFilter, varFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [allEventsWithSim, ruleFilter, varFilter, dateFrom, dateTo]);

  const downloadChartPng = async () => {
    if (!chartRef.current) return;
    const dataUrl = await toPng(chartRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = `quitolerta-${active}-${new Date().toISOString().slice(0,10)}.png`;
    link.href = dataUrl;
    link.click();
  };

  const downloadPdfReport = async () => {
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    pdf.setFontSize(18);
    pdf.text("Quitolerta — Reporte general", 40, 40);
    pdf.setFontSize(10);
    pdf.text(
      `Generado: ${new Date().toLocaleString("es-EC")}  ·  Sensor: ${activeSensor.label} (${activeSensor.unit})  ·  Rango: ${rangeDays}d`,
      40, 58
    );
    if (dateFrom || dateTo) {
      pdf.text(`Filtro fechas anomalías: ${dateFrom || "…"} → ${dateTo || "…"}`, 40, 74);
    }

    if (chartRef.current) {
      const dataUrl = await toPng(chartRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const imgW = pageW - 80;
      const imgH = imgW * 0.42;
      pdf.addImage(dataUrl, "PNG", 40, 90, imgW, imgH);
      autoTable(pdf, {
        startY: 90 + imgH + 20,
        head: [["Fecha", "Regla", "Variable", "Base", "Descripción"]],
        body: filteredEvents.map(e => [
          new Date(e.date).toLocaleDateString("es-EC"),
          e.ruleLabel,
          e.variable,
          e.basis,
          e.description,
        ]),
        styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [10, 10, 10], textColor: 255 },
        columnStyles: { 4: { cellWidth: 320 } },
        margin: { left: 40, right: 40 },
      });
    }
    pdf.save(`quitolerta-reporte-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const toggleRule = (k: RuleKey) => {
    const next = new Set(ruleFilter);
    if (next.has(k)) next.delete(k); else next.add(k);
    setRuleFilter(next);
  };

  const totalPages = Math.ceil(filteredEvents.length / 9);
  const pageStart = (page - 1) * 9;
  const pageEvents = filteredEvents.slice(pageStart, pageStart + 9);

  const SIM_OPTIONS: { key: RuleKey; label: string; color: string; desc: string }[] = [
    { key: "univariate", label: "Valor extremo Z", color: COLORS.coral, desc: "Sensor con valor fuera de lo normal." },
    { key: "heat_index", label: "Calor extremo (HI NOAA)", color: COLORS.yellow, desc: "Temperatura alta + humedad." },
    { key: "vpd_fire", label: "Riesgo incendio (VPD)", color: COLORS.coral, desc: "Atmósfera seca con viento." },
    { key: "storm", label: "Tormenta", color: COLORS.blue, desc: "Lluvia intensa + viento fuerte." },
    { key: "cold_humid", label: "Frío húmedo", color: COLORS.mint, desc: "Temp baja + humedad alta." },
    { key: "abrupt_jump", label: "Salto abrupto", color: COLORS.lilac, desc: "Cambio brusco día a día." },
    { key: "sensor_frozen", label: "Sensor congelado", color: COLORS.lilac, desc: "Lecturas idénticas 3+ días." },
    { key: "radiation_inconsistent", label: "Radiación incoherente", color: COLORS.lilac, desc: "Radiación imposible para Quito." },
  ];

  const totalAnomalies = useMemo(() => {
    if (!data) return 0;
    return allEventsWithSim.length;
  }, [data, allEventsWithSim]);

  // ---------- HOY ----------
  const hoy = useMemo(() => {
    if (!data) return null;
    const c = data.current;
    const hi = heatIndexC(c.temperature_2m, c.relative_humidity_2m);
    const vpd = vpdKPa(c.temperature_2m, c.relative_humidity_2m);
    const lastIdx = data.daily.time.length - 1;
    const lastDate = data.daily.time[lastIdx];
    const lastEvents = allEventsWithSim.filter(e => e.date === lastDate);
    // Sensación
    let feel = "Templado";
    if (!Number.isNaN(hi) && hi >= 32) feel = "Caluroso";
    else if (c.temperature_2m <= 10) feel = "Frío";
    else if (c.relative_humidity_2m >= 85 && c.precipitation > 0) feel = "Húmedo y lluvioso";
    else if (vpd >= 1.2) feel = "Seco";
    // Riesgo UV proxy (radiación del último día vs media)
    const rArr = data.daily.shortwave_radiation_sum ?? [];
    const rMean = rArr.filter(v => v != null).reduce((s, v) => s + v, 0) / (rArr.length || 1);
    const rToday = rArr[lastIdx];
    const uvLabel = rToday >= rMean * 1.15 ? "Alto" : rToday <= rMean * 0.6 ? "Bajo" : "Medio";
    const now = new Date();
    const nowFmt = now.toLocaleString("es-EC", {
      weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit",
    });
    return { c, hi, vpd, feel, uvLabel, lastEvents, lastDate, nowFmt };
  }, [data, allEventsWithSim]);

  // ---------- Resumen del mapa (temp. promedio, condición y pronóstico por horas) ----------
  const weatherCondition = useMemo(() => weatherCodeToCondition(data?.current.weather_code), [data]);

  // "" = hoy (último día disponible). El selector permite consultar cualquier
  // otra fecha del histórico de 365 días sin afectar el resto del panel.
  const [tempQueryDate, setTempQueryDate] = useState<string>("");

  const tempDateBounds = useMemo(() => {
    if (!data?.daily.time.length) return null;
    return { min: data.daily.time[0], max: data.daily.time[data.daily.time.length - 1] };
  }, [data]);

  const queriedDailyTemp = useMemo(() => {
    if (!data) return null;
    const times = data.daily.time;
    const targetDate = tempQueryDate || times[times.length - 1];
    const idx = times.indexOf(targetDate);
    if (idx === -1) return { date: targetDate, value: null as number | null };
    const val = data.daily.temperature_2m_mean?.[idx];
    return { date: targetDate, value: val != null && !Number.isNaN(val) ? val : null };
  }, [data, tempQueryDate]);

  const upcomingHours = useMemo(() => {
    if (!data?.hourly) return [];
    const { time, temperature_2m, precipitation_probability, weather_code } = data.hourly;
    const now = new Date();
    const startIdx = time.findIndex(t => new Date(t) >= now);
    const from = startIdx === -1 ? 0 : startIdx;
    return time.slice(from, from + 6).map((t, i) => ({
      time: t,
      hourLabel: new Date(t).toLocaleTimeString("es-EC", { hour: "numeric" }),
      temp: temperature_2m[from + i],
      precipProb: precipitation_probability?.[from + i] ?? 0,
      condition: weatherCodeToCondition(weather_code?.[from + i]),
    }));
  }, [data]);

  return (
    <div
      className="min-h-screen cursor-none selection:bg-black selection:text-white"
      style={{ background: COLORS.bg, color: COLORS.ink, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
    >
      <CustomCursor />

      {/* Modal simular anomalía */}
      <AnimatePresence>
        {showSimMenu && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] sm:items-center sm:pt-4"
            onClick={() => setShowSimMenu(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg sm:max-w-2xl"
            >
              <Brick color="#fff" className="p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black uppercase opacity-60">Simulación</div>
                    <h3 className="display text-xl sm:text-2xl">Elige el tipo de anomalía</h3>
                  </div>
                  <button onClick={() => setShowSimMenu(false)} className="rounded-xl border-[3px] border-black bg-white px-3 py-1.5 text-sm font-black uppercase">
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {SIM_OPTIONS.map(o => (
                    <motion.button
                      key={o.key}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => simulateAnomaly(o.key)}
                      className="flex items-center gap-3 rounded-2xl border-[3px] border-black p-3 text-left md:flex-col md:items-start md:gap-2 md:p-4"
                      style={{ background: o.color }}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-[3px] border-black bg-white md:h-10 md:w-10">
                        <Zap className="h-4 w-4 md:h-5 md:w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase leading-tight md:text-sm">{o.label}</div>
                        <div className="hidden text-xs font-bold opacity-70 md:block">{o.desc}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
                {simulatedAnomalies.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={clearSimulated}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-[3px] border-black bg-[#FF6B6B] p-4 text-sm font-black uppercase text-white"
                  >
                    <AlertTriangle className="h-5 w-5" /> Limpiar {simulatedAnomalies.length} simulada(s)
                  </motion.button>
                )}
              </Brick>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Archivo+Black&display=swap');
        .display { font-family: 'Archivo Black', sans-serif; letter-spacing: -0.04em; }
        .grain::before { content:""; position:absolute; inset:0; pointer-events:none; opacity:.06;
          background-image: radial-gradient(#000 1px, transparent 1px); background-size: 4px 4px; }
      `}</style>

      {/* NAV */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-[3px] border-black" style={{ background: COLORS.yellow, boxShadow: "4px 4px 0 0 #0A0A0A" }}>
            <Radio className="h-5 w-5" />
          </div>
          <span className="display text-2xl">QUITOLERTA</span>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="flex items-center gap-2 rounded-full border-[3px] border-black bg-white px-4 py-2 text-sm font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6BE5C7] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#0A0A0A]" />
            </span>
            EN VIVO · Quito, EC
          </span>
        </div>
      </nav>

      {/* HERO: imagen de fondo cubriendo toda la sección */}
      <section className="relative overflow-hidden" style={{ background: COLORS.bg }}>
        <img
          src={quitoHero}
          alt="Virgen del Panecillo sobre Quito"
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-full w-full max-w-9xl -translate-x-1/2 -translate-y-1/2 select-none object-cover"
        />
        <div className="relative z-10">
      <header className="mx-auto max-w-7xl px-5 pt-6 pb-16">
        <div className="grid gap-8 md:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="md:col-span-8"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border-[3px] border-black bg-white px-4 py-1.5 text-xs font-black uppercase">
              <Sparkles className="h-4 w-4" /> Datos públicos · Open-Meteo · 365 días
            </div>
            <div className="h-200">
              <h1 className="max-w-2xl display text-[clamp(28px,5vw,80px)] leading-[0.9]">
              SIENTE EL <span style={{ color: COLORS.blue }}>CLIMA</span><br />
              DE QUITO COMO <br />
              <span className="inline-block max-w-md rounded-2xl border-[3px] border-black px-4 py-1" style={{ background: COLORS.yellow, boxShadow: "8px 8px 0 0 #0A0A0A" }}>NUNCA ANTES</span>
              </h1>
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <BounceButton color={COLORS.blue} onClick={() => document.getElementById("panel")?.scrollIntoView({ behavior: "smooth" })}>
                <span className="text-white">Ver el panel</span>
                <ArrowRight className="h-5 w-5 text-white" />
              </BounceButton>
              <BounceButton color={COLORS.mint} onClick={() => setShowSimMenu(true)}>
                <Zap className="h-5 w-5" /> Simular anomalía
              </BounceButton>
            </div>
          </motion.div>

          {/* Floating sensor card with overflowing badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: 3 }}
            transition={{ duration: 0.7, delay: 0.2, type: "spring" }}
            className="relative md:col-span-4"
          >
            <div className="relative">
              {/* Floating badge — sibling, NOT inside overflow-hidden */}
              <motion.a
                href="#anomalias"
                onClick={(ev) => { ev.preventDefault(); document.getElementById("anomalias")?.scrollIntoView({ behavior: "smooth" }); }}
                animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
                className="absolute -right-4 -top-6 z-30 cursor-pointer rounded-2xl border-[3px] border-black px-4 py-2 font-black uppercase"
                style={{ background: COLORS.coral, boxShadow: "5px 5px 0 0 #0A0A0A", transform: "rotate(8deg)" }}
              >
                <span className="flex items-center gap-1.5 text-sm"><AlertTriangle className="h-4 w-4" /> {totalAnomalies || "—"} anomalías</span>
              </motion.a>

              <Brick color={COLORS.lilac} className="overflow-hidden p-6">
                <div className="grain absolute inset-0" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-sm font-bold uppercase"><MapPin className="h-4 w-4" /> 0.18° S · 78.46° W</div>
                  <div className="display mt-4 text-7xl">
                    {data ? Math.round(data.current.temperature_2m) : "··"}<span className="text-3xl">°C</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MiniStat icon={Droplets} label="Humedad" value={data ? `${Math.round(data.current.relative_humidity_2m)}%` : "—"} bg="#fff" />
                    <MiniStat icon={Wind} label="Viento" value={data ? `${data.current.wind_speed_10m.toFixed(1)} km/h` : "—"} bg={COLORS.yellow} />
                    <MiniStat icon={CloudRain} label="Lluvia" value={data ? `${data.current.precipitation.toFixed(1)} mm` : "—"} bg={COLORS.mint} />
                    <MiniStat icon={Activity} label="Estado" value="OK" bg="#fff" />
                  </div>
                </div>
              </Brick>
            </div>
          </motion.div>
        </div>
      </header>

      {/* STATS BAR */}
      <section className="mx-auto max-w-7xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { v: "365", l: "días analizados", c: COLORS.yellow },
            { v: data ? String(data.daily.time.length) : "—", l: "registros diarios", c: "#fff" },
            { v: String(totalAnomalies), l: "anomalías detectadas", c: COLORS.coral },
            { v: String(SENSORS.length), l: "sensores públicos", c: COLORS.mint },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <Brick color={s.c} className="px-5 py-5">
                <div className="display text-4xl md:text-5xl">{s.v}</div>
                <div className="mt-1 text-xs font-bold uppercase">{s.l}</div>
              </Brick>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  </section>

      {/* HOY EN QUITO */}
      <section id="hoy" className="relative mx-auto max-w-7xl px-5 pt-24">
        
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-black uppercase opacity-60">Ahora mismo</div>
            <h2 className="display text-5xl md:text-7xl">Hoy en Quito.</h2>
            {hoy && (
              <p className="mt-3 text-sm font-bold uppercase tracking-wide opacity-70">
                {hoy.nowFmt}
              </p>
            )}
          </div>
          <p className="max-w-md text-base font-medium text-black/70">
            Así está el clima ahora mismo en Quito, comparado con todo un año de datos. Te mostramos también el Heat Index (sensación de calor), el VPD (qué tan seco está el aire) y si hay algo fuera de lo normal hoy.
          </p>
        </div>

        {!hoy ? (
          <Brick color="#fff" className="p-8"><div className="text-sm font-bold uppercase opacity-60">Cargando lectura en vivo…</div></Brick>
        ) : (
          <div className="grid gap-5 md:grid-cols-12">
            {/* Big current temperature card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="md:col-span-5"
            >
              <Brick color={COLORS.yellow} className="relative overflow-hidden p-6">
                <div className="grain absolute inset-0" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-sm font-black uppercase"><Radio className="h-4 w-4" /> En vivo · {hoy.feel}</div>
                  <div className="display mt-4 text-[110px] leading-none">
                    {Math.round(hoy.c.temperature_2m)}<span className="text-4xl">°C</span>
                  </div>
                  <div className="mt-2 text-sm font-bold uppercase opacity-70">
                    Sensación térmica {Number.isNaN(hoy.hi) ? "—" : `${hoy.hi.toFixed(1)}°C`}
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <MiniStat icon={Droplets} label="Humedad" value={`${Math.round(hoy.c.relative_humidity_2m)}%`} bg="#fff" />
                    <MiniStat icon={Wind} label="Viento" value={`${hoy.c.wind_speed_10m.toFixed(1)} km/h`} bg="#fff" />
                    <MiniStat icon={CloudRain} label="Lluvia" value={`${hoy.c.precipitation.toFixed(1)} mm`} bg={COLORS.mint} />
                    <MiniStat icon={Sun} label="UV proxy" value={hoy.uvLabel} bg={COLORS.coral} />
                  </div>
                </div>
              </Brick>
            </motion.div>

            {/* Derived indices */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.08 }}
              className="md:col-span-4 grid gap-5"
            >
              <Brick color={COLORS.mint} className="p-5">
                <div className="flex items-center gap-2 text-xs font-black uppercase"><Gauge className="h-4 w-4" /> VPD (Tetens)</div>
                <div className="display mt-3 text-5xl">{Number.isNaN(hoy.vpd) ? "—" : hoy.vpd.toFixed(2)}<span className="text-xl"> kPa</span></div>
                <div className="mt-2 text-xs font-bold uppercase opacity-70">
                  {hoy.vpd >= 1.5 ? "Atmósfera muy seca · riesgo de incendio" : hoy.vpd >= 1.0 ? "Aire seco" : "Aire confortable"}
                </div>
              </Brick>
              <Brick color={COLORS.lilac} className="p-5">
                <div className="flex items-center gap-2 text-xs font-black uppercase"><Flame className="h-4 w-4" /> Heat Index NOAA</div>
                <div className="display mt-3 text-5xl">{Number.isNaN(hoy.hi) ? "—" : hoy.hi.toFixed(1)}<span className="text-xl"> °C</span></div>
                <div className="mt-2 text-xs font-bold uppercase opacity-70">
                  {hoy.hi >= 41 ? "Peligro" : hoy.hi >= 32 ? "Precaución extrema" : hoy.hi >= 27 ? "Precaución" : "Sin estrés térmico"}
                </div>
              </Brick>
            </motion.div>

            {/* Today's rule events */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.16 }}
              className="md:col-span-3"
            >
              <Brick color="#fff" className="h-full p-5">
                <div className="flex items-center gap-2 text-xs font-black uppercase"><AlertTriangle className="h-4 w-4" /> Alertas de hoy</div>
                <div className="mt-1 text-[11px] font-bold uppercase opacity-60">Últ. día registrado · {hoy.lastDate}</div>
                {hoy.lastEvents.length === 0 ? (
                  <div className="mt-4 rounded-2xl border-[3px] border-black bg-[#FAF7F0] p-4 text-sm font-bold">
                    Sin anomalías. Día dentro de lo normal ✓
                  </div>
                ) : (
                  <ul className="mt-3 space-y-2 max-h-[280px] overflow-auto pr-1">
                    {hoy.lastEvents.slice(0, 6).map((e, i) => {
                      const Icon = e.icon;
                      const crit = e.criticality ?? criticalityOf(e);
                      const critStyle = CRITICALITY_STYLES[crit];
                      return (
                        <li key={i}>
                          <a
                            href="#anomalias"
                            onClick={(ev) => { ev.preventDefault(); document.getElementById("anomalias")?.scrollIntoView({ behavior: "smooth" }); }}
                            className="flex items-start gap-2 rounded-xl border-[3px] border-black p-2 text-xs font-bold"
                            style={{ background: e.color }}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="leading-tight flex-1">{e.ruleLabel}</span>
                            <span
                              className="shrink-0 rounded-full border-2 border-black px-1.5 py-0.5 text-[9px] font-black uppercase leading-none"
                              style={{ background: critStyle.bg, color: critStyle.fg }}
                            >
                              {critStyle.label}
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button
                  onClick={() => document.getElementById("anomalias")?.scrollIntoView({ behavior: "smooth" })}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-black uppercase underline"
                >
                  Ver histórico <ArrowRight className="h-3 w-3" />
                </button>
              </Brick>
            </motion.div>
          </div>
        )}
      </section>

      {/* MAPA */}
      <section className="relative mx-auto max-w-7xl px-5 pt-24">
        <div className="mb-8">
          <div className="text-sm font-black uppercase opacity-60">Ubicación</div>
          <h2 className="display text-5xl md:text-7xl">Quito, Ecuador.</h2>
          <p className="mt-3 max-w-xl text-sm font-medium text-black/70">
            El mapa siempre está visible; encima le dibujamos una animación con el clima actual. Al lado tienes un resumen simple de lo más importante de hoy.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-12">
          {/* Mapa con animación de clima superpuesta (transparente, el mapa nunca se tapa) */}
          <div className="md:col-span-7">
            <Brick color="#fff" className="h-full overflow-hidden p-0">
              <div className="relative h-[400px]">
                <iframe
                  src="https://www.openstreetmap.org/export/embed.html?bbox=-78.5678%2C-0.2807%2C-78.3678%2C-0.0807&layer=mapnik&marker=-0.1807%2C-78.4678"
                  width="100%"
                  height="400"
                  style={{ border: 0, display: "block" }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Mapa de Quito"
                />
                {/* Animación decorativa, no bloquea el mapa (pointer-events: none) */}
                <WeatherOverlay condition={weatherCondition} />
                <div
                  className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border-[3px] border-black px-3 py-1.5 text-xs font-black uppercase"
                  style={{ background: "#fff", boxShadow: "3px 3px 0 0 #0A0A0A" }}
                >
                  {weatherCondition === "rain" ? <CloudRain className="h-4 w-4" /> : weatherCondition === "sunny" ? <Sun className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
                  {weatherCondition === "rain" ? "Lluvia" : weatherCondition === "sunny" ? "Soleado" : "Nublado"} en Quito
                </div>
              </div>
              <div className="border-t-[3px] border-black p-3 text-xs font-bold opacity-60">
                OpenStreetMap © colaboradores · coordenadas: -0.1807°, -78.4678°
              </div>
            </Brick>
          </div>

          {/* Panel-resumen: reemplaza al antiguo popup por clic */}
          <div className="md:col-span-5">
            <Brick color="#fff" className="h-full p-5">
              <div className="flex items-center gap-2 text-xs font-black uppercase opacity-60">
                <MapPin className="h-3.5 w-3.5" /> Resumen de Quito
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border-[3px] border-black p-3" style={{ background: COLORS.mint }}>
                  <div className="text-[10px] font-black uppercase">Temperatura promedio</div>
                  <div className="display mt-1 text-3xl">{queriedDailyTemp?.value != null ? queriedDailyTemp.value.toFixed(1) : "—"}<span className="text-base">°C</span></div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase opacity-70">
                    {tempQueryDate && queriedDailyTemp ? new Date(queriedDailyTemp.date).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "hoy"}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="date"
                      value={tempQueryDate}
                      min={tempDateBounds?.min}
                      max={tempDateBounds?.max}
                      onChange={e => setTempQueryDate(e.target.value)}
                      aria-label="Consultar temperatura promedio de otra fecha"
                      className="w-full min-w-0 rounded-lg border-2 border-black bg-white px-1.5 py-1 text-[10px] font-black"
                    />
                    {tempQueryDate && (
                      <button
                        onClick={() => setTempQueryDate("")}
                        className="shrink-0 rounded-lg border-2 border-black bg-white px-1.5 py-1 text-[10px] font-black uppercase"
                      >
                        Hoy
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border-[3px] border-black p-3" style={{ background: COLORS.coral }}>
                  <div className="text-[10px] font-black uppercase">Anomalías de hoy</div>
                  <div className="display mt-1 text-3xl">{hoy ? hoy.lastEvents.length : "—"}</div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase opacity-70">de {totalAnomalies} en total</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-black uppercase opacity-60">Anomalías detectadas hoy</div>
                {!hoy || hoy.lastEvents.length === 0 ? (
                  <div className="mt-2 rounded-xl border-[3px] border-black bg-[#FAF7F0] p-2 text-xs font-bold">
                    Todo normal por ahora ✓
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {hoy.lastEvents.slice(0, 4).map((e, i) => {
                      const crit = e.criticality ?? criticalityOf(e);
                      const cs = CRITICALITY_STYLES[crit];
                      return (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2 rounded-lg border-2 border-black px-2 py-1 text-[11px] font-bold"
                          style={{ background: e.color }}
                        >
                          <span className="leading-tight">{e.ruleLabel}</span>
                          <span
                            className="shrink-0 rounded-full border-2 border-black px-1.5 py-0.5 text-[9px] font-black uppercase leading-none"
                            style={{ background: cs.bg, color: cs.fg }}
                          >
                            {cs.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-black uppercase opacity-60">Pronóstico resumido por horas</div>
                {upcomingHours.length === 0 ? (
                  <div className="mt-2 text-xs font-bold opacity-60">Cargando pronóstico…</div>
                ) : (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {upcomingHours.map((h, i) => {
                      const HourIcon = h.condition === "rain" ? CloudRain : h.condition === "sunny" ? Sun : Cloud;
                      return (
                        <div key={i} className="flex shrink-0 flex-col items-center gap-1 rounded-xl border-2 border-black bg-[#FAF7F0] px-2.5 py-2">
                          <span className="text-[10px] font-black uppercase">{h.hourLabel}</span>
                          <HourIcon className="h-4 w-4" />
                          <span className="text-xs font-black">{Math.round(h.temp)}°</span>
                          <span className="text-[9px] font-bold opacity-60">{Math.round(h.precipProb)}% lluvia</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={() => document.getElementById("anomalias")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border-[3px] border-black bg-[#FFE066] px-3 py-2 text-xs font-black uppercase"
              >
                Ver centro de anomalías <ArrowRight className="h-4 w-4" />
              </button>
            </Brick>
          </div>
        </div>
      </section>

      {/* PANEL */}
      <section id="panel" className="relative mx-auto max-w-7xl px-5 pt-24">
        
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-black uppercase opacity-60">El panel</div>
            <h2 className="display text-5xl md:text-7xl">Un año de Quito,<br/>en una pestaña.</h2>
          </div>
          <p className="max-w-md text-base font-medium text-black/70">
            Elige un sensor para ver su historial de un año completo. Los puntos en <span className="rounded-md border-2 border-black bg-[#FF6B6B] px-1.5">coral</span> son días que se salieron bastante de lo normal para Quito.
          </p>
        </div>

        {/* Sensor tabs */}
        <div className="mb-6 flex flex-wrap gap-3">
          {SENSORS.map(s => {
            const Icon = s.icon;
            const isActive = s.key === active;
            return (
              <motion.button
                key={s.key}
                onClick={() => setActive(s.key)}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}
                className="flex items-center gap-2 rounded-2xl border-[3px] border-black px-4 py-2.5 text-sm font-black uppercase"
                style={{
                  background: isActive ? s.color : "#fff",
                  boxShadow: isActive ? "6px 6px 0 0 #0A0A0A" : "3px 3px 0 0 #0A0A0A",
                }}
              >
                <Icon className="h-4 w-4" /> {s.label}
              </motion.button>
            );
          })}
        </div>

        {/* Chart */}
        <Brick color="#fff" className="p-5 md:p-8">
          {err && <div className="text-coral font-bold">Error: {err}</div>}
          {!data && !err && <div className="flex h-[400px] items-center justify-center font-bold opacity-50">Cargando datos públicos…</div>}
          {data && (
            <AnimatePresence mode="wait">
              <motion.div key={active}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase opacity-60">Sensor activo</div>
                    <div className="display text-3xl">{activeSensor.label} <span className="text-base font-bold opacity-50">({activeSensor.unit})</span></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                    <span title="Promedio (μ): el valor típico de este sensor en el rango elegido." className="cursor-help rounded-lg border-2 border-black bg-white px-2 py-1">μ {chartData.mean.toFixed(2)}</span>
                    <span title="Variación (σ): cuánto suele subir o bajar este sensor respecto al promedio." className="cursor-help rounded-lg border-2 border-black bg-white px-2 py-1">σ {chartData.std.toFixed(2)}</span>
                    <span title="Días en los que este sensor se salió bastante de lo normal." className="cursor-help rounded-lg border-2 border-black px-2 py-1" style={{ background: COLORS.coral }}>{chartData.anomalies.length} anomalías</span>
                    <motion.button
                      onClick={downloadChartPng}
                      whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }}
                      className="inline-flex items-center gap-1.5 rounded-xl border-[3px] border-black bg-[#FFE066] px-3 py-1.5 text-[11px] font-black uppercase"
                      style={{ boxShadow: "3px 3px 0 0 #0A0A0A" }}
                    >
                      <Download className="h-3.5 w-3.5" /> Descargar gráfica
                    </motion.button>
                  </div>
                </div>

                {/* Zoom range presets */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase opacity-60"><ZoomIn className="h-3.5 w-3.5" /> Zoom</span>
                  {RANGES.map(r => {
                    const isOn = rangeDays === r.days;
                    return (
                      <motion.button
                        key={r.key}
                        onClick={() => setRangeDays(r.days)}
                        whileTap={{ scale: 0.95 }}
                        className="rounded-xl border-[3px] border-black px-3 py-1.5 text-xs font-black uppercase"
                        style={{
                          background: isOn ? COLORS.ink : "#fff",
                          color: isOn ? "#fff" : COLORS.ink,
                          boxShadow: isOn ? "4px 4px 0 0 #0A0A0A" : "2px 2px 0 0 #0A0A0A",
                        }}
                      >
                        {r.label}
                      </motion.button>
                    );
                  })}
                  <span className="ml-1 text-xs font-bold opacity-60">o arrastra el selector inferior ↓</span>
                </div>

                <div ref={chartRef} className="h-[420px] w-full bg-white">
                  <ResponsiveContainer>
                    <AreaChart data={chartData.rows} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={activeSensor.color} stopOpacity={0.9} />
                          <stop offset="100%" stopColor={activeSensor.color} stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#0A0A0A" strokeOpacity={0.08} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700 }} stroke="#0A0A0A" interval={Math.max(0, Math.floor(chartData.rows.length / 8))} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 700 }} stroke="#0A0A0A" />
                      <Tooltip
                        contentStyle={{ border: "3px solid #0A0A0A", borderRadius: 12, background: "#fff", boxShadow: "5px 5px 0 0 #0A0A0A", fontWeight: 700 }}
                        formatter={(v: number) => [`${v?.toFixed?.(2)} ${activeSensor.unit}`, activeSensor.label]}
                      />
                      <Area type="monotone" dataKey="value" stroke="#0A0A0A" strokeWidth={2.5} fill="url(#g)" />
                      {chartData.anomalies.map(a => (
                        <ReferenceDot key={a.date} x={chartData.rows[a.index]?.label} y={a.value}
                          r={6} fill={COLORS.coral} stroke="#0A0A0A" strokeWidth={2.5} />
                      ))}
                      <Brush
                        dataKey="label"
                        height={28}
                        travellerWidth={12}
                        stroke="#0A0A0A"
                        fill={COLORS.yellow}
                        tickFormatter={() => ""}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </Brick>

      </section>

      {/* CENTRO DE ANOMALÍAS */}
      {data && (
        <section id="anomalias" className="relative mx-auto max-w-7xl px-5 pt-24">
          
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase opacity-60">
                <Layers className="h-4 w-4" /> Centro de anomalías
              </div>
              <h2 className="display text-5xl md:text-7xl">Todas las anomalías,<br/>filtrables.</h2>
            </div>
            <p className="max-w-md text-sm font-medium text-black/70">
              Detectamos anomalías con reglas basadas en física (Heat Index NOAA, VPD), en estadística (comparar con lo normal) y en sentido común (cambios imposibles, sensores atascados, lecturas raras). Usa los filtros para explorarlas.
            </p>
            <BounceButton color={COLORS.mint} onClick={async () => {
              const wb = new ExcelJS.Workbook();
              const ws = wb.addWorksheet("Anomalías", { views: [{ state: "frozen", ySplit: 1 }] });
              ws.columns = [
                { header: "Fecha", key: "fecha", width: 15 },
                { header: "Regla", key: "regla", width: 25 },
                { header: "Variable", key: "variable", width: 25 },
                { header: "Base", key: "basis", width: 18 },
                { header: "Descripción", key: "descripcion", width: 80 },
              ];
              filteredEvents.forEach((e: any) => {
                ws.addRow({
                  fecha: new Date(e.date).toLocaleDateString("es-EC"),
                  regla: e.ruleLabel,
                  variable: e.variable,
                  basis: e.basis,
                  descripcion: e.description,
                });
              });
              const header = ws.getRow(1);
              header.font = { bold: true };
              header.eachCell((cell) => {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
                cell.border = {
                  top: { style: "thin" }, left: { style: "thin" },
                  bottom: { style: "thin" }, right: { style: "thin" },
                };
                cell.alignment = { vertical: "middle", horizontal: "left" };
              });
              ws.getColumn("descripcion").alignment = { wrapText: true, vertical: "top" };
              ws.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: Math.max(1, filteredEvents.length + 1), column: 5 },
              };
              const buf = await wb.xlsx.writeBuffer();
              saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `quitolerta-anomalias-${new Date().toISOString().slice(0,10)}.xlsx`);
            }}>
              <Download className="h-5 w-5" /> Exportar Excel
            </BounceButton>
            <BounceButton color={COLORS.yellow} onClick={downloadPdfReport}>
              <Download className="h-5 w-5" /> Descargar reporte
            </BounceButton>
          </div>

          {/* Filters */}
          <Brick color="#fff" className="p-5 md:p-6 mb-6">
            <div className="flex items-center gap-2 mb-3 text-xs font-black uppercase opacity-60">
              <Filter className="h-3.5 w-3.5" /> Filtros
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase opacity-60">
                Variable
                <InfoTip text="Filtra las anomalías según qué sensor midió el problema: temperatura, lluvia, viento, radiación o humedad. 'Multi' son anomalías que combinan varias señales a la vez (por ejemplo, temperatura + humedad).">
                  <Info className="h-3.5 w-3.5 cursor-help" />
                </InfoTip>
              </div>
              <div className="flex flex-wrap gap-2">
                {variableOptions.map(v => {
                  const on = varFilter === v;
                  return (
                    <InfoTip key={v} text={VARIABLE_DESCRIPTIONS[v] ?? v}>
                      <motion.button onClick={() => setVarFilter(v)} whileTap={{ scale: 0.95 }}
                        className="cursor-help rounded-xl border-[3px] border-black px-3 py-1.5 text-xs font-black uppercase"
                        style={{ background: on ? COLORS.ink : "#fff", color: on ? "#fff" : COLORS.ink,
                          boxShadow: on ? "4px 4px 0 0 #0A0A0A" : "2px 2px 0 0 #0A0A0A" }}>
                        {v}
                      </motion.button>
                    </InfoTip>
                  );
                })}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase opacity-60">
                Rango de fechas
                <InfoTip text="Muestra solo las anomalías detectadas entre las dos fechas que elijas.">
                  <Info className="h-3.5 w-3.5 cursor-help" />
                </InfoTip>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="rounded-xl border-[3px] border-black bg-white px-3 py-1.5 text-xs font-black uppercase"
                  style={{ boxShadow: "2px 2px 0 0 #0A0A0A" }}
                />
                <span className="text-xs font-black opacity-60">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="rounded-xl border-[3px] border-black bg-white px-3 py-1.5 text-xs font-black uppercase"
                  style={{ boxShadow: "2px 2px 0 0 #0A0A0A" }}
                />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="rounded-xl border-[3px] border-black bg-white px-3 py-1.5 text-xs font-black uppercase opacity-70 hover:opacity-100">
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase opacity-60">
                Regla heurística (combinable)
                <InfoTip text="Cada regla es un criterio distinto para detectar algo raro en los datos. Puedes activar varias a la vez: verás las anomalías que cumplan cualquiera de las que marques. Pasa el cursor sobre cada una para ver qué detecta y su color.">
                  <Info className="h-3.5 w-3.5 cursor-help" />
                </InfoTip>
              </div>
              <div className="flex flex-wrap gap-2">
                {ruleCatalog.map(r => {
                  const n = allEventsWithSim.filter(e => e.rule === r.key).length;
                  const on = ruleFilter.has(r.key);
                  return (
                    <InfoTip key={r.key} text={r.desc} color={r.color}>
                      <motion.button onClick={() => toggleRule(r.key)} whileTap={{ scale: 0.95 }}
                        className="flex cursor-help items-center gap-1.5 rounded-xl border-[3px] border-black px-3 py-1.5 text-xs font-black uppercase"
                        style={{ background: on ? r.color : "#fff",
                          boxShadow: on ? "4px 4px 0 0 #0A0A0A" : "2px 2px 0 0 #0A0A0A" }}>
                        {/* Código de color siempre visible, aunque la regla no esté activa (antes: sección "¿Por qué cada color?") */}
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-black" style={{ background: r.color }} />
                        {r.label} <span className="opacity-60">({n})</span>
                      </motion.button>
                    </InfoTip>
                  );
                })}
                {ruleFilter.size > 0 && (
                  <button onClick={() => setRuleFilter(new Set())}
                    className="rounded-xl border-[3px] border-black bg-white px-3 py-1.5 text-xs font-black uppercase opacity-70 hover:opacity-100">
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase">
              <span className="rounded-full border-[3px] border-black bg-[#FFE066] px-3 py-1">{filteredEvents.length} de {allEventsWithSim.length} eventos</span>
            </div>
          </Brick>

          {filteredEvents.length === 0 ? (
            <Brick color="#fff" className="p-6">
              <p className="font-bold opacity-70">Sin eventos para los filtros seleccionados.</p>
            </Brick>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {pageEvents.map((e, i) => {
                  const Icon = e.icon;
                  const crit = e.criticality ?? criticalityOf(e);
                  const critStyle = CRITICALITY_STYLES[crit];
                  return (
                    <motion.div key={e.date + e.rule + pageStart + i}
                      initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                      <Brick color={e.color} className="p-5 h-full">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-white">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className="rounded-full border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase"
                              style={{ background: critStyle.bg, color: critStyle.fg }}
                            >
                              Crit. {critStyle.label}
                            </span>
                            <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase">
                              {e.basis}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 text-[10px] font-black uppercase opacity-70">{e.ruleLabel} · {e.variable}</div>
                        <div className="display mt-1 text-lg leading-tight">
                          {new Date(e.date).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                        <p className="mt-2 text-xs font-medium text-black/80">{e.description}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {e.signals.map((s, k) => (
                            <span key={s.label + k} className="rounded-md border-2 border-black bg-white px-2 py-0.5 text-[11px] font-black">
                              {s.label} {s.value}
                              {s.z !== undefined ? (
                                <span title="Qué tan alejado está de lo normal: mientras más grande el número, más raro." className="cursor-help opacity-50"> (z {s.z.toFixed(1)})</span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      </Brick>
                    </motion.div>
                  );
                })}
              </div>
              {/* Paginación */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <motion.button
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="flex items-center gap-2 rounded-2xl border-[3px] border-black bg-white px-5 py-2.5 text-sm font-black uppercase disabled:opacity-30"
                  >
                    <ArrowRight className="h-4 w-4 rotate-180" /> Anterior
                  </motion.button>
                  <span className="text-sm font-black">
                    {page} / {totalPages}
                  </span>
                  <motion.button
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }}
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="flex items-center gap-2 rounded-2xl border-[3px] border-black bg-white px-5 py-2.5 text-sm font-black uppercase disabled:opacity-30"
                  >
                    Siguiente <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* HOW */}
      <section className="relative mx-auto max-w-7xl px-5 py-24">
        <StarDeco side="right" top="30px" size={240} rotate={-18} />
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "1. Recolectamos", d: "Open-Meteo nos da datos del clima de Quito, hora a hora y día a día, de forma abierta y gratuita.", c: COLORS.yellow, i: Radio },
            { t: "2. Analizamos", d: "Calculamos cuál es el valor normal de cada sensor y cuánto suele variar, usando un año completo de datos.", c: COLORS.mint, i: Activity },
            { t: "3. Alertamos", d: "Marcamos como anomalía cualquier día que se salga bastante de lo normal, para que resalte al instante.", c: COLORS.coral, i: AlertTriangle },
          ].map((s, i) => {
            const Icon = s.i;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Brick color={s.c} className="p-6" rotate={i === 1 ? -1.5 : i === 2 ? 1.5 : 0}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border-[3px] border-black bg-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h4 className="display mt-4 text-2xl">{s.t}</h4>
                  <p className="mt-2 text-sm font-medium">{s.d}</p>
                </Brick>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-7xl px-5 pb-24">
        <StarDeco side="left" top="-40px" size={220} rotate={25} />
        <Brick color={COLORS.blue} className="overflow-hidden p-10 text-white md:p-16">
          <div className="grain absolute inset-0" />
          <div className="relative flex flex-wrap items-center justify-between gap-8">
            <div>
              <h3 className="display text-5xl md:text-7xl">¿Quieres ver cómo hicimos esto y más cosas?</h3>
              <p className="mt-3 max-w-xl text-lg font-medium text-white/85">Explora el panel de validación, donde comparamos qué tan bien funcionan nuestras reglas de detección probándolas con casos de prueba.</p>
            </div>
            <a
              href="/validacion"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border-[3px] border-black bg-[#FFE066] px-6 py-4 text-sm font-black uppercase tracking-tight text-black transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: "6px 6px 0 0 #0A0A0A" }}
            >
              Ver validación <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </Brick>
      </section>

      {/* FOOTER */}
      <footer className="border-t-[3px] border-black">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm font-bold">
          <div>© {new Date().getFullYear()} Quitolerta · Hecho con cariño en la mitad del mundo</div>
          <div className="opacity-70">Datos: Open-Meteo (CC-BY 4.0)</div>
        </div>
      </footer>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, bg }: { icon: typeof Wind; label: string; value: string; bg: string }) {
  return (
    <div className="rounded-2xl border-[3px] border-black p-3" style={{ background: bg, boxShadow: "3px 3px 0 0 #0A0A0A" }}>
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}
