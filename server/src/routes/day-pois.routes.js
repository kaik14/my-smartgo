import express from "express";
import {
  addDayPoi,
  deleteTripDay,
  deleteDayPoi,
  getPoiPlaceDetails,
  reorderDayPois,
  updatePoiImage,
  updateDayPoiNote,
  updateDayPoiSchedule,
  updateDayPoiTransportMode,
} from "../controllers/day-pois.controller.js";

const router = express.Router();

router.patch("/day-pois/:dayPoiId", updateDayPoiNote);
router.patch("/pois/:poiId/image", updatePoiImage);
router.get("/pois/:poiId/place-details", getPoiPlaceDetails);
router.patch("/day-pois/:dayPoiId/transport-mode", updateDayPoiTransportMode);
router.delete("/day-pois/:dayPoiId", deleteDayPoi);
router.patch("/day-pois/:dayPoiId/schedule", updateDayPoiSchedule);
router.patch("/days/:dayId/pois/reorder", reorderDayPois);
router.post("/days/:dayId/pois", addDayPoi);
router.delete("/days/:dayId", deleteTripDay);

export default router;
