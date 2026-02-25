import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
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

export const getTripDetail = async (tripId) => {
  const res = await api.get(`/trips/${tripId}/detail`);
  return res.data;
};

export const deleteTrip = async (tripId) => {
  if (String(tripId).startsWith("guest-")) {
    guestTrips = guestTrips.filter((trip) => String(trip.trip_id) !== String(tripId));
    return { message: "Trip deleted successfully" };
  }

  const user = getLocalUser();
  if (!user?.user_id) {
    throw new Error("user_id is required");
  }

  const res = await api.delete(`/trips/${tripId}`, {
    params: { user_id: user.user_id },
    data: { user_id: user.user_id },
  });
  return res.data;
};

export const generateAiTripItinerary = async (tripId, payload) => {
  const res = await api.post(`/trips/${tripId}/ai-generate`, payload, {
    timeout: 60000,
  });
  return res.data;
};

export const generateAiTripDayItinerary = async (tripId, payload) => {
  const res = await api.post(`/trips/${tripId}/ai-generate-day`, payload, {
    timeout: 60000,
  });
  return res.data;
};

export const chatWithTripAssistant = async (tripId, payload) => {
  const res = await api.post(`/trips/${tripId}/ai-chat`, payload, {
    timeout: 60000,
  });
  return res.data;
};

export const patchTrip = async (tripId, payload) => {
  const user = getLocalUser();
  if (!user?.user_id) {
    throw new Error("user_id is required");
  }

  const res = await api.patch(
    `/trips/${tripId}`,
    { ...payload, user_id: user.user_id },
    { params: { user_id: user.user_id } }
  );
  return res.data;
};

export const createTripDay = async (tripId, dayNumber) => {
  const user = getLocalUser();
  if (!user?.user_id) {
    throw new Error("user_id is required");
  }
  const res = await api.post(`/trips/${tripId}/days`, {
    user_id: user.user_id,
    day_number: dayNumber,
  });
  return res.data;
};

export const deleteTripDay = async (dayId) => {
  const res = await api.delete(`/days/${dayId}`);
  return res.data;
};

export const patchDayPoiNote = async (dayPoiId, note) => {
  const res = await api.patch(`/day-pois/${dayPoiId}`, { note });
  return res.data;
};

export const patchDayPoiTransportMode = async (dayPoiId, transportModeOverride) => {
  const res = await api.patch(`/day-pois/${dayPoiId}/transport-mode`, {
    transport_mode_override: transportModeOverride,
  });
  return res.data;
};

export const patchPoiImage = async (poiId, imageUrl) => {
  const res = await api.patch(`/pois/${poiId}/image`, {
    image_url: imageUrl ?? null,
  });
  return res.data;
};

export const getPoiPlaceDetails = async (poiId) => {
  const res = await api.get(`/pois/${poiId}/place-details`, {
    timeout: 15000,
  });
  return res.data;
};

export const deleteDayPoi = async (dayPoiId) => {
  const res = await api.delete(`/day-pois/${dayPoiId}`);
  return res.data;
};

export const reorderDayPois = async (dayId, orderedDayPoiIds) => {
  const res = await api.patch(`/days/${dayId}/pois/reorder`, {
    ordered_day_poi_ids: orderedDayPoiIds,
  });
  return res.data;
};

export const addDayPoi = async (dayId, payload) => {
  const res = await api.post(`/days/${dayId}/pois`, payload);
  return res.data;
};

export const clearGuestTrips = () => {
  guestTrips = [];
};

// Favorites API
export const getFavorites = async () => {
  const user = getLocalUser();
  if (!user?.user_id) return [];
  const res = await api.get("/favorites", {
    params: { user_id: user.user_id },
  });
  return res.data;
};

export const createFavorite = async (poiId) => {
  const user = getLocalUser();
  if (!user?.user_id) {
    throw new Error("user_id is required");
  }
  const res = await api.post("/favorites", {
    user_id: user.user_id,
    poi_id: poiId,
  });
  return res.data;
};

export const createFavoriteFromPlace = async (payload) => {
  const user = getLocalUser();
  if (!user?.user_id) {
    throw new Error("user_id is required");
  }
  const res = await api.post("/favorites/from-place", {
    user_id: user.user_id,
    ...payload,
  });
  return res.data;
};

export const deleteFavorite = async (poiId) => {
  const user = getLocalUser();
  if (!user?.user_id) {
    throw new Error("user_id is required");
  }
  const res = await api.delete(`/favorites/${poiId}`, {
    params: { user_id: user.user_id },
    data: { user_id: user.user_id },
  });
  return res.data;
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
