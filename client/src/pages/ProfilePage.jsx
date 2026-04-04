import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "../components/icons";
import PoiDetailPanel from "../components/PoiDetailPanel";
import {
  clearGuestTrips,
  createFavorite,
  deleteFavorite as deleteFavoriteApi,
  getFavorites,
  getPoiPlaceDetails,
  patchPoiImage,
} from "../services/api";

const DEFAULT_MAP_CENTER = { lat: 3.139, lng: 101.6869 };
let googleMapsLoaderPromise = null;

function getPoiImageCacheKey(poi) {
  if (poi?.poi_id) return `poi:${poi.poi_id}`;
  const name = String(poi?.name || "").trim().toLowerCase();
  const address = String(poi?.address || "").trim().toLowerCase();
  return `poi:${name}|${address}`;
}

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

function getPlacePhotoUrl(place, maxWidth = 220) {
  const photos = Array.isArray(place?.photos) ? place.photos : [];
  const first = photos[0];
  if (!first || typeof first.getUrl !== "function") return "";
  try {
    return String(first.getUrl({ maxWidth })) || "";
  } catch {
    return "";
  }
}

function canLoadImageUrl(url, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const text = String(url || "").trim();
    if (!text) {
      resolve(false);
      return;
    }

    const img = new Image();
    let finished = false;
    const done = (ok) => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };

    const timeoutId = setTimeout(() => done(false), timeoutMs);
    img.onload = () => {
      clearTimeout(timeoutId);
      done(true);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      done(false);
    };
    img.src = text;
  });
}

