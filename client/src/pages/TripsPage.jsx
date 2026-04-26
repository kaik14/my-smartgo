import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import TripCard from "../components/TripCard";
import { UserIcon } from "../components/icons";
import { getTrips, patchTrip } from "../services/api";

function getTripCoverCacheKey(tripId) {
  return `smartgo_trip_cover_image_${tripId}`;
}

function readTripCoverImage(tripId) {
  if (!tripId) return "";
  try {
    return String(localStorage.getItem(getTripCoverCacheKey(tripId)) || "");
  } catch {
    return "";
  }
}

function writeTripCoverImageCache(tripId, imageUrl) {
  if (!tripId) return;
  const nextUrl = String(imageUrl || "").trim();
  if (!nextUrl) return;
  try {
    localStorage.setItem(getTripCoverCacheKey(tripId), nextUrl);
  } catch {
    // ignore localStorage errors
  }
}

let googleMapsLoaderPromise = null;

function loadGoogleMapsApi(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-sdk="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps?.places) resolve(window.google.maps);
        else reject(new Error("Google Maps SDK loaded but unavailable"));
      });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=en&region=MY`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsSdk = "true";
    script.onload = () => {
      if (window.google?.maps?.places) resolve(window.google.maps);
      else reject(new Error("Google Maps SDK loaded but unavailable"));
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps SDK"));
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

function textSearchPlaces(service, request, statusEnum) {
  return new Promise((resolve, reject) => {
    service.textSearch(request, (results, status) => {
      if (status === statusEnum.OK || status === statusEnum.ZERO_RESULTS) {
        resolve(results || []);
        return;
      }
      reject(new Error(`Places search failed: ${status}`));
    });
  });
}

function getPlacePhotoUrl(place, maxWidth = 1200) {
  const photos = Array.isArray(place?.photos) ? place.photos : [];
  const first = photos[0];
  if (!first || typeof first.getUrl !== "function") return "";
  try {
    return String(first.getUrl({ maxWidth })) || "";
  } catch {
    return "";
  }
}

function isLegacyGooglePlacesPhotoUrl(url) {
  const text = String(url || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("maps.googleapis.com/maps/api/place/photo") && text.includes("photoreference=");
}

function getCoverRefreshCacheKey(tripId) {
  return `smartgo_trip_cover_refresh_ts_${tripId}`;
}

function getLastCoverRefreshTime(tripId) {
  if (!tripId) return 0;
  try {
    return Number(localStorage.getItem(getCoverRefreshCacheKey(tripId)) || 0);
  } catch {
    return 0;
  }
}

function recordCoverRefreshTime(tripId) {
  if (!tripId) return;
  try {
    localStorage.setItem(getCoverRefreshCacheKey(tripId), String(Date.now()));
  } catch {
    // ignore localStorage errors
  }
}

export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const placesServiceRef = useRef(null);
  const coverRefreshInFlightRef = useRef(new Set());

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "SmartGo | My Trips";
    }
  }, []);

  const ensurePlacesService = async () => {
    if (placesServiceRef.current) return placesServiceRef.current;
    const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
    if (!apiKey) return null;
    await loadGoogleMapsApi(apiKey);
    if (!window.google?.maps?.places?.PlacesService) return null;
    placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
    return placesServiceRef.current;
  };

  const refreshTripCoverImage = async (trip, reason = "manual") => {
    const tripId = Number(trip?.trip_id);
    if (!Number.isInteger(tripId) || tripId <= 0) return;
    if (coverRefreshInFlightRef.current.has(tripId)) return;

    const destinationText = String(trip?.destination || "").trim();
    if (!destinationText) return;

    coverRefreshInFlightRef.current.add(tripId);
    try {
      const service = await ensurePlacesService();
      const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
      if (!service || !statusEnum) return;

      const queries = [
        `${destinationText} Malaysia`,
        `${destinationText} city Malaysia`,
        `${destinationText} skyline Malaysia`,
        destinationText,
      ];

      let photoUrl = "";
      for (const query of queries) {
        const results = await textSearchPlaces(
          service,
          {
            query,
            location: new window.google.maps.LatLng(3.139, 101.6869),
            radius: 50000,
          },
          statusEnum
        );
        photoUrl = getPlacePhotoUrl(results[0], 1200);
        if (photoUrl) break;
      }

      if (!photoUrl) return;

      setTrips((prev) => (
        prev.map((item) => (
          Number(item?.trip_id) === tripId
            ? { ...item, cover_image_url: photoUrl }
            : item
        ))
      ));
      writeTripCoverImageCache(tripId, photoUrl);
      recordCoverRefreshTime(tripId);

      try {
        await patchTrip(tripId, { cover_image_url: photoUrl });
      } catch {
        // ignore guest mode or transient API failures
      }
    } catch {
      // keep silent; image fallback will still render
    } finally {
      coverRefreshInFlightRef.current.delete(tripId);
    }
  };

  const handleTripCoverError = async (trip) => {
    await refreshTripCoverImage(trip, "error");
  };

  useEffect(() => {
    (async () => {
      const data = await getTrips();
      setTrips(data);
      setLoading(false);
    })();
  }, []);

  // Auto-warm cover images on first load: check and refresh if legacy Google URL or too old
  useEffect(() => {
    if (loading || trips.length === 0) return;

    const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const needsRefresh = trips.filter((trip) => {
      const current = String(trip?.cover_image_url || "").trim();
      // If no cover at all, or it's a legacy Google photo URL, or not refreshed in 7 days: needs refresh
      if (!current) return true;
      if (isLegacyGooglePlacesPhotoUrl(current)) return true;
      const lastRefresh = getLastCoverRefreshTime(trip.trip_id);
      if (lastRefresh && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return false;
      return true;
    });

    // Silently refresh in background; don't block UI
    (async () => {
      for (const trip of needsRefresh) {
        await refreshTripCoverImage(trip, "auto-warm");
        // Small delay to avoid hammering the API
        await new Promise((r) => setTimeout(r, 200));
      }
    })();
  }, [loading, trips]);

  return (
    <div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <div className="h1" style={{ marginBottom: 4 }}>My Trips</div>
          <div className="muted">Your itinerary list</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="iconBtn" aria-label="profile" onClick={() => navigate("/profile")}>
            <UserIcon />
          </button>
        </div>
      </div>

      <div className="stack tripGrid" style={{ marginTop: 18 }}>
        {loading ? (
          <div className="muted">Loading...</div>
        ) : trips.length === 0 ? (
          <div className="muted">No trips yet. Tap + to create.</div>
        ) : (
          trips.map((trip, idx) => {
            const variants = ["mint", "green", "peach", ""];
            const variant = variants[idx % variants.length];
            const coverImage = readTripCoverImage(trip.trip_id);
            return (
              <TripCard
                key={trip.trip_id}
                trip={{ ...trip, cover_image_url: trip.cover_image_url || coverImage || null }}
                variant={variant}
                onClick={() => navigate(`/trips/${trip.trip_id}`)}
                onCoverError={handleTripCoverError}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
