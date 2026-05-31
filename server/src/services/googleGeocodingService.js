const GOOGLE_GEOCODING_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_TEXTSEARCH_ENDPOINT = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GEOCODING_TIMEOUT_MS = 8000;

const MALAYSIA_BOUNDS = {
  minLat: 0,
  maxLat: 8.5,
  minLng: 99,
  maxLng: 120,
};

const CITY_HINTS = [
  {
    keywords: ["kuala lumpur", "kl"],
    center: { lat: 3.139, lng: 101.6869 },
    radius: 50000,
    bounds: { minLat: 2.85, maxLat: 3.45, minLng: 101.35, maxLng: 102.05 },
  },
  {
    keywords: ["langkawi"],
    center: { lat: 6.35, lng: 99.8 },
    radius: 50000,
    bounds: { minLat: 6.0, maxLat: 6.65, minLng: 99.55, maxLng: 100.05 },
  },
  {
    keywords: ["penang", "george town", "georgetown", "butterworth"],
    center: { lat: 5.4141, lng: 100.3288 },
    radius: 55000,
    bounds: { minLat: 5.05, maxLat: 5.65, minLng: 100.05, maxLng: 100.65 },
  },
];

let warnedMissingApiKey = false;
let warnedMissingFetch = false;

function uniqueQueries(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function isWithinBounds(coords, bounds) {
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

function getCityHint(destination) {
  const value = String(destination || "").toLowerCase();
  if (!value) return null;
  return CITY_HINTS.find((hint) => hint.keywords.some((keyword) => value.includes(keyword))) || null;
}

function buildCandidateQueries({ name, address, destination }) {
  const safeName = String(name || "").trim();
  const safeAddress = String(address || "").trim();
  const safeDestination = String(destination || "").trim();

  return uniqueQueries([
    safeName && safeAddress && safeDestination ? `${safeName}, ${safeAddress}, ${safeDestination}, Malaysia` : "",
    safeName && safeDestination ? `${safeName}, ${safeDestination}, Malaysia` : "",
    safeAddress && safeDestination ? `${safeAddress}, ${safeDestination}, Malaysia` : "",
    safeName && safeAddress ? `${safeName}, ${safeAddress}, Malaysia` : "",
    safeName ? `${safeName}, Malaysia` : "",
    safeAddress ? `${safeAddress}, Malaysia` : "",
    safeAddress,
    safeName && safeAddress ? `${safeName}, ${safeAddress}` : "",
  ]);
}

function parseCoordinates(result) {
  const location = result?.geometry?.location;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function getCountryCode(result) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  const country = components.find((item) => Array.isArray(item?.types) && item.types.includes("country"));
  return String(country?.short_name || "").toUpperCase() || null;
}

async function geocodeSingleQuery({ query, apiKey, signal }) {
  const params = new URLSearchParams({
    address: query,
    key: apiKey,
    region: "my",
    components: "country:MY",
    language: "en",
  });

  const response = await fetch(`${GOOGLE_GEOCODING_ENDPOINT}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const payload = await response.json();
  const status = String(payload?.status || "");

  if (status === "OK") {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const malaysiaResult = results.find((result) => getCountryCode(result) === "MY");
    if (malaysiaResult) {
      return parseCoordinates(malaysiaResult) ?? null;
    }
    return null;
  }

  if (status === "ZERO_RESULTS") {
    return null;
  }

  throw new Error(payload?.error_message ? `${status}: ${payload.error_message}` : `Geocoding status: ${status || "UNKNOWN"}`);
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTextSearchResult(result, { name, address, destination }) {
  const targetName = normalizeComparableText(name);
  const targetAddress = normalizeComparableText(address);
  const targetDestination = normalizeComparableText(destination);
  const resultName = normalizeComparableText(result?.name);
  const resultAddress = normalizeComparableText(result?.formatted_address || result?.vicinity);
  const resultText = `${resultName} ${resultAddress}`;

  let score = 0;
  if (targetName && resultName === targetName) score += 80;
  if (targetName && resultName.includes(targetName)) score += 45;
  if (targetName && targetName.includes(resultName) && resultName.length >= 5) score += 25;

  const nameTokens = targetName.split(" ").filter((token) => token.length >= 3);
  for (const token of nameTokens) {
    if (resultName.includes(token)) score += 6;
  }

  const addressTokens = targetAddress.split(" ").filter((token) => token.length >= 4);
  for (const token of addressTokens) {
    if (resultText.includes(token)) score += 2;
  }

  const destinationTokens = targetDestination.split(" ").filter((token) => token.length >= 3);
  for (const token of destinationTokens) {
    if (resultText.includes(token)) score += 3;
  }

  if (Array.isArray(result?.types) && result.types.some((type) => ["tourist_attraction", "point_of_interest", "establishment", "restaurant", "park", "museum", "shopping_mall"].includes(type))) {
    score += 10;
  }

  return score;
}

async function textSearchSingleQuery({ query, apiKey, cityHint, signal, name, address, destination }) {
  const params = new URLSearchParams({
    query,
    key: apiKey,
    region: "my",
    language: "en",
  });

  if (cityHint?.center) {
    params.set("location", `${cityHint.center.lat},${cityHint.center.lng}`);
    params.set("radius", String(cityHint.radius || 50000));
  }

  const response = await fetch(`${GOOGLE_PLACES_TEXTSEARCH_ENDPOINT}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const payload = await response.json();
  const status = String(payload?.status || "");

  if (status === "ZERO_RESULTS") return null;
  if (status !== "OK") {
    throw new Error(payload?.error_message ? `${status}: ${payload.error_message}` : `Places status: ${status || "UNKNOWN"}`);
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const candidates = results
    .map((result) => {
      const coords = parseCoordinates(result);
      if (!coords || !isWithinBounds(coords, MALAYSIA_BOUNDS)) return null;
      if (cityHint?.bounds && !isWithinBounds(coords, cityHint.bounds)) return null;
      return {
        coords,
        score: scoreTextSearchResult(result, { name, address, destination }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const selected = candidates.find((candidate) => candidate.score >= 18) || null;
  return selected?.coords || null;
}

export async function geocodePoiCoordinates({ name, address, destination }) {
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) {
    if (!warnedMissingApiKey) {
      warnedMissingApiKey = true;
      console.warn("[Geocoding] GOOGLE_MAPS_API_KEY is missing; skipping POI geocoding.");
    }
    return null;
  }

  if (typeof fetch !== "function") {
    if (!warnedMissingFetch) {
      warnedMissingFetch = true;
      console.warn("[Geocoding] Global fetch is unavailable in this Node runtime; skipping POI geocoding.");
    }
    return null;
  }

  const queries = buildCandidateQueries({ name, address, destination });
  if (!queries.length) return null;
  const cityHint = getCityHint(destination);

  for (const query of queries) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), GEOCODING_TIMEOUT_MS) : null;

    try {
      const coords = await textSearchSingleQuery({
        query,
        apiKey,
        cityHint,
        signal: controller?.signal,
        name,
        address,
        destination,
      });
      if (coords) return coords;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  for (const query of queries) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), GEOCODING_TIMEOUT_MS) : null;

    try {
      const coords = await geocodeSingleQuery({
        query,
        apiKey,
        signal: controller?.signal,
      });
      if (coords && isWithinBounds(coords, MALAYSIA_BOUNDS) && (!cityHint?.bounds || isWithinBounds(coords, cityHint.bounds))) {
        return coords;
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return null;
}

async function fetchJsonWithTimeout(url, timeoutMs = GEOCODING_TIMEOUT_MS) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, { signal: controller?.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    return await response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function getDestinationCoverImageUrl(destination) {
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  const safeDestination = String(destination || "").trim();
  if (!apiKey || !safeDestination || typeof fetch !== "function") {
    return null;
  }

  const params = new URLSearchParams({
    query: `${safeDestination}, Malaysia`,
    key: apiKey,
    region: "my",
    language: "en",
  });

  const payload = await fetchJsonWithTimeout(`${GOOGLE_PLACES_TEXTSEARCH_ENDPOINT}?${params.toString()}`);
  const status = String(payload?.status || "");
  if (status !== "OK") {
    if (status === "ZERO_RESULTS") return null;
    throw new Error(payload?.error_message ? `${status}: ${payload.error_message}` : `Places status: ${status || "UNKNOWN"}`);
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  const firstWithPhoto = results.find(
    (item) => Array.isArray(item?.photos) && item.photos[0]?.photo_reference
  );
  const photoRef = firstWithPhoto?.photos?.[0]?.photo_reference;
  if (!photoRef) return null;

  // Persist a direct Google Places Photo URL; client can render it across devices.
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photoreference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(apiKey)}`;
}
