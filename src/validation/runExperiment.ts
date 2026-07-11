import type { Daily } from "./types";
import { generateSyntheticCases } from "./generateSyntheticCases";
import { evaluateDetection } from "./evaluateDetection";
import { computeAllMetrics } from "./computeMetrics";
import { detectionFn } from "./detectionEngine";

export type SimulationRecord = {
  index: number;
  seed: number;
  normal: number;
  anomalous: number;
  // O1 · Solo Z-Score
  tp1: number; fp1: number; tn1: number; fn1: number;
  accuracy_1: number; precision_1: number; recall_1: number; specificity_1: number; f1_1: number;
  // O2 · Z-Score + Heurísticas
  tp2: number; fp2: number; tn2: number; fn2: number;
  accuracy_2: number; precision_2: number; recall_2: number; specificity_2: number; f1_2: number;
  durationMs: number;
};

export type ExperimentConfig = {
  totalCases: number;
  normalRatio: number;
};

export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  totalCases: 400,
  normalRatio: 0.7,
};

export type ExperimentResult = {
  simulations: SimulationRecord[];
  config: ExperimentConfig;
  /** Semilla maestra que reproduce exactamente estas 40 simulaciones. */
  masterSeed: number;
  totalCasesEvaluated: number;
  totalNormal: number;
  totalAnomalous: number;
  totalDurationMs: number;
};

function f1Score(precision: number, recall: number): number {
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

/** PRNG determinista (mulberry32): misma semilla → misma secuencia. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rango válido para una semilla maestra visible (entero de 6 dígitos). */
export const MASTER_SEED_MIN = 100000;
export const MASTER_SEED_MAX = 999999;

/** Genera una semilla maestra aleatoria (entero de 6 dígitos). */
export function generateMasterSeed(): number {
  return Math.floor(Math.random() * (MASTER_SEED_MAX - MASTER_SEED_MIN + 1)) + MASTER_SEED_MIN;
}

/**
 * Deriva N semillas distintas (enteras, no repetidas) de forma **determinista**
 * a partir de una semilla maestra. La misma semilla maestra siempre produce las
 * mismas N semillas, garantizando reproducibilidad del experimento completo.
 */
export function deriveSeeds(masterSeed: number, n: number): number[] {
  const rng = mulberry32(masterSeed);
  const seeds = new Set<number>();
  // Cota de seguridad para evitar bucles infinitos ante colisiones improbables.
  let guard = 0;
  while (seeds.size < n && guard < n * 100) {
    seeds.add(Math.floor(rng() * 900000) + 100000);
    guard++;
  }
  return Array.from(seeds);
}

export function runSingleSimulation(
  baseDaily: Daily,
  seed: number,
  index: number,
  config: ExperimentConfig,
): SimulationRecord {
  const t0 = performance.now();

  const catalog = generateSyntheticCases(baseDaily, {
    seed,
    total_cases: config.totalCases,
    normal_ratio: config.normalRatio,
  });
  const results = evaluateDetection(catalog, detectionFn);
  const { univariate, combined } = computeAllMetrics(results);

  const durationMs = performance.now() - t0;
  const normal = results.filter((r) => !r.is_anomaly_real).length;
  const anomalous = results.filter((r) => r.is_anomaly_real).length;

  return {
    index,
    seed,
    normal,
    anomalous,
    tp1: univariate.tp, fp1: univariate.fp, tn1: univariate.tn, fn1: univariate.fn,
    accuracy_1: univariate.accuracy * 100,
    precision_1: univariate.precision * 100,
    recall_1: univariate.sensitivity * 100,
    specificity_1: univariate.specificity * 100,
    f1_1: f1Score(univariate.precision, univariate.sensitivity) * 100,
    tp2: combined.tp, fp2: combined.fp, tn2: combined.tn, fn2: combined.fn,
    accuracy_2: combined.accuracy * 100,
    precision_2: combined.precision * 100,
    recall_2: combined.sensitivity * 100,
    specificity_2: combined.specificity * 100,
    f1_2: f1Score(combined.precision, combined.sensitivity) * 100,
    durationMs,
  };
}

export type ExperimentProgress = {
  current: number;
  total: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
};

/**
 * Ejecuta `count` simulaciones independientes (semilla distinta en cada una),
 * cediendo el hilo entre cada corrida para que la barra de progreso se pinte.
 *
 * Las `count` semillas se derivan de una **semilla maestra** de forma determinista:
 * pasar la misma `masterSeed` reproduce exactamente el mismo experimento. Si no se
 * indica, se genera una aleatoria y se devuelve en el resultado para poder repetirlo.
 */
export async function runExperiment(
  baseDaily: Daily,
  count: number,
  config: ExperimentConfig = DEFAULT_EXPERIMENT_CONFIG,
  onProgress?: (progress: ExperimentProgress) => void,
  masterSeed: number = generateMasterSeed(),
): Promise<ExperimentResult> {
  const seeds = deriveSeeds(masterSeed, count);
  const simulations: SimulationRecord[] = [];
  const t0 = performance.now();

  for (let i = 0; i < count; i++) {
    const rec = runSingleSimulation(baseDaily, seeds[i], i + 1, config);
    simulations.push(rec);

    const elapsedMs = performance.now() - t0;
    const avgPerRun = elapsedMs / (i + 1);
    onProgress?.({
      current: i + 1,
      total: count,
      elapsedMs,
      estimatedRemainingMs: Math.max(0, avgPerRun * (count - (i + 1))),
    });

    // cede el hilo al render de React (barra de progreso, animaciones)
    await new Promise((r) => setTimeout(r, 0));
  }

  const totalDurationMs = performance.now() - t0;

  return {
    simulations,
    config,
    masterSeed,
    totalCasesEvaluated: simulations.reduce((s, r) => s + r.normal + r.anomalous, 0),
    totalNormal: simulations.reduce((s, r) => s + r.normal, 0),
    totalAnomalous: simulations.reduce((s, r) => s + r.anomalous, 0),
    totalDurationMs,
  };
}
