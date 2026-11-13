import {
  isVisitOutOfZone,
  getExistingVisitDecision,
  type DuplicateVisitCandidate,
  shouldDeduplicateOutOfZoneAttempt,
  type OutOfZoneVisitAttempt,
} from "./visitGpsRules.ts";

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function attempt(overrides: Partial<OutOfZoneVisitAttempt> = {}): OutOfZoneVisitAttempt {
  return {
    point_vente_id: "point-1",
    team_id: "team-1",
    user_role: "commercial",
    commercial_id: "commercial-1",
    superviseur_id: null,
    visit_method: "qr",
    latitude: 0,
    longitude: 0,
    accuracy: 5,
    ...overrides,
  };
}

function longitudeOffsetMeters(meters: number): number {
  return meters / 6371000 * 180 / Math.PI;
}

Deno.test("uses the exact 50 meter boundary", () => {
  assertEquals(isVisitOutOfZone(49.90), false, "49.90 m is in zone");
  assertEquals(isVisitOutOfZone(50), false, "50 m is in zone");
  assertEquals(isVisitOutOfZone(50.10), true, "50.10 m is out of zone");
  assertEquals(isVisitOutOfZone(57.35), true, "57.35 m is out of zone");
});

Deno.test("deduplicates GPS fluctuation within both fixes' combined accuracy", () => {
  const current = attempt({ accuracy: 3 });
  const previous = attempt({ longitude: longitudeOffsetMeters(7), accuracy: 5 });
  assertEquals(shouldDeduplicateOutOfZoneAttempt(current, previous), true, "7 m displacement is within 8 m combined accuracy");
});

Deno.test("records movement beyond both fixes' combined accuracy", () => {
  const current = attempt({ accuracy: 3 });
  const previous = attempt({ longitude: longitudeOffsetMeters(9), accuracy: 5 });
  assertEquals(shouldDeduplicateOutOfZoneAttempt(current, previous), false, "9 m displacement exceeds 8 m combined accuracy");
});

Deno.test("does not deduplicate across QR and geolocation paths", () => {
  const current = attempt({ visit_method: "qr" });
  const previous = attempt({ visit_method: "geolocation" });
  assertEquals(shouldDeduplicateOutOfZoneAttempt(current, previous), false, "methods differ");
});

Deno.test("does not deduplicate attempts from another point, team, or user", () => {
  const current = attempt();
  for (const previous of [
    attempt({ point_vente_id: "point-2" }),
    attempt({ team_id: "team-2" }),
    attempt({ commercial_id: "commercial-2" }),
  ]) {
    assertEquals(shouldDeduplicateOutOfZoneAttempt(current, previous), false, "attempt identity differs");
  }
});

Deno.test("does not deduplicate when the previous GPS accuracy is unavailable", () => {
  const current = attempt();
  const previous = attempt({ accuracy: null });
  assertEquals(shouldDeduplicateOutOfZoneAttempt(current, previous), false, "missing accuracy is not treated as zero");
});

function existingVisit(overrides: Partial<DuplicateVisitCandidate> = {}): DuplicateVisitCandidate {
  return {
    id: "visit-1",
    status: "confirmed",
    visited_at: "2026-11-13T23:40:00.000Z",
    distance_meters: 42,
    accuracy: 8,
    visit_method: "qr",
    vente_status: "confirmed",
    ...overrides,
  };
}

const duplicateCutoff = Date.parse("2026-11-13T23:35:00.000Z");

Deno.test("a pending QR visit resumes through QR with the same visit id", () => {
  const decision = getExistingVisitDecision(existingVisit(), "qr", duplicateCutoff, 50);
  assertEquals(decision?.status, "resume", "same-path pending QR visit can be resumed");
  assertEquals(decision?.visit.id, "visit-1", "resume preserves the existing visit id");
});

Deno.test("a pending geolocation visit resumes through geolocation with the same visit id", () => {
  const decision = getExistingVisitDecision(existingVisit({ visit_method: "geolocation" }), "geolocation", duplicateCutoff, 50);
  assertEquals(decision?.status, "resume", "same-path pending geolocation visit can be resumed");
  assertEquals(decision?.visit.id, "visit-1", "resume preserves the existing visit id");
});

Deno.test("a pending QR visit blocks geolocation and directs the user to QR", () => {
  const decision = getExistingVisitDecision(existingVisit(), "geolocation", duplicateCutoff, 50);
  assertEquals(decision?.status, "duplicate", "other path cannot resume a pending QR visit");
  assertEquals(decision?.status === "duplicate" && decision.message.includes("parcours QR"), true, "message identifies QR as the path to resume");
});

Deno.test("a pending geolocation visit blocks QR and directs the user to geolocation", () => {
  const decision = getExistingVisitDecision(existingVisit({ visit_method: "geolocation" }), "qr", duplicateCutoff, 50);
  assertEquals(decision?.status, "duplicate", "other path cannot resume a pending geolocation visit");
  assertEquals(decision?.status === "duplicate" && decision.message.includes("parcours géolocalisation"), true, "message identifies geolocation as the path to resume");
});

Deno.test("finalized visits block both validation paths", () => {
  for (const vente_status of ["vente_realisee", "vente_non_realisee", "vente_livraison", "promesse_achat"]) {
    for (const requestedMethod of ["qr", "geolocation"]) {
      const decision = getExistingVisitDecision(existingVisit({ vente_status }), requestedMethod, duplicateCutoff, 50);
      assertEquals(decision?.status, "duplicate", `${vente_status} remains a duplicate for ${requestedMethod}`);
    }
  }
  const missingSaleStatus = getExistingVisitDecision(existingVisit({ vente_status: null }), "qr", duplicateCutoff, 50);
  assertEquals(missingSaleStatus?.status, "duplicate", "a visit without a sale status cannot be resumed");
  assertEquals(missingSaleStatus?.status === "duplicate" && missingSaleStatus.message.includes("sans statut de finalisation"), true, "missing sale status is not described as finalized");
});

Deno.test("an out-of-zone attempt does not block a new in-zone validation", () => {
  assertEquals(isVisitOutOfZone(49.9), false, "49.9 m is inside the allowed radius");
  assertEquals(getExistingVisitDecision(existingVisit({ status: "out_of_zone", vente_status: "out_of_zone" }), "geolocation", duplicateCutoff, 49.9), null, "out-of-zone is not a confirmed visit");
});

Deno.test("a visit older than the duplicate cutoff does not block validation", () => {
  assertEquals(getExistingVisitDecision(existingVisit({ visited_at: "2026-11-13T23:34:59.999Z" }), "geolocation", duplicateCutoff, 50), null, "older than cutoff does not block");
});

Deno.test("a pending visit cannot be resumed beyond the 50 meter limit", () => {
  const distance = 50.1;
  assertEquals(isVisitOutOfZone(distance), true, "50.1 m is out of zone");
  assertEquals(getExistingVisitDecision(existingVisit(), "qr", duplicateCutoff, distance), null, "out-of-zone position cannot resume a pending visit");
});
