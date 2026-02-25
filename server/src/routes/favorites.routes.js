import express from "express";
import { createFavorite, createFavoriteFromPlace, deleteFavorite, getFavorites } from "../controllers/favorites.controller.js";

const router = express.Router();

router.get("/favorites", getFavorites);
router.post("/favorites", createFavorite);
router.post("/favorites/from-place", createFavoriteFromPlace);
router.delete("/favorites/:poi_id", deleteFavorite);

export default router;
