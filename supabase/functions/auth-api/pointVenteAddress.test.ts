import {
  hasRequiredPointVenteCreateFields,
  normalizeOptionalAddress,
} from "./pointVenteAddress.ts";

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(message + ": expected " + expected + ", received " + actual);
  }
}

Deno.test("trims a provided point de vente address", () => {
  assertEquals(normalizeOptionalAddress("  12 rue du Marche  "), "12 rue du Marche", "provided address");
});

Deno.test("stores a missing point de vente address as an empty string", () => {
  assertEquals(normalizeOptionalAddress(undefined), "", "missing address");
  assertEquals(normalizeOptionalAddress(""), "", "empty address");
});

Deno.test("stores a whitespace-only point de vente address as an empty string", () => {
  assertEquals(normalizeOptionalAddress("   "), "", "whitespace-only address");
});

Deno.test("admin creation accepts a supplied, missing, or whitespace-only address", () => {
  for (const address of ["12 rue du Marche", undefined, "", "   "]) {
    assertEquals(
      hasRequiredPointVenteCreateFields({ name: "Superette", city: "Cotonou", latitude: 6, longitude: 2 }),
      true,
      "admin creation accepts address " + String(address),
    );
    assertEquals(normalizeOptionalAddress(address), address?.trim() ?? "", "normalized admin address");
  }
});

Deno.test("field creation accepts a supplied, missing, or whitespace-only address and still requires a tournee", () => {
  for (const address of ["12 rue du Marche", undefined, "", "   "]) {
    assertEquals(
      hasRequiredPointVenteCreateFields({
        name: "Superette",
        city: "Cotonou",
        latitude: 6,
        longitude: 2,
        secteurId: "tournee-1",
      }),
      true,
      "field creation accepts address " + String(address),
    );
    assertEquals(normalizeOptionalAddress(address), address?.trim() ?? "", "normalized field address");
  }
  assertEquals(
    hasRequiredPointVenteCreateFields({ name: "Superette", city: "Cotonou", latitude: 6, longitude: 2, secteurId: "" }),
    false,
    "field creation still requires a tournee",
  );
});
