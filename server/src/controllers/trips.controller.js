import pool from "../config/db.js";

function getUserId(req) {
  const raw = req.body?.user_id ?? req.query?.user_id ?? req.headers["x-user-id"];
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return userId;
}

export async function createTrip(req, res) {
  try {
    const { title, destination, start_date, end_date, description, note } = req.body;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO trips (title, destination, start_date, end_date, description, note, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title,
        destination,
        start_date,
        end_date,
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
    res.status(500).json({ error: "Failed to create trip" });
  }
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
