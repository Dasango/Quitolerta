/**
 * Motor de detección para el módulo de validación experimental.
 * Réplica funcional (sin JSX/UI) de las mismas reglas físicas, estadísticas
 * y de plausibilidad usadas en el panel principal de Quitolerta, para poder
 * evaluarlas contra el catálogo sintético de forma independiente.
 */
import type { Daily, DetectionMode, RuleKey } from "./types";
import { SENSOR_KEYS } from "./types";

type EngineEvent = {
  date: string;
  index: number;
  rule: RuleKey;
  [key: string]: unknown;
};

function zScores(values: number[]): number[] {
  const valid = values.filter((v) => v != null && !Number.isNaN(v));
  if (!valid.length) return values.map(() => 0);
  const m = valid.reduce((s, v) => s + v, 0) / valid.length;
  const sd = Math.sqrt(valid.reduce((s, v) => s + (v - m) ** 2, 0) / valid.length) || 1;
  return values.map((v) => (v == null || Number.isNaN(v) ? 0 : (v - m) / sd));
}

// Heat Index (regresión NOAA Rothfusz). Entradas: T °C, RH %. Salida: °C.
function heatIndexC(tC: number, rh: number): number {
  if (tC == null || rh == null || Number.isNaN(tC) || Number.isNaN(rh)) return NaN;
  const T = (tC * 9) / 5 + 32;
  const R = rh;
  if (T < 80) {
    const hi = 0.5 * (T + 61 + (T - 68) * 1.2 + R * 0.094);
    return ((hi - 32) * 5) / 9;
  }
  const hi =
    -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R -
    6.83783e-3 * T * T - 5.481717e-2 * R * R +
    1.22874e-3 * T * T * R + 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
  return ((hi - 32) * 5) / 9;
}

// Déficit de presión de vapor en kPa (Tetens). Entradas: T °C, RH %.
function vpdKPa(tC: number, rh: number): number {
  if (tC == null || rh == null || Number.isNaN(tC) || Number.isNaN(rh)) return NaN;
  const svp = 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
  return svp * (1 - rh / 100);
}

const JUMP_LIMITS: Record<string, number> = {
  temperature_2m_mean: 8,
  precipitation_sum: 60,
  wind_speed_10m_max: 35,
  shortwave_radiation_sum: 20,
  relative_humidity_2m_mean: 45,
};

