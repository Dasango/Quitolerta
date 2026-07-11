/**
 * Evaluación de CONCORDANCIA en clasificación multiclase de eventos compuestos.
 *
 * Este módulo es ADITIVO: no modifica ni la lógica de detección (O1/O2), ni las
 * métricas binarias existentes, ni el generador. Solo READ: reproduce catálogos
 * de forma determinista a partir de las MISMAS semillas + config que ya usó el
 * experimento (generación determinista vía mulberry32), y mide qué tan bien el
 * detector combinado (O2) clasifica el TIPO de evento compuesto contra la
 * etiqueta de verdad que el generador ya asigna en cada caso.
 *
 * Responde a la parte (b) de H1: "O2 clasifica correctamente eventos compuestos
 * (tormenta, calor seco, frío húmedo, riesgo de incendio) con concordancia
 * significativamente superior".
 *
 * Alcance: SOLO O2. El detector univariado (O1) es estructuralmente incapaz de
 * emitir una clase compuesta —solo produce la bandera genérica "univariate"—, por
 * lo que no se le construye una matriz multiclase (ver nota en la UI).
 *
 * Métrica principal: Cohen's kappa (no ponderado), que corrige el acuerdo por
 * azar y es robusto ante el desbalance de clases. Se acompaña de la matriz de
 * confusión multiclase, accuracy multiclase y F1 macro / P-R-F1 por clase.
 */
import type { Daily, PerturbationType } from "./types";
import { generateSyntheticCases } from "./generateSyntheticCases";
import { detectAllRuleEvents } from "./detectionEngine";

/* ------------------------------------------------------------------ */
/*  Clases compuestas (H1b) + control normal                           */
/* ------------------------------------------------------------------ */

export const COMPOSITE_CLASSES = [
  "storm",
  "vpd_fire",
  "heat_index",
  "cold_humid",
  "normal",
] as const;

export type CompositeClass = (typeof COMPOSITE_CLASSES)[number];

export const COMPOSITE_CLASS_LABELS: Record<CompositeClass, string> = {
  storm: "Tormenta",
  vpd_fire: "Riesgo de incendio",
  heat_index: "Calor seco",
  cold_humid: "Frío húmedo",
  normal: "Normal / sin evento",
};

/**
 * Reglas de O2 que corresponden a un evento compuesto. Las demás reglas del
 * motor (univariate, abrupt_jump, sensor_frozen, radiation_inconsistent) NO son
 * eventos compuestos y no participan en esta clasificación.
 */
const COMPOSITE_RULES = ["storm", "vpd_fire", "heat_index", "cold_humid"] as const;
type CompositeRule = (typeof COMPOSITE_RULES)[number];

/**
 * Prioridad FIJA para resolver el caso (poco frecuente) en que O2 dispara más de
 * una regla compuesta el mismo día. Es independiente de la etiqueta de verdad
 * (no hay fuga de ground truth): siempre se decide con este orden declarado.
 */
const COMPOSITE_PRIORITY: CompositeRule[] = ["storm", "vpd_fire", "heat_index", "cold_humid"];

/**
 * Etiqueta de verdad por perturbación. Solo los eventos compuestos y el control
 * normal participan; las anomalías no compuestas se excluyen de la evaluación.
 */
const PERTURBATION_TO_CLASS: Partial<Record<PerturbationType, CompositeClass>> = {
  storm_event: "storm",
  vpd_fire_event: "vpd_fire",
  heat_index_event: "heat_index",
  cold_humid_event: "cold_humid",
  control_normal: "normal",
};

function isCompositeRule(rule: string): rule is CompositeRule {
  return (COMPOSITE_RULES as readonly string[]).includes(rule);
}

/* ------------------------------------------------------------------ */
/*  Tipos de salida                                                    */
/* ------------------------------------------------------------------ */

export type PerClassMetrics = {
  cls: CompositeClass;
  label: string;
  support: number; // nº de casos cuya verdad es esta clase
  predicted: number; // nº de casos que O2 predijo como esta clase
  correct: number; // diagonal
  precision: number; // 0..1
  recall: number; // 0..1
  f1: number; // 0..1
};

export type MulticlassResult = {
  classes: CompositeClass[];
  classLabels: string[];
  /** matrix[fila = clase real][columna = clase predicha por O2] */
  matrix: number[][];
  total: number;
  nSimulations: number;
  observedAgreement: number; // p_o (accuracy multiclase, 0..1)
  expectedAgreement: number; // p_e (0..1)
  kappa: number; // Cohen's kappa
  kappaInterpretation: string; // banda de Landis & Koch
  accuracy: number; // = observedAgreement
  macroF1: number; // 0..1
  perClass: PerClassMetrics[];
};

/* ------------------------------------------------------------------ */
/*  Interpretación de kappa (Landis & Koch, 1977)                      */
/* ------------------------------------------------------------------ */

