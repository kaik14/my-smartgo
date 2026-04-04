const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const WEATHER_TIMEOUT_MS = 8000;

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

async function fetchJsonWithTimeout(url, timeoutMs = WEATHER_TIMEOUT_MS) {
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

function pickMalaysiaResult(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const malaysia = results.find((item) => String(item?.country_code || "").toUpperCase() === "MY");
  return malaysia || results[0] || null;
}

async function geocodeDestination(destination) {
  const name = String(destination || "").trim();
  if (!name) return null;

  const params = new URLSearchParams({
    name,
    count: "5",
    language: "en",
    format: "json",
  });

  const payload = await fetchJsonWithTimeout(`${GEOCODE_ENDPOINT}?${params.toString()}`);
  const selected = pickMalaysiaResult(payload?.results);
  const lat = Number(selected?.latitude);
  const lng = Number(selected?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatWeatherLine(dateText, label, minTemp, maxTemp) {
  const parts = [];
  if (dateText) parts.push(dateText);
  if (label) parts.push(label);
  const minNum = Number(minTemp);
  const maxNum = Number(maxTemp);
  if (Number.isFinite(minNum) && Number.isFinite(maxNum)) {
    parts.push(`${Math.round(minNum)}-${Math.round(maxNum)}C`);
  }
  return parts.join(" | ");
}

function normalizeDailyWeather(payload) {
  const times = Array.isArray(payload?.daily?.time) ? payload.daily.time : [];
  const maxTemps = Array.isArray(payload?.daily?.temperature_2m_max) ? payload.daily.temperature_2m_max : [];
  const minTemps = Array.isArray(payload?.daily?.temperature_2m_min) ? payload.daily.temperature_2m_min : [];
  const weatherCodes = Array.isArray(payload?.daily?.weather_code) ? payload.daily.weather_code : [];

  return times.map((dateText, index) => ({
    date: dateText,
    weatherCode: weatherCodes[index],
    label: getWeatherCodeLabel(weatherCodes[index]),
    min: minTemps[index],
    max: maxTemps[index],
  }));
}

export async function getTripWeatherSummary({ destination, startDate, endDate }) {
  if (typeof fetch !== "function") {
    return { summaryText: "Weather unavailable", days: [] };
  }
  const coords = await geocodeDestination(destination);
  if (!coords) return { summaryText: "Weather unavailable", days: [] };

  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lng),
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    start_date: String(startDate || "").slice(0, 10),
    end_date: String(endDate || "").slice(0, 10),
  });

  const payload = await fetchJsonWithTimeout(`${FORECAST_ENDPOINT}?${params.toString()}`);
  const days = normalizeDailyWeather(payload);

  if (!days.length) return { summaryText: "Weather unavailable", days: [] };
  const lines = days.map((day) => formatWeatherLine(day.date, day.label, day.min, day.max));
  return { summaryText: lines.join("\n"), days };
}

export function getWeatherLineForDate(days, targetDate) {
  const dateText = String(targetDate || "").slice(0, 10);
  const day = Array.isArray(days) ? days.find((item) => item?.date === dateText) : null;
  if (!day) return "Weather unavailable";
  return formatWeatherLine(day.date, day.label, day.min, day.max) || "Weather unavailable";
}
