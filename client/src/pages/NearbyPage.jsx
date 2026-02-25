import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, LocationArrowIcon } from "../components/icons";
import PoiDetailPanel from "../components/PoiDetailPanel";
import { createFavoriteFromPlace, deleteFavorite as deleteFavoriteApi, getFavorites } from "../services/api";
import malaysiaLocations from "../data/malaysiaLocations";
import { isLikelyMalaysiaCoordinates, MALAYSIA_MAP_BOUNDS } from "../utils/malaysiaGeo";

const DEFAULT_CENTER = { lat: 3.139, lng: 101.6869 };
const SEARCH_RADIUS_METERS = 2500;
const MAX_RESULTS_PER_TYPE = 12;
const MAX_RESULTS_ALL = 16;
const NEARBY_TYPE_META = {
  all: { label: "All", emoji: "\u{1F9ED}" },
  food: { label: "Food", emoji: "\u{1F35C}" },
  attractions: { label: "Attractions", emoji: "\u{1F3DB}\uFE0F" },
};
const MALAYSIA_FEATURED_CITIES = Array.isArray(malaysiaLocations?.featured)
  ? malaysiaLocations.featured.map((city) => String(city || "").trim()).filter(Boolean)
  : [];
const MALAYSIA_ALL_CITIES = (() => {
  const unique = new Set(MALAYSIA_FEATURED_CITIES);
  for (const stateGroup of Array.isArray(malaysiaLocations?.states) ? malaysiaLocations.states : []) {
    for (const city of Array.isArray(stateGroup?.cities) ? stateGroup.cities : []) {
      const normalized = String(city || "").trim();
      if (normalized) unique.add(normalized);
    }
  }
  return Array.from(unique);
})();

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en`;
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

async function ensurePlacesLibrary() {
  if (window.google?.maps?.places) return;
  if (typeof window.google?.maps?.importLibrary === "function") {
    await window.google.maps.importLibrary("places");
    return;
  }
  throw new Error("Google Places library is not available");
}

function nearbySearch(service, request, statusEnum) {
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

function placeDetailsRequest(service, request, statusEnum) {
  return new Promise((resolve, reject) => {
    service.getDetails(request, (result, status) => {
      if (status === statusEnum.OK) {
        resolve(result ?? null);
        return;
      }
      reject(new Error(`Place details failed: ${status}`));
    });
  });
}

function toPlainPlace(place, fallbackType) {
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
    placeId: place.place_id,
    name: place.name || "Unnamed place",
    address: place.vicinity || place.formatted_address || "",
    lat,
    lng,
    type: normalizedType,
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    userRatingsTotal: Number.isFinite(Number(place.user_ratings_total)) ? Number(place.user_ratings_total) : 0,
  };
}

function mergePlacesById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list) {
      if (!item?.placeId) continue;
      if (!map.has(item.placeId)) map.set(item.placeId, item);
    }
  }
  return Array.from(map.values());
}

function sortPlacesByQuality(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const aHasRating = Number.isFinite(Number(a?.rating));
    const bHasRating = Number.isFinite(Number(b?.rating));
    if (aHasRating !== bHasRating) return aHasRating ? -1 : 1;

    const ratingDiff = Number(b?.rating || 0) - Number(a?.rating || 0);
    if (Math.abs(ratingDiff) > 1e-9) return ratingDiff;

    const reviewsDiff = Number(b?.userRatingsTotal || 0) - Number(a?.userRatingsTotal || 0);
    if (reviewsDiff !== 0) return reviewsDiff;

    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

function cacheKeyFor(tab, center) {
  const lat = center?.lat ?? DEFAULT_CENTER.lat;
  const lng = center?.lng ?? DEFAULT_CENTER.lng;
  // Round coords to reduce duplicate queries caused by tiny GPS drift
  return `${tab}:${lat.toFixed(3)},${lng.toFixed(3)}`;
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

function geocodeLatLng(lat, lng) {
  return new Promise((resolve, reject) => {
    const geocoder = window.google?.maps ? new window.google.maps.Geocoder() : null;
    if (!geocoder) {
      reject(new Error("Geocoder is not available"));
      return;
    }

    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK") {
        reject(new Error(`Geocoder failed: ${status}`));
        return;
      }

      const first = Array.isArray(results) ? results[0] : null;
      const components = Array.isArray(first?.address_components) ? first.address_components : [];
      const findByType = (type) =>
        components.find((c) => Array.isArray(c?.types) && c.types.includes(type))?.long_name || "";

      const city =
        findByType("locality") ||
        findByType("postal_town") ||
        findByType("administrative_area_level_2") ||
        findByType("administrative_area_level_1");
      const country = findByType("country");
      const label = [city, country].filter(Boolean).join(", ");
      resolve({
        city: city || "",
        country: country || "",
        label: label || first?.formatted_address || "Current Location",
        formattedAddress: String(first?.formatted_address || "").trim(),
      });
    });
  });
}

async function fetchCurrentWeather(lat, lng, options = {}) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString(), { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status})`);
  }

  const data = await response.json();
  const current = data?.current ?? {};
  const daily = data?.daily ?? {};

  return {
    label: getWeatherCodeLabel(current.weather_code),
    temp: Number(current.temperature_2m),
    max: Array.isArray(daily.temperature_2m_max) ? Number(daily.temperature_2m_max[0]) : NaN,
    min: Array.isArray(daily.temperature_2m_min) ? Number(daily.temperature_2m_min[0]) : NaN,
  };
}

