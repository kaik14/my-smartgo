import { useEffect, useState } from "react";
import { getTrips } from "../services/api";
import TripCard from "../components/TripCard";

export default function TripsPage() {
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
          <div className="muted">Your itinerary list (mobile-first UI)</div>
        </div>

        <button className="iconBtn" aria-label="search">
          🔍
        </button>
      </div>

      <div className="stack" style={{ marginTop: 18 }}>
        {loading ? (
          <div className="muted">Loading...</div>
        ) : trips.length === 0 ? (
          <div className="muted">No trips yet. Tap “+” to create.</div>
        ) : (
          trips.map((t, idx) => {
            const variants = ["mint", "green", "peach", ""]; // "" = 默认蓝
            const variant = variants[idx % variants.length];
            return <TripCard key={t.trip_id} trip={t} variant={variant} />;
          })
        )}
      </div>
    </div>
  );
}