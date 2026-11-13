import {
  isVisitOutOfZone,
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