function formatWeatherLine(weather) {
  if (!weather) return "Weather unavailable";
  const range =
    Number.isFinite(weather.min) && Number.isFinite(weather.max)
      ? `${Math.round(weather.min)}° - ${Math.round(weather.max)}°`
      : Number.isFinite(weather.temp)
        ? `${Math.round(weather.temp)}°`
        : "";
  return [weather.label, range].filter(Boolean).join(" | ") || "Weather unavailable";
}

function formatPrimaryTypeLabel(type) {
  const normalized = String(type || "other").trim();
  if (!normalized) return "Other";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(" ");
}

function looksEnglishReviewText(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const asciiChars = value.replace(/[^\x00-\x7F]/g, "");
  const asciiRatio = asciiChars.length / value.length;
  if (asciiRatio < 0.85) return false;
  return /\b(the|and|is|was|very|great|nice|good|place|visit)\b/i.test(value) || asciiRatio > 0.98;
}

function pickNearbyReviewQuotes(rawReviews) {
  const reviews = (Array.isArray(rawReviews) ? rawReviews : [])
    .map((item) => {
      const text = String(item?.text || "").trim();
      const rating = Number(item?.rating);
      const language = String(item?.language || "").trim().toLowerCase();
      const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
      return {
        text,
        rating,
        wordCount,
        isEnglish: language === "en" || looksEnglishReviewText(text),
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
    const firstText = sortedByShortness[0]?.text;
    if (firstText) positive.push(firstText);
  }

  return { positive, negative };
}

function normalizeNearbyPlaceDetails(place, rawDetails) {
  const details = rawDetails || {};
  const editorialSummary = String(details?.editorial_summary?.overview || "").trim();
  const introText = editorialSummary || "No introduction available yet.";
  const weekdayText = Array.isArray(details?.opening_hours?.weekday_text)
    ? details.opening_hours.weekday_text.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const reviewQuotes = pickNearbyReviewQuotes(details?.reviews);
  const imageUrl =
    Array.isArray(details?.photos) && typeof details.photos[0]?.getUrl === "function"
      ? String(details.photos[0].getUrl({ maxWidth: 1200 }) || "").trim()
      : "";

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
      primary_type_label: formatPrimaryTypeLabel(place?.type),
      introduction: editorialSummary,
      reviews: reviewQuotes,
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
    source: {
      provider: "google_places_js",
      cached: false,
      cached_at: null,
    },
  };
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createNearbyMarkerIcon(maps, placeType) {
  const isFood = placeType === "food";
  const emoji = isFood ? "\u{1F35C}" : "\u{1F3DB}\uFE0F";
  const fill = isFood ? "#f97316" : "#0ea5e9";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path d="M19 2C11.268 2 5 8.268 5 16c0 10.2 11.253 21.973 13.076 23.826a1.3 1.3 0 0 0 1.848 0C21.747 37.973 33 26.2 33 16 33 8.268 26.732 2 19 2z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="19" cy="16" r="9.2" fill="#ffffff"/>
        <text x="19" y="20.5" text-anchor="middle" font-size="11" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapeSvgText(emoji)}</text>
      </g>
    </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(38, 48),
    anchor: new maps.Point(19, 44),
  };
}

