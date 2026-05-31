import malaysiaLocations from "../../../data/malaysiaLocations";
import { isLikelyMalaysiaCoordinates, MALAYSIA_MAP_BOUNDS } from "../../../utils/malaysiaGeo";

export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDate} - ${endDate}`;
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

export function formatDayFromTripStart(startDate, dayNumber) {
  if (!startDate) return "";
  const base = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Math.max(0, Number(dayNumber || 1) - 1));
  return base.toLocaleDateString();
}

export function getInclusiveDayCount(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(0, diffDays);
}

export function formatTripWeatherDate(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

export function getWeatherCodeLabel(code) {
  const numericCode = Number(code);
  if (numericCode === 0) return "Clear";
  if ([1, 2, 3].includes(numericCode)) return "Cloudy";
  if ([45, 48].includes(numericCode)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(numericCode)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(numericCode)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(numericCode)) return "Snow";
  if ([95, 96, 99].includes(numericCode)) return "Thunderstorm";
  return "Unknown";
}

export function getTripWeatherCoords(days) {
  for (const day of Array.isArray(days) ? days : []) {
    for (const poi of Array.isArray(day?.pois) ? day.pois : []) {
      const lat = Number(poi?.lat);
      const lng = Number(poi?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export function withUpdatedDayCountInTitle(title, dayCount) {
  const safeTitle = String(title || "").trim();
  if (!safeTitle) return "Trip Detail";
  if (!Number.isInteger(dayCount) || dayCount <= 0) return safeTitle;
  return safeTitle.replace(/\b\d+\s*-\s*Day\b/i, `${dayCount}-Day`);
}

export function getSmartPlanProgressKey(tripId) {
  return `smartgo_smart_plan_progress_${tripId}`;
}

export function readSmartPlanProgress(tripId) {
  if (!tripId) return null;
  try {
    const raw = localStorage.getItem(getSmartPlanProgressKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSmartPlanProgress(tripId) {
  if (!tripId) return;
  try {
    localStorage.removeItem(getSmartPlanProgressKey(tripId));
  } catch {
    // ignore localStorage errors
  }
}

export function getPoiImageCacheKey(poi) {
  if (poi?.poi_id) return `poi:${poi.poi_id}`;
  const name = String(poi?.name || "").trim().toLowerCase();
  const address = String(poi?.address || "").trim().toLowerCase();
  return `poi:${name}|${address}`;
}

export function getPoiImageStorageKey() {
  return "smartgo_poi_image_cache_v1";
}

export function readPoiImageCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(getPoiImageStorageKey()) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writePoiImageCache(next) {
  try {
    localStorage.setItem(getPoiImageStorageKey(), JSON.stringify(next));
  } catch {
    // ignore localStorage quota errors
  }
}

export function getTripCoverCacheKey(tripId) {
  return `smartgo_trip_cover_image_${tripId}`;
}

export function readTripCoverImage(tripId) {
  if (!tripId) return "";
  try {
    return String(localStorage.getItem(getTripCoverCacheKey(tripId)) || "");
  } catch {
    return "";
  }
}

export function writeTripCoverImageOnce(tripId, imageUrl) {
  if (!tripId) return;
  const nextUrl = String(imageUrl || "").trim();
  if (!nextUrl) return;
  try {
    if (localStorage.getItem(getTripCoverCacheKey(tripId))) return;
    localStorage.setItem(getTripCoverCacheKey(tripId), nextUrl);
  } catch {
    // ignore localStorage errors
  }
}

export function writeTripCoverImageCache(tripId, imageUrl) {
  if (!tripId) return;
  const nextUrl = String(imageUrl || "").trim();
  if (!nextUrl) return;
  try {
    localStorage.setItem(getTripCoverCacheKey(tripId), nextUrl);
  } catch {
    // ignore localStorage errors
  }
}

export function isLegacyGooglePlacesPhotoUrl(url) {
  const text = String(url || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("maps.googleapis.com/maps/api/place/photo") && text.includes("photoreference=");
}

export function getPlacePhotoUrl(place, maxWidth = 220) {
  const photos = Array.isArray(place?.photos) ? place.photos : [];
  const first = photos[0];
  if (!first || typeof first.getUrl !== "function") return "";
  try {
    return String(first.getUrl({ maxWidth })) || "";
  } catch {
    return "";
  }
}

export function canLoadImageUrl(url, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const text = String(url || "").trim();
    if (!text) {
      resolve(false);
      return;
    }

    const img = new Image();
    let finished = false;
    const done = (ok) => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };

    const timeoutId = setTimeout(() => done(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timeoutId);
      done(true);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      done(false);
    };
    img.src = text;
  });
}

export const DEFAULT_MAP_CENTER = { lat: 3.139, lng: 101.6869 };
export const ROUTE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
export const TRIP_RECOMMEND_RADIUS_METERS = 2500;
export const TRIP_RECOMMEND_MAX_RESULTS = 12;
export const MALAYSIA_FEATURED_CITY_OPTIONS = Array.isArray(malaysiaLocations?.featured)
  ? malaysiaLocations.featured.map((city) => String(city || "").trim()).filter(Boolean)
  : [];
export const MALAYSIA_CITY_OPTIONS = (() => {
  const unique = new Set();
  for (const city of MALAYSIA_FEATURED_CITY_OPTIONS) unique.add(city);
  for (const group of Array.isArray(malaysiaLocations?.states) ? malaysiaLocations.states : []) {
    for (const city of Array.isArray(group?.cities) ? group.cities : []) {
      const normalized = String(city || "").trim();
      if (normalized) unique.add(normalized);
    }
  }
  return Array.from(unique);
})();
let googleMapsLoaderPromise = null;

export function loadGoogleMapsApi(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-sdk="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("Google Maps SDK loaded but unavailable"));
      });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=MY`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsSdk = "true";
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps SDK loaded but unavailable"));
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps SDK"));
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

