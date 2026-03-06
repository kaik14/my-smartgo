import {
  modalOverlayStyle,
  modalCardStyle,
  errorTextStyle,
  textareaStyle,
  labelStyle,
  inputStyle,
  poiSearchResultCardStyle,
  poiSearchAddBtnStyle,
} from "../styles/tripDetailStyles";

export default function TripDetailModals({
  noteModalOpen,
  closeNoteModal,
  noteDraft,
  setNoteDraft,
  savingNote,
  noteError,
  saveNote,
  tripDatesModalOpen,
  closeTripDatesModal,
  tripDateDraft,
  setTripDateDraft,
  savingTripDates,
  tripDatesError,
  saveTripDates,
  addPoiModalOpen,
  closeAddPoiModal,
  addPoiTargetDay,
  poiSearchQuery,
  setPoiSearchQuery,
  searchPoisForAdd,
  poiSearchLoading,
  addingPoi,
  poiSearchError,
  poiSearchResults,
  handleAddPoiToDay,
}) {
  return (
    <>
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

      {tripDatesModalOpen ? (
        <div style={modalOverlayStyle} onClick={closeTripDatesModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 6, fontSize: 22 }}>Edit Trip Dates</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Update trip dates. Day tabs and overview will follow the new range after save.
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <label style={labelStyle}>
                <span>Start date</span>
                <input
                  type="date"
                  value={tripDateDraft.start_date}
                  onChange={(e) => setTripDateDraft((prev) => ({ ...prev, start_date: e.target.value }))}
                  style={inputStyle}
                  disabled={savingTripDates}
                />
              </label>
              <label style={labelStyle}>
                <span>End date</span>
                <input
                  type="date"
                  value={tripDateDraft.end_date}
                  onChange={(e) => setTripDateDraft((prev) => ({ ...prev, end_date: e.target.value }))}
                  style={inputStyle}
                  disabled={savingTripDates}
                />
              </label>
            </div>
            {tripDatesError ? <div style={{ ...errorTextStyle, marginTop: 10 }}>{tripDatesError}</div> : null}
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
              <button className="secondaryBtn" type="button" onClick={closeTripDatesModal} disabled={savingTripDates}>
                Cancel
              </button>
              <button className="primaryBtn" type="button" onClick={saveTripDates} disabled={savingTripDates}>
                {savingTripDates ? "Saving..." : "Save dates"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addPoiModalOpen ? (
        <div style={modalOverlayStyle} onClick={closeAddPoiModal}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 6, fontSize: 22 }}>
              Add POI to Day {addPoiTargetDay?.day_number ?? "-"}
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Search places and add one to this day. New POIs start with an empty note.
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={poiSearchQuery}
                onChange={(e) => setPoiSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchPoisForAdd();
                  }
                }}
                placeholder="Search restaurants, museums, attractions..."
                style={{ ...inputStyle, flex: 1 }}
                disabled={poiSearchLoading || addingPoi}
              />
              <button
                type="button"
                className="primaryBtn"
                onClick={() => void searchPoisForAdd()}
                disabled={poiSearchLoading || addingPoi}
              >
                {poiSearchLoading ? "Searching..." : "Search"}
              </button>
            </div>

            {poiSearchError ? <div style={{ ...errorTextStyle, marginTop: 10 }}>{poiSearchError}</div> : null}

            <div className="stack" style={{ gap: 8, marginTop: 12, maxHeight: 320, overflowY: "auto" }}>
              {poiSearchResults.map((place) => (
                <div key={`${place.placeId || place.name}-${place.address}`} style={poiSearchResultCardStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{place.name}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {place.type || "other"}
                      {place.address ? ` | ${place.address}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondaryBtn"
                    onClick={() => void handleAddPoiToDay(place)}
                    disabled={addingPoi}
                    style={poiSearchAddBtnStyle}
                  >
                    {addingPoi ? "Adding..." : "Add"}
                  </button>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
              <button className="secondaryBtn" type="button" onClick={closeAddPoiModal} disabled={addingPoi}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