function isLikelyExpiringGooglePhotoUrl(url) {
  const text = String(url || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("maps.googleapis.com/maps/api/place/photo") || text.includes("googleusercontent.com");
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState("");
  const [selectedFavoritePoi, setSelectedFavoritePoi] = useState(null);
  const [favoritePoiDetails, setFavoritePoiDetails] = useState(null);
  const [favoritePoiDetailsLoading, setFavoritePoiDetailsLoading] = useState(false);
  const [favoritePoiDetailsError, setFavoritePoiDetailsError] = useState("");
  const [favoritePoiIntroExpanded, setFavoritePoiIntroExpanded] = useState(false);
  const [favoriteBusyPoiId, setFavoriteBusyPoiId] = useState(null);
  const [poiImageCache, setPoiImageCache] = useState({});
  const placesServiceRef = useRef(null);
  const poiImageRepairInFlightRef = useRef(new Set());
  const poiThumbValidationCheckedRef = useRef(new Set());
  const poiAutoHealAttemptedRef = useRef(new Set());

  const user = useMemo(() => {
    // TODO: replace localStorage fallback with authenticated user API data.
    const raw = localStorage.getItem("smartgo_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "SmartGo | Profile";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user?.user_id) {
      setFavorites([]);
      setFavoritesLoading(false);
      setFavoritesError("");
      return;
    }

    (async () => {
      try {
        setFavoritesLoading(true);
        setFavoritesError("");
        const rows = await getFavorites();
        if (cancelled) return;
        setFavorites(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (cancelled) return;
        setFavorites([]);
        setFavoritesError(err instanceof Error ? err.message : "Failed to load favorites");
      } finally {
        if (!cancelled) setFavoritesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.user_id]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("smartgo_poi_image_cache_v1") || "{}");
      setPoiImageCache(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setPoiImageCache({});
    }
  }, []);

  const writePoiImageCache = (next) => {
    try {
      localStorage.setItem("smartgo_poi_image_cache_v1", JSON.stringify(next));
      setPoiImageCache(next);
    } catch {
      // ignore localStorage quota errors
    }
  };

  const ensurePlacesService = async () => {
    if (placesServiceRef.current) return placesServiceRef.current;
    const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
    if (!apiKey) return null;
    await loadGoogleMapsApi(apiKey);
    if (!window.google?.maps?.places?.PlacesService) return null;
    placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
    return placesServiceRef.current;
  };

  const healFavoritePoiImage = async (poi, failedUrl = "") => {
    const cacheKey = getPoiImageCacheKey(poi);
    if (!cacheKey || poiImageRepairInFlightRef.current.has(cacheKey)) return;

    poiImageRepairInFlightRef.current.add(cacheKey);
    try {
      const service = await ensurePlacesService();
      const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
      if (!service || !statusEnum) return;

      let photoUrl = "";
      const poiId = Number(poi?.poi_id);

      if (Number.isInteger(poiId) && poiId > 0) {
        try {
          const payload = await getPoiPlaceDetails(poiId);
          const placeId = String(payload?.google_place?.place_id || "").trim();
          if (placeId) {
            const details = await new Promise((resolve, reject) => {
              service.getDetails(
                { placeId, fields: ["place_id", "photos"] },
                (result, status) => {
                  if (status === statusEnum.OK) {
                    resolve(result || null);
                    return;
                  }
                  reject(new Error(`Place details failed: ${status}`));
                }
              );
            });
            photoUrl = getPlacePhotoUrl(details, 1200) || getPlacePhotoUrl(details, 220);
          }
        } catch {
          // fallback to text search
        }
      }

      if (!photoUrl) {
        const baseQuery = `${poi?.name || ""} ${poi?.address || ""}`.trim();
        if (!baseQuery) return;
        const queries = [
          `${baseQuery} Malaysia`,
          `${poi?.name || ""} Malaysia`.trim(),
          baseQuery,
        ];

        for (const query of queries) {
          const results = await textSearchPlaces(
            service,
            {
              query,
              location: new window.google.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
              radius: 30000,
            },
            statusEnum
          );
          photoUrl = getPlacePhotoUrl(results[0], 220);
          if (photoUrl) break;
        }
      }

      if (!photoUrl || (failedUrl && photoUrl === failedUrl)) return;

      const nextCache = {
        ...(poiImageCache && typeof poiImageCache === "object" ? poiImageCache : {}),
        [cacheKey]: photoUrl,
      };
      writePoiImageCache(nextCache);

      setFavorites((prev) =>
        prev.map((item) => (Number(item?.poi_id) === poiId ? { ...item, image_url: photoUrl } : item))
      );
      setSelectedFavoritePoi((prev) =>
        Number(prev?.poi?.poi_id) === poiId
          ? { ...prev, poi: { ...(prev.poi || {}), image_url: photoUrl } }
          : prev
      );
      setFavoritePoiDetails((prev) =>
        Number(prev?.poi?.poi_id) === poiId
          ? { ...prev, poi: { ...(prev.poi || {}), image_url: photoUrl } }
          : prev
      );

      if (Number.isInteger(poiId) && poiId > 0) {
        try {
          await patchPoiImage(poiId, photoUrl);
        } catch {
          // ignore transient API errors
        }
      }
    } catch {
      // keep silent; placeholder/fallback still renders
    } finally {
      poiImageRepairInFlightRef.current.delete(cacheKey);
    }
  };

  useEffect(() => {
    if (!favorites.length) return;

    let cancelled = false;
    const run = async () => {
      for (const poi of favorites) {
        if (cancelled) break;
        const cacheKey = getPoiImageCacheKey(poi);
        const attemptKey = Number(poi?.poi_id) > 0 ? `poi:${Number(poi?.poi_id)}` : cacheKey;
        if (attemptKey && !poiAutoHealAttemptedRef.current.has(attemptKey)) {
          poiAutoHealAttemptedRef.current.add(attemptKey);
          await healFavoritePoiImage(poi);
          continue;
        }

        const currentUrl = String(getFavoritePoiThumbUrl(poi) || "").trim();

        if (!currentUrl || isLikelyExpiringGooglePhotoUrl(currentUrl)) {
          await healFavoritePoiImage(poi, currentUrl);
          continue;
        }

        const validationKey = `${cacheKey}|${currentUrl}`;
        if (poiThumbValidationCheckedRef.current.has(validationKey)) continue;
        poiThumbValidationCheckedRef.current.add(validationKey);

        const ok = await canLoadImageUrl(currentUrl, 5000);
        if (!ok) {
          await healFavoritePoiImage(poi, currentUrl);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [favorites, poiImageCache]);

  const handleLogout = () => {
    const shouldLogout = window.confirm("Are you sure you want to log out?");
    if (!shouldLogout) return;
    localStorage.removeItem("smartgo_user");
    clearGuestTrips();
    navigate("/login");
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/trips");
  };

  const getFavoritePoiThumbUrl = (poi) => {
    const dbUrl = String(poi?.image_url || "").trim();
    if (poi?.poi_id && poiImageCache[`poi:${poi.poi_id}`]) return String(poiImageCache[`poi:${poi.poi_id}`] || "");
    const name = String(poi?.name || "").trim().toLowerCase();
    const address = String(poi?.address || "").trim().toLowerCase();
    const fallbackKey = `poi:${name}|${address}`;
    if (poiImageCache[fallbackKey]) return String(poiImageCache[fallbackKey] || "");
    return dbUrl;
  };

  const openFavoritePoiDetail = async (poi) => {
    if (!poi?.poi_id) return;
    const thumbUrl = getFavoritePoiThumbUrl(poi);
    setSelectedFavoritePoi({
      poiId: poi.poi_id,
      poi: {
        poi_id: poi.poi_id,
        name: poi.name,
        type: poi.type,
        address: poi.address,
        description: poi.description,
        image_url: thumbUrl || poi.image_url || null,
        lat: poi.lat ?? null,
        lng: poi.lng ?? null,
      },
    });
    setFavoritePoiIntroExpanded(false);
    setFavoritePoiDetailsError("");
    setFavoritePoiDetails(null);
    setFavoritePoiDetailsLoading(true);
    try {
      const payload = await getPoiPlaceDetails(poi.poi_id);
      setFavoritePoiDetails(payload);
    } catch (err) {
      setFavoritePoiDetailsError(err instanceof Error ? err.message : "Failed to load place details");
    } finally {
      setFavoritePoiDetailsLoading(false);
    }
  };

  const handleToggleFavoriteFromProfileDetail = async () => {
    const poiId = Number(selectedFavoritePoi?.poi?.poi_id ?? favoritePoiDetails?.poi?.poi_id);
    if (!Number.isInteger(poiId) || poiId <= 0 || !user?.user_id) return;
    const isFavorite = favorites.some((item) => Number(item?.poi_id) === poiId);

    try {
      setFavoriteBusyPoiId(poiId);
      setFavoritePoiDetailsError("");
      if (isFavorite) {
        await deleteFavoriteApi(poiId);
        setFavorites((prev) => prev.filter((item) => Number(item?.poi_id) !== poiId));
      } else {
        await createFavorite(poiId);
        const sourcePoi = favoritePoiDetails?.poi || selectedFavoritePoi?.poi;
        if (sourcePoi) {
          setFavorites((prev) => [
            {
              poi_id: poiId,
              name: sourcePoi.name || "Unnamed POI",
              type: sourcePoi.type || "other",
              address: sourcePoi.address || "",
              description: sourcePoi.description || "",
              image_url: sourcePoi.image_url || null,
              lat: sourcePoi.lat ?? null,
              lng: sourcePoi.lng ?? null,
            },
            ...prev.filter((item) => Number(item?.poi_id) !== poiId),
          ]);
        }
      }
    } catch (err) {
      setFavoritePoiDetailsError(err instanceof Error ? err.message : "Failed to update favorite");
    } finally {
      setFavoriteBusyPoiId(null);
    }
  };

  return (
    <div>
      <div className="row" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <div className="h1" style={{ marginBottom: 4, marginTop: 0 }}>Profile</div>
        <button
          type="button"
          className="iconBtn"
          aria-label="Back"
          onClick={handleBack}
          title="Back"
        >
          <ArrowLeftIcon />
        </button>
      </div>
      <div className="muted">Your account and saved places</div>

      <div className="glass profileCard" style={{ marginTop: 16 }}>
        <div className="sectionTitle" style={{ marginTop: 0 }}>User Info</div>
        <div className="profileRow">
          <span className="muted">Username</span>
          <strong>{user?.username || "Guest"}</strong>
        </div>
        <div className="profileRow">
          <span className="muted">Email</span>
          <strong>{user?.email || "Not logged in"}</strong>
        </div>
      </div>

      <div className="sectionTitle">Favorite POIs</div>
      <div className="stack">
        {!user ? (
          <div className="glass poiCard">
            <div className="muted">Log in to see your saved POIs.</div>
          </div>
        ) : favoritesLoading ? (
          <div className="glass poiCard">
            <div className="muted">Loading favorites...</div>
          </div>
        ) : favoritesError ? (
          <div className="glass poiCard">
            <div className="muted" style={{ color: "#b91c1c" }}>{favoritesError}</div>
          </div>
        ) : favorites.length === 0 ? (
          <div className="glass poiCard">
            <div className="muted">No favorite POIs yet.</div>
          </div>
        ) : (
          favorites.map((poi) => (
            <div
              key={poi.poi_id}
              className="glass poiCard"
              role="button"
              tabIndex={0}
              onClick={() => void openFavoritePoiDetail(poi)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void openFavoritePoiDetail(poi);
                }
              }}
              style={{ cursor: "pointer" }}
              title="Open POI details"
            >
              <div className="row" style={{ alignItems: "stretch", gap: 12, justifyContent: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{poi.name}</div>
                  <div className="muted">{String(poi.type || "other").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                  {poi.address ? (
                    <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35 }}>
                      {poi.address}
                    </div>
                  ) : null}
                </div>
                <div style={favoriteThumbWrapStyle} aria-hidden="true">
                  {getFavoritePoiThumbUrl(poi) ? (
                    <img
                      src={getFavoritePoiThumbUrl(poi)}
                      alt=""
                      style={favoriteThumbImgStyle}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onLoad={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onError={(e) => {
                        const failedSrc = String(e.currentTarget?.src || "").trim();
                        e.currentTarget.style.opacity = "0";
                        e.currentTarget.removeAttribute("src");
                        void healFavoritePoiImage(poi, failedSrc);
                      }}
                    />
                  ) : (
                    <div style={favoriteThumbPlaceholderStyle}>
                      {String(poi.name || "?").trim().slice(0, 1).toUpperCase() || "?"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {!user ? (
        <div className="profileAuthCta">
          <button className="primaryBtn" onClick={() => navigate("/login")}>
            Login
          </button>
          <button className="textLink" onClick={() => navigate("/register")}>
            Register
          </button>
        </div>
      ) : null}

      {user ? (
        <div className="profileLogoutWrap">
          <button className="profileLogoutBtn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      ) : null}

      <PoiDetailPanel
        key={String(selectedFavoritePoi?.poi?.poi_id || "favorite-poi")}
        open={Boolean(selectedFavoritePoi)}
        isDesktop={typeof window !== "undefined" && window.innerWidth >= 960}
        target={selectedFavoritePoi}
        loading={favoritePoiDetailsLoading}
        error={favoritePoiDetailsError}
        details={favoritePoiDetails}
        introExpanded={favoritePoiIntroExpanded}
        onToggleIntro={() => setFavoritePoiIntroExpanded((v) => !v)}
        onClose={() => {
          setSelectedFavoritePoi(null);
          setFavoritePoiDetails(null);
          setFavoritePoiDetailsError("");
          setFavoritePoiDetailsLoading(false);
          setFavoritePoiIntroExpanded(false);
        }}
        canFavorite={Boolean(user?.user_id)}
        isFavorite={favorites.some((item) => Number(item?.poi_id) === Number(selectedFavoritePoi?.poi?.poi_id))}
        favoriteBusy={favoriteBusyPoiId === Number(selectedFavoritePoi?.poi?.poi_id)}
        onToggleFavorite={() => void handleToggleFavoriteFromProfileDetail()}
      />
    </div>
  );
}

const favoriteThumbWrapStyle = {
  width: 78,
  minWidth: 78,
  height: 78,
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

const favoriteThumbImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  opacity: 0,
  transition: "opacity 0.2s ease",
};

const favoriteThumbPlaceholderStyle = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  fontSize: 24,
  fontWeight: 800,
  color: "#475569",
  background: "linear-gradient(135deg, rgba(56,189,248,0.1), rgba(14,165,233,0.08))",
};
