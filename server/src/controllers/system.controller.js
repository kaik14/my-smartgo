import pool from "../config/db.js";

export function health(req, res) {
  res.json({ ok: true, message: "server is running" });
}

export async function testDb(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM trips");
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
}
