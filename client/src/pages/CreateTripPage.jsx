import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { CalendarIcon, CloseIcon, SearchIcon } from "../components/icons";
import { createTrip, generateAiTripItinerary } from "../services/api";
import malaysiaLocations from "../data/malaysiaLocations";

function getSmartPlanProgressKey(tripId) {
  return `smartgo_smart_plan_progress_${tripId}`;
}

function setSmartPlanProgress(tripId, progress) {
  if (!tripId) return;
  try {
    localStorage.setItem(
      getSmartPlanProgressKey(tripId),
      JSON.stringify({
        ...progress,
        tripId: String(tripId),
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore localStorage write errors
  }
}

function emitSmartPlanProgress(tripId, progress) {
  try {
    window.dispatchEvent(
      new CustomEvent("smartgo:smart-plan-progress", {
        detail: { tripId: String(tripId), ...progress },
      })
    );
  } catch {
    // ignore event dispatch failures
  }
}

const PREFS = [
  { key: "classic", label: "Classic Must-Dos", emoji: "⭐" },
  { key: "food", label: "Food & Drink", emoji: "🍜" },
  { key: "niche", label: "Niche Exploration", emoji: "🧭" },
  { key: "photo", label: "Photogenic Shots", emoji: "📸" },
  { key: "shop", label: "Shopping", emoji: "🛍️" },
  { key: "walk", label: "City Walk", emoji: "🚶" },
  { key: "nature", label: "Nature Scenery", emoji: "🌿" },
  { key: "art", label: "Art & Exhibitions", emoji: "🎨" },
  { key: "history", label: "Historical Buildings", emoji: "🏛️" },
];

function normalizeDestinationLabel(value) {
  if (value && typeof value === "object") {
    return String(value.city ?? value.label ?? value.name ?? "").trim().replace(/\s+/g, " ");
  }
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getDestinationKey(value) {
  return normalizeDestinationLabel(value).toLowerCase();
}

function formatDestinationTitle(destinations, fallback) {
  const values = destinations.length ? destinations : [fallback].map(normalizeDestinationLabel).filter(Boolean);
  if (!values.length) return "Untitled Destination";
  if (values.length <= 2) return values.join(" + ");
  return `${values.slice(0, 2).join(" + ")} + ${values.length - 2} more`;
}

function mergeDestinationLabels(selectedDestinations, pendingDestination) {
  const values = [];
  const keys = new Set();
  for (const item of [...selectedDestinations, pendingDestination]) {
    const label = normalizeDestinationLabel(item);
    const key = getDestinationKey(label);
    if (label && !keys.has(key)) {
      keys.add(key);
      values.push(label);
    }
  }
  return values;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToYmd(value, days) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

function getInclusiveDayCount(startDate, endDate) {
  const d1 = new Date(`${startDate}T00:00:00`);
  const d2 = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  return Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
}

function getDefaultCityDateRange(existingStays, fallbackStartDate, fallbackEndDate) {
  const lastStay = existingStays[existingStays.length - 1];
  if (!lastStay?.end_date) {
    return { start_date: fallbackStartDate, end_date: fallbackEndDate };
  }
  const start = addDaysToYmd(lastStay.end_date, 1);
  return { start_date: start, end_date: addDaysToYmd(start, 1) };
}

function mergeDestinationStays(selectedDestinations, pendingDestination, fallbackStartDate, fallbackEndDate) {
  const values = [];
  const keys = new Set();

  for (const item of selectedDestinations) {
    const city = normalizeDestinationLabel(item);
    const key = getDestinationKey(city);
    if (!city || keys.has(key)) continue;
    keys.add(key);
    values.push({
      city,
      start_date: item.start_date || fallbackStartDate,
      end_date: item.end_date || fallbackEndDate,
    });
  }

  const pendingCity = normalizeDestinationLabel(pendingDestination);
  const pendingKey = getDestinationKey(pendingCity);
  if (pendingCity && !keys.has(pendingKey)) {
    values.push({
      city: pendingCity,
      ...getDefaultCityDateRange(values, fallbackStartDate, fallbackEndDate),
    });
  }

  return values;
}

function getTripDateRange(cityStays, fallbackStartDate, fallbackEndDate) {
  const validStays = cityStays.filter((stay) => stay.start_date && stay.end_date);
  if (!validStays.length) {
    return { start_date: fallbackStartDate, end_date: fallbackEndDate };
  }

  return {
    start_date: validStays.reduce((earliest, stay) =>
      stay.start_date < earliest ? stay.start_date : earliest, validStays[0].start_date),
    end_date: validStays.reduce((latest, stay) =>
      stay.end_date > latest ? stay.end_date : latest, validStays[0].end_date),
  };
}

export default function CreateTripPage() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [selectedDestinations, setSelectedDestinations] = useState([]);
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");
  const destinationInputRef = useRef(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "SmartGo | Create Trip";
    }
  }, []);

  const destinationOptions = useMemo(() => {
    const featured = malaysiaLocations.featured.map((name) => ({ label: name, featured: true }));
    const cityOptions = malaysiaLocations.states.flatMap(({ state, cities }) =>
      cities.map((city) => ({
        label: city === state ? city : `${city}, ${state}`,
        featured: false,
      }))
    );

    const seen = new Set();
    return [...featured, ...cityOptions].filter((item) => {
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const suggestions = useMemo(() => {
    const q = destination.trim().toLowerCase();
    const selectedKeys = new Set(selectedDestinations.map(getDestinationKey));
    const filtered = destinationOptions.filter((item) =>
      !selectedKeys.has(getDestinationKey(item.label)) &&
      (q ? item.label.toLowerCase().includes(q) : item.featured)
    );
    return filtered.slice(0, 8);
  }, [destination, destinationOptions, selectedDestinations]);

  const title = useMemo(() => {
    const cityStays = mergeDestinationStays(selectedDestinations, destination, startDate, endDate);
    const tripDateRange = getTripDateRange(cityStays, startDate, endDate);
    const days = getInclusiveDayCount(tripDateRange.start_date, tripDateRange.end_date);
    return `${formatDestinationTitle(mergeDestinationLabels(selectedDestinations, destination), destination)} ${days}-Day Tour`;
  }, [destination, selectedDestinations, startDate, endDate]);

  const addDestination = (value) => {
    const labels = String(value || "")
      .split(/[;\n]+/)
      .map(normalizeDestinationLabel)
      .filter(Boolean);
    if (!labels.length) return;

    setSelectedDestinations((prev) => {
      const keys = new Set(prev.map(getDestinationKey));
      const next = [...prev];
      for (const label of labels) {
        const key = getDestinationKey(label);
        if (!keys.has(key)) {
          keys.add(key);
          next.push({
            city: label,
            ...getDefaultCityDateRange(next, startDate, endDate),
          });
        }
      }
      return next;
    });
    setDestination("");
    setShowSuggestions(false);
    window.setTimeout(() => destinationInputRef.current?.blur?.(), 0);
  };

  const removeDestination = (value) => {
    const key = getDestinationKey(value);
    setSelectedDestinations((prev) => prev.filter((item) => getDestinationKey(item) !== key));
  };

  const updateDestinationDate = (value, field, nextValue) => {
    const key = getDestinationKey(value);
    setSelectedDestinations((prev) =>
      prev.map((item) => (getDestinationKey(item) === key ? { ...item, [field]: nextValue } : item))
    );
  };

  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const submit = async (mode) => {
    try {
      setLoading(true);
      setSubmitError("");
      const finalDestinationStays = mergeDestinationStays(selectedDestinations, destination, startDate, endDate);
      const invalidStay = finalDestinationStays.find((stay) => stay.end_date < stay.start_date);
      if (invalidStay) {
        setSubmitError(`${invalidStay.city} end date cannot be earlier than start date.`);
        return;
      }
      const tripDateRange = getTripDateRange(finalDestinationStays, startDate, endDate);
      const finalDestinationLabels = finalDestinationStays.map((stay) => stay.city);
      const destinationText = finalDestinationLabels.length
        ? finalDestinationLabels.join(" / ")
        : "Untitled Destination";
      const selectedPreferenceLabels = Array.from(selected)
        .map((key) => PREFS.find((pref) => pref.key === key)?.label)
        .filter(Boolean);

      const created = await createTrip({
        title: mode === "smart" ? `${title} (Smart)` : `${title} (Self)`,
        destination: destinationText,
        destinations: finalDestinationStays,
        start_date: tripDateRange.start_date,
        end_date: tripDateRange.end_date,
        preferences: selectedPreferenceLabels,
        note: specialRequest.trim() ? specialRequest.trim() : undefined,
      });

      const tripId = created?.trip_id;
      if (mode === "smart") {
        if (String(tripId).startsWith("guest-")) {
          setSubmitError("Smart Plan requires login because AI generation runs on the server.");
          navigate("/trips");
          return;
        }

        setSmartPlanProgress(tripId, {
          status: "generating",
          message: "Smart plan is generating...",
        });
        emitSmartPlanProgress(tripId, {
          status: "generating",
          message: "Smart plan is generating...",
        });
        navigate(`/trips/${tripId}`, { state: { smartPlanGenerating: true } });
        void generateAiTripItinerary(tripId, {
          preferences: selectedPreferenceLabels.length ? selectedPreferenceLabels : undefined,
          user_request: specialRequest.trim() ? specialRequest.trim() : undefined,
        })
          .then(() => {
            setSmartPlanProgress(tripId, {
              status: "completed",
              message: "Smart plan generated.",
            });
            emitSmartPlanProgress(tripId, {
              status: "completed",
              message: "Smart plan generated.",
            });
          })
          .catch((generateErr) => {
            const message = axios.isAxiosError(generateErr)
              ? generateErr.response?.data?.error || generateErr.message
              : generateErr instanceof Error
                ? generateErr.message
                : "AI generation failed";
            setSmartPlanProgress(tripId, {
              status: "error",
              message,
            });
            emitSmartPlanProgress(tripId, {
              status: "error",
              message,
            });
          });
        return;
      }

      navigate("/trips");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.error || err.message;
        const failedStep = err.config?.url?.includes("/ai-generate") ? "AI generate" : "Create trip";
        setSubmitError(`${failedStep} failed${status ? ` (${status})` : ""}: ${message}`);
      } else {
        setSubmitError("Failed to create/generate trip");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="h1">Where do you want to go?</div>

      <div className="inputWrap" style={{ marginTop: 10 }}>
        <div className="inputIcon">
          <SearchIcon size={20} />
        </div>
        <input
          ref={destinationInputRef}
          className="input withIcon"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            window.setTimeout(() => setShowSuggestions(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDestination(destination);
            }
            if (e.key === "Escape") {
              setShowSuggestions(false);
            }
          }}
          placeholder={selectedDestinations.length ? "Add another city" : "Kuala Lumpur"}
        />
      </div>
      {selectedDestinations.length ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10,
          }}
        >
          {selectedDestinations.map((item, index) => (
            <span
              key={`${item.city}-${index}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                maxWidth: "100%",
                padding: "8px 10px",
                borderRadius: 999,
                background: "rgba(15,23,42,0.92)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.city}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.city}`}
                onClick={() => removeDestination(item)}
                style={{
                  width: 20,
                  height: 20,
                  border: 0,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  cursor: "pointer",
                  color: "#fff",
                  background: "rgba(255,255,255,0.18)",
                }}
              >
                <CloseIcon size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        Select one or more cities. Each city can have its own stay dates.
      </div>
      {showSuggestions && suggestions.length > 0 ? (
        <div
          style={{
            marginTop: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 14,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 12px 24px rgba(15,23,42,0.08)",
            overflow: "hidden",
          }}
        >
          {suggestions.map((item) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                addDestination(item.label);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                background: "transparent",
                border: 0,
                borderBottom: "1px solid rgba(148,163,184,0.12)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {item.label}
              {item.featured ? (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#0ea5e9" }}>Popular</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="sectionTitle">When are you going?</div>
      <div className="stack">
        {selectedDestinations.length ? (
          selectedDestinations.map((item) => {
            const cityDays = getInclusiveDayCount(item.start_date, item.end_date);
            const hasDateError = item.end_date < item.start_date;
            return (
              <div
                key={getDestinationKey(item)}
                style={{
                  border: "1px solid rgba(148,163,184,0.22)",
                  borderRadius: 16,
                  padding: 12,
                  background: "rgba(255,255,255,0.72)",
                  boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 800 }}>{item.city}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {hasDateError ? "Check dates" : `${cityDays} day${cityDays > 1 ? "s" : ""}`}
                  </div>
                </div>
                <div className="stack">
                  <div className="inputWrap">
                    <div className="inputIcon">
                      <CalendarIcon />
                    </div>
                    <input
                      className="input withIcon dateInput"
                      type="date"
                      value={item.start_date}
                      onChange={(e) => updateDestinationDate(item, "start_date", e.target.value)}
                    />
                  </div>
                  <div className="inputWrap">
                    <div className="inputIcon">
                      <CalendarIcon />
                    </div>
                    <input
                      className="input withIcon dateInput"
                      type="date"
                      value={item.end_date}
                      min={item.start_date}
                      onChange={(e) => updateDestinationDate(item, "end_date", e.target.value)}
                    />
                  </div>
                </div>
                {hasDateError ? (
                  <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>
                    End date cannot be earlier than start date.
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <>
            <div className="inputWrap">
              <div className="inputIcon">
                <CalendarIcon />
              </div>
              <input
                className="input withIcon dateInput"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="inputWrap">
              <div className="inputIcon">
                <CalendarIcon />
              </div>
              <input
                className="input withIcon dateInput"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="sectionTitle">Travel Preferences</div>
      <div className="chips">
        {PREFS.map((pref) => (
          <button
            type="button"
            key={pref.key}
            className={`chip ${selected.has(pref.key) ? "active" : ""}`}
            onClick={() => toggle(pref.key)}
          >
            <span style={{ fontSize: 13 }}>{pref.label} {pref.emoji}</span>
          </button>
        ))}
      </div>

      <div className="sectionTitle">Special Requests (Optional)</div>
      <div className="inputWrap">
        <textarea
          className="input"
          rows={4}
          value={specialRequest}
          onChange={(e) => setSpecialRequest(e.target.value)}
          placeholder="Example: Keep total budget under RM 2,000, avoid long walks, prefer halal food..."
          style={{ resize: "vertical" }}
        />
      </div>

      <div style={{ height: 22 }} />

      {submitError ? (
        <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{submitError}</div>
      ) : null}

      <div className="stack">
        <button className="primaryBtn" onClick={() => submit("smart")} disabled={loading}>
          {loading ? "Loading..." : "Smart Plan"}
        </button>
        <button className="secondaryBtn" onClick={() => submit("self")} disabled={loading}>
          Self Plan
        </button>
      </div>
    </div>
  );
}
