import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getTripDetail, patchDayPoiNote } from "../services/api";

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
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

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await getTripDetail(tripId);
        if (!cancelled) {
          setTrip(data);
        }
      } catch (err) {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setError("Trip not found");
        } else {
          setError("Failed to load trip detail");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const totalPois = useMemo(() => {
    if (!trip?.days) return 0;
    return trip.days.reduce((sum, day) => sum + (day.pois?.length || 0), 0);
  }, [trip]);

  const mapPoints = useMemo(() => {
    const days = trip?.days ?? [];
    const selectedDays =
      activeTab === "overview"
        ? days
        : days.filter((day) => String(day.day_id) === String(activeTab));

    return selectedDays.flatMap((day) =>
      (day.pois ?? [])
        .map((item) => {
          const latRaw = item.poi?.lat;
          const lngRaw = item.poi?.lng;

          if (latRaw == null || lngRaw == null || latRaw === "" || lngRaw === "") {
            return null;
          }

          const lat = Number(latRaw);
          const lng = Number(lngRaw);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }

          return {
            lat,
            lng,
            name: item.poi?.name || "Unnamed POI",
            dayPoiId: item.day_poi_id,
            dayNumber: day.day_number,
            visitOrder: item.visit_order,
          };
        })
        .filter(Boolean)
    );
  }, [trip, activeTab]);

  const routeGroups = useMemo(() => {
    const days = trip?.days ?? [];
    const selectedDays =
      activeTab === "overview"
        ? days
        : days.filter((day) => String(day.day_id) === String(activeTab));

    return selectedDays
      .map((day, idx) => {
        const points = (day.pois ?? [])
          .map((item) => {
            const lat = Number(item.poi?.lat);
            const lng = Number(item.poi?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              lat,
              lng,
              name: item.poi?.name || "Unnamed POI",
              dayPoiId: item.day_poi_id,
              visitOrder: item.visit_order,
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
  }, [trip, activeTab]);

  const visibleDays = useMemo(() => {
    if (!trip?.days) return [];
    if (activeTab === "overview") return trip.days;
    return trip.days.filter((day) => String(day.day_id) === String(activeTab));
  }, [trip, activeTab]);

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
        if (cancelled) return;
        setMapError(err instanceof Error ? err.message : "Failed to load map");
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
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    for (const marker of markerRefs.current) {
      marker.setMap(null);
    }
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

    for (const renderer of routeRendererRefs.current) {
      renderer.setMap(null);
    }
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
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeGroups]);

  const openNoteModal = (dayPoi) => {
    setEditingDayPoiId(dayPoi.day_poi_id);
    setNoteDraft(dayPoi.note ?? "");
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

      const nextNote = noteDraft.trim() === "" ? null : noteDraft;
      await patchDayPoiNote(editingDayPoiId, nextNote);

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => ({
            ...day,
            pois: day.pois.map((item) =>
              item.day_poi_id === editingDayPoiId ? { ...item, note: nextNote } : item
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

  if (loading) {
    return <div className="muted">Loading trip detail...</div>;
  }

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

  if (!trip) {
    return <div className="muted">No data</div>;
  }

  return (
    <>
      <div style={pageShellStyle}>
        <section style={heroMapPanelStyle}>
          <div style={mapTopBarStyle}>
            <button className="secondaryBtn" type="button" onClick={() => navigate("/trips")}>
              Back
            </button>
            <div className="muted" style={{ fontSize: 13 }}>
              {activeTab === "overview" ? "Overview" : "Day view"}
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

          <div className="row" style={{ marginTop: 4, alignItems: "flex-start" }}>
            <div>
              <div className="h1" style={{ marginBottom: 4 }}>{trip.title || "Trip Detail"}</div>
              <div className="muted">{trip.destination}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {formatDateRange(trip.start_date, trip.end_date)}
                {totalPois > 0 ? ` | ${totalPois} stops` : ""}
              </div>
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
            {(trip.days ?? []).map((day) => (
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
            {trip.description ? <div className="muted">{trip.description}</div> : null}
            {trip.note ? <div style={sectionCardStyle}>Trip Note: {trip.note}</div> : null}

            <div style={sectionCardStyle}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>mapPoints debug</div>
              <pre style={debugPreStyle}>
                {JSON.stringify(mapPoints, null, 2)}
              </pre>
            </div>

            {visibleDays.length ? (
              visibleDays.map((day) => (
            <section key={day.day_id} style={sectionCardStyle}>
              <div className="row" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>Day {day.day_number}</div>
                <div className="muted">{day.pois?.length || 0} POIs</div>
              </div>

              {!day.pois?.length ? (
                <div className="muted">No POIs yet</div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {day.pois.map((item) => (
                    <div key={item.day_poi_id} style={poiCardStyle}>
                      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                        <div style={{ minWidth: 28, fontWeight: 700, color: "#0f172a" }}>
                          #{item.visit_order ?? "-"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{item.poi?.name || "Unnamed POI"}</div>
                          <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                            {item.poi?.type || "POI"}
                            {item.poi?.address ? ` | ${item.poi.address}` : ""}
                          </div>

                          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                            {item.start_time || "--:--"}
                            {" · "}
                            {item.duration_min ? `${item.duration_min} min` : "duration not set"}
                          </div>

                          <button
                            type="button"
                            onClick={() => openNoteModal(item)}
                            style={noteButtonStyle(item.note)}
                            aria-label="Edit note"
                          >
                            {item.note ? item.note : "备注"}
                          </button>
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
              placeholder="备注内容"
              rows={5}
              style={textareaStyle}
              disabled={savingNote}
            />
            {noteError ? (
              <div style={{ color: "#dc2626", fontSize: 13 }}>{noteError}</div>
            ) : null}
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

const textareaStyle = {
  width: "100%",
  resize: "vertical",
  minHeight: 120,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.35)",
  padding: 12,
  outline: "none",
  fontSize: 14,
  lineHeight: 1.4,
  boxSizing: "border-box",
};

const debugPreStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  lineHeight: 1.4,
  color: "#334155",
};

const activeTabStyle = {
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
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

const mapCanvasStyle = {
  width: "100%",
  height: 260,
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
