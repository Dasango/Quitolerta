"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import {
LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, CartesianGrid, Area, AreaChart, Brush,
} from "recharts";
import {
Wind, Droplets, Thermometer, CloudRain, Sun, AlertTriangle, MapPin, Activity, Sparkles, ArrowRight, Github, Radio, ZoomIn, Flame, Snowflake, CloudLightning, Layers,
} from "lucide-react";
import { Filter, Zap, Gauge, AlertOctagon, Download } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import quitoHero from "@/assets/quito-hero.png.asset.json";
import starDeco from "@/assets/star.png.asset.json";

function StarDeco({ side, top = "10%", size = 260, rotate = 0 }: { side: "left" | "right"; top?: string; size?: number; rotate?: number }) {
const pos = side === "left" ? { left: `-${Math.round(size / 2)}px` } : { right: `-${Math.round(size / 2)}px` };
return (
<img
src={starDeco.url}
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
{ name: "description", content: "Visualiza 365 días de datos ambientales públicos de Quito, Ecuador. Detecta anomalías de temperatura, viento, lluvia y humedad en tiempo casi real." },
{ property: "og:title", content: "Quitolerta — Sensores Ambientales de Quito" },
{ property: "og:description", content: "365 días de datos públicos de Quito con detección de anomalías." },
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
const move = (e: MouseEvent) => { x.set(e.clientX - 12); y.set(e.clientY - 12); };
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
className="pointer-events-none fixed left-0 top-0 z-[9999] hidden md:block" >
<motion.div
animate={{ scale: hover ? 2.4 : 1 }}
transition={{ type: "spring", stiffness: 400, damping: 25 }}
className="h-6 w-6 rounded-full bg-white"
style={{ mixBlendMode: "difference" }}
/>
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
};

async function fetchData(): Promise<{ daily: Daily; current: Current }> {
const end = new Date();
end.setDate(end.getDate() - 2); // archive lags ~2 days
const start = new Date(end);
start.setDate(start.getDate() - 364);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

const archive = `https://archive-api.open-meteo.com/v1/archive?latitude=-0.1807&longitude=-78.4678&start_date=${fmt(start)}&end_date=${fmt(end)}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,shortwave_radiation_sum&hourly=relative_humidity_2m&timezone=America%2FGuayaquil`;
const live = `https://api.open-meteo.com/v1/forecast?latitude=-0.1807&longitude=-78.4678&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&timezone=America%2FGuayaquil`;

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
return { daily, current: l.current };
}

// ---------- Anomaly detection (z-score) ----------
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
      }} >
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
style={{ background: color, boxShadow: "6px 6px 0 0 #0A0A0A" }} >
{children}
</motion.button>
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
-42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 6.83783e-3 * T * T - 5.481717e-2 * R * R + 1.22874e-3 * T * T * R + 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
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
};

// Physical max plausible day-to-day delta per variable (Quito climatology)
const JUMP_LIMITS: Record<string, number> = {
temperature_2m_mean: 8, // °C
precipitation_sum: 60, // mm
wind_speed_10m_max: 35, // km/h
shortwave_radiation_sum: 20, // MJ/m²
relative_humidity_2m_mean: 45, // %
};

