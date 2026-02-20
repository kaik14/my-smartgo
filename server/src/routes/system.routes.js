import express from "express";
import { health, testDb } from "../controllers/system.controller.js";

const router = express.Router();

router.get("/health", health);
router.get("/test-db", testDb);

export default router;