export function interpretKappa(kappa: number): string {
  if (kappa < 0) return "Pobre (peor que el azar)";
  if (kappa <= 0.2) return "Leve (slight)";
  if (kappa <= 0.4) return "Aceptable (fair)";
  if (kappa <= 0.6) return "Moderada (moderate)";
  if (kappa <= 0.8) return "Sustancial (substantial)";
  return "Casi perfecta (almost perfect)";
}

/* ------------------------------------------------------------------ */
/*  Predicción de clase compuesta por O2 en una serie diaria           */
/* ------------------------------------------------------------------ */

/**
 * Mapa fecha → clase compuesta predicha por O2. Recorre los eventos que el motor
 * combinado dispara sobre la serie y, para cada fecha, elige la regla compuesta
 * de mayor prioridad. Las fechas sin regla compuesta quedan implícitamente como
 * "normal" (no aparecen en el mapa).
 */
function predictedClassByDate(daily: Daily): Map<string, CompositeClass> {
  const firedByDate = new Map<string, Set<CompositeRule>>();
  for (const ev of detectAllRuleEvents(daily)) {
    if (!isCompositeRule(ev.rule)) continue;
    let set = firedByDate.get(ev.date);
    if (!set) {
      set = new Set<CompositeRule>();
      firedByDate.set(ev.date, set);
    }
    set.add(ev.rule);
  }

  const out = new Map<string, CompositeClass>();
  for (const [date, fired] of firedByDate) {
    const chosen = COMPOSITE_PRIORITY.find((r) => fired.has(r));
    if (chosen) out.set(date, chosen);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Cálculo principal (pooled sobre todas las simulaciones)            */
/* ------------------------------------------------------------------ */

/**
 * Reproduce los catálogos de las semillas dadas (determinista) y acumula, sobre
 * el conjunto de todos los casos compuestos + control, la matriz de confusión
 * multiclase real (verdad del generador) vs. predicha (O2). A partir de la matriz
 * calcula Cohen's kappa, accuracy y métricas por clase.
 */
export function computeMulticlassConcordance(
  baseDaily: Daily,
  seeds: number[],
  config: { totalCases: number; normalRatio: number },
): MulticlassResult {
  const classes = [...COMPOSITE_CLASSES];
  const idxOf = new Map<CompositeClass, number>(classes.map((c, i) => [c, i]));
  const K = classes.length;
  const matrix: number[][] = Array.from({ length: K }, () => new Array<number>(K).fill(0));

  for (const seed of seeds) {
    const catalog = generateSyntheticCases(baseDaily, {
      seed,
      total_cases: config.totalCases,
      normal_ratio: config.normalRatio,
    });
    const predByDate = predictedClassByDate(catalog.synthetic_daily);

    for (const c of catalog.cases) {
      const trueCls = PERTURBATION_TO_CLASS[c.perturbation];
      if (!trueCls) continue; // anomalía no compuesta → fuera de alcance
      const predCls: CompositeClass = predByDate.get(c.timestamp) ?? "normal";
      matrix[idxOf.get(trueCls)!][idxOf.get(predCls)!]++;
    }
  }

  /* --- totales marginales --- */
  const rowSums = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const colSums = classes.map((_, j) => matrix.reduce((s, row) => s + row[j], 0));
  const total = rowSums.reduce((s, v) => s + v, 0);

  /* --- acuerdo observado / esperado y kappa --- */
  let diagonal = 0;
  for (let i = 0; i < K; i++) diagonal += matrix[i][i];
  const observedAgreement = total > 0 ? diagonal / total : 0;

  let expectedAgreement = 0;
  if (total > 0) {
    for (let i = 0; i < K; i++) {
      expectedAgreement += (rowSums[i] / total) * (colSums[i] / total);
    }
  }
  const kappa =
    1 - expectedAgreement === 0
      ? 0
      : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);

  /* --- métricas por clase --- */
  const perClass: PerClassMetrics[] = classes.map((cls, i) => {
    const correct = matrix[i][i];
    const support = rowSums[i];
    const predicted = colSums[i];
    const precision = predicted > 0 ? correct / predicted : 0;
    const recall = support > 0 ? correct / support : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return {
      cls,
      label: COMPOSITE_CLASS_LABELS[cls],
      support,
      predicted,
      correct,
      precision,
      recall,
      f1,
    };
  });

  // F1 macro: promedio simple sobre las clases con soporte (evita penalizar por
  // clases ausentes en un conjunto concreto).
  const withSupport = perClass.filter((p) => p.support > 0);
  const macroF1 = withSupport.length
    ? withSupport.reduce((s, p) => s + p.f1, 0) / withSupport.length
    : 0;

  return {
    classes,
    classLabels: classes.map((c) => COMPOSITE_CLASS_LABELS[c]),
    matrix,
    total,
    nSimulations: seeds.length,
    observedAgreement,
    expectedAgreement,
    kappa,
    kappaInterpretation: interpretKappa(kappa),
    accuracy: observedAgreement,
    macroF1,
    perClass,
  };
}
