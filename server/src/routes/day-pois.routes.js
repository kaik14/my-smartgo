import express from "express";
import { updateDayPoiNote, updateDayPoiSchedule } from "../controllers/day-pois.controller.js";

const router = express.Router();

router.patch("/day-pois/:dayPoiId", updateDayPoiNote);
router.patch("/day-pois/:dayPoiId/schedule", updateDayPoiSchedule);

export default router;
