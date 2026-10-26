// GPS helper: uses watchPosition to get the most accurate reading possible
// within a timeout. Returns the position with the best accuracy observed.
//
// Three safeguards prevent accepting a rough first fix that reports good
// accuracy but can be 100 m+ off the true location (common on mobile):
//   1. A minimum warmup period lets the GPS receiver converge before any
//      reading is accepted, even if its reported accuracy looks fine.
//   2. The per-attempt TIMEOUT error no longer resolves the promise — only
//      the outer timeout does, so the watch keeps improving the fix.
//   3. Among readings with similar accuracy, the most recent one wins, so
//      a stale early fix is replaced by a fresher, more accurate one.

export interface AccuratePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const MIN_WARMUP_MS = 3000;

export function getAccuratePosition(
  timeoutMs = 20000,
  minAccuracy = 15
): Promise<AccuratePosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS non disponible sur cet appareil"));
      return;
    }

    let bestPos: AccuratePosition | null = null;
    let bestTimestamp = 0;
    let resolved = false;
    let watchId: number | null = null;
    const startTime = Date.now();

    const finish = (pos: AccuratePosition | null) => {
      if (resolved) return;
      resolved = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (pos) resolve(pos);
      else reject(new Error("Impossible d'obtenir votre position actuelle. Vérifiez que le GPS est activé."));
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (resolved) return;
        const acc = pos.coords.accuracy ?? 9999;
        const ts = pos.timestamp;
        const accuratePos: AccuratePosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: acc,
        };

        const elapsed = Date.now() - startTime;
        const isWarmedUp = elapsed >= MIN_WARMUP_MS;

        // Keep the best reading. Prefer lower accuracy value, but when two
        // readings are within 5 m of each other in reported accuracy, prefer
        // the more recent one — the GPS has likely converged closer to truth.
        if (
          !bestPos ||
          acc < bestPos.accuracy - 5 ||
          (Math.abs(acc - bestPos.accuracy) <= 5 && ts > bestTimestamp)
        ) {
          bestPos = accuratePos;
          bestTimestamp = ts;
        }

        // Only accept a reading after warmup AND when accuracy meets target.
        if (isWarmedUp && acc <= minAccuracy) {
          finish(accuratePos);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          finish(null);
          return;
        }
        // On TIMEOUT or POSITION_UNAVAILABLE, do NOT resolve — keep watching
        // until the outer timeout fires. The GPS may still produce a good fix.
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );

    // Outer timeout: resolve with the best reading collected so far.
    setTimeout(() => {
      if (bestPos && bestPos.accuracy <= minAccuracy) {
        finish(bestPos);
        return;
      }

      if (resolved) return;
      resolved = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      const accuracy = bestPos ? Math.round(bestPos.accuracy) : null;
      reject(new Error(
        accuracy === null
          ? "Impossible d'obtenir une précision GPS suffisante. Vérifiez que le GPS est activé et réessayez."
          : `Précision GPS insuffisante (±${accuracy} m). Attendez quelques secondes ou déplacez-vous dans une zone mieux couverte, puis réessayez.`
      ));
    }, timeoutMs);
  });
}
