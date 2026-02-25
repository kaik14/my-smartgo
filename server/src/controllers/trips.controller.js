import { z } from "zod";
import pool from "../config/db.js";
import {
  generateItinerary,
  generateSingleDayItinerary,
  streamTripAssistantReply,
  generateTripAssistantReply,
} from "../services/geminiItineraryService.js";
import { geocodePoiCoordinates, getDestinationCoverImageUrl } from "../services/googleGeocodingService.js";

function getUserId(req) {
  const raw = req.body?.user_id ?? req.query?.user_id ?? req.headers["x-user-id"];
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return userId;
}

function normalizeTripPreferences(input) {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return values.length ? values : null;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeTripPreferences(parsed);
      }
    } catch {
      // fall back to comma-separated parsing
    }

    const values = trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return values.length ? values : null;
  }

  return null;
}

function hasValidCoordinates(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function isLikelyMalaysiaCoordinates(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;

  // Covers Peninsular + East Malaysia with a small buffer.
  return latNum >= 0 && latNum <= 8.5 && lngNum >= 99 && lngNum <= 120;
}

async function backfillMissingTripPoiCoordinates(rows, destination, tripId) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const geocodeCache = new Map();
  const updatedPoiIds = new Set();

  for (const row of rows) {
    if (row?.poi_id == null) continue;
    if (updatedPoiIds.has(row.poi_id)) continue;
    const hasCoords = hasValidCoordinates(row.lat, row.lng);
    const hasValidMalaysiaCoords = hasCoords && isLikelyMalaysiaCoordinates(row.lat, row.lng);
    if (hasValidMalaysiaCoords) continue;

    const cacheKey = `${String(row.name || "").trim().toLowerCase()}|${String(row.address || "").trim().toLowerCase()}|${String(destination || "").trim().toLowerCase()}`;
    let coords = geocodeCache.get(cacheKey);

    if (coords === undefined) {
      try {
        coords = await geocodePoiCoordinates({
          name: row.name,
          address: row.address,
          destination,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Unknown geocode error");
        console.warn(
          `[Trip detail geocode] tripId=${tripId} poiId=${row.poi_id} poi="${row.name}" address="${row.address}" error=${message}`
        );
        coords = null;
      }
      geocodeCache.set(cacheKey, coords);
    }

    if (!coords) {
      if (hasCoords) {
        try {
          await pool.query("UPDATE pois SET lat = NULL, lng = NULL WHERE poi_id = ?", [row.poi_id]);
          updatedPoiIds.add(row.poi_id);
          for (const candidate of rows) {
            if (candidate?.poi_id === row.poi_id) {
              candidate.lat = null;
              candidate.lng = null;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || "Unknown DB clear error");
          console.warn(
            `[Trip detail geocode clear] tripId=${tripId} poiId=${row.poi_id} error=${message}`
          );
        }
      }
      continue;
    }

    try {
      await pool.query("UPDATE pois SET lat = ?, lng = ? WHERE poi_id = ?", [coords.lat, coords.lng, row.poi_id]);
      updatedPoiIds.add(row.poi_id);

      for (const candidate of rows) {
        if (candidate?.poi_id === row.poi_id) {
          candidate.lat = coords.lat;
          candidate.lng = coords.lng;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Unknown DB update error");
      console.warn(
        `[Trip detail geocode update] tripId=${tripId} poiId=${row.poi_id} error=${message}`
      );
    }
  }
}

function parseTripPreferences(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return normalizeTripPreferences(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeTripPreferences(parsed);
    } catch {
      return normalizeTripPreferences(trimmed);
    }
    return null;
  }

  if (typeof value === "object") {
    // mysql JSON columns may be returned as parsed object/array depending on config
    if (Array.isArray(value)) return normalizeTripPreferences(value);
  }

  return null;
}

function buildItinerarySummaryText(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "No itinerary days yet.";

  const dayMap = new Map();
  for (const row of rows) {
    if (row?.day_id == null) continue;
    if (!dayMap.has(row.day_id)) {
      dayMap.set(row.day_id, {
        dayNumber: row.day_number,
        items: [],
      });
    }
    if (row?.day_poi_id == null || !row?.name) continue;
    dayMap.get(row.day_id).items.push({
      name: row.name,
      address: row.address || "",
      startTime: row.start_time || "",
      durationMin: row.duration_min ?? null,
      order: row.visit_order ?? 0,
    });
  }

  const dayLines = Array.from(dayMap.values())
    .sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber))
    .map((day) => {
      const pois = day.items
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((poi) => {
          const time = poi.startTime ? `${poi.startTime} ` : "";
          const duration = Number.isFinite(Number(poi.durationMin)) ? ` (${poi.durationMin}m)` : "";
          const address = poi.address ? ` - ${poi.address}` : "";
          return `${time}${poi.name}${duration}${address}`;
        });
      return `Day ${day.dayNumber}: ${pois.length ? pois.join(" -> ") : "No POIs yet"}`;
    });

  return dayLines.length ? dayLines.join("\n") : "No itinerary days yet.";
}

export async function createTrip(req, res) {
  try {
    const { title, destination, start_date, end_date, preferences, description, note } = req.body;
    const userId = getUserId(req);
    const normalizedPreferences = normalizeTripPreferences(preferences);

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO trips (title, destination, start_date, end_date, preferences, description, note, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title,
        destination,
        start_date,
        end_date,
        normalizedPreferences ? JSON.stringify(normalizedPreferences) : null,
        description ?? null,
        note ?? null,
        userId,
      ]
    );

    res.json({
      message: "Trip created successfully",
      trip_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to create trip" });
  }
}

const AI_POI_TYPES = [
  "attraction",
  "food",
  "shopping",
  "nature",
  "culture",
  "museum",
  "beach",
  "nightlife",
  "other",
];

const aiPoiSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(AI_POI_TYPES),
    address: z.string().min(1),
    description: z.string().min(1),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    durationMin: z.number().int().positive(),
    note: z.string().optional(),
  })
  .strict();

const aiDaySchema = z
  .object({
    dayNumber: z.number().int().positive(),
    summary: z.string().min(1),
    pois: z.array(aiPoiSchema).min(3).max(6),
  })
  .strict();

const aiItinerarySchema = z
  .object({
    title: z.string().min(1),
    destination: z.string().min(1),
    days: z.array(aiDaySchema).min(1),
  })
  .strict();

function toYmd(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function enumerateDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function validateGeneratedItineraryAgainstTrip(itinerary, trip) {
  const startDate = toYmd(trip.start_date);
  const endDate = toYmd(trip.end_date);
  const expectedDates = enumerateDateRange(startDate, endDate);

  if (!expectedDates.length) {
    throw new Error("Trip date range is invalid");
  }

  if (itinerary.days.length !== expectedDates.length) {
    throw new Error("AI itinerary day count does not match trip date range");
  }

  for (let i = 0; i < itinerary.days.length; i += 1) {
    const day = itinerary.days[i];
    const expectedDayNumber = i + 1;

    if (day.dayNumber !== expectedDayNumber) {
      throw new Error(`AI itinerary dayNumber must be continuous (expected ${expectedDayNumber})`);
    }
  }
}

async function upsertAiPoiForDay(connection, { tripId, destination, dayNumber, dayId, poi, visitOrder }) {
  let geocodedCoords = null;
  try {
    geocodedCoords = await geocodePoiCoordinates({
      name: poi.name,
      address: poi.address,
      destination,
    });
  } catch (geocodeError) {
    const message = geocodeError instanceof Error ? geocodeError.message : String(geocodeError || "Unknown geocode error");
    console.warn(`[AI day generate geocode] tripId=${tripId} day=${dayNumber} poi="${poi.name}" address="${poi.address}" error=${message}`);
  }

  const [existingPoiRows] = await connection.query(
    "SELECT poi_id, lat, lng FROM pois WHERE name = ? AND address = ? LIMIT 1",
    [poi.name, poi.address]
  );

  let poiId;
  if (existingPoiRows.length > 0) {
    const existingPoi = existingPoiRows[0];
    poiId = existingPoi.poi_id;

    if (geocodedCoords) {
      await connection.query(
        "UPDATE pois SET type = ?, description = ?, lat = ?, lng = ? WHERE poi_id = ?",
        [poi.type, poi.description, geocodedCoords.lat, geocodedCoords.lng, poiId]
      );
    } else {
      await connection.query(
        "UPDATE pois SET type = ?, description = ? WHERE poi_id = ?",
        [poi.type, poi.description, poiId]
      );
    }
  } else {
    const [poiInsert] = await connection.query(
      "INSERT INTO pois (name, type, address, description, lat, lng) VALUES (?, ?, ?, ?, ?, ?)",
      [
        poi.name,
        poi.type,
        poi.address,
        poi.description,
        geocodedCoords?.lat ?? null,
        geocodedCoords?.lng ?? null,
      ]
    );
    poiId = poiInsert.insertId;
  }

  await connection.query(
    `
    INSERT INTO day_poi (day_id, poi_id, visit_order, note, start_time, duration_min)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [dayId, poiId, visitOrder, poi.note?.trim() || null, poi.startTime, poi.durationMin]
  );
}

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map((row) => row.Field));
}

function pickExisting(columns, candidates) {
  return candidates.find((name) => columns.has(name)) ?? null;
}

function buildTripSelectColumns(tripsColumns) {
  const selected = ["trip_id", "title", "destination", "start_date", "end_date", "user_id"];
  for (const col of ["preferences", "description", "cover_image_url", "note", "created_at"]) {
    if (tripsColumns.has(col)) selected.push(col);
  }
  return selected;
}

async function ensureTripCoverImageIfMissing(connection, trip) {
  const tripId = Number(trip?.trip_id);
  const destination = String(trip?.destination || "").trim();
  const currentCover = String(trip?.cover_image_url || "").trim();
  if (!Number.isInteger(tripId) || tripId <= 0 || !destination || currentCover) return;

  try {
    const coverUrl = await getDestinationCoverImageUrl(destination);
    if (!coverUrl) return;
    await connection.query(
      "UPDATE trips SET cover_image_url = ? WHERE trip_id = ? AND (cover_image_url IS NULL OR cover_image_url = '')",
      [coverUrl, tripId]
    );
    trip.cover_image_url = coverUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown cover image error");
    console.warn(`[Trip cover image] tripId=${tripId} destination="${destination}" error=${message}`);
  }
}

export async function getTrips(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.json([]);
    }

    const [rows] = await pool.query(
      "SELECT trip_id, title, destination, start_date, end_date, description, cover_image_url, note, created_at FROM trips WHERE user_id = ? ORDER BY trip_id DESC",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
}

export async function updateTrip(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const allowed = ["title", "destination", "start_date", "end_date", "description", "cover_image_url", "note"];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(tripId, userId);
    const [result] = await pool.query(
      `UPDATE trips SET ${fields.join(", ")} WHERE trip_id = ? AND user_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    return res.json({ message: "Trip updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update trip" });
  }
}

export async function createOrGetTripDay(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    const dayNumber = Number(req.body?.day_number);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }
    if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
      return res.status(400).json({ error: "Invalid day_number" });
    }

    const [tripRows] = await pool.query(
      "SELECT trip_id FROM trips WHERE trip_id = ? AND user_id = ? LIMIT 1",
      [tripId, userId]
    );
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const [existingRows] = await pool.query(
      "SELECT day_id, day_number FROM itinerary_days WHERE trip_id = ? AND day_number = ? LIMIT 1",
      [tripId, dayNumber]
    );
    if (existingRows.length > 0) {
      return res.json({
        success: true,
        created: false,
        day_id: existingRows[0].day_id,
        day_number: existingRows[0].day_number,
      });
    }

    const [insertResult] = await pool.query(
      "INSERT INTO itinerary_days (trip_id, day_number) VALUES (?, ?)",
      [tripId, dayNumber]
    );

    return res.json({
      success: true,
      created: true,
      day_id: insertResult.insertId,
      day_number: dayNumber,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create trip day" });
  }
}

export async function deleteTrip(req, res) {
  let connection;
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [tripRows] = await connection.query(
      "SELECT trip_id FROM trips WHERE trip_id = ? AND user_id = ? LIMIT 1",
      [tripId, userId]
    );

    if (tripRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Trip not found" });
    }

    const [dayRows] = await connection.query(
      "SELECT day_id FROM itinerary_days WHERE trip_id = ?",
      [tripId]
    );
    const dayIds = dayRows.map((row) => row.day_id).filter((id) => id != null);

    if (dayIds.length > 0) {
      await connection.query(
        `DELETE FROM day_poi WHERE day_id IN (${dayIds.map(() => "?").join(",")})`,
        dayIds
      );
    }

    // Best-effort cleanup for any other tables that directly reference trips.trip_id.
    // This avoids FK failures when new trip-related tables are added without ON DELETE CASCADE.
    const [tripRefTables] = await connection.query(
      `
      SELECT c.TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS c
      INNER JOIN INFORMATION_SCHEMA.TABLES t
        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
       AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.COLUMN_NAME = 'trip_id'
        AND c.TABLE_NAME NOT IN ('trips', 'itinerary_days')
        AND t.TABLE_TYPE = 'BASE TABLE'
      `
    );

    for (const row of tripRefTables) {
      const tableName = row.TABLE_NAME;
      if (!tableName) continue;
      await connection.query(`DELETE FROM \`${tableName}\` WHERE trip_id = ?`, [tripId]);
    }

    await connection.query("DELETE FROM itinerary_days WHERE trip_id = ?", [tripId]);
    await connection.query("DELETE FROM trips WHERE trip_id = ? AND user_id = ?", [tripId, userId]);

    await connection.commit();
    return res.json({ message: "Trip deleted successfully" });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
    }
    console.error(err);
    return res.status(500).json({
      error: err?.code === "ER_ROW_IS_REFERENCED_2" ? "Trip is referenced by other data" : "Failed to delete trip",
      detail: err?.message || null,
    });
  } finally {
    if (connection) connection.release();
  }
}

