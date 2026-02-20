import pool from "../config/db.js";

export async function updateDayPoiNote(req, res) {
  try {
    const dayPoiId = Number(req.params.day_poi_id);
    if (!Number.isInteger(dayPoiId) || dayPoiId <= 0) {
      return res.status(400).json({ error: "Invalid day_poi_id" });
    }

    if (!Object.prototype.hasOwnProperty.call(req.body, "note")) {
      return res.status(400).json({ error: "note is required" });
    }

    const note = req.body.note ?? null;

    await pool.query(
      "UPDATE day_poi SET note = ? WHERE day_poi_id = ?",
      [note, dayPoiId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update day poi note" });
  }
}
