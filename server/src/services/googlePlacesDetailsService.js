import pool from "../config/db.js";

const GOOGLE_PLACES_TEXTSEARCH_ENDPOINT = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_DETAILS_ENDPOINT = "https://maps.googleapis.com/maps/api/place/details/json";
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","if","then","than","so","to","of","in","on","at","for","from","with","by",
  "is","are","was","were","be","been","being","it","its","this","that","these","those","there","here",
  "we","you","they","he","she","i","my","our","your","their","me","us","them",
  "very","really","quite","just","also","too","can","could","would","should","will","may","might","do","does","did",
  "have","has","had","get","got","go","went","come","came","make","made","take","took",
  "place","places","area","spot","location","one","lot","lots","thing","things","time","times","day","days",
  "good","great","nice","bad","okay","ok","best","better","well","amazing","awesome","love","liked",
  "visit","visited","visiting","trip","people","person","crowd","crowded","queue","line"
]);

function isCacheFresh(updatedAt) {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_TTL_MS;
}

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function fetchJsonWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  return (async () => {
    try {
      const response = await fetch(url, { signal: controller?.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      return await response.json();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  })();
}

function formatTypeLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "Other";
  return text
    .split("_")
    .map((token) => token ? `${token[0].toUpperCase()}${token.slice(1)}` : "")
    .join(" ");
}

function looksEnglish(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const asciiChars = value.replace(/[^\x00-\x7F]/g, "");
  const asciiRatio = asciiChars.length / value.length;
  if (asciiRatio < 0.85) return false;
  return /\b(the|and|is|was|very|great|nice|good|place|visit)\b/i.test(value) || asciiRatio > 0.98;
}

function normalizeReviews(rawReviews) {
  const list = Array.isArray(rawReviews) ? rawReviews : [];
  return list
    .map((item) => ({
      text: String(item?.text || "").trim(),
      rating: Number(item?.rating),
      language: String(item?.language || "").trim().toLowerCase() || null,
    }))
    .filter((item) => item.text);
}

function getWordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function compareReviewBrevity(a, b) {
  return getWordCount(a?.text) - getWordCount(b?.text) || String(a?.text || "").length - String(b?.text || "").length;
}

function tokenizeKeywords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 24 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function titleizeKeyword(token) {
  return String(token || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildKeywordReviewSummary(rawReviews) {
  const reviews = normalizeReviews(rawReviews);
  if (!reviews.length) {
    return { positive: [], negative: [] };
  }

  const englishReviews = reviews.filter((review) => looksEnglish(review.text));
  const sourceReviews = englishReviews.length ? englishReviews : reviews;

  const phraseCatalog = {
    positive: [
      { id: "must_visit", text: "Must-visit spot", match: (t) => /\bmust[-\s]?visit\b/.test(t) || (t.includes("worth") && t.includes("visit")) },
      { id: "worth_visit", text: "Worth a visit", match: (t) => /\bworth (a |the )?visit\b/.test(t) },
      { id: "recommended", text: "Highly recommended", match: (t) => /\b(recommend|recommended)\b/.test(t) },
      { id: "good_choice", text: "Good visit choice", match: (t) => /\b(good choice|nice choice|great choice)\b/.test(t) },
      { id: "good_photos", text: "Great for photos", match: (t) => /\b(photo|photos|photography|picture|pictures|instagram)\b/.test(t) },
      { id: "good_views", text: "Great views", match: (t) => /\b(view|views|scenery|skyline)\b/.test(t) },
      { id: "beautiful", text: "Beautiful atmosphere", match: (t) => /\b(beautiful|stunning|gorgeous|lovely)\b/.test(t) },
      { id: "iconic", text: "Iconic landmark feel", match: (t) => /\b(iconic|landmark)\b/.test(t) },
      { id: "shopping", text: "Good shopping stop", match: (t) => /\b(shop|shopping|mall|stores?)\b/.test(t) },
      { id: "food", text: "Good food options", match: (t) => /\b(food|restaurant|restaurants|cafe|cafes|dining)\b/.test(t) },
      { id: "dessert", text: "Nice dessert / snack options", match: (t) => /\b(dessert|snack|snacks|coffee|tea)\b/.test(t) },
      { id: "family", text: "Family-friendly", match: (t) => /\b(family|kids|children)\b/.test(t) },
      { id: "couples", text: "Nice for couples", match: (t) => /\b(couple|date)\b/.test(t) },
      { id: "clean", text: "Clean and well-kept", match: (t) => /\b(clean|well kept|well-kept|maintained)\b/.test(t) },
      { id: "history", text: "Good for history lovers", match: (t) => /\b(history|historical|museum|heritage|exhibit)\b/.test(t) },
      { id: "location", text: "Convenient location", match: (t) => /\b(convenient|accessible|central|nearby|close)\b/.test(t) },
      { id: "easy_access", text: "Easy to access", match: (t) => /\b(easy to access|easy access|easy to reach)\b/.test(t) },
      { id: "public_transport", text: "Accessible by public transport", match: (t) => /\b(train|lrt|mrt|monorail|station|public transport)\b/.test(t) },
      { id: "walkable", text: "Walkable area", match: (t) => /\bwalkable|walking distance\b/.test(t) },
      { id: "spacious", text: "Spacious environment", match: (t) => /\b(spacious|wide|open space)\b/.test(t) },
      { id: "friendly_staff", text: "Friendly staff / service", match: (t) => /\b(friendly|helpful|staff|service|guide)\b/.test(t) },
      { id: "good_value", text: "Good value experience", match: (t) => /\b(value for money|worth the price|reasonable price)\b/.test(t) },
      { id: "night_visit", text: "Nice at night", match: (t) => /\b(at night|night view|nighttime|night time)\b/.test(t) },
      { id: "sunset", text: "Great for sunset views", match: (t) => /\b(sunset|golden hour)\b/.test(t) },
      { id: "relaxing", text: "Relaxing vibe", match: (t) => /\b(relaxing|peaceful|calm|chill)\b/.test(t) },
      { id: "kids_activity", text: "Good for kids activities", match: (t) => /\b(playground|kids activity|children activity)\b/.test(t) },
    ],
    negative: [
      { id: "crowded", text: "Can be crowded", match: (t) => /\b(crowd|crowded|busy|packed)\b/.test(t) },
      { id: "queue", text: "Long queues / waiting time", match: (t) => /\b(queue|queues|line|lines|wait|waiting)\b/.test(t) },
      { id: "expensive", text: "Can feel expensive", match: (t) => /\b(expensive|pricey|overpriced|costly)\b/.test(t) },
      { id: "limited_seating", text: "Limited seating at peak time", match: (t) => /\b(no seats|limited seating|seat)\b/.test(t) },
      { id: "parking", text: "Parking can be difficult", match: (t) => /\b(parking|park)\b/.test(t) },
      { id: "traffic", text: "Traffic around the area", match: (t) => /\b(traffic|jam)\b/.test(t) },
      { id: "hot", text: "Hot during daytime", match: (t) => /\b(hot|heat|humid|sun|sunny)\b/.test(t) },
      { id: "rain", text: "Rain can affect the visit", match: (t) => /\b(rain|rainy|wet)\b/.test(t) },
      { id: "peak_hours", text: "Better to avoid peak hours", match: (t) => /\b(peak|weekend|holiday)\b/.test(t) },
      { id: "closed", text: "Some areas may be closed", match: (t) => /\b(closed|closure|renovation|maintenance)\b/.test(t) },
      { id: "cleanliness", text: "Cleanliness may vary", match: (t) => /\b(dirty|smell|smelly|unclean)\b/.test(t) },
      { id: "service", text: "Service can be slow", match: (t) => /\b(slow service|slow|rude)\b/.test(t) },
      { id: "noisy", text: "Can get noisy", match: (t) => /\b(noisy|noise|loud)\b/.test(t) },
      { id: "overrated", text: "Some visitors find it overrated", match: (t) => /\b(overrated|not worth)\b/.test(t) },
      { id: "small", text: "Smaller than expected", match: (t) => /\b(small|smaller than expected)\b/.test(t) },
      { id: "limited_options", text: "Limited options in some areas", match: (t) => /\b(limited options|not many options|few options)\b/.test(t) },
      { id: "toilet", text: "Facilities may be inconvenient", match: (t) => /\b(toilet|restroom|washroom)\b/.test(t) },
      { id: "ticket", text: "Ticketing can take time", match: (t) => /\b(ticket|ticketing|booking)\b/.test(t) },
      { id: "staff_inconsistent", text: "Service quality may vary", match: (t) => /\b(unfriendly|staff attitude|poor service)\b/.test(t) },
    ],
  };

  const scorePhrases = (items, bucket) => {
    const counts = new Map();
    for (const review of sourceReviews) {
      const text = String(review.text || "").toLowerCase();
      const rating = Number(review.rating);
      const eligible =
        bucket === "positive"
          ? (!Number.isFinite(rating) || rating >= 3)
          : (!Number.isFinite(rating) ? false : rating <= 3);
      if (!eligible) continue;

      for (const item of items) {
        if (item.match(text)) {
          counts.set(item.id, (counts.get(item.id) || 0) + 1);
        }
      }
    }
    return counts;
  };

  const positiveCounts = scorePhrases(phraseCatalog.positive, "positive");
  const negativeCounts = scorePhrases(phraseCatalog.negative, "negative");

  const selectPhrases = (items, counts, limit = 4) =>
    items
      .map((item) => ({ ...item, count: counts.get(item.id) || 0 }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((item) => item.text);

  let positive = selectPhrases(phraseCatalog.positive, positiveCounts);
  let negative = selectPhrases(phraseCatalog.negative, negativeCounts);

  // Fallbacks if no phrase rules hit but reviews exist.
  if (!positive.length) {
    const posTokens = new Map();
    for (const review of sourceReviews) {
      const rating = Number(review.rating);
      if (Number.isFinite(rating) && rating < 4) continue;
      for (const token of new Set(tokenizeKeywords(review.text))) {
        posTokens.set(token, (posTokens.get(token) || 0) + 1);
      }
    }
    positive = [...posTokens.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([token]) => `Often mentioned: ${titleizeKeyword(token)}`);
  }

  if (!negative.length) {
    const negTokens = new Map();
    for (const review of sourceReviews) {
      const rating = Number(review.rating);
      if (!Number.isFinite(rating) || rating > 3) continue;
      for (const token of new Set(tokenizeKeywords(review.text))) {
        negTokens.set(token, (negTokens.get(token) || 0) + 1);
      }
    }
    negative = [...negTokens.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([token]) => `Watch out for: ${titleizeKeyword(token)}`);
  }

  return { positive, negative };
}

function pickReviewQuotes(rawReviews) {
  const MAX_QUOTES_PER_BUCKET = 1;
  const reviews = normalizeReviews(rawReviews).filter((item) => getWordCount(item.text) <= 150);
  if (!reviews.length) return { positive: [], negative: [] };
  const isEnglishReview = (item) => item.language === "en" || looksEnglish(item.text);
  const looksStrongNegative = (text) =>
    /\b(disappoint|disappointed|bad|terrible|awful|worst|not worth|avoid|dirty|rude|slow service|overpriced|poor)\b/i.test(
      String(text || "")
    );
  const looksStrongPositive = (text) =>
    /\b(highly recommend|must visit|great|amazing|awesome|excellent|love|beautiful|worth it)\b/i.test(String(text || ""));

  const positive = [];
  const negative = [];
  const positiveSeen = new Set();
  const negativeSeen = new Set();

  const appendUnique = (bucket, seen, item) => {
    const key = item.text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push(item.text);
  };

  const positiveCandidates = reviews.filter((item) => Number.isFinite(item.rating) && item.rating >= 4);
  const negativeCandidates = reviews.filter((item) => Number.isFinite(item.rating) && item.rating <= 2);
  const neutralCandidates = reviews.filter((item) => Number.isFinite(item.rating) && item.rating === 3);

  for (const pass of [true, false]) {
    for (const item of positiveCandidates) {
      if (positive.length >= MAX_QUOTES_PER_BUCKET) break;
      if (pass && !isEnglishReview(item)) continue;
      if (looksStrongNegative(item.text)) continue;
      appendUnique(positive, positiveSeen, item);
    }
  }

  for (const pass of [true, false]) {
    for (const item of negativeCandidates) {
      if (negative.length >= MAX_QUOTES_PER_BUCKET) break;
      if (pass && !isEnglishReview(item)) continue;
      if (looksStrongPositive(item.text)) continue;
      appendUnique(negative, negativeSeen, item);
    }
  }

  if (negative.length < MAX_QUOTES_PER_BUCKET) {
    for (const pass of [true, false]) {
      for (const item of neutralCandidates) {
        if (negative.length >= MAX_QUOTES_PER_BUCKET) break;
        if (pass && !isEnglishReview(item)) continue;
        if (looksStrongPositive(item.text)) continue;
        appendUnique(negative, negativeSeen, item);
      }
    }
  }

  // Final fallback: if classification is too strict for the returned review sample,
  // still surface some quotes so the panel is not empty.
  if (positive.length === 0) {
    const rankedHigh = [...reviews].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    for (const pass of [true, false]) {
      const rankedHighPool = pass ? rankedHigh : [...rankedHigh].sort(compareReviewBrevity);
      for (const item of rankedHighPool) {
        if (positive.length >= MAX_QUOTES_PER_BUCKET) break;
        if (pass && !isEnglishReview(item)) continue;
        if (looksStrongNegative(item.text)) continue;
        appendUnique(positive, positiveSeen, item);
      }
    }
  }

  if (negative.length === 0) {
    const rankedLow = reviews
      .filter((item) => Number.isFinite(item.rating) && item.rating <= 3)
      .sort((a, b) => (Number(a.rating) || 0) - (Number(b.rating) || 0));
    for (const pass of [true, false]) {
        const rankedLowPool = pass ? rankedLow : [...rankedLow].sort(compareReviewBrevity);
        for (const item of rankedLowPool) {
        if (negative.length >= MAX_QUOTES_PER_BUCKET) break;
        if (pass && !isEnglishReview(item)) continue;
        appendUnique(negative, negativeSeen, item);
      }
    }
  }

  // Do not duplicate the same quote across positive/negative sections.
  if (positive.length && negative.length) {
    const positiveSet = new Set(positive.map((text) => text.toLowerCase()));
    const filteredNegative = negative.filter((text) => !positiveSet.has(String(text).toLowerCase()));
    negative.length = 0;
    negative.push(...filteredNegative);

    if (negative.length < MAX_QUOTES_PER_BUCKET) {
      const rankedLow = reviews
        .filter((item) => Number.isFinite(item.rating) && item.rating <= 3)
        .sort((a, b) => (Number(a.rating) || 0) - (Number(b.rating) || 0));
      for (const pass of [true, false]) {
        const rankedLowPool = pass ? rankedLow : [...rankedLow].sort(compareReviewBrevity);
        for (const item of rankedLowPool) {
          if (negative.length >= MAX_QUOTES_PER_BUCKET) break;
          if (pass && !isEnglishReview(item)) continue;
          const lower = item.text.toLowerCase();
          if (positiveSet.has(lower) || negativeSeen.has(lower)) continue;
          if (looksStrongPositive(item.text)) continue;
          appendUnique(negative, negativeSeen, item);
        }
      }
    }
  }

  return { positive, negative };
}

function buildTextSearchQueries(poi) {
  const name = String(poi?.name || "").trim();
  const address = String(poi?.address || "").trim();
  return [
    [name, address, "Malaysia"].filter(Boolean).join(", "),
    [name, address].filter(Boolean).join(", "),
    [name, "Malaysia"].filter(Boolean).join(", "),
  ].filter(Boolean);
}

async function searchGooglePlaceId(poi, apiKey) {
  const queries = buildTextSearchQueries(poi);
  for (const query of queries) {
    const params = new URLSearchParams({
      query,
      key: apiKey,
      region: "my",
      language: "en",
    });
    const payload = await fetchJsonWithTimeout(`${GOOGLE_PLACES_TEXTSEARCH_ENDPOINT}?${params.toString()}`);
    const status = String(payload?.status || "");
    if (status === "ZERO_RESULTS") continue;
    if (status !== "OK") {
      throw new Error(payload?.error_message ? `${status}: ${payload.error_message}` : `Places status: ${status || "UNKNOWN"}`);
    }

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const exact = results.find((item) => {
      const resultName = String(item?.name || "").trim().toLowerCase();
      const targetName = String(poi?.name || "").trim().toLowerCase();
      return resultName && targetName && resultName === targetName;
    });
    const selected = exact || results[0];
    const placeId = String(selected?.place_id || "").trim();
    if (placeId) return placeId;
  }
  return null;
}

async function requestGooglePlaceDetails(placeId, apiKey, fields) {
  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    language: "en",
    fields: fields.join(","),
  });

  const payload = await fetchJsonWithTimeout(`${GOOGLE_PLACES_DETAILS_ENDPOINT}?${params.toString()}`);
  const status = String(payload?.status || "");
  if (status !== "OK") {
    throw new Error(payload?.error_message ? `${status}: ${payload.error_message}` : `Place details status: ${status || "UNKNOWN"}`);
  }
  return payload?.result || null;
}

async function fetchGooglePlaceDetails(placeId, apiKey) {
  const baseFields = ["place_id", "name", "rating", "user_ratings_total", "types", "reviews"];
  try {
    return await requestGooglePlaceDetails(placeId, apiKey, [
      ...baseFields,
      "editorial_summary",
      "formatted_address",
      "formatted_phone_number",
      "international_phone_number",
      "website",
      "url",
      "opening_hours",
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const mightBeFieldCompatibilityIssue =
      /editorial_summary|invalid field|unknown field|INVALID_REQUEST/i.test(message);
    if (!mightBeFieldCompatibilityIssue) throw error;
    return await requestGooglePlaceDetails(placeId, apiKey, [
      ...baseFields,
      "formatted_address",
      "formatted_phone_number",
      "international_phone_number",
      "website",
      "url",
      "opening_hours",
    ]);
  }
}

function normalizeGooglePlaceDetails(details, poi) {
  if (!details || typeof details !== "object") return null;
  const rating = Number(details.rating);
  const total = Number(details.user_ratings_total);
  const types = Array.isArray(details.types) ? details.types : [];
  const editorialSummary = typeof details?.editorial_summary?.overview === "string"
    ? details.editorial_summary.overview.trim()
    : "";
  const weekdayText = Array.isArray(details?.opening_hours?.weekday_text)
    ? details.opening_hours.weekday_text.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  return {
    place_id: String(details.place_id || "").trim() || String(poi?.google_place_id || "").trim() || null,
    rating: Number.isFinite(rating) ? rating : null,
    user_ratings_total: Number.isFinite(total) ? total : null,
    primary_type_label: formatTypeLabel(poi?.type || types[0] || "other"),
    introduction: editorialSummary || "",
    reviews: pickReviewQuotes(details.reviews),
    review_summary: buildKeywordReviewSummary(details.reviews),
    contact: {
      address: String(details?.formatted_address || poi?.address || "").trim() || null,
      phone: String(details?.formatted_phone_number || details?.international_phone_number || "").trim() || null,
      website: String(details?.website || "").trim() || null,
      google_maps_url: String(details?.url || "").trim() || null,
      open_now:
        typeof details?.opening_hours?.open_now === "boolean"
          ? details.opening_hours.open_now
          : null,
      opening_hours_weekday_text: weekdayText,
    },
  };
}

async function persistGooglePlaceId(poiId, googlePlaceId) {
  if (!poiId || !googlePlaceId) return;
  await pool.query(
    "UPDATE pois SET google_place_id = ? WHERE poi_id = ? AND (google_place_id IS NULL OR google_place_id = '')",
    [googlePlaceId, poiId]
  );
}

async function persistGooglePlaceCache(poiId, normalized) {
  await pool.query(
    `
    UPDATE pois
    SET google_place_cache_json = ?, google_place_cache_updated_at = NOW()
    WHERE poi_id = ?
    `,
    [JSON.stringify(normalized), poiId]
  );
}

function buildResponse({ poi, googlePlace, cached, cachedAt }) {
  return {
    poi: {
      poi_id: poi.poi_id,
      name: poi.name ?? "",
      type: poi.type ?? "other",
      address: poi.address ?? "",
      description: poi.description ?? "",
      image_url: poi.image_url ?? null,
      lat: poi.lat ?? null,
      lng: poi.lng ?? null,
    },
    google_place: googlePlace,
    source: {
      provider: "google_places",
      cached: Boolean(cached),
      cached_at: cachedAt ? new Date(cachedAt).toISOString() : null,
    },
  };
}

export async function getPoiPlaceDetailsWithCache(poiRow) {
  const poi = poiRow || {};
  const cachedPayload = safeJsonParse(poi.google_place_cache_json);
  const cachedAt = poi.google_place_cache_updated_at;

  if (cachedPayload && isCacheFresh(cachedAt)) {
    return buildResponse({
      poi,
      googlePlace: cachedPayload,
      cached: true,
      cachedAt,
    });
  }

  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey || typeof fetch !== "function") {
    if (cachedPayload) {
      return buildResponse({ poi, googlePlace: cachedPayload, cached: true, cachedAt });
    }
    throw new Error("Google Places API is not configured");
  }

  let placeId = String(poi.google_place_id || "").trim();
  try {
    if (!placeId) {
      placeId = await searchGooglePlaceId(poi, apiKey);
      if (placeId) {
        await persistGooglePlaceId(poi.poi_id, placeId);
      }
    }

    if (!placeId) {
      if (cachedPayload) {
        return buildResponse({ poi, googlePlace: cachedPayload, cached: true, cachedAt });
      }
      return buildResponse({
        poi,
        googlePlace: {
          place_id: null,
          rating: null,
          user_ratings_total: null,
          primary_type_label: formatTypeLabel(poi.type || "other"),
          introduction: "",
          reviews: { positive: [], negative: [] },
          review_summary: { positive: [], negative: [] },
          contact: {
            address: String(poi?.address || "").trim() || null,
            phone: null,
            website: null,
            google_maps_url: null,
            open_now: null,
            opening_hours_weekday_text: [],
          },
        },
        cached: false,
        cachedAt: null,
      });
    }

    const details = await fetchGooglePlaceDetails(placeId, apiKey);
    const normalized = normalizeGooglePlaceDetails({ ...details, place_id: placeId }, poi) || {
      place_id: placeId,
      rating: null,
      user_ratings_total: null,
      primary_type_label: formatTypeLabel(poi.type || "other"),
      introduction: "",
      reviews: { positive: [], negative: [] },
    };

    await persistGooglePlaceCache(poi.poi_id, normalized);
    return buildResponse({
      poi: { ...poi, google_place_id: placeId },
      googlePlace: normalized,
      cached: false,
      cachedAt: new Date(),
    });
  } catch (error) {
    if (cachedPayload) {
      return buildResponse({ poi, googlePlace: cachedPayload, cached: true, cachedAt });
    }
    throw error;
  }
}

