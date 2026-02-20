import express from "express";
import { createFavorite, deleteFavorite, getFavorites } from "../controllers/favorites.controller.js";

const router = express.Router();

router.get("/favorites", getFavorites);
router.post("/favorites", createFavorite);
router.delete("/favorites/:poi_id", deleteFavorite);

export default router;
