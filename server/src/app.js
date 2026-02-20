import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import systemRoutes from "./routes/system.routes.js";
import tripsRoutes from "./routes/trips.routes.js";
import favoritesRoutes from "./routes/favorites.routes.js";
import dayPoisRoutes from "./routes/day-pois.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", systemRoutes);
app.use("/api", authRoutes);
app.use("/api", tripsRoutes);
app.use("/api", favoritesRoutes);
app.use("/api", dayPoisRoutes);

export default app;
