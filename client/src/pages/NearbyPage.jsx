import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, LocationArrowIcon } from "../components/icons";

const DEFAULT_CENTER = { lat: 3.139, lng: 101.6869 };
const SEARCH_RADIUS_METERS = 2500;
const MAX_RESULTS_PER_TYPE = 8;

let googleMapsLoaderPromise = null;

function loadGoogleMapsApi(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-sdk="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("Google Maps SDK loaded but unavailable"));
      });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsSdk = "true";
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps SDK loaded but unavailable"));
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps SDK"));
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

async function ensurePlacesLibrary() {
  if (window.google?.maps?.places) return;
  if (typeof window.google?.maps?.importLibrary === "function") {
    await window.google.maps.importLibrary("places");
    return;
  }
  throw new Error("Google Places library is not available");
}

function nearbySearch(service, request, statusEnum) {
  return new Promise((resolve, reject) => {
    service.nearbySearch(request, (results, status) => {
      if (status === statusEnum.OK || status === statusEnum.ZERO_RESULTS) {
        resolve(results ?? []);
        return;
      }
      reject(new Error(`Places request failed: ${status}`));
    });
  });
}

function toPlainPlace(place, fallbackType) {
  const lat = place.geometry?.location?.lat?.();
  const lng = place.geometry?.location?.lng?.();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const normalizedType = place.types?.includes("restaurant") || place.types?.includes("cafe")
    ? "food"
    : place.types?.includes("tourist_attraction") || place.types?.includes("museum")
      ? "attractions"
      : fallbackType;

  return {
    placeId: place.place_id,
    name: place.name || "Unnamed place",
    lat,
    lng,
    type: normalizedType,
  };
}

function mergePlacesById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list) {
      if (!item?.placeId) continue;
      if (!map.has(item.placeId)) map.set(item.placeId, item);
    }
  }
  return Array.from(map.values());
}