export async function generateAiTripItinerary(req, res) {
  let connection;
  let transactionActive = false;
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const bodyPreferences = normalizeTripPreferences(req.body?.preferences);
    const userRequest = String(req.body?.user_request || "").trim();

    connection = await pool.getConnection();
    const [tripRows] = await connection.query(
      `
      SELECT
        trip_id,
        user_id,
        title,
        destination,
        start_date,
        end_date,
        preferences,
        description,
        cover_image_url,
        created_at,
        note
      FROM trips
      WHERE trip_id = ?
      LIMIT 1
      `,
      [tripId]
    );

    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const trip = tripRows[0];
    await ensureTripCoverImageIfMissing(connection, trip);
    const tripPreferences = parseTripPreferences(trip.preferences);
    const effectivePreferencesList = bodyPreferences ?? tripPreferences ?? [];
    const transientNote = userRequest
      ? [String(trip.note || "").trim(), `[AI Chat Request]\n${userRequest}`].filter(Boolean).join("\n\n")
      : (trip.note ?? "");

    const itineraryRaw = await generateItinerary({
      destination: trip.destination,
      startDate: toYmd(trip.start_date),
      endDate: toYmd(trip.end_date),
      preferences: effectivePreferencesList.join(", "),
      description: trip.description ?? "",
      note: transientNote,
    });

    const validated = aiItinerarySchema.parse(itineraryRaw);
    validateGeneratedItineraryAgainstTrip(validated, trip);

    await connection.beginTransaction();
    transactionActive = true;

    const [existingDays] = await connection.query(
      "SELECT day_id FROM itinerary_days WHERE trip_id = ?",
      [tripId]
    );
    const dayIds = existingDays.map((row) => row.day_id).filter((id) => id != null);

    if (dayIds.length > 0) {
      await connection.query(
        `DELETE FROM day_poi WHERE day_id IN (${dayIds.map(() => "?").join(",")})`,
        dayIds
      );
    }
    await connection.query("DELETE FROM itinerary_days WHERE trip_id = ?", [tripId]);

    if (bodyPreferences) {
      await connection.query("UPDATE trips SET preferences = ? WHERE trip_id = ?", [
        JSON.stringify(bodyPreferences),
        tripId,
      ]);
    }

    await connection.commit();
    transactionActive = false;

    // Insert progressively so Trip Detail polling can render day/POI updates as they land.
    for (const day of validated.days) {
      const [dayResult] = await connection.query(
        "INSERT INTO itinerary_days (trip_id, day_number) VALUES (?, ?)",
        [tripId, day.dayNumber]
      );
      const dayId = dayResult.insertId;

      for (let i = 0; i < day.pois.length; i += 1) {
        await upsertAiPoiForDay(connection, {
          tripId,
          destination: trip.destination,
          dayNumber: day.dayNumber,
          dayId,
          poi: day.pois[i],
          visitOrder: i + 1,
        });
      }
    }

    return res.json({
      tripId,
      saved: true,
      progressive: true,
    });
  } catch (err) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
    }

    console.error(err);

    if (err instanceof z.ZodError) {
      return res.status(422).json({
        error: "AI returned invalid itinerary JSON format",
        issues: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    return res.status(500).json({ error: err.message || "Failed to generate AI itinerary" });
  } finally {
    if (connection) connection.release();
  }
}

export async function generateAiTripItineraryStream(req, res) {
  let connection;
  let transactionActive = false;
  let closed = false;

  const sendEvent = (event, payload) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const bodyPreferences = normalizeTripPreferences(req.body?.preferences);
    const userRequest = String(req.body?.user_request || "").trim();

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    req.on("close", () => {
      closed = true;
    });

    sendEvent("open", { ok: true, tripId });

    connection = await pool.getConnection();
    const [tripRows] = await connection.query(
      `
      SELECT
        trip_id,
        user_id,
        title,
        destination,
        start_date,
        end_date,
        preferences,
        description,
        cover_image_url,
        created_at,
        note
      FROM trips
      WHERE trip_id = ?
      LIMIT 1
      `,
      [tripId]
    );

    if (tripRows.length === 0) {
      sendEvent("error", { error: "Trip not found" });
      return res.end();
    }

    const trip = tripRows[0];
    await ensureTripCoverImageIfMissing(connection, trip);
    const tripPreferences = parseTripPreferences(trip.preferences);
    const effectivePreferencesList = bodyPreferences ?? tripPreferences ?? [];
    const transientNote = userRequest
      ? [String(trip.note || "").trim(), `[AI Chat Request]\n${userRequest}`].filter(Boolean).join("\n\n")
      : (trip.note ?? "");

    sendEvent("stage", { step: "ai_generating" });
    const itineraryRaw = await generateItinerary({
      destination: trip.destination,
      startDate: toYmd(trip.start_date),
      endDate: toYmd(trip.end_date),
      preferences: effectivePreferencesList.join(", "),
      description: trip.description ?? "",
      note: transientNote,
    });

    const validated = aiItinerarySchema.parse(itineraryRaw);
    validateGeneratedItineraryAgainstTrip(validated, trip);

    await connection.beginTransaction();
    transactionActive = true;

    const [existingDays] = await connection.query(
      "SELECT day_id FROM itinerary_days WHERE trip_id = ?",
      [tripId]
    );
    const dayIds = existingDays.map((row) => row.day_id).filter((id) => id != null);

    if (dayIds.length > 0) {
      await connection.query(
        `DELETE FROM day_poi WHERE day_id IN (${dayIds.map(() => "?").join(",")})`,
        dayIds
      );
    }
    await connection.query("DELETE FROM itinerary_days WHERE trip_id = ?", [tripId]);

    if (bodyPreferences) {
      await connection.query("UPDATE trips SET preferences = ? WHERE trip_id = ?", [
        JSON.stringify(bodyPreferences),
        tripId,
      ]);
    }

    await connection.commit();
    transactionActive = false;
    sendEvent("cleared", { tripId, totalDays: validated.days.length });

    for (const day of validated.days) {
      const [dayResult] = await connection.query(
        "INSERT INTO itinerary_days (trip_id, day_number) VALUES (?, ?)",
        [tripId, day.dayNumber]
      );
      const dayId = dayResult.insertId;
      sendEvent("day_created", {
        tripId,
        dayNumber: day.dayNumber,
        dayId,
        totalPois: day.pois.length,
      });

      for (let i = 0; i < day.pois.length; i += 1) {
        const poi = day.pois[i];
        await upsertAiPoiForDay(connection, {
          tripId,
          destination: trip.destination,
          dayNumber: day.dayNumber,
          dayId,
          poi,
          visitOrder: i + 1,
        });
        sendEvent("poi_saved", {
          tripId,
          dayNumber: day.dayNumber,
          visitOrder: i + 1,
          poiName: poi.name,
          totalPois: day.pois.length,
        });
      }
    }

    sendEvent("done", { ok: true, tripId, saved: true });
    return res.end();
  } catch (err) {
    if (connection && transactionActive) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
    }

    console.error(err);

    const payload = err instanceof z.ZodError
      ? {
          error: "AI returned invalid itinerary JSON format",
          issues: err.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }
      : { error: err.message || "Failed to generate AI itinerary" };

    if (res.headersSent) {
      try {
        sendEvent("error", payload);
      } catch {}
      return res.end();
    }
    return res.status(500).json(payload);
  } finally {
    if (connection) connection.release();
  }
}