export function requestDirections(directionsService, request) {
  return new Promise((resolve, reject) => {
    directionsService.route(request, (result, status) => {
      if (status === "OK" && result) {
        resolve(result);
        return;
      }
      reject(new Error(`Directions request failed: ${status}`));
    });
  });
}

export function nearbySearchPlaces(service, request, statusEnum) {
  return new Promise((resolve, reject) => {
    service.nearbySearch(request, (results, status) => {
      if (status === statusEnum.OK || status === statusEnum.ZERO_RESULTS) {
        resolve(results ?? []);
        return;
      }
      reject(new Error(`Places request failed: ${status}`));
    });
  });
}

export function getPlaceDetailsById(service, request, statusEnum) {
  return new Promise((resolve, reject) => {
    service.getDetails(request, (result, status) => {
      if (status === statusEnum.OK) {
        resolve(result || null);
        return;
      }
      reject(new Error(`Place details failed: ${status}`));
    });
  });
}

export function toRecommendedPlace(place, fallbackType) {
  const lat = place.geometry?.location?.lat?.();
  const lng = place.geometry?.location?.lng?.();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isLikelyMalaysiaCoordinates(lat, lng)) return null;
  const normalizedType = place.types?.includes("restaurant") || place.types?.includes("cafe")
    ? "food"
    : place.types?.includes("tourist_attraction") || place.types?.includes("museum")
      ? "attractions"
      : fallbackType;
  return {
    placeId: String(place.place_id || "").trim() || null,
    name: String(place.name || "Unnamed place").trim(),
    address: String(place.vicinity || place.formatted_address || "").trim(),
    lat,
    lng,
    type: normalizedType,
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    userRatingsTotal: Number.isFinite(Number(place.user_ratings_total)) ? Number(place.user_ratings_total) : 0,
  };
}

export function mergePlacesByIdLocal(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      if (!item) continue;
      const key = item.placeId || `${item.name}|${item.address}|${item.lat?.toFixed?.(4)}|${item.lng?.toFixed?.(4)}`;
      if (!map.has(key)) map.set(key, item);
    }
  }
  return Array.from(map.values());
}

