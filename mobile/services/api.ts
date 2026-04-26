import axios from "axios";
import { getLocalUser } from "./storage";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.0.2.2:3000/api";

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
});

let guestTrips: any[] = [];

export async function getTrips() {
  const user = await getLocalUser();
  if (!user?.user_id) return guestTrips;
  const res = await api.get("/trips", { params: { user_id: user.user_id } });
  return res.data;
}

export async function createTrip(payload: Record<string, unknown>) {
  const user = await getLocalUser();
  if (!user?.user_id) {
    const tempTrip = {
      trip_id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: String(payload.title || "Untitled Trip"),
      destination: String(payload.destination || "Malaysia"),
      start_date: String(payload.start_date || ""),
      end_date: String(payload.end_date || ""),
      created_at: new Date().toISOString(),
    };
    guestTrips = [tempTrip, ...guestTrips];
    return { message: "Trip saved temporarily", trip_id: tempTrip.trip_id };
  }
  const res = await api.post("/trips", { ...payload, user_id: user.user_id });
  return res.data;
}

export async function getTripDetail(tripId: string | number) {
  const res = await api.get(`/trips/${tripId}/detail`);
  return res.data;
}

export async function deleteTrip(tripId: string | number) {
  if (String(tripId).startsWith("guest-")) {
    guestTrips = guestTrips.filter((trip) => String(trip.trip_id) !== String(tripId));
    return { message: "Trip deleted successfully" };
  }
  const user = await getLocalUser();
  if (!user?.user_id) throw new Error("user_id is required");
  const res = await api.delete(`/trips/${tripId}`, {
    params: { user_id: user.user_id },
    data: { user_id: user.user_id },
  });
  return res.data;
}

export async function generateAiTripItinerary(tripId: string | number, payload: Record<string, unknown>) {
  const res = await api.post(`/trips/${tripId}/ai-generate`, payload, { timeout: 60000 });
  return res.data;
}

export async function generateAiTripDayItinerary(tripId: string | number, payload: Record<string, unknown>) {
  const res = await api.post(`/trips/${tripId}/ai-generate-day`, payload, { timeout: 60000 });
  return res.data;
}

export async function chatWithTripAssistant(tripId: string | number, payload: Record<string, unknown>) {
  const res = await api.post(`/trips/${tripId}/ai-chat`, payload, { timeout: 60000 });
  return res.data;
}

export async function patchTrip(tripId: string | number, payload: Record<string, unknown>) {
  const user = await getLocalUser();
  if (!user?.user_id) throw new Error("user_id is required");
  const res = await api.patch(`/trips/${tripId}`, { ...payload, user_id: user.user_id }, { params: { user_id: user.user_id } });
  return res.data;
}

export async function createTripDay(tripId: string | number, dayNumber: number) {
  const user = await getLocalUser();
  if (!user?.user_id) throw new Error("user_id is required");
  const res = await api.post(`/trips/${tripId}/days`, { user_id: user.user_id, day_number: dayNumber });
  return res.data;
}

export async function deleteTripDay(dayId: string | number) {
  const res = await api.delete(`/days/${dayId}`);
  return res.data;
}

export async function patchDayPoiNote(dayPoiId: string | number, note: string) {
  const res = await api.patch(`/day-pois/${dayPoiId}`, { note });
  return res.data;
}

export async function patchDayPoiTransportMode(dayPoiId: string | number, transportModeOverride: string) {
  const res = await api.patch(`/day-pois/${dayPoiId}/transport-mode`, {
    transport_mode_override: transportModeOverride,
  });
  return res.data;
}

export async function patchPoiImage(poiId: string | number, imageUrl: string | null) {
  const res = await api.patch(`/pois/${poiId}/image`, { image_url: imageUrl ?? null });
  return res.data;
}

export async function getPoiPlaceDetails(poiId: string | number) {
  const res = await api.get(`/pois/${poiId}/place-details`, { timeout: 15000 });
  return res.data;
}

export async function deleteDayPoi(dayPoiId: string | number) {
  const res = await api.delete(`/day-pois/${dayPoiId}`);
  return res.data;
}

export async function reorderDayPois(dayId: string | number, orderedDayPoiIds: Array<string | number>) {
  const res = await api.patch(`/days/${dayId}/pois/reorder`, { ordered_day_poi_ids: orderedDayPoiIds });
  return res.data;
}

export async function addDayPoi(dayId: string | number, payload: Record<string, unknown>) {
  const res = await api.post(`/days/${dayId}/pois`, payload);
  return res.data;
}

export function clearGuestTrips() {
  guestTrips = [];
}

export async function getFavorites() {
  const user = await getLocalUser();
  if (!user?.user_id) return [];
  const res = await api.get("/favorites", { params: { user_id: user.user_id } });
  return res.data;
}

export async function createFavorite(poiId: number) {
  const user = await getLocalUser();
  if (!user?.user_id) throw new Error("user_id is required");
  const res = await api.post("/favorites", { user_id: user.user_id, poi_id: poiId });
  return res.data;
}

export async function createFavoriteFromPlace(payload: Record<string, unknown>) {
  const user = await getLocalUser();
  if (!user?.user_id) throw new Error("user_id is required");
  const res = await api.post("/favorites/from-place", { user_id: user.user_id, ...payload });
  return res.data;
}

export async function deleteFavorite(poiId: number) {
  const user = await getLocalUser();
  if (!user?.user_id) throw new Error("user_id is required");
  const res = await api.delete(`/favorites/${poiId}`, {
    params: { user_id: user.user_id },
    data: { user_id: user.user_id },
  });
  return res.data;
}

export async function register(payload: { username: string; email: string; password: string }) {
  const res = await api.post("/auth/register", payload);
  return res.data;
}

export async function login(payload: { username: string; password: string }) {
  const res = await api.post("/auth/login", payload);
  return res.data;
}

export async function forgotPassword(payload: { email: string }) {
  const res = await api.post("/auth/forgot-password", payload);
  return res.data;
}

export async function resetPassword(payload: { token: string; newPassword: string }) {
  const res = await api.post("/auth/reset-password", payload);
  return res.data;
}