export async function generateAiTripDay(req, res) {
  let connection;
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    const dayNumber = Number(req.body?.day_number);
    const userRequest = String(req.body?.user_request || "").trim();

    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }
    if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
      return res.status(400).json({ error: "Invalid day_number" });
    }

    connection = await pool.getConnection();

    const [tripRows] = await connection.query(
      `
      SELECT
        trip_id, destination, start_date, end_date, preferences, description, note
      FROM trips
      WHERE trip_id = ?
      LIMIT 1
      `,
      [tripId]
    );
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const trip = tripRows[0];
    const startYmd = toYmd(trip.start_date);
    const endYmd = toYmd(trip.end_date);
    const inclusiveDays = Math.max(
      1,
      Math.round((new Date(`${endYmd}T00:00:00`) - new Date(`${startYmd}T00:00:00`)) / (1000 * 60 * 60 * 24)) + 1
    );
    if (dayNumber > inclusiveDays) {
      return res.status(400).json({ error: `day_number exceeds trip range (${inclusiveDays} days)` });
    }

    const [summaryRows] = await connection.query(
      `
      SELECT
        d.day_id,
        d.day_number,
        dp.day_poi_id,
        dp.visit_order,
        dp.start_time,
        dp.duration_min,
        p.name,
        p.address
      FROM itinerary_days d
      LEFT JOIN day_poi dp ON dp.day_id = d.day_id
      LEFT JOIN pois p ON p.poi_id = dp.poi_id
      WHERE d.trip_id = ?
      ORDER BY d.day_number ASC, dp.visit_order ASC
      `,
      [tripId]
    );

    const generatedRaw = await generateSingleDayItinerary({
      destination: trip.destination,
      startDate: startYmd,
      endDate: endYmd,
      preferences: (parseTripPreferences(trip.preferences) || []).join(", "),
      description: trip.description ?? "",
      note: trip.note ?? "",
      dayNumber,
      itinerarySummary: buildItinerarySummaryText(summaryRows),
      userRequest,
    });

    const generatedDay = aiDaySchema.parse(generatedRaw);
    if (generatedDay.dayNumber !== dayNumber) {
      return res.status(422).json({ error: `AI returned dayNumber=${generatedDay.dayNumber}, expected ${dayNumber}` });
    }

    await connection.beginTransaction();

    const [dayRows] = await connection.query(
      "SELECT day_id FROM itinerary_days WHERE trip_id = ? AND day_number = ? LIMIT 1",
      [tripId, dayNumber]
    );

    let dayId;
    if (dayRows.length > 0) {
      dayId = dayRows[0].day_id;
    } else {
      const [dayInsert] = await connection.query(
        "INSERT INTO itinerary_days (trip_id, day_number) VALUES (?, ?)",
        [tripId, dayNumber]
      );
      dayId = dayInsert.insertId;
    }

    await connection.query("DELETE FROM day_poi WHERE day_id = ?", [dayId]);

    for (let i = 0; i < generatedDay.pois.length; i += 1) {
      await upsertAiPoiForDay(connection, {
        tripId,
        destination: trip.destination,
        dayNumber,
        dayId,
        poi: generatedDay.pois[i],
        visitOrder: i + 1,
      });
    }

    await connection.commit();
    return res.json({ success: true, trip_id: tripId, day_number: dayNumber, regenerated: true });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error(err);
    if (err instanceof z.ZodError) {
      return res.status(422).json({
        error: "AI returned invalid day itinerary JSON format",
        issues: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    return res.status(500).json({ error: err.message || "Failed to generate AI day itinerary" });
  } finally {
    if (connection) connection.release();
  }
}

export async function chatWithTripAssistant(req, res) {
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .slice(-12)
          .map((item) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: String(item?.content || "").trim(),
          }))
          .filter((item) => item.content)
      : [];

    const [tripRows] = await pool.query(
      `
      SELECT
        trip_id,
        destination,
        start_date,
        end_date,
        preferences,
        description,
        note
      FROM trips
      WHERE trip_id = ?
      LIMIT 1
      `,
      [tripId]
    );

    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        d.day_id,
        d.day_number,
        dp.day_poi_id,
        dp.visit_order,
        dp.start_time,
        dp.duration_min,
        p.name,
        p.address
      FROM itinerary_days d
      LEFT JOIN day_poi dp ON dp.day_id = d.day_id
      LEFT JOIN pois p ON p.poi_id = dp.poi_id
      WHERE d.trip_id = ?
      ORDER BY d.day_number ASC, dp.visit_order ASC
      `,
      [tripId]
    );

    const trip = tripRows[0];
    const reply = await generateTripAssistantReply({
      trip: {
        destination: trip.destination,
        startDate: toYmd(trip.start_date),
        endDate: toYmd(trip.end_date),
        preferences: (parseTripPreferences(trip.preferences) || []).join(", "),
        description: trip.description ?? "",
        note: trip.note ?? "",
      },
      itinerarySummary: buildItinerarySummaryText(rows),
      history,
      userMessage: message,
    });

    return res.json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to chat with trip assistant" });
  }
}

export async function chatWithTripAssistantStream(req, res) {
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .slice(-12)
          .map((item) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: String(item?.content || "").trim(),
          }))
          .filter((item) => item.content)
      : [];

    const [tripRows] = await pool.query(
      `
      SELECT trip_id, destination, start_date, end_date, preferences, description, note
      FROM trips
      WHERE trip_id = ?
      LIMIT 1
      `,
      [tripId]
    );
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        d.day_id,
        d.day_number,
        dp.day_poi_id,
        dp.visit_order,
        dp.start_time,
        dp.duration_min,
        p.name,
        p.address
      FROM itinerary_days d
      LEFT JOIN day_poi dp ON dp.day_id = d.day_id
      LEFT JOIN pois p ON p.poi_id = dp.poi_id
      WHERE d.trip_id = ?
      ORDER BY d.day_number ASC, dp.visit_order ASC
      `,
      [tripId]
    );

    const trip = tripRows[0];

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    const sendEvent = (event, payload) => {
      if (closed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent("open", { ok: true });

    await streamTripAssistantReply({
      trip: {
        destination: trip.destination,
        startDate: toYmd(trip.start_date),
        endDate: toYmd(trip.end_date),
        preferences: (parseTripPreferences(trip.preferences) || []).join(", "),
        description: trip.description ?? "",
        note: trip.note ?? "",
      },
      itinerarySummary: buildItinerarySummaryText(rows),
      history,
      userMessage: message,
      onChunk: (chunkText) => {
        sendEvent("chunk", { text: chunkText });
      },
    });

    sendEvent("done", { ok: true });
    res.end();
  } catch (err) {
    console.error(err);
    if (res.headersSent) {
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: err.message || "Failed to stream trip assistant chat" })}\n\n`);
      } catch {}
      return res.end();
    }
    return res.status(500).json({ error: err.message || "Failed to stream trip assistant chat" });
  }
}

export async function getTripDetailStructured(req, res) {
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const [tripRows] = await pool.query(
      `
      SELECT
        trip_id,
        user_id,
        title,
        destination,
        start_date,
        end_date,
        preferences,
        description,
        created_at,
        note
      FROM trips
      WHERE trip_id = ?
      LIMIT 1
      `,
      [tripId]
    );
    if (tripRows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }
    const [rows] = await pool.query(
      `
      SELECT
        d.day_id,
        d.day_number,
        dp.day_poi_id,
        dp.visit_order,
        dp.note,
        dp.transport_mode_override,
        dp.start_time,
        dp.duration_min,
        p.poi_id,
        p.name,
        p.type,
        p.address,
        p.description,
        p.image_url,
        p.lat,
        p.lng
      FROM itinerary_days d
      LEFT JOIN day_poi dp ON dp.day_id = d.day_id
      LEFT JOIN pois p ON p.poi_id = dp.poi_id
      WHERE d.trip_id = ?
      ORDER BY d.day_number ASC, dp.visit_order ASC
      `,
      [tripId]
    );

    const tripRow = tripRows[0];
    await backfillMissingTripPoiCoordinates(rows, tripRow.destination, tripId);

    const trip = {
      trip_id: tripRow.trip_id,
      user_id: tripRow.user_id ?? null,
      title: tripRow.title ?? null,
      destination: tripRow.destination ?? null,
      start_date: toYmd(tripRow.start_date),
      end_date: toYmd(tripRow.end_date),
      preferences: parseTripPreferences(tripRow.preferences),
      description: tripRow.description ?? null,
      cover_image_url: tripRow.cover_image_url ?? null,
      note: tripRow.note ?? null,
      created_at: tripRow.created_at ?? null,
    };

    const days = [];
    const dayMap = new Map();

    for (const row of rows) {
      let day = dayMap.get(row.day_id);
      if (!day) {
        day = {
          day_id: row.day_id,
          day_number: row.day_number,
          pois: [],
        };
        dayMap.set(row.day_id, day);
        days.push(day);
      }

      if (row.day_poi_id == null || row.poi_id == null) continue;

      day.pois.push({
        day_poi_id: row.day_poi_id,
        poi_id: row.poi_id,
        name: row.name,
        type: row.type ?? "other",
        address: row.address ?? "",
        description: row.description ?? "",
        image_url: row.image_url ?? null,
        visit_order: row.visit_order,
        note: row.note ?? null,
        transport_mode_override: row.transport_mode_override ?? null,
        start_time: row.start_time ?? null,
        duration_min: row.duration_min ?? null,
        lat: row.lat ?? null,
        lng: row.lng ?? null,
      });
    }

    return res.json({ trip, days });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch trip detail" });
  }
}

export async function getTripDetail(req, res) {
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        t.trip_id,
        t.title,
        t.destination,
        t.start_date,
        t.end_date,
        t.description AS trip_description,
        t.cover_image_url AS trip_cover_image_url,
        t.note AS trip_note,
        d.day_id,
        d.day_number,
        dp.day_poi_id,
        dp.visit_order,
        dp.note AS day_poi_note,
        dp.start_time,
        dp.duration_min,
        p.poi_id,
        p.name,
        p.type,
        p.address,
        p.lat,
        p.lng,
        p.description AS poi_description
      FROM trips t
      LEFT JOIN itinerary_days d ON d.trip_id = t.trip_id
      LEFT JOIN day_poi dp ON dp.day_id = d.day_id
      LEFT JOIN pois p ON p.poi_id = dp.poi_id
      WHERE t.trip_id = ?
      ORDER BY d.day_number ASC, dp.visit_order ASC
      `,
      [tripId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const first = rows[0];
    const trip = {
      trip_id: first.trip_id,
      title: first.title,
      destination: first.destination,
      start_date: first.start_date,
      end_date: first.end_date,
      description: first.trip_description,
      cover_image_url: first.trip_cover_image_url ?? null,
      note: first.trip_note,
      days: [],
    };

    const dayMap = new Map();

    for (const row of rows) {
      if (row.day_id == null) continue;

      let day = dayMap.get(row.day_id);
      if (!day) {
        day = {
          day_id: row.day_id,
          day_number: row.day_number,
          pois: [],
        };
        dayMap.set(row.day_id, day);
        trip.days.push(day);
      }

      if (row.day_poi_id == null) continue;

      day.pois.push({
        day_poi_id: row.day_poi_id,
        visit_order: row.visit_order,
        note: row.day_poi_note,
        start_time: row.start_time,
        duration_min: row.duration_min,
        poi: {
          poi_id: row.poi_id,
          name: row.name,
          type: row.type,
          address: row.address,
          lat: row.lat,
          lng: row.lng,
          description: row.poi_description,
        },
      });
    }

    return res.json(trip);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch trip detail" });
  }
}
