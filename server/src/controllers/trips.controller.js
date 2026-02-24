import { z } from "zod";
import pool from "../config/db.js";
import { generateItinerary } from "../services/geminiItineraryService.js";

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

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map((row) => row.Field));
}

function pickExisting(columns, candidates) {
  return candidates.find((name) => columns.has(name)) ?? null;
}

function buildTripSelectColumns(tripsColumns) {
  const selected = ["trip_id", "title", "destination", "start_date", "end_date", "user_id"];
  for (const col of ["preferences", "description", "note", "created_at"]) {
    if (tripsColumns.has(col)) selected.push(col);
  }
  return selected;
}

export async function getTrips(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.json([]);
    }

    const [rows] = await pool.query(
      "SELECT trip_id, title, destination, start_date, end_date, description, note, created_at FROM trips WHERE user_id = ? ORDER BY trip_id DESC",
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

    const tripId = Number(req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const allowed = ["title", "destination", "start_date", "end_date", "description", "note"];
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
  try {
    const tripId = Number(req.params.tripId ?? req.params.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) {
      return res.status(400).json({ error: "Invalid trip_id" });
    }

    const bodyPreferences = normalizeTripPreferences(req.body?.preferences);

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
    const tripPreferences = parseTripPreferences(trip.preferences);
    const effectivePreferencesList = bodyPreferences ?? tripPreferences ?? [];
    const itineraryRaw = await generateItinerary({
      destination: trip.destination,
      startDate: toYmd(trip.start_date),
      endDate: toYmd(trip.end_date),
      preferences: effectivePreferencesList.join(", "),
      description: trip.description ?? "",
      note: trip.note ?? "",
    });

    const validated = aiItinerarySchema.parse(itineraryRaw);
    validateGeneratedItineraryAgainstTrip(validated, trip);

    await connection.beginTransaction();

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

    const createdDays = [];
    for (const day of validated.days) {
      const [dayResult] = await connection.query(
        "INSERT INTO itinerary_days (trip_id, day_number) VALUES (?, ?)",
        [tripId, day.dayNumber]
      );

      createdDays.push({ dayId: dayResult.insertId, day });
    }

    for (const { dayId, day } of createdDays) {
      for (let i = 0; i < day.pois.length; i += 1) {
        const poi = day.pois[i];
        const [existingPoiRows] = await connection.query(
          "SELECT poi_id FROM pois WHERE name = ? AND address = ? LIMIT 1",
          [poi.name, poi.address]
        );
        let poiId;
        if (existingPoiRows.length > 0) {
          poiId = existingPoiRows[0].poi_id;
          await connection.query(
            "UPDATE pois SET type = ?, description = ? WHERE poi_id = ?",
            [poi.type, poi.description, poiId]
          );
        } else {
          const [poiInsert] = await connection.query(
            "INSERT INTO pois (name, type, address, description) VALUES (?, ?, ?, ?)",
            [poi.name, poi.type, poi.address, poi.description]
          );
          poiId = poiInsert.insertId;
        }

        await connection.query(
          `
          INSERT INTO day_poi (day_id, poi_id, visit_order, note, start_time, duration_min)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [dayId, poiId, i + 1, poi.note?.trim() || null, poi.startTime, poi.durationMin]
        );
      }
    }

    if (bodyPreferences) {
      await connection.query("UPDATE trips SET preferences = ? WHERE trip_id = ?", [
        JSON.stringify(bodyPreferences),
        tripId,
      ]);
    }

    await connection.commit();

    return res.json({
      tripId,
      saved: true,
    });
  } catch (err) {
    if (connection) {
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
    const trip = {
      trip_id: tripRow.trip_id,
      user_id: tripRow.user_id ?? null,
      title: tripRow.title ?? null,
      destination: tripRow.destination ?? null,
      start_date: toYmd(tripRow.start_date),
      end_date: toYmd(tripRow.end_date),
      preferences: parseTripPreferences(tripRow.preferences),
      description: tripRow.description ?? null,
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
