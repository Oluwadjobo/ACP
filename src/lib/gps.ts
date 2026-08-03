// GPS helper: uses watchPosition to get the most accurate reading possible
// within a timeout. Returns the position with the best accuracy observed.

export interface AccuratePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

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
    let resolved = false;
    let watchId: number | null = null;

    const finish = (pos: AccuratePosition | null) => {
      if (resolved) return;
      resolved = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (pos) resolve(pos);
      else reject(new Error("Impossible d'obtenir votre position actuelle. Vérifiez que le GPS est activé."));
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 9999;
        const accuratePos: AccuratePosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: acc,
        };

        // Keep the best (lowest accuracy value) reading
        if (!bestPos || acc < bestPos.accuracy) {
          bestPos = accuratePos;
        }

        // If we hit our target accuracy, resolve immediately
        if (acc <= minAccuracy) {
          finish(accuratePos);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (resolved) return;
          resolved = true;
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          reject(new Error("Accès à la localisation refusé. Veuillez autoriser la géolocalisation pour utiliser l'application."));
          return;
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          // Don't reject yet — we might still get a reading
        } else if (err.code === err.TIMEOUT) {
          finish(bestPos);
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );

    // After the timeout, resolve with the best reading we got
    setTimeout(() => finish(bestPos), timeoutMs);
  });
}
