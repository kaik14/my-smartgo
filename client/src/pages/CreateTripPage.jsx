import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarIcon, DotIcon, SearchIcon, UserIcon } from "../components/icons";
import { createTrip } from "../services/api";

const PREFS = [
  { key: "classic", label: "Classic Must-Dos" },
  { key: "food", label: "Food & Drink" },
  { key: "niche", label: "Niche Exploration" },
  { key: "photo", label: "Photogenic Shots" },
  { key: "shop", label: "Shopping" },
  { key: "walk", label: "City Walk" },
  { key: "nature", label: "Nature Scenery" },
  { key: "art", label: "Art & Exhibitions" },
  { key: "history", label: "Historical Buildings" },
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

  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const submit = async (mode) => {
    try {
      setLoading(true);
      await createTrip({
        title: mode === "smart" ? `${title} (Smart)` : `${title} (Self)`,
        destination,
        start_date: startDate,
        end_date: endDate,
      });
      navigate("/trips");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="row createTopActions" style={{ marginTop: 6 }}>
        <button className="iconBtn" aria-label="search">
          <SearchIcon />
        </button>
        <button className="iconBtn" aria-label="profile" onClick={() => navigate("/profile")}>
          <UserIcon />
        </button>
      </div>

      <div className="h1">Where do you want to go?</div>

      <div className="inputWrap" style={{ marginTop: 10 }}>
        <div className="inputIcon">
          <SearchIcon size={20} />
        </div>
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
            <span className="chipIcon">
              <DotIcon />
            </span>
            <span style={{ fontSize: 13 }}>{pref.label}</span>
          </button>
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