function cacheKeyFor(tab, center) {
  const lat = center?.lat ?? DEFAULT_CENTER.lat;
  const lng = center?.lng ?? DEFAULT_CENTER.lng;
  // Round coords to reduce duplicate queries caused by tiny GPS drift
  return `${tab}:${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export default function NearbyPage() {
  const [tab, setTab] = useState("all");
  const [mapLoading, setMapLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [places, setPlaces] = useState([]);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const poiMarkerRefs = useRef([]);
  const placesServiceRef = useRef(null);
  const placesCacheRef = useRef(new Map());
  const debounceTimerRef = useRef(null);

  const centerForSearch = userLocation ?? DEFAULT_CENTER;

  const handleLocateUser = (options = {}) => {
    const { silent = false } = options;
    if (locating) return;

    if (!navigator.geolocation) {
      if (!silent) setLocateError("Geolocation is not supported in this browser");
      return;
    }

    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) {
      if (!silent) setLocateError("Map is not ready yet");
      return;
    }

    setLocating(true);
    if (!silent) setLocateError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(nextCenter);
        map.panTo(nextCenter);
        map.setZoom(14);

        if (userMarkerRef.current) {
          userMarkerRef.current.setMap(null);
          userMarkerRef.current = null;
        }

        setLocating(false);
      },
      (err) => {
        if (!silent) {
          const messageByCode = {
            1: "Location permission denied",
            2: "Location unavailable",
            3: "Location request timed out",
          };
          setLocateError(messageByCode[err.code] || "Failed to get location");
        }
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    let cancelled = false;

    if (!apiKey) {
      setMapLoading(false);
      setMapError("Missing VITE_GOOGLE_MAPS_API_KEY");
      return;
    }

    (async () => {
      try {
        setMapLoading(true);
        setMapError("");
        const maps = await loadGoogleMapsApi(apiKey);
        await ensurePlacesLibrary();
        if (cancelled) return;
        if (!mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center: DEFAULT_CENTER,
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }

        if (!placesServiceRef.current) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(mapRef.current);
        }

        setMapReady(true);

        // Nearby defaults to user location if browser grants permission.
        handleLocateUser({ silent: true });
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : "Failed to load map");
        }
      } finally {
        if (!cancelled) {
          setMapLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!mapReady || !map || !maps) return;

    for (const marker of poiMarkerRefs.current) {
      marker.setMap(null);
    }
    poiMarkerRefs.current = [];

    // Intentionally do not render custom markers for now.
    // Keep places data fetching/filtering so we can verify logic without UI markers.
    poiMarkerRefs.current = [];
  }, [places, mapReady]);

  useEffect(() => {
    if (!mapReady || !placesServiceRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const service = placesServiceRef.current;
      const googlePlaces = window.google?.maps?.places;
      if (!service || !googlePlaces) return;

      const key = cacheKeyFor(tab, centerForSearch);
      const cached = placesCacheRef.current.get(key);
      if (cached) {
        setPlaces(cached);
        setPlacesError("");
        return;
      }

      try {
        setPlacesLoading(true);
        setPlacesError("");

        const baseRequest = {
          location: centerForSearch,
          radius: SEARCH_RADIUS_METERS,
        };

        let nextPlaces = [];

        if (tab === "food") {
          const results = await nearbySearch(
            service,
            { ...baseRequest, type: "restaurant" },
            googlePlaces.PlacesServiceStatus
          );
          nextPlaces = results
            .slice(0, MAX_RESULTS_PER_TYPE)
            .map((p) => toPlainPlace(p, "food"))
            .filter(Boolean);
        } else if (tab === "attractions") {
          const results = await nearbySearch(
            service,
            { ...baseRequest, type: "tourist_attraction" },
            googlePlaces.PlacesServiceStatus
          );
          nextPlaces = results
            .slice(0, MAX_RESULTS_PER_TYPE)
            .map((p) => toPlainPlace(p, "attractions"))
            .filter(Boolean);
        } else {
          const foodKey = cacheKeyFor("food", centerForSearch);
          const attractionsKey = cacheKeyFor("attractions", centerForSearch);

          let foodPlaces = placesCacheRef.current.get(foodKey);
          let attractionPlaces = placesCacheRef.current.get(attractionsKey);

          if (!foodPlaces) {
            const foodResults = await nearbySearch(
              service,
              { ...baseRequest, type: "restaurant" },
              googlePlaces.PlacesServiceStatus
            );
            foodPlaces = foodResults
              .slice(0, MAX_RESULTS_PER_TYPE)
              .map((p) => toPlainPlace(p, "food"))
              .filter(Boolean);
            placesCacheRef.current.set(foodKey, foodPlaces);
          }

          if (!attractionPlaces) {
            const attractionResults = await nearbySearch(
              service,
              { ...baseRequest, type: "tourist_attraction" },
              googlePlaces.PlacesServiceStatus
            );
            attractionPlaces = attractionResults
              .slice(0, MAX_RESULTS_PER_TYPE)
              .map((p) => toPlainPlace(p, "attractions"))
              .filter(Boolean);
            placesCacheRef.current.set(attractionsKey, attractionPlaces);
          }

          nextPlaces = mergePlacesById(foodPlaces, attractionPlaces);
        }

        placesCacheRef.current.set(key, nextPlaces);
        setPlaces(nextPlaces);
      } catch (err) {
        setPlacesError(err instanceof Error ? err.message : "Failed to fetch nearby places");
        setPlaces([]);
      } finally {
        setPlacesLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [tab, centerForSearch.lat, centerForSearch.lng, mapReady]);

  const activeCount = places.length;
  const activeLabel = useMemo(() => {
    if (tab === "food") return "Food";
    if (tab === "attractions") return "Attractions";
    return "All";
  }, [tab]);

  return (
    <div className="nearbyPage">
      <div className="mapStage">
        <div className="nearbyHeader">
          <div>
            <div className="nearbyTitle">
              Kuala Lumpur
              <span className="nearbyCaret">
                <ChevronDownIcon />
              </span>
            </div>
            <div className="muted nearbyWeather">Light Rain | 23° - 31°</div>
          </div>
          <button
            className="iconBtn nearbyLocateBtn"
            aria-label="locate"
            onClick={() => handleLocateUser()}
            disabled={locating}
            title={locating ? "Locating..." : "Locate me"}
          >
            <LocationArrowIcon />
          </button>
        </div>

        <div className="mapCanvas" aria-label="nearby map" style={{ position: "relative" }}>
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
          {mapLoading ? (
            <div style={mapOverlayStyle}>Loading map...</div>
          ) : mapError ? (
            <div style={mapOverlayStyle}>{mapError}</div>
          ) : null}
        </div>

        {locateError ? <div style={locateErrorStyle}>{locateError}</div> : null}

        <div style={placesHintStyle}>
          {placesLoading ? "Loading nearby places..." : placesError ? placesError : `Showing ${activeLabel}: ${activeCount} places`}
        </div>

        <div className="pillGroup nearbyPills">
          <button type="button" className={`pill ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
            All
          </button>
          <button type="button" className={`pill ${tab === "food" ? "active" : ""}`} onClick={() => setTab("food")}>
            Food
          </button>
          <button
            type="button"
            className={`pill ${tab === "attractions" ? "active" : ""}`}
            onClick={() => setTab("attractions")}
          >
            Attractions
          </button>
        </div>
      </div>
    </div>
  );
}

const mapOverlayStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 12,
  color: "#334155",
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(2px)",
  fontSize: 14,
};

const locateErrorStyle = {
  position: "absolute",
  left: 14,
  right: 14,
  bottom: 86,
  zIndex: 4,
  background: "rgba(220, 38, 38, 0.92)",
  color: "#fff",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 13,
  textAlign: "center",
  boxShadow: "0 8px 20px rgba(15,23,42,0.15)",
};

const placesHintStyle = {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: "calc(14px + env(safe-area-inset-bottom) + 74px + 74px)",
  zIndex: 4,
  textAlign: "center",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
  textShadow: "0 1px 2px rgba(255,255,255,0.8)",
  pointerEvents: "none",
};
