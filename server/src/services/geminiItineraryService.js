import { GoogleGenerativeAI } from "@google/generative-ai";

// 推荐的 2026 年最新稳定标识符
const FALLBACK_GEMINI_MODELS = [
  "gemini-3.1-flash",       // 目前最推荐的 3.1 版本
  "gemini-3-flash-preview", // 3.0 系列的预览版 ID
  "gemini-2.5-flash"        // 最后的保底（注意：此模型将于 2026年6月下架）
];

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

function isModelNotFoundError(error) {
  const status = error?.status || error?.response?.status;
  const message = String(error?.message || "").toLowerCase();
  return (
    status === 404 ||
    (message.includes("not found") &&
      (message.includes("models/") || message.includes("model ")))
  );
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

  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent(prompt);
      const responseText = result?.response?.text?.();
      return parseModelJson(responseText);
    } catch (error) {
      if (isModelNotFoundError(error)) {
        triedModelErrors.push(`${modelName}: ${error?.message || "not found"}`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `No available Gemini model worked. Tried: ${candidates.join(", ")}. Set GEMINI_MODEL in server/.env to a currently supported model.` +
      (triedModelErrors.length ? ` Last errors: ${triedModelErrors.join(" | ")}` : "")
  );
}
