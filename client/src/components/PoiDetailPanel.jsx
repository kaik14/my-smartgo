import { useEffect, useMemo, useRef, useState } from "react";

const errorTextStyle = {
  color: "#dc2626",
  fontSize: 13,
};

export default function PoiDetailPanel({
  open,
  isDesktop,
  target,
  loading,
  error,
  details,
  introExpanded,
  onToggleIntro,
  onClose,
  canFavorite,
  isFavorite,
  favoriteBusy,
  onToggleFavorite,
  enableStreetView = false,
}) {
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  const [mobilePanelOffsetY, setMobilePanelOffsetY] = useState(0);
  const [mobileDragging, setMobileDragging] = useState(false);
  const [streetViewEnabled, setStreetViewEnabled] = useState(false);
  const [streetViewStatus, setStreetViewStatus] = useState("idle");
  const [streetViewMessage, setStreetViewMessage] = useState("");
  const dragStateRef = useRef({ startY: 0, startOffsetY: 0, active: false });
  const streetViewContainerRef = useRef(null);
  const streetViewRef = useRef(null);
  const streetViewServiceRef = useRef(null);
  const streetViewTimeoutRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportHeight(window.innerHeight);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isDesktop) return;
    if (!open) {
      setMobileDragging(false);
      setMobilePanelOffsetY(0);
      dragStateRef.current = { startY: 0, startOffsetY: 0, active: false };
      return;
    }
    setMobilePanelOffsetY(0);
  }, [open, isDesktop, target?.dayPoiId, target?.poi?.poi_id]);

  useEffect(() => {
    if (!open) {
      setStreetViewEnabled(false);
      setStreetViewStatus("idle");
      setStreetViewMessage("");
      return;
    }
    setStreetViewEnabled(false);
    setStreetViewStatus("idle");
    setStreetViewMessage("");
  }, [open, target?.dayPoiId, target?.poi?.poi_id]);

  const mobileMaxOffsetY = useMemo(() => Math.max(220, Math.round(viewportHeight * 0.72)), [viewportHeight]);
  const mobileCloseThresholdY = useMemo(() => Math.max(170, Math.round(viewportHeight * 0.46)), [viewportHeight]);

  const safeTarget = target || {};
  const poi = safeTarget.poi || {};
  const googlePlace = details?.google_place || null;
  const introText = String(
    details?.poi?.description || poi.description || googlePlace?.introduction || ""
  ).trim();
  const positiveReviews = Array.isArray(googlePlace?.reviews?.positive) ? googlePlace.reviews.positive : [];
  const negativeReviews = Array.isArray(googlePlace?.reviews?.negative) ? googlePlace.reviews.negative : [];
  const positiveSummary = Array.isArray(googlePlace?.review_summary?.positive) ? googlePlace.review_summary.positive : [];
  const negativeSummary = Array.isArray(googlePlace?.review_summary?.negative) ? googlePlace.review_summary.negative : [];
  const hasNegativeReviewContent = negativeReviews.length > 0 || negativeSummary.length > 0;
  const contact = googlePlace?.contact || {};
  const contactAddress = String(contact?.address || poi.address || "").trim();
  const contactPhone = String(contact?.phone || "").trim();
  const contactWebsite = String(contact?.website || "").trim();
  const contactMapsUrl = String(contact?.google_maps_url || "").trim();
  const openingHoursWeekdayText = Array.isArray(contact?.opening_hours_weekday_text)
    ? contact.opening_hours_weekday_text
    : [];
  const hasContactInfo =
    Boolean(contactAddress) ||
    Boolean(contactPhone) ||
    Boolean(contactWebsite) ||
    Boolean(contactMapsUrl) ||
    openingHoursWeekdayText.length > 0;
  const imageUrl = String(details?.poi?.image_url || poi.image_url || "").trim();
  const typeLabel = String(poi.type || googlePlace?.primary_type_label || "Other")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const shouldClampIntro = introText.length > 220 && !introExpanded;
  const placeId = String(googlePlace?.place_id || safeTarget?.placeId || "").trim();
  const lat = Number(details?.poi?.lat ?? poi.lat ?? safeTarget?.lat);
  const lng = Number(details?.poi?.lng ?? poi.lng ?? safeTarget?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    let active = true;
    let timeoutId = null;

    if (!enableStreetView || !open || !streetViewEnabled) {
      setStreetViewStatus("idle");
      setStreetViewMessage("");
      return () => {
        active = false;
      };
    }

    if (typeof window === "undefined") {
      setStreetViewStatus("unavailable");
      setStreetViewMessage("Street View unavailable");
      return () => {
        active = false;
      };
    }

    if (!placeId && !hasCoords) {
      setStreetViewStatus("unavailable");
      setStreetViewMessage("Street View unavailable");
      return () => {
        active = false;
      };
    }

    if (!window.google?.maps?.StreetViewService || !window.google?.maps?.StreetViewPanorama) {
      setStreetViewStatus("unavailable");
      setStreetViewMessage("Street View unavailable (Maps JS API not ready)");
      return () => {
        active = false;
      };
    }

    setStreetViewStatus("loading");
    setStreetViewMessage("");

    try {
      const service = streetViewServiceRef.current || new window.google.maps.StreetViewService();
      streetViewServiceRef.current = service;

      const requestByLocation = (location) => ({
        location,
        radius: 120,
        source: window.google?.maps?.StreetViewSource?.OUTDOOR,
      });

    timeoutId = window.setTimeout(() => {
      if (!active) return;
      setStreetViewStatus("unavailable");
      setStreetViewMessage("Street View unavailable (TIMEOUT)");
    }, 6000);
    streetViewTimeoutRef.current = timeoutId;

      const handlePanorama = (data, status) => {
        if (!active) return;
        if (status !== "OK" || !data?.location) {
          const safeStatus = status ? String(status) : "UNKNOWN";
          setStreetViewStatus("unavailable");
          setStreetViewMessage(`Street View unavailable (${safeStatus})`);
          return;
        }

        const container = streetViewContainerRef.current;
        if (!container) {
          setStreetViewStatus("unavailable");
          setStreetViewMessage("Street View unavailable (container missing)");
          return;
        }

        let panorama = streetViewRef.current;
        if (!panorama) {
          panorama = new window.google.maps.StreetViewPanorama(container, {
            pov: { heading: 0, pitch: 0 },
            zoom: 0,
            addressControl: false,
            fullscreenControl: true,
            motionTracking: false,
            motionTrackingControl: false,
          });
          streetViewRef.current = panorama;
        }

        if (streetViewTimeoutRef.current) {
          window.clearTimeout(streetViewTimeoutRef.current);
          streetViewTimeoutRef.current = null;
        }

        if (data.location?.pano) {
          panorama.setPano(data.location.pano);
        } else if (data.location?.latLng) {
          panorama.setPosition(data.location.latLng);
        }

        panorama.setVisible(true);
        setStreetViewStatus("available");
      };

      if (hasCoords) {
        service.getPanorama(requestByLocation({ lat, lng }), handlePanorama);
        return () => {
          active = false;
          if (timeoutId) window.clearTimeout(timeoutId);
          if (streetViewTimeoutRef.current) {
            window.clearTimeout(streetViewTimeoutRef.current);
            streetViewTimeoutRef.current = null;
          }
          if (streetViewRef.current) {
            streetViewRef.current.setVisible(false);
          }
        };
      }

      if (placeId && window.google?.maps?.places?.PlacesService) {
        const placesService =
          streetViewServiceRef.current?.placesService ||
          new window.google.maps.places.PlacesService(document.createElement("div"));
        streetViewServiceRef.current.placesService = placesService;

        placesService.getDetails({ placeId, fields: ["geometry"] }, (place, status) => {
          if (!active) return;
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
            const safeStatus = status ? String(status) : "UNKNOWN";
            setStreetViewStatus("unavailable");
            setStreetViewMessage(`Street View unavailable (${safeStatus})`);
            return;
          }
          const loc = place.geometry.location;
          const location = {
            lat: typeof loc.lat === "function" ? loc.lat() : Number(loc.lat),
            lng: typeof loc.lng === "function" ? loc.lng() : Number(loc.lng),
          };
          if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
            setStreetViewStatus("unavailable");
            setStreetViewMessage("Street View unavailable (no coords)");
            return;
          }
          service.getPanorama(requestByLocation(location), handlePanorama);
        });
        return () => {
          active = false;
          if (timeoutId) window.clearTimeout(timeoutId);
          if (streetViewTimeoutRef.current) {
            window.clearTimeout(streetViewTimeoutRef.current);
            streetViewTimeoutRef.current = null;
          }
          if (streetViewRef.current) {
            streetViewRef.current.setVisible(false);
          }
        };
      }

      setStreetViewStatus("unavailable");
      setStreetViewMessage("Street View unavailable (no coords)");
    } catch {
      if (active) {
        setStreetViewStatus("unavailable");
        setStreetViewMessage("Street View unavailable");
      }
    }

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (streetViewTimeoutRef.current) {
        window.clearTimeout(streetViewTimeoutRef.current);
        streetViewTimeoutRef.current = null;
      }
      if (streetViewRef.current) {
        streetViewRef.current.setVisible(false);
      }
    };
  }, [enableStreetView, open, streetViewEnabled, placeId, hasCoords, lat, lng]);

  const startDragAt = (clientY) => {
    if (isDesktop) return;
    dragStateRef.current = {
      startY: clientY,
      startOffsetY: mobilePanelOffsetY,
      active: true,
    };
    setMobileDragging(true);
  };

  const moveDragAt = (clientY) => {
    if (isDesktop) return;
    if (!dragStateRef.current.active) return;
    const deltaY = clientY - dragStateRef.current.startY;
    const nextOffset = Math.min(mobileMaxOffsetY, Math.max(0, dragStateRef.current.startOffsetY + deltaY));
    setMobilePanelOffsetY(nextOffset);
  };

  const endDrag = () => {
    if (isDesktop) return;
    if (!dragStateRef.current.active) return;
    if (mobilePanelOffsetY >= mobileCloseThresholdY) {
      setMobileDragging(false);
      dragStateRef.current = { startY: 0, startOffsetY: 0, active: false };
      onClose();
      return;
    }
    setMobilePanelOffsetY(0);
    setMobileDragging(false);
    dragStateRef.current = { startY: 0, startOffsetY: 0, active: false };
  };

  if (!open || !target) return null;

  return (
    <div
      style={
        isDesktop
          ? poiDetailDesktopWrapStyle
          : {
              ...poiDetailMobileWrapStyle,
              transform: `translateY(${Math.round(mobilePanelOffsetY)}px)`,
              transition: mobileDragging ? "none" : "transform 0.2s ease",
            }
      }
      role="dialog"
      aria-modal="false"
      aria-label="POI details"
    >
      <div style={poiDetailStickyHeaderStyle}>
        <div
          style={{
            ...poiDetailHandleStyle,
            ...(isDesktop ? null : { cursor: mobileDragging ? "grabbing" : "grab", touchAction: "none" }),
          }}
          aria-hidden="true"
          onMouseDown={isDesktop ? undefined : (event) => startDragAt(event.clientY)}
          onMouseMove={isDesktop ? undefined : (event) => moveDragAt(event.clientY)}
          onMouseUp={isDesktop ? undefined : endDrag}
          onMouseLeave={isDesktop ? undefined : endDrag}
          onTouchStart={
            isDesktop
              ? undefined
              : (event) => {
                  const touch = event.touches?.[0];
                  if (!touch) return;
                  startDragAt(touch.clientY);
                }
          }
          onTouchMove={
            isDesktop
              ? undefined
              : (event) => {
                  const touch = event.touches?.[0];
                  if (!touch) return;
                  moveDragAt(touch.clientY);
                }
          }
          onTouchEnd={isDesktop ? undefined : endDrag}
          onTouchCancel={isDesktop ? undefined : endDrag}
        />
        <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={poiDetailTitleStyle}>{poi.name || "Unnamed POI"}</div>
          </div>
          <button
            type="button"
            className="secondaryBtn"
            onClick={(event) => {
              event.stopPropagation();
              setMobileDragging(false);
              setMobilePanelOffsetY(0);
              dragStateRef.current = { startY: 0, startOffsetY: 0, active: false };
              onClose();
            }}
            style={poiDetailCloseBtnStyle}
          >
            x
          </button>
        </div>
      </div>

      <div
        className="row"
        style={{ gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-start" }}
      >
        {googlePlace?.rating ? (
          <span style={poiDetailRatingChipStyle}>
            <span aria-hidden="true" style={poiDetailEmojiStarStyle}>{"\u2B50"}</span>
            <span style={{ fontWeight: 600, letterSpacing: "-0.01em", color: "#9a3412" }}>
              {Number(googlePlace.rating).toFixed(1)}
            </span>
          </span>
        ) : null}
        <span style={poiDetailTypeChipStyle}>{typeLabel || "Other"}</span>
        {canFavorite ? (
          <button
            type="button"
            className="secondaryBtn"
            style={{
              ...poiDetailFavoriteChipStyle,
              ...(isFavorite ? poiDetailFavoriteChipActiveStyle : null),
            }}
            onClick={onToggleFavorite}
            disabled={favoriteBusy}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>{"\u2605"}</span>
            <span>{favoriteBusy ? "..." : isFavorite ? "Saved" : "Favorite"}</span>
          </button>
        ) : null}
      </div>

      {imageUrl ? (
        <div style={poiDetailImageWrapStyle}>
          <img src={imageUrl} alt={poi.name || "POI image"} style={poiDetailImageStyle} referrerPolicy="no-referrer" />
        </div>
      ) : null}

      {enableStreetView ? (
        <div style={{ marginTop: 14 }}>
          <div style={poiDetailSectionHeaderRowStyle}>
            <div style={poiDetailSectionTitleStyle}>Street View</div>
            <button
              type="button"
              role="switch"
              aria-checked={streetViewEnabled}
              onClick={() => {
                const nextEnabled = !streetViewEnabled;
                setStreetViewEnabled(nextEnabled);
                setStreetViewStatus("idle");
                setStreetViewMessage("");
                if (!nextEnabled && streetViewRef.current) {
                  streetViewRef.current.setVisible(false);
                  streetViewRef.current = null;
                }
              }}
              style={{
                ...poiDetailSwitchBtnStyle,
                ...(streetViewEnabled ? poiDetailSwitchBtnActiveStyle : null),
              }}
            >
              <span
                style={{
                  ...poiDetailSwitchThumbStyle,
                  ...(streetViewEnabled ? poiDetailSwitchThumbActiveStyle : null),
                }}
              />
            </button>
          </div>
          {streetViewEnabled ? (
            streetViewStatus === "available" || streetViewStatus === "loading" ? (
              <div style={poiDetailStreetViewWrapStyle}>
                <div ref={streetViewContainerRef} style={poiDetailStreetViewStyle} />
                {streetViewStatus === "loading" ? (
                  <div style={poiDetailStreetViewOverlayStyle}>Loading street view...</div>
                ) : null}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8, display: "grid", gap: 4 }}>
                <div>{streetViewMessage || "Street View unavailable (UNKNOWN)"}</div>
                <div style={{ fontSize: 12 }}>
                  Status: {streetViewStatus} | placeId: {placeId ? "yes" : "no"} | coords: {hasCoords ? "yes" : "no"} | mapsReady: {window.google?.maps ? "yes" : "no"}
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div style={poiDetailSectionTitleStyle}>Introduction</div>
        {loading && !details ? <div className="muted" style={{ marginTop: 8 }}>Loading place details...</div> : null}
        {error ? <div style={{ ...errorTextStyle, marginTop: 8 }}>{error}</div> : null}
        {!loading && !error ? (
          introText ? (
            <>
              <div
                style={{
                  ...poiDetailIntroTextStyle,
                  ...(shouldClampIntro ? poiDetailIntroClampStyle : null),
                }}
              >
                {introText}
              </div>
              {introText.length > 220 ? (
                <button type="button" className="secondaryBtn" style={poiDetailTextActionStyle} onClick={onToggleIntro}>
                  {introExpanded ? "Collapse" : "Expand"}
                </button>
              ) : null}
            </>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>No introduction available yet.</div>
          )
        ) : null}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={poiDetailSectionTitleStyle}>Selected Reviews</div>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div style={poiDetailReviewSectionCardStyle}>
            <div style={poiDetailReviewSectionHeadingStyle}>What people like</div>
            {positiveReviews.length ? positiveReviews.map((quote, index) => (
              <div key={`p-${index}-${quote.slice(0, 20)}`}>
                <blockquote style={poiDetailQuoteStyle}>
                  "{quote}"
                </blockquote>
              </div>
            )) : positiveSummary.length ? positiveSummary.map((item, index) => (
              <div key={`ps-${index}-${item.slice(0, 24)}`} style={poiDetailSummaryItemStyle}>
                {item}
              </div>
            )) : <div className="muted">No positive review quotes available</div>}
          </div>
          {hasNegativeReviewContent ? (
            <div style={poiDetailReviewSectionCardStyle}>
              <div style={poiDetailReviewSectionHeadingStyle}>What to watch out for</div>
              {negativeReviews.length ? negativeReviews.map((quote, index) => (
                <div key={`n-${index}-${quote.slice(0, 20)}`}>
                  <blockquote style={poiDetailQuoteStyle}>
                    "{quote}"
                  </blockquote>
                </div>
              )) : negativeSummary.length ? negativeSummary.map((item, index) => (
                <div key={`ns-${index}-${item.slice(0, 24)}`} style={poiDetailSummaryItemStyle}>
                  {item}
                </div>
              )) : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasContactInfo ? (
        <div style={{ marginTop: 16 }}>
          <div style={poiDetailSectionTitleStyle}>Info</div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {contactAddress ? (
              <div style={poiDetailInfoRowStyle}>
                <div style={poiDetailInfoLabelStyle}>Address</div>
                <div style={poiDetailInfoValueStyle}>{contactAddress}</div>
              </div>
            ) : null}
            {contactPhone ? (
              <div style={poiDetailInfoRowStyle}>
                <div style={poiDetailInfoLabelStyle}>Phone</div>
                <a href={`tel:${contactPhone}`} style={poiDetailInfoLinkStyle}>
                  {contactPhone}
                </a>
              </div>
            ) : null}
            {contactWebsite ? (
              <div style={poiDetailInfoRowStyle}>
                <div style={poiDetailInfoLabelStyle}>Website</div>
                <a href={contactWebsite} target="_blank" rel="noreferrer" style={poiDetailInfoLinkStyle}>
                  {contactWebsite}
                </a>
              </div>
            ) : null}
            {contactMapsUrl ? (
              <div style={poiDetailInfoRowStyle}>
                <div style={poiDetailInfoLabelStyle}>Google Maps</div>
                <a href={contactMapsUrl} target="_blank" rel="noreferrer" style={poiDetailInfoLinkStyle}>
                  Open in Maps
                </a>
              </div>
            ) : null}
            {openingHoursWeekdayText.length ? (
              <div style={poiDetailInfoRowStyle}>
                <div style={poiDetailInfoLabelStyle}>Opening Hours</div>
                <div style={{ ...poiDetailInfoValueStyle, display: "grid", gap: 4 }}>
                  {openingHoursWeekdayText.map((line, index) => (
                    <div key={`${index}-${line.slice(0, 12)}`}>{line}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const poiDetailDesktopWrapStyle = {
  position: "fixed",
  top: 92,
  right: "max(16px, calc((100vw - 560px) / 2 - 360px))",
  width: "min(360px, calc(100vw - 24px))",
  maxHeight: "calc(100vh - 116px)",
  overflowY: "auto",
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 22,
  boxShadow: "0 24px 50px rgba(15,23,42,0.18)",
  padding: "0 12px 16px",
  zIndex: 60,
};

const poiDetailMobileWrapStyle = {
  position: "fixed",
  left: 10,
  right: 10,
  bottom: 10,
  height: "86vh",
  maxHeight: "86vh",
  overflowY: "auto",
  background: "rgba(255,255,255,0.99)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 22,
  boxShadow: "0 24px 50px rgba(15,23,42,0.22)",
  padding: "0 12px 16px",
  zIndex: 80,
};

const poiDetailHandleStyle = {
  width: 50,
  height: 5,
  borderRadius: 999,
  background: "rgba(148,163,184,0.4)",
  margin: "2px auto 10px",
};

const poiDetailStickyHeaderStyle = {
  position: "sticky",
  top: 0,
  zIndex: 6,
  background: "#fff",
  margin: "0 -12px 4px",
  padding: "10px 12px 8px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
};

const poiDetailTitleStyle = {
  fontSize: 24,
  lineHeight: 1.12,
  fontWeight: 800,
  color: "#0f172a",
  wordBreak: "break-word",
};

const poiDetailCloseBtnStyle = {
  width: 42,
  minWidth: 42,
  height: 42,
  borderRadius: 999,
  padding: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 26,
  lineHeight: 1,
  color: "#0f172a",
};

const poiDetailRatingChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px 4px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
  border: "1px solid rgba(15,23,42,0.08)",
  fontSize: 13,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.8)",
};

const poiDetailEmojiStarStyle = {
  fontSize: 12,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transform: "translateY(-0.2px)",
};

const poiDetailTypeChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(248,250,252,0.95)",
  color: "#475569",
  border: "1px solid rgba(148,163,184,0.18)",
  fontSize: 13,
  fontWeight: 600,
};

const poiDetailFavoriteChipStyle = {
  height: 30,
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  boxShadow: "none",
  background: "rgba(255,255,255,0.92)",
};

const poiDetailFavoriteChipActiveStyle = {
  color: "#9a3412",
  borderColor: "rgba(245,158,11,0.22)",
  background: "rgba(255,251,235,0.95)",
};

const poiDetailImageWrapStyle = {
  marginTop: 14,
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

const poiDetailImageStyle = {
  width: "100%",
  height: 210,
  objectFit: "cover",
  display: "block",
};

const poiDetailStreetViewWrapStyle = {
  marginTop: 8,
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
  position: "relative",
};

const poiDetailStreetViewStyle = {
  width: "100%",
  height: 240,
};

const poiDetailStreetViewOverlayStyle = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(4px)",
};

const poiDetailSectionTitleStyle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
};

const poiDetailIntroTextStyle = {
  marginTop: 8,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const poiDetailIntroClampStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 4,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const poiDetailTextActionStyle = {
  marginTop: 8,
  borderRadius: 999,
  minHeight: 30,
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 700,
};

const poiDetailSectionHeaderRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const poiDetailSwitchBtnStyle = {
  width: 46,
  height: 26,
  borderRadius: 999,
  border: "none",
  background: "rgba(226,232,240,0.9)",
  padding: 0,
  position: "relative",
  cursor: "pointer",
  outline: "none",
  boxShadow: "inset 0 0 0 1px rgba(203,213,225,0.9)",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  transition: "background 0.2s ease, border-color 0.2s ease",
};

const poiDetailSwitchBtnActiveStyle = {
  background: "rgba(34,197,94,0.9)",
  borderColor: "rgba(34,197,94,0.55)",
};

const poiDetailSwitchThumbStyle = {
  position: "absolute",
  top: "50%",
  left: 2,
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "#fff",
  boxShadow: "none",
  transform: "translateY(-50%)",
  transition: "transform 0.2s ease",
};

const poiDetailSwitchThumbActiveStyle = {
  transform: "translate(20px, -50%)",
};

const poiDetailReviewSectionCardStyle = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(248,250,252,0.9)",
  padding: "10px 12px",
  display: "grid",
  gap: 8,
};

const poiDetailReviewSectionHeadingStyle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#0f172a",
};

const poiDetailQuoteStyle = {
  margin: 0,
  padding: "8px 10px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.45,
};

const poiDetailSummaryItemStyle = {
  borderRadius: 10,
  background: "rgba(255,255,255,0.9)",
  border: "1px dashed rgba(148,163,184,0.22)",
  padding: "8px 10px",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.4,
};

const poiDetailInfoRowStyle = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  display: "grid",
  gap: 4,
};

const poiDetailInfoLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const poiDetailInfoValueStyle = {
  fontSize: 13,
  lineHeight: 1.45,
  color: "#0f172a",
  wordBreak: "break-word",
};

const poiDetailInfoLinkStyle = {
  ...poiDetailInfoValueStyle,
  color: "#0369a1",
  textDecoration: "none",
};
