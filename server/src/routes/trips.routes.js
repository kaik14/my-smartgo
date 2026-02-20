import express from "express";
import { createTrip, getTripDetail, getTrips, updateTrip } from "../controllers/trips.controller.js";

const router = express.Router();

router.post("/trips", createTrip);
router.get("/trips", getTrips);
router.get("/trips/:trip_id", getTripDetail);
router.patch("/trips/:trip_id", updateTrip);

export default router;
