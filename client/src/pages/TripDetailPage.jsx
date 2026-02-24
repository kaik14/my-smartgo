import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { deleteTrip, generateAiTripItinerary, getTripDetail, patchDayPoiNote } from "../services/api";

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDate} - ${endDate}`;
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

function formatDayFromTripStart(startDate, dayNumber) {
  if (!startDate) return "";
  const base = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Math.max(0, Number(dayNumber || 1) - 1));
  return base.toLocaleDateString();
}

function preferencesToText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "string") return value;
  return "";
}

const DEFAULT_MAP_CENTER = { lat: 3.139, lng: 101.6869 };
const ROUTE_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
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

function requestDirections(directionsService, request) {
  return new Promise((resolve, reject) => {
    directionsService.route(request, (result, status) => {
      if (status === "OK" && result) {
        resolve(result);
        return;
      }
      reject(new Error(`Directions request failed: ${status}`));
    });
  });
}

export default function TripDetailPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [preferences, setPreferences] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingDayPoiId, setEditingDayPoiId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef([]);
  const routeRendererRefs = useRef([]);

  const fetchDetail = async ({ showPageLoading = true } = {}) => {
    try {
      if (showPageLoading) setLoading(true);
      setError("");
      const data = await getTripDetail(tripId);
      setDetail(data);
      setPreferences((prev) => prev || preferencesToText(data?.trip?.preferences));
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

  const sortedDays = useMemo(() => {
    const days = Array.isArray(detail?.days) ? [...detail.days] : [];
    days.sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0));
    return days.map((day) => ({
      ...day,
      pois: [...(day.pois || [])].sort((a, b) => (a.visit_order ?? 0) - (b.visit_order ?? 0)),
    }));
  }, [detail]);

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

  const totalPois = useMemo(
    () => sortedDays.reduce((sum, day) => sum + (day.pois?.length || 0), 0),
    [sortedDays]
  );

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
            dayNumber: day.day_number,
            visitOrder: poi.visit_order,
          };
        })
        .filter(Boolean)
    );
  }, [visibleDays]);

  const routeGroups = useMemo(() => {
    return visibleDays
      .map((day, idx) => {
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
            };
          })
          .filter(Boolean);

        return {
          dayId: day.day_id,
          dayNumber: day.day_number,
          color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
          points,
        };
      })
      .filter((group) => group.points.length >= 2);
  }, [visibleDays]);

  const routeLegendItems = useMemo(() => {
    if (activeTab !== "overview") return [];
    return routeGroups.map((group) => ({
      key: group.dayId,
      label: `Day ${group.dayNumber}`,
      color: group.color,
      pointCount: group.points.length,
    }));
  }, [activeTab, routeGroups]);

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
        if (cancelled) return;
        if (!mapContainerRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapContainerRef.current, {
            center: DEFAULT_MAP_CENTER,
            zoom: 12,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });
        }
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    for (const marker of markerRefs.current) marker.setMap(null);
    markerRefs.current = [];

    if (mapPoints.length === 0) {
      map.setCenter(DEFAULT_MAP_CENTER);
      map.setZoom(11);
      return;
    }

    const bounds = new googleMaps.LatLngBounds();
    markerRefs.current = mapPoints.map((point) => {
      const marker = new googleMaps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.name,
        label: activeTab === "overview" ? String(point.dayNumber) : String(point.visitOrder ?? ""),
      });
      bounds.extend(marker.getPosition());
      return marker;
    });

    if (mapPoints.length === 1) {
      map.setCenter({ lat: mapPoints[0].lat, lng: mapPoints[0].lng });
      map.setZoom(14);
      return;
    }

    map.fitBounds(bounds, 48);
  }, [mapPoints, activeTab]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    let cancelled = false;

    if (!map || !googleMaps) return;

    for (const renderer of routeRendererRefs.current) renderer.setMap(null);
    routeRendererRefs.current = [];
    setRouteError("");

    if (routeGroups.length === 0) {
      setRouteLoading(false);
      return;
    }

    (async () => {
      try {
        setRouteLoading(true);
        const directionsService = new googleMaps.DirectionsService();

        for (const group of routeGroups) {
          if (cancelled) return;

          const [origin, ...rest] = group.points;
          const destination = rest[rest.length - 1];
          const middlePoints = rest.slice(0, -1);
          if (!origin || !destination) continue;

          const directionsResult = await requestDirections(directionsService, {
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
            waypoints: middlePoints.map((point) => ({
              location: { lat: point.lat, lng: point.lng },
              stopover: true,
            })),
            optimizeWaypoints: false,
            travelMode: googleMaps.TravelMode.WALKING,
          });

          if (cancelled) return;

          const renderer = new googleMaps.DirectionsRenderer({
            map,
            directions: directionsResult,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: group.color,
              strokeOpacity: 0.85,
              strokeWeight: 5,
            },
          });
          routeRendererRefs.current.push(renderer);
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
  }, [routeGroups]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setGenerateError("");
      await generateAiTripItinerary(tripId, {
        preferences: preferences.trim() || undefined,
      });
      await fetchDetail({ showPageLoading: false });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setGenerateError(err.response?.data?.error || "Failed to generate itinerary");
      } else {
        setGenerateError("Failed to generate itinerary");
      }
    } finally {
      setGenerating(false);
    }
  };

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

  return (
    <>
      <div style={pageShellStyle}>
        <section style={heroMapPanelStyle}>
          <div style={mapTopBarStyle}>
            <button className="secondaryBtn" type="button" onClick={() => navigate("/trips")}>
              Back
            </button>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <div className="muted" style={{ fontSize: 13 }}>
                {activeTab === "overview" ? "Overview" : "Day view"}
              </div>
              <button
                type="button"
                className="secondaryBtn"
                onClick={handleDeleteTrip}
                disabled={deletingTrip}
                aria-label="Delete trip"
                title="Delete trip"
                style={deleteTripButtonStyle}
              >
                {deletingTrip ? "..." : "🗑"}
              </button>
            </div>
          </div>

          <div style={mapShellStyle}>
            <div ref={mapContainerRef} style={heroMapCanvasStyle} />
            {mapLoading ? <div style={mapOverlayStyle}>Loading map...</div> : null}
            {mapError ? <div style={mapOverlayStyle}>{mapError}</div> : null}
            {!mapLoading && !mapError && mapPoints.length === 0 ? (
              <div style={mapOverlayStyle}>No POIs with valid coordinates for this tab</div>
            ) : null}
          </div>

          <div style={mapFloatingInfoStyle}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {routeLoading
                ? "Calculating walking route..."
                : routeError
                  ? "Route unavailable"
                  : routeGroups.length > 0
                    ? `Routes: ${routeGroups.length}`
                    : "Markers only"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {routeError
                ? routeError
                : activeTab === "overview"
                  ? "Overview draws one route per day"
                  : "Day route follows POI visit order"}
            </div>
            {routeLegendItems.length > 0 ? (
              <div style={legendWrapStyle}>
                {routeLegendItems.map((item) => (
                  <div key={item.key} style={legendItemStyle}>
                    <span style={{ ...legendDotStyle, background: item.color }} />
                    <span>{item.label}</span>
                    <span className="muted" style={{ fontSize: 11 }}>({item.pointCount})</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section style={drawerStyle}>
          <div style={drawerHandleStyle} />
          {deleteError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{deleteError}</div> : null}

          <div className="row" style={{ marginTop: 4, alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="h1" style={{ marginBottom: 4 }}>{trip.title || "Trip Detail"}</div>
              <div className="muted">{trip.destination || "-"}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {formatDateRange(trip.start_date, trip.end_date)}
                {` | ${sortedDays.length} days | ${totalPois} POIs`}
              </div>
              {preferencesToText(trip.preferences) ? (
                <div className="muted" style={{ marginTop: 4 }}>
                  Preferences: {preferencesToText(trip.preferences)}
                </div>
              ) : null}
            </div>
          </div>

          <section style={{ ...sectionCardStyle, marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>SmartGo / AI生成行程</div>
            <div className="stack" style={{ gap: 10 }}>
              <label style={labelStyle}>
                <span>Preferences (optional if already saved on trip)</span>
                <textarea
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  placeholder="e.g. food + culture + family friendly, less shopping"
                  rows={3}
                  style={textareaStyle}
                  disabled={generating}
                />
              </label>

              {generateError ? <div style={errorTextStyle}>{generateError}</div> : null}

              <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Existing itinerary for this trip will be replaced.
                </div>
                <button type="button" className="primaryBtn" onClick={handleGenerate} disabled={generating}>
                  {generating ? "Generating..." : "SmartGo / AI生成行程"}
                </button>
              </div>
            </div>
          </section>

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

          <div className="stack" style={{ gap: 14, marginTop: 14 }}>
            {visibleDays.length ? (
              visibleDays.map((day) => (
                <section key={day.day_id} style={sectionCardStyle}>
                  <div className="row" style={{ marginBottom: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>Day {day.day_number}</div>
                    <div className="muted">{formatDayFromTripStart(trip.start_date, day.day_number) || "-"}</div>
                  </div>

                  {!day.pois?.length ? (
                    <div className="muted">No POIs yet</div>
                  ) : (
                    <div className="stack" style={{ gap: 10 }}>
                      {day.pois.map((poi) => (
                        <div key={poi.day_poi_id ?? `${day.day_id}-${poi.visit_order}-${poi.poi_id}`} style={poiCardStyle}>
                          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                            <div style={{ minWidth: 28, fontWeight: 700, color: "#0f172a" }}>
                              #{poi.visit_order ?? "-"}
                            </div>

                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700 }}>{poi.name || "Unnamed POI"}</div>
                              <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                                {poi.type || "other"}
                                {poi.address ? ` | ${poi.address}` : ""}
                              </div>

                              {(poi.start_time || poi.duration_min) ? (
                                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                                  {poi.start_time || "--:--"}
                                  {" | "}
                                  {poi.duration_min ? `${poi.duration_min} min` : "duration not set"}
                                </div>
                              ) : null}

                              {poi.description ? (
                                <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.4, color: "#334155" }}>
                                  {poi.description}
                                </div>
                              ) : null}

                              {poi.day_poi_id ? (
                                <button
                                  type="button"
                                  onClick={() => openNoteModal(poi)}
                                  style={noteButtonStyle(Boolean(poi.note))}
                                  aria-label="Edit note"
                                >
                                  {poi.note ? poi.note : "备注"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))
            ) : (
              <div style={sectionCardStyle}>
                <div className="muted">No itinerary days yet</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {noteModalOpen ? (
        <div style={modalOverlayStyle} onClick={closeNoteModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 6, fontSize: 22 }}>Edit Note</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Leave empty to clear note.
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="输入 POI 备注"
              rows={5}
              style={textareaStyle}
              disabled={savingNote}
            />
            {noteError ? <div style={errorTextStyle}>{noteError}</div> : null}
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
              <button className="secondaryBtn" type="button" onClick={closeNoteModal} disabled={savingNote}>
                Cancel
              </button>
              <button className="primaryBtn" type="button" onClick={saveNote} disabled={savingNote}>
                {savingNote ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const sectionCardStyle = {
  background: "rgba(255,255,255,0.78)",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
};

const poiCardStyle = {
  background: "rgba(255,255,255,0.95)",
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(148,163,184,0.15)",
};

const noteButtonStyle = (hasNote) => ({
  marginTop: 10,
  width: "100%",
  textAlign: "left",
  border: "1px dashed rgba(148,163,184,0.45)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(248,250,252,0.9)",
  color: hasNote ? "#0f172a" : "#94a3b8",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1.35,
});

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const modalCardStyle = {
  width: "min(560px, 100%)",
  background: "#fff",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
  border: "1px solid rgba(148,163,184,0.22)",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "#334155",
};

const inputStyle = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
};

const textareaStyle = {
  ...inputStyle,
  width: "100%",
  resize: "vertical",
  minHeight: 100,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const errorTextStyle = {
  color: "#dc2626",
  fontSize: 13,
};

const activeTabStyle = {
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
};

const deleteTripButtonStyle = {
  width: 38,
  minWidth: 38,
  height: 38,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontSize: 18,
  borderColor: "rgba(220,38,38,0.28)",
  color: "#b91c1c",
  background: "rgba(255,255,255,0.95)",
};

const pageShellStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 6,
};

const heroMapPanelStyle = {
  position: "relative",
  borderRadius: 22,
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0.35))",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 16px 36px rgba(15,23,42,0.12)",
};

const mapTopBarStyle = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const heroMapCanvasStyle = {
  width: "100%",
  height: 320,
};

const mapFloatingInfoStyle = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 2,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 16,
  padding: 10,
  boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const legendWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

const legendItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(148,163,184,0.18)",
  fontSize: 12,
};

const legendDotStyle = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
  flexShrink: 0,
};

const drawerStyle = {
  marginTop: -8,
  background: "rgba(255,255,255,0.96)",
  borderRadius: 24,
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 20px 40px rgba(15,23,42,0.08)",
  padding: "10px 12px 16px",
};

const drawerHandleStyle = {
  width: 52,
  height: 5,
  borderRadius: 999,
  background: "rgba(148,163,184,0.45)",
  margin: "0 auto 6px",
};

const mapShellStyle = {
  position: "relative",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

const mapOverlayStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  textAlign: "center",
  color: "#475569",
  background: "rgba(255,255,255,0.68)",
  fontSize: 14,
  backdropFilter: "blur(2px)",
};
