import { useState } from "react";

export default function NearbyPage() {
  const [tab, setTab] = useState("all");

  return (
    <div>
      <div className="row" style={{ marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Kuala Lumpur ⌄</div>
          <div className="muted" style={{ fontWeight: 800 }}>
            Light Rain · 23° - 31° 🌧️
          </div>
        </div>

        <button className="iconBtn" aria-label="locate">📡</button>
      </div>

      <div style={{ height: 14 }} />

      <div className="mapBox">
        {/* 这里之后接 Google Maps */}
        <div style={{ padding: 18 }} className="muted">
          Map goes here (Google Maps).
        </div>

        <div className="mapOverlayTop">
          <div style={{ width: 40 }} />
          <div className="glass" style={{ padding: "10px 14px", borderRadius: 999, fontWeight: 900 }}>
            🌀
          </div>
          <button className="iconBtn" aria-label="direction">🧭</button>
        </div>

        <div className="pillGroup">
          <div className={`pill ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
            🔥 All
          </div>
          <div className={`pill ${tab === "gems" ? "active" : ""}`} onClick={() => setTab("gems")}>
            Hidden Gems
          </div>
          <div className={`pill ${tab === "spots" ? "active" : ""}`} onClick={() => setTab("spots")}>
            Treasure Spots
          </div>
        </div>
      </div>
    </div>
  );
}