export default function NearbyPage() {
  const [tab, setTab] = useState("all");
  const [mapLoading, setMapLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [places, setPlaces] = useState([]);
  const [mapSearchCenter, setMapSearchCenter] = useState(null);
  const [headerLocation, setHeaderLocation] = useState("Locating...");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationPickerQuery, setLocationPickerQuery] = useState("");
  const [locationPickerError, setLocationPickerError] = useState("");
  const [locationPickerBusy, setLocationPickerBusy] = useState(false);
  const [headerWeather, setHeaderWeather] = useState(null);
  const [headerWeatherLoading, setHeaderWeatherLoading] = useState(false);
  const [poiDetailPanelOpen, setPoiDetailPanelOpen] = useState(false);
  const [selectedPoiDetailTarget, setSelectedPoiDetailTarget] = useState(null);
  const [poiDetailLoading, setPoiDetailLoading] = useState(false);
  const [poiDetailError, setPoiDetailError] = useState("");
  const [poiDetailData, setPoiDetailData] = useState(null);
  const [poiDetailIntroExpanded, setPoiDetailIntroExpanded] = useState(false);
  const [poiDetailRequestKey, setPoiDetailRequestKey] = useState("");
  const [favoritePoiIds, setFavoritePoiIds] = useState([]);
  const [favoriteBusyPoiId, setFavoriteBusyPoiId] = useState(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const poiMarkerRefs = useRef([]);
  const placesServiceRef = useRef(null);
  const placesCacheRef = useRef(new Map());
  const debounceTimerRef = useRef(null);
  const locationLookupSeqRef = useRef(0);
  const weatherLookupSeqRef = useRef(0);
  const poiDetailRequestSeqRef = useRef(0);
  const nearbyPlaceDetailsCacheRef = useRef(new Map());
  const mapIdleListenerRef = useRef(null);
  const favoritePoiIdByPlaceIdRef = useRef(new Map());
  const locationPickerRef = useRef(null);

  const centerForSearch = mapSearchCenter ?? userLocation ?? DEFAULT_CENTER;
  const filteredMalaysiaCities = useMemo(() => {
    const q = String(locationPickerQuery || "").trim().toLowerCase();
    if (!q) return MALAYSIA_ALL_CITIES;
    return MALAYSIA_ALL_CITIES.filter((city) => city.toLowerCase().includes(q));
  }, [locationPickerQuery]);

  const handleLocateUser = (options = {}) => {
    const { silent = false } = options;
    if (locating) return;

    if (!navigator.geolocation) {
      if (!silent) setLocateError("Geolocation is not supported in this browser");
      return;
    }

    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) {
      if (!silent) setLocateError("Map is not ready yet");
      return;
    }

    setLocating(true);
    if (!silent) setLocateError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        if (!isLikelyMalaysiaCoordinates(nextCenter.lat, nextCenter.lng)) {
          setLocateError("This app currently supports Malaysia only");
          setLocating(false);
          return;
        }

        setUserLocation(nextCenter);
        map.panTo(nextCenter);
        map.setZoom(14);

        if (userMarkerRef.current) {
          userMarkerRef.current.setMap(null);
          userMarkerRef.current = null;
        }

        setLocating(false);
      },
      (err) => {
        if (!silent) {
          const messageByCode = {
            1: "Location permission denied",
            2: "Location unavailable",
            3: "Location request timed out",
          };
          setLocateError(messageByCode[err.code] || "Failed to get location");
        }
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleJumpToMalaysiaCity = async (cityName) => {
    const city = String(cityName || "").trim();
    if (!city || locationPickerBusy) return;

    const map = mapRef.current;
    const geocoder = window.google?.maps ? new window.google.maps.Geocoder() : null;
    if (!map || !geocoder) {
      setLocationPickerError("Map is not ready yet");
      return;
    }

    try {
      setLocationPickerBusy(true);
      setLocationPickerError("");

      const result = await new Promise((resolve, reject) => {
        geocoder.geocode({ address: `${city}, Malaysia`, region: "MY" }, (results, status) => {
          if (status !== "OK") {
            reject(new Error(`Geocoder failed: ${status}`));
            return;
          }
          resolve(Array.isArray(results) ? results[0] : null);
        });
      });

      const point = result?.geometry?.location;
      const lat = point?.lat?.();
      const lng = point?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isLikelyMalaysiaCoordinates(lat, lng)) {
        throw new Error("Selected city is outside Malaysia");
      }

      if (result?.geometry?.viewport) {
        map.fitBounds(result.geometry.viewport, 32);
      } else {
        map.panTo({ lat, lng });
        map.setZoom(12);
      }
      setMapSearchCenter({ lat, lng });
      setHeaderLocation(city);
      setLocationPickerOpen(false);
      setLocationPickerQuery("");
    } catch (err) {
      setLocationPickerError(err instanceof Error ? err.message : "Failed to switch location");
    } finally {
      setLocationPickerBusy(false);
    }
  };

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    let cancelled = false;

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
        await ensurePlacesLibrary();
        if (cancelled) return;
        if (!mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center: DEFAULT_CENTER,
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            cameraControl: false,
            zoomControl: false,
            rotateControl: false,
            keyboardShortcuts: false,
            gestureHandling: "greedy",
            clickableIcons: false,
            restriction: {
              latLngBounds: MALAYSIA_MAP_BOUNDS,
              strictBounds: true,
            },
            styles: [
              { featureType: "poi", stylers: [{ visibility: "off" }] },
              { featureType: "transit.station", stylers: [{ visibility: "off" }] },
            ],
          });
        }

        if (!placesServiceRef.current) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(mapRef.current);
        }

        setMapReady(true);

        // Nearby defaults to user location if browser grants permission.
        handleLocateUser({ silent: true });
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : "Failed to load map");
        }
      } finally {
        if (!cancelled) {
          setMapLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!locationPickerOpen) return;

    const onPointerDown = (event) => {
      if (locationPickerRef.current && !locationPickerRef.current.contains(event.target)) {
        setLocationPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [locationPickerOpen]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!mapReady || !map || !maps) return;

    for (const marker of poiMarkerRefs.current) {
      marker.setMap(null);
    }
    poiMarkerRefs.current = [];

    poiMarkerRefs.current = places.map((place) => {
      const marker = new maps.Marker({
        map,
        position: { lat: place.lat, lng: place.lng },
        title: place.name || "POI",
        clickable: true,
        icon: createNearbyMarkerIcon(maps, place.type),
      });

      marker.addListener("click", () => {
        const target = {
          poi: {
            poi_id: null,
            name: place.name || "Unnamed POI",
            type: place.type || "other",
            address: place.address || "",
            lat: place.lat,
            lng: place.lng,
          },
          placeId: place.placeId,
        };
        setSelectedPoiDetailTarget(target);
        setPoiDetailPanelOpen(true);
        setPoiDetailIntroExpanded(false);
        setPoiDetailError("");

        const cached = nearbyPlaceDetailsCacheRef.current.get(place.placeId);
        setPoiDetailData(cached || null);
        setPoiDetailLoading(!cached);
      });

      return marker;
    });
  }, [places, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!mapReady || !map || !maps) return;

    if (mapIdleListenerRef.current) {
      maps.event.removeListener(mapIdleListenerRef.current);
      mapIdleListenerRef.current = null;
    }

    const syncCenterFromMap = () => {
      const center = map.getCenter?.();
      const lat = center?.lat?.();
      const lng = center?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      setMapSearchCenter((prev) => {
        if (prev && Math.abs(prev.lat - lat) < 0.0002 && Math.abs(prev.lng - lng) < 0.0002) {
          return prev;
        }
        return { lat, lng };
      });
    };

    // Prime search center once the map is ready.
    syncCenterFromMap();
    mapIdleListenerRef.current = map.addListener("idle", syncCenterFromMap);

    return () => {
      if (mapIdleListenerRef.current) {
        maps.event.removeListener(mapIdleListenerRef.current);
        mapIdleListenerRef.current = null;
      }
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !placesServiceRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const service = placesServiceRef.current;
      const googlePlaces = window.google?.maps?.places;
      if (!service || !googlePlaces) return;

      const key = cacheKeyFor(tab, centerForSearch);
      const cached = placesCacheRef.current.get(key);
      if (cached) {
        setPlaces(cached);
        setPlacesError("");
        return;
      }

      try {
        setPlacesLoading(true);
        setPlacesError("");

        const baseRequest = {
          location: centerForSearch,
          radius: SEARCH_RADIUS_METERS,
        };

        let nextPlaces = [];

        if (tab === "food") {
          const results = await nearbySearch(
            service,
            { ...baseRequest, type: "restaurant" },
            googlePlaces.PlacesServiceStatus
          );
          nextPlaces = sortPlacesByQuality(
            results
              .map((p) => toPlainPlace(p, "food"))
              .filter(Boolean)
          ).slice(0, MAX_RESULTS_PER_TYPE);
        } else if (tab === "attractions") {
          const results = await nearbySearch(
            service,
            { ...baseRequest, type: "tourist_attraction" },
            googlePlaces.PlacesServiceStatus
          );
          nextPlaces = sortPlacesByQuality(
            results
              .map((p) => toPlainPlace(p, "attractions"))
              .filter(Boolean)
          ).slice(0, MAX_RESULTS_PER_TYPE);
        } else {
          const foodKey = cacheKeyFor("food", centerForSearch);
          const attractionsKey = cacheKeyFor("attractions", centerForSearch);

          let foodPlaces = placesCacheRef.current.get(foodKey);
          let attractionPlaces = placesCacheRef.current.get(attractionsKey);

          if (!foodPlaces) {
            const foodResults = await nearbySearch(
              service,
              { ...baseRequest, type: "restaurant" },
              googlePlaces.PlacesServiceStatus
            );
            foodPlaces = sortPlacesByQuality(
              foodResults
                .map((p) => toPlainPlace(p, "food"))
                .filter(Boolean)
            ).slice(0, MAX_RESULTS_PER_TYPE);
            placesCacheRef.current.set(foodKey, foodPlaces);
          }

          if (!attractionPlaces) {
            const attractionResults = await nearbySearch(
              service,
              { ...baseRequest, type: "tourist_attraction" },
              googlePlaces.PlacesServiceStatus
            );
            attractionPlaces = sortPlacesByQuality(
              attractionResults
                .map((p) => toPlainPlace(p, "attractions"))
                .filter(Boolean)
            ).slice(0, MAX_RESULTS_PER_TYPE);
            placesCacheRef.current.set(attractionsKey, attractionPlaces);
          }

          nextPlaces = sortPlacesByQuality(mergePlacesById(foodPlaces, attractionPlaces)).slice(0, MAX_RESULTS_ALL);
        }

        if (!nextPlaces.length && !isLikelyMalaysiaCoordinates(centerForSearch.lat, centerForSearch.lng)) {
          setPlacesError("No Malaysia POIs found in this area. Move the map to Malaysia.");
        }
        placesCacheRef.current.set(key, nextPlaces);
        setPlaces(nextPlaces);
      } catch (err) {
        setPlacesError(err instanceof Error ? err.message : "Failed to fetch nearby places");
        setPlaces([]);
      } finally {
        setPlacesLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [tab, centerForSearch.lat, centerForSearch.lng, mapReady]);

  useEffect(() => {
    if (!mapReady) return;

    const seq = ++locationLookupSeqRef.current;
    let cancelled = false;

    (async () => {
      try {
        const result = await geocodeLatLng(centerForSearch.lat, centerForSearch.lng);
        if (cancelled || seq !== locationLookupSeqRef.current) return;
        const country = String(result?.country || "").trim().toLowerCase();
        const isMalaysiaCountry = country === "malaysia";
        setHeaderLocation(isMalaysiaCountry ? result.label : "Out of Malaysia");
      } catch {
        if (cancelled || seq !== locationLookupSeqRef.current) return;
        setHeaderLocation(userLocation ? "Current Location" : "Kuala Lumpur, Malaysia");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [centerForSearch.lat, centerForSearch.lng, mapReady, userLocation]);

  useEffect(() => {
    const seq = ++weatherLookupSeqRef.current;
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setHeaderWeatherLoading(true);
      try {
        const weather = await fetchCurrentWeather(centerForSearch.lat, centerForSearch.lng, { signal: controller.signal });
        if (cancelled || seq !== weatherLookupSeqRef.current) return;
        setHeaderWeather(weather);
      } catch {
        if (cancelled || seq !== weatherLookupSeqRef.current) return;
        setHeaderWeather(null);
      } finally {
        if (!cancelled && seq === weatherLookupSeqRef.current) {
          setHeaderWeatherLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [centerForSearch.lat, centerForSearch.lng]);

  useEffect(() => {
    if (!poiDetailPanelOpen || !selectedPoiDetailTarget?.placeId) return;

    const placeId = String(selectedPoiDetailTarget.placeId || "").trim();
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!placeId || !service || !statusEnum) return;

    const cached = nearbyPlaceDetailsCacheRef.current.get(placeId);
    if (cached) {
      setPoiDetailData(cached);
      setPoiDetailLoading(false);
      setPoiDetailError("");
      return;
    }

    const requestSeq = poiDetailRequestSeqRef.current + 1;
    poiDetailRequestSeqRef.current = requestSeq;
    setPoiDetailRequestKey(`${placeId}:${requestSeq}`);
    setPoiDetailLoading(true);
    setPoiDetailError("");

    (async () => {
      try {
        const rawDetails = await placeDetailsRequest(
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

        const normalized = normalizeNearbyPlaceDetails(
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
        nearbyPlaceDetailsCacheRef.current.set(placeId, normalized);
        setPoiDetailData(normalized);
      } catch (err) {
        if (poiDetailRequestSeqRef.current !== requestSeq) return;
        setPoiDetailError(err instanceof Error ? err.message : "Failed to load place details");
        setPoiDetailData(
          normalizeNearbyPlaceDetails(
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
        if (poiDetailRequestSeqRef.current === requestSeq) {
          setPoiDetailLoading(false);
        }
      }
    })();
  }, [poiDetailPanelOpen, selectedPoiDetailTarget]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getFavorites();
        if (cancelled) return;
        const ids = [];
        const byPlaceId = new Map();
        for (const row of Array.isArray(rows) ? rows : []) {
          const poiId = Number(row?.poi_id);
          if (Number.isInteger(poiId) && poiId > 0) ids.push(poiId);
          const placeId = String(row?.google_place_id || "").trim();
          if (placeId && Number.isInteger(poiId) && poiId > 0) byPlaceId.set(placeId, poiId);
        }
        favoritePoiIdByPlaceIdRef.current = byPlaceId;
        setFavoritePoiIds(ids);
      } catch {
        if (cancelled) return;
        setFavoritePoiIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleFavoriteFromPoiDetail = async () => {
    const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
    const knownPoiId =
      Number(selectedPoiDetailTarget?.poi?.poi_id) ||
      Number(poiDetailData?.poi?.poi_id) ||
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

    const isFavorite = Number.isInteger(knownPoiId) && favoritePoiIds.includes(knownPoiId);
    if (isFavorite) {
      try {
        setFavoriteBusyPoiId(knownPoiId);
        await deleteFavoriteApi(knownPoiId);
        setFavoritePoiIds((prev) => prev.filter((id) => id !== knownPoiId));
      } catch (err) {
        setPoiDetailError(err instanceof Error ? err.message : "Failed to update favorite");
      } finally {
        setFavoriteBusyPoiId(null);
      }
      return;
    }

    try {
      setFavoriteBusyPoiId(Number.isInteger(knownPoiId) ? knownPoiId : -1);
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
      if (!payload.name) {
        throw new Error("Place name is missing");
      }
      if (!payload.address && !payload.google_place_id) {
        throw new Error("Place address is missing. Please wait for place details to load.");
      }
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
      setPoiDetailError("");
    } catch (err) {
      const apiMessage = err?.response?.data?.error;
      setPoiDetailError(apiMessage || (err instanceof Error ? err.message : "Failed to update favorite"));
    } finally {
      setFavoriteBusyPoiId(null);
    }
  };

  return (
    <div className="nearbyPage">
      <div className="mapStage">
        <div className="nearbyHeader">
          <div style={{ position: "relative" }} ref={locationPickerRef}>
            <button
              type="button"
              className="nearbyTitle"
              style={nearbyHeaderLocationButtonStyle}
              onClick={() => {
                setLocationPickerOpen((prev) => !prev);
                setLocationPickerError("");
              }}
              aria-haspopup="dialog"
              aria-expanded={locationPickerOpen}
              title="Choose a Malaysia city"
            >
              <span>{headerLocation}</span>
              <span className="nearbyCaret" style={{ transform: locationPickerOpen ? "rotate(180deg)" : "none" }}>
                <ChevronDownIcon />
              </span>
            </button>
            <div className="nearbyWeather" style={nearbyHeaderWeatherTextStyle}>
              {headerWeatherLoading ? "Loading weather..." : formatWeatherLine(headerWeather)}
            </div>
            {locationPickerOpen ? (
              <div style={nearbyLocationPickerStyle} role="dialog" aria-label="Choose Malaysia city">
                <div style={nearbyLocationPickerTitleStyle}>Switch nearby location (Malaysia)</div>
                <input
                  type="text"
                  value={locationPickerQuery}
                  onChange={(e) => setLocationPickerQuery(e.target.value)}
                  placeholder="Search Malaysia city..."
                  style={nearbyLocationPickerInputStyle}
                  disabled={locationPickerBusy}
                />
                <div style={nearbyLocationPickerSectionLabelStyle}>Popular cities</div>
                <div style={nearbyLocationPickerChipWrapStyle}>
                  {MALAYSIA_FEATURED_CITIES.map((city) => (
                    <button
                      key={`featured-${city}`}
                      type="button"
                      style={nearbyLocationPickerChipStyle}
                      onClick={() => void handleJumpToMalaysiaCity(city)}
                      disabled={locationPickerBusy}
                    >
                      {city}
                    </button>
                  ))}
                </div>
                <div style={nearbyLocationPickerSectionLabelStyle}>All Malaysia cities</div>
                <div style={nearbyLocationPickerListStyle}>
                  {filteredMalaysiaCities.slice(0, 24).map((city) => (
                    <button
                      key={`city-${city}`}
                      type="button"
                      style={nearbyLocationPickerListItemStyle}
                      onClick={() => void handleJumpToMalaysiaCity(city)}
                      disabled={locationPickerBusy}
                    >
                      {city}
                    </button>
                  ))}
                  {!filteredMalaysiaCities.length ? (
                    <div className="muted" style={{ fontSize: 12, padding: "4px 2px" }}>
                      No matching Malaysia city
                    </div>
                  ) : null}
                </div>
                {locationPickerError ? (
                  <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{locationPickerError}</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            className="iconBtn nearbyLocateBtn"
            aria-label="locate"
            onClick={() => handleLocateUser()}
            disabled={locating}
            title={locating ? "Locating..." : "Locate me"}
          >
            <LocationArrowIcon />
          </button>
        </div>

        <div className="mapCanvas" aria-label="nearby map" style={{ position: "relative" }}>
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
          {mapLoading ? (
            <div style={mapOverlayStyle}>Loading map...</div>
          ) : mapError ? (
            <div style={mapOverlayStyle}>{mapError}</div>
          ) : !mapLoading && !mapError && placesError ? (
            <div style={mapOverlayStyle}>{placesError}</div>
          ) : null}
        </div>

        {locateError ? <div style={locateErrorStyle}>{locateError}</div> : null}

        <div className="pillGroup nearbyPills">
          <button type="button" className={`pill ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
            {NEARBY_TYPE_META.all.emoji} {NEARBY_TYPE_META.all.label}
          </button>
          <button type="button" className={`pill ${tab === "food" ? "active" : ""}`} onClick={() => setTab("food")}>
            {NEARBY_TYPE_META.food.emoji} {NEARBY_TYPE_META.food.label}
          </button>
          <button
            type="button"
            className={`pill ${tab === "attractions" ? "active" : ""}`}
            onClick={() => setTab("attractions")}
          >
            {NEARBY_TYPE_META.attractions.emoji} {NEARBY_TYPE_META.attractions.label}
          </button>
        </div>
      </div>

      <PoiDetailPanel
        key={poiDetailRequestKey || String(selectedPoiDetailTarget?.placeId || "nearby-poi-detail")}
        open={poiDetailPanelOpen}
        isDesktop={typeof window !== "undefined" ? window.innerWidth >= 1024 : false}
        target={selectedPoiDetailTarget}
        loading={poiDetailLoading}
        error={poiDetailError}
        details={poiDetailData}
        introExpanded={poiDetailIntroExpanded}
        onToggleIntro={() => setPoiDetailIntroExpanded((prev) => !prev)}
        onClose={() => {
          setPoiDetailPanelOpen(false);
          setPoiDetailLoading(false);
          setPoiDetailError("");
          setPoiDetailIntroExpanded(false);
        }}
        canFavorite={true}
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
        onToggleFavorite={handleToggleFavoriteFromPoiDetail}
      />
    </div>
  );
}

const mapOverlayStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 12,
  color: "#334155",
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(2px)",
  fontSize: 14,
};

const locateErrorStyle = {
  position: "absolute",
  left: 14,
  right: 14,
  bottom: 86,
  zIndex: 4,
  background: "rgba(220, 38, 38, 0.92)",
  color: "#fff",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 13,
  textAlign: "center",
  boxShadow: "0 8px 20px rgba(15,23,42,0.15)",
};

const nearbyHeaderLocationButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
  color: "#0f172a",
  font: "inherit",
  fontSize: 30,
  fontWeight: 1000,
  lineHeight: 1.1,
  textAlign: "left",
};

const nearbyHeaderWeatherTextStyle = {
  color: "#0f172a",
  fontSize: 24,
  lineHeight: 1.35,
  fontWeight: 800,
};

const nearbyLocationPickerStyle = {
  position: "absolute",
  top: "calc(100% + 10px)",
  left: 0,
  width: "min(360px, calc(100vw - 40px))",
  zIndex: 8,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 14,
  boxShadow: "0 18px 36px rgba(15,23,42,0.16)",
  padding: 12,
};

const nearbyLocationPickerTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: 8,
};

const nearbyLocationPickerInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(148,163,184,0.34)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
};

const nearbyLocationPickerSectionLabelStyle = {
  marginTop: 10,
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const nearbyLocationPickerChipWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const nearbyLocationPickerChipStyle = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(248,250,252,0.95)",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
  color: "#0f172a",
  fontFamily: "inherit",
};

const nearbyLocationPickerListStyle = {
  maxHeight: 180,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const nearbyLocationPickerListItemStyle = {
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.98)",
  borderRadius: 10,
  padding: "7px 10px",
  fontSize: 13,
  color: "#0f172a",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};





