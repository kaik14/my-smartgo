import pool from "../config/db.js";
import { isLikelyMalaysiaCoordinates } from "../utils/malaysiaGeo.js";

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
        p.description,
        p.image_url,
        p.google_place_id
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

async function ensurePoiForFavoriteByPlace(payload) {
  const name = String(payload?.name || "").trim();
  let address = String(payload?.address || "").trim();
  const type = String(payload?.type || "other").trim() || "other";
  const description = String(payload?.description || "").trim();
  const imageUrl = String(payload?.image_url || "").trim();
  const placeIdRaw = payload?.google_place_id ?? payload?.placeId ?? payload?.place_id;
  const googlePlaceId = placeIdRaw == null ? "" : String(placeIdRaw).trim();
  const lat = payload?.lat == null ? null : Number(payload.lat);
  const lng = payload?.lng == null ? null : Number(payload.lng);

  if (!name) throw new Error("name is required");
  if (!address && googlePlaceId) {
    address = `Google Place (${googlePlaceId})`;
  }
  if (!address) throw new Error("address is required");
  if (lat != null && !Number.isFinite(lat)) throw new Error("lat must be a number");
  if (lng != null && !Number.isFinite(lng)) throw new Error("lng must be a number");
  if (lat != null && lng != null && !isLikelyMalaysiaCoordinates(lat, lng)) {
    throw new Error("Only Malaysia POIs are allowed");
  }

  let rows;
  if (googlePlaceId) {
    [rows] = await pool.query(
      "SELECT poi_id, lat, lng, google_place_id FROM pois WHERE google_place_id = ? LIMIT 1",
      [googlePlaceId]
    );
  } else {
    [rows] = await pool.query(
      "SELECT poi_id, lat, lng, google_place_id FROM pois WHERE name = ? AND address = ? LIMIT 1",
      [name, address]
    );
  }

  if (rows.length > 0) {
    const existing = rows[0];
    await pool.query(
      `
      UPDATE pois
      SET
        type = COALESCE(NULLIF(?, ''), type),
        description = COALESCE(NULLIF(?, ''), description),
        image_url = COALESCE(NULLIF(?, ''), image_url),
        lat = COALESCE(lat, ?),
        lng = COALESCE(lng, ?),
        google_place_id = COALESCE(NULLIF(google_place_id, ''), NULLIF(?, ''))
      WHERE poi_id = ?
      `,
      [type, description, imageUrl, lat, lng, googlePlaceId, existing.poi_id]
    );
    return Number(existing.poi_id);
  }

  const [insertResult] = await pool.query(
    "INSERT INTO pois (name, type, address, description, image_url, lat, lng, google_place_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [name, type, address, description || null, imageUrl || null, lat, lng, googlePlaceId || null]
  );
  return Number(insertResult.insertId);
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

export async function createFavoriteFromPlace(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    let poiId;
    try {
      poiId = await ensurePoiForFavoriteByPlace(req.body || {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: message || "Invalid place payload" });
    }

    try {
      const [result] = await pool.query(
        `INSERT INTO favorites (user_id, poi_id) VALUES (?, ?)`,
        [userId, poiId]
      );
      return res.status(201).json({
        message: "Favorite added successfully",
        favorite_id: result.insertId,
        poi_id: poiId,
      });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "POI already in favorites", poi_id: poiId });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to add favorite from place" });
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
