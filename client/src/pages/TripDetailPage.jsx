import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { AiChatIcon } from "../components/icons";
import PoiDetailPanel from "../components/PoiDetailPanel";
import {
  addDayPoi,
  createFavorite,
  createFavoriteFromPlace,
  createTripDay,
  deleteFavorite as deleteFavoriteApi,
  deleteTripDay as deleteTripDayApi,
  deleteDayPoi,
  deleteTrip,
  getFavorites,
  getPoiPlaceDetails,
  getTripDetail,
  patchDayPoiNote,
  patchDayPoiTransportMode,
  patchPoiImage,
  patchTrip,
  reorderDayPois,
} from "../services/api";

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDate} - ${endDate}`;
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

function formatDayFromTripStart(startDate, dayNumber) {
  if (!startDate) return "";
  const base = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Math.max(0, Number(dayNumber || 1) - 1));
  return base.toLocaleDateString();
}

function getInclusiveDayCount(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(0, diffDays);
}

function formatTripWeatherDate(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
}

function getWeatherCodeLabel(code) {
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

function getTripWeatherCoords(days) {
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

function withUpdatedDayCountInTitle(title, dayCount) {
  const safeTitle = String(title || "").trim();
  if (!safeTitle) return "Trip Detail";
  if (!Number.isInteger(dayCount) || dayCount <= 0) return safeTitle;
  return safeTitle.replace(/\b\d+\s*-\s*Day\b/i, `${dayCount}-Day`);
}

function getSmartPlanProgressKey(tripId) {
  return `smartgo_smart_plan_progress_${tripId}`;
}

function readSmartPlanProgress(tripId) {
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

function clearSmartPlanProgress(tripId) {
  if (!tripId) return;
  try {
    localStorage.removeItem(getSmartPlanProgressKey(tripId));
  } catch {
    // ignore localStorage errors
  }
}

function getPoiImageCacheKey(poi) {
  if (poi?.poi_id) return `poi:${poi.poi_id}`;
  const name = String(poi?.name || "").trim().toLowerCase();
  const address = String(poi?.address || "").trim().toLowerCase();
  return `poi:${name}|${address}`;
}

function getPoiImageStorageKey() {
  return "smartgo_poi_image_cache_v1";
}

function readPoiImageCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(getPoiImageStorageKey()) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePoiImageCache(next) {
  try {
    localStorage.setItem(getPoiImageStorageKey(), JSON.stringify(next));
  } catch {
    // ignore localStorage quota errors
  }
}

function getTripCoverCacheKey(tripId) {
  return `smartgo_trip_cover_image_${tripId}`;
}

function readTripCoverImage(tripId) {
  if (!tripId) return "";
  try {
    return String(localStorage.getItem(getTripCoverCacheKey(tripId)) || "");
  } catch {
    return "";
  }
}

function writeTripCoverImageOnce(tripId, imageUrl) {
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

function writeTripCoverImageCache(tripId, imageUrl) {
  if (!tripId) return;
  const nextUrl = String(imageUrl || "").trim();
  if (!nextUrl) return;
  try {
    localStorage.setItem(getTripCoverCacheKey(tripId), nextUrl);
  } catch {
    // ignore localStorage errors
  }
}

function isLegacyGooglePlacesPhotoUrl(url) {
  const text = String(url || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("maps.googleapis.com/maps/api/place/photo") && text.includes("photoreference=");
}

function getPlacePhotoUrl(place, maxWidth = 220) {
  const photos = Array.isArray(place?.photos) ? place.photos : [];
  const first = photos[0];
  if (!first || typeof first.getUrl !== "function") return "";
  try {
    return String(first.getUrl({ maxWidth })) || "";
  } catch {
    return "";
  }
}

const DEFAULT_MAP_CENTER = { lat: 3.139, lng: 101.6869 };
const ROUTE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
const TRIP_RECOMMEND_RADIUS_METERS = 2500;
const TRIP_RECOMMEND_MAX_RESULTS = 12;
let googleMapsLoaderPromise = null;

function loadGoogleMapsApi(apiKey) {
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
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

function requestDirections(directionsService, request) {
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

function nearbySearchPlaces(service, request, statusEnum) {
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

function getPlaceDetailsById(service, request, statusEnum) {
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

function toRecommendedPlace(place, fallbackType) {
  const lat = place.geometry?.location?.lat?.();
  const lng = place.geometry?.location?.lng?.();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
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

function mergePlacesByIdLocal(...lists) {
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

function sortPlacesByQualityLocal(list) {
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

function escapeSvgTextLocal(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createRecommendedMarkerIcon(googleMaps, type) {
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

function formatPrimaryTypeLabelLocal(type) {
  const normalized = String(type || "other").trim();
  if (!normalized) return "Other";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(" ");
}

function pickPanelReviewQuotesLocal(rawReviews) {
  const reviews = Array.isArray(rawReviews) ? rawReviews : [];
  const positive = [];
  const negative = [];
  for (const item of reviews) {
    const text = String(item?.text || "").trim();
    const rating = Number(item?.rating);
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (!text || wordCount > 150) continue;
    if (rating >= 4 && positive.length < 1) positive.push(text);
    if (rating <= 2 && negative.length < 1) negative.push(text);
    if (positive.length && negative.length) break;
  }
  if (!positive.length) {
    const first = reviews.map((item) => String(item?.text || "").trim()).find(Boolean);
    if (first) positive.push(first);
  }
  return { positive, negative };
}

function normalizePlaceDetailsForPanel(place, rawDetails) {
  const details = rawDetails || {};
  const editorialSummary = String(details?.editorial_summary?.overview || "").trim();
  const introText = editorialSummary || "No introduction available yet.";
  const weekdayText = Array.isArray(details?.opening_hours?.weekday_text)
    ? details.opening_hours.weekday_text.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const imageUrl = getPlacePhotoUrl(details, 1200);
  return {
    poi: {
      poi_id: null,
      name: String(place?.name || "Unnamed POI").trim(),
      type: String(place?.type || "other").trim() || "other",
      address: String(details?.formatted_address || place?.address || "").trim(),
      description: introText,
      image_url: imageUrl || null,
      lat: Number(place?.lat),
      lng: Number(place?.lng),
    },
    google_place: {
      place_id: String(details?.place_id || place?.placeId || "").trim() || null,
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

function textSearchPlaces(service, request, statusEnum) {
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

const AUTO_ROUTE_MODE_OPTIONS = [
  { key: "WALKING", label: "Walking", shortLabel: "Walk", icon: "W", color: "#0ea5e9" },
  { key: "TRANSIT", label: "Transit", shortLabel: "Transit", icon: "T", color: "#8b5cf6" },
  { key: "DRIVING", label: "Driving", shortLabel: "Drive", icon: "D", color: "#f97316" },
];

const SEGMENT_MODE_OPTIONS = [
  { key: "WALKING", label: "Walk" },
  { key: "DRIVING", label: "Drive" },
  { key: "TRANSIT", label: "Transit" },
];

function getRouteModeMeta(modeKey) {
  return AUTO_ROUTE_MODE_OPTIONS.find((option) => option.key === modeKey) || AUTO_ROUTE_MODE_OPTIONS[0];
}

function getDirectionsDurationSeconds(result) {
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

function getLegModeKey(leg, fallbackModeKey) {
  const stepModes = Array.isArray(leg?.steps)
    ? leg.steps.map((step) => String(step?.travel_mode || "").toUpperCase()).filter(Boolean)
    : [];

  if (stepModes.includes("TRANSIT")) return "TRANSIT";
  if (stepModes.includes("DRIVING")) return "DRIVING";
  if (stepModes.includes("WALKING")) return "WALKING";
  return fallbackModeKey;
}

function buildPoiRouteSegments({ directionsResult, modeKey, group }) {
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

function formatRouteDistance(distanceMeters) {
  const numericDistance = Number(distanceMeters);
  const km = numericDistance / 1000;
  if (!Number.isFinite(km) || km <= 0) return "0 km";
  if (km < 1) return `${Math.round(numericDistance)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function formatRouteDuration(durationSeconds) {
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

async function requestDirectionsModesInOrder(directionsService, googleMaps, baseRequest, modeKeys) {
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

function estimateStraightLineMeters(fromPoint, toPoint) {
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

function getAutoSegmentModeByDistance(fromPoint, toPoint) {
  return estimateStraightLineMeters(fromPoint, toPoint) < 1000 ? "WALKING" : "DRIVING";
}

function RouteModeLineIcon({ modeKey, size = 14, color = "currentColor" }) {
  const isWalking = modeKey === "WALKING";
  const renderSize = isWalking ? size + 1 : size;
  const common = {
    width: renderSize,
    height: renderSize,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: "false",
    style: {
      display: "block",
      transform: isWalking ? "translateY(0.8px)" : undefined,
    },
  };

  if (modeKey === "WALKING") {
    return (
      <svg {...common}>
        <circle cx="12" cy="5" r="1.7" />
        <path d="M12 7.2v5.4" />
        <path d="M9.8 9.8l2.2-1.2 2.2 1.2" />
        <path d="M12 12.6l-2 4.4" />
        <path d="M12 12.6l2 4.4" />
        <path d="M10 17h4" />
      </svg>
    );
  }
  if (modeKey === "DRIVING") {
    return (
      <svg {...common}>
        <path d="M5 16l1.5-4.5A2 2 0 0 1 8.4 10h7.2a2 2 0 0 1 1.9 1.5L19 16" />
        <path d="M4 16h16v3a1 1 0 0 1-1 1h-1v-2H6v2H5a1 1 0 0 1-1-1z" />
        <circle cx="7.5" cy="16" r=".8" fill={color} stroke="none" />
        <circle cx="16.5" cy="16" r=".8" fill={color} stroke="none" />
      </svg>
    );
  }
  if (modeKey === "TRANSIT") {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="12" height="14" rx="2" />
        <path d="M9 17l-1 4" />
        <path d="M15 17l1 4" />
        <path d="M8 8h8" />
        <path d="M10 12h4" />
        <circle cx="9" cy="14" r=".7" fill={color} stroke="none" />
        <circle cx="15" cy="14" r=".7" fill={color} stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function getPoiIncomingRouteSegment(dayRouteInfo, poi) {
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

function PoiRouteSegmentMeta({ segment, overrideMode = "AUTO", onChangeMode }) {
  if (!segment) return null;
  const modeMeta = getRouteModeMeta(segment.modeKey);
  const effectiveSelectedMode = segment.displayOverrideMode || overrideMode;

  return (
    <div style={poiRouteMetaStyle}>
      <span style={poiRouteModeBadgeStyle(modeMeta.color)} aria-hidden="true">
        <RouteModeLineIcon modeKey={segment.modeKey} size={12} color="#fff" />
      </span>
      <span style={{ color: "#334155", fontWeight: 600 }}>{modeMeta.shortLabel}</span>
      <span className="muted">{formatRouteDistance(segment.distanceMeters)}</span>
      <span className="muted">{formatRouteDuration(segment.durationSeconds)}</span>
      {onChangeMode ? (
        <div style={segmentModeSwitchWrapStyle}>
          {SEGMENT_MODE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeMode(option.key);
              }}
              style={{
                ...segmentModeChipStyle,
                ...(effectiveSelectedMode === option.key ? segmentModeChipActiveStyle : null),
              }}
              title={option.label}
            >
              <span style={segmentModeIconSlotStyle}>
                <RouteModeLineIcon modeKey={option.key} size={13} color="#334155" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {segment.warning ? <div style={segmentRouteHintStyle}>{segment.warning}</div> : null}
      {segment.error ? <div style={segmentRouteErrorStyle}>{segment.error}</div> : null}
    </div>
  );
}

function createDayTagIcon(googleMaps, color) {
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

export default function TripDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tripId } = useParams();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeDayInfo, setRouteDayInfo] = useState({});
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [segmentModeOverrides, setSegmentModeOverrides] = useState({});

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingDayPoiId, setEditingDayPoiId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [editingTripNote, setEditingTripNote] = useState(false);
  const [tripNoteDraft, setTripNoteDraft] = useState("");
  const [savingTripNote, setSavingTripNote] = useState(false);
  const [tripNoteError, setTripNoteError] = useState("");
  const [tripWeatherLoading, setTripWeatherLoading] = useState(false);
  const [tripWeatherError, setTripWeatherError] = useState("");
  const [tripWeatherDays, setTripWeatherDays] = useState([]);
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [tripDatesModalOpen, setTripDatesModalOpen] = useState(false);
  const [tripDateDraft, setTripDateDraft] = useState({ start_date: "", end_date: "" });
  const [savingTripDates, setSavingTripDates] = useState(false);
  const [tripDatesError, setTripDatesError] = useState("");
  const [floatingRouteCtaRight, setFloatingRouteCtaRight] = useState(16);
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [routeEditBusy, setRouteEditBusy] = useState(false);
  const [routeEditError, setRouteEditError] = useState("");
  const [draggingDayPoi, setDraggingDayPoi] = useState(null);
  const [addPoiModalOpen, setAddPoiModalOpen] = useState(false);
  const [addPoiTargetDay, setAddPoiTargetDay] = useState(null);
  const [poiSearchQuery, setPoiSearchQuery] = useState("");
  const [poiSearchResults, setPoiSearchResults] = useState([]);
  const [poiSearchLoading, setPoiSearchLoading] = useState(false);
  const [poiSearchError, setPoiSearchError] = useState("");
  const [addingPoi, setAddingPoi] = useState(false);
  const [smartPlanProgress, setSmartPlanProgress] = useState(null);
  const [poiImageUrls, setPoiImageUrls] = useState({});
  const [selectedPoiDetailTarget, setSelectedPoiDetailTarget] = useState(null);
  const [poiDetailPanelOpen, setPoiDetailPanelOpen] = useState(false);
  const [poiDetailLoading, setPoiDetailLoading] = useState(false);
  const [poiDetailError, setPoiDetailError] = useState("");
  const [poiDetailData, setPoiDetailData] = useState(null);
  const [poiDetailRequestKey, setPoiDetailRequestKey] = useState("");
  const [poiDetailIntroExpanded, setPoiDetailIntroExpanded] = useState(false);
  const [poiPlaceDetailsCacheByPoiId, setPoiPlaceDetailsCacheByPoiId] = useState({});
  const [favoritePoiIds, setFavoritePoiIds] = useState([]);
  const [favoriteBusyPoiId, setFavoriteBusyPoiId] = useState(null);
  const [showRecommendedPois, setShowRecommendedPois] = useState(false);
  const [recommendedPois, setRecommendedPois] = useState([]);
  const [recommendedPoisLoading, setRecommendedPoisLoading] = useState(false);
  const [recommendedPoisError, setRecommendedPoisError] = useState("");
  const [recommendedSearchCenter, setRecommendedSearchCenter] = useState(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef([]);
  const routeRendererRefs = useRef([]);
  const recommendedMarkerRefs = useRef([]);
  const drawerRef = useRef(null);
  const placesServiceRef = useRef(null);
  const poiImageLookupInFlightRef = useRef(new Set());
  const poiImagePersistInFlightRef = useRef(new Set());
  const tripCoverPersistAttemptedRef = useRef(new Set());
  const destinationCoverLookupInFlightRef = useRef(false);
  const poiDetailRequestSeqRef = useRef(0);
  const poiDetailHiResImageLookupRef = useRef(new Set());
  const recommendedSearchCacheRef = useRef(new Map());
  const recommendedIdleListenerRef = useRef(null);
  const recommendedDebounceTimerRef = useRef(null);
  const favoritePoiIdByPlaceIdRef = useRef(new Map());
  const placeDetailPanelCacheRef = useRef(new Map());

  useEffect(() => {
    setActiveTab("overview");
    setMapLoading(true);
    setMapError("");
    setRouteLoading(false);
    setRouteError("");
    setRouteDayInfo({});
    setMapReadyVersion(0);
    setSegmentModeOverrides({});

    for (const marker of markerRefs.current) marker.setMap(null);
    markerRefs.current = [];
    for (const renderer of routeRendererRefs.current) renderer.setMap(null);
    routeRendererRefs.current = [];
    mapRef.current = null;
    poiImageLookupInFlightRef.current = new Set();
    poiImagePersistInFlightRef.current = new Set();
    tripCoverPersistAttemptedRef.current = new Set();
    destinationCoverLookupInFlightRef.current = false;
    poiDetailRequestSeqRef.current = 0;
    poiDetailHiResImageLookupRef.current = new Set();
    recommendedSearchCacheRef.current = new Map();
    if (recommendedDebounceTimerRef.current) {
      clearTimeout(recommendedDebounceTimerRef.current);
      recommendedDebounceTimerRef.current = null;
    }
    setShowRecommendedPois(false);
    setRecommendedPois([]);
    setRecommendedPoisLoading(false);
    setRecommendedPoisError("");
    setRecommendedSearchCenter(null);
    setSelectedPoiDetailTarget(null);
    setPoiDetailPanelOpen(false);
    setPoiDetailLoading(false);
    setPoiDetailError("");
    setPoiDetailData(null);
    setPoiDetailRequestKey("");
    setPoiDetailIntroExpanded(false);
    setPoiPlaceDetailsCacheByPoiId({});
    setFavoritePoiIds([]);
    setFavoriteBusyPoiId(null);
    favoritePoiIdByPlaceIdRef.current = new Map();
    placeDetailPanelCacheRef.current = new Map();
  }, [tripId]);

  useEffect(() => {
    setPoiImageUrls(readPoiImageCache());
  }, [tripId]);

  useEffect(() => {
    const localProgress = readSmartPlanProgress(tripId);
    if (localProgress) {
      setSmartPlanProgress(localProgress);
      return;
    }
    if (location.state?.smartPlanGenerating) {
      setSmartPlanProgress({
        status: "generating",
        message: "Smart plan is generating...",
      });
    } else {
      setSmartPlanProgress(null);
    }
  }, [tripId, location.state]);

  useEffect(() => {
    const handleProgressEvent = (event) => {
      const payload = event?.detail;
      if (!payload || String(payload.tripId) !== String(tripId)) return;

      const status = String(payload.status || "");
      const message = String(payload.message || "");

      if (status === "completed") {
        clearSmartPlanProgress(tripId);
        setSmartPlanProgress(null);
        void fetchDetail({ showPageLoading: false });
        return;
      }

      if (status === "error") {
        setSmartPlanProgress({ status: "error", message });
        return;
      }

      if (status === "generating") {
        setSmartPlanProgress({ status: "generating", message: message || "Smart plan is generating..." });
      }
    };

    window.addEventListener("smartgo:smart-plan-progress", handleProgressEvent);
    return () => window.removeEventListener("smartgo:smart-plan-progress", handleProgressEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    const persistedOverrides = {};
    for (const day of detail?.days || []) {
      for (const poi of day?.pois || []) {
        if (!poi?.day_poi_id) continue;
        const mode = poi.transport_mode_override ? String(poi.transport_mode_override).toUpperCase() : null;
        if (!mode) continue;
        persistedOverrides[`${String(day.day_id)}|dp:${poi.day_poi_id}`] = mode;
      }
    }
    setEditingTripNote(false);
    setTripNoteDraft(String(detail?.trip?.note || ""));
    setTripNoteError("");
    setTripDateDraft({
      start_date: String(detail?.trip?.start_date || ""),
      end_date: String(detail?.trip?.end_date || ""),
    });
    setTripDatesModalOpen(false);
    setTripDatesError("");
    setTripMenuOpen(false);
    setRouteEditError("");
    setDraggingDayPoi(null);
    setSegmentModeOverrides(persistedOverrides);
    setAddPoiModalOpen(false);
    setPoiSearchQuery("");
    setPoiSearchResults([]);
    setPoiSearchError("");
  }, [detail?.trip?.trip_id, detail?.trip?.note, detail?.days]);

  useEffect(() => {
    let cancelled = false;
    const rawUser = typeof window !== "undefined" ? localStorage.getItem("smartgo_user") : null;
    let user = null;
    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      user = null;
    }
    if (!user?.user_id) {
      setFavoritePoiIds([]);
      return;
    }

    (async () => {
      try {
        const rows = await getFavorites();
        if (cancelled) return;
        const ids = [];
        const byPlaceId = new Map();
        for (const item of Array.isArray(rows) ? rows : []) {
          const poiId = Number(item?.poi_id);
          if (Number.isInteger(poiId) && poiId > 0) ids.push(poiId);
          const placeId = String(item?.google_place_id || "").trim();
          if (placeId && Number.isInteger(poiId) && poiId > 0) byPlaceId.set(placeId, poiId);
        }
        favoritePoiIdByPlaceIdRef.current = byPlaceId;
        setFavoritePoiIds(ids);
      } catch {
        if (!cancelled) setFavoritePoiIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    const updateFloatingCtaPosition = () => {
      const drawerEl = drawerRef.current;
      if (!drawerEl) {
        setFloatingRouteCtaRight(16);
        return;
      }
      const rect = drawerEl.getBoundingClientRect();
      const nextRight = Math.max(16, Math.round(window.innerWidth - rect.right));
      setFloatingRouteCtaRight(nextRight);
    };

    updateFloatingCtaPosition();
    window.addEventListener("resize", updateFloatingCtaPosition);
    return () => window.removeEventListener("resize", updateFloatingCtaPosition);
  }, [tripId, activeTab, detail]);

  const fetchDetail = async ({ showPageLoading = true } = {}) => {
    try {
      if (showPageLoading) setLoading(true);
      setError("");
      const data = await getTripDetail(tripId);
      setDetail(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || "Failed to load trip detail");
      } else {
        setError("Failed to load trip detail");
      }
    } finally {
      if (showPageLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchDetail({ showPageLoading: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const trip = detail?.trip ?? null;
  const tripDayCount = getInclusiveDayCount(trip?.start_date, trip?.end_date);
  const currentUser = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("smartgo_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);
  const isSmartPlanGenerating = smartPlanProgress?.status === "generating";
  const smartPlanErrorMessage = smartPlanProgress?.status === "error" ? String(smartPlanProgress.message || "") : "";
  const smartPlanStatusMessage = String(smartPlanProgress?.message || "").trim();
  const isDesktopPoiDetailLayout = typeof window !== "undefined" && window.innerWidth >= 960;

  const sortedDays = useMemo(() => {
    const rawDays = Array.isArray(detail?.days) ? [...detail.days] : [];
    rawDays.sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0));
    const normalizedDays = rawDays.map((day) => ({
      ...day,
      pois: [...(day.pois || [])].sort((a, b) => (a.visit_order ?? 0) - (b.visit_order ?? 0)),
    }));
    const expectedDays = tripDayCount || normalizedDays.length;
    if (expectedDays <= normalizedDays.length) return normalizedDays;

    const byDayNumber = new Map(normalizedDays.map((day) => [Number(day.day_number), day]));
    const paddedDays = [];
    for (let dayNumber = 1; dayNumber <= expectedDays; dayNumber += 1) {
      const existing = byDayNumber.get(dayNumber);
      if (existing) {
        paddedDays.push(existing);
        continue;
      }
      paddedDays.push({
        day_id: `virtual-${dayNumber}`,
        day_number: dayNumber,
        pois: [],
      });
    }
    return paddedDays;
  }, [detail, tripDayCount]);

  const tripWeatherCoords = useMemo(() => getTripWeatherCoords(sortedDays), [sortedDays]);

  useEffect(() => {
    const startDate = String(trip?.start_date || "").trim();
    const endDate = String(trip?.end_date || "").trim();

    if (!startDate || !endDate) {
      setTripWeatherDays([]);
      setTripWeatherError("");
      setTripWeatherLoading(false);
      return;
    }

    if (!tripWeatherCoords) {
      setTripWeatherDays([]);
      setTripWeatherError("Add a POI with coordinates to load weather.");
      setTripWeatherLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setTripWeatherLoading(true);
      setTripWeatherError("");

      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(tripWeatherCoords.lat));
        url.searchParams.set("longitude", String(tripWeatherCoords.lng));
        url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
        url.searchParams.set("timezone", "auto");
        url.searchParams.set("start_date", startDate);
        url.searchParams.set("end_date", endDate);

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`Weather request failed (${response.status})`);
        }

        const data = await response.json();
        const times = Array.isArray(data?.daily?.time) ? data.daily.time : [];
        const maxTemps = Array.isArray(data?.daily?.temperature_2m_max) ? data.daily.temperature_2m_max : [];
        const minTemps = Array.isArray(data?.daily?.temperature_2m_min) ? data.daily.temperature_2m_min : [];
        const weatherCodes = Array.isArray(data?.daily?.weather_code) ? data.daily.weather_code : [];

        const rows = times.map((dateText, index) => ({
          date: dateText,
          max: Number(maxTemps[index]),
          min: Number(minTemps[index]),
          weatherCode: weatherCodes[index],
        }));

        if (cancelled) return;
        setTripWeatherDays(rows);
        if (!rows.length) {
          setTripWeatherError("No weather data available for the selected dates.");
        }
      } catch (err) {
        if (cancelled) return;
        setTripWeatherDays([]);
        setTripWeatherError(err instanceof Error ? err.message : "Failed to load trip weather");
      } finally {
        if (!cancelled) setTripWeatherLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [trip?.start_date, trip?.end_date, tripWeatherCoords]);

  useEffect(() => {
    if (activeTab === "overview") return;
    const exists = sortedDays.some((day) => String(day.day_id) === String(activeTab));
    if (!exists) {
      setActiveTab("overview");
    }
  }, [activeTab, sortedDays]);

  const visibleDays = useMemo(() => {
    if (activeTab === "overview") return sortedDays;
    return sortedDays.filter((day) => String(day.day_id) === String(activeTab));
  }, [sortedDays, activeTab]);

  useEffect(() => {
    if (activeTab === "overview") return;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    let cancelled = false;
    const currentCache = readPoiImageCache();

    const poisToResolve = visibleDays
      .flatMap((day) => day?.pois || [])
      .filter((poi) => poi?.name)
      .filter((poi) => {
        if (poi.image_url) return false;
        const cacheKey = getPoiImageCacheKey(poi);
        return !currentCache[cacheKey];
      });

    if (!poisToResolve.length) return;

    const run = async () => {
      for (const poi of poisToResolve) {
        if (cancelled) break;
        const cacheKey = getPoiImageCacheKey(poi);
        if (poiImageLookupInFlightRef.current.has(cacheKey)) continue;
        poiImageLookupInFlightRef.current.add(cacheKey);
        try {
          const query = `${poi.name} ${poi.address || ""} ${trip?.destination || ""}`.trim();
          const results = await textSearchPlaces(
            service,
            {
              query,
              location:
                mapRef.current?.getCenter?.() ||
                new window.google.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
              radius: 30000,
            },
            statusEnum
          );
          const photoUrl = getPlacePhotoUrl(results[0], 220);
          if (!photoUrl || cancelled) continue;

          const nextCache = {
            ...readPoiImageCache(),
            [cacheKey]: photoUrl,
          };
          writePoiImageCache(nextCache);
          setPoiImageUrls((prev) => ({ ...prev, [cacheKey]: photoUrl }));

          if (poi?.poi_id && !poi.image_url && !poiImagePersistInFlightRef.current.has(String(poi.poi_id))) {
            poiImagePersistInFlightRef.current.add(String(poi.poi_id));
            void patchPoiImage(poi.poi_id, photoUrl)
              .catch(() => {})
              .finally(() => {
                poiImagePersistInFlightRef.current.delete(String(poi.poi_id));
              });
          }

        } catch {
          // keep silent; missing image should not block route editing
        } finally {
          poiImageLookupInFlightRef.current.delete(cacheKey);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, visibleDays, sortedDays, trip?.destination, tripId, poiImageUrls]);

  const totalPois = useMemo(
    () => sortedDays.reduce((sum, day) => sum + (day.pois?.length || 0), 0),
    [sortedDays]
  );

  useEffect(() => {
    const serverCover = String(trip?.cover_image_url || "").trim();
    if (!serverCover) return;
    if (isLegacyGooglePlacesPhotoUrl(serverCover)) return;
    writeTripCoverImageOnce(tripId, serverCover);
  }, [tripId, trip?.cover_image_url]);

  useEffect(() => {
    if (!trip?.trip_id) return;
    const currentCover = String(trip.cover_image_url || "").trim();
    const needsDestinationCover = !currentCover || isLegacyGooglePlacesPhotoUrl(currentCover);
    if (!needsDestinationCover) return;
    if (!String(trip.destination || "").trim()) return;
    if (destinationCoverLookupInFlightRef.current) return;

    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    let cancelled = false;
    destinationCoverLookupInFlightRef.current = true;

    const run = async () => {
      try {
        const destinationText = String(trip.destination).trim();
        const queries = [
          `${destinationText} Malaysia`,
          `${destinationText} city Malaysia`,
          `${destinationText} skyline Malaysia`,
          destinationText,
        ];

        let photoUrl = "";
        for (const query of queries) {
          const results = await textSearchPlaces(
            service,
            {
              query,
              location:
                mapRef.current?.getCenter?.() ||
                new window.google.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
              radius: 50000,
            },
            statusEnum
          );
          photoUrl = getPlacePhotoUrl(results[0], 1200);
          if (photoUrl) break;
        }

        if (!photoUrl || cancelled) return;

        await patchTrip(trip.trip_id, { cover_image_url: photoUrl });
        if (cancelled) return;

        writeTripCoverImageCache(trip.trip_id, photoUrl);
        setDetail((prev) => (
          prev?.trip?.trip_id === trip.trip_id
            ? { ...prev, trip: { ...prev.trip, cover_image_url: photoUrl } }
            : prev
        ));
      } catch {
        // keep silent; destination cover is best-effort
      } finally {
        destinationCoverLookupInFlightRef.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [trip?.trip_id, trip?.destination, trip?.cover_image_url, mapReadyVersion]);

  const dayColorById = useMemo(() => {
    const entries = sortedDays.map((day, idx) => [String(day.day_id), ROUTE_COLORS[idx % ROUTE_COLORS.length]]);
    return Object.fromEntries(entries);
  }, [sortedDays]);

  const mapPoints = useMemo(() => {
    return visibleDays.flatMap((day) =>
      (day.pois || [])
        .map((poi) => {
          const lat = Number(poi.lat);
          const lng = Number(poi.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            lat,
            lng,
            name: poi.name || "Unnamed POI",
            poiId: poi.poi_id ?? null,
            dayNumber: day.day_number,
            dayId: day.day_id,
            visitOrder: poi.visit_order,
            dayPoiId: poi.day_poi_id ?? null,
            address: poi.address ?? "",
            type: poi.type ?? "other",
            description: poi.description ?? "",
            image_url: poi.image_url || poiImageUrls[getPoiImageCacheKey(poi)] || null,
            color: dayColorById[String(day.day_id)] || ROUTE_COLORS[0],
          };
        })
        .filter(Boolean)
    );
  }, [visibleDays, dayColorById, poiImageUrls]);

  const routeGroups = useMemo(() => {
    return visibleDays
      .map((day) => {
        const points = (day.pois || [])
          .map((poi) => {
            const lat = Number(poi.lat);
            const lng = Number(poi.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              lat,
              lng,
              name: poi.name || "Unnamed POI",
              visitOrder: poi.visit_order,
              dayPoiId: poi.day_poi_id ?? null,
            };
          })
          .filter(Boolean);

        return {
          dayId: day.day_id,
          dayNumber: day.day_number,
          color: dayColorById[String(day.day_id)] || ROUTE_COLORS[0],
          points,
        };
      })
      .filter((group) => group.points.length >= 2);
  }, [visibleDays, dayColorById]);

  const routeLegendItems = useMemo(() => {
    if (activeTab !== "overview") return [];
    return routeGroups.map((group) => ({
      key: group.dayId,
      label: `Day ${group.dayNumber}`,
      color: group.color,
      pointCount: group.points.length,
    }));
  }, [activeTab, routeGroups]);

  const loadPoiDetailData = async (target) => {
    const poiId = Number(target?.poi?.poi_id ?? target?.poiId);
    if (!Number.isInteger(poiId) || poiId <= 0) return;

    const cached = poiPlaceDetailsCacheByPoiId[poiId];
    if (cached) {
      setPoiDetailData(cached);
      setPoiDetailError("");
      setPoiDetailLoading(false);
      return;
    }

    const requestSeq = poiDetailRequestSeqRef.current + 1;
    poiDetailRequestSeqRef.current = requestSeq;
    const requestKey = `${poiId}:${requestSeq}`;
    setPoiDetailRequestKey(requestKey);
    setPoiDetailLoading(true);
    setPoiDetailError("");

    try {
      const payload = await getPoiPlaceDetails(poiId);
      if (poiDetailRequestSeqRef.current !== requestSeq) return;
      setPoiDetailData(payload);
      setPoiPlaceDetailsCacheByPoiId((prev) => ({ ...prev, [poiId]: payload }));
    } catch (err) {
      if (poiDetailRequestSeqRef.current !== requestSeq) return;
      if (axios.isAxiosError(err)) {
        setPoiDetailError(err.response?.data?.error || "Failed to load place details");
      } else {
        setPoiDetailError("Failed to load place details");
      }
      setPoiDetailData(null);
    } finally {
      if (poiDetailRequestSeqRef.current === requestSeq) {
        setPoiDetailLoading(false);
      }
    }
  };

  const openPoiDetail = (target) => {
    if (!target?.poi) return;
    if (target?.dayId != null && activeTab === "overview") {
      setActiveTab(String(target.dayId));
    }
    setSelectedPoiDetailTarget(target);
    setPoiDetailPanelOpen(true);
    setPoiDetailIntroExpanded(false);
    setPoiDetailError("");
    const poiId = Number(target?.poi?.poi_id);
    const cached = Number.isInteger(poiId) ? poiPlaceDetailsCacheByPoiId[poiId] : null;
    setPoiDetailData(cached || null);
    setPoiDetailLoading(!cached && Number.isInteger(poiId));
    void loadPoiDetailData(target);
  };

  const closePoiDetailPanel = () => {
    setPoiDetailPanelOpen(false);
    setPoiDetailLoading(false);
    setPoiDetailError("");
    setPoiDetailIntroExpanded(false);
  };

  useEffect(() => {
    if (!poiDetailPanelOpen) return;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    const poiId = Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id);
    const placeId = String(poiDetailData?.google_place?.place_id || "").trim();
    if (!Number.isInteger(poiId) || poiId <= 0 || !placeId) return;
    if (poiDetailHiResImageLookupRef.current.has(placeId)) return;

    const existingImage = String(poiDetailData?.poi?.image_url || "").trim();
    // If this detail image already looks like a modern non-legacy URL and is not tiny-cache style,
    // we still allow upgrade once, but avoid repeated requests by gating with the placeId set.
    poiDetailHiResImageLookupRef.current.add(placeId);

    let cancelled = false;
    (async () => {
      try {
        const details = await getPlaceDetailsById(
          service,
          {
            placeId,
            fields: ["place_id", "photos"],
          },
          statusEnum
        );
        if (cancelled) return;

        const hiResUrl = getPlacePhotoUrl(details, 1200);
        if (!hiResUrl || hiResUrl === existingImage) return;

        setPoiDetailData((prev) => {
          const prevPoiId = Number(prev?.poi?.poi_id);
          if (prevPoiId !== poiId) return prev;
          return {
            ...prev,
            poi: {
              ...(prev?.poi || {}),
              image_url: hiResUrl,
            },
          };
        });

        setPoiPlaceDetailsCacheByPoiId((prev) => {
          const cached = prev?.[poiId];
          if (!cached) return prev;
          return {
            ...prev,
            [poiId]: {
              ...cached,
              poi: {
                ...(cached.poi || {}),
                image_url: hiResUrl,
              },
            },
          };
        });
      } catch {
        // Best-effort enhancement; keep existing image if high-res fetch fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [poiDetailPanelOpen, poiDetailData, selectedPoiDetailTarget, mapReadyVersion]);

  useEffect(() => {
    if (!poiDetailPanelOpen) return;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    const selectedPoiId = Number(selectedPoiDetailTarget?.poi?.poi_id);
    const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
    if (Number.isInteger(selectedPoiId) && selectedPoiId > 0) return;
    if (!placeId) return;

    const cached = placeDetailPanelCacheRef.current.get(placeId);
    if (cached) {
      setPoiDetailData(cached);
      setPoiDetailLoading(false);
      setPoiDetailError("");
      return;
    }

    const requestSeq = poiDetailRequestSeqRef.current + 1;
    poiDetailRequestSeqRef.current = requestSeq;
    setPoiDetailRequestKey(`place:${placeId}:${requestSeq}`);
    setPoiDetailLoading(true);
    setPoiDetailError("");

    (async () => {
      try {
        const rawDetails = await getPlaceDetailsById(
          service,
          {
            placeId,
            fields: [
              "place_id",
              "name",
              "rating",
              "user_ratings_total",
              "types",
              "reviews",
              "editorial_summary",
              "formatted_address",
              "formatted_phone_number",
              "international_phone_number",
              "website",
              "url",
              "opening_hours",
              "photos",
            ],
          },
          statusEnum
        );
        if (poiDetailRequestSeqRef.current !== requestSeq) return;
        const normalized = normalizePlaceDetailsForPanel(
          {
            placeId,
            name: selectedPoiDetailTarget?.poi?.name,
            address: selectedPoiDetailTarget?.poi?.address,
            lat: selectedPoiDetailTarget?.poi?.lat,
            lng: selectedPoiDetailTarget?.poi?.lng,
            type: selectedPoiDetailTarget?.poi?.type,
          },
          rawDetails
        );
        placeDetailPanelCacheRef.current.set(placeId, normalized);
        setPoiDetailData(normalized);
      } catch (err) {
        if (poiDetailRequestSeqRef.current !== requestSeq) return;
        setPoiDetailError(err instanceof Error ? err.message : "Failed to load place details");
        setPoiDetailData(
          normalizePlaceDetailsForPanel(
            {
              placeId,
              name: selectedPoiDetailTarget?.poi?.name,
              address: selectedPoiDetailTarget?.poi?.address,
              lat: selectedPoiDetailTarget?.poi?.lat,
              lng: selectedPoiDetailTarget?.poi?.lng,
              type: selectedPoiDetailTarget?.poi?.type,
            },
            null
          )
        );
      } finally {
        if (poiDetailRequestSeqRef.current === requestSeq) setPoiDetailLoading(false);
      }
    })();
  }, [poiDetailPanelOpen, selectedPoiDetailTarget, poiDetailData, mapReadyVersion]);

  const handleToggleFavoriteFromPoiDetail = async () => {
    const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
    const poiId =
      Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id) ||
      Number(favoritePoiIdByPlaceIdRef.current.get(placeId));

    const rawUser = typeof window !== "undefined" ? localStorage.getItem("smartgo_user") : null;
    let user = null;
    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      user = null;
    }
    if (!user?.user_id) {
      setPoiDetailError("Please log in to save favorites");
      return;
    }

    const isFavorite = Number.isInteger(poiId) && poiId > 0 && favoritePoiIds.includes(poiId);
    try {
      setFavoriteBusyPoiId(Number.isInteger(poiId) && poiId > 0 ? poiId : -1);
      if (isFavorite) {
        await deleteFavoriteApi(poiId);
        setFavoritePoiIds((prev) => prev.filter((id) => id !== poiId));
      } else {
        if (Number.isInteger(poiId) && poiId > 0) {
          await createFavorite(poiId);
          setFavoritePoiIds((prev) => (prev.includes(poiId) ? prev : [poiId, ...prev]));
        } else {
          const payload = {
            name: String(selectedPoiDetailTarget?.poi?.name || poiDetailData?.poi?.name || "").trim(),
            type: String(selectedPoiDetailTarget?.poi?.type || poiDetailData?.poi?.type || "other").trim() || "other",
            address: String(selectedPoiDetailTarget?.poi?.address || poiDetailData?.poi?.address || "").trim(),
            lat: selectedPoiDetailTarget?.poi?.lat ?? poiDetailData?.poi?.lat ?? null,
            lng: selectedPoiDetailTarget?.poi?.lng ?? poiDetailData?.poi?.lng ?? null,
            google_place_id: placeId || null,
            description:
              String(poiDetailData?.google_place?.introduction || poiDetailData?.poi?.description || "").trim() || null,
            image_url: poiDetailData?.poi?.image_url || null,
          };
          const result = await createFavoriteFromPlace(payload);
          const newPoiId = Number(result?.poi_id);
          if (!Number.isInteger(newPoiId) || newPoiId <= 0) {
            throw new Error("Favorite created but poi_id missing");
          }
          if (placeId) favoritePoiIdByPlaceIdRef.current.set(placeId, newPoiId);
          setFavoritePoiIds((prev) => (prev.includes(newPoiId) ? prev : [newPoiId, ...prev]));
          setSelectedPoiDetailTarget((prev) =>
            prev ? { ...prev, poi: { ...(prev.poi || {}), poi_id: newPoiId } } : prev
          );
          setPoiDetailData((prev) =>
            prev ? { ...prev, poi: { ...(prev.poi || {}), poi_id: newPoiId } } : prev
          );
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setPoiDetailError(err.response?.data?.error || "Failed to update favorite");
      } else if (err instanceof Error) {
        setPoiDetailError(err.message || "Failed to update favorite");
      } else {
        setPoiDetailError("Failed to update favorite");
      }
    } finally {
      setFavoriteBusyPoiId(null);
    }
  };

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    let cancelled = false;

    if (loading) return;

    if (!apiKey) {
      setMapLoading(false);
      setMapError("Missing VITE_GOOGLE_MAPS_API_KEY");
      return;
    }

    (async () => {
      try {
        setMapLoading(true);
        setMapError("");
        const maps = await loadGoogleMapsApi(apiKey);
        if (cancelled) return;
        if (!mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center: DEFAULT_MAP_CENTER,
            zoom: 12,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            cameraControl: false,
            zoomControl: false,
            rotateControl: false,
            keyboardShortcuts: false,
            gestureHandling: "greedy",
            clickableIcons: false,
            styles: [
              { featureType: "poi", stylers: [{ visibility: "off" }] },
              { featureType: "transit.station", stylers: [{ visibility: "off" }] },
            ],
          });
        }
        if (!placesServiceRef.current && window.google?.maps?.places?.PlacesService) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(mapRef.current);
        }
        setMapReadyVersion((value) => value + 1);
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : "Failed to load map");
        }
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, loading]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    if (googleMaps.event?.trigger) {
      googleMaps.event.trigger(map, "resize");
    }

    for (const marker of markerRefs.current) marker.setMap(null);
    markerRefs.current = [];

    if (mapPoints.length === 0) {
      map.setCenter(DEFAULT_MAP_CENTER);
      map.setZoom(11);
      return;
    }

    const bounds = new googleMaps.LatLngBounds();
    markerRefs.current = mapPoints.flatMap((point) => {
      const isOverview = activeTab === "overview";
      const primaryMarker = new googleMaps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.name,
        label: {
          text: String(point.visitOrder ?? ""),
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "11px",
        },
        icon:
          isOverview || point.color
          ? {
              path: googleMaps.SymbolPath.CIRCLE,
              fillColor: point.color || "#0ea5e9",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              scale: 11,
            }
          : undefined,
      });
      primaryMarker.addListener("click", () => {
        openPoiDetail({
          dayId: point.dayId ?? null,
          dayPoiId: point.dayPoiId ?? null,
          poiId: point.poiId ?? null,
          poi: {
            poi_id: point.poiId ?? null,
            name: point.name || "Unnamed POI",
            type: point.type || "other",
            address: point.address || "",
            description: point.description || "",
            image_url: point.image_url || null,
            lat: point.lat,
            lng: point.lng,
          },
        });
      });
      bounds.extend(primaryMarker.getPosition());

      if (!(isOverview && Number(point.visitOrder) === 1)) {
        return [primaryMarker];
      }

      const dayTagMarker = new googleMaps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        clickable: false,
        zIndex: (primaryMarker.getZIndex?.() || 0) + 1,
        icon: createDayTagIcon(googleMaps, point.color || "#0ea5e9"),
        label: {
          text: `Day${point.dayNumber}`,
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "12px",
        },
      });

      return [primaryMarker, dayTagMarker];
    });

    if (mapPoints.length === 1) {
      map.setCenter({ lat: mapPoints[0].lat, lng: mapPoints[0].lng });
      map.setZoom(14);
      return;
    }

    map.fitBounds(bounds, 48);
  }, [mapPoints, activeTab, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    if (recommendedIdleListenerRef.current) {
      googleMaps.event.removeListener(recommendedIdleListenerRef.current);
      recommendedIdleListenerRef.current = null;
    }

    if (!showRecommendedPois) return;

    const syncCenter = () => {
      const center = map.getCenter?.();
      const lat = center?.lat?.();
      const lng = center?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setRecommendedSearchCenter((prev) => {
        if (prev && Math.abs(prev.lat - lat) < 0.0002 && Math.abs(prev.lng - lng) < 0.0002) return prev;
        return { lat, lng };
      });
    };

    syncCenter();
    recommendedIdleListenerRef.current = map.addListener("idle", syncCenter);

    return () => {
      if (recommendedIdleListenerRef.current) {
        googleMaps.event.removeListener(recommendedIdleListenerRef.current);
        recommendedIdleListenerRef.current = null;
      }
    };
  }, [showRecommendedPois, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!showRecommendedPois) {
      setRecommendedPois([]);
      setRecommendedPoisLoading(false);
      setRecommendedPoisError("");
      return;
    }
    if (!map || !service || !statusEnum) return;

    const center = recommendedSearchCenter || map.getCenter?.()?.toJSON?.();
    const lat = Number(center?.lat);
    const lng = Number(center?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = recommendedSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setRecommendedPois(cached);
      setRecommendedPoisError("");
      return;
    }

    if (recommendedDebounceTimerRef.current) clearTimeout(recommendedDebounceTimerRef.current);

    recommendedDebounceTimerRef.current = setTimeout(async () => {
      const tripPoiKeys = new Set(
        (mapPoints || []).map((p) => `${String(p.name || "").trim().toLowerCase()}|${String(p.address || "").trim().toLowerCase()}`)
      );

      try {
        setRecommendedPoisLoading(true);
        setRecommendedPoisError("");
        const baseRequest = { location: { lat, lng }, radius: TRIP_RECOMMEND_RADIUS_METERS };
        const [foodResults, attractionResults] = await Promise.all([
          nearbySearchPlaces(service, { ...baseRequest, type: "restaurant" }, statusEnum),
          nearbySearchPlaces(service, { ...baseRequest, type: "tourist_attraction" }, statusEnum),
        ]);

        const merged = mergePlacesByIdLocal(
          foodResults.map((p) => toRecommendedPlace(p, "food")).filter(Boolean),
          attractionResults.map((p) => toRecommendedPlace(p, "attractions")).filter(Boolean)
        );

        const filtered = merged.filter((p) => {
          const key = `${String(p.name || "").trim().toLowerCase()}|${String(p.address || "").trim().toLowerCase()}`;
          if (tripPoiKeys.has(key)) return false;
          return true;
        });

        const next = sortPlacesByQualityLocal(filtered).slice(0, TRIP_RECOMMEND_MAX_RESULTS);
        recommendedSearchCacheRef.current.set(cacheKey, next);
        setRecommendedPois(next);
      } catch (err) {
        setRecommendedPois([]);
        setRecommendedPoisError(err instanceof Error ? err.message : "Failed to load recommended places");
      } finally {
        setRecommendedPoisLoading(false);
      }
    }, 250);

    return () => {
      if (recommendedDebounceTimerRef.current) {
        clearTimeout(recommendedDebounceTimerRef.current);
        recommendedDebounceTimerRef.current = null;
      }
    };
  }, [showRecommendedPois, recommendedSearchCenter, mapReadyVersion, mapPoints]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    for (const marker of recommendedMarkerRefs.current) marker.setMap(null);
    recommendedMarkerRefs.current = [];

    if (!showRecommendedPois) return;

    recommendedMarkerRefs.current = (recommendedPois || []).map((poi) => {
      const marker = new googleMaps.Marker({
        map,
        position: { lat: poi.lat, lng: poi.lng },
        title: poi.name || "Recommended POI",
        icon: createRecommendedMarkerIcon(googleMaps, poi.type),
        zIndex: 1,
      });

      marker.addListener("click", () => {
        setSelectedPoiDetailTarget({
          poi: {
            poi_id: null,
            name: poi.name || "Unnamed POI",
            type: poi.type || "other",
            address: poi.address || "",
            description: "",
            image_url: null,
            lat: poi.lat,
            lng: poi.lng,
          },
          placeId: poi.placeId || null,
        });
        setPoiDetailPanelOpen(true);
        setPoiDetailIntroExpanded(false);
        setPoiDetailError("");
        setPoiDetailLoading(false);
        setPoiDetailData(null);
        setPoiDetailRequestKey(`recommended:${poi.placeId || poi.name}:${Date.now()}`);
      });

      return marker;
    });

    return () => {
      for (const marker of recommendedMarkerRefs.current) marker.setMap(null);
      recommendedMarkerRefs.current = [];
    };
  }, [showRecommendedPois, recommendedPois, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    let cancelled = false;

    if (!map || !googleMaps) return;

    for (const renderer of routeRendererRefs.current) renderer.setMap(null);
    routeRendererRefs.current = [];
    setRouteError("");
    setRouteDayInfo({});

    if (routeGroups.length === 0) {
      setRouteLoading(false);
      return;
    }

    (async () => {
      try {
        setRouteLoading(true);
        const directionsService = new googleMaps.DirectionsService();
        const nextRouteDayInfo = {};
        const routeWarnings = [];

        for (const group of routeGroups) {
          if (cancelled) return;

          const dayInfo = {
            modeKey: null,
            modeLabel: null,
            segmentsByPoiKey: {},
          };

          for (let index = 0; index < group.points.length - 1; index += 1) {
            const fromPoint = group.points[index];
            const toPoint = group.points[index + 1];
            if (!fromPoint || !toPoint) continue;

            try {
              const baseDirectionsRequest = {
                origin: { lat: fromPoint.lat, lng: fromPoint.lng },
                destination: { lat: toPoint.lat, lng: toPoint.lng },
                optimizeWaypoints: false,
              };
              const segmentKey = toPoint.dayPoiId != null ? `dp:${toPoint.dayPoiId}` : `vo:${toPoint.visitOrder}`;
              const overrideKey = `${String(group.dayId)}|${segmentKey}`;
              const overrideMode = segmentModeOverrides[overrideKey] || "AUTO";

              let autoRoute;
              let segmentWarning = "";
              if (overrideMode === "AUTO") {
                const autoMode = getAutoSegmentModeByDistance(fromPoint, toPoint);
                autoRoute = await requestDirectionsModesInOrder(
                  directionsService,
                  googleMaps,
                  baseDirectionsRequest,
                  autoMode === "WALKING"
                    ? ["WALKING", "DRIVING", "TRANSIT"]
                    : ["DRIVING", "WALKING", "TRANSIT"]
                );
              } else {
                try {
                  autoRoute = await requestDirectionsModesInOrder(
                    directionsService,
                    googleMaps,
                    baseDirectionsRequest,
                    [overrideMode]
                  );
                } catch (overrideErr) {
                  const autoMode = getAutoSegmentModeByDistance(fromPoint, toPoint);
                  const fallbackOrder = [
                    autoMode,
                    autoMode === "WALKING" ? "DRIVING" : "WALKING",
                    "TRANSIT",
                  ].filter((mode, idx, arr) => mode !== overrideMode && arr.indexOf(mode) === idx);

                  autoRoute = await requestDirectionsModesInOrder(
                    directionsService,
                    googleMaps,
                    baseDirectionsRequest,
                    fallbackOrder
                  );

                  segmentWarning =
                    overrideMode === "TRANSIT"
                      ? `No transit route for this segment, using ${autoRoute.modeMeta.shortLabel}.`
                      : `${getRouteModeMeta(overrideMode).shortLabel} unavailable, using ${autoRoute.modeMeta.shortLabel}.`;
                }
              }

              if (cancelled) return;

              const renderer = new googleMaps.DirectionsRenderer({
                map,
                directions: autoRoute.directionsResult,
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: {
                  strokeColor: group.color,
                  strokeOpacity: 0.85,
                  strokeWeight: 5,
                },
              });
              routeRendererRefs.current.push(renderer);

              const leg = autoRoute.directionsResult?.routes?.[0]?.legs?.[0];
              const actualLegModeKey = getLegModeKey(leg, autoRoute.modeKey);
              if (!segmentWarning && overrideMode !== "AUTO" && actualLegModeKey !== overrideMode) {
                segmentWarning =
                  overrideMode === "TRANSIT"
                    ? `No transit route for this segment, using ${getRouteModeMeta(actualLegModeKey).shortLabel}.`
                    : `${getRouteModeMeta(overrideMode).shortLabel} unavailable, using ${getRouteModeMeta(actualLegModeKey).shortLabel}.`;
              }
              dayInfo.segmentsByPoiKey[segmentKey] = {
                modeKey: actualLegModeKey,
                distanceMeters: Number(leg?.distance?.value) || 0,
                durationSeconds: Number(leg?.duration?.value) || 0,
                overrideMode,
                warning: segmentWarning || undefined,
                displayOverrideMode:
                  segmentWarning && overrideMode !== "AUTO" && actualLegModeKey !== overrideMode
                    ? actualLegModeKey
                    : overrideMode,
              };

              if (!dayInfo.modeKey) {
                dayInfo.modeKey = autoRoute.modeKey;
                dayInfo.modeLabel = autoRoute.modeMeta.label;
              }
            } catch (legError) {
              routeWarnings.push(
                `Day ${group.dayNumber} #${index + 1}->#${index + 2}: ${legError instanceof Error ? legError.message : "Route unavailable"}`
              );
            }
          }

          if (Object.keys(dayInfo.segmentsByPoiKey).length > 0) {
            nextRouteDayInfo[String(group.dayId)] = dayInfo;
          }
        }

        if (!cancelled) {
          setRouteDayInfo(nextRouteDayInfo);
          setRouteError(routeWarnings.join(" | "));
        }
      } catch (err) {
        if (!cancelled) {
          setRouteError(err instanceof Error ? err.message : "Failed to draw route");
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeGroups, mapReadyVersion, segmentModeOverrides]);
  const handleDeleteTrip = async () => {
    if (!trip?.trip_id || deletingTrip) return;

    const confirmed = window.confirm(`Delete trip "${trip.title || "Untitled trip"}"?`);
    if (!confirmed) return;

    try {
      setDeletingTrip(true);
      setDeleteError("");
      await deleteTrip(trip.trip_id);
      navigate("/trips");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setDeleteError(err.response?.data?.error || "Failed to delete trip");
      } else if (err instanceof Error) {
        setDeleteError(err.message || "Failed to delete trip");
      } else {
        setDeleteError("Failed to delete trip");
      }
    } finally {
      setDeletingTrip(false);
    }
  };

  const openNoteModal = (poi) => {
    if (!poi?.day_poi_id) return;
    setEditingDayPoiId(poi.day_poi_id);
    setNoteDraft(poi.note ?? "");
    setNoteError("");
    setNoteModalOpen(true);
  };

  const closeNoteModal = () => {
    if (savingNote) return;
    setNoteModalOpen(false);
    setEditingDayPoiId(null);
    setNoteDraft("");
    setNoteError("");
  };

  const saveNote = async () => {
    if (!editingDayPoiId) return;
    try {
      setSavingNote(true);
      setNoteError("");
      const nextNote = noteDraft.trim() === "" ? null : noteDraft.trim();
      await patchDayPoiNote(editingDayPoiId, nextNote);

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: (prev.days || []).map((day) => ({
            ...day,
            pois: (day.pois || []).map((poi) =>
              poi.day_poi_id === editingDayPoiId ? { ...poi, note: nextNote } : poi
            ),
          })),
        };
      });

      closeNoteModal();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setNoteError(err.response?.data?.error || "Failed to save note");
      } else {
        setNoteError("Failed to save note");
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleStartEditTripNote = () => {
    setTripNoteDraft(String(trip?.note || ""));
    setTripNoteError("");
    setEditingTripNote(true);
  };

  const handleCancelEditTripNote = () => {
    if (savingTripNote) return;
    setTripNoteDraft(String(trip?.note || ""));
    setTripNoteError("");
    setEditingTripNote(false);
  };

  const handleSaveTripNote = async () => {
    if (!trip?.trip_id || savingTripNote) return;
    try {
      setSavingTripNote(true);
      setTripNoteError("");
      const nextNote = tripNoteDraft.trim() ? tripNoteDraft.trim() : null;
      await patchTrip(trip.trip_id, { note: nextNote });

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          trip: {
            ...prev.trip,
            note: nextNote,
          },
        };
      });
      setEditingTripNote(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setTripNoteError(err.response?.data?.error || "Failed to save trip note");
      } else if (err instanceof Error) {
        setTripNoteError(err.message || "Failed to save trip note");
      } else {
        setTripNoteError("Failed to save trip note");
      }
    } finally {
      setSavingTripNote(false);
    }
  };

  const openTripDatesModal = () => {
    setTripDateDraft({
      start_date: String(trip?.start_date || ""),
      end_date: String(trip?.end_date || ""),
    });
    setTripDatesError("");
    setTripDatesModalOpen(true);
    setTripMenuOpen(false);
  };

  const closeTripDatesModal = () => {
    if (savingTripDates) return;
    setTripDatesModalOpen(false);
    setTripDatesError("");
  };

  const saveTripDates = async () => {
    if (!trip?.trip_id || savingTripDates) return;
    const startDate = String(tripDateDraft.start_date || "").trim();
    const endDate = String(tripDateDraft.end_date || "").trim();
    if (!startDate || !endDate) {
      setTripDatesError("Start date and end date are required");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setTripDatesError("End date must be on or after start date");
      return;
    }

    try {
      setSavingTripDates(true);
      setTripDatesError("");
      await patchTrip(trip.trip_id, { start_date: startDate, end_date: endDate });
      await fetchDetail({ showPageLoading: false });
      setTripDatesModalOpen(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setTripDatesError(err.response?.data?.error || "Failed to save trip dates");
      } else if (err instanceof Error) {
        setTripDatesError(err.message || "Failed to save trip dates");
      } else {
        setTripDatesError("Failed to save trip dates");
      }
    } finally {
      setSavingTripDates(false);
    }
  };

  const openAddPoiModal = async (day) => {
    if (!day) return;

    let targetDay = day;
    if (String(day.day_id).startsWith("virtual-")) {
      if (!trip?.trip_id) {
        setRouteEditError("Trip is not ready yet.");
        return;
      }
      try {
        setRouteEditBusy(true);
        setRouteEditError("");
        const created = await createTripDay(trip.trip_id, Number(day.day_number));
        targetDay = {
          ...day,
          day_id: created?.day_id,
        };
        await fetchDetail({ showPageLoading: false });
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setRouteEditError(err.response?.data?.error || "Failed to create day for this trip");
        } else {
          setRouteEditError("Failed to create day for this trip");
        }
        return;
      } finally {
        setRouteEditBusy(false);
      }
    }

    setAddPoiTargetDay(targetDay);
    setPoiSearchQuery("");
    setPoiSearchResults([]);
    setPoiSearchError("");
    setAddPoiModalOpen(true);
  };

  const closeAddPoiModal = () => {
    if (addingPoi) return;
    setAddPoiModalOpen(false);
    setPoiSearchError("");
    setPoiSearchResults([]);
    setPoiSearchQuery("");
  };

  const searchPoisForAdd = async () => {
    const query = poiSearchQuery.trim();
    if (!query) {
      setPoiSearchResults([]);
      setPoiSearchError("Enter a place name or keyword");
      return;
    }
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) {
      setPoiSearchError("Places search is not ready yet. Please try again.");
      return;
    }

    try {
      setPoiSearchLoading(true);
      setPoiSearchError("");
      const locationHint = mapRef.current?.getCenter?.()?.toJSON?.() || DEFAULT_MAP_CENTER;
      const results = await textSearchPlaces(
        service,
        {
          query: `${query} ${trip?.destination || ""}`.trim(),
          location: locationHint,
          radius: 30000,
        },
        statusEnum
      );

      const normalized = results
        .slice(0, 8)
        .map((place) => ({
          placeId: place.place_id || null,
          name: place.name || "Unnamed Place",
          address: place.formatted_address || place.vicinity || "",
          lat: place.geometry?.location?.lat?.() ?? null,
          lng: place.geometry?.location?.lng?.() ?? null,
          type: Array.isArray(place.types) && place.types.includes("restaurant")
            ? "food"
            : Array.isArray(place.types) && place.types.includes("shopping_mall")
              ? "shopping"
              : Array.isArray(place.types) && place.types.includes("museum")
                ? "museum"
                : Array.isArray(place.types) && place.types.includes("tourist_attraction")
                  ? "attraction"
                  : "other",
        }))
        .filter((item) => item.name && item.address);

      setPoiSearchResults(normalized);
      if (!normalized.length) {
        setPoiSearchError("No places found");
      }
    } catch (err) {
      setPoiSearchError(err instanceof Error ? err.message : "Failed to search places");
      setPoiSearchResults([]);
    } finally {
      setPoiSearchLoading(false);
    }
  };

  const handleAddPoiToDay = async (place) => {
    if (!addPoiTargetDay?.day_id || addingPoi) return;
    if (String(addPoiTargetDay.day_id).startsWith("virtual-")) return;

    try {
      setAddingPoi(true);
      setPoiSearchError("");
      setRouteEditError("");
      await addDayPoi(addPoiTargetDay.day_id, {
        name: place.name,
        address: place.address,
        google_place_id: place.placeId || null,
        type: place.type || "other",
        description: "",
        lat: place.lat,
        lng: place.lng,
        note: null,
        start_time: null,
        duration_min: null,
      });
      closeAddPoiModal();
      await fetchDetail({ showPageLoading: false });
      setActiveTab(String(addPoiTargetDay.day_id));
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.error;
        if (status === 404) {
          setPoiSearchError(message || "Add POI endpoint not found. Please restart the server.");
        } else {
          setPoiSearchError(message || "Failed to add POI");
        }
      } else {
        setPoiSearchError("Failed to add POI");
      }
    } finally {
      setAddingPoi(false);
    }
  };

  const movePoiByDrag = async ({ day, fromDayPoiId, toDayPoiId }) => {
    if (!day?.day_id || routeEditBusy) return;
    const realDayId = day.day_id;
    if (String(realDayId).startsWith("virtual-")) return;

    const currentPois = [...(day.pois || [])];
    const fromIndex = currentPois.findIndex((poi) => poi.day_poi_id === fromDayPoiId);
    const toIndex = currentPois.findIndex((poi) => poi.day_poi_id === toDayPoiId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const reordered = [...currentPois];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: (prev.days || []).map((d) =>
          String(d.day_id) !== String(realDayId)
            ? d
            : {
                ...d,
                pois: reordered.map((poi, idx) => ({ ...poi, visit_order: idx + 1 })),
              }
        ),
      };
    });

    try {
      setRouteEditBusy(true);
      setRouteEditError("");
      await reorderDayPois(realDayId, reordered.map((poi) => poi.day_poi_id));
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.error;
        if (status === 404) {
          setRouteEditError(message || "Reorder endpoint not found. Please restart the server.");
        } else {
          setRouteEditError(message || "Failed to reorder route");
        }
      } else {
        setRouteEditError("Failed to reorder route");
      }
      await fetchDetail({ showPageLoading: false });
    } finally {
      setRouteEditBusy(false);
      setDraggingDayPoi(null);
    }
  };

  const handleDeletePoiFromDay = async (poi) => {
    if (!poi?.day_poi_id || routeEditBusy) return;
    if (!window.confirm(`Remove "${poi.name || "this POI"}" from this trip day?`)) return;

    try {
      setRouteEditBusy(true);
      setRouteEditError("");
      await deleteDayPoi(poi.day_poi_id);
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setRouteEditError(err.response?.data?.error || "Failed to delete POI");
      } else {
        setRouteEditError("Failed to delete POI");
      }
    } finally {
      setRouteEditBusy(false);
      setDraggingDayPoi(null);
    }
  };

  const handleDeleteTripDay = async (day) => {
    if (!day?.day_id || routeEditBusy) return;
    if (String(day.day_id).startsWith("virtual-")) return;

    const dayLabel = `Day ${day.day_number}`;
    const confirmed = window.confirm(`${dayLabel} will be deleted. Later days will shift forward by one day. Continue?`);
    if (!confirmed) return;

    try {
      setRouteEditBusy(true);
      setRouteEditError("");
      setRouteError("");
      setDraggingDayPoi(null);

      await deleteTripDayApi(day.day_id);

      setActiveTab("overview");
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setRouteEditError(err.response?.data?.error || "Failed to delete day");
      } else {
        setRouteEditError("Failed to delete day");
      }
    } finally {
      setRouteEditBusy(false);
    }
  };

  const handleSegmentModeOverrideChange = async ({ dayId, poi, modeKey }) => {
    if (!poi?.day_poi_id) return;
    const overrideKey = `${String(dayId)}|dp:${poi.day_poi_id}`;
    const prevValue = segmentModeOverrides[overrideKey];

    setSegmentModeOverrides((prev) => ({
      ...prev,
      [overrideKey]: modeKey,
    }));

    try {
      await patchDayPoiTransportMode(poi.day_poi_id, modeKey);
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: (prev.days || []).map((day) => ({
            ...day,
            pois: (day.pois || []).map((item) =>
              item.day_poi_id === poi.day_poi_id
                ? { ...item, transport_mode_override: modeKey }
                : item
            ),
          })),
        };
      });
    } catch (err) {
      setSegmentModeOverrides((prev) => {
        const next = { ...prev };
        if (prevValue) next[overrideKey] = prevValue;
        else delete next[overrideKey];
        return next;
      });
      if (axios.isAxiosError(err)) {
        setRouteError(err.response?.data?.error || "Failed to save route mode");
      } else {
        setRouteError("Failed to save route mode");
      }
    }
  };

  if (loading) return <div className="muted">Loading trip detail...</div>;

  if (error) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="h1" style={{ marginBottom: 0 }}>Trip Detail</div>
        <div className="muted">{error}</div>
        <button className="secondaryBtn" type="button" onClick={() => navigate("/trips")}>
          Back to Trips
        </button>
      </div>
    );
  }

  if (!trip) return <div className="muted">No trip data</div>;
  const isOverviewTab = activeTab === "overview";

  return (
    <>
      <div style={pageShellStyle}>
        <section style={heroMapPanelStyle}>
          <div style={mapTopBarStyle}>
            <button className="secondaryBtn" type="button" onClick={() => navigate("/trips")}>
              Back
            </button>
            <div />
          </div>

          <div style={mapShellStyle}>
            <div ref={mapContainerRef} style={heroMapCanvasStyle} />
            {mapLoading ? <div style={mapOverlayStyle}>Loading map...</div> : null}
            {mapError ? <div style={mapOverlayStyle}>{mapError}</div> : null}
            {!mapLoading && !mapError && mapPoints.length === 0 ? (
              <div style={mapOverlayStyle}>No POIs with valid coordinates for this tab</div>
            ) : null}
            {!mapLoading && !mapError ? (
              <div style={recommendedToggleWrapStyle}>
                <button
                  type="button"
                  className="secondaryBtn"
                  style={{
                    ...recommendedToggleBtnStyle,
                    ...(showRecommendedPois ? recommendedToggleBtnActiveStyle : null),
                  }}
                  onClick={() => setShowRecommendedPois((prev) => !prev)}
                >
                  <span aria-hidden="true">{"\u{1F35C} \u{1F3DB}\uFE0F"}</span>
                  <span>{showRecommendedPois ? "Hide Recommended" : "Show Recommended"}</span>
                </button>
                {showRecommendedPois && recommendedPoisError ? (
                  <div style={recommendedToggleHintStyle}>
                    {recommendedPoisError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

        </section>

        <section ref={drawerRef} style={drawerStyle}>
          <div style={drawerHandleStyle} />
          {deleteError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{deleteError}</div> : null}
          {routeEditError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{routeEditError}</div> : null}

          <div className="row" style={{ marginTop: 4, alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="h1" style={{ marginBottom: 4 }}>
                {withUpdatedDayCountInTitle(trip.title, tripDayCount) || "Trip Detail"}
              </div>
              <div className="muted">{trip.destination || "-"}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {formatDateRange(trip.start_date, trip.end_date)}
                {` | ${tripDayCount || sortedDays.length} days | ${totalPois} POIs`}
              </div>
              {isSmartPlanGenerating ? (
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(14,165,233,0.2)",
                    background: "rgba(14,165,233,0.06)",
                    color: "#0369a1",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "#0ea5e9",
                      boxShadow: "0 0 0 6px rgba(14,165,233,0.12)",
                    }}
                  />
                  {smartPlanStatusMessage || "Smart Plan generating... itinerary and routes will appear progressively."}
                </div>
              ) : null}
              {smartPlanErrorMessage ? (
                <div style={{ ...errorTextStyle, marginTop: 8 }}>
                  Smart Plan generation failed: {smartPlanErrorMessage}
                </div>
              ) : null}
            </div>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                className="secondaryBtn"
                onClick={() => setTripMenuOpen((value) => !value)}
                aria-label="Trip actions"
                style={tripMenuButtonStyle}
              >
                �?
              </button>
              {tripMenuOpen ? (
                <div style={tripMenuCardStyle}>
                  <button type="button" style={tripMenuItemStyle} onClick={openTripDatesModal}>
                    Edit dates
                  </button>
                  <button
                    type="button"
                    style={{ ...tripMenuItemStyle, ...tripMenuDangerItemStyle }}
                    onClick={() => {
                      setTripMenuOpen(false);
                      handleDeleteTrip();
                    }}
                    disabled={deletingTrip}
                  >
                    {deletingTrip ? "Deleting..." : "Delete trip"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start", marginTop: 12 }}>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setActiveTab("overview")}
              style={activeTab === "overview" ? activeTabStyle : undefined}
            >
              Overview
            </button>
            {sortedDays.map((day) => (
              <button
                key={day.day_id}
                type="button"
                className="secondaryBtn"
                onClick={() => setActiveTab(String(day.day_id))}
                style={String(activeTab) === String(day.day_id) ? activeTabStyle : undefined}
              >
                Day {day.day_number}
              </button>
            ))}
          </div>

          {routeLoading ? <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Updating route...</div> : null}

          <div className="stack" style={{ gap: 14, marginTop: 14 }}>
            {visibleDays.length ? (
              visibleDays.map((day) => (
                <section key={day.day_id} style={sectionCardStyle}>
                  <div className="row" style={{ marginBottom: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>Day {day.day_number}</div>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <div className="muted">{formatDayFromTripStart(trip.start_date, day.day_number) || "-"}</div>
                      {!isOverviewTab && routeEditMode ? (
                        <>
                          <button
                            type="button"
                            className="secondaryBtn"
                            onClick={() => openAddPoiModal(day)}
                            disabled={routeEditBusy || addingPoi}
                            style={dayHeaderActionBtnStyle}
                          >
                            + Add POI
                          </button>
                          {!String(day.day_id).startsWith("virtual-") ? (
                            <button
                              type="button"
                              className="secondaryBtn"
                              onClick={() => void handleDeleteTripDay(day)}
                              disabled={routeEditBusy || addingPoi}
                              style={{
                                ...dayHeaderActionBtnStyle,
                                color: "#b91c1c",
                                borderColor: "rgba(220,38,38,0.22)",
                                background: "rgba(254,242,242,0.72)",
                              }}
                            >
                              Delete Day
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {!day.pois?.length ? (
                    <div className="muted">No POIs yet</div>
                  ) : (
                    isOverviewTab ? (
                    <div style={overviewRouteTextStyle}>
                      {day.pois
                        .map((poi) => String(poi?.name || "").trim())
                        .filter(Boolean)
                        .join(" -> ")}
                    </div>
                    ) : (
                    <div className="stack" style={{ gap: 10 }}>
                      {day.pois.map((poi) => {
                        const dayRoute = routeDayInfo[String(day.day_id)] || null;
                        const incomingRouteSegment = getPoiIncomingRouteSegment(dayRoute, poi);
                        const incomingSegmentKey = poi.day_poi_id != null ? `dp:${poi.day_poi_id}` : `vo:${poi.visit_order}`;
                        const incomingOverrideKey = `${String(day.day_id)}|${incomingSegmentKey}`;
                        const poiThumbUrl = poi.image_url || poiImageUrls[getPoiImageCacheKey(poi)] || "";
                        const isSelectedPoi =
                          poiDetailPanelOpen &&
                          (selectedPoiDetailTarget?.dayPoiId != null
                            ? Number(selectedPoiDetailTarget.dayPoiId) === Number(poi.day_poi_id)
                            : Number(selectedPoiDetailTarget?.poi?.poi_id) === Number(poi.poi_id));

                        return (
                        <div
                          key={poi.day_poi_id ?? `${day.day_id}-${poi.visit_order}-${poi.poi_id}`}
                          style={{
                            ...poiCardStyle,
                            ...(routeEditMode ? poiCardEditableStyle : null),
                            ...(!routeEditMode ? poiCardClickableStyle : null),
                            ...(isSelectedPoi ? poiCardSelectedStyle : null),
                            ...(draggingDayPoi?.dayPoiId === poi.day_poi_id ? poiCardDraggingStyle : null),
                          }}
                          onClick={() => {
                            if (routeEditMode) return;
                            openPoiDetail({
                              dayId: day.day_id,
                              dayPoiId: poi.day_poi_id ?? null,
                              poiId: poi.poi_id ?? null,
                              poi: {
                                ...poi,
                                image_url: poiThumbUrl || poi.image_url || null,
                              },
                            });
                          }}
                          draggable={Boolean(routeEditMode && poi.day_poi_id && !routeEditBusy)}
                          onDragStart={(e) => {
                            if (!routeEditMode || !poi.day_poi_id) return;
                            try {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", String(poi.day_poi_id));
                            } catch {}
                            setDraggingDayPoi({ dayId: String(day.day_id), dayPoiId: poi.day_poi_id });
                          }}
                          onDragOver={(e) => {
                            if (!routeEditMode || !draggingDayPoi?.dayPoiId || routeEditBusy) return;
                            if (String(draggingDayPoi.dayId) !== String(day.day_id)) return;
                            if (draggingDayPoi.dayPoiId === poi.day_poi_id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDragEnter={(e) => {
                            if (!routeEditMode || !draggingDayPoi?.dayPoiId || routeEditBusy) return;
                            if (String(draggingDayPoi.dayId) !== String(day.day_id)) return;
                            if (draggingDayPoi.dayPoiId === poi.day_poi_id) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!routeEditMode || !draggingDayPoi?.dayPoiId || !poi.day_poi_id) return;
                            if (String(draggingDayPoi.dayId) !== String(day.day_id)) return;
                            void movePoiByDrag({
                              day,
                              fromDayPoiId: draggingDayPoi.dayPoiId,
                              toDayPoiId: poi.day_poi_id,
                            });
                          }}
                          onDragEnd={() => setDraggingDayPoi(null)}
                        >
                          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                            <div style={poiThumbWrapStyle} aria-hidden="true">
                              {poiThumbUrl ? (
                                <img
                                  src={poiThumbUrl}
                                  alt=""
                                  style={poiThumbImgStyle}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div style={poiThumbPlaceholderStyle}>
                                  {String(poi.name || "?").trim().slice(0, 1).toUpperCase() || "?"}
                                </div>
                              )}
                            </div>
                            {routeEditMode ? (
                              <div style={dragHandleStyle} aria-hidden="true" title="Drag to reorder">
                                ⋮⋮
                              </div>
                            ) : null}
                            <div style={{ minWidth: 28, fontWeight: 700, color: "#0f172a" }}>
                              #{poi.visit_order ?? "-"}
                            </div>

                            <div style={{ flex: 1, position: "relative", paddingRight: routeEditMode ? 92 : 0 }}>
                              {routeEditMode && poi.day_poi_id ? (
                                <button
                                  type="button"
                                  className="secondaryBtn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeletePoiFromDay(poi);
                                  }}
                                  disabled={routeEditBusy}
                                  style={deletePoiBtnStyle}
                                >
                                  Delete
                                </button>
                              ) : null}
                              <div style={{ fontWeight: 700 }}>{poi.name || "Unnamed POI"}</div>
                              <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                                {poi.type || "other"}
                                {poi.address ? ` | ${poi.address}` : ""}
                              </div>

                              {(poi.start_time || poi.duration_min) ? (
                                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                                  {poi.start_time || "--:--"}
                                  {" | "}
                                  {poi.duration_min ? `${poi.duration_min} min` : "duration not set"}
                                </div>
                              ) : null}

                              {poi.day_poi_id ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openNoteModal(poi);
                                  }}
                                  style={noteButtonStyle(Boolean(poi.note))}
                                  aria-label="Edit note"
                                >
                                  {poi.note ? poi.note : "备注"}
                                </button>
                              ) : null}

                              <PoiRouteSegmentMeta
                                segment={incomingRouteSegment}
                                overrideMode={segmentModeOverrides[incomingOverrideKey] || "AUTO"}
                                onChangeMode={
                                  incomingRouteSegment
                                    ? (modeKey) =>
                                        void handleSegmentModeOverrideChange({
                                          dayId: day.day_id,
                                          poi,
                                          modeKey,
                                        })
                                    : undefined
                                }
                              />
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    )
                  )}
                </section>
              ))
            ) : (
              <div style={sectionCardStyle}>
                <div className="muted">No itinerary days yet</div>
              </div>
            )}

            <div style={tripInfoSplitRowStyle}>
              <section style={{ ...sectionCardStyle, ...tripInfoHalfCardStyle }}>
                <div className="row" style={{ marginBottom: 8, alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Trip Note</div>
                  {editingTripNote ? (
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="secondaryBtn"
                        onClick={handleCancelEditTripNote}
                        disabled={savingTripNote}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primaryBtn"
                        onClick={handleSaveTripNote}
                        disabled={savingTripNote}
                      >
                        {savingTripNote ? "Saving..." : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="secondaryBtn" onClick={handleStartEditTripNote}>
                      Edit
                    </button>
                  )}
                </div>
                {tripNoteError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{tripNoteError}</div> : null}
                {editingTripNote ? (
                  <textarea
                    value={tripNoteDraft}
                    onChange={(e) => setTripNoteDraft(e.target.value)}
                    rows={4}
                    style={textareaStyle}
                    disabled={savingTripNote}
                    placeholder="Add a note for this trip..."
                  />
                ) : (
                  <div style={tripNoteTextStyle}>
                    {String(trip.note || "").trim() || "No trip note yet"}
                  </div>
                )}
              </section>

              <section style={{ ...sectionCardStyle, ...tripInfoHalfCardStyle }}>
                <div className="row" style={{ marginBottom: 8, alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>Trip Weather</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {trip?.start_date && trip?.end_date ? `${trip.start_date} to ${trip.end_date}` : ""}
                  </div>
                </div>

                {tripWeatherLoading ? <div className="muted">Loading weather...</div> : null}
                {!tripWeatherLoading && tripWeatherError ? (
                  <div style={{ ...errorTextStyle, marginBottom: 8 }}>{tripWeatherError}</div>
                ) : null}
                {!tripWeatherLoading && !tripWeatherError && !tripWeatherDays.length ? (
                  <div className="muted">No weather data</div>
                ) : null}
                {!tripWeatherLoading && tripWeatherDays.length ? (
                  <div style={tripWeatherListStyle}>
                    {tripWeatherDays.map((item) => (
                      <div key={item.date} style={tripWeatherItemStyle}>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>
                          {formatTripWeatherDate(item.date)}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {getWeatherCodeLabel(item.weatherCode)}
                        </div>
                        <div style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
                          {Number.isFinite(item.min) ? Math.round(item.min) : "-"}° ~{" "}
                          {Number.isFinite(item.max) ? Math.round(item.max) : "-"}°
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </section>
      </div>

      <div style={{ ...floatingRouteCtaWrapStyle, right: floatingRouteCtaRight }}>
        <button
          type="button"
          className="secondaryBtn"
          style={floatingAiCtaStyle}
          onClick={() => navigate(`/trips/${tripId}/ai-chat`)}
          aria-label="Open AI trip chat"
        >
          <AiChatIcon size={20} />
        </button>
        <button
          type="button"
          className="primaryBtn"
          style={floatingRouteCtaStyle}
          onClick={() => {
            setRouteEditError("");
            setDraggingDayPoi(null);
            setRouteEditMode((value) => {
              const next = !value;
              if (next && activeTab === "overview") {
                const firstRealDay = sortedDays.find((day) => !String(day.day_id).startsWith("virtual-"));
                if (firstRealDay) setActiveTab(String(firstRealDay.day_id));
              }
              return next;
            });
          }}
          disabled={routeEditBusy}
        >
          {routeEditBusy ? "Saving..." : routeEditMode ? "Done Editing" : "Edit Route"}
        </button>
      </div>

      <PoiDetailPanel
        key={poiDetailRequestKey || String(selectedPoiDetailTarget?.poi?.poi_id || "poi-detail")}
        open={poiDetailPanelOpen}
        isDesktop={isDesktopPoiDetailLayout}
        target={selectedPoiDetailTarget}
        loading={poiDetailLoading}
        error={poiDetailError}
        details={poiDetailData}
        introExpanded={poiDetailIntroExpanded}
        onToggleIntro={() => setPoiDetailIntroExpanded((value) => !value)}
        onClose={closePoiDetailPanel}
        canFavorite={Boolean(currentUser?.user_id)}
        isFavorite={(() => {
          const selectedPoiId = Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id);
          if (Number.isInteger(selectedPoiId) && selectedPoiId > 0) {
            return favoritePoiIds.includes(selectedPoiId);
          }
          const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
          const mappedPoiId = Number(favoritePoiIdByPlaceIdRef.current.get(placeId));
          return Number.isInteger(mappedPoiId) && favoritePoiIds.includes(mappedPoiId);
        })()}
        favoriteBusy={Boolean(
          favoriteBusyPoiId != null &&
            (favoriteBusyPoiId === -1 ||
              favoriteBusyPoiId === Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id))
        )}
        onToggleFavorite={() => void handleToggleFavoriteFromPoiDetail()}
      />

      {noteModalOpen ? (
        <div style={modalOverlayStyle} onClick={closeNoteModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 6, fontSize: 22 }}>Edit Note</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Leave empty to clear note.
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="输入 POI 备注"
              rows={5}
              style={textareaStyle}
              disabled={savingNote}
            />
            {noteError ? <div style={errorTextStyle}>{noteError}</div> : null}
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
              <button className="secondaryBtn" type="button" onClick={closeNoteModal} disabled={savingNote}>
                Cancel
              </button>
              <button className="primaryBtn" type="button" onClick={saveNote} disabled={savingNote}>
                {savingNote ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tripDatesModalOpen ? (
        <div style={modalOverlayStyle} onClick={closeTripDatesModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 6, fontSize: 22 }}>Edit Trip Dates</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Update trip dates. Day tabs and overview will follow the new range after save.
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <label style={labelStyle}>
                <span>Start date</span>
                <input
                  type="date"
                  value={tripDateDraft.start_date}
                  onChange={(e) => setTripDateDraft((prev) => ({ ...prev, start_date: e.target.value }))}
                  style={inputStyle}
                  disabled={savingTripDates}
                />
              </label>
              <label style={labelStyle}>
                <span>End date</span>
                <input
                  type="date"
                  value={tripDateDraft.end_date}
                  onChange={(e) => setTripDateDraft((prev) => ({ ...prev, end_date: e.target.value }))}
                  style={inputStyle}
                  disabled={savingTripDates}
                />
              </label>
            </div>
            {tripDatesError ? <div style={{ ...errorTextStyle, marginTop: 10 }}>{tripDatesError}</div> : null}
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
              <button className="secondaryBtn" type="button" onClick={closeTripDatesModal} disabled={savingTripDates}>
                Cancel
              </button>
              <button className="primaryBtn" type="button" onClick={saveTripDates} disabled={savingTripDates}>
                {savingTripDates ? "Saving..." : "Save dates"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addPoiModalOpen ? (
        <div style={modalOverlayStyle} onClick={closeAddPoiModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 6, fontSize: 22 }}>
              Add POI to Day {addPoiTargetDay?.day_number ?? "-"}
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Search places and add one to this day. New POIs start with an empty note.
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={poiSearchQuery}
                onChange={(e) => setPoiSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchPoisForAdd();
                  }
                }}
                placeholder="Search restaurants, museums, attractions..."
                style={{ ...inputStyle, flex: 1 }}
                disabled={poiSearchLoading || addingPoi}
              />
              <button
                type="button"
                className="primaryBtn"
                onClick={() => void searchPoisForAdd()}
                disabled={poiSearchLoading || addingPoi}
              >
                {poiSearchLoading ? "Searching..." : "Search"}
              </button>
            </div>

            {poiSearchError ? <div style={{ ...errorTextStyle, marginTop: 10 }}>{poiSearchError}</div> : null}

            <div className="stack" style={{ gap: 8, marginTop: 12, maxHeight: 320, overflowY: "auto" }}>
              {poiSearchResults.map((place) => (
                <div key={`${place.placeId || place.name}-${place.address}`} style={poiSearchResultCardStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{place.name}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {place.type || "other"}
                      {place.address ? ` | ${place.address}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondaryBtn"
                    onClick={() => void handleAddPoiToDay(place)}
                    disabled={addingPoi}
                    style={poiSearchAddBtnStyle}
                  >
                    {addingPoi ? "Adding..." : "Add"}
                  </button>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
              <button className="secondaryBtn" type="button" onClick={closeAddPoiModal} disabled={addingPoi}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const sectionCardStyle = {
  background: "rgba(255,255,255,0.78)",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
};

const poiCardStyle = {
  background: "rgba(255,255,255,0.95)",
  borderRadius: 14,
  padding: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(148,163,184,0.15)",
  outline: "none",
};

const poiCardEditableStyle = {
  cursor: "grab",
  borderColor: "rgba(14,165,233,0.22)",
};

const poiCardClickableStyle = {
  cursor: "pointer",
};

const poiCardSelectedStyle = {
  borderColor: "rgba(14,165,233,0.45)",
  boxShadow: "0 12px 28px rgba(14,165,233,0.14)",
};

const poiCardDraggingStyle = {
  opacity: 0.62,
  cursor: "grabbing",
};

const poiThumbWrapStyle = {
  width: 68,
  minWidth: 68,
  height: 68,
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(248,250,252,0.95)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
};

const poiThumbImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const poiThumbPlaceholderStyle = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  fontSize: 22,
  color: "#475569",
  background: "linear-gradient(135deg, rgba(14,165,233,0.10), rgba(16,185,129,0.10))",
};

const dragHandleStyle = {
  minWidth: 18,
  color: "#94a3b8",
  lineHeight: 1,
  fontSize: 18,
  userSelect: "none",
  paddingTop: 2,
};

const overviewRouteTextStyle = {
  fontSize: 15,
  lineHeight: 1.5,
  color: "#0f172a",
  background: "rgba(255,255,255,0.9)",
  border: "1px dashed rgba(148,163,184,0.28)",
  borderRadius: 14,
  padding: "12px 14px",
  wordBreak: "break-word",
};

const tripNoteTextStyle = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#334155",
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 12,
  padding: "12px 14px",
  minHeight: 72,
  whiteSpace: "pre-wrap",
};

const tripInfoSplitRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "stretch",
};

const tripInfoHalfCardStyle = {
  flex: "1 1 320px",
  minWidth: 0,
};

const tripWeatherListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: 190,
  overflowY: "auto",
};

const tripWeatherItemStyle = {
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.95)",
  borderRadius: 12,
  padding: "10px 12px",
  minHeight: 72,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
};

const tripMenuButtonStyle = {
  minWidth: 40,
  width: 40,
  height: 40,
  borderRadius: 999,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  lineHeight: 1,
  fontFamily: "inherit",
};

const tripMenuCardStyle = {
  position: "absolute",
  top: 46,
  right: 0,
  minWidth: 160,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14,
  boxShadow: "0 16px 30px rgba(15,23,42,0.12)",
  padding: 6,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  zIndex: 20,
};

const tripMenuItemStyle = {
  border: "none",
  background: "transparent",
  textAlign: "left",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  fontWeight: 600,
  color: "#0f172a",
  cursor: "pointer",
};

const tripMenuDangerItemStyle = {
  color: "#b91c1c",
  background: "rgba(254,242,242,0.7)",
};

const dayHeaderActionBtnStyle = {
  minHeight: 30,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 999,
  fontWeight: 700,
};

const floatingRouteCtaWrapStyle = {
  position: "fixed",
  right: "max(16px, calc((100vw - 560px) / 2 + 16px))",
  bottom: 18,
  zIndex: 40,
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  pointerEvents: "none",
};

const floatingAiCtaStyle = {
  pointerEvents: "auto",
  width: 52,
  minWidth: 52,
  height: 52,
  minHeight: 52,
  boxSizing: "border-box",
  padding: 0,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background: "linear-gradient(135deg, #8b5cf6, #22c55e)",
  boxShadow: "0 14px 28px rgba(91,33,182,0.22)",
  border: "1px solid rgba(255,255,255,0.24)",
};

const floatingRouteCtaStyle = {
  pointerEvents: "auto",
  borderRadius: 999,
  height: 52,
  minHeight: 52,
  boxSizing: "border-box",
  padding: "0 22px",
  fontSize: 16,
  fontWeight: 700,
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 16px 30px rgba(15,23,42,0.22)",
  border: "1px solid rgba(15,23,42,0.08)",
};

const poiSearchResultCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

const poiSearchAddBtnStyle = {
  minHeight: 36,
  padding: "0 14px",
  borderRadius: 999,
  fontWeight: 700,
  fontFamily: "inherit",
};

const deletePoiBtnStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "inherit",
  color: "#b91c1c",
  borderColor: "rgba(220,38,38,0.22)",
  background: "rgba(254,242,242,0.72)",
};

const noteButtonStyle = (hasNote) => ({
  marginTop: 10,
  width: "100%",
  textAlign: "left",
  border: "1px dashed rgba(148,163,184,0.45)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(248,250,252,0.9)",
  color: hasNote ? "#0f172a" : "#94a3b8",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1.35,
  outline: "none",
});

const poiRouteMetaStyle = {
  marginTop: 10,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(248,250,252,0.95)",
};

const poiRouteModeBadgeStyle = (color) => ({
  width: 20,
  height: 20,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "#fff",
  background: color || "#64748b",
  flexShrink: 0,
});

const segmentModeSwitchWrapStyle = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const segmentModeChipStyle = {
  width: 26,
  height: 26,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  padding: 0,
};

const segmentModeIconSlotStyle = {
  width: 14,
  height: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
  transform: "translateY(-0.5px)",
};

const segmentModeChipActiveStyle = {
  borderColor: "#0f172a",
  background: "rgba(15,23,42,0.06)",
};

const segmentRouteHintStyle = {
  width: "100%",
  marginTop: 6,
  fontSize: 12,
  color: "#7c2d12",
};

const segmentRouteErrorStyle = {
  width: "100%",
  marginTop: 6,
  fontSize: 12,
  color: "#b91c1c",
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const modalCardStyle = {
  width: "min(560px, 100%)",
  background: "#fff",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
  border: "1px solid rgba(148,163,184,0.22)",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "#334155",
};

const inputStyle = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
};

const textareaStyle = {
  ...inputStyle,
  width: "100%",
  resize: "vertical",
  minHeight: 100,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const errorTextStyle = {
  color: "#dc2626",
  fontSize: 13,
};

const activeTabStyle = {
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
};

const deleteTripButtonStyle = {
  width: 38,
  minWidth: 38,
  height: 38,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontSize: 18,
  borderColor: "rgba(220,38,38,0.28)",
  color: "#b91c1c",
  background: "rgba(255,255,255,0.95)",
};

const pageShellStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 6,
};

const heroMapPanelStyle = {
  position: "relative",
  borderRadius: 22,
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0.35))",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 16px 36px rgba(15,23,42,0.12)",
};

const mapTopBarStyle = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const heroMapCanvasStyle = {
  width: "100%",
  height: 320,
};

const mapFloatingInfoStyle = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 2,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 16,
  padding: 10,
  boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const legendWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

const legendItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(148,163,184,0.18)",
  fontSize: 12,
};

const legendDotStyle = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
  flexShrink: 0,
};

const drawerStyle = {
  marginTop: -8,
  background: "rgba(255,255,255,0.96)",
  borderRadius: 24,
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 20px 40px rgba(15,23,42,0.08)",
  padding: "10px 12px 16px",
};

const drawerHandleStyle = {
  width: 52,
  height: 5,
  borderRadius: 999,
  background: "rgba(148,163,184,0.45)",
  margin: "0 auto 6px",
};

const mapShellStyle = {
  position: "relative",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

const mapOverlayStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  textAlign: "center",
  color: "#475569",
  background: "rgba(255,255,255,0.68)",
  fontSize: 14,
  backdropFilter: "blur(2px)",
};

const recommendedToggleWrapStyle = {
  position: "absolute",
  left: 10,
  bottom: 10,
  zIndex: 3,
  display: "grid",
  gap: 6,
  maxWidth: "min(280px, calc(100% - 20px))",
};

const recommendedToggleBtnStyle = {
  minHeight: 38,
  borderRadius: 999,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  background: "rgba(255,255,255,0.96)",
};

const recommendedToggleBtnActiveStyle = {
  borderColor: "rgba(14,165,233,0.24)",
  background: "rgba(240,249,255,0.96)",
  color: "#0c4a6e",
};

const recommendedToggleHintStyle = {
  fontSize: 12,
  color: "#334155",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
  padding: "6px 10px",
  boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
};



