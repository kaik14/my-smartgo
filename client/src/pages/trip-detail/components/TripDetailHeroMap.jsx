import {
  heroMapPanelStyle,
  mapTopBarStyle,
  mapShellStyle,
  heroMapCanvasStyle,
  mapOverlayStyle,
  recommendedToggleWrapStyle,
  recommendedToggleBtnStyle,
  recommendedToggleBtnActiveStyle,
  recommendedToggleHintStyle,
} from "../styles/tripDetailStyles";

export default function TripDetailHeroMap({
  navigate,
  mapContainerRef,
  mapLoading,
  mapError,
  mapPoints,
  showRecommendedPois,
  setShowRecommendedPois,
  recommendedPoisError,
}) {
  return (
    <section style={heroMapPanelStyle}>
      <div style={mapTopBarStyle}>
        <button className="secondaryBtn" type="button" onClick={() => navigate("/trips")}>
          Back
        </button>
        <div />
      </div>

      <div style={mapShellStyle}>
        <div ref={mapContainerRef} style={heroMapCanvasStyle} />
        {mapLoading ? <div style={mapOverlayStyle}>Loading map...</div> : null}
        {mapError ? <div style={mapOverlayStyle}>{mapError}</div> : null}
        {!mapLoading && !mapError && mapPoints.length === 0 ? (
          <div style={mapOverlayStyle}>No POIs with valid coordinates for this tab</div>
        ) : null}
        {!mapLoading && !mapError ? (
          <div style={recommendedToggleWrapStyle}>
            <button
              type="button"
              className="secondaryBtn"
              style={{
                ...recommendedToggleBtnStyle,
                ...(showRecommendedPois ? recommendedToggleBtnActiveStyle : null),
              }}
              onClick={() => setShowRecommendedPois((prev) => !prev)}
            >
              <span aria-hidden="true">{"\u{1F35C} \u{1F3DB}\uFE0F"}</span>
              <span>{showRecommendedPois ? "Hide Recommended" : "Show Recommended"}</span>
            </button>
            {showRecommendedPois && recommendedPoisError ? (
              <div style={recommendedToggleHintStyle}>
                {recommendedPoisError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
