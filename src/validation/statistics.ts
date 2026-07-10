/**
 * Utilidades estadísticas para el módulo de validación experimental.
 * Implementadas sin dependencias externas (proyecto sin librería de estadística).
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Desviación estándar muestral (n-1). */
export function stddev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Percentil por interpolación lineal (método R-7 / Excel). `q` en [0, 1]. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export type BoxPlotStats = {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
};

/** Estadísticos de caja-bigote (Tukey, bigotes a 1.5×IQR). */
export function boxplotStats(values: number[]): BoxPlotStats {
  if (values.length === 0) {
    return { min: 0, q1: 0, median: 0, q3: 0, max: 0, whiskerLow: 0, whiskerHigh: 0, outliers: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const within = sorted.filter((v) => v >= lowFence && v <= highFence);
  const outliers = sorted.filter((v) => v < lowFence || v > highFence);
  return {
    min: sorted[0],
    q1,
    median,
    q3,
    max: sorted[sorted.length - 1],
    whiskerLow: within.length ? within[0] : sorted[0],
    whiskerHigh: within.length ? within[within.length - 1] : sorted[sorted.length - 1],
    outliers,
  };
}

export function skewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const sd = stddev(values);
  if (sd === 0) return 0;
  const m3 = values.reduce((s, v) => s + (v - m) ** 3, 0) / n;
  return m3 / sd ** 3;
}

/* ------------------------------------------------------------------ */
/*  Distribución t de Student — tabla de valores críticos (95%, dos colas) */
/* ------------------------------------------------------------------ */

const T_TABLE_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  31: 2.040, 32: 2.037, 33: 2.035, 34: 2.032, 35: 2.030,
  36: 2.028, 37: 2.026, 38: 2.024, 39: 2.023, 40: 2.021,
};

/** Valor crítico t (95%, dos colas) para un grado de libertad dado. */
export function tCritical95(df: number): number {
  if (df <= 0) return 0;
  if (df in T_TABLE_95) return T_TABLE_95[df];
  if (df > 40) return 1.96; // aproximación normal para muestras grandes
  // interpolación lineal entre los enteros más cercanos de la tabla
  const lo = Math.floor(df);
  const hi = Math.ceil(df);
  const loV = T_TABLE_95[lo] ?? 1.96;
  const hiV = T_TABLE_95[hi] ?? 1.96;
  if (lo === hi) return loV;
  return loV + (hiV - loV) * (df - lo);
}

export type ConfidenceInterval95 = {
  mean: number;
  std: number;
  n: number;
  marginOfError: number;
  lower: number;
  upper: number;
};

/** Media, desviación estándar e intervalo de confianza del 95% (t de Student). */
export function confidenceInterval95(values: number[]): ConfidenceInterval95 {
  const n = values.length;
  const m = mean(values);
  const sd = stddev(values);
  if (n < 2) {
    return { mean: m, std: sd, n, marginOfError: 0, lower: m, upper: m };
  }
  const t = tCritical95(n - 1);
  const marginOfError = t * (sd / Math.sqrt(n));
  return { mean: m, std: sd, n, marginOfError, lower: m - marginOfError, upper: m + marginOfError };
}

/* ------------------------------------------------------------------ */
/*  Función Gamma (aproximación de Lanczos) y distribución t           */
/* ------------------------------------------------------------------ */

const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(x: number): number {
  if (x < 0.5) {
    // reflexión
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_COEF[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_COEF[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function tPDF(x: number, df: number): number {
  const logCoef = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  return Math.exp(logCoef) * Math.pow(1 + (x * x) / df, -(df + 1) / 2);
}

/** Integra la PDF t de Student entre 0 y `upper` (Simpson compuesto). */
function tUpperTailMass(upper: number, df: number, steps = 2000): number {
  if (upper <= 0) return 0;
  const h = upper / steps;
  let sum = tPDF(0, df) + tPDF(upper, df);
  for (let i = 1; i < steps; i++) {
    const x = i * h;
    sum += tPDF(x, df) * (i % 2 === 0 ? 2 : 4);
  }
  return (h / 3) * sum;
}

/** Valor p de dos colas para un estadístico t con `df` grados de libertad. */
export function tTwoTailedP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  const massToT = Math.min(0.5, tUpperTailMass(Math.abs(t), df));
  return Math.max(0, Math.min(1, 2 * (0.5 - massToT)));
}

export type PairedTTestResult = {
  test: "t-pareada";
  t: number;
  df: number;
  p: number;
  meanDiff: number;
  significant: boolean;
};

/** Prueba t pareada (bilateral) entre dos muestras del mismo tamaño. */
export function pairedTTest(a: number[], b: number[]): PairedTTestResult {
  const n = Math.min(a.length, b.length);
  const diffs = a.slice(0, n).map((v, i) => v - b[i]);
  const md = mean(diffs);
  const sd = stddev(diffs);
  const df = n - 1;
  const t = sd === 0 ? 0 : md / (sd / Math.sqrt(n));
  const p = tTwoTailedP(t, df);
  return { test: "t-pareada", t, df, p, meanDiff: md, significant: p < 0.05 };
}

/* ------------------------------------------------------------------ */
/*  Distribución normal estándar (para Wilcoxon)                       */
/* ------------------------------------------------------------------ */

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const tt = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * tt + a4) * tt) + a3) * tt + a2) * tt + a1) * tt * Math.exp(-ax * ax);
  return sign * y;
}

function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export type WilcoxonResult = {
  test: "wilcoxon";
  W: number;
  z: number;
  p: number;
  n: number;
  significant: boolean;
};

/** Prueba de rangos con signo de Wilcoxon (bilateral, aproximación normal). */
export function wilcoxonSignedRankTest(a: number[], b: number[]): WilcoxonResult {
  const len = Math.min(a.length, b.length);
  const diffs: number[] = [];
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    if (d !== 0) diffs.push(d);
  }
  const n = diffs.length;
  if (n === 0) return { test: "wilcoxon", W: 0, z: 0, p: 1, n: 0, significant: false };

  const abs = diffs.map((d) => Math.abs(d));
  const order = abs
    .map((v, i) => ({ v, i }))
    .sort((x, y) => x.v - y.v);

  // rangos promediados en caso de empates
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].v === order[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k].i] = avgRank;
    i = j + 1;
  }

  let wPlus = 0;
  diffs.forEach((d, idx) => {
    if (d > 0) wPlus += ranks[idx];
  });

  const meanW = (n * (n + 1)) / 4;
  const sdW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  const cc = wPlus > meanW ? -0.5 : wPlus < meanW ? 0.5 : 0;
  const z = sdW === 0 ? 0 : (wPlus - meanW + cc) / sdW;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { test: "wilcoxon", W: wPlus, z, p: Math.max(0, Math.min(1, p)), n, significant: p < 0.05 };
}

export type SignificanceResult = PairedTTestResult | WilcoxonResult;

/**
 * Elige la prueba de significancia apropiada: t pareada si las diferencias
 * son aproximadamente simétricas (|asimetría| <= 1), Wilcoxon en caso contrario.
 */
export function pairedSignificanceTest(a: number[], b: number[]): SignificanceResult {
  const n = Math.min(a.length, b.length);
  const diffs = a.slice(0, n).map((v, i) => v - b[i]);
  const skew = skewness(diffs);
  if (Math.abs(skew) <= 1) return pairedTTest(a, b);
  return wilcoxonSignedRankTest(a, b);
}
