import express from "express";
import { updateDayPoiNote } from "../controllers/day-pois.controller.js";

const router = express.Router();

router.patch("/day-pois/:day_poi_id", updateDayPoiNote);

export default router;
