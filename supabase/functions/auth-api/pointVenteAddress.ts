export function normalizeOptionalAddress(address: unknown): string {
  return typeof address === "string" ? address.trim() : "";
}

export function hasRequiredPointVenteCreateFields(input: {
  name: unknown;
  city: unknown;
  latitude: unknown;
  longitude: unknown;
  secteurId?: unknown;
}): boolean {
  return Boolean(
    input.name
    && input.city
    && input.latitude != null
    && input.longitude != null
    && (input.secteurId === undefined || input.secteurId)
  );
}
