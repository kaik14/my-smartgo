import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "server is running" });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM trips");
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


app.post("/api/trips", async (req, res) => {
  try {
    const { title, destination, start_date, end_date } = req.body;

    const [result] = await pool.query(
      `
      INSERT INTO trips (title, destination, start_date, end_date)
      VALUES (?, ?, ?, ?)
      `,
      [title, destination, start_date, end_date]
    );

    res.json({
      message: "Trip created successfully",
      trip_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create trip" });
  }
});

app.get("/api/trips", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT trip_id, title, destination, start_date, end_date, created_at FROM trips ORDER BY trip_id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
