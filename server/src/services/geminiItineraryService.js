import { GoogleGenerativeAI } from "@google/generative-ai";

// 推荐的 2026 年最新稳定标识符
const FALLBACK_GEMINI_MODELS = [
  "gemini-3.1-flash",       // 目前最推荐的 3.1 版本
  "gemini-3-flash-preview", // 3.0 系列的预览版 ID
  "gemini-2.5-flash"        // 最后的保底（注意：此模型将于 2026年6月下架）
];
const GEMINI_RETRY_DELAYS_MS = [1000, 2500, 5000];

function buildPrompt({ destination, startDate, endDate, preferences, description, note }) {
  return `
You are a travel itinerary planner.
Generate a Malaysia-focused trip itinerary and return ONLY valid JSON.

Requirements:
- Destination: ${destination}
- Trip dates: ${startDate} to ${endDate}
- Preferences: ${preferences || "not specified"}
- Trip description: ${description || "not specified"}
- Trip note: ${note || "not specified"}
- The number of days MUST equal the inclusive date range from start to end.
- Each day must contain 3 to 6 POIs.
- Prefer places in Malaysia.
- Avoid duplicate or near-duplicate POIs across different days.
- Treat places in the same complex / landmark area as ONE visit block on the SAME day when possible (example: Petronas Twin Towers, Suria KLCC, KLCC Park).
- Do NOT split the same landmark complex across multiple days unless the user explicitly asks for repeat visits.
- If two POIs are part of the same area, combine them into one day and mention both in that day's POIs/notes instead of repeating across days.
- Use 24-hour HH:MM format for startTime.
- durationMin must be an integer (minutes).
- Use field name "address" (NOT "location").
- No markdown, no explanation, no extra fields, no trailing commas.

Return JSON exactly matching this schema:
{
  "title": "string",
  "destination": "string",
  "days": [
    {
      "dayNumber": 1,
      "summary": "string",
      "pois": [
        {
          "name": "string",
          "type": "attraction|food|shopping|nature|culture|museum|beach|nightlife|other",
          "address": "string",
          "description": "string",
          "startTime": "09:00",
          "durationMin": 60,
          "note": "string"
        }
      ]
    }
  ]
}
`.trim();
}

function buildTripChatPrompt({ trip, itinerarySummary, history, userMessage }) {
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-12)
        .map((item) => {
          const role = item?.role === "assistant" ? "assistant" : "user";
          const content = String(item?.content || "").trim();
          if (!content) return null;
          return `${role}: ${content}`;
        })
        .filter(Boolean)
        .join("\n")
    : "";

  return `
You are SmartGo's travel planning assistant for an existing trip.
Reply in concise, helpful plain text (no markdown table, no JSON).

Trip context:
- Destination: ${trip?.destination || "not specified"}
- Dates: ${trip?.startDate || "unknown"} to ${trip?.endDate || "unknown"}
- Preferences: ${trip?.preferences || "not specified"}
- Trip description: ${trip?.description || "not specified"}
- Trip note: ${trip?.note || "not specified"}

Current itinerary summary:
${itinerarySummary || "No itinerary yet."}

Recent chat history:
${safeHistory || "(none)"}

Latest user request:
${String(userMessage || "").trim() || "(empty)"}

Instructions:
- Keep suggestions consistent with the existing trip style and destination.
- If the user asks to change the route, suggest concrete replacements or ordering changes.
- Avoid suggesting duplicate POIs across different days, especially places in the same complex/area (e.g., Suria KLCC and Petronas Twin Towers should usually be planned together).
- If information is missing, ask one short clarifying question.
- Mention tradeoffs briefly when relevant (time, distance, opening hours uncertainty).
`.trim();
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("Gemini returned empty response");
  }

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned non-JSON content");
  }
}

function getErrorStatus(error) {
  return Number(
    error?.status ||
    error?.response?.status ||
    error?.cause?.status ||
    error?.cause?.response?.status
  ) || 0;
}

function isModelNotFoundError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || "").toLowerCase();
  return (
    status === 404 ||
    (message.includes("not found") &&
      (message.includes("models/") || message.includes("model ")))
  );
}

