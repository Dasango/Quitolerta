import ExcelJS from "exceljs";
import fileSaver from "file-saver";
const { saveAs } = fileSaver;

import type { ExperimentResult } from "./runExperiment";
import type { Daily } from "./types";
import { confidenceInterval95, mean, stddev } from "./statistics";
import { computeMulticlassConcordance } from "./multiclassEvaluation";

type MetricKey = "accuracy" | "precision" | "recall" | "specificity" | "f1";
const METRIC_LABELS: Record<MetricKey, string> = {
  accuracy: "Exactitud (Accuracy)",
  precision: "Precisión",
  recall: "Sensibilidad (Recall)",
  specificity: "Especificidad",
  f1: "F1-score",
};

function metricSeries(result: ExperimentResult, algo: 1 | 2, metric: MetricKey): number[] {
  const key = `${metric}_${algo}` as keyof ExperimentResult["simulations"][number];
  return result.simulations.map((s) => s[key] as number);
}

function headerRow(ws: ExcelJS.Worksheet, rowNumber: number) {
  const row = ws.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    cell.border = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" },
    };
  });
}

/**
 * Genera y descarga el Excel (.xlsx) del experimento de validación.
 *
 * `baseDaily` es OPCIONAL y retrocompatible: si se proporciona, se añade una hoja
 * "Multiclase" con la concordancia (Cohen's kappa) del detector O2 clasificando el
 * TIPO de evento compuesto. Las hojas "Resumen" y "Simulaciones" no se ven
 * afectadas por este parámetro.
 */
