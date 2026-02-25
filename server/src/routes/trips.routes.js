import express from "express";
import {
  chatWithTripAssistant,
  chatWithTripAssistantStream,
  createOrGetTripDay,
  createTrip,
  deleteTrip,
  generateAiTripDay,
  generateAiTripItinerary,
  generateAiTripItineraryStream,
  getTripDetail,
  getTripDetailStructured,
  getTrips,
  updateTrip,
} from "../controllers/trips.controller.js";

const router = express.Router();

router.post("/trips", createTrip);
router.get("/trips", getTrips);
router.post("/trips/:tripId/ai-generate", generateAiTripItinerary);
router.post("/trips/:tripId/ai-generate-stream", generateAiTripItineraryStream);
router.post("/trips/:tripId/ai-generate-day", generateAiTripDay);
router.post("/trips/:tripId/ai-chat", chatWithTripAssistant);
router.post("/trips/:tripId/ai-chat-stream", chatWithTripAssistantStream);
router.post("/trips/:tripId/days", createOrGetTripDay);
router.get("/trips/:tripId/detail", getTripDetailStructured);
router.get("/trips/:tripId", getTripDetail);
router.patch("/trips/:tripId", updateTrip);
router.delete("/trips/:tripId", deleteTrip);

export default router;