/** Corre las 8 reglas de detección (univariada + 7 heurísticas) sobre una serie diaria. */
export function detectAllRuleEvents(daily: Daily): EngineEvent[] {
  const t = daily.temperature_2m_mean ?? [];
  const p = daily.precipitation_sum ?? [];
  const w = daily.wind_speed_10m_max ?? [];
  const r = daily.shortwave_radiation_sum ?? [];
  const h = daily.relative_humidity_2m_mean ?? [];
  const zT = zScores(t), zP = zScores(p), zW = zScores(w), zR = zScores(r), zH = zScores(h);
  const events: EngineEvent[] = [];

  // 1) Univariada por sensor (|z| >= 2.2)
  // Umbral 2.2 tomado de las bases teóricas del documento de investigación
  // (no el |Z| >= 2 de la tabla de validación de instrumentos). Debe coincidir
  // con la regla univariada del panel principal (detectAllRules en index.tsx).
  for (const key of SENSOR_KEYS) {
    const vals = (daily[key] as number[] | undefined) ?? [];
    const valid = vals.filter((v) => v != null && !Number.isNaN(v));
    const m = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
    const sd = Math.sqrt(valid.reduce((a, b) => a + (b - m) ** 2, 0) / (valid.length || 1)) || 1;
    vals.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) return;
      const z = (v - m) / sd;
      if (Math.abs(z) >= 2.2) {
        events.push({ date: daily.time[i], index: i, rule: "univariate" });
      }
    });
  }

  daily.time.forEach((date, i) => {
    // 2) Calor seco (Heat Index NOAA, físico)
    // El documento define la regla con T + RH; la condición extra de radiación
    // (zR >= 0.5) es un refinamiento intencional del equipo (ver nota ampliada
    // en detectAllRules de index.tsx). Se replica idéntica para que la
    // validación mida el detector real.
    const hi = heatIndexC(t[i], h[i]);
    if (!Number.isNaN(hi) && hi >= 27 && zR[i] >= 0.5) {
      events.push({ date, index: i, rule: "heat_index" });
    }

    // 3) Riesgo de incendio (VPD, físico)
    // El documento define la regla con T + RH; las condiciones extra de viento
    // (zW >= 1.2) y poca lluvia (zP <= -0.3) son un refinamiento intencional
    // del equipo (ver nota ampliada en detectAllRules de index.tsx). Se replica
    // idéntica para que la validación mida el detector real.
    const vpd = vpdKPa(t[i], h[i]);
    if (!Number.isNaN(vpd) && vpd >= 1.5 && zW[i] >= 1.2 && zP[i] <= -0.3) {
      events.push({ date, index: i, rule: "vpd_fire" });
    }

    // 4) Tormenta (estadístico)
    if (zP[i] >= 1.5 && zW[i] >= 1.2) {
      events.push({ date, index: i, rule: "storm" });
    }

    // 5) Frío húmedo (estadístico)
    if (zT[i] <= -1.5 && zH[i] >= 1) {
      events.push({ date, index: i, rule: "cold_humid" });
    }

    // 6) Salto abrupto día a día (plausibilidad física)
    if (i > 0) {
      for (const key of SENSOR_KEYS) {
        const arr = (daily[key] as number[] | undefined) ?? [];
        const a = arr[i], b = arr[i - 1];
        if (a == null || b == null) continue;
        const d = Math.abs(a - b);
        const lim = JUMP_LIMITS[key];
        if (lim && d > lim) events.push({ date, index: i, rule: "abrupt_jump" });
      }
    }

    // 7) Sensor congelado: 3+ lecturas idénticas consecutivas
    if (i >= 2) {
      for (const key of SENSOR_KEYS) {
        if (key === "precipitation_sum") continue;
        const arr = (daily[key] as number[] | undefined) ?? [];
        const a = arr[i], b = arr[i - 1], c = arr[i - 2];
        if (a == null || b == null || c == null) continue;
        if (a === b && b === c) events.push({ date, index: i, rule: "sensor_frozen" });
      }
    }

    // 8) Radiación incoherente (plausibilidad física)
    if (r[i] != null && !Number.isNaN(r[i])) {
      if (r[i] < 2 && (p[i] ?? 0) < 1) {
        events.push({ date, index: i, rule: "radiation_inconsistent" });
      } else if (r[i] > 35) {
        events.push({ date, index: i, rule: "radiation_inconsistent" });
      }
    }
  });

  return events;
}

/**
 * Adaptador con la firma esperada por `evaluateDetection`: dado el modo,
 * devuelve solo los eventos relevantes ("univariate" = solo Z-Score global,
 * "combined" = Z-Score + las 7 heurísticas).
 */
export function detectionFn(daily: unknown, mode: DetectionMode): EngineEvent[] {
  const events = detectAllRuleEvents(daily as Daily);
  if (mode === "univariate") return events.filter((e) => e.rule === "univariate");
  return events;
}

/* ------------------------------------------------------------------ */
/*  Datos base reales (Open-Meteo) — mismos endpoints que el panel      */
/* ------------------------------------------------------------------ */

export async function fetchBaseDaily(): Promise<Daily> {
  const end = new Date();
  end.setDate(end.getDate() - 2);
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const archive = `https://archive-api.open-meteo.com/v1/archive?latitude=-0.1807&longitude=-78.4678&start_date=${fmt(start)}&end_date=${fmt(end)}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,shortwave_radiation_sum&hourly=relative_humidity_2m&timezone=America%2FGuayaquil`;

  const res = await fetch(archive);
  const a = await res.json();
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
    daily.relative_humidity_2m_mean = daily.time.map((d) => {
      const arr = byDay.get(d);
      return arr && arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN;
    });
  }

  return daily;
}
