import { useState } from "react";
import { ChevronDownIcon, DotIcon, LocationArrowIcon } from "../components/icons";

const SPOTS = [
  { id: 1, name: "National Art Gallery", x: "18%", y: "16%" },
  { id: 2, name: "Petronas Twin Towers", x: "54%", y: "34%" },
  { id: 3, name: "Aquarium KLCC", x: "45%", y: "43%" },
  { id: 4, name: "Blackbird KL", x: "64%", y: "50%" },
  { id: 5, name: "KL Tower Mini Zoo", x: "16%", y: "56%" },
  { id: 6, name: "Mega Star Arena", x: "52%", y: "74%" },
];

export default function NearbyPage() {
  const [tab, setTab] = useState("all");

  return (
    <div className="nearbyPage">
      <div className="mapStage">
        <div className="nearbyHeader">
          <div>
            <div className="nearbyTitle">
              Kuala Lumpur
              <span className="nearbyCaret">
                <ChevronDownIcon />
              </span>
            </div>
            <div className="muted nearbyWeather">Light Rain · 23° - 31°</div>
          </div>
          <button className="iconBtn nearbyLocateBtn" aria-label="locate">
            <LocationArrowIcon />
          </button>
        </div>

        <div className="mapCanvas" aria-label="map placeholder">
          {SPOTS.map((spot) => (
            <div key={spot.id} className="poi" style={{ left: spot.x, top: spot.y }}>
              <div className="poiIcon">
                <DotIcon />
              </div>
              <div className="poiLabel">{spot.name}</div>
            </div>
          ))}
        </div>

        <div className="pillGroup nearbyPills">
          <button type="button" className={`pill ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
            All
          </button>
          <button type="button" className={`pill ${tab === "gems" ? "active" : ""}`} onClick={() => setTab("gems")}>
            Hidden Gems
          </button>
          <button type="button" className={`pill ${tab === "spots" ? "active" : ""}`} onClick={() => setTab("spots")}>
            Treasure Spots
          </button>
        </div>
      </div>
    </div>
  );
}
