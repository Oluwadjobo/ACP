import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";

const gpsSource = await readFile(new URL("../src/lib/gps.ts", import.meta.url), "utf8");
const { code } = await transform(gpsSource, { loader: "ts", format: "esm" });
const { getAccuratePosition, GpsAccuracyError } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let timers;
let clearedTimers;
let clearedWatches;
let positionCallback;
let errorCallback;

beforeEach(() => {
  timers = [];
  clearedTimers = [];
  clearedWatches = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        watchPosition(onPosition, onError) {
          positionCallback = onPosition;
          errorCallback = onError;
          return 42;
        },
        clearWatch(id) {
          clearedWatches.push(id);
        },
      },
    },
  });
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => clearedTimers.push(timer);
});

after(() => {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete globalThis.navigator;
  }
});

function emitPosition(accuracy) {
  positionCallback({
    coords: { latitude: 1, longitude: 2, accuracy },
  });
}

function assertCleaned() {
  assert.deepEqual(clearedWatches, [42]);
  assert.equal(clearedTimers.length, 1);
  assert.equal(clearedTimers[0], timers[0]);
}

test("cleans GPS watcher and timer after an accepted position", async () => {
  const pending = getAccuratePosition(20000, 15);
  emitPosition(15);
  assert.equal((await pending).accuracy, 15);
  assertCleaned();
});

test("cleans GPS watcher and timer after an insufficient-accuracy timeout", async () => {
  const pending = getAccuratePosition(20000, 15);
  emitPosition(106);
  timers[0].callback();
  await assert.rejects(pending, GpsAccuracyError);
  assertCleaned();
});

test("cleans GPS watcher and timer after a browser GPS timeout", async () => {
  const pending = getAccuratePosition(20000, 15);
  emitPosition(106);
  errorCallback({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  await assert.rejects(pending, GpsAccuracyError);
  assertCleaned();
});

test("cleans GPS watcher and timer when permission is denied", async () => {
  const pending = getAccuratePosition(20000, 15);
  errorCallback({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  await assert.rejects(pending, /Accès à la localisation refusé/);
  assertCleaned();
});

test("cleans GPS watcher and timer after position-unavailable reaches the timeout", async () => {
  const pending = getAccuratePosition(20000, 15);
  errorCallback({ code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  timers[0].callback();
  await assert.rejects(pending, /Impossible d'obtenir votre position actuelle/);
  assertCleaned();
});

test("cleans the timer if starting the GPS watcher throws", async () => {
  navigator.geolocation.watchPosition = () => {
    throw new Error("GPS startup failed");
  };
  const pending = getAccuratePosition(20000, 15);
  await assert.rejects(pending, /GPS startup failed/);
  assert.deepEqual(clearedWatches, []);
  assert.equal(clearedTimers.length, 1);
  assert.equal(clearedTimers[0], timers[0]);
});
