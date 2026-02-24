import express from "express";
import {
  createTrip,
  deleteTrip,
  generateAiTripItinerary,
  getTripDetail,
  getTripDetailStructured,
  getTrips,
  updateTrip,
} from "../controllers/trips.controller.js";

const router = express.Router();

router.post("/trips", createTrip);
router.get("/trips", getTrips);
router.post("/trips/:tripId/ai-generate", generateAiTripItinerary);
router.get("/trips/:tripId/detail", getTripDetailStructured);
router.get("/trips/:tripId", getTripDetail);
router.patch("/trips/:tripId", updateTrip);
router.delete("/trips/:tripId", deleteTrip);

export default router;