export async function exportExperimentToExcel(
  result: ExperimentResult,
  baseDaily?: Daily,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quitolerta · Módulo de validación experimental";
  wb.created = new Date();

  /* ---------------------------------------------------------------- */
  /*  Hoja "Resumen"                                                    */
  /* ---------------------------------------------------------------- */
  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { key: "a", width: 32 },
    { key: "b", width: 22 },
    { key: "c", width: 22 },
    { key: "d", width: 22 },
    { key: "e", width: 22 },
  ];

  resumen.addRow(["Configuración del experimento"]);
  resumen.getCell("A1").font = { bold: true, size: 13 };
  resumen.addRow(["Simulaciones ejecutadas", result.simulations.length]);
  resumen.addRow(["Casos por simulación", result.config.totalCases]);
  resumen.addRow(["Proporción normal / anómalo", `${Math.round(result.config.normalRatio * 100)}% / ${Math.round((1 - result.config.normalRatio) * 100)}%`]);
  resumen.addRow(["Casos evaluados (total)", result.totalCasesEvaluated]);
  resumen.addRow(["Casos normales (total)", result.totalNormal]);
  resumen.addRow(["Casos anómalos (total)", result.totalAnomalous]);
  resumen.addRow(["Tiempo total de ejecución (s)", (result.totalDurationMs / 1000).toFixed(2)]);
  resumen.addRow(["Generado", new Date().toLocaleString("es-EC")]);
  resumen.addRow([]);

  const compareStartRow = resumen.rowCount + 1;
  resumen.addRow(["Comparación entre algoritmos", "", "", "", ""]);
  resumen.getCell(`A${compareStartRow}`).font = { bold: true, size: 13 };

  const tableHeaderRow = compareStartRow + 1;
  resumen.addRow([
    "Métrica",
    "Solo Z-Score · Media (IC95)",
    "Solo Z-Score · Desv. Est.",
    "Z-Score + Heurísticas · Media (IC95)",
    "Z-Score + Heurísticas · Desv. Est.",
    "% Mejora",
  ]);
  headerRow(resumen, tableHeaderRow);

  (Object.keys(METRIC_LABELS) as MetricKey[]).forEach((metric) => {
    const s1 = metricSeries(result, 1, metric);
    const s2 = metricSeries(result, 2, metric);
    const ci1 = confidenceInterval95(s1);
    const ci2 = confidenceInterval95(s2);
    const improvement = ci1.mean !== 0 ? ((ci2.mean - ci1.mean) / ci1.mean) * 100 : 0;
    resumen.addRow([
      METRIC_LABELS[metric],
      `${ci1.mean.toFixed(2)}% (±${ci1.marginOfError.toFixed(2)})`,
      ci1.std.toFixed(2),
      `${ci2.mean.toFixed(2)}% (±${ci2.marginOfError.toFixed(2)})`,
      ci2.std.toFixed(2),
      `${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}%`,
    ]);
  });

  resumen.addRow([]);
  const confusionStartRow = resumen.rowCount + 1;
  resumen.addRow(["Matriz de confusión promedio", "", "", "", ""]);
  resumen.getCell(`A${confusionStartRow}`).font = { bold: true, size: 13 };
  resumen.addRow(["Algoritmo", "TP", "FP", "TN", "FN"]);
  headerRow(resumen, resumen.rowCount);
  resumen.addRow([
    "Solo Z-Score (O1)",
    mean(result.simulations.map((s) => s.tp1)).toFixed(1),
    mean(result.simulations.map((s) => s.fp1)).toFixed(1),
    mean(result.simulations.map((s) => s.tn1)).toFixed(1),
    mean(result.simulations.map((s) => s.fn1)).toFixed(1),
  ]);
  resumen.addRow([
    "Z-Score + Heurísticas (O2)",
    mean(result.simulations.map((s) => s.tp2)).toFixed(1),
    mean(result.simulations.map((s) => s.fp2)).toFixed(1),
    mean(result.simulations.map((s) => s.tn2)).toFixed(1),
    mean(result.simulations.map((s) => s.fn2)).toFixed(1),
  ]);

  /* ---------------------------------------------------------------- */
  /*  Hoja "Simulaciones"                                               */
  /* ---------------------------------------------------------------- */
  const sims = wb.addWorksheet("Simulaciones", { views: [{ state: "frozen", ySplit: 1 }] });
  sims.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Semilla", key: "seed", width: 10 },
    { header: "Normales", key: "normal", width: 10 },
    { header: "Anómalos", key: "anom", width: 10 },
    { header: "TP (O1)", key: "tp1", width: 9 },
    { header: "FP (O1)", key: "fp1", width: 9 },
    { header: "TN (O1)", key: "tn1", width: 9 },
    { header: "FN (O1)", key: "fn1", width: 9 },
    { header: "TP (O2)", key: "tp2", width: 9 },
    { header: "FP (O2)", key: "fp2", width: 9 },
    { header: "TN (O2)", key: "tn2", width: 9 },
    { header: "FN (O2)", key: "fn2", width: 9 },
    { header: "Accuracy O1 (%)", key: "acc1", width: 15 },
    { header: "Accuracy O2 (%)", key: "acc2", width: 15 },
    { header: "Precision O1 (%)", key: "prec1", width: 15 },
    { header: "Precision O2 (%)", key: "prec2", width: 15 },
    { header: "Recall O1 (%)", key: "rec1", width: 14 },
    { header: "Recall O2 (%)", key: "rec2", width: 14 },
    { header: "Specificity O1 (%)", key: "spec1", width: 16 },
    { header: "Specificity O2 (%)", key: "spec2", width: 16 },
    { header: "F1 O1 (%)", key: "f1_1", width: 12 },
    { header: "F1 O2 (%)", key: "f1_2", width: 12 },
    { header: "Tiempo ejecución (ms)", key: "duration", width: 20 },
  ];

  result.simulations.forEach((s) => {
    sims.addRow({
      n: s.index, seed: s.seed, normal: s.normal, anom: s.anomalous,
      tp1: s.tp1, fp1: s.fp1, tn1: s.tn1, fn1: s.fn1,
      tp2: s.tp2, fp2: s.fp2, tn2: s.tn2, fn2: s.fn2,
      acc1: +s.accuracy_1.toFixed(2), acc2: +s.accuracy_2.toFixed(2),
      prec1: +s.precision_1.toFixed(2), prec2: +s.precision_2.toFixed(2),
      rec1: +s.recall_1.toFixed(2), rec2: +s.recall_2.toFixed(2),
      spec1: +s.specificity_1.toFixed(2), spec2: +s.specificity_2.toFixed(2),
      f1_1: +s.f1_1.toFixed(2), f1_2: +s.f1_2.toFixed(2),
      duration: +s.durationMs.toFixed(1),
    });
  });

  headerRow(sims, 1);
  sims.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, result.simulations.length + 1), column: sims.columns.length } };

  // fila de resumen estadístico al pie
  sims.addRow([]);
  const meanRow = sims.addRow({
    n: "Media",
    acc1: +mean(result.simulations.map((s) => s.accuracy_1)).toFixed(2),
    acc2: +mean(result.simulations.map((s) => s.accuracy_2)).toFixed(2),
    prec1: +mean(result.simulations.map((s) => s.precision_1)).toFixed(2),
    prec2: +mean(result.simulations.map((s) => s.precision_2)).toFixed(2),
    rec1: +mean(result.simulations.map((s) => s.recall_1)).toFixed(2),
    rec2: +mean(result.simulations.map((s) => s.recall_2)).toFixed(2),
    spec1: +mean(result.simulations.map((s) => s.specificity_1)).toFixed(2),
    spec2: +mean(result.simulations.map((s) => s.specificity_2)).toFixed(2),
    f1_1: +mean(result.simulations.map((s) => s.f1_1)).toFixed(2),
    f1_2: +mean(result.simulations.map((s) => s.f1_2)).toFixed(2),
    duration: +mean(result.simulations.map((s) => s.durationMs)).toFixed(1),
  });
  meanRow.font = { bold: true, italic: true };
  const stdRow = sims.addRow({
    n: "Desv. Est.",
    acc1: +stddev(result.simulations.map((s) => s.accuracy_1)).toFixed(2),
    acc2: +stddev(result.simulations.map((s) => s.accuracy_2)).toFixed(2),
    prec1: +stddev(result.simulations.map((s) => s.precision_1)).toFixed(2),
    prec2: +stddev(result.simulations.map((s) => s.precision_2)).toFixed(2),
    rec1: +stddev(result.simulations.map((s) => s.recall_1)).toFixed(2),
    rec2: +stddev(result.simulations.map((s) => s.recall_2)).toFixed(2),
    spec1: +stddev(result.simulations.map((s) => s.specificity_1)).toFixed(2),
    spec2: +stddev(result.simulations.map((s) => s.specificity_2)).toFixed(2),
    f1_1: +stddev(result.simulations.map((s) => s.f1_1)).toFixed(2),
    f1_2: +stddev(result.simulations.map((s) => s.f1_2)).toFixed(2),
    duration: +stddev(result.simulations.map((s) => s.durationMs)).toFixed(1),
  });
  stdRow.font = { bold: true, italic: true };

  /* ---------------------------------------------------------------- */
  /*  Hoja "Multiclase" (H1b) — ADITIVA                                 */
  /*  Concordancia (Cohen's kappa) de O2 clasificando el TIPO de evento */
  /*  compuesto. Solo se genera si se dispone de la serie base para     */
  /*  reproducir los catálogos con las mismas semillas y config.        */
  /* ---------------------------------------------------------------- */
  if (baseDaily) {
    const mc = computeMulticlassConcordance(
      baseDaily,
      result.simulations.map((s) => s.seed),
      { totalCases: result.config.totalCases, normalRatio: result.config.normalRatio },
    );

    const ws = wb.addWorksheet("Multiclase");
    ws.columns = [
      { key: "a", width: 26 },
      { key: "b", width: 18 },
      { key: "c", width: 18 },
      { key: "d", width: 18 },
      { key: "e", width: 18 },
      { key: "f", width: 18 },
      { key: "g", width: 14 },
    ];

    ws.addRow(["Clasificación multiclase de eventos compuestos (H1b)"]);
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.addRow(["Detector evaluado", "Z-Score + Heurísticas (O2)"]);
    ws.addRow(["Simulaciones agregadas", mc.nSimulations]);
    ws.addRow(["Casos evaluados (compuestos + normal)", mc.total]);
    ws.addRow(["Cohen's kappa", +mc.kappa.toFixed(3)]);
    ws.addRow(["Interpretación (Landis & Koch)", mc.kappaInterpretation]);
    ws.addRow(["Exactitud multiclase", `${(mc.accuracy * 100).toFixed(2)}%`]);
    ws.addRow(["F1 macro", `${(mc.macroF1 * 100).toFixed(2)}%`]);
    ws.addRow(["Acuerdo esperado por azar", `${(mc.expectedAgreement * 100).toFixed(2)}%`]);
    ws.addRow([]);

    // --- Matriz de confusión multiclase ---
    const matrixTitleRow = ws.rowCount + 1;
    ws.addRow(["Matriz de confusión (fila = real, columna = predicho por O2)"]);
    ws.getCell(`A${matrixTitleRow}`).font = { bold: true, size: 13 };

    const matrixHeaderRow = ws.rowCount + 1;
    ws.addRow(["Real \\ Predicho", ...mc.classLabels, "Total real"]);
    headerRow(ws, matrixHeaderRow);

    mc.matrix.forEach((row, i) => {
      const rowTotal = row.reduce((s, v) => s + v, 0);
      ws.addRow([mc.classLabels[i], ...row, rowTotal]);
    });
    const colSums = mc.classes.map((_, j) => mc.matrix.reduce((s, r) => s + r[j], 0));
    const totalsRow = ws.addRow(["Total predicho", ...colSums, mc.total]);
    totalsRow.font = { bold: true };
    ws.addRow([]);

    // --- Desglose por clase ---
    const perClassTitleRow = ws.rowCount + 1;
    ws.addRow(["Desglose por clase de evento compuesto"]);
    ws.getCell(`A${perClassTitleRow}`).font = { bold: true, size: 13 };

    const perClassHeaderRow = ws.rowCount + 1;
    ws.addRow(["Clase", "Soporte", "Aciertos", "Predichos", "Precisión", "Sensibilidad", "F1"]);
    headerRow(ws, perClassHeaderRow);

    mc.perClass.forEach((p) => {
      ws.addRow([
        p.label,
        p.support,
        p.correct,
        p.predicted,
        p.support === 0 && p.predicted === 0 ? "—" : `${(p.precision * 100).toFixed(2)}%`,
        p.support === 0 ? "—" : `${(p.recall * 100).toFixed(2)}%`,
        p.support === 0 ? "—" : `${(p.f1 * 100).toFixed(2)}%`,
      ]);
    });
    ws.addRow([]);

    // --- Nota metodológica ---
    const noteRow = ws.rowCount + 1;
    ws.addRow(["Nota metodológica"]);
    ws.getCell(`A${noteRow}`).font = { bold: true };
    ws.addRow(["Alcance: solo O2. O1 (univariado) no puede emitir clases compuestas."]);
    ws.addRow(["Ground truth: tipo de evento que el generador asigna a cada caso."]);
    ws.addRow(["Empate de reglas el mismo día: prioridad storm > vpd_fire > heat_index > cold_humid."]);
    ws.addRow(["Anomalías no compuestas (univariado, salto abrupto, sensor congelado, radiación) excluidas."]);
    ws.addRow(["Cohen's kappa corrige el acuerdo por azar (apropiado con clases desbalanceadas)."]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `quitolerta-validacion-experimento-${stamp}.xlsx`,
  );
}
