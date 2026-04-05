import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import PoiDetailPanel from "../components/PoiDetailPanel";
import { isLikelyMalaysiaCoordinates, MALAYSIA_MAP_BOUNDS } from "../utils/malaysiaGeo";
import {
  addDayPoi,
  createFavorite,
  createFavoriteFromPlace,
  createTripDay,
  deleteFavorite as deleteFavoriteApi,
  deleteTripDay as deleteTripDayApi,
  deleteDayPoi,
  deleteTrip,
  getFavorites,
  getPoiPlaceDetails,
  getTripDetail,
  patchDayPoiNote,
  patchDayPoiTransportMode,
  patchPoiImage,
  patchTrip,
  reorderDayPois,
} from "../services/api";
import {
  formatDateRange,
  formatDayFromTripStart,
  getInclusiveDayCount,
  formatTripWeatherDate,
  getWeatherCodeLabel,
  getTripWeatherCoords,
  withUpdatedDayCountInTitle,
  readSmartPlanProgress,
  clearSmartPlanProgress,
  getPoiImageCacheKey,
  readPoiImageCache,
  writePoiImageCache,
  writeTripCoverImageOnce,
  writeTripCoverImageCache,
  isLegacyGooglePlacesPhotoUrl,
  getPlacePhotoUrl,
  canLoadImageUrl,
  DEFAULT_MAP_CENTER,
  MALAYSIA_CITY_OPTIONS,
  loadGoogleMapsApi,
  requestDirections,
  nearbySearchPlaces,
  getPlaceDetailsById,
  toRecommendedPlace,
  mergePlacesByIdLocal,
  sortPlacesByQualityLocal,
  createRecommendedMarkerIcon,
  formatPrimaryTypeLabelLocal,
  looksEnglishReviewTextLocal,
  pickPanelReviewQuotesLocal,
  normalizePlaceDetailsForPanel,
  textSearchPlaces,
  buildPoiRouteSegments,
  getRouteModeMeta,
  getLegModeKey,
  getAutoSegmentModeByDistance,
  requestDirectionsModesInOrder,
  ROUTE_COLORS,
  TRIP_RECOMMEND_RADIUS_METERS,
  TRIP_RECOMMEND_MAX_RESULTS,
  getPoiIncomingRouteSegment,
  createDayTagIcon,
} from "./trip-detail/utils/tripDetailHelpers";
import {
  sectionCardStyle,
  poiCardStyle,
  poiCardEditableStyle,
  poiCardClickableStyle,
  poiCardSelectedStyle,
  poiCardDraggingStyle,
  poiThumbWrapStyle,
  poiThumbImgStyle,
  poiThumbPlaceholderStyle,
  dragHandleStyle,
  overviewRouteTextStyle,
  dayHeaderActionBtnStyle,
  deletePoiBtnStyle,
  deletePoiBtnMobileTopRightStyle,
  noteButtonStyle,
  errorTextStyle,
  activeTabStyle,
  tripMenuButtonStyle,
  tripMenuCardStyle,
  tripMenuItemStyle,
  tripMenuDangerItemStyle,
  pageShellStyle,
  drawerStyle,
} from "./trip-detail/styles/tripDetailStyles";
import { PoiRouteSegmentMeta, TrashLineIcon } from "./trip-detail/components/RouteSegmentMeta";
import TripDetailModals from "./trip-detail/components/TripDetailModals";
import TripDetailHeroMap from "./trip-detail/components/TripDetailHeroMap";
import TripDetailOverviewPanels from "./trip-detail/components/TripDetailOverviewPanels";
import TripDetailFloatingActions from "./trip-detail/components/TripDetailFloatingActions";
export default function TripDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tripId } = useParams();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeDayInfo, setRouteDayInfo] = useState({});
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [segmentModeOverrides, setSegmentModeOverrides] = useState({});

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingDayPoiId, setEditingDayPoiId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [editingTripNote, setEditingTripNote] = useState(false);
  const [tripNoteDraft, setTripNoteDraft] = useState("");
  const [savingTripNote, setSavingTripNote] = useState(false);
  const [tripNoteError, setTripNoteError] = useState("");
  const [tripWeatherLoading, setTripWeatherLoading] = useState(false);
  const [tripWeatherError, setTripWeatherError] = useState("");
  const [tripWeatherDays, setTripWeatherDays] = useState([]);
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [tripDatesModalOpen, setTripDatesModalOpen] = useState(false);
  const [tripDateDraft, setTripDateDraft] = useState({ start_date: "", end_date: "" });
  const [savingTripDates, setSavingTripDates] = useState(false);
  const [tripDatesError, setTripDatesError] = useState("");
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const [floatingRouteCtaRight, setFloatingRouteCtaRight] = useState(16);
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [routeEditBusy, setRouteEditBusy] = useState(false);
  const [routeEditError, setRouteEditError] = useState("");
  const [draggingDayPoi, setDraggingDayPoi] = useState(null);
  const [addPoiModalOpen, setAddPoiModalOpen] = useState(false);
  const [addPoiTargetDay, setAddPoiTargetDay] = useState(null);
  const [poiSearchQuery, setPoiSearchQuery] = useState("");
  const [poiSearchResults, setPoiSearchResults] = useState([]);
  const [poiSearchLoading, setPoiSearchLoading] = useState(false);
  const [poiSearchError, setPoiSearchError] = useState("");
  const [addingPoi, setAddingPoi] = useState(false);
  const [smartPlanProgress, setSmartPlanProgress] = useState(null);
  const [poiImageUrls, setPoiImageUrls] = useState({});
  const [selectedPoiDetailTarget, setSelectedPoiDetailTarget] = useState(null);
  const [poiDetailPanelOpen, setPoiDetailPanelOpen] = useState(false);
  const [poiDetailLoading, setPoiDetailLoading] = useState(false);
  const [poiDetailError, setPoiDetailError] = useState("");
  const [poiDetailData, setPoiDetailData] = useState(null);
  const [poiDetailRequestKey, setPoiDetailRequestKey] = useState("");
  const [poiDetailIntroExpanded, setPoiDetailIntroExpanded] = useState(false);
  const [poiPlaceDetailsCacheByPoiId, setPoiPlaceDetailsCacheByPoiId] = useState({});
  const [favoritePoiIds, setFavoritePoiIds] = useState([]);
  const [favoriteBusyPoiId, setFavoriteBusyPoiId] = useState(null);
  const [showRecommendedPois, setShowRecommendedPois] = useState(false);
  const [recommendedPois, setRecommendedPois] = useState([]);
  const [recommendedPoisLoading, setRecommendedPoisLoading] = useState(false);
  const [recommendedPoisError, setRecommendedPoisError] = useState("");
  const [recommendedSearchCenter, setRecommendedSearchCenter] = useState(null);
  const [recommendedLocationLabel, setRecommendedLocationLabel] = useState("Nearby in Malaysia");
  const [recommendedCityPickerOpen, setRecommendedCityPickerOpen] = useState(false);
  const [recommendedCitySearch, setRecommendedCitySearch] = useState("");
  const [recommendedCityPickerError, setRecommendedCityPickerError] = useState("");
  const [recommendedCitySwitching, setRecommendedCitySwitching] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef([]);
  const routeRendererRefs = useRef([]);
  const recommendedMarkerRefs = useRef([]);
  const drawerRef = useRef(null);
  const placesServiceRef = useRef(null);
  const poiImageLookupInFlightRef = useRef(new Set());
  const poiThumbValidationInFlightRef = useRef(new Set());
  const poiAutoHealAttemptedRef = useRef(new Set());
  const poiImagePersistInFlightRef = useRef(new Set());
  const tripCoverPersistAttemptedRef = useRef(new Set());
  const destinationCoverLookupInFlightRef = useRef(false);
  const poiDetailRequestSeqRef = useRef(0);
  const poiDetailHiResImageLookupRef = useRef(new Set());
  const recommendedSearchCacheRef = useRef(new Map());
  const recommendedIdleListenerRef = useRef(null);
  const recommendedDebounceTimerRef = useRef(null);
  const recommendedLocationLabelCacheRef = useRef(new Map());
  const recommendedLocationLabelTimerRef = useRef(null);
  const recommendedLocationReqSeqRef = useRef(0);
  const favoritePoiIdByPlaceIdRef = useRef(new Map());
  const placeDetailPanelCacheRef = useRef(new Map());

  useEffect(() => {
    setActiveTab("overview");
    setMapLoading(true);
    setMapError("");
    setRouteLoading(false);
    setRouteError("");
    setRouteDayInfo({});
    setMapReadyVersion(0);
    setSegmentModeOverrides({});

    for (const marker of markerRefs.current) marker.setMap(null);
    markerRefs.current = [];
    for (const renderer of routeRendererRefs.current) renderer.setMap(null);
    routeRendererRefs.current = [];
    mapRef.current = null;
    poiImageLookupInFlightRef.current = new Set();
    poiThumbValidationInFlightRef.current = new Set();
    poiAutoHealAttemptedRef.current = new Set();
    poiImagePersistInFlightRef.current = new Set();
    tripCoverPersistAttemptedRef.current = new Set();
    destinationCoverLookupInFlightRef.current = false;
    poiDetailRequestSeqRef.current = 0;
    poiDetailHiResImageLookupRef.current = new Set();
    recommendedSearchCacheRef.current = new Map();
    if (recommendedDebounceTimerRef.current) {
      clearTimeout(recommendedDebounceTimerRef.current);
      recommendedDebounceTimerRef.current = null;
    }
    if (recommendedLocationLabelTimerRef.current) {
      clearTimeout(recommendedLocationLabelTimerRef.current);
      recommendedLocationLabelTimerRef.current = null;
    }
    setShowRecommendedPois(false);
    setRecommendedPois([]);
    setRecommendedPoisLoading(false);
    setRecommendedPoisError("");
    setRecommendedSearchCenter(null);
    setRecommendedLocationLabel("Nearby in Malaysia");
    setRecommendedCityPickerOpen(false);
    setRecommendedCitySearch("");
    setRecommendedCityPickerError("");
    setRecommendedCitySwitching(false);
    recommendedLocationLabelCacheRef.current = new Map();
    recommendedLocationReqSeqRef.current = 0;
    setSelectedPoiDetailTarget(null);
    setPoiDetailPanelOpen(false);
    setPoiDetailLoading(false);
    setPoiDetailError("");
    setPoiDetailData(null);
    setPoiDetailRequestKey("");
    setPoiDetailIntroExpanded(false);
    setPoiPlaceDetailsCacheByPoiId({});
    setFavoritePoiIds([]);
    setFavoriteBusyPoiId(null);
    favoritePoiIdByPlaceIdRef.current = new Map();
    placeDetailPanelCacheRef.current = new Map();
  }, [tripId]);

  useEffect(() => {
    setPoiImageUrls(readPoiImageCache());
  }, [tripId]);

  useEffect(() => {
    const localProgress = readSmartPlanProgress(tripId);
    if (localProgress) {
      setSmartPlanProgress(localProgress);
      return;
    }
    if (location.state?.smartPlanGenerating) {
      setSmartPlanProgress({
        status: "generating",
        message: "Smart plan is generating...",
      });
    } else {
      setSmartPlanProgress(null);
    }
  }, [tripId, location.state]);

  useEffect(() => {
    const handleProgressEvent = (event) => {
      const payload = event?.detail;
      if (!payload || String(payload.tripId) !== String(tripId)) return;

      const status = String(payload.status || "");
      const message = String(payload.message || "");

      if (status === "completed") {
        clearSmartPlanProgress(tripId);
        setSmartPlanProgress(null);
        void fetchDetail({ showPageLoading: false });
        return;
      }

      if (status === "error") {
        setSmartPlanProgress({ status: "error", message });
        return;
      }

      if (status === "generating") {
        setSmartPlanProgress({ status: "generating", message: message || "Smart plan is generating..." });
      }
    };

    window.addEventListener("smartgo:smart-plan-progress", handleProgressEvent);
    return () => window.removeEventListener("smartgo:smart-plan-progress", handleProgressEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    const persistedOverrides = {};
    for (const day of detail?.days || []) {
      for (const poi of day?.pois || []) {
        if (!poi?.day_poi_id) continue;
        const mode = poi.transport_mode_override ? String(poi.transport_mode_override).toUpperCase() : null;
        if (!mode) continue;
        persistedOverrides[`${String(day.day_id)}|dp:${poi.day_poi_id}`] = mode;
      }
    }
    setEditingTripNote(false);
    setTripNoteDraft(String(detail?.trip?.note || ""));
    setTripNoteError("");
    setTripDateDraft({
      start_date: String(detail?.trip?.start_date || ""),
      end_date: String(detail?.trip?.end_date || ""),
    });
    setTripDatesModalOpen(false);
    setTripDatesError("");
    setTripMenuOpen(false);
    setRouteEditError("");
    setDraggingDayPoi(null);
    setSegmentModeOverrides(persistedOverrides);
    setAddPoiModalOpen(false);
    setPoiSearchQuery("");
    setPoiSearchResults([]);
    setPoiSearchError("");
  }, [detail?.trip?.trip_id, detail?.trip?.note, detail?.days]);

  useEffect(() => {
    let cancelled = false;
    const rawUser = typeof window !== "undefined" ? localStorage.getItem("smartgo_user") : null;
    let user = null;
    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      user = null;
    }
    if (!user?.user_id) {
      setFavoritePoiIds([]);
      return;
    }

    (async () => {
      try {
        const rows = await getFavorites();
        if (cancelled) return;
        const ids = [];
        const byPlaceId = new Map();
        for (const item of Array.isArray(rows) ? rows : []) {
          const poiId = Number(item?.poi_id);
          if (Number.isInteger(poiId) && poiId > 0) ids.push(poiId);
          const placeId = String(item?.google_place_id || "").trim();
          if (placeId && Number.isInteger(poiId) && poiId > 0) byPlaceId.set(placeId, poiId);
        }
        favoritePoiIdByPlaceIdRef.current = byPlaceId;
        setFavoritePoiIds(ids);
      } catch {
        if (!cancelled) setFavoritePoiIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const updateFloatingCtaPosition = () => {
      const drawerEl = drawerRef.current;
      if (!drawerEl) {
        setFloatingRouteCtaRight(16);
        return;
      }
      const rect = drawerEl.getBoundingClientRect();
      const nextRight = Math.max(16, Math.round(window.innerWidth - rect.right));
      setFloatingRouteCtaRight(nextRight);
    };

    updateFloatingCtaPosition();
    window.addEventListener("resize", updateFloatingCtaPosition);
    return () => window.removeEventListener("resize", updateFloatingCtaPosition);
  }, [tripId, activeTab, detail]);

  const fetchDetail = async ({ showPageLoading = true } = {}) => {
    try {
      if (showPageLoading) setLoading(true);
      setError("");
      const data = await getTripDetail(tripId);
      setDetail(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || "Failed to load trip detail");
      } else {
        setError("Failed to load trip detail");
      }
    } finally {
      if (showPageLoading) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchDetail({ showPageLoading: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const trip = detail?.trip ?? null;
  const tripDayCount = getInclusiveDayCount(trip?.start_date, trip?.end_date);
  const currentUser = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("smartgo_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);
  const isSmartPlanGenerating = smartPlanProgress?.status === "generating";
  const smartPlanErrorMessage = smartPlanProgress?.status === "error" ? String(smartPlanProgress.message || "") : "";
  const smartPlanStatusMessage = String(smartPlanProgress?.message || "").trim();
  const isDesktopPoiDetailLayout = viewportWidth >= 960;
  const isMobileLayout = viewportWidth <= 640;
  const isVeryNarrowMobile = viewportWidth <= 420;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const titleText = String(trip?.title || trip?.destination || "").trim();
    document.title = titleText ? `SmartGo | ${titleText}` : "SmartGo | Trip Detail";
  }, [trip?.title, trip?.destination]);

  const sortedDays = useMemo(() => {
    const rawDays = Array.isArray(detail?.days) ? [...detail.days] : [];
    rawDays.sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0));
    const normalizedDays = rawDays.map((day) => ({
      ...day,
      pois: [...(day.pois || [])].sort((a, b) => (a.visit_order ?? 0) - (b.visit_order ?? 0)),
    }));
    const expectedDays = tripDayCount || normalizedDays.length;
    if (expectedDays <= normalizedDays.length) return normalizedDays;

    const byDayNumber = new Map(normalizedDays.map((day) => [Number(day.day_number), day]));
    const paddedDays = [];
    for (let dayNumber = 1; dayNumber <= expectedDays; dayNumber += 1) {
      const existing = byDayNumber.get(dayNumber);
      if (existing) {
        paddedDays.push(existing);
        continue;
      }
      paddedDays.push({
        day_id: `virtual-${dayNumber}`,
        day_number: dayNumber,
        pois: [],
      });
    }
    return paddedDays;
  }, [detail, tripDayCount]);

  const tripWeatherCoords = useMemo(() => getTripWeatherCoords(sortedDays), [sortedDays]);

  useEffect(() => {
    const startDate = String(trip?.start_date || "").trim();
    const endDate = String(trip?.end_date || "").trim();

    if (!startDate || !endDate) {
      setTripWeatherDays([]);
      setTripWeatherError("");
      setTripWeatherLoading(false);
      return;
    }

    if (!tripWeatherCoords) {
      setTripWeatherDays([]);
      setTripWeatherError("Weather will appear after the trip is generated.");
      setTripWeatherLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setTripWeatherLoading(true);
      setTripWeatherError("");

      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(tripWeatherCoords.lat));
        url.searchParams.set("longitude", String(tripWeatherCoords.lng));
        url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
        url.searchParams.set("timezone", "auto");
        url.searchParams.set("start_date", startDate);
        url.searchParams.set("end_date", endDate);

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`Weather request failed (${response.status})`);
        }

        const data = await response.json();
        const times = Array.isArray(data?.daily?.time) ? data.daily.time : [];
        const maxTemps = Array.isArray(data?.daily?.temperature_2m_max) ? data.daily.temperature_2m_max : [];
        const minTemps = Array.isArray(data?.daily?.temperature_2m_min) ? data.daily.temperature_2m_min : [];
        const weatherCodes = Array.isArray(data?.daily?.weather_code) ? data.daily.weather_code : [];

        const rows = times.map((dateText, index) => ({
          date: dateText,
          max: Number(maxTemps[index]),
          min: Number(minTemps[index]),
          weatherCode: weatherCodes[index],
        }));

        if (cancelled) return;
        setTripWeatherDays(rows);
        if (!rows.length) {
          setTripWeatherError("No weather data available for the selected dates.");
        }
      } catch (err) {
        if (cancelled) return;
        setTripWeatherDays([]);
        setTripWeatherError(err instanceof Error ? err.message : "Failed to load trip weather");
      } finally {
        if (!cancelled) setTripWeatherLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [trip?.start_date, trip?.end_date, tripWeatherCoords]);

  useEffect(() => {
    if (activeTab === "overview") return;
    const exists = sortedDays.some((day) => String(day.day_id) === String(activeTab));
    if (!exists) {
      setActiveTab("overview");
    }
  }, [activeTab, sortedDays]);

  const visibleDays = useMemo(() => {
    if (activeTab === "overview") return sortedDays;
    return sortedDays.filter((day) => String(day.day_id) === String(activeTab));
  }, [sortedDays, activeTab]);

  useEffect(() => {
    if (activeTab === "overview") return;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    let cancelled = false;
    const currentCache = readPoiImageCache();

    const poisToResolve = visibleDays
      .flatMap((day) => day?.pois || [])
      .filter((poi) => poi?.name)
      .filter((poi) => {
        if (poi.image_url) return false;
        const cacheKey = getPoiImageCacheKey(poi);
        return !currentCache[cacheKey];
      });

    if (!poisToResolve.length) return;

    const run = async () => {
      for (const poi of poisToResolve) {
        if (cancelled) break;
        const cacheKey = getPoiImageCacheKey(poi);
        if (poiImageLookupInFlightRef.current.has(cacheKey)) continue;
        poiImageLookupInFlightRef.current.add(cacheKey);
        try {
          const query = `${poi.name} ${poi.address || ""} ${trip?.destination || ""}`.trim();
          const results = await textSearchPlaces(
            service,
            {
              query,
              location:
                mapRef.current?.getCenter?.() ||
                new window.google.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
              radius: 30000,
            },
            statusEnum
          );
          const photoUrl = getPlacePhotoUrl(results[0], 220);
          if (!photoUrl || cancelled) continue;

          const nextCache = {
            ...readPoiImageCache(),
            [cacheKey]: photoUrl,
          };
          writePoiImageCache(nextCache);
          setPoiImageUrls((prev) => ({ ...prev, [cacheKey]: photoUrl }));

          if (poi?.poi_id && !poi.image_url && !poiImagePersistInFlightRef.current.has(String(poi.poi_id))) {
            poiImagePersistInFlightRef.current.add(String(poi.poi_id));
            void patchPoiImage(poi.poi_id, photoUrl)
              .catch(() => {})
              .finally(() => {
                poiImagePersistInFlightRef.current.delete(String(poi.poi_id));
              });
          }

        } catch {
          // keep silent; missing image should not block route editing
        } finally {
          poiImageLookupInFlightRef.current.delete(cacheKey);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, visibleDays, sortedDays, trip?.destination, tripId, poiImageUrls]);

  const totalPois = useMemo(
    () => sortedDays.reduce((sum, day) => sum + (day.pois?.length || 0), 0),
    [sortedDays]
  );

  const ensurePlacesServiceForHealing = async () => {
    if (placesServiceRef.current) return placesServiceRef.current;
    const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
    if (!apiKey) return null;
    await loadGoogleMapsApi(apiKey);
    if (!window.google?.maps?.places?.PlacesService) return null;
    placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
    return placesServiceRef.current;
  };

  const healPoiThumbImage = async (poi, failedUrl = "") => {
    const service = await ensurePlacesServiceForHealing();
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    const cacheKey = getPoiImageCacheKey(poi);
    if (!cacheKey || poiImageLookupInFlightRef.current.has(cacheKey)) return;

    poiImageLookupInFlightRef.current.add(cacheKey);
    try {
      let photoUrl = "";
      const failedPoiId = Number(poi?.poi_id);

      if (Number.isInteger(failedPoiId) && failedPoiId > 0) {
        try {
          const payload = await getPoiPlaceDetails(failedPoiId);
          const placeId = String(payload?.google_place?.place_id || "").trim();
          if (placeId) {
            const details = await getPlaceDetailsById(
              service,
              { placeId, fields: ["place_id", "photos"] },
              statusEnum
            );
            photoUrl = getPlacePhotoUrl(details, 1200) || getPlacePhotoUrl(details, 220);
          }
        } catch {
          // fallback to text search
        }
      }

      if (!photoUrl) {
        const query = `${poi?.name || ""} ${poi?.address || ""} ${trip?.destination || ""}`.trim();
        if (!query) return;

        const results = await textSearchPlaces(
          service,
          {
            query,
            location:
              mapRef.current?.getCenter?.() ||
              new window.google.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
            radius: 30000,
          },
          statusEnum
        );
        photoUrl = getPlacePhotoUrl(results[0], 220);
      }

      if (!photoUrl || (failedUrl && photoUrl === failedUrl)) return;

      const nextCache = {
        ...readPoiImageCache(),
        [cacheKey]: photoUrl,
      };
      writePoiImageCache(nextCache);
      setPoiImageUrls((prev) => ({ ...prev, [cacheKey]: photoUrl }));

      setDetail((prev) => {
        if (!prev?.days?.length) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => ({
            ...day,
            pois: (day.pois || []).map((item) => {
              const samePoiId = Number.isInteger(failedPoiId) && failedPoiId > 0
                ? Number(item?.poi_id) === failedPoiId
                : getPoiImageCacheKey(item) === cacheKey;
              return samePoiId ? { ...item, image_url: photoUrl } : item;
            }),
          })),
        };
      });

      const selectedPoiId = Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id);
      if (Number.isInteger(failedPoiId) && failedPoiId > 0 && selectedPoiId === failedPoiId) {
        setSelectedPoiDetailTarget((prev) =>
          prev ? { ...prev, poi: { ...(prev.poi || {}), image_url: photoUrl } } : prev
        );
        setPoiDetailData((prev) =>
          prev ? { ...prev, poi: { ...(prev.poi || {}), image_url: photoUrl } } : prev
        );
      }

      if (Number.isInteger(failedPoiId) && failedPoiId > 0 && !poiImagePersistInFlightRef.current.has(String(failedPoiId))) {
        poiImagePersistInFlightRef.current.add(String(failedPoiId));
        void patchPoiImage(failedPoiId, photoUrl)
          .catch(() => {})
          .finally(() => {
            poiImagePersistInFlightRef.current.delete(String(failedPoiId));
          });
      }
    } catch {
      // keep silent; placeholder/fallback will still render
    } finally {
      poiImageLookupInFlightRef.current.delete(cacheKey);
    }
  };

  useEffect(() => {
    if (activeTab === "overview") return;
    if (!visibleDays.length) return;

    let cancelled = false;
    const pois = visibleDays.flatMap((day) => day?.pois || []).filter((poi) => poi?.name);
    if (!pois.length) return;

    const run = async () => {
      for (const poi of pois) {
        if (cancelled) break;

        const cacheKey = getPoiImageCacheKey(poi);
        const attemptKey = Number(poi?.poi_id) > 0 ? `poi:${Number(poi?.poi_id)}` : cacheKey;
        if (attemptKey && !poiAutoHealAttemptedRef.current.has(attemptKey)) {
          poiAutoHealAttemptedRef.current.add(attemptKey);
          await healPoiThumbImage(poi);
          continue;
        }

        const currentUrl = String(poiImageUrls[cacheKey] || poi?.image_url || "").trim();
        if (!currentUrl || isLegacyGooglePlacesPhotoUrl(currentUrl)) {
          await healPoiThumbImage(poi, currentUrl);
          continue;
        }

        const validationKey = `${cacheKey}|${currentUrl}`;
        if (poiThumbValidationInFlightRef.current.has(validationKey)) continue;
        poiThumbValidationInFlightRef.current.add(validationKey);

        const ok = await canLoadImageUrl(currentUrl, 5000);
        if (!ok) {
          await healPoiThumbImage(poi, currentUrl);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, visibleDays, poiImageUrls, mapReadyVersion, trip?.destination]);

  useEffect(() => {
    const serverCover = String(trip?.cover_image_url || "").trim();
    if (!serverCover) return;
    if (isLegacyGooglePlacesPhotoUrl(serverCover)) return;
    writeTripCoverImageOnce(tripId, serverCover);
  }, [tripId, trip?.cover_image_url]);

  useEffect(() => {
    if (!trip?.trip_id) return;
    const currentCover = String(trip.cover_image_url || "").trim();
    const needsDestinationCover = !currentCover || isLegacyGooglePlacesPhotoUrl(currentCover);
    if (!needsDestinationCover) return;
    if (!String(trip.destination || "").trim()) return;
    if (destinationCoverLookupInFlightRef.current) return;

    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    let cancelled = false;
    destinationCoverLookupInFlightRef.current = true;

    const run = async () => {
      try {
        const destinationText = String(trip.destination).trim();
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
              location:
                mapRef.current?.getCenter?.() ||
                new window.google.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
              radius: 50000,
            },
            statusEnum
          );
          photoUrl = getPlacePhotoUrl(results[0], 1200);
          if (photoUrl) break;
        }

        if (!photoUrl || cancelled) return;

        await patchTrip(trip.trip_id, { cover_image_url: photoUrl });
        if (cancelled) return;

        writeTripCoverImageCache(trip.trip_id, photoUrl);
        setDetail((prev) => (
          prev?.trip?.trip_id === trip.trip_id
            ? { ...prev, trip: { ...prev.trip, cover_image_url: photoUrl } }
            : prev
        ));
      } catch {
        // keep silent; destination cover is best-effort
      } finally {
        destinationCoverLookupInFlightRef.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [trip?.trip_id, trip?.destination, trip?.cover_image_url, mapReadyVersion]);

  const dayColorById = useMemo(() => {
    const entries = sortedDays.map((day, idx) => [String(day.day_id), ROUTE_COLORS[idx % ROUTE_COLORS.length]]);
    return Object.fromEntries(entries);
  }, [sortedDays]);

  const mapPoints = useMemo(() => {
    return visibleDays.flatMap((day) =>
      (day.pois || [])
        .map((poi) => {
          const lat = Number(poi.lat);
          const lng = Number(poi.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            lat,
            lng,
            name: poi.name || "Unnamed POI",
            poiId: poi.poi_id ?? null,
            dayNumber: day.day_number,
            dayId: day.day_id,
            visitOrder: poi.visit_order,
            dayPoiId: poi.day_poi_id ?? null,
            address: poi.address ?? "",
            type: poi.type ?? "other",
            description: poi.description ?? "",
            image_url: poi.image_url || poiImageUrls[getPoiImageCacheKey(poi)] || null,
            color: dayColorById[String(day.day_id)] || ROUTE_COLORS[0],
          };
        })
        .filter(Boolean)
    );
  }, [visibleDays, dayColorById, poiImageUrls]);

  const routeGroups = useMemo(() => {
    return visibleDays
      .map((day) => {
        const points = (day.pois || [])
          .map((poi) => {
            const lat = Number(poi.lat);
            const lng = Number(poi.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              lat,
              lng,
              name: poi.name || "Unnamed POI",
              visitOrder: poi.visit_order,
              dayPoiId: poi.day_poi_id ?? null,
            };
          })
          .filter(Boolean);

        return {
          dayId: day.day_id,
          dayNumber: day.day_number,
          color: dayColorById[String(day.day_id)] || ROUTE_COLORS[0],
          points,
        };
      })
      .filter((group) => group.points.length >= 2);
  }, [visibleDays, dayColorById]);

  const routeLegendItems = useMemo(() => {
    if (activeTab !== "overview") return [];
    return routeGroups.map((group) => ({
      key: group.dayId,
      label: `Day ${group.dayNumber}`,
      color: group.color,
      pointCount: group.points.length,
    }));
  }, [activeTab, routeGroups]);

  const loadPoiDetailData = async (target) => {
    const poiId = Number(target?.poi?.poi_id ?? target?.poiId);
    if (!Number.isInteger(poiId) || poiId <= 0) return;

    const cached = poiPlaceDetailsCacheByPoiId[poiId];
    if (cached) {
      setPoiDetailData(cached);
      setPoiDetailError("");
      setPoiDetailLoading(false);
      return;
    }

    const requestSeq = poiDetailRequestSeqRef.current + 1;
    poiDetailRequestSeqRef.current = requestSeq;
    const requestKey = `${poiId}:${requestSeq}`;
    setPoiDetailRequestKey(requestKey);
    setPoiDetailLoading(true);
    setPoiDetailError("");

    try {
      const payload = await getPoiPlaceDetails(poiId);
      if (poiDetailRequestSeqRef.current !== requestSeq) return;
      setPoiDetailData(payload);
      setPoiPlaceDetailsCacheByPoiId((prev) => ({ ...prev, [poiId]: payload }));
    } catch (err) {
      if (poiDetailRequestSeqRef.current !== requestSeq) return;
      if (axios.isAxiosError(err)) {
        setPoiDetailError(err.response?.data?.error || "Failed to load place details");
      } else {
        setPoiDetailError("Failed to load place details");
      }
      setPoiDetailData(null);
    } finally {
      if (poiDetailRequestSeqRef.current === requestSeq) {
        setPoiDetailLoading(false);
      }
    }
  };

  const openPoiDetail = (target) => {
    if (!target?.poi) return;
    if (target?.dayId != null && activeTab === "overview") {
      setActiveTab(String(target.dayId));
    }
    setSelectedPoiDetailTarget(target);
    setPoiDetailPanelOpen(true);
    setPoiDetailIntroExpanded(false);
    setPoiDetailError("");
    const poiId = Number(target?.poi?.poi_id);
    const cached = Number.isInteger(poiId) ? poiPlaceDetailsCacheByPoiId[poiId] : null;
    setPoiDetailData(cached || null);
    setPoiDetailLoading(!cached && Number.isInteger(poiId));
    void loadPoiDetailData(target);
  };

  const closePoiDetailPanel = () => {
    setPoiDetailPanelOpen(false);
    setPoiDetailLoading(false);
    setPoiDetailError("");
    setPoiDetailIntroExpanded(false);
  };

  useEffect(() => {
    if (!poiDetailPanelOpen) return;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    const poiId = Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id);
    const placeId = String(poiDetailData?.google_place?.place_id || "").trim();
    if (!Number.isInteger(poiId) || poiId <= 0 || !placeId) return;
    if (poiDetailHiResImageLookupRef.current.has(placeId)) return;

    const existingImage = String(poiDetailData?.poi?.image_url || "").trim();
    // If this detail image already looks like a modern non-legacy URL and is not tiny-cache style,
    // we still allow upgrade once, but avoid repeated requests by gating with the placeId set.
    poiDetailHiResImageLookupRef.current.add(placeId);

    let cancelled = false;
    (async () => {
      try {
        const details = await getPlaceDetailsById(
          service,
          {
            placeId,
            fields: ["place_id", "photos"],
          },
          statusEnum
        );
        if (cancelled) return;

        const hiResUrl = getPlacePhotoUrl(details, 1200);
        if (!hiResUrl || hiResUrl === existingImage) return;

        const hiResCacheKey = getPoiImageCacheKey({ poi_id: poiId });
        if (hiResCacheKey) {
          const nextCache = {
            ...readPoiImageCache(),
            [hiResCacheKey]: hiResUrl,
          };
          writePoiImageCache(nextCache);
          setPoiImageUrls((prev) => ({ ...prev, [hiResCacheKey]: hiResUrl }));
        }

        setPoiDetailData((prev) => {
          const prevPoiId = Number(prev?.poi?.poi_id);
          if (prevPoiId !== poiId) return prev;
          return {
            ...prev,
            poi: {
              ...(prev?.poi || {}),
              image_url: hiResUrl,
            },
          };
        });

        setDetail((prev) => {
          if (!prev?.days?.length) return prev;
          return {
            ...prev,
            days: prev.days.map((day) => ({
              ...day,
              pois: (day.pois || []).map((item) =>
                Number(item?.poi_id) === poiId ? { ...item, image_url: hiResUrl } : item
              ),
            })),
          };
        });

        setSelectedPoiDetailTarget((prev) =>
          Number(prev?.poi?.poi_id) === poiId
            ? { ...prev, poi: { ...(prev.poi || {}), image_url: hiResUrl } }
            : prev
        );

        if (!poiImagePersistInFlightRef.current.has(String(poiId))) {
          poiImagePersistInFlightRef.current.add(String(poiId));
          void patchPoiImage(poiId, hiResUrl)
            .catch(() => {})
            .finally(() => {
              poiImagePersistInFlightRef.current.delete(String(poiId));
            });
        }

        setPoiPlaceDetailsCacheByPoiId((prev) => {
          const cached = prev?.[poiId];
          if (!cached) return prev;
          return {
            ...prev,
            [poiId]: {
              ...cached,
              poi: {
                ...(cached.poi || {}),
                image_url: hiResUrl,
              },
            },
          };
        });
      } catch {
        // Best-effort enhancement; keep existing image if high-res fetch fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [poiDetailPanelOpen, poiDetailData, selectedPoiDetailTarget, mapReadyVersion]);

  useEffect(() => {
    if (!poiDetailPanelOpen) return;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) return;

    const selectedPoiId = Number(selectedPoiDetailTarget?.poi?.poi_id);
    const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
    if (Number.isInteger(selectedPoiId) && selectedPoiId > 0) return;
    if (!placeId) return;

    const cached = placeDetailPanelCacheRef.current.get(placeId);
    if (cached) {
      setPoiDetailData(cached);
      setPoiDetailLoading(false);
      setPoiDetailError("");
      return;
    }

    const requestSeq = poiDetailRequestSeqRef.current + 1;
    poiDetailRequestSeqRef.current = requestSeq;
    setPoiDetailRequestKey(`place:${placeId}:${requestSeq}`);
    setPoiDetailLoading(true);
    setPoiDetailError("");

    (async () => {
      try {
        const rawDetails = await getPlaceDetailsById(
          service,
          {
            placeId,
            fields: [
              "place_id",
              "name",
              "rating",
              "user_ratings_total",
              "types",
              "reviews",
              "editorial_summary",
              "formatted_address",
              "formatted_phone_number",
              "international_phone_number",
              "website",
              "url",
              "opening_hours",
              "photos",
            ],
          },
          statusEnum
        );
        if (poiDetailRequestSeqRef.current !== requestSeq) return;
        const normalized = normalizePlaceDetailsForPanel(
          {
            placeId,
            name: selectedPoiDetailTarget?.poi?.name,
            address: selectedPoiDetailTarget?.poi?.address,
            lat: selectedPoiDetailTarget?.poi?.lat,
            lng: selectedPoiDetailTarget?.poi?.lng,
            type: selectedPoiDetailTarget?.poi?.type,
          },
          rawDetails
        );
        placeDetailPanelCacheRef.current.set(placeId, normalized);
        setPoiDetailData(normalized);
      } catch (err) {
        if (poiDetailRequestSeqRef.current !== requestSeq) return;
        setPoiDetailError(err instanceof Error ? err.message : "Failed to load place details");
        setPoiDetailData(
          normalizePlaceDetailsForPanel(
            {
              placeId,
              name: selectedPoiDetailTarget?.poi?.name,
              address: selectedPoiDetailTarget?.poi?.address,
              lat: selectedPoiDetailTarget?.poi?.lat,
              lng: selectedPoiDetailTarget?.poi?.lng,
              type: selectedPoiDetailTarget?.poi?.type,
            },
            null
          )
        );
      } finally {
        if (poiDetailRequestSeqRef.current === requestSeq) setPoiDetailLoading(false);
      }
    })();
  }, [poiDetailPanelOpen, selectedPoiDetailTarget, poiDetailData, mapReadyVersion]);

  const handleToggleFavoriteFromPoiDetail = async () => {
    const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
    const poiId =
      Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id) ||
      Number(favoritePoiIdByPlaceIdRef.current.get(placeId));

    const rawUser = typeof window !== "undefined" ? localStorage.getItem("smartgo_user") : null;
    let user = null;
    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      user = null;
    }
    if (!user?.user_id) {
      setPoiDetailError("Please log in to save favorites");
      return;
    }

    const isFavorite = Number.isInteger(poiId) && poiId > 0 && favoritePoiIds.includes(poiId);
    try {
      setFavoriteBusyPoiId(Number.isInteger(poiId) && poiId > 0 ? poiId : -1);
      if (isFavorite) {
        await deleteFavoriteApi(poiId);
        setFavoritePoiIds((prev) => prev.filter((id) => id !== poiId));
      } else {
        if (Number.isInteger(poiId) && poiId > 0) {
          await createFavorite(poiId);
          setFavoritePoiIds((prev) => (prev.includes(poiId) ? prev : [poiId, ...prev]));
        } else {
          const payload = {
            name: String(selectedPoiDetailTarget?.poi?.name || poiDetailData?.poi?.name || "").trim(),
            type: String(selectedPoiDetailTarget?.poi?.type || poiDetailData?.poi?.type || "other").trim() || "other",
            address: String(selectedPoiDetailTarget?.poi?.address || poiDetailData?.poi?.address || "").trim(),
            lat: selectedPoiDetailTarget?.poi?.lat ?? poiDetailData?.poi?.lat ?? null,
            lng: selectedPoiDetailTarget?.poi?.lng ?? poiDetailData?.poi?.lng ?? null,
            google_place_id: placeId || null,
            description:
              String(poiDetailData?.google_place?.introduction || poiDetailData?.poi?.description || "").trim() || null,
            image_url: poiDetailData?.poi?.image_url || null,
          };
          const result = await createFavoriteFromPlace(payload);
          const newPoiId = Number(result?.poi_id);
          if (!Number.isInteger(newPoiId) || newPoiId <= 0) {
            throw new Error("Favorite created but poi_id missing");
          }
          if (placeId) favoritePoiIdByPlaceIdRef.current.set(placeId, newPoiId);
          setFavoritePoiIds((prev) => (prev.includes(newPoiId) ? prev : [newPoiId, ...prev]));
          setSelectedPoiDetailTarget((prev) =>
            prev ? { ...prev, poi: { ...(prev.poi || {}), poi_id: newPoiId } } : prev
          );
          setPoiDetailData((prev) =>
            prev ? { ...prev, poi: { ...(prev.poi || {}), poi_id: newPoiId } } : prev
          );
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setPoiDetailError(err.response?.data?.error || "Failed to update favorite");
      } else if (err instanceof Error) {
        setPoiDetailError(err.message || "Failed to update favorite");
      } else {
        setPoiDetailError("Failed to update favorite");
      }
    } finally {
      setFavoriteBusyPoiId(null);
    }
  };

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    let cancelled = false;

    if (loading) return;

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
        if (cancelled) return;
        if (!mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center: DEFAULT_MAP_CENTER,
            zoom: 12,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            cameraControl: false,
            zoomControl: false,
            rotateControl: false,
            keyboardShortcuts: false,
            gestureHandling: "greedy",
            clickableIcons: false,
            restriction: {
              latLngBounds: MALAYSIA_MAP_BOUNDS,
              strictBounds: true,
            },
            styles: [
              { featureType: "poi", stylers: [{ visibility: "off" }] },
              { featureType: "transit.station", stylers: [{ visibility: "off" }] },
            ],
          });
        }
        if (!placesServiceRef.current && window.google?.maps?.places?.PlacesService) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(mapRef.current);
        }
        setMapReadyVersion((value) => value + 1);
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : "Failed to load map");
        }
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, loading]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    if (googleMaps.event?.trigger) {
      googleMaps.event.trigger(map, "resize");
    }

    for (const marker of markerRefs.current) marker.setMap(null);
    markerRefs.current = [];

    if (mapPoints.length === 0) {
      map.setCenter(DEFAULT_MAP_CENTER);
      map.setZoom(11);
      return;
    }

    const bounds = new googleMaps.LatLngBounds();
    markerRefs.current = mapPoints.flatMap((point) => {
      const isOverview = activeTab === "overview";
      const primaryMarker = new googleMaps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.name,
        label: {
          text: String(point.visitOrder ?? ""),
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "11px",
        },
        icon:
          isOverview || point.color
          ? {
              path: googleMaps.SymbolPath.CIRCLE,
              fillColor: point.color || "#0ea5e9",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              scale: 11,
            }
          : undefined,
      });
      primaryMarker.addListener("click", () => {
        openPoiDetail({
          dayId: point.dayId ?? null,
          dayPoiId: point.dayPoiId ?? null,
          poiId: point.poiId ?? null,
          poi: {
            poi_id: point.poiId ?? null,
            name: point.name || "Unnamed POI",
            type: point.type || "other",
            address: point.address || "",
            description: point.description || "",
            image_url: point.image_url || null,
            lat: point.lat,
            lng: point.lng,
          },
        });
      });
      bounds.extend(primaryMarker.getPosition());

      if (!(isOverview && Number(point.visitOrder) === 1)) {
        return [primaryMarker];
      }

      const dayTagMarker = new googleMaps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        clickable: false,
        zIndex: (primaryMarker.getZIndex?.() || 0) + 1,
        icon: createDayTagIcon(googleMaps, point.color || "#0ea5e9"),
        label: {
          text: `Day${point.dayNumber}`,
          color: "#ffffff",
          fontWeight: "700",
          fontSize: "12px",
        },
      });

      return [primaryMarker, dayTagMarker];
    });

    if (mapPoints.length === 1) {
      map.setCenter({ lat: mapPoints[0].lat, lng: mapPoints[0].lng });
      map.setZoom(14);
      return;
    }

    map.fitBounds(bounds, 48);
  }, [mapPoints, activeTab, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    if (recommendedIdleListenerRef.current) {
      googleMaps.event.removeListener(recommendedIdleListenerRef.current);
      recommendedIdleListenerRef.current = null;
    }

    if (!showRecommendedPois) return;

    const syncCenter = () => {
      const center = map.getCenter?.();
      const lat = center?.lat?.();
      const lng = center?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setRecommendedSearchCenter((prev) => {
        if (prev && Math.abs(prev.lat - lat) < 0.0002 && Math.abs(prev.lng - lng) < 0.0002) return prev;
        return { lat, lng };
      });
    };

    syncCenter();
    recommendedIdleListenerRef.current = map.addListener("idle", syncCenter);

    return () => {
      if (recommendedIdleListenerRef.current) {
        googleMaps.event.removeListener(recommendedIdleListenerRef.current);
        recommendedIdleListenerRef.current = null;
      }
    };
  }, [showRecommendedPois, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!showRecommendedPois) {
      setRecommendedPois([]);
      setRecommendedPoisLoading(false);
      setRecommendedPoisError("");
      return;
    }
    if (!map || !service || !statusEnum) return;

    const center = recommendedSearchCenter || map.getCenter?.()?.toJSON?.();
    const lat = Number(center?.lat);
    const lng = Number(center?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = recommendedSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setRecommendedPois(cached);
      setRecommendedPoisError("");
      return;
    }

    if (recommendedDebounceTimerRef.current) clearTimeout(recommendedDebounceTimerRef.current);

    recommendedDebounceTimerRef.current = setTimeout(async () => {
      const tripPoiKeys = new Set(
        (mapPoints || []).map((p) => `${String(p.name || "").trim().toLowerCase()}|${String(p.address || "").trim().toLowerCase()}`)
      );

      try {
        setRecommendedPoisLoading(true);
        setRecommendedPoisError("");
        const baseRequest = { location: { lat, lng }, radius: TRIP_RECOMMEND_RADIUS_METERS };
        const [foodResults, attractionResults] = await Promise.all([
          nearbySearchPlaces(service, { ...baseRequest, type: "restaurant" }, statusEnum),
          nearbySearchPlaces(service, { ...baseRequest, type: "tourist_attraction" }, statusEnum),
        ]);

        const merged = mergePlacesByIdLocal(
          foodResults.map((p) => toRecommendedPlace(p, "food")).filter(Boolean),
          attractionResults.map((p) => toRecommendedPlace(p, "attractions")).filter(Boolean)
        );

        const filtered = merged.filter((p) => {
          const key = `${String(p.name || "").trim().toLowerCase()}|${String(p.address || "").trim().toLowerCase()}`;
          if (tripPoiKeys.has(key)) return false;
          return true;
        });

        const next = sortPlacesByQualityLocal(filtered).slice(0, TRIP_RECOMMEND_MAX_RESULTS);
        if (!next.length && !isLikelyMalaysiaCoordinates(lat, lng)) {
          setRecommendedPoisError("No Malaysia POIs found in this area. Move the map to Malaysia.");
        }
        recommendedSearchCacheRef.current.set(cacheKey, next);
        setRecommendedPois(next);
      } catch (err) {
        setRecommendedPois([]);
        setRecommendedPoisError(err instanceof Error ? err.message : "Failed to load recommended places");
      } finally {
        setRecommendedPoisLoading(false);
      }
    }, 250);

    return () => {
      if (recommendedDebounceTimerRef.current) {
        clearTimeout(recommendedDebounceTimerRef.current);
        recommendedDebounceTimerRef.current = null;
      }
    };
  }, [showRecommendedPois, recommendedSearchCenter, mapReadyVersion, mapPoints]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    for (const marker of recommendedMarkerRefs.current) marker.setMap(null);
    recommendedMarkerRefs.current = [];

    if (!showRecommendedPois) return;

    recommendedMarkerRefs.current = (recommendedPois || []).map((poi) => {
      const marker = new googleMaps.Marker({
        map,
        position: { lat: poi.lat, lng: poi.lng },
        title: poi.name || "Recommended POI",
        icon: createRecommendedMarkerIcon(googleMaps, poi.type),
        zIndex: 1,
      });

      marker.addListener("click", () => {
        setSelectedPoiDetailTarget({
          poi: {
            poi_id: null,
            name: poi.name || "Unnamed POI",
            type: poi.type || "other",
            address: poi.address || "",
            description: "",
            image_url: null,
            lat: poi.lat,
            lng: poi.lng,
          },
          placeId: poi.placeId || null,
        });
        setPoiDetailPanelOpen(true);
        setPoiDetailIntroExpanded(false);
        setPoiDetailError("");
        setPoiDetailLoading(false);
        setPoiDetailData(null);
        setPoiDetailRequestKey(`recommended:${poi.placeId || poi.name}:${Date.now()}`);
      });

      return marker;
    });

    return () => {
      for (const marker of recommendedMarkerRefs.current) marker.setMap(null);
      recommendedMarkerRefs.current = [];
    };
  }, [showRecommendedPois, recommendedPois, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    let cancelled = false;

    if (!map || !googleMaps) return;

    for (const renderer of routeRendererRefs.current) renderer.setMap(null);
    routeRendererRefs.current = [];
    setRouteError("");
    setRouteDayInfo({});

    if (routeGroups.length === 0) {
      setRouteLoading(false);
      return;
    }

    (async () => {
      try {
        setRouteLoading(true);
        const directionsService = new googleMaps.DirectionsService();
        const nextRouteDayInfo = {};
        const routeWarnings = [];

        for (const group of routeGroups) {
          if (cancelled) return;

          const dayInfo = {
            modeKey: null,
            modeLabel: null,
            segmentsByPoiKey: {},
          };

          for (let index = 0; index < group.points.length - 1; index += 1) {
            const fromPoint = group.points[index];
            const toPoint = group.points[index + 1];
            if (!fromPoint || !toPoint) continue;

            try {
              const baseDirectionsRequest = {
                origin: { lat: fromPoint.lat, lng: fromPoint.lng },
                destination: { lat: toPoint.lat, lng: toPoint.lng },
                optimizeWaypoints: false,
              };
              const segmentKey = toPoint.dayPoiId != null ? `dp:${toPoint.dayPoiId}` : `vo:${toPoint.visitOrder}`;
              const overrideKey = `${String(group.dayId)}|${segmentKey}`;
              const overrideMode = segmentModeOverrides[overrideKey] || "AUTO";

              let autoRoute;
              let segmentWarning = "";
              if (overrideMode === "AUTO") {
                const autoMode = getAutoSegmentModeByDistance(fromPoint, toPoint);
                autoRoute = await requestDirectionsModesInOrder(
                  directionsService,
                  googleMaps,
                  baseDirectionsRequest,
                  autoMode === "WALKING"
                    ? ["WALKING", "DRIVING", "TRANSIT"]
                    : ["DRIVING", "WALKING", "TRANSIT"]
                );
              } else {
                try {
                  autoRoute = await requestDirectionsModesInOrder(
                    directionsService,
                    googleMaps,
                    baseDirectionsRequest,
                    [overrideMode]
                  );
                } catch (overrideErr) {
                  const autoMode = getAutoSegmentModeByDistance(fromPoint, toPoint);
                  const fallbackOrder = [
                    autoMode,
                    autoMode === "WALKING" ? "DRIVING" : "WALKING",
                    "TRANSIT",
                  ].filter((mode, idx, arr) => mode !== overrideMode && arr.indexOf(mode) === idx);

                  autoRoute = await requestDirectionsModesInOrder(
                    directionsService,
                    googleMaps,
                    baseDirectionsRequest,
                    fallbackOrder
                  );

                  segmentWarning =
                    overrideMode === "TRANSIT"
                      ? `No transit route for this segment, using ${autoRoute.modeMeta.shortLabel}.`
                      : `${getRouteModeMeta(overrideMode).shortLabel} unavailable, using ${autoRoute.modeMeta.shortLabel}.`;
                }
              }

              if (cancelled) return;

              const renderer = new googleMaps.DirectionsRenderer({
                map,
                directions: autoRoute.directionsResult,
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: {
                  strokeColor: group.color,
                  strokeOpacity: 0.85,
                  strokeWeight: 5,
                },
              });
              routeRendererRefs.current.push(renderer);

              const leg = autoRoute.directionsResult?.routes?.[0]?.legs?.[0];
              const actualLegModeKey = getLegModeKey(leg, autoRoute.modeKey);
              if (!segmentWarning && overrideMode !== "AUTO" && actualLegModeKey !== overrideMode) {
                segmentWarning =
                  overrideMode === "TRANSIT"
                    ? `No transit route for this segment, using ${getRouteModeMeta(actualLegModeKey).shortLabel}.`
                    : `${getRouteModeMeta(overrideMode).shortLabel} unavailable, using ${getRouteModeMeta(actualLegModeKey).shortLabel}.`;
              }
              dayInfo.segmentsByPoiKey[segmentKey] = {
                modeKey: actualLegModeKey,
                distanceMeters: Number(leg?.distance?.value) || 0,
                durationSeconds: Number(leg?.duration?.value) || 0,
                overrideMode,
                warning: segmentWarning || undefined,
                displayOverrideMode:
                  segmentWarning && overrideMode !== "AUTO" && actualLegModeKey !== overrideMode
                    ? actualLegModeKey
                    : overrideMode,
              };

              if (!dayInfo.modeKey) {
                dayInfo.modeKey = autoRoute.modeKey;
                dayInfo.modeLabel = autoRoute.modeMeta.label;
              }
            } catch (legError) {
              routeWarnings.push(
                `Day ${group.dayNumber} #${index + 1}->#${index + 2}: ${legError instanceof Error ? legError.message : "Route unavailable"}`
              );
            }
          }

          if (Object.keys(dayInfo.segmentsByPoiKey).length > 0) {
            nextRouteDayInfo[String(group.dayId)] = dayInfo;
          }
        }

        if (!cancelled) {
          setRouteDayInfo(nextRouteDayInfo);
          setRouteError(routeWarnings.join(" | "));
        }
      } catch (err) {
        if (!cancelled) {
          setRouteError(err instanceof Error ? err.message : "Failed to draw route");
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeGroups, mapReadyVersion, segmentModeOverrides]);
  const handleDeleteTrip = async () => {
    if (!trip?.trip_id || deletingTrip) return;

    const confirmed = window.confirm(`Delete trip "${trip.title || "Untitled trip"}"?`);
    if (!confirmed) return;

    try {
      setDeletingTrip(true);
      setDeleteError("");
      await deleteTrip(trip.trip_id);
      navigate("/trips");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setDeleteError(err.response?.data?.error || "Failed to delete trip");
      } else if (err instanceof Error) {
        setDeleteError(err.message || "Failed to delete trip");
      } else {
        setDeleteError("Failed to delete trip");
      }
    } finally {
      setDeletingTrip(false);
    }
  };

  const openNoteModal = (poi) => {
    if (!poi?.day_poi_id) return;
    setEditingDayPoiId(poi.day_poi_id);
    setNoteDraft(poi.note ?? "");
    setNoteError("");
    setNoteModalOpen(true);
  };

  const closeNoteModal = () => {
    if (savingNote) return;
    setNoteModalOpen(false);
    setEditingDayPoiId(null);
    setNoteDraft("");
    setNoteError("");
  };

  const saveNote = async () => {
    if (!editingDayPoiId) return;
    try {
      setSavingNote(true);
      setNoteError("");
      const nextNote = noteDraft.trim() === "" ? null : noteDraft.trim();
      await patchDayPoiNote(editingDayPoiId, nextNote);

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: (prev.days || []).map((day) => ({
            ...day,
            pois: (day.pois || []).map((poi) =>
              poi.day_poi_id === editingDayPoiId ? { ...poi, note: nextNote } : poi
            ),
          })),
        };
      });

      closeNoteModal();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setNoteError(err.response?.data?.error || "Failed to save note");
      } else {
        setNoteError("Failed to save note");
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleStartEditTripNote = () => {
    setTripNoteDraft(String(trip?.note || ""));
    setTripNoteError("");
    setEditingTripNote(true);
  };

  const handleCancelEditTripNote = () => {
    if (savingTripNote) return;
    setTripNoteDraft(String(trip?.note || ""));
    setTripNoteError("");
    setEditingTripNote(false);
  };

  const handleSaveTripNote = async () => {
    if (!trip?.trip_id || savingTripNote) return;
    try {
      setSavingTripNote(true);
      setTripNoteError("");
      const nextNote = tripNoteDraft.trim() ? tripNoteDraft.trim() : null;
      await patchTrip(trip.trip_id, { note: nextNote });

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          trip: {
            ...prev.trip,
            note: nextNote,
          },
        };
      });
      setEditingTripNote(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setTripNoteError(err.response?.data?.error || "Failed to save trip note");
      } else if (err instanceof Error) {
        setTripNoteError(err.message || "Failed to save trip note");
      } else {
        setTripNoteError("Failed to save trip note");
      }
    } finally {
      setSavingTripNote(false);
    }
  };

  const openTripDatesModal = () => {
    setTripDateDraft({
      start_date: String(trip?.start_date || ""),
      end_date: String(trip?.end_date || ""),
    });
    setTripDatesError("");
    setTripDatesModalOpen(true);
    setTripMenuOpen(false);
  };

  const closeTripDatesModal = () => {
    if (savingTripDates) return;
    setTripDatesModalOpen(false);
    setTripDatesError("");
  };

  const saveTripDates = async () => {
    if (!trip?.trip_id || savingTripDates) return;
    const startDate = String(tripDateDraft.start_date || "").trim();
    const endDate = String(tripDateDraft.end_date || "").trim();
    if (!startDate || !endDate) {
      setTripDatesError("Start date and end date are required");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setTripDatesError("End date must be on or after start date");
      return;
    }

    try {
      setSavingTripDates(true);
      setTripDatesError("");
      await patchTrip(trip.trip_id, { start_date: startDate, end_date: endDate });
      await fetchDetail({ showPageLoading: false });
      setTripDatesModalOpen(false);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setTripDatesError(err.response?.data?.error || "Failed to save trip dates");
      } else if (err instanceof Error) {
        setTripDatesError(err.message || "Failed to save trip dates");
      } else {
        setTripDatesError("Failed to save trip dates");
      }
    } finally {
      setSavingTripDates(false);
    }
  };

  const openAddPoiModal = async (day) => {
    if (!day) return;

    let targetDay = day;
    if (String(day.day_id).startsWith("virtual-")) {
      if (!trip?.trip_id) {
        setRouteEditError("Trip is not ready yet.");
        return;
      }
      try {
        setRouteEditBusy(true);
        setRouteEditError("");
        const created = await createTripDay(trip.trip_id, Number(day.day_number));
        targetDay = {
          ...day,
          day_id: created?.day_id,
        };
        await fetchDetail({ showPageLoading: false });
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setRouteEditError(err.response?.data?.error || "Failed to create day for this trip");
        } else {
          setRouteEditError("Failed to create day for this trip");
        }
        return;
      } finally {
        setRouteEditBusy(false);
      }
    }

    setAddPoiTargetDay(targetDay);
    setPoiSearchQuery("");
    setPoiSearchResults([]);
    setPoiSearchError("");
    setAddPoiModalOpen(true);
  };

  const closeAddPoiModal = () => {
    if (addingPoi) return;
    setAddPoiModalOpen(false);
    setPoiSearchError("");
    setPoiSearchResults([]);
    setPoiSearchQuery("");
  };

  const searchPoisForAdd = async () => {
    const query = poiSearchQuery.trim();
    if (!query) {
      setPoiSearchResults([]);
      setPoiSearchError("Enter a place name or keyword");
      return;
    }
    const service = placesServiceRef.current;
    const statusEnum = window.google?.maps?.places?.PlacesServiceStatus;
    if (!service || !statusEnum) {
      setPoiSearchError("Places search is not ready yet. Please try again.");
      return;
    }

    try {
      setPoiSearchLoading(true);
      setPoiSearchError("");
      const locationHint = mapRef.current?.getCenter?.()?.toJSON?.() || DEFAULT_MAP_CENTER;
      const results = await textSearchPlaces(
        service,
        {
          query: `${query} ${trip?.destination || ""}`.trim(),
          location: locationHint,
          radius: 30000,
        },
        statusEnum
      );

      const normalized = results
        .slice(0, 8)
        .map((place) => ({
          placeId: place.place_id || null,
          name: place.name || "Unnamed Place",
          address: place.formatted_address || place.vicinity || "",
          lat: place.geometry?.location?.lat?.() ?? null,
          lng: place.geometry?.location?.lng?.() ?? null,
          type: Array.isArray(place.types) && place.types.includes("restaurant")
            ? "food"
            : Array.isArray(place.types) && place.types.includes("shopping_mall")
              ? "shopping"
              : Array.isArray(place.types) && place.types.includes("museum")
                ? "museum"
                : Array.isArray(place.types) && place.types.includes("tourist_attraction")
                  ? "attraction"
                  : "other",
        }))
        .filter((item) => item.name && item.address)
        .filter((item) => isLikelyMalaysiaCoordinates(item.lat, item.lng));

      setPoiSearchResults(normalized);
      if (!normalized.length) {
        setPoiSearchError(
          isLikelyMalaysiaCoordinates(locationHint.lat, locationHint.lng)
            ? "No places found"
            : "No Malaysia POIs found in this area. Move the map to Malaysia."
        );
      }
    } catch (err) {
      setPoiSearchError(err instanceof Error ? err.message : "Failed to search places");
      setPoiSearchResults([]);
    } finally {
      setPoiSearchLoading(false);
    }
  };

  const handleAddPoiToDay = async (place) => {
    if (!addPoiTargetDay?.day_id || addingPoi) return;
    if (String(addPoiTargetDay.day_id).startsWith("virtual-")) return;

    try {
      setAddingPoi(true);
      setPoiSearchError("");
      setRouteEditError("");
      await addDayPoi(addPoiTargetDay.day_id, {
        name: place.name,
        address: place.address,
        google_place_id: place.placeId || null,
        type: place.type || "other",
        description: "",
        lat: place.lat,
        lng: place.lng,
        note: null,
        start_time: null,
        duration_min: null,
      });
      closeAddPoiModal();
      await fetchDetail({ showPageLoading: false });
      setActiveTab(String(addPoiTargetDay.day_id));
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.error;
        if (status === 404) {
          setPoiSearchError(message || "Add POI endpoint not found. Please restart the server.");
        } else {
          setPoiSearchError(message || "Failed to add POI");
        }
      } else {
        setPoiSearchError("Failed to add POI");
      }
    } finally {
      setAddingPoi(false);
    }
  };

  const movePoiByDrag = async ({ day, fromDayPoiId, toDayPoiId }) => {
    if (!day?.day_id || routeEditBusy) return;
    const realDayId = day.day_id;
    if (String(realDayId).startsWith("virtual-")) return;

    const currentPois = [...(day.pois || [])];
    const fromIndex = currentPois.findIndex((poi) => poi.day_poi_id === fromDayPoiId);
    const toIndex = currentPois.findIndex((poi) => poi.day_poi_id === toDayPoiId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const reordered = [...currentPois];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: (prev.days || []).map((d) =>
          String(d.day_id) !== String(realDayId)
            ? d
            : {
                ...d,
                pois: reordered.map((poi, idx) => ({ ...poi, visit_order: idx + 1 })),
              }
        ),
      };
    });

    try {
      setRouteEditBusy(true);
      setRouteEditError("");
      await reorderDayPois(realDayId, reordered.map((poi) => poi.day_poi_id));
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.error;
        if (status === 404) {
          setRouteEditError(message || "Reorder endpoint not found. Please restart the server.");
        } else {
          setRouteEditError(message || "Failed to reorder route");
        }
      } else {
        setRouteEditError("Failed to reorder route");
      }
      await fetchDetail({ showPageLoading: false });
    } finally {
      setRouteEditBusy(false);
      setDraggingDayPoi(null);
    }
  };

  const handleDeletePoiFromDay = async (poi) => {
    if (!poi?.day_poi_id || routeEditBusy) return;
    if (!window.confirm(`Remove "${poi.name || "this POI"}" from this trip day?`)) return;

    try {
      setRouteEditBusy(true);
      setRouteEditError("");
      await deleteDayPoi(poi.day_poi_id);
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setRouteEditError(err.response?.data?.error || "Failed to delete POI");
      } else {
        setRouteEditError("Failed to delete POI");
      }
    } finally {
      setRouteEditBusy(false);
      setDraggingDayPoi(null);
    }
  };

  const handleDeleteTripDay = async (day) => {
    if (!day?.day_id || routeEditBusy) return;
    if (String(day.day_id).startsWith("virtual-")) return;

    const dayLabel = `Day ${day.day_number}`;
    const confirmed = window.confirm(`${dayLabel} will be deleted. Later days will shift forward by one day. Continue?`);
    if (!confirmed) return;

    try {
      setRouteEditBusy(true);
      setRouteEditError("");
      setRouteError("");
      setDraggingDayPoi(null);

      await deleteTripDayApi(day.day_id);

      setActiveTab("overview");
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setRouteEditError(err.response?.data?.error || "Failed to delete day");
      } else {
        setRouteEditError("Failed to delete day");
      }
    } finally {
      setRouteEditBusy(false);
    }
  };

  const handleSegmentModeOverrideChange = async ({ dayId, poi, modeKey }) => {
    if (!poi?.day_poi_id) return;
    const overrideKey = `${String(dayId)}|dp:${poi.day_poi_id}`;
    const prevValue = segmentModeOverrides[overrideKey];

    setSegmentModeOverrides((prev) => ({
      ...prev,
      [overrideKey]: modeKey,
    }));

    try {
      await patchDayPoiTransportMode(poi.day_poi_id, modeKey);
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: (prev.days || []).map((day) => ({
            ...day,
            pois: (day.pois || []).map((item) =>
              item.day_poi_id === poi.day_poi_id
                ? { ...item, transport_mode_override: modeKey }
                : item
            ),
          })),
        };
      });
    } catch (err) {
      setSegmentModeOverrides((prev) => {
        const next = { ...prev };
        if (prevValue) next[overrideKey] = prevValue;
        else delete next[overrideKey];
        return next;
      });
      if (axios.isAxiosError(err)) {
        setRouteError(err.response?.data?.error || "Failed to save route mode");
      } else {
        setRouteError("Failed to save route mode");
      }
    }
  };

  if (loading) return <div className="muted">Loading trip detail...</div>;

  if (error) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="h1" style={{ marginBottom: 0 }}>Trip Detail</div>
        <div className="muted">{error}</div>
        <button className="secondaryBtn" type="button" onClick={() => navigate("/trips")}>
          Back to Trips
        </button>
      </div>
    );
  }

  if (!trip) return <div className="muted">No trip data</div>;
  const isOverviewTab = activeTab === "overview";

  return (
    <>
      <div style={pageShellStyle}>
        <TripDetailHeroMap
          navigate={navigate}
          mapContainerRef={mapContainerRef}
          mapLoading={mapLoading}
          mapError={mapError}
          mapPoints={mapPoints}
          showRecommendedPois={showRecommendedPois}
          setShowRecommendedPois={setShowRecommendedPois}
          recommendedPoisError={recommendedPoisError}
        />
        <section
          ref={drawerRef}
          style={{
            ...drawerStyle,
            ...(isMobileLayout ? { paddingBottom: routeEditMode ? 110 : 88 } : null),
          }}
        >
          {deleteError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{deleteError}</div> : null}
          {routeEditError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{routeEditError}</div> : null}

          <div className="row" style={{ marginTop: 4, alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="h1" style={{ marginBottom: 4 }}>
                {withUpdatedDayCountInTitle(trip.title, tripDayCount) || "Trip Detail"}
              </div>
              <div className="muted">{trip.destination || "-"}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {formatDateRange(trip.start_date, trip.end_date)}
                {` | ${tripDayCount || sortedDays.length} days | ${totalPois} POIs`}
              </div>
              {isSmartPlanGenerating ? (
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(14,165,233,0.2)",
                    background: "rgba(14,165,233,0.06)",
                    color: "#0369a1",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "#0ea5e9",
                      boxShadow: "0 0 0 6px rgba(14,165,233,0.12)",
                    }}
                  />
                  {smartPlanStatusMessage || "Smart Plan generating... itinerary and routes will appear progressively."}
                </div>
              ) : null}
              {smartPlanErrorMessage ? (
                <div style={{ ...errorTextStyle, marginTop: 8 }}>
                  Smart Plan generation failed: {smartPlanErrorMessage}
                </div>
              ) : null}
            </div>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                className="secondaryBtn"
                onClick={() => setTripMenuOpen((value) => !value)}
                aria-label="Trip actions"
                style={tripMenuButtonStyle}
              >
                {"\u22EE"}
              </button>
              {tripMenuOpen ? (
                <div style={tripMenuCardStyle}>
                  <button type="button" style={tripMenuItemStyle} onClick={openTripDatesModal}>
                    Edit dates
                  </button>
                  <button
                    type="button"
                    style={{ ...tripMenuItemStyle, ...tripMenuDangerItemStyle }}
                    onClick={() => {
                      setTripMenuOpen(false);
                      handleDeleteTrip();
                    }}
                    disabled={deletingTrip}
                  >
                    {deletingTrip ? "Deleting..." : "Delete trip"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start", marginTop: 12 }}>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setActiveTab("overview")}
              style={activeTab === "overview" ? activeTabStyle : undefined}
            >
              Overview
            </button>
            {sortedDays.map((day) => (
              <button
                key={day.day_id}
                type="button"
                className="secondaryBtn"
                onClick={() => setActiveTab(String(day.day_id))}
                style={String(activeTab) === String(day.day_id) ? activeTabStyle : undefined}
              >
                Day {day.day_number}
              </button>
            ))}
          </div>

          {routeLoading ? <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Updating route...</div> : null}

          <div className="stack" style={{ gap: 14, marginTop: 14 }}>
            {visibleDays.length ? (
              visibleDays.map((day) => (
                <section key={day.day_id} style={sectionCardStyle}>
                  <div
                    className="row"
                    style={{
                      marginBottom: 10,
                      alignItems: isMobileLayout ? "flex-start" : "center",
                      flexWrap: isMobileLayout ? "wrap" : "nowrap",
                      rowGap: isMobileLayout ? 8 : 0,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Day {day.day_number}</div>
                    <div
                      className="row"
                      style={{
                        gap: 8,
                        alignItems: "center",
                        justifyContent: "flex-start",
                        flexWrap: isMobileLayout ? "wrap" : "nowrap",
                      }}
                    >
                      <div className="muted">{formatDayFromTripStart(trip.start_date, day.day_number) || "-"}</div>
                      {!isOverviewTab && routeEditMode ? (
                        <>
                          <button
                            type="button"
                            className="secondaryBtn"
                            onClick={() => openAddPoiModal(day)}
                            disabled={routeEditBusy || addingPoi}
                            style={dayHeaderActionBtnStyle}
                          >
                            + Add POI
                          </button>
                          {!String(day.day_id).startsWith("virtual-") ? (
                            <button
                              type="button"
                              className="secondaryBtn"
                              onClick={() => void handleDeleteTripDay(day)}
                              disabled={routeEditBusy || addingPoi}
                              style={{
                                ...dayHeaderActionBtnStyle,
                                color: "#b91c1c",
                                borderColor: "rgba(220,38,38,0.22)",
                                background: "rgba(254,242,242,0.72)",
                              }}
                            >
                              Delete Day
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {!day.pois?.length ? (
                    <div className="muted">No POIs yet</div>
                  ) : (
                    isOverviewTab ? (
                    <div style={overviewRouteTextStyle}>
                      {day.pois
                        .map((poi) => String(poi?.name || "").trim())
                        .filter(Boolean)
                        .join(" -> ")}
                    </div>
                    ) : (
                    <div className="stack" style={{ gap: 10 }}>
                      {day.pois.map((poi) => {
                        const dayRoute = routeDayInfo[String(day.day_id)] || null;
                        const incomingRouteSegment = getPoiIncomingRouteSegment(dayRoute, poi);
                        const incomingSegmentKey = poi.day_poi_id != null ? `dp:${poi.day_poi_id}` : `vo:${poi.visit_order}`;
                        const incomingOverrideKey = `${String(day.day_id)}|${incomingSegmentKey}`;
                        const poiThumbCacheUrl = poiImageUrls[getPoiImageCacheKey(poi)] || "";
                        const poiThumbUrl = poiThumbCacheUrl || poi.image_url || "";
                        const isSelectedPoi =
                          poiDetailPanelOpen &&
                          (selectedPoiDetailTarget?.dayPoiId != null
                            ? Number(selectedPoiDetailTarget.dayPoiId) === Number(poi.day_poi_id)
                            : Number(selectedPoiDetailTarget?.poi?.poi_id) === Number(poi.poi_id));

                        return (
                        <div
                          key={poi.day_poi_id ?? `${day.day_id}-${poi.visit_order}-${poi.poi_id}`}
                          style={{
                            ...poiCardStyle,
                            ...(routeEditMode ? poiCardEditableStyle : null),
                            ...(!routeEditMode ? poiCardClickableStyle : null),
                            ...(isSelectedPoi ? poiCardSelectedStyle : null),
                            ...(draggingDayPoi?.dayPoiId === poi.day_poi_id ? poiCardDraggingStyle : null),
                          }}
                          onClick={() => {
                            if (routeEditMode) return;
                            openPoiDetail({
                              dayId: day.day_id,
                              dayPoiId: poi.day_poi_id ?? null,
                              poiId: poi.poi_id ?? null,
                              poi: {
                                ...poi,
                                image_url: poiThumbUrl || poi.image_url || null,
                              },
                            });
                          }}
                          draggable={Boolean(routeEditMode && poi.day_poi_id && !routeEditBusy)}
                          onDragStart={(e) => {
                            if (!routeEditMode || !poi.day_poi_id) return;
                            try {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", String(poi.day_poi_id));
                            } catch {}
                            setDraggingDayPoi({ dayId: String(day.day_id), dayPoiId: poi.day_poi_id });
                          }}
                          onDragOver={(e) => {
                            if (!routeEditMode || !draggingDayPoi?.dayPoiId || routeEditBusy) return;
                            if (String(draggingDayPoi.dayId) !== String(day.day_id)) return;
                            if (draggingDayPoi.dayPoiId === poi.day_poi_id) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDragEnter={(e) => {
                            if (!routeEditMode || !draggingDayPoi?.dayPoiId || routeEditBusy) return;
                            if (String(draggingDayPoi.dayId) !== String(day.day_id)) return;
                            if (draggingDayPoi.dayPoiId === poi.day_poi_id) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!routeEditMode || !draggingDayPoi?.dayPoiId || !poi.day_poi_id) return;
                            if (String(draggingDayPoi.dayId) !== String(day.day_id)) return;
                            void movePoiByDrag({
                              day,
                              fromDayPoiId: draggingDayPoi.dayPoiId,
                              toDayPoiId: poi.day_poi_id,
                            });
                          }}
                          onDragEnd={() => setDraggingDayPoi(null)}
                        >
                          <div
                            className="row"
                            style={{
                              alignItems: "flex-start",
                              justifyContent: "flex-start",
                              gap: isMobileLayout ? 8 : 12,
                              flexWrap: isVeryNarrowMobile ? "wrap" : "nowrap",
                            }}
                          >
                            <div
                              style={{
                                ...poiThumbWrapStyle,
                                ...(isMobileLayout
                                  ? {
                                      width: 56,
                                      minWidth: 56,
                                      height: 56,
                                      borderRadius: 10,
                                    }
                                  : null),
                              }}
                              aria-hidden="true"
                            >
                              {poiThumbUrl ? (
                                <img
                                  src={poiThumbUrl}
                                  alt=""
                                  style={poiThumbImgStyle}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onLoad={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                  }}
                                  onError={(e) => {
                                    const failedSrc = String(e.currentTarget?.src || "").trim();
                                    e.currentTarget.style.opacity = "0";
                                    e.currentTarget.removeAttribute("src");
                                    void healPoiThumbImage(poi, failedSrc);
                                  }}
                                />
                              ) : (
                                <div style={poiThumbPlaceholderStyle}>
                                  {String(poi.name || "?").trim().slice(0, 1).toUpperCase() || "?"}
                                </div>
                              )}
                            </div>
                            {routeEditMode ? (
                              <div style={dragHandleStyle} aria-hidden="true" title="Drag to reorder">
                                {"\u22EE\u22EE"}
                              </div>
                            ) : null}
                            <div style={{ minWidth: isMobileLayout ? 20 : 28, fontWeight: 700, color: "#0f172a" }}>
                              #{poi.visit_order ?? "-"}
                            </div>

                            <div
                              style={{
                                flex: 1,
                                minWidth: 0,
                                position: "relative",
                                paddingRight: routeEditMode ? (isMobileLayout ? 44 : 92) : 0,
                              }}
                            >
                              {routeEditMode && poi.day_poi_id ? (
                                <button
                                  type="button"
                                  className="secondaryBtn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeletePoiFromDay(poi);
                                  }}
                                  disabled={routeEditBusy}
                                  style={isMobileLayout ? deletePoiBtnMobileTopRightStyle : deletePoiBtnStyle}
                                  aria-label="Delete POI"
                                  title="Delete POI"
                                >
                                  <TrashLineIcon size={14} />
                                </button>
                              ) : null}
                              <div style={{ fontWeight: 700 }}>{poi.name || "Unnamed POI"}</div>
                              <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                                {poi.type || "other"}
                              </div>

                              {(poi.start_time || poi.duration_min) ? (
                                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                                  {poi.start_time || "--:--"}
                                  {" | "}
                                  {poi.duration_min ? `${poi.duration_min} min` : "duration not set"}
                                </div>
                              ) : null}

                              {!routeEditMode && poi.day_poi_id ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openNoteModal(poi);
                                  }}
                                  style={noteButtonStyle(Boolean(poi.note))}
                                  aria-label="Edit note"
                                >
                                  {poi.note ? poi.note : "备注"}
                                </button>
                              ) : null}

                              {!routeEditMode ? (
                                <PoiRouteSegmentMeta
                                  segment={incomingRouteSegment}
                                  overrideMode={segmentModeOverrides[incomingOverrideKey] || "AUTO"}
                                  onChangeMode={
                                    incomingRouteSegment
                                      ? (modeKey) =>
                                          void handleSegmentModeOverrideChange({
                                            dayId: day.day_id,
                                            poi,
                                            modeKey,
                                          })
                                      : undefined
                                  }
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    )
                  )}
                </section>
              ))
            ) : (
              <div style={sectionCardStyle}>
                <div className="muted">No itinerary days yet</div>
              </div>
            )}
            <TripDetailOverviewPanels
              isOverviewTab={isOverviewTab}
              editingTripNote={editingTripNote}
              savingTripNote={savingTripNote}
              handleCancelEditTripNote={handleCancelEditTripNote}
              handleSaveTripNote={handleSaveTripNote}
              handleStartEditTripNote={handleStartEditTripNote}
              tripNoteError={tripNoteError}
              tripNoteDraft={tripNoteDraft}
              setTripNoteDraft={setTripNoteDraft}
              trip={trip}
              tripWeatherLoading={tripWeatherLoading}
              tripWeatherError={tripWeatherError}
              tripWeatherDays={tripWeatherDays}
              formatTripWeatherDate={formatTripWeatherDate}
              getWeatherCodeLabel={getWeatherCodeLabel}
            />
          </div>
        </section>
      </div>
      <TripDetailFloatingActions
        isMobileLayout={isMobileLayout}
        floatingRouteCtaRight={floatingRouteCtaRight}
        navigate={navigate}
        tripId={tripId}
        setRouteEditError={setRouteEditError}
        setDraggingDayPoi={setDraggingDayPoi}
        setRouteEditMode={setRouteEditMode}
        activeTab={activeTab}
        sortedDays={sortedDays}
        setActiveTab={setActiveTab}
        routeEditBusy={routeEditBusy}
        routeEditMode={routeEditMode}
      />
      <PoiDetailPanel
        key={poiDetailRequestKey || String(selectedPoiDetailTarget?.poi?.poi_id || "poi-detail")}
        open={poiDetailPanelOpen}
        isDesktop={isDesktopPoiDetailLayout}
        target={selectedPoiDetailTarget}
        loading={poiDetailLoading}
        error={poiDetailError}
        details={poiDetailData}
        introExpanded={poiDetailIntroExpanded}
        onToggleIntro={() => setPoiDetailIntroExpanded((value) => !value)}
        onClose={closePoiDetailPanel}
        canFavorite={Boolean(currentUser?.user_id)}
        enableStreetView={true}
        isFavorite={(() => {
          const selectedPoiId = Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id);
          if (Number.isInteger(selectedPoiId) && selectedPoiId > 0) {
            return favoritePoiIds.includes(selectedPoiId);
          }
          const placeId = String(selectedPoiDetailTarget?.placeId || poiDetailData?.google_place?.place_id || "").trim();
          const mappedPoiId = Number(favoritePoiIdByPlaceIdRef.current.get(placeId));
          return Number.isInteger(mappedPoiId) && favoritePoiIds.includes(mappedPoiId);
        })()}
        favoriteBusy={Boolean(
          favoriteBusyPoiId != null &&
            (favoriteBusyPoiId === -1 ||
              favoriteBusyPoiId === Number(selectedPoiDetailTarget?.poi?.poi_id ?? poiDetailData?.poi?.poi_id))
        )}
        onToggleFavorite={() => void handleToggleFavoriteFromPoiDetail()}
      />
      <TripDetailModals
        noteModalOpen={noteModalOpen}
        closeNoteModal={closeNoteModal}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        savingNote={savingNote}
        noteError={noteError}
        saveNote={saveNote}
        tripDatesModalOpen={tripDatesModalOpen}
        closeTripDatesModal={closeTripDatesModal}
        tripDateDraft={tripDateDraft}
        setTripDateDraft={setTripDateDraft}
        savingTripDates={savingTripDates}
        tripDatesError={tripDatesError}
        saveTripDates={saveTripDates}
        addPoiModalOpen={addPoiModalOpen}
        closeAddPoiModal={closeAddPoiModal}
        addPoiTargetDay={addPoiTargetDay}
        poiSearchQuery={poiSearchQuery}
        setPoiSearchQuery={setPoiSearchQuery}
        searchPoisForAdd={searchPoisForAdd}
        poiSearchLoading={poiSearchLoading}
        addingPoi={addingPoi}
        poiSearchError={poiSearchError}
        poiSearchResults={poiSearchResults}
        handleAddPoiToDay={handleAddPoiToDay}
      />
    </>
  );
}






