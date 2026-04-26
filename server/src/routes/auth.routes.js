import express from "express";
import {
	forgotPassword,
	login,
	register,
	resetPassword,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);

export default router;
