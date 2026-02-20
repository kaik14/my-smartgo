import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

// Trips API
export const getTrips = async () => {
  const res = await api.get("/trips");
  return res.data;
};

// 创建 trip
export const createTrip = async (payload) => {
  const res = await api.post("/trips", payload);
  return res.data;
};