// Saved places — capture, matching, and the place label.
//
// Privacy shape (Place Shield spec v1.1 §6): coordinates exist only
// in the on-device places record and in live fixes that are never
// stored. The ONLY thing that ever leaves the device is a matched
// place's name — or the word "away" — as the converse `placeLabel`
// context field. No watch, no tracking, no trail: a label lookup is
// a single getCurrentPosition fix, taken at Talk/SOS time, and only
// when the user has saved places AND location permission is already
// granted on this device (granted at calm-time setup — a Talk or SOS
// moment never triggers a permission prompt).

import { getPlaces, type SavedPlace } from "./journal";

export type { SavedPlace };

export const PLACE_RADII_M = [100, 150, 250];
export const DEFAULT_RADIUS_M = 150;

// Set when a setup capture succeeds — proof on this device that the
// user granted location permission at calm time. Used only as a
// fallback where the Permissions API can't answer (older Safari);
// where it can, its live answer governs.
const LS_GEO_GRANTED = "pn.geoGranted";

export function noteGeoPermissionGranted(): void {
  try {
    localStorage.setItem(LS_GEO_GRANTED, "1");
  } catch {
    // Storage blocked — the Permissions API path still works.
  }
}

function geoGrantedFlag(): boolean {
  try {
    return localStorage.getItem(LS_GEO_GRANTED) === "1";
  } catch {
    return false;
  }
}

// ---------- distance ----------

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// The saved place this fix is at — the nearest place whose radius
// contains the fix — or null when the fix matches none of them.
export function matchPlace(
  places: SavedPlace[],
  lat: number,
  lng: number,
): SavedPlace | null {
  let best: { place: SavedPlace; dist: number } | null = null;
  for (const place of places) {
    const dist = haversineM(lat, lng, place.lat, place.lng);
    if (dist <= place.radiusM && (!best || dist < best.dist)) {
      best = { place, dist };
    }
  }
  return best?.place ?? null;
}

// ---------- one fix ----------

export interface PositionFix {
  lat: number;
  lng: number;
  accuracyM: number;
}

export type CaptureError = "denied" | "unavailable" | "timeout" | "unsupported";

// One getCurrentPosition fix. Used by setup (standing at the place)
// and by the label lookup (Talk/SOS time). High accuracy on: at
// setup the user is standing still and the fix quality decides
// whether a 150 m match means anything; at talk time the browser
// may answer from a recent fix (maximumAge) instead of a fresh one.
export function capturePosition(options?: {
  timeoutMs?: number;
  maximumAgeMs?: number;
}): Promise<PositionFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject("unsupported" as CaptureError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject("denied" as CaptureError);
        else if (err.code === err.TIMEOUT) reject("timeout" as CaptureError);
        else reject("unavailable" as CaptureError);
      },
      {
        enableHighAccuracy: true,
        timeout: options?.timeoutMs ?? 15000,
        maximumAge: options?.maximumAgeMs ?? 0,
      },
    );
  });
}

// The fix quality in plain words (spec §3: "good fix" / "weak fix").
export function accuracyWords(accuracyM: number): string {
  if (accuracyM <= 25) return "a good fix";
  if (accuracyM <= 50) return "an okay fix";
  return "a weak fix — try again outside, away from walls, if you can";
}

// ---------- the place label ----------

// Session-cached: a Talk session asks once, not once per turn. The
// cache lives for a few minutes — long enough for a conversation,
// short enough that driving across town mid-evening re-resolves.
const LABEL_TTL_MS = 4 * 60 * 1000;
let labelCache: { at: number; label: string | null } | null = null;
let labelInflight: Promise<string | null> | null = null;

async function permissionGranted(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state === "granted";
    }
  } catch {
    // Permissions API can't answer — fall through to the setup flag.
  }
  return geoGrantedFlag();
}

async function resolvePlaceLabel(): Promise<string | null> {
  let places: SavedPlace[] = [];
  try {
    places = await getPlaces();
  } catch {
    return null;
  }
  if (!places.length) return null;
  if (!(await permissionGranted())) return null;
  let fix: PositionFix;
  try {
    fix = await capturePosition({ timeoutMs: 8000, maximumAgeMs: 120000 });
  } catch {
    return null;
  }
  const match = matchPlace(places, fix.lat, fix.lng);
  return match ? match.name : "away";
}

// The label for this moment: a saved place's name, "away" (a fix was
// taken and matched none of the saved places), or null — no places,
// no permission, no fix — in which case callers OMIT the field
// entirely and the conversation is exactly what it was before places
// existed. Never throws.
export function getPlaceLabel(): Promise<string | null> {
  const now = Date.now();
  if (labelCache && now - labelCache.at < LABEL_TTL_MS) {
    return Promise.resolve(labelCache.label);
  }
  if (labelInflight) return labelInflight;
  labelInflight = resolvePlaceLabel()
    .then((label) => {
      labelCache = { at: Date.now(), label };
      labelInflight = null;
      return label;
    })
    .catch(() => {
      labelInflight = null;
      return null;
    });
  return labelInflight;
}
