const GOOGLE_GEOCODING_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_TEXTSEARCH_ENDPOINT = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GEOCODING_TIMEOUT_MS = 8000;

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

function buildCandidateQueries({ name, address, destination }) {
  const safeName = String(name || "").trim();
  const safeAddress = String(address || "").trim();
  const safeDestination = String(destination || "").trim();

  return uniqueQueries([
    safeName && safeAddress && safeDestination ? `${safeName}, ${safeAddress}, ${safeDestination}, Malaysia` : "",
    safeAddress && safeDestination ? `${safeAddress}, ${safeDestination}, Malaysia` : "",
    safeName && safeAddress ? `${safeName}, ${safeAddress}, Malaysia` : "",
    safeAddress ? `${safeAddress}, Malaysia` : "",
    safeName && safeDestination ? `${safeName}, ${safeDestination}, Malaysia` : "",
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

  for (const query of queries) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), GEOCODING_TIMEOUT_MS) : null;

    try {
      const coords = await geocodeSingleQuery({
        query,
        apiKey,
        signal: controller?.signal,
      });
      if (coords) return coords;
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
