import type { ComparisonResult, DetectionMode, Metrics, MetricsByRule, RuleKey } from "./types";
import { RULE_LABELS, ANOMALOUS_PERTURBATIONS, PERTURBATION_TO_RULE } from "./types";

function computeMetricsFromResults(
  results: ComparisonResult[],
  mode: DetectionMode,
): Metrics {
  const field = mode === "univariate" ? "detected_univariate" : "detected_combined";
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const r of results) {
    const detected = r[field];
    if (r.is_anomaly_real && detected) tp++;
    else if (!r.is_anomaly_real && detected) fp++;
    else if (!r.is_anomaly_real && !detected) tn++;
    else if (r.is_anomaly_real && !detected) fn++;
  }

  const n = results.length;
  const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const accuracy = n > 0 ? (tp + tn) / n : 0;

  return { strategy: mode, tp, fp, tn, fn, sensitivity, specificity, precision, accuracy, n };
}

export function computeAllMetrics(
  results: ComparisonResult[],
): { univariate: Metrics; combined: Metrics; byRule: MetricsByRule[] } {
  return {
    univariate: computeMetricsFromResults(results, "univariate"),
    combined: computeMetricsFromResults(results, "combined"),
    byRule: computeMetricsByRule(results),
  };
}

export function computeMetricsByRule(results: ComparisonResult[]): MetricsByRule[] {
  const rules = new Set<RuleKey>();

  for (const r of results) {
    if (r.heuristic_rule_real) rules.add(r.heuristic_rule_real);
  }

  const output: MetricsByRule[] = [];

  for (const rule of rules) {
    const filtered = results.filter(
      (r) => r.heuristic_rule_real === rule || (rule === "univariate" && r.type_real === "univariate_spike"),
    );

    const univ = computeMetricsFromResults(filtered, "univariate");
    const label = RULE_LABELS[rule] ?? rule;

    output.push({
      ...univ,
      rule,
      ruleLabel: label,
      strategy: "univariate" as const,
    });

    const comb = computeMetricsFromResults(filtered, "combined");
    output.push({
      ...comb,
      rule,
      ruleLabel: label,
      strategy: "combined" as const,
    });
  }

  return output;
}

export function renderConfusionMatrixHTML(metrics: Metrics): string {
  return [
    `TP: ${metrics.tp}  FP: ${metrics.fp}`,
    `FN: ${metrics.fn}  TN: ${metrics.tn}`,
  ].join("\n");
}
