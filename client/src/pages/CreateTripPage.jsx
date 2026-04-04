import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { CalendarIcon, SearchIcon } from "../components/icons";
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

export default function CreateTripPage() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
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
    const filtered = destinationOptions.filter((item) =>
      q ? item.label.toLowerCase().includes(q) : item.featured
    );
    return filtered.slice(0, 8);
  }, [destination, destinationOptions]);

  const title = useMemo(() => {
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    const days = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
    return `${destination} ${days}-Day Tour`;
  }, [destination, startDate, endDate]);

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
      const selectedPreferenceLabels = Array.from(selected)
        .map((key) => PREFS.find((pref) => pref.key === key)?.label)
        .filter(Boolean);

      const created = await createTrip({
        title: mode === "smart" ? `${title} (Smart)` : `${title} (Self)`,
        destination: destination.trim() || "Untitled Destination",
        start_date: startDate,
        end_date: endDate,
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
              setDestination((prev) => prev.trim() || prev);
              setShowSuggestions(false);
            }
            if (e.key === "Escape") {
              setShowSuggestions(false);
            }
          }}
          placeholder="Kuala Lumpur"
        />
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
                setDestination(item.label);
                setShowSuggestions(false);
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

      <div className="sectionTitle">How long do you want to go?</div>
      <div className="stack">
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
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
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
