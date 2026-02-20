import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTrip } from "../services/api";

const PREFS = [
  { key: "classic", label: "Classic Must-Dos", icon: "📍" },
  { key: "food", label: "Food & Drink", icon: "🍽️" },
  { key: "niche", label: "Niche Exploration", icon: "🕵️" },
  { key: "photo", label: "Photogenic Shots", icon: "📸" },
  { key: "shop", label: "Shopping", icon: "🛍️" },
  { key: "walk", label: "City Walk", icon: "🚶" },
  { key: "nature", label: "Nature Scenery", icon: "🏞️" },
  { key: "art", label: "Art & Exhibitions", icon: "🎨" },
  { key: "history", label: "Historical Buildings", icon: "🏛️" },
];

export default function CreateTripPage() {
  const navigate = useNavigate();

  const [destination, setDestination] = useState("Kuala Lumpur");
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-02");
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    const days = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
    return `${destination} ${days}-Day Tour`;
  }, [destination, startDate, endDate]);

  const toggle = (k) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };

  const submit = async (mode) => {
    // mode: "smart" | "self"
    // 先做 MVP：直接创建 trip
    try {
      setLoading(true);
      await createTrip({
        title: mode === "smart" ? `${title} (Smart)` : `${title} (Self)`,
        destination,
        start_date: startDate,
        end_date: endDate,
        // preferences 你后端以后可以加字段存起来（现在先不传也行）
      });
      navigate("/trips");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="iconBtn" onClick={() => navigate(-1)} aria-label="back">
          ←
        </button>
        <div style={{ width: 42 }} />
      </div>

      <div className="h1">Where do you want to go?</div>

      <div className="inputWrap" style={{ marginTop: 10 }}>
        <div className="inputIcon">🔎</div>
        <input
          className="input withIcon"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Kuala Lumpur"
        />
      </div>

      <div className="sectionTitle">How long do you want to go?</div>
      <div className="stack">
        <div className="inputWrap">
          <div className="inputIcon">📅</div>
          <input
            className="input withIcon"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="inputWrap">
          <div className="inputIcon">📅</div>
          <input
            className="input withIcon"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="sectionTitle">Travel Preferences</div>
      <div className="chips">
        {PREFS.map((p) => (
          <div
            key={p.key}
            className={`chip ${selected.has(p.key) ? "active" : ""}`}
            onClick={() => toggle(p.key)}
          >
            <span>{p.icon}</span>
            <span style={{ fontSize: 13 }}>{p.label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 22 }} />

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