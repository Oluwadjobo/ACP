// GPS helper: uses watchPosition to get the most accurate reading possible
// within a timeout. Returns the position with the best accuracy observed.

export interface AccuratePosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export class GpsAccuracyError extends Error {
  constructor(
    public readonly accuracy: number,
    public readonly maxAccuracy: number
  ) {
    super(`Précision GPS insuffisante : ±${Math.round(accuracy)} m obtenue, maximum autorisé ${maxAccuracy} m. Réessayez dans une zone mieux couverte.`);
    this.name = "GpsAccuracyError";
  }
}

export function getAccuratePosition(
  timeoutMs = 20000,
  minAccuracy = 15,
  options: { allowBestAvailable?: boolean } = {}
): Promise<AccuratePosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS non disponible sur cet appareil"));
      return;
    }

    let bestPos: AccuratePosition | null = null;
    let receivedInvalidAccuracy = false;
    let resolved = false;
    let watchId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = (pos: AccuratePosition | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (pos && Number.isFinite(pos.accuracy) && pos.accuracy >= 0
        && (pos.accuracy <= minAccuracy || options.allowBestAvailable)) {
        resolve(pos);
      } else if (pos && Number.isFinite(pos.accuracy) && pos.accuracy >= 0) {
        reject(new GpsAccuracyError(pos.accuracy, minAccuracy));
      } else if (receivedInvalidAccuracy) {
        reject(new Error("La précision GPS reçue est absente ou invalide. Aucune visite n'a été validée. Réessayez."));
      } else {
        reject(new Error("Impossible d'obtenir votre position actuelle. Vérifiez que le GPS est activé."));
      }
    };

    timeoutId = setTimeout(() => finish(bestPos), timeoutMs);
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const acc = pos.coords.accuracy;
          if (!Number.isFinite(acc) || acc < 0) {
            receivedInvalidAccuracy = true;
            return;
          }
          const accuratePos: AccuratePosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: acc,
          };

          if (!bestPos || acc < bestPos.accuracy) {
            bestPos = accuratePos;
          }

          if (acc <= minAccuracy) {
            finish(accuratePos);
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error("Accès à la localisation refusé. Veuillez autoriser la géolocalisation pour utiliser l'application."));
          } else if (err.code === err.TIMEOUT) {
            finish(bestPos);
          }
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      );
      if (resolved) cleanup();
    } catch (err) {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(err instanceof Error ? err : new Error("Impossible d'obtenir votre position actuelle."));
    }
  });
}