function detectAllRules(daily: Daily): RuleEvent[] {
const t = daily.temperature_2m_mean ?? [];
const p = daily.precipitation_sum ?? [];
const w = daily.wind_speed_10m_max ?? [];
const r = daily.shortwave_radiation_sum ?? [];
const h = daily.relative_humidity_2m_mean ?? [];
const zT = zScores(t), zP = zScores(p), zW = zScores(w), zR = zScores(r), zH = zScores(h);
const events: RuleEvent[] = [];

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
if (Math.abs(z) >= 2.2) {
events.push({
date: daily.time[i], index: i, rule: "univariate",
ruleLabel: "Univariada (|z|≥2.2)", variable: s.label,
description: `${s.label} se desvía ${z.toFixed(1)}σ de la media histórica (μ ${mean.toFixed(1)} ${s.unit}).`,
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
    const hi = heatIndexC(t[i], h[i]);
    if (!Number.isNaN(hi) && hi >= 27 && zR[i] >= 0.5) {
      const level = hi >= 41 ? "Peligro" : hi >= 32 ? "Precaución extrema" : "Precaución";
      events.push({
        date, index: i, rule: "heat_index",
        ruleLabel: "Calor seco (Heat Index NOAA)", variable: "Multi",
        description: `Índice de calor de Steadman = ${hi.toFixed(1)}°C → umbral NOAA «${level}». A pleno sol andino puede subir hasta 8°C más.`,
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
    const vpd = vpdKPa(t[i], h[i]);
    if (!Number.isNaN(vpd) && vpd >= 1.5 && zW[i] >= 1.2 && zP[i] <= -0.3) {
      events.push({
        date, index: i, rule: "vpd_fire",
        ruleLabel: "Riesgo de incendio (VPD ≥ 1.5 kPa)", variable: "Multi",
        description: `Déficit de presión de vapor = ${vpd.toFixed(2)} kPa: atmósfera seca capaz de propagar fuego, junto con viento fuerte y poca lluvia.`,
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
        description: "Lluvia intensa (umbral más alto por su rareza y riesgo de inundación en laderas) con viento fuerte como agravante.",
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
        description: "Temp baja + humedad alta. Sin índice físico equivalente al Heat Index para climas tropicales de montaña: se mantiene como umbral Z validado empíricamente.",
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
            description: `${s.label} cambió ${d.toFixed(1)} ${s.unit} en 24 h — supera el límite físico plausible (${lim} ${s.unit}).`,
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
            description: `${s.label} reportó exactamente ${a.toFixed(2)} ${s.unit} tres días seguidos — patrón típico de fallo.`,
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
          description: `Radiación de ${r[i].toFixed(1)} MJ/m² en día sin lluvia (${(p[i] ?? 0).toFixed(1)} mm). En el ecuador es físicamente improbable.`,
          icon: Gauge, color: COLORS.lilac,
          signals: [sig("Radiación", `${r[i].toFixed(1)} MJ/m²`), sig("Lluvia", `${(p[i] ?? 0).toFixed(1)} mm`)],
          basis: "plausibilidad",
        });
      } else if (r[i] > 35) {
        events.push({
          date, index: i, rule: "radiation_inconsistent",
          ruleLabel: "Radiación incoherente", variable: "Radiación solar",
          description: `Radiación de ${r[i].toFixed(1)} MJ/m² supera el máximo físico esperable para Quito (~33 MJ/m²).`,
          icon: Gauge, color: COLORS.lilac,
          signals: [sig("Radiación", `${r[i].toFixed(1)} MJ/m²`)],
          basis: "plausibilidad",
        });
      }
    }

});

// sort newest first
return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}

const RANGES = [
{ key: "30", label: "Último mes", days: 30 },
{ key: "90", label: "3 meses", days: 90 },
{ key: "180", label: "6 meses", days: 180 },
{ key: "365", label: "Año", days: 365 },
] as const;

// ---------- Main ----------
function Quitolerta() {
const [data, setData] = useState<{ daily: Daily; current: Current } | null>(null);
const [err, setErr] = useState<string | null>(null);
const [active, setActive] = useState<typeof SENSORS[number]["key"]>("temperature_2m_mean");
const [rangeDays, setRangeDays] = useState<number>(365);

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

const ruleCatalog: { key: RuleKey; label: string; color: string }[] = [
{ key: "univariate", label: "Univariada Z", color: COLORS.coral },
{ key: "heat_index", label: "Calor seco (HI NOAA)", color: COLORS.yellow },
{ key: "vpd_fire", label: "Incendio (VPD)", color: COLORS.coral },
{ key: "storm", label: "Tormenta", color: COLORS.blue },
{ key: "cold_humid", label: "Frío húmedo", color: COLORS.mint },
{ key: "abrupt_jump", label: "Salto abrupto", color: COLORS.lilac },
{ key: "sensor_frozen", label: "Sensor congelado", color: COLORS.lilac },
{ key: "radiation_inconsistent", label: "Radiación incoherente", color: COLORS.lilac },
];

const variableOptions = useMemo(() => {
const set = new Set<string>(["Todos", "Multi", ...SENSORS.map(s => s.label)]);
return Array.from(set);
}, []);

const filteredEvents = useMemo(() => {
return allEvents.filter(e =>
(ruleFilter.size === 0 || ruleFilter.has(e.rule)) &&
(varFilter === "Todos" || e.variable === varFilter)
);
}, [allEvents, ruleFilter, varFilter]);

const toggleRule = (k: RuleKey) => {
const next = new Set(ruleFilter);
if (next.has(k)) next.delete(k); else next.add(k);
setRuleFilter(next);
};

const totalAnomalies = useMemo(() => {
if (!data) return 0;
return allEvents.length;
}, [data, allEvents]);

// ---------- HOY ----------
const hoy = useMemo(() => {
if (!data) return null;
const c = data.current;
const hi = heatIndexC(c.temperature_2m, c.relative_humidity_2m);
const vpd = vpdKPa(c.temperature_2m, c.relative_humidity_2m);
const lastIdx = data.daily.time.length - 1;
const lastDate = data.daily.time[lastIdx];
const lastEvents = allEvents.filter(e => e.date === lastDate);
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
}, [data, allEvents]);

return (
<div
className="min-h-screen cursor-none selection:bg-black selection:text-white"
style={{ background: COLORS.bg, color: COLORS.ink, fontFamily: "'Space Grotesk', system-ui, sans-serif" }} >
<CustomCursor />

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
          src={quitoHero.url}
          alt="Virgen del Panecillo sobre Quito"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover"
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
            <h1 className="display text-[clamp(48px,9vw,128px)] leading-[0.9]">
              SIENTE EL <span style={{ color: COLORS.blue }}>CLIMA</span><br />
              DE QUITO COMO <br />
              <span className="inline-block rounded-2xl border-[3px] border-black px-4 py-1" style={{ background: COLORS.yellow, boxShadow: "8px 8px 0 0 #0A0A0A" }}>NUNCA ANTES</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium text-black/70">
              Un panel ambiental abierto que analiza un año completo de sensores públicos sobre la mitad del mundo. Cazamos anomalías de temperatura, lluvia y viento para que las veas antes que nadie.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <BounceButton color={COLORS.blue} onClick={() => document.getElementById("panel")?.scrollIntoView({ behavior: "smooth" })}>
                <span className="text-white">Ver el panel</span>
                <ArrowRight className="h-5 w-5 text-white" />
              </BounceButton>
              <BounceButton color={COLORS.mint}>
                <Github className="h-5 w-5" /> Datos abiertos
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
            { v: "4", l: "sensores públicos", c: COLORS.mint },
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
            Lectura en vivo del sensor Open-Meteo cruzada con los índices físicos (Heat Index NOAA, VPD Tetens) y las anomalías detectadas para el último día disponible.
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
                      return (
                        <li key={i}>
                          <a
                            href="#anomalias"
                            onClick={(ev) => { ev.preventDefault(); document.getElementById("anomalias")?.scrollIntoView({ behavior: "smooth" }); }}
                            className="flex items-start gap-2 rounded-xl border-[3px] border-black p-2 text-xs font-bold"
                            style={{ background: e.color }}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="leading-tight">{e.ruleLabel}</span>
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

      {/* PANEL */}
      <section id="panel" className="relative mx-auto max-w-7xl px-5 pt-24">

        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-black uppercase opacity-60">El panel</div>
            <h2 className="display text-5xl md:text-7xl">Un año de Quito,<br/>en una pestaña.</h2>
          </div>
          <p className="max-w-md text-base font-medium text-black/70">
            Elige un sensor. Las marcas <span className="rounded-md border-2 border-black bg-[#FF6B6B] px-1.5">coral</span> son días con valores fuera de lo normal (z ≥ 2.2σ).
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
                  <div className="flex gap-3 text-xs font-bold">
                    <span className="rounded-lg border-2 border-black bg-white px-2 py-1">μ {chartData.mean.toFixed(2)}</span>
                    <span className="rounded-lg border-2 border-black bg-white px-2 py-1">σ {chartData.std.toFixed(2)}</span>
                    <span className="rounded-lg border-2 border-black px-2 py-1" style={{ background: COLORS.coral }}>{chartData.anomalies.length} anomalías</span>
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

                <div className="h-[420px] w-full">
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
              Reglas físicas (Heat Index NOAA, VPD), estadísticas (Z-score) y de plausibilidad (saltos, sensor congelado, radiación incoherente). Filtra por variable o por regla.
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
          </div>

          {/* Filters */}
          <Brick color="#fff" className="p-5 md:p-6 mb-6">
            <div className="flex items-center gap-2 mb-3 text-xs font-black uppercase opacity-60">
              <Filter className="h-3.5 w-3.5" /> Filtros
            </div>

            <div className="mb-4">
              <div className="text-[11px] font-black uppercase opacity-60 mb-2">Variable</div>
              <div className="flex flex-wrap gap-2">
                {variableOptions.map(v => {
                  const on = varFilter === v;
                  return (
                    <motion.button key={v} onClick={() => setVarFilter(v)} whileTap={{ scale: 0.95 }}
                      className="rounded-xl border-[3px] border-black px-3 py-1.5 text-xs font-black uppercase"
                      style={{ background: on ? COLORS.ink : "#fff", color: on ? "#fff" : COLORS.ink,
                        boxShadow: on ? "4px 4px 0 0 #0A0A0A" : "2px 2px 0 0 #0A0A0A" }}>
                      {v}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-black uppercase opacity-60 mb-2">Regla heurística (combinable)</div>
              <div className="flex flex-wrap gap-2">
                {ruleCatalog.map(r => {
                  const n = allEvents.filter(e => e.rule === r.key).length;
                  const on = ruleFilter.has(r.key);
                  return (
                    <motion.button key={r.key} onClick={() => toggleRule(r.key)} whileTap={{ scale: 0.95 }}
                      className="rounded-xl border-[3px] border-black px-3 py-1.5 text-xs font-black uppercase"
                      style={{ background: on ? r.color : "#fff",
                        boxShadow: on ? "4px 4px 0 0 #0A0A0A" : "2px 2px 0 0 #0A0A0A" }}>
                      {r.label} <span className="opacity-60">({n})</span>
                    </motion.button>
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
              <span className="rounded-full border-[3px] border-black bg-[#FFE066] px-3 py-1">{filteredEvents.length} de {allEvents.length} eventos</span>
            </div>
          </Brick>

          {filteredEvents.length === 0 ? (
            <Brick color="#fff" className="p-6">
              <p className="font-bold opacity-70">Sin eventos para los filtros seleccionados.</p>
            </Brick>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {filteredEvents.slice(0, 30).map((e, i) => {
                const Icon = e.icon;
                return (
                  <motion.div key={e.date + e.rule + i}
                    initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                    <Brick color={e.color} className="p-5 h-full">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase">
                          {e.basis}
                        </span>
                      </div>
                      <div className="mt-3 text-[10px] font-black uppercase opacity-70">{e.ruleLabel} · {e.variable}</div>
                      <div className="display mt-1 text-lg leading-tight">
                        {new Date(e.date).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                      <p className="mt-2 text-xs font-medium text-black/80">{e.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {e.signals.map((s, k) => (
                          <span key={s.label + k} className="rounded-md border-2 border-black bg-white px-2 py-0.5 text-[11px] font-black">
                            {s.label} {s.value}{s.z !== undefined ? <span className="opacity-50"> (z {s.z.toFixed(1)})</span> : null}
                          </span>
                        ))}
                      </div>
                    </Brick>
                  </motion.div>
                );
              })}
            </div>
          )}
          {filteredEvents.length > 30 && (
            <p className="mt-4 text-center text-xs font-bold opacity-60">Mostrando los 30 más recientes de {filteredEvents.length}.</p>
          )}
        </section>
      )}

      {/* HOW */}
      <section className="relative mx-auto max-w-7xl px-5 py-24">
        <StarDeco side="right" top="30px" size={240} rotate={-18} />
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "1. Recolectamos", d: "Open-Meteo expone reanálisis horario y diario de Quito sin necesidad de API key.", c: COLORS.yellow, i: Radio },
            { t: "2. Analizamos", d: "Calculamos media y desviación estándar por sensor sobre 365 días.", c: COLORS.mint, i: Activity },
            { t: "3. Alertamos", d: "Marcamos como anomalía cualquier día con |z| ≥ 2.2 — los días raros saltan.", c: COLORS.coral, i: AlertTriangle },
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
              <h3 className="display text-5xl md:text-7xl">¿Listo para mirar el cielo con datos?</h3>
              <p className="mt-3 max-w-xl text-lg font-medium text-white/85">Quitolerta es público, abierto y se actualiza cada día. Comparte el panel con tu comunidad.</p>
            </div>
            <BounceButton color={COLORS.yellow} onClick={() => document.getElementById("panel")?.scrollIntoView({ behavior: "smooth" })}>
              Explorar ahora <ArrowRight className="h-5 w-5" />
            </BounceButton>
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
