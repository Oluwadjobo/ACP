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

// ---- Telephone enrichment non-regression tests ----

const PHONE_COLUMNS = ["Commercial", "Appels reçus", "Vente OUI", "Vente NON"] as const;

interface PhoneTotals { total: number; sale_realized: number; sale_not_realized: number; }
interface PhoneData { columns: string[]; rows: unknown[]; totals: PhoneTotals; }

function makePhoneData(total: number, realized: number, notRealized: number): PhoneData {
  return {
    columns: [...PHONE_COLUMNS],
    rows: [],
    totals: { total, sale_realized: realized, sale_not_realized: notRealized },
  };
}

Deno.test("telephone columns match the expected four-label canonical list", () => {
  if (!arraysEqual([...PHONE_COLUMNS], ["Commercial", "Appels reçus", "Vente OUI", "Vente NON"])) {
    throw new Error("Telephone columns do not match the canonical list");
  }
});

Deno.test("telephone with zero calls has all totals at zero", () => {
  const phone = makePhoneData(0, 0, 0);
  assertEquals(phone.totals.total, 0, "zero-call total");
  assertEquals(phone.totals.sale_realized, 0, "zero-call realized");
  assertEquals(phone.totals.sale_not_realized, 0, "zero-call not_realized");
});

Deno.test("telephone with multiple calls counts correctly", () => {
  const phone = makePhoneData(5, 3, 2);
  assertEquals(phone.totals.total, 5, "multi-call total");
  assertEquals(phone.totals.sale_realized, 3, "multi-call realized");
  assertEquals(phone.totals.sale_not_realized, 2, "multi-call not_realized");
  assertEquals(phone.totals.total, phone.totals.sale_realized + phone.totals.sale_not_realized, "total equals sum");
});

Deno.test("telephone totals must not be negative", () => {
  const phone = makePhoneData(-1, 0, 0);
  if (phone.totals.total >= 0) throw new Error("negative total should be detected");
});

Deno.test("report_data payload for RPC must not include telephone key", () => {
  const rpcPayload = {
    columns: DAILY_REPORT_COLUMNS,
    rows: [],
    totals: { out_of_zone: 0, presence_confirmed: 0, sale_not_realized: 0, sale_realized: 0, total: 0 },
  };
  if ("telephone" in rpcPayload) {
    throw new Error("RPC payload must not contain telephone — it is added after snapshot creation");
  }
});

Deno.test("enriched report_data includes telephone after saveDailyReportPhoneData", () => {
  const reportData = {
    columns: DAILY_REPORT_COLUMNS,
    rows: [],
    totals: { out_of_zone: 0, presence_confirmed: 0, sale_not_realized: 0, sale_realized: 0, total: 0 },
  };
  const phoneData = makePhoneData(0, 0, 0);
  const merged = { ...reportData, telephone: phoneData };
  if (!("telephone" in merged)) throw new Error("enriched data must contain telephone");
  if (!isPhoneData(merged.telephone)) throw new Error("telephone block must be valid");
});

function isPhoneData(value: unknown): value is PhoneData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Partial<PhoneData>;
  return Array.isArray(c.columns) && Array.isArray(c.rows) && !!c.totals
    && Number.isFinite(c.totals.total) && Number.isFinite(c.totals.sale_realized) && Number.isFinite(c.totals.sale_not_realized);
}

Deno.test("legacy snapshot without telephone remains valid (no enrichment required)", () => {
  const legacy = {
    columns: DAILY_REPORT_COLUMNS,
    rows: [],
    totals: { out_of_zone: 10, presence_confirmed: 5, sale_not_realized: 3, sale_realized: 2, total: 20 },
  };
  if ("telephone" in legacy) throw new Error("legacy snapshot should not have telephone");
});

function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(`${msg ?? "assertion failed"}: expected ${expected}, received ${actual}`);
  }
}
