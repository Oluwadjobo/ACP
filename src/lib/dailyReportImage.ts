import type { DailyReportSnapshot, DailyReportTotals } from "@/types";

const IMAGE_WIDTH = 1600;
const MARGIN = 48;
const TABLE_WIDTH = IMAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 46;
const TABLE_COLUMNS = [
  { title: "Commercial", width: 380, key: "name" },
  { title: "Hors zone", width: 145, key: "out_of_zone" },
  { title: "Présence confirmée", width: 160, key: "presence_confirmed" },
  { title: "Vente non réalisée", width: 155, key: "sale_not_realized" },
  { title: "Vente réalisée", width: 140, key: "sale_realized" },
  { title: "Vente additionnelle réalisée", width: 170, key: "sale_additional_realized" },
  { title: "Vente additionnelle non réalisée", width: 185, key: "sale_additional_not_realized" },
  { title: "Total général", width: 169, key: "total" },
] as const;

interface DailyImageOptions {
  teamName: string;
  snapshot?: DailyReportSnapshot | null;
  comparison?: {
    dateA: string;
    dateB: string;
    snapshotA: DailyReportSnapshot | null;
    snapshotB: DailyReportSnapshot | null;
    analyticalComment: string;
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

function formatNumber(value: number): string {
  return value === 0 ? "" : new Intl.NumberFormat("fr-FR").format(value);
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00+01:00`).toLocaleDateString("fr-FR", {
    timeZone: "Africa/Porto-Novo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function newCanvas(height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (height > 30_000) throw new Error("Le rapport est trop volumineux pour tenir dans une seule image JPG.");
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de préparer l'image JPG.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  return { canvas, ctx };
}

function drawHeader(ctx: CanvasRenderingContext2D, teamName: string, subtitle: string): number {
  ctx.fillStyle = "#0d1b5e";
  ctx.fillRect(0, 0, IMAGE_WIDTH, 190);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Arial, sans-serif";
  ctx.fillText("ACP  |  RAPPORTS JOURNALIERS", MARGIN, 34);
  ctx.font = "700 42px Arial, sans-serif";
  ctx.fillText(teamName, MARGIN, 82);
  ctx.font = "24px Arial, sans-serif";
  ctx.fillStyle = "#dbeafe";
  ctx.fillText(subtitle, MARGIN, 140);
  return 220;
}

function drawSummary(ctx: CanvasRenderingContext2D, y: number, snapshot: DailyReportSnapshot): number {
  const totals = snapshot.report_data.totals;
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(MARGIN, y, TABLE_WIDTH, 120);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 23px Arial, sans-serif";
  const overallTotal = totals.total + (snapshot.additional_sales_data?.totals.total ?? 0);
  ctx.fillText(`Total général : ${formatNumber(overallTotal) || "0"}  |  Taux de conversion : ${snapshot.conversion_rate.toFixed(2)} %`, MARGIN + 22, y + 20);
  ctx.font = "18px Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(`Version ${snapshot.version}  •  Généré le ${new Date(snapshot.generated_at).toLocaleString("fr-FR")}`, MARGIN + 22, y + 62);
  ctx.fillStyle = "#0f172a";
  ctx.font = "18px Arial, sans-serif";
  return wrapText(ctx, snapshot.analytical_comment, MARGIN + 22, y + 90, TABLE_WIDTH - 44, 24) + 10;
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  startY: number,
  title: string,
  snapshot: DailyReportSnapshot,
): number {
  ctx.fillStyle = "#0d1b5e";
  ctx.font = "700 26px Arial, sans-serif";
  ctx.fillText(title, MARGIN, startY);
  let y = startY + 48;
  ctx.fillStyle = "#0d1b5e";
  ctx.fillRect(MARGIN, y, TABLE_WIDTH, 70);
  ctx.font = "700 16px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  let x = MARGIN;
  TABLE_COLUMNS.forEach((column) => {
    const labelLines = column.title.split(" ");
    const lineHeight = 19;
    const textHeight = labelLines.length * lineHeight;
    let textY = y + (70 - textHeight) / 2;
    let line = "";
    const words = column.title.split(" ");
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > column.width - 18 && line) {
        ctx.fillText(line, x + 9, textY);
        line = word;
        textY += lineHeight;
      } else {
        line = candidate;
      }
    }
    if (line) ctx.fillText(line, x + 9, textY);
    x += column.width;
  });
  y += 70;

  const additional = snapshot.additional_sales_data;
  const rowMap = new Map(snapshot.report_data.rows.map((row) => [row.commercial_id, { ...row }]));
  for (const addition of additional?.rows ?? []) {
    if (!rowMap.has(addition.commercial_id)) {
      rowMap.set(addition.commercial_id, {
        commercial_id: addition.commercial_id,
        commercial_name_at_generation: addition.commercial_name_at_generation,
        out_of_zone: 0,
        presence_confirmed: 0,
        sale_not_realized: 0,
        sale_realized: 0,
        total: 0,
      });
    }
  }
  const additionByCommercial = new Map((additional?.rows ?? []).map((row) => [row.commercial_id, row]));
  const rows = [...rowMap.values()].sort((a, b) => {
    const totalA = a.total + (additionByCommercial.get(a.commercial_id)?.total ?? 0);
    const totalB = b.total + (additionByCommercial.get(b.commercial_id)?.total ?? 0);
    return totalB - totalA || a.commercial_name_at_generation.localeCompare(b.commercial_name_at_generation, "fr");
  });
  rows.forEach((row, index) => {
    if (index % 2 === 0) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(MARGIN, y, TABLE_WIDTH, ROW_HEIGHT);
    }
    ctx.fillStyle = "#1e293b";
    ctx.font = "17px Arial, sans-serif";
    const addition = additionByCommercial.get(row.commercial_id);
    const values: string[] = [
      row.commercial_name_at_generation,
      formatNumber(row.out_of_zone),
      formatNumber(row.presence_confirmed),
      formatNumber(row.sale_not_realized),
      formatNumber(row.sale_realized),
      formatNumber(addition?.sale_additional_realized ?? 0),
      formatNumber(addition?.sale_additional_not_realized ?? 0),
      formatNumber(row.total + (addition?.total ?? 0)),
    ];
    let cellX = MARGIN;
    values.forEach((value, cellIndex) => {
      const column = TABLE_COLUMNS[cellIndex];
      if (cellIndex === 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cellX + 8, y, column.width - 16, ROW_HEIGHT);
        ctx.clip();
        ctx.fillText(value, cellX + 9, y + 14);
        ctx.restore();
      } else {
        ctx.textAlign = "right";
        ctx.fillText(value, cellX + column.width - 12, y + 14);
        ctx.textAlign = "left";
      }
      cellX += column.width;
    });
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + ROW_HEIGHT);
    ctx.lineTo(MARGIN + TABLE_WIDTH, y + ROW_HEIGHT);
    ctx.stroke();
    y += ROW_HEIGHT;
  });

  const totals = snapshot.report_data.totals;
  const additionTotals = snapshot.additional_sales_data?.totals ?? { sale_additional_realized: 0, sale_additional_not_realized: 0, total: 0 };
  drawTotalsRow(ctx, y, {
    ...totals,
    sale_additional_realized: additionTotals.sale_additional_realized,
    sale_additional_not_realized: additionTotals.sale_additional_not_realized,
    total: totals.total + additionTotals.total,
  } as DailyReportTotals & { sale_additional_realized: number; sale_additional_not_realized: number });
  return y + 72;
}

function drawTotalsRow(ctx: CanvasRenderingContext2D, y: number, totals: DailyReportTotals & { sale_additional_realized?: number; sale_additional_not_realized?: number }): void {
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(MARGIN, y, TABLE_WIDTH, 54);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 18px Arial, sans-serif";
  const values = [
    "TOTAL",
    formatNumber(totals.out_of_zone),
    formatNumber(totals.presence_confirmed),
    formatNumber(totals.sale_not_realized),
    formatNumber(totals.sale_realized),
    formatNumber(totals.sale_additional_realized ?? 0),
    formatNumber(totals.sale_additional_not_realized ?? 0),
    formatNumber(totals.total),
  ];
  let x = MARGIN;
  values.forEach((value, index) => {
    const column = TABLE_COLUMNS[index];
    if (index === 0) {
      ctx.fillText(value, x + 9, y + 17);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(value, x + column.width - 12, y + 17);
      ctx.textAlign = "left";
    }
    x += column.width;
  });
}

function percentageChange(a: number, b: number): string {
  if (a === 0) return b === 0 ? "0 %" : "—";
  const value = ((b - a) * 100) / a;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function drawComparisonSummary(
  ctx: CanvasRenderingContext2D,
  y: number,
  dateA: string,
  dateB: string,
  snapshotA: DailyReportSnapshot,
  snapshotB: DailyReportSnapshot,
  comment: string,
): number {
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(MARGIN, y, TABLE_WIDTH, 160);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 23px Arial, sans-serif";
  ctx.fillText("Analyse comparative", MARGIN + 22, y + 18);
  ctx.font = "18px Arial, sans-serif";
  wrapText(ctx, comment, MARGIN + 22, y + 56, TABLE_WIDTH - 44, 25);
  let tableY = y + 174;
  ctx.fillStyle = "#0d1b5e";
  ctx.fillRect(MARGIN, tableY, TABLE_WIDTH, 48);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 17px Arial, sans-serif";
  const columns = [
    { label: "Catégorie", width: 430 },
    { label: dateA, width: 270 },
    { label: dateB, width: 270 },
    { label: "Variation", width: 270 },
    { label: "Variation %", width: 264 },
  ];
  let x = MARGIN;
  columns.forEach((column) => {
    ctx.fillText(column.label, x + 12, tableY + 15);
    x += column.width;
  });
  tableY += 48;
  const additionsA = snapshotA.additional_sales_data?.totals ?? { sale_additional_realized: 0, sale_additional_not_realized: 0, total: 0 };
  const additionsB = snapshotB.additional_sales_data?.totals ?? { sale_additional_realized: 0, sale_additional_not_realized: 0, total: 0 };
  const metrics = [
    { label: "Hors zone", a: snapshotA.report_data.totals.out_of_zone, b: snapshotB.report_data.totals.out_of_zone },
    { label: "Présence confirmée", a: snapshotA.report_data.totals.presence_confirmed, b: snapshotB.report_data.totals.presence_confirmed },
    { label: "Vente non réalisée", a: snapshotA.report_data.totals.sale_not_realized, b: snapshotB.report_data.totals.sale_not_realized },
    { label: "Vente réalisée", a: snapshotA.report_data.totals.sale_realized, b: snapshotB.report_data.totals.sale_realized },
    { label: "Vente additionnelle réalisée", a: additionsA.sale_additional_realized, b: additionsB.sale_additional_realized },
    { label: "Vente additionnelle non réalisée", a: additionsA.sale_additional_not_realized, b: additionsB.sale_additional_not_realized },
    { label: "Total général", a: snapshotA.report_data.totals.total + additionsA.total, b: snapshotB.report_data.totals.total + additionsB.total },
  ];
  metrics.forEach((metric, index) => {
    if (index % 2 === 0) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(MARGIN, tableY, TABLE_WIDTH, 44);
    }
    const a = metric.a;
    const b = metric.b;
    const values = [metric.label, formatNumber(a) || "0", formatNumber(b) || "0", `${b - a > 0 ? "+" : ""}${b - a}`, percentageChange(a, b)];
    ctx.fillStyle = "#1e293b";
    ctx.font = "17px Arial, sans-serif";
    let cellX = MARGIN;
    values.forEach((value, cellIndex) => {
      ctx.fillText(value, cellX + 12, tableY + 13);
      cellX += columns[cellIndex].width;
    });
    tableY += 44;
  });
  tableY += 24;
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.fillText(
    `Conversion : ${snapshotA.conversion_rate.toFixed(2)} % → ${snapshotB.conversion_rate.toFixed(2)} %  |  Évolution : ${snapshotB.conversion_rate - snapshotA.conversion_rate > 0 ? "+" : ""}${(snapshotB.conversion_rate - snapshotA.conversion_rate).toFixed(2)} point(s)`,
    MARGIN + 4,
    tableY,
  );
  return tableY + 60;
}

function downloadJpg(canvas: HTMLCanvasElement, fileName: string): void {
  const url = canvas.toDataURL("image/jpeg", 0.9);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}

export function exportDailyReportJpg(options: DailyImageOptions): void {
  if (options.comparison) {
    const { dateA, dateB, snapshotA, snapshotB, analyticalComment } = options.comparison;
    if (!snapshotA || !snapshotB) throw new Error("Les deux instantanés sont requis pour exporter la comparaison.");
    const height = 1400 + snapshotA.report_data.rows.length * ROW_HEIGHT + snapshotB.report_data.rows.length * ROW_HEIGHT;
    const { canvas, ctx } = newCanvas(height);
    let y = drawHeader(ctx, options.teamName, `Comparaison du ${formatDate(dateA)} au ${formatDate(dateB)}`);
    y = drawComparisonSummary(ctx, y, dateA, dateB, snapshotA, snapshotB, analyticalComment);
    y = drawTable(ctx, y, `Rapport du ${formatDate(dateA)}`, snapshotA);
    drawTable(ctx, y, `Rapport du ${formatDate(dateB)}`, snapshotB);
    downloadJpg(canvas, `ACP_comparatif_${snapshotA.team_code}_${dateA}_${dateB}.jpg`);
    return;
  }

  const snapshot = options.snapshot;
  if (!snapshot) throw new Error("Aucun instantané à exporter.");
  const height = 650 + snapshot.report_data.rows.length * ROW_HEIGHT;
  const { canvas, ctx } = newCanvas(height);
  let y = drawHeader(ctx, options.teamName, `Rapport du ${formatDate(snapshot.report_date)}`);
  y = drawSummary(ctx, y, snapshot);
  drawTable(ctx, y, `Détail par commercial — ${formatDate(snapshot.report_date)}`, snapshot);
  downloadJpg(canvas, `ACP_rapport_${snapshot.team_code}_${snapshot.report_date}.jpg`);
}