function isRetryableGeminiError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || "").toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    message.includes("high demand") ||
    message.includes("service unavailable") ||
    message.includes("rate limit")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContentWithRetry(model, prompt, modelName) {
  let lastError = null;

  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) {
        throw error;
      }

      if (attempt >= GEMINI_RETRY_DELAYS_MS.length) break;

      const delayMs = GEMINI_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[Gemini retry] model=${modelName} attempt=${attempt + 1} status=${getErrorStatus(error) || "unknown"} retry_in_ms=${delayMs}`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function getModelCandidates() {
  return [process.env.GEMINI_MODEL, ...FALLBACK_GEMINI_MODELS].filter(
    (value, index, arr) => value && arr.indexOf(value) === index
  );
}

export async function generateItinerary({
  destination,
  startDate,
  endDate,
  preferences,
  description,
  note,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in server environment");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt({
    destination,
    startDate,
    endDate,
    preferences,
    description,
    note,
  });

  const candidates = getModelCandidates();
  const triedModelErrors = [];
  const retryableModelErrors = [];

  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      });

      const result = await generateContentWithRetry(model, prompt, modelName);
      const responseText = result?.response?.text?.();
      return parseModelJson(responseText);
    } catch (error) {
      if (isModelNotFoundError(error)) {
        triedModelErrors.push(`${modelName}: ${error?.message || "not found"}`);
        continue;
      }
      if (isRetryableGeminiError(error)) {
        retryableModelErrors.push(`${modelName}: ${error?.message || "temporary overload"}`);
        continue;
      }
      throw error;
    }
  }

  if (retryableModelErrors.length > 0) {
    throw new Error(
      `Gemini service is busy (temporary 429/503). Please retry in 30-60 seconds. Tried: ${candidates.join(", ")}.` +
        ` Last temporary errors: ${retryableModelErrors.join(" | ")}`
    );
  }

  throw new Error(
    `No available Gemini model worked. Tried: ${candidates.join(", ")}. Set GEMINI_MODEL in server/.env to a currently supported model.` +
      (triedModelErrors.length ? ` Last errors: ${triedModelErrors.join(" | ")}` : "")
  );
}

function buildSingleDayPrompt({
  destination,
  startDate,
  endDate,
  preferences,
  description,
  note,
  dayNumber,
  itinerarySummary,
  userRequest,
}) {
  return `
You are a travel itinerary planner.
Generate ONLY ONE DAY of a Malaysia-focused itinerary and return ONLY valid JSON.

Trip context:
- Destination: ${destination}
- Trip dates: ${startDate} to ${endDate}
- Preferences: ${preferences || "not specified"}
- Trip description: ${description || "not specified"}
- Trip note: ${note || "not specified"}
- Current itinerary summary: ${itinerarySummary || "none"}
- Day to generate: Day ${dayNumber}
- User request for this edit: ${userRequest || "not specified"}

Requirements:
- Return exactly one day object for dayNumber=${dayNumber}
- Keep style consistent with the trip context
- Respect the user's edit request for this day when possible
- 3 to 6 POIs
- Prefer places in Malaysia
- Avoid duplicates with places already present in other days of the itinerary summary
- Treat same-complex / same-area POIs as one visit block on the same day when possible (e.g., Petronas Twin Towers + Suria KLCC + KLCC Park)
- Do not add a POI that is essentially the same visit area as an existing POI on another day, unless the user explicitly requests a repeat visit
- Use 24-hour HH:MM format for startTime
- durationMin must be an integer
- Use field name "address" (NOT "location")
- No markdown, no explanation, no extra fields, no trailing commas

