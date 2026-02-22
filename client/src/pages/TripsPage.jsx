import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TripCard from "../components/TripCard";
import { SearchIcon, UserIcon } from "../components/icons";
import { getTrips } from "../services/api";

export default function TripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await getTrips();
      setTrips(data);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <div className="h1" style={{ marginBottom: 4 }}>My Trips</div>
          <div className="muted">Your itinerary list</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="iconBtn" aria-label="search">
            <SearchIcon />
          </button>
          <button className="iconBtn" aria-label="profile" onClick={() => navigate("/profile")}>
            <UserIcon />
          </button>
        </div>
      </div>

      <div className="stack tripGrid" style={{ marginTop: 18 }}>
        {loading ? (
          <div className="muted">Loading...</div>
        ) : trips.length === 0 ? (
          <div className="muted">No trips yet. Tap + to create.</div>
        ) : (
          trips.map((trip, idx) => {
            const variants = ["mint", "green", "peach", ""];
            const variant = variants[idx % variants.length];
            return (
              <TripCard
                key={trip.trip_id}
                trip={trip}
                variant={variant}
                onClick={() => navigate(`/trips/${trip.trip_id}`)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
