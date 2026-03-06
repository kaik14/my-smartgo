import {
  sectionCardStyle,
  tripInfoSplitRowStyle,
  tripInfoHalfCardStyle,
  errorTextStyle,
  textareaStyle,
  tripNoteTextStyle,
  tripWeatherListStyle,
  tripWeatherItemStyle,
} from "../styles/tripDetailStyles";

export default function TripDetailOverviewPanels({
  isOverviewTab,
  editingTripNote,
  savingTripNote,
  handleCancelEditTripNote,
  handleSaveTripNote,
  handleStartEditTripNote,
  tripNoteError,
  tripNoteDraft,
  setTripNoteDraft,
  trip,
  tripWeatherLoading,
  tripWeatherError,
  tripWeatherDays,
  formatTripWeatherDate,
  getWeatherCodeLabel,
}) {
  if (!isOverviewTab) return null;

  return (
    <div style={tripInfoSplitRowStyle}>
      <section
        style={{
          ...sectionCardStyle,
          ...tripInfoHalfCardStyle,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div
          className="row"
          style={{
            marginBottom: 8,
            alignItems: "center",
            gap: 8,
            paddingRight: editingTripNote ? 150 : 72,
          }}
        >
          <div style={{ fontWeight: 700 }}>Trip Note</div>
          {editingTripNote ? (
            <div className="row" style={{ gap: 8, position: "absolute", top: 10, right: 14 }}>
              <button
                type="button"
                className="secondaryBtn"
                onClick={handleCancelEditTripNote}
                disabled={savingTripNote}
                style={{
                  height: 30,
                  minHeight: 30,
                  minWidth: 0,
                  padding: "0 10px",
                  fontSize: 12,
                  borderRadius: 999,
                  lineHeight: 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primaryBtn"
                onClick={handleSaveTripNote}
                disabled={savingTripNote}
                style={{
                  height: 30,
                  minHeight: 30,
                  minWidth: 0,
                  padding: "0 10px",
                  fontSize: 12,
                  borderRadius: 999,
                  lineHeight: 1,
                }}
              >
                {savingTripNote ? "Saving..." : "Save"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="secondaryBtn"
              onClick={handleStartEditTripNote}
              style={{
                position: "absolute",
                top: 10,
                right: 14,
                height: 30,
                minHeight: 30,
                minWidth: 0,
                padding: "0 10px",
                fontSize: 12,
                borderRadius: 999,
                lineHeight: 1,
              }}
            >
              Edit
            </button>
          )}
        </div>
        {tripNoteError ? <div style={{ ...errorTextStyle, marginBottom: 8 }}>{tripNoteError}</div> : null}
        {editingTripNote ? (
          <textarea
            value={tripNoteDraft}
            onChange={(e) => setTripNoteDraft(e.target.value)}
            rows={4}
            style={textareaStyle}
            disabled={savingTripNote}
            placeholder="Add a note for this trip..."
          />
        ) : (
          <div style={tripNoteTextStyle}>
            {String(trip.note || "").trim() || "No trip note yet"}
          </div>
        )}
      </section>

      <section style={{ ...sectionCardStyle, ...tripInfoHalfCardStyle }}>
        <div className="row" style={{ marginBottom: 8, alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Trip Weather</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {trip?.start_date && trip?.end_date ? `${trip.start_date} to ${trip.end_date}` : ""}
          </div>
        </div>

        {tripWeatherLoading ? <div className="muted">Loading weather...</div> : null}
        {!tripWeatherLoading && tripWeatherError ? (
          <div style={{ ...errorTextStyle, marginBottom: 8 }}>{tripWeatherError}</div>
        ) : null}
        {!tripWeatherLoading && !tripWeatherError && !tripWeatherDays.length ? (
          <div className="muted">No weather data</div>
        ) : null}
        {!tripWeatherLoading && tripWeatherDays.length ? (
          <div style={tripWeatherListStyle}>
            {tripWeatherDays.map((item) => (
              <div key={item.date} style={tripWeatherItemStyle}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>
                  {formatTripWeatherDate(item.date)}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {getWeatherCodeLabel(item.weatherCode)}
                </div>
                <div style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
                  {Number.isFinite(item.min) ? Math.round(item.min) : "-"}{"\u00B0C"} ~{" "}
                  {Number.isFinite(item.max) ? Math.round(item.max) : "-"}{"\u00B0C"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
