import pool from "../config/db.js";

function getUserId(req) {
  const raw = req.headers["x-user-id"] ?? req.query?.user_id ?? req.body?.user_id;
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return userId;
}

export async function getFavorites(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        p.poi_id,
        p.name,
        p.type,
        p.address,
        p.lat,
        p.lng,
        p.description
      FROM favorites f
      JOIN pois p ON p.poi_id = f.poi_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch favorites" });
  }
}

export async function createFavorite(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const poiId = Number(req.body?.poi_id);
    if (!Number.isInteger(poiId) || poiId <= 0) {
      return res.status(400).json({ error: "poi_id is required" });
    }

    try {
      const [result] = await pool.query(
        `
        INSERT INTO favorites (user_id, poi_id)
        VALUES (?, ?)
        `,
        [userId, poiId]
      );

      return res.status(201).json({
        message: "Favorite added successfully",
        favorite_id: result.insertId,
        poi_id: poiId,
      });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "POI already in favorites" });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to add favorite" });
  }
}

export async function deleteFavorite(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const poiId = Number(req.params.poi_id);
    if (!Number.isInteger(poiId) || poiId <= 0) {
      return res.status(400).json({ error: "Invalid poi_id" });
    }

    await pool.query(
      `
      DELETE FROM favorites
      WHERE user_id = ? AND poi_id = ?
      `,
      [userId, poiId]
    );

    return res.json({ message: "Favorite removed successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove favorite" });
  }
}
