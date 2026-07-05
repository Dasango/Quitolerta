import type { ValidationCatalog, ComparisonResult, DetectionMode } from "./types";
import { PERTURBATION_TO_RULE } from "./types";

// These types mirror the engine's output without importing from index.tsx
type RuleEvent = {
  date: string;
  rule: string;
  [key: string]: unknown;
};

/**
 * Runs detection in the specified mode on synthetic daily data.
 * The detection function is injected to avoid coupling with the engine module.
 */
export function evaluateDetection(
  catalog: ValidationCatalog,
  detectionFn: (daily: unknown, mode: DetectionMode) => RuleEvent[],
): ComparisonResult[] {
  const { synthetic_daily: syntheticDaily, cases } = catalog;

  // Run detection in both modes
  const univEvents = detectionFn(syntheticDaily, "univariate");
  const combinedEvents = detectionFn(syntheticDaily, "combined");

  // Build lookup sets: dates flagged by each mode
  const univDates = new Set(univEvents.map((e) => e.date));
  const combinedDates = new Set(combinedEvents.map((e) => e.date));

  const results: ComparisonResult[] = [];

  for (const c of cases) {
    const detectedUnivariate = univDates.has(c.timestamp);
    const detectedCombined = combinedDates.has(c.timestamp);

    results.push({
      case_id: c.id,
      timestamp: c.timestamp,
      index: c.index,
      is_anomaly_real: c.is_anomaly,
      type_real: c.perturbation,
      heuristic_rule_real: PERTURBATION_TO_RULE[c.perturbation] ?? null,
      detected_univariate: detectedUnivariate,
      detected_combined: detectedCombined,
    });
  }

  return results;
}
