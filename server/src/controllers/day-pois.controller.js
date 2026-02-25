import pool from "../config/db.js";
import { getPoiPlaceDetailsWithCache } from "../services/googlePlacesDetailsService.js";

const AUTO_REORDER_GAP_MIN = 20;

function hhmmToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToHhmm(totalMinutes) {
  const normalized = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, "0");
  const m = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export async function updateDayPoiNote(req, res) {
  try {
    const dayPoiId = Number(req.params.dayPoiId ?? req.params.day_poi_id);
    if (!Number.isInteger(dayPoiId) || dayPoiId <= 0) {
      return res.status(400).json({ error: "Invalid day_poi_id" });
    }

    if (!Object.prototype.hasOwnProperty.call(req.body, "note")) {
      return res.status(400).json({ error: "note is required" });
    }

    if (req.body.note !== null && typeof req.body.note !== "string") {
      return res.status(400).json({ error: "note must be a string or null" });
    }

    const note = req.body.note;

    const [result] = await pool.query(
      "UPDATE day_poi SET note = ? WHERE day_poi_id = ?",
      [note, dayPoiId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Day POI not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update day poi note" });
  }
}

export async function updateDayPoiTransportMode(req, res) {
  try {
    const dayPoiId = Number(req.params.dayPoiId ?? req.params.day_poi_id);
    if (!Number.isInteger(dayPoiId) || dayPoiId <= 0) {
      return res.status(400).json({ error: "Invalid day_poi_id" });
    }

    if (!Object.prototype.hasOwnProperty.call(req.body, "transport_mode_override")) {
      return res.status(400).json({ error: "transport_mode_override is required" });
    }

    const raw = req.body.transport_mode_override;
    const normalized = raw == null ? null : String(raw).trim().toUpperCase();
    const allowed = new Set(["WALKING", "DRIVING", "TRANSIT"]);
    if (normalized !== null && !allowed.has(normalized)) {
      return res.status(400).json({ error: "transport_mode_override must be WALKING, DRIVING, TRANSIT, or null" });
    }

    const [result] = await pool.query(
      "UPDATE day_poi SET transport_mode_override = ? WHERE day_poi_id = ?",
      [normalized, dayPoiId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Day POI not found" });
    }

    return res.json({ success: true, transport_mode_override: normalized });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update transport mode override" });
  }
}

export async function updatePoiImage(req, res) {
  try {
    const poiId = Number(req.params.poiId ?? req.params.poi_id);
    if (!Number.isInteger(poiId) || poiId <= 0) {
      return res.status(400).json({ error: "Invalid poi_id" });
    }

    if (!Object.prototype.hasOwnProperty.call(req.body, "image_url")) {
      return res.status(400).json({ error: "image_url is required" });
    }

    const raw = req.body.image_url;
    const imageUrl = raw == null ? null : String(raw).trim();
    if (imageUrl !== null && imageUrl !== "" && !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ error: "image_url must be http/https URL or null" });
    }

    const [result] = await pool.query(
      "UPDATE pois SET image_url = ? WHERE poi_id = ?",
      [imageUrl || null, poiId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "POI not found" });
    }

    return res.json({ success: true, poi_id: poiId, image_url: imageUrl || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update poi image" });
  }
}

export async function getPoiPlaceDetails(req, res) {
  try {
    const poiId = Number(req.params.poiId ?? req.params.poi_id);
    if (!Number.isInteger(poiId) || poiId <= 0) {
      return res.status(400).json({ error: "Invalid poi_id" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        poi_id,
        name,
        type,
        address,
        description,
        image_url,
        lat,
        lng,
        google_place_id,
        google_place_cache_json,
        google_place_cache_updated_at
      FROM pois
      WHERE poi_id = ?
      LIMIT 1
      `,
      [poiId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "POI not found" });
    }

    const payload = await getPoiPlaceDetailsWithCache(rows[0]);
    return res.json(payload);
  } catch (err) {
    console.error(err);
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to fetch poi place details (${detail})` });
  }
}

export async function updateDayPoiSchedule(req, res) {
  try {
    const dayPoiId = Number(req.params.dayPoiId ?? req.params.day_poi_id);
    if (!Number.isInteger(dayPoiId) || dayPoiId <= 0) {
      return res.status(400).json({ error: "Invalid day_poi_id" });
    }

    const hasStartTime = Object.prototype.hasOwnProperty.call(req.body, "start_time");
    const hasDurationMin = Object.prototype.hasOwnProperty.call(req.body, "duration_min");
    if (!hasStartTime || !hasDurationMin) {
      return res.status(400).json({ error: "start_time and duration_min are required" });
    }

    const { start_time: startTime, duration_min: durationMin } = req.body;

    if (startTime !== null && typeof startTime !== "string") {
      return res.status(400).json({ error: "start_time must be a string or null" });
    }

    if (typeof startTime === "string" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      return res.status(400).json({ error: "start_time must be in HH:MM format" });
    }

    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin <= 0)) {
      return res.status(400).json({ error: "duration_min must be a positive integer or null" });
    }

    const [result] = await pool.query(
      `
      UPDATE day_poi
      SET start_time = ?, duration_min = ?
      WHERE day_poi_id = ?
      `,
      [startTime, durationMin, dayPoiId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Day POI not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update day poi schedule" });
  }
}

export async function reorderDayPois(req, res) {
  let connection;
  try {
    const dayId = Number(req.params.dayId ?? req.params.day_id);
    if (!Number.isInteger(dayId) || dayId <= 0) {
      return res.status(400).json({ error: "Invalid day_id" });
    }

    const orderedIds = Array.isArray(req.body?.ordered_day_poi_ids) ? req.body.ordered_day_poi_ids : null;
    if (!orderedIds || orderedIds.length === 0) {
      return res.status(400).json({ error: "ordered_day_poi_ids is required" });
    }

    const normalized = orderedIds.map((value) => Number(value));
    if (normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
      return res.status(400).json({ error: "ordered_day_poi_ids must contain positive integers" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT day_poi_id, start_time FROM day_poi WHERE day_id = ? ORDER BY visit_order ASC",
      [dayId]
    );
    const existingIds = rows.map((row) => Number(row.day_poi_id));
    const originalDayStartMin = rows.length > 0 ? hhmmToMinutes(rows[0].start_time) : null;

    if (existingIds.length !== normalized.length) {
      await connection.rollback();
      return res.status(400).json({ error: "ordered_day_poi_ids length does not match day POI count" });
    }

    const existingSet = new Set(existingIds);
    if (normalized.some((id) => !existingSet.has(id))) {
      await connection.rollback();
      return res.status(400).json({ error: "ordered_day_poi_ids must belong to the specified day" });
    }

    // Two-phase reorder to avoid unique(day_id, visit_order) collisions during in-place updates.
    for (let i = 0; i < normalized.length; i += 1) {
      await connection.query(
        "UPDATE day_poi SET visit_order = ? WHERE day_poi_id = ? AND day_id = ?",
        [1000 + i + 1, normalized[i], dayId]
      );
    }

    for (let i = 0; i < normalized.length; i += 1) {
      await connection.query(
        "UPDATE day_poi SET visit_order = ? WHERE day_poi_id = ? AND day_id = ?",
        [i + 1, normalized[i], dayId]
      );
    }

    // Recalculate schedule times to match the new order.
    // Rule: keep the first POI start_time (or default 09:00), then chain by duration + fixed gap.
    const [orderedRows] = await connection.query(
      `
      SELECT day_poi_id, start_time, duration_min
      FROM day_poi
      WHERE day_id = ?
      ORDER BY visit_order ASC
      `,
      [dayId]
    );

    if (orderedRows.length > 0) {
      let currentStartMin = originalDayStartMin ?? hhmmToMinutes(orderedRows[0].start_time);
      if (currentStartMin == null) currentStartMin = hhmmToMinutes("09:00");

      for (let i = 0; i < orderedRows.length; i += 1) {
        const row = orderedRows[i];
        const nextStartTime = minutesToHhmm(currentStartMin);
        await connection.query(
          "UPDATE day_poi SET start_time = ? WHERE day_poi_id = ? AND day_id = ?",
          [nextStartTime, row.day_poi_id, dayId]
        );

        const durationMin = Number.isInteger(Number(row.duration_min)) && Number(row.duration_min) > 0
          ? Number(row.duration_min)
          : 60;
        currentStartMin += durationMin + AUTO_REORDER_GAP_MIN;
      }
    }

    await connection.commit();
    return res.json({ success: true });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to reorder day pois" });
  } finally {
    if (connection) connection.release();
  }
}

export async function addDayPoi(req, res) {
  let connection;
  try {
    const dayId = Number(req.params.dayId ?? req.params.day_id);
    if (!Number.isInteger(dayId) || dayId <= 0) {
      return res.status(400).json({ error: "Invalid day_id" });
    }

    const name = String(req.body?.name || "").trim();
    const address = String(req.body?.address || "").trim();
    if (!name || !address) {
      return res.status(400).json({ error: "name and address are required" });
    }

    const type = String(req.body?.type || "other").trim() || "other";
    const description = String(req.body?.description || "").trim();
    const note = req.body?.note == null ? null : String(req.body.note);
    const startTime = req.body?.start_time == null ? null : String(req.body.start_time);
    const durationMin = req.body?.duration_min == null ? null : Number(req.body.duration_min);
    const lat = req.body?.lat == null ? null : Number(req.body.lat);
    const lng = req.body?.lng == null ? null : Number(req.body.lng);
    const googlePlaceIdRaw = req.body?.google_place_id ?? req.body?.placeId ?? req.body?.place_id;
    const googlePlaceId = googlePlaceIdRaw == null ? null : String(googlePlaceIdRaw).trim();

    if (startTime !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      return res.status(400).json({ error: "start_time must be in HH:MM format or null" });
    }
    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin <= 0)) {
      return res.status(400).json({ error: "duration_min must be a positive integer or null" });
    }
    if (lat !== null && !Number.isFinite(lat)) {
      return res.status(400).json({ error: "lat must be a number or null" });
    }
    if (lng !== null && !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lng must be a number or null" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [dayRows] = await connection.query("SELECT day_id FROM itinerary_days WHERE day_id = ? LIMIT 1", [dayId]);
    if (dayRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Day not found" });
    }

    const [existingPoiRows] = await connection.query(
      "SELECT poi_id, lat, lng, google_place_id FROM pois WHERE name = ? AND address = ? LIMIT 1",
      [name, address]
    );

    let poiId;
    if (existingPoiRows.length > 0) {
      poiId = existingPoiRows[0].poi_id;
      if ((existingPoiRows[0].lat == null || existingPoiRows[0].lng == null) && lat != null && lng != null) {
        await connection.query(
          "UPDATE pois SET lat = ?, lng = ?, type = ?, description = ?, google_place_id = COALESCE(NULLIF(google_place_id, ''), ?) WHERE poi_id = ?",
          [lat, lng, type, description || null, googlePlaceId || null, poiId]
        );
      } else {
        await connection.query(
          "UPDATE pois SET type = ?, description = ?, google_place_id = COALESCE(NULLIF(google_place_id, ''), ?) WHERE poi_id = ?",
          [type, description || null, googlePlaceId || null, poiId]
        );
      }
    } else {
      const [poiInsert] = await connection.query(
        "INSERT INTO pois (name, type, address, description, lat, lng, google_place_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [name, type, address, description || null, lat, lng, googlePlaceId || null]
      );
      poiId = poiInsert.insertId;
    }

    const [maxOrderRows] = await connection.query(
      "SELECT COALESCE(MAX(visit_order), 0) AS max_order FROM day_poi WHERE day_id = ?",
      [dayId]
    );
    const nextOrder = Number(maxOrderRows[0]?.max_order || 0) + 1;

    const [insertResult] = await connection.query(
      `INSERT INTO day_poi (day_id, poi_id, visit_order, note, start_time, duration_min)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dayId, poiId, nextOrder, note, startTime, durationMin]
    );

    await connection.commit();
    return res.json({ success: true, day_poi_id: insertResult.insertId, poi_id: poiId });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to add day poi" });
  } finally {
    if (connection) connection.release();
  }
}

export async function deleteDayPoi(req, res) {
  let connection;
  try {
    const dayPoiId = Number(req.params.dayPoiId ?? req.params.day_poi_id);
    if (!Number.isInteger(dayPoiId) || dayPoiId <= 0) {
      return res.status(400).json({ error: "Invalid day_poi_id" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT day_id, visit_order FROM day_poi WHERE day_poi_id = ? LIMIT 1",
      [dayPoiId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Day POI not found" });
    }

    const dayId = Number(rows[0].day_id);
    const deletedOrder = Number(rows[0].visit_order);

    await connection.query("DELETE FROM day_poi WHERE day_poi_id = ?", [dayPoiId]);

    await connection.query(
      "UPDATE day_poi SET visit_order = visit_order - 1 WHERE day_id = ? AND visit_order > ?",
      [dayId, deletedOrder]
    );

    await connection.commit();
    return res.json({ success: true });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to delete day poi" });
  } finally {
    if (connection) connection.release();
  }
}

export async function deleteTripDay(req, res) {
  let connection;
  try {
    const dayId = Number(req.params.dayId ?? req.params.day_id);
    if (!Number.isInteger(dayId) || dayId <= 0) {
      return res.status(400).json({ error: "Invalid day_id" });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [dayRows] = await connection.query(
      "SELECT day_id, trip_id, day_number FROM itinerary_days WHERE day_id = ? LIMIT 1",
      [dayId]
    );
    if (dayRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Day not found" });
    }

    const day = dayRows[0];
    const tripId = Number(day.trip_id);
    const deletedDayNumber = Number(day.day_number);

    const [countRows] = await connection.query(
      "SELECT COUNT(*) AS total_days FROM itinerary_days WHERE trip_id = ?",
      [tripId]
    );
    const totalDays = Number(countRows[0]?.total_days || 0);
    if (totalDays <= 1) {
      await connection.rollback();
      return res.status(400).json({ error: "Cannot delete the only itinerary day" });
    }

    await connection.query("DELETE FROM day_poi WHERE day_id = ?", [dayId]);
    await connection.query("DELETE FROM itinerary_days WHERE day_id = ?", [dayId]);

    await connection.query(
      "UPDATE itinerary_days SET day_number = day_number - 1 WHERE trip_id = ? AND day_number > ?",
      [tripId, deletedDayNumber]
    );

    await connection.query(
      `
      UPDATE trips
      SET end_date = CASE
        WHEN end_date > start_date THEN DATE_SUB(end_date, INTERVAL 1 DAY)
        ELSE end_date
      END
      WHERE trip_id = ?
      `,
      [tripId]
    );

    await connection.commit();
    return res.json({
      success: true,
      trip_id: tripId,
      deleted_day_id: dayId,
      deleted_day_number: deletedDayNumber,
      remaining_days: totalDays - 1,
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to delete trip day" });
  } finally {
    if (connection) connection.release();
  }
}
