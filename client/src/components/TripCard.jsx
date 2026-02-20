export default function TripCard({ trip, variant = "mint" }) {
  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
  const nights = Math.max(0, days - 1);

  return (
    <div className={`tripCard ${variant}`}>
      <div className="tripTitle">{trip.title}</div>

      <div className="tripMeta">
        <div className="line">
          <div className="bar" />
          <div>
            {days} Days {nights} Night{nights > 1 ? "s" : ""}
          </div>
        </div>
        <div className="line">
          <div className="bar" />
          <div>{trip.destination}</div>
        </div>
      </div>

      <div className="tripImg">
        {/* 先用占位图；以后你可以用 Google Places photo 或你自己的资源 */}
        <img
          alt="trip"
          src="https://images.unsplash.com/photo-1526481280695-3c687fd5432c?auto=format&fit=crop&w=400&q=60"
        />
      </div>
    </div>
  );
}