export function sortPlacesByQualityLocal(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const aHas = Number.isFinite(Number(a?.rating));
    const bHas = Number.isFinite(Number(b?.rating));
    if (aHas !== bHas) return aHas ? -1 : 1;
    const ratingDiff = Number(b?.rating || 0) - Number(a?.rating || 0);
    if (Math.abs(ratingDiff) > 1e-9) return ratingDiff;
    const countDiff = Number(b?.userRatingsTotal || 0) - Number(a?.userRatingsTotal || 0);
    if (countDiff !== 0) return countDiff;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

export function escapeSvgTextLocal(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createRecommendedMarkerIcon(googleMaps, type) {
  const isFood = type === "food";
  const emoji = isFood ? "\u{1F35C}" : "\u{1F3DB}\uFE0F";
  const fill = isFood ? "#f97316" : "#0ea5e9";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <path d="M19 2C11.268 2 5 8.268 5 16c0 10.2 11.253 21.973 13.076 23.826a1.3 1.3 0 0 0 1.848 0C21.747 37.973 33 26.2 33 16 33 8.268 26.732 2 19 2z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="19" cy="16" r="9.2" fill="#ffffff"/>
      <text x="19" y="20.5" text-anchor="middle" font-size="11" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapeSvgTextLocal(emoji)}</text>
    </svg>
  `.trim();
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleMaps.Size(38, 48),
    anchor: new googleMaps.Point(19, 44),
  };
}

export function formatPrimaryTypeLabelLocal(type) {
  const normalized = String(type || "other").trim();
  if (!normalized) return "Other";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(" ");
}

export function looksEnglishReviewTextLocal(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const asciiChars = value.replace(/[^\x00-\x7F]/g, "");
  const asciiRatio = asciiChars.length / value.length;
  if (asciiRatio < 0.85) return false;
  return /\b(the|and|is|was|very|great|nice|good|place|visit)\b/i.test(value) || asciiRatio > 0.98;
}

export function pickPanelReviewQuotesLocal(rawReviews) {
  const reviews = (Array.isArray(rawReviews) ? rawReviews : [])
    .map((item) => {
      const text = String(item?.text || "").trim();
      const rating = Number(item?.rating);
      const language = String(item?.language || "").trim().toLowerCase();
      const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
      return {
        text,
        rating,
        language,
        wordCount,
        isEnglish: language === "en" || looksEnglishReviewTextLocal(text),
      };
    })
    .filter((item) => item.text && item.wordCount <= 150);

  const positive = [];
  const negative = [];
  const sortedByShortness = [...reviews].sort(
    (a, b) => a.wordCount - b.wordCount || a.text.length - b.text.length
  );

  for (const item of reviews) {
    if (item.rating >= 4 && item.isEnglish && positive.length < 1) positive.push(item.text);
    if (item.rating <= 2 && item.isEnglish && negative.length < 1) negative.push(item.text);
    if (positive.length && negative.length) break;
  }

  if (!positive.length) {
    const shortPositive = sortedByShortness.find((item) => item.rating >= 4);
    if (shortPositive) positive.push(shortPositive.text);
  }

  if (!negative.length) {
    const shortNegative = sortedByShortness.find((item) => item.rating <= 2);
    if (shortNegative) negative.push(shortNegative.text);
  }

  if (!positive.length) {
    const first = sortedByShortness[0]?.text;
    if (first) positive.push(first);
  }

  return { positive, negative };
}

export function normalizePlaceDetailsForPanel(place, rawDetails) {
  const details = rawDetails || {};
  const editorialSummary = String(details?.editorial_summary?.overview || "").trim();
  const introText = editorialSummary || "No introduction available yet.";
  const weekdayText = Array.isArray(details?.opening_hours?.weekday_text)
    ? details.opening_hours.weekday_text.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const imageUrl = getPlacePhotoUrl(details, 1200);
  const rawLocation = details?.geometry?.location;
  const detailLat = typeof rawLocation?.lat === "function" ? rawLocation.lat() : Number(rawLocation?.lat);
  const detailLng = typeof rawLocation?.lng === "function" ? rawLocation.lng() : Number(rawLocation?.lng);
  const hasDetailCoords = Number.isFinite(detailLat) && Number.isFinite(detailLng);
  return {
    poi: {
      poi_id: null,
      name: String(place?.name || "Unnamed POI").trim(),
      type: String(place?.type || "other").trim() || "other",
      address: String(details?.formatted_address || place?.address || "").trim(),
      description: introText,
      image_url: imageUrl || null,
      lat: hasDetailCoords ? detailLat : Number(place?.lat),
      lng: hasDetailCoords ? detailLng : Number(place?.lng),
    },
    google_place: {
      place_id: String(details?.place_id || place?.placeId || "").trim() || null,
      location: hasDetailCoords ? { lat: detailLat, lng: detailLng } : null,
      rating: Number.isFinite(Number(details?.rating)) ? Number(details.rating) : null,
      user_ratings_total: Number.isFinite(Number(details?.user_ratings_total)) ? Number(details.user_ratings_total) : null,
      primary_type_label: formatPrimaryTypeLabelLocal(place?.type),
      introduction: editorialSummary,
      reviews: pickPanelReviewQuotesLocal(details?.reviews),
      review_summary: { positive: [], negative: [] },
      contact: {
        address: String(details?.formatted_address || place?.address || "").trim() || null,
        phone: String(details?.formatted_phone_number || details?.international_phone_number || "").trim() || null,
        website: String(details?.website || "").trim() || null,
        google_maps_url: String(details?.url || "").trim() || null,
        open_now: null,
        opening_hours_weekday_text: weekdayText,
      },
    },
    source: { provider: "google_places_js", cached: false, cached_at: null },
  };
}

export function textSearchPlaces(service, request, statusEnum) {
  return new Promise((resolve, reject) => {
    service.textSearch(request, (results, status) => {
      if (status === statusEnum.OK) {
        resolve(results || []);
        return;
      }
      if (status === statusEnum.ZERO_RESULTS) {
        resolve([]);
        return;
      }
      reject(new Error(`Places search failed: ${status}`));
    });
  });
}

export const AUTO_ROUTE_MODE_OPTIONS = [
  { key: "WALKING", label: "Walking", shortLabel: "Walk", icon: "W", color: "#0ea5e9" },
  { key: "TRANSIT", label: "Transit", shortLabel: "Transit", icon: "T", color: "#8b5cf6" },
  { key: "DRIVING", label: "Driving", shortLabel: "Drive", icon: "D", color: "#f97316" },
];

export const SEGMENT_MODE_OPTIONS = [
  { key: "WALKING", label: "Walk" },
  { key: "DRIVING", label: "Drive" },
  { key: "TRANSIT", label: "Transit" },
];

export function getRouteModeMeta(modeKey) {
  return AUTO_ROUTE_MODE_OPTIONS.find((option) => option.key === modeKey) || AUTO_ROUTE_MODE_OPTIONS[0];
}

export function getDirectionsDurationSeconds(result) {
  const legs = result?.routes?.[0]?.legs || [];
  return legs.reduce((sum, leg) => sum + (Number(leg?.duration?.value) || 0), 0);
}

async function requestDirectionsByMode(directionsService, googleMaps, baseRequest, modeKey) {
  const request = {
    ...baseRequest,
    travelMode: googleMaps.TravelMode[modeKey],
  };

  if (modeKey === "TRANSIT") {
    request.transitOptions = {
      departureTime: new Date(),
    };
  }

  const result = await requestDirections(directionsService, request);
  return {
    modeKey,
    modeMeta: getRouteModeMeta(modeKey),
    directionsResult: result,
  };
}

export function getLegModeKey(leg, fallbackModeKey) {
  const stepModes = Array.isArray(leg?.steps)
    ? leg.steps.map((step) => String(step?.travel_mode || "").toUpperCase()).filter(Boolean)
    : [];

  if (stepModes.includes("TRANSIT")) return "TRANSIT";
  if (stepModes.includes("DRIVING")) return "DRIVING";
  if (stepModes.includes("WALKING")) return "WALKING";
  return fallbackModeKey;
}

export function buildPoiRouteSegments({ directionsResult, modeKey, group }) {
  const legs = directionsResult?.routes?.[0]?.legs || [];
  const segmentsByPoiKey = {};

  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index];
    const destinationPoint = group.points[index + 1];
    if (!destinationPoint) continue;

    const legModeKey = getLegModeKey(leg, modeKey);
    const destinationKey = destinationPoint.dayPoiId != null
      ? `dp:${destinationPoint.dayPoiId}`
      : `vo:${destinationPoint.visitOrder}`;

    segmentsByPoiKey[destinationKey] = {
      modeKey: legModeKey,
      distanceMeters: Number(leg?.distance?.value) || 0,
      durationSeconds: Number(leg?.duration?.value) || 0,
    };
  }

  return segmentsByPoiKey;
}

export function formatRouteDistance(distanceMeters) {
  const numericDistance = Number(distanceMeters);
  const km = numericDistance / 1000;
  if (!Number.isFinite(km) || km <= 0) return "0 km";
  if (km < 1) return `${Math.round(numericDistance)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatRouteDuration(durationSeconds) {
  const mins = Math.round(Number(durationSeconds) / 60);
  if (!Number.isFinite(mins) || mins <= 0) return "0 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

async function requestDirectionsAutoMode(directionsService, googleMaps, baseRequest) {
  const successes = [];
  const errors = [];

  for (const option of AUTO_ROUTE_MODE_OPTIONS) {
    try {
      const result = await requestDirections(directionsService, {
        ...baseRequest,
        travelMode: googleMaps.TravelMode[option.key],
      });

      successes.push({
        modeKey: option.key,
        result,
        durationSeconds: getDirectionsDurationSeconds(result),
      });
    } catch (error) {
      errors.push(`${option.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!successes.length) {
    throw new Error(errors.join(" | ") || "No route available");
  }

  successes.sort((a, b) => a.durationSeconds - b.durationSeconds);
  const selected = successes[0];

  return {
    modeKey: selected.modeKey,
    modeMeta: getRouteModeMeta(selected.modeKey),
    directionsResult: selected.result,
  };
}

export async function requestDirectionsModesInOrder(directionsService, googleMaps, baseRequest, modeKeys) {
  const errors = [];
  for (const modeKey of modeKeys) {
    try {
      return await requestDirectionsByMode(directionsService, googleMaps, baseRequest, modeKey);
    } catch (error) {
      errors.push(`${modeKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join(" | ") || "No route available");
}

export function estimateStraightLineMeters(fromPoint, toPoint) {
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const lat1 = Number(fromPoint?.lat);
  const lng1 = Number(fromPoint?.lng);
  const lat2 = Number(toPoint?.lat);
  const lng2 = Number(toPoint?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;

  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getAutoSegmentModeByDistance(fromPoint, toPoint) {
  return estimateStraightLineMeters(fromPoint, toPoint) < 1000 ? "WALKING" : "DRIVING";
}


export function getPoiIncomingRouteSegment(dayRouteInfo, poi) {
  if (!dayRouteInfo || !poi) return null;

  const directKey = poi.day_poi_id != null ? `dp:${poi.day_poi_id}` : null;
  if (directKey && dayRouteInfo.segmentsByPoiKey?.[directKey]) {
    return dayRouteInfo.segmentsByPoiKey[directKey];
  }

  const fallbackKey = poi.visit_order != null ? `vo:${poi.visit_order}` : null;
  if (fallbackKey && dayRouteInfo.segmentsByPoiKey?.[fallbackKey]) {
    return dayRouteInfo.segmentsByPoiKey[fallbackKey];
  }

  return null;
}

export function createDayTagIcon(googleMaps, color) {
  const fill = encodeURIComponent(color || "#0ea5e9");
  const stroke = encodeURIComponent("#ffffff");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="44" viewBox="0 0 80 44">
      <rect x="10" y="2" width="60" height="24" rx="12" ry="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${svg}`,
    scaledSize: new googleMaps.Size(80, 44),
    size: new googleMaps.Size(80, 44),
    anchor: new googleMaps.Point(40, 44),
    labelOrigin: new googleMaps.Point(40, 15),
  };
}

