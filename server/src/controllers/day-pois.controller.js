import pool from "../config/db.js";

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
