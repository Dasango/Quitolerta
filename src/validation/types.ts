export type Daily = {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  temperature_2m_mean: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  shortwave_radiation_sum: number[];
  relative_humidity_2m_mean?: number[];
};

export const SENSOR_KEYS = [
  "temperature_2m_mean",
  "precipitation_sum",
  "wind_speed_10m_max",
  "shortwave_radiation_sum",
  "relative_humidity_2m_mean",
] as const;

export type SensorKey = (typeof SENSOR_KEYS)[number];

export type RuleKey =
  | "univariate"
  | "heat_index"
  | "vpd_fire"
  | "cold_humid"
  | "storm"
  | "sensor_frozen"
  | "abrupt_jump"
  | "radiation_inconsistent";

export type DetectionMode = "univariate" | "combined";

export const RULE_LABELS: Record<RuleKey, string> = {
  univariate: "Univariada (|z|≥2.2)",
  heat_index: "Calor seco (Heat Index NOAA)",
  vpd_fire: "Riesgo de incendio (VPD ≥ 1.5 kPa)",
  cold_humid: "Frío húmedo (estadístico)",
  storm: "Tormenta (lluvia z≥1.5 + viento z≥1.2)",
  sensor_frozen: "Sensor congelado (3+ lecturas idénticas)",
  abrupt_jump: "Salto abrupto (fallo de sensor)",
  radiation_inconsistent: "Radiación incoherente",
};

export type PerturbationType =
  | "univariate_spike"
  | "heat_index_event"
  | "vpd_fire_event"
  | "storm_event"
  | "cold_humid_event"
  | "abrupt_jump_event"
  | "sensor_frozen_event"
  | "radiation_inconsistent_event"
  | "control_normal";

export const PERTURBATION_LABELS: Record<PerturbationType, string> = {
  univariate_spike: "Pico univariado (Z-score)",
  heat_index_event: "Evento compuesto · Calor seco (HI NOAA)",
  vpd_fire_event: "Evento compuesto · Riesgo de incendio (VPD)",
  storm_event: "Evento compuesto · Tormenta",
  cold_humid_event: "Evento compuesto · Frío húmedo",
  abrupt_jump_event: "Salto abrupto (plausibilidad)",
  sensor_frozen_event: "Sensor congelado (plausibilidad)",
  radiation_inconsistent_event: "Radiación incoherente (plausibilidad)",
  control_normal: "Control · Sin anomalía",
};

export const PERTURBATION_TO_RULE: Record<PerturbationType, RuleKey | null> = {
  univariate_spike: "univariate",
  heat_index_event: "heat_index",
  vpd_fire_event: "vpd_fire",
  storm_event: "storm",
  cold_humid_event: "cold_humid",
  abrupt_jump_event: "abrupt_jump",
  sensor_frozen_event: "sensor_frozen",
  radiation_inconsistent_event: "radiation_inconsistent",
  control_normal: null,
};

export const ANOMALOUS_PERTURBATIONS: PerturbationType[] = [
  "univariate_spike",
  "heat_index_event",
  "vpd_fire_event",
  "storm_event",
  "cold_humid_event",
  "abrupt_jump_event",
  "sensor_frozen_event",
  "radiation_inconsistent_event",
];

export type SyntheticCase = {
  id: string;
  timestamp: string;
  index: number;
  perturbation: PerturbationType;
  label: string;
  is_anomaly: boolean;
  variable: string | null;
  heuristic_rule: RuleKey | null;
  magnitude_description: string;
  original_values: Record<string, number>;
  perturbed_values: Record<string, number>;
};

export type ValidationCatalog = {
  id: string;
  generated_at: string;
  seed: number;
  base_date_range: { start: string; end: string };
  config: {
    total_cases: number;
    normal_ratio: number;
    anomalous_ratio: number;
    distribution: Partial<Record<PerturbationType, number>>;
    anomaly_types_used: PerturbationType[];
  };
  cases: SyntheticCase[];
  synthetic_daily: Daily;
};

export type ComparisonResult = {
  case_id: string;
  timestamp: string;
  index: number;
  is_anomaly_real: boolean;
  type_real: PerturbationType;
  heuristic_rule_real: RuleKey | null;
  detected_univariate: boolean;
  detected_combined: boolean;
};

export type Metrics = {
  strategy: DetectionMode;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  sensitivity: number;
  specificity: number;
  precision: number;
  accuracy: number;
  n: number;
};

export type MetricsByRule = {
  rule: RuleKey;
  ruleLabel: string;
} & Metrics;
