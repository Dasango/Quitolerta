import type {
  Daily,
  PerturbationType,
  SyntheticCase,
  ValidationCatalog,
  SensorKey,
  RuleKey,
} from "./types";
import {
  SENSOR_KEYS,
  ANOMALOUS_PERTURBATIONS,
  PERTURBATION_LABELS,
  PERTURBATION_TO_RULE,
} from "./types";

function cloneDaily(d: Daily): Daily {
  return {
    time: [...d.time],
    temperature_2m_max: d.temperature_2m_max ? [...d.temperature_2m_max] : [],
    temperature_2m_min: d.temperature_2m_min ? [...d.temperature_2m_min] : [],
    temperature_2m_mean: d.temperature_2m_mean ? [...d.temperature_2m_mean] : [],
    precipitation_sum: d.precipitation_sum ? [...d.precipitation_sum] : [],
    wind_speed_10m_max: d.wind_speed_10m_max ? [...d.wind_speed_10m_max] : [],
    shortwave_radiation_sum: d.shortwave_radiation_sum
      ? [...d.shortwave_radiation_sum]
      : [],
    relative_humidity_2m_mean: d.relative_humidity_2m_mean
      ? [...d.relative_humidity_2m_mean]
      : [],
  };
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickIndex(len: number, rng: () => number): number {
  return Math.floor(rng() * len);
}

/* ------------------------------------------------------------------ */
/*  Perturbation magnitudes – documentadas para citación académica     */
/* ------------------------------------------------------------------ */

function applyUnivariateSpike(
  daily: Daily,
  idx: number,
  rng: () => number,
): { variable: SensorKey; delta: number; description: string } {
  const sensor = pick(SENSOR_KEYS, rng);
  const arr = daily[sensor] as number[] | undefined;
  if (!arr || idx >= arr.length) {
    return { variable: sensor, delta: 0, description: "" };
  }
  const original = arr[idx];
  if (original == null || Number.isNaN(original)) {
    return { variable: sensor, delta: 0, description: "" };
  }
  const deltas: Partial<Record<SensorKey, { max: number; label: string }>> = {
    temperature_2m_mean: { max: 8, label: "±8 °C" },
    precipitation_sum: { max: 40, label: "+40 mm" },
    wind_speed_10m_max: { max: 25, label: "+25 km/h" },
    shortwave_radiation_sum: { max: 15, label: "+15 MJ/m²" },
    relative_humidity_2m_mean: { max: 30, label: "±30 %" },
  };
  const cfg = deltas[sensor];
  if (!cfg) return { variable: sensor, delta: 0, description: "" };
  const sign = rng() > 0.5 ? 1 : -1;
  const delta = sign * (cfg.max * (0.8 + rng() * 0.4));
  arr[idx] = original + delta;
  return {
    variable: sensor,
    delta: Math.round(delta * 100) / 100,
    description: `${sensor}: ${original.toFixed(1)} → ${arr[idx].toFixed(1)} (Δ = ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} ${cfg.label})`,
  };
}

function applyHeatIndexEvent(
  daily: Daily,
  idx: number,
): { description: string } {
  // Perturbación: temperatura ~34°C, humedad ~50%, radiación alta
  const t = daily.temperature_2m_mean;
  const h = daily.relative_humidity_2m_mean;
  const r = daily.shortwave_radiation_sum;
  const origT = t[idx],
    origH = h?.[idx],
    origR = r[idx];
  t[idx] = 34;
  if (h) h[idx] = 50;
  if (r) r[idx] = Math.max(r[idx] * 2, 25);
  return {
    description: `Temp: ${origT?.toFixed(1) ?? "?"} → 34 °C · Hum: ${origH?.toFixed(0) ?? "?"} → 50 % · Rad ×2. Simula calor seco (HI NOAA ≥27 °C, zR ≥0.5).`,
  };
}

function applyVpdFireEvent(
  daily: Daily,
  idx: number,
): { description: string } {
  const t = daily.temperature_2m_mean;
  const h = daily.relative_humidity_2m_mean;
  const w = daily.wind_speed_10m_max;
  const p = daily.precipitation_sum;
  const origT = t[idx],
    origH = h?.[idx],
    origW = w[idx],
    origP = p[idx];
  t[idx] = 32;
  if (h) h[idx] = 20;
  w[idx] = (w[idx] ?? 0) + 20;
  p[idx] = 0;
  return {
    description: `Temp: ${origT?.toFixed(1) ?? "?"} → 32 °C · Hum: ${origH?.toFixed(0) ?? "?"} → 20 % · Viento +20 km/h · Precip = 0. Simula VPD ≥1.5 kPa + viento + sequía.`,
  };
}

function applyStormEvent(daily: Daily, idx: number): { description: string } {
  const p = daily.precipitation_sum;
  const w = daily.wind_speed_10m_max;
  const origP = p[idx],
    origW = w[idx];
  p[idx] = (p[idx] ?? 0) + 50;
  w[idx] = (w[idx] ?? 0) + 25;
  return {
    description: `Precip: ${origP?.toFixed(1) ?? "?"} → ${p[idx].toFixed(1)} mm (+50 mm) · Viento: ${origW?.toFixed(1) ?? "?"} → ${w[idx].toFixed(1)} km/h (+25 km/h). Simula tormenta (zP ≥1.5 + zW ≥1.2).`,
  };
}

function applyColdHumidEvent(
  daily: Daily,
  idx: number,
): { description: string } {
  const t = daily.temperature_2m_mean;
  const h = daily.relative_humidity_2m_mean;
  const origT = t[idx],
    origH = h?.[idx];
  t[idx] = (t[idx] ?? 15) - 6;
  if (h) h[idx] = (h[idx] ?? 70) + 30;
  const newHum = h?.[idx];
  return {
    description: `Temp: ${origT?.toFixed(1) ?? "?"} → ${t[idx].toFixed(1)} °C (-6 °C) · Hum: ${origH?.toFixed(0) ?? "?"} → ${newHum?.toFixed(0) ?? "?"} % (+30 %). Simula frío húmedo (zT ≤-1.5 + zH ≥1.0).`,
  };
}

function applyAbruptJumpEvent(
  daily: Daily,
  idx: number,
): { description: string } {
  // Salta temperatura en +12 °C respecto al día anterior (límite: 8 °C)
  const t = daily.temperature_2m_mean;
  const orig = t[idx];
  if (idx === 0 || orig == null) {
    return { description: "No se pudo aplicar (índice 0 o valor nulo)." };
  }
  const prev = t[idx - 1];
  if (prev == null) {
    return { description: "No se pudo aplicar (día anterior nulo)." };
  }
  t[idx] = prev + 12;
  return {
    description: `Temp: ${orig.toFixed(1)} → ${t[idx].toFixed(1)} °C (salto de +12 °C en 24 h; límite plausible = 8 °C). Simula salto abrupto.`,
  };
}

function applySensorFrozenEvent(
  daily: Daily,
  idx: number,
): { description: string } {
  // Congela temperatura: 3 días consecutivos con el mismo valor
  const t = daily.temperature_2m_mean;
  const orig = t[idx];
  if (orig == null) return { description: "Valor nulo, no se aplica." };
  const frozenValue = 21.3;
  if (idx + 2 < t.length) {
    t[idx] = frozenValue;
    t[idx + 1] = frozenValue;
    t[idx + 2] = frozenValue;
  }
  return {
    description: `Temp: ${orig.toFixed(1)} → 21.3 °C ×3 días consecutivos (índices ${idx}–${idx + 2}). Simula sensor congelado.`,
  };
}

function applyRadiationInconsistentEvent(
  daily: Daily,
  idx: number,
): { description: string } {
  const r = daily.shortwave_radiation_sum;
  const p = daily.precipitation_sum;
  const origR = r[idx],
    origP = p[idx];
  r[idx] = 0.5;
  p[idx] = 0;
  return {
    description: `Radiación: ${origR?.toFixed(1) ?? "?"} → 0.5 MJ/m² · Precip: ${origP?.toFixed(1) ?? "?"} → 0 mm. Simula radiación incoherente en día sin lluvia (<2 MJ/m², <1 mm).`,
  };
}

/* ------------------------------------------------------------------ */
/*  Configuración por defecto                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_CONFIG = {
  seed: 42,
  total_cases: 200,
  normal_ratio: 0.7,
  // Distribución entre tipos anómalos (proporciones relativas)
  anomaly_distribution: {
    univariate_spike: 0.2,
    heat_index_event: 0.15,
    vpd_fire_event: 0.1,
    storm_event: 0.15,
    cold_humid_event: 0.15,
    abrupt_jump_event: 0.1,
    sensor_frozen_event: 0.05,
    radiation_inconsistent_event: 0.1,
  },
};

/* ------------------------------------------------------------------ */
/*  Generador principal                                                */
/* ------------------------------------------------------------------ */

export function generateSyntheticCases(
  baseDaily: Daily,
  config: {
    seed?: number;
    total_cases?: number;
    normal_ratio?: number;
    anomaly_distribution?: Partial<Record<PerturbationType, number>>;
  } = {},
): ValidationCatalog {
  const seed = config.seed ?? DEFAULT_CONFIG.seed;
  const totalCases = config.total_cases ?? DEFAULT_CONFIG.total_cases;
  const normalRatio = config.normal_ratio ?? DEFAULT_CONFIG.normal_ratio;
  const anomalyDist = {
    ...DEFAULT_CONFIG.anomaly_distribution,
    ...config.anomaly_distribution,
  };

  const rng = mulberry32(seed);
  const len = baseDaily.time.length;
  // No puede haber más casos que días disponibles en el dataset base:
  // cada caso ocupa un índice de día distinto.
  const maxCases = Math.min(totalCases, len);

  // Build cumulative distribution for anomaly type selection
  const anomalyTypes = ANOMALOUS_PERTURBATIONS;
  const weights = anomalyTypes.map((t) => anomalyDist[t] ?? 0);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const cumSum: number[] = [];
  let acc = 0;
  for (const w of weights) {
    acc += w / totalWeight;
    cumSum.push(acc);
  }

  function pickAnomalyType(): PerturbationType {
    const r = rng();
    for (let i = 0; i < cumSum.length; i++) {
      if (r <= cumSum[i]) return anomalyTypes[i];
    }
    return anomalyTypes[anomalyTypes.length - 1];
  }

  // Decide which indices get perturbations
  const indices = new Set<number>();
  while (indices.size < maxCases) {
    indices.add(pickIndex(len, rng));
  }
  const shuffledIndices = Array.from(indices);
  shuffledIndices.sort(() => rng() - 0.5);

  const nAnomalous = Math.round(shuffledIndices.length * (1 - normalRatio));
  const anomalousIndices = new Set(shuffledIndices.slice(0, nAnomalous));
  const normalIndices = shuffledIndices.slice(nAnomalous);

  const syntheticDaily = cloneDaily(baseDaily);
  const cases: SyntheticCase[] = [];

  const getValues = (idx: number): Record<string, number> => {
    const vals: Record<string, number> = {};
    for (const k of SENSOR_KEYS) {
      const arr = baseDaily[k] as number[] | undefined;
      vals[k] = arr?.[idx] ?? NaN;
    }
    return vals;
  };

  const getPerturbedValues = (idx: number): Record<string, number> => {
    const vals: Record<string, number> = {};
    for (const k of SENSOR_KEYS) {
      const arr = syntheticDaily[k] as number[] | undefined;
      vals[k] = arr?.[idx] ?? NaN;
    }
    return vals;
  };

  // Process anomalous indices
  for (const idx of anomalousIndices) {
    const ts = baseDaily.time[idx];
    const origVals = getValues(idx);
    const pType = pickAnomalyType();
    let desc = "";

    switch (pType) {
      case "univariate_spike": {
        const result = applyUnivariateSpike(syntheticDaily, idx, rng);
        desc = result.description;
        break;
      }
      case "heat_index_event": {
        const result = applyHeatIndexEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      case "vpd_fire_event": {
        const result = applyVpdFireEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      case "storm_event": {
        const result = applyStormEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      case "cold_humid_event": {
        const result = applyColdHumidEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      case "abrupt_jump_event": {
        const result = applyAbruptJumpEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      case "sensor_frozen_event": {
        const result = applySensorFrozenEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      case "radiation_inconsistent_event": {
        const result = applyRadiationInconsistentEvent(syntheticDaily, idx);
        desc = result.description;
        break;
      }
      default:
        break;
    }

    const pertVals = getPerturbedValues(idx);
    const rule = PERTURBATION_TO_RULE[pType];

    cases.push({
      id: `synth-${idx}`,
      timestamp: ts,
      index: idx,
      perturbation: pType,
      label: PERTURBATION_LABELS[pType],
      is_anomaly: true,
      variable: pType === "univariate_spike" ? "temperature_2m_mean" : rule ?? null,
      heuristic_rule: rule,
      magnitude_description: desc,
      original_values: origVals,
      perturbed_values: pertVals,
    });

    // For frozen sensor, skip the next 2 indices to avoid overlap
    if (pType === "sensor_frozen_event") {
      for (let skip = 1; skip <= 2; skip++) {
        const sk = idx + skip;
        if (sk < len) {
          const sv = getValues(sk);
          const spv = getPerturbedValues(sk);
          cases.push({
            id: `synth-${sk}`,
            timestamp: baseDaily.time[sk],
            index: sk,
            perturbation: "sensor_frozen_event",
            label: PERTURBATION_LABELS.sensor_frozen_event,
            is_anomaly: true,
            variable: "temperature_2m_mean",
            heuristic_rule: "sensor_frozen",
            magnitude_description: "Congelado (parte del evento de 3 días)",
            original_values: sv,
            perturbed_values: spv,
          });
        }
      }
    }
  }

  // Process normal indices (control)
  for (const idx of normalIndices) {
    const ts = baseDaily.time[idx];
    const origVals = getValues(idx);
    cases.push({
      id: `synth-${idx}`,
      timestamp: ts,
      index: idx,
      perturbation: "control_normal",
      label: PERTURBATION_LABELS.control_normal,
      is_anomaly: false,
      variable: null,
      heuristic_rule: null,
      magnitude_description: "Sin perturbación aplicada. Caso de control normal.",
      original_values: origVals,
      perturbed_values: origVals,
    });
  }

  // Sort by index
  cases.sort((a, b) => a.index - b.index);

  const anomalyTypesUsed = Array.from(
    new Set(cases.filter((c) => c.is_anomaly).map((c) => c.perturbation)),
  );

  return {
    id: `val-${seed}-${Date.now()}`,
    generated_at: new Date().toISOString(),
    seed,
    base_date_range: {
      start: baseDaily.time[0],
      end: baseDaily.time[len - 1],
    },
    config: {
      total_cases: cases.length,
      normal_ratio: normalRatio,
      anomalous_ratio: 1 - normalRatio,
      distribution: anomalyDist,
      anomaly_types_used: anomalyTypesUsed,
    },
    cases,
    synthetic_daily: syntheticDaily,
  };
}

// Storage helpers

const STORAGE_KEY = "quitolerta_validation_catalog";

export function saveCatalog(catalog: ValidationCatalog): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
  } catch {
    console.warn("No se pudo guardar el catálogo en localStorage.");
  }
}

export function loadCatalog(): ValidationCatalog | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ValidationCatalog;
  } catch {
    return null;
  }
}

export function clearCatalog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
