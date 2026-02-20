import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

let guestTrips = [];

const getLocalUser = () => {
  const raw = localStorage.getItem("smartgo_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Trips API
export const getTrips = async () => {
  const user = getLocalUser();
  if (!user?.user_id) {
    return guestTrips;
  }

  const res = await api.get("/trips", {
    params: { user_id: user.user_id },
  });
  return res.data;
};

export const createTrip = async (payload) => {
  const user = getLocalUser();
  if (!user?.user_id) {
    const tempTrip = {
      trip_id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: payload.title,
      destination: payload.destination,
      start_date: payload.start_date,
      end_date: payload.end_date,
      created_at: new Date().toISOString(),
    };
    guestTrips = [tempTrip, ...guestTrips];
    return {
      message: "Trip saved temporarily",
      trip_id: tempTrip.trip_id,
    };
  }

  const res = await api.post("/trips", {
    ...payload,
    user_id: user.user_id,
  });
  return res.data;
};

export const clearGuestTrips = () => {
  guestTrips = [];
};

// Auth API
export const register = async (payload) => {
  const res = await api.post("/auth/register", payload);
  return res.data;
};

export const login = async (payload) => {
  const res = await api.post("/auth/login", payload);
  return res.data;
};
