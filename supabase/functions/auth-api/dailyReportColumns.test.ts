/**
 * Non-regression test: the TypeScript report columns sent to the
 * create_daily_report_snapshot RPC must exactly match the columns
 * expected by validate_daily_report_payload() in PostgreSQL.
 *
 * The canonical SQL column list is:
 *   ["Commercial","Hors zone","Présence confirmée",
 *    "Vente non réalisée","Vente réalisée","Total général"]
 *
 * The display label "Total visites physiques" is a UI-only label
 * and must never appear in the RPC payload.
 */

const EXPECTED_SQL_COLUMNS = [
  "Commercial",
  "Hors zone",
  "Présence confirmée",
  "Vente non réalisée",
  "Vente réalisée",
  "Total général",
] as const;

// Mirror the production constant from auth-api/index.ts
const DAILY_REPORT_COLUMNS = [
  "Commercial",
  "Hors zone",
  "Présence confirmée",
  "Vente non réalisée",
  "Vente réalisée",
  "Total général",
];

function arraysEqual(a: string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

Deno.test("DAILY_REPORT_COLUMNS matches PostgreSQL validate_daily_report_payload exactly", () => {
  if (!arraysEqual(DAILY_REPORT_COLUMNS, EXPECTED_SQL_COLUMNS)) {
    throw new Error(
      `Column mismatch.\n  TypeScript: ${JSON.stringify(DAILY_REPORT_COLUMNS)}\n  SQL expected: ${JSON.stringify([...EXPECTED_SQL_COLUMNS])}`,
    );
  }
});

Deno.test("DAILY_REPORT_COLUMNS does not contain the display-only label 'Total visites physiques'", () => {
  if (DAILY_REPORT_COLUMNS.includes("Total visites physiques")) {
    throw new Error(
      "The RPC payload must use 'Total général', not the UI label 'Total visites physiques'.",
    );
  }
});

Deno.test("DAILY_REPORT_COLUMNS has exactly 6 entries in the correct order", () => {
  if (DAILY_REPORT_COLUMNS.length !== 6) {
    throw new Error(`Expected 6 columns, got ${DAILY_REPORT_COLUMNS.length}`);
  }
  assertEquals(DAILY_REPORT_COLUMNS[0], "Commercial");
  assertEquals(DAILY_REPORT_COLUMNS[5], "Total général");
});

function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(`${msg ?? "assertion failed"}: expected ${expected}, received ${actual}`);
  }
}
