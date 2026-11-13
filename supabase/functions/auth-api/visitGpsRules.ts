export const MAX_VISIT_DISTANCE_METERS = 50;

export type OutOfZoneVisitAttempt = {
  point_vente_id: string;
  team_id: string;
  user_role: "commercial" | "superviseur";
  commercial_id: string | null;
  superviseur_id: string | null;
  visit_method: "qr" | "geolocation";
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export function haversineMetersExact(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const haversine = Math.min(1, Math.max(0,
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(longitudeDelta / 2) ** 2,
  ));
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function isVisitOutOfZone(distanceMeters: number): boolean {
  return distanceMeters > MAX_VISIT_DISTANCE_METERS;
}

export function shouldDeduplicateOutOfZoneAttempt(
  current: OutOfZoneVisitAttempt,
  previous: OutOfZoneVisitAttempt,
): boolean {
  if (current.point_vente_id !== previous.point_vente_id
    || current.team_id !== previous.team_id
    || current.user_role !== previous.user_role
    || current.commercial_id !== previous.commercial_id
    || current.superviseur_id !== previous.superviseur_id
    || current.visit_method !== previous.visit_method
    || current.accuracy === null || !Number.isFinite(current.accuracy) || current.accuracy < 0
    || previous.accuracy === null || !Number.isFinite(previous.accuracy) || previous.accuracy < 0) {
    return false;
  }

  const displacement = haversineMetersExact(
    current.latitude,
    current.longitude,
    previous.latitude,
    previous.longitude,
  );
  // Treat overlapping GPS accuracy circles as measurement fluctuation, not confirmed movement.
  return displacement <= current.accuracy + previous.accuracy;
}