Return JSON exactly matching this schema:
{
  "dayNumber": ${dayNumber},
  "summary": "string",
  "pois": [
    {
      "name": "string",
      "type": "attraction|food|shopping|nature|culture|museum|beach|nightlife|other",
      "address": "string",
      "description": "string",
      "startTime": "09:00",
      "durationMin": 60,
      "note": "string"
    }
  ]
}
`.trim();
}

export async function generateTripAssistantReply({
  trip,
  itinerarySummary,
  history,
  userMessage,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in server environment");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const prompt = buildTripChatPrompt({
    trip,
    itinerarySummary,
    history,
    userMessage,
  });

  const candidates = getModelCandidates();
  const triedModelErrors = [];
  const retryableModelErrors = [];

  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.6,
        },
      });

      const result = await generateContentWithRetry(model, prompt, modelName);
      const responseText = String(result?.response?.text?.() || "").trim();
      if (!responseText) {
        throw new Error("Gemini returned empty chat response");
      }
      return responseText;
    } catch (error) {
      if (isModelNotFoundError(error)) {
        triedModelErrors.push(`${modelName}: ${error?.message || "not found"}`);
        continue;
      }
      if (isRetryableGeminiError(error)) {
        retryableModelErrors.push(`${modelName}: ${error?.message || "temporary overload"}`);
        continue;
      }
      throw error;
    }
  }

  if (retryableModelErrors.length > 0) {
    throw new Error(
      `Gemini service is busy (temporary 429/503). Please retry in 30-60 seconds. Tried: ${candidates.join(", ")}.` +
        ` Last temporary errors: ${retryableModelErrors.join(" | ")}`
    );
  }

  throw new Error(
    `No available Gemini model worked. Tried: ${candidates.join(", ")}. Set GEMINI_MODEL in server/.env to a currently supported model.` +
      (triedModelErrors.length ? ` Last errors: ${triedModelErrors.join(" | ")}` : "")
  );
}

export async function streamTripAssistantReply({
  trip,
  itinerarySummary,
  history,
  userMessage,
  onChunk,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in server environment");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const prompt = buildTripChatPrompt({
    trip,
    itinerarySummary,
    history,
    userMessage,
  });

  const candidates = getModelCandidates();
  const triedModelErrors = [];
  const retryableModelErrors = [];

  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.6,
        },
      });

      if (typeof model.generateContentStream !== "function") {
        const full = await generateTripAssistantReply({ trip, itinerarySummary, history, userMessage });
        if (typeof onChunk === "function" && full) onChunk(full);
        return full;
      }

      const streamResult = await model.generateContentStream(prompt);
      let fullText = "";

      for await (const chunk of streamResult.stream) {
        const chunkText = String(chunk?.text?.() || "");
        if (!chunkText) continue;
        fullText += chunkText;
        if (typeof onChunk === "function") onChunk(chunkText);
      }

      if (!fullText.trim()) {
        const finalResp = await streamResult.response;
        fullText = String(finalResp?.text?.() || "").trim();
        if (typeof onChunk === "function" && fullText) onChunk(fullText);
      }

      if (!fullText.trim()) {
        throw new Error("Gemini returned empty chat response");
      }

      return fullText.trim();
    } catch (error) {
      if (isModelNotFoundError(error)) {
        triedModelErrors.push(`${modelName}: ${error?.message || "not found"}`);
        continue;
      }
      if (isRetryableGeminiError(error)) {
        retryableModelErrors.push(`${modelName}: ${error?.message || "temporary overload"}`);
        continue;
      }
      throw error;
    }
  }

  if (retryableModelErrors.length > 0) {
    throw new Error(
      `Gemini service is busy (temporary 429/503). Please retry in 30-60 seconds. Tried: ${candidates.join(", ")}.` +
        ` Last temporary errors: ${retryableModelErrors.join(" | ")}`
    );
  }

  throw new Error(
    `No available Gemini model worked. Tried: ${candidates.join(", ")}. Set GEMINI_MODEL in server/.env to a currently supported model.` +
      (triedModelErrors.length ? ` Last errors: ${triedModelErrors.join(" | ")}` : "")
  );
}

export async function generateSingleDayItinerary({
  destination,
  startDate,
  endDate,
  preferences,
  description,
  note,
  dayNumber,
  itinerarySummary,
  userRequest,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in server environment");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const prompt = buildSingleDayPrompt({
    destination,
    startDate,
    endDate,
    preferences,
    description,
    note,
    dayNumber,
    itinerarySummary,
    userRequest,
  });

  const candidates = getModelCandidates();
  const triedModelErrors = [];
  const retryableModelErrors = [];

  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.45,
          responseMimeType: "application/json",
        },
      });

      const result = await generateContentWithRetry(model, prompt, modelName);
      const responseText = result?.response?.text?.();
      return parseModelJson(responseText);
    } catch (error) {
      if (isModelNotFoundError(error)) {
        triedModelErrors.push(`${modelName}: ${error?.message || "not found"}`);
        continue;
      }
      if (isRetryableGeminiError(error)) {
        retryableModelErrors.push(`${modelName}: ${error?.message || "temporary overload"}`);
        continue;
      }
      throw error;
    }
  }

  if (retryableModelErrors.length > 0) {
    throw new Error(
      `Gemini service is busy (temporary 429/503). Please retry in 30-60 seconds. Tried: ${candidates.join(", ")}.` +
        ` Last temporary errors: ${retryableModelErrors.join(" | ")}`
    );
  }

  throw new Error(
    `No available Gemini model worked. Tried: ${candidates.join(", ")}. Set GEMINI_MODEL in server/.env to a currently supported model.` +
      (triedModelErrors.length ? ` Last errors: ${triedModelErrors.join(" | ")}` : "")
  );
}
