import { useEffect, useState } from "react";

export default function TripCard({ trip, variant = "mint", onClick }) {
  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
  const nights = Math.max(0, days - 1);
  const fallbackCover = "https://images.unsplash.com/photo-1526481280695-3c687fd5432c?auto=format&fit=crop&w=400&q=60";
  const [imgSrc, setImgSrc] = useState(trip.cover_image_url || fallbackCover);

  useEffect(() => {
    setImgSrc(trip.cover_image_url || fallbackCover);
  }, [trip.cover_image_url]);

  return (
    <div
      className={`tripCard ${variant}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      aria-label={onClick ? `Open ${trip.title}` : undefined}
    >
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
        <img
          alt="trip"
          src={imgSrc}
          onError={() => {
            if (imgSrc !== fallbackCover) setImgSrc(fallbackCover);
          }}
        />
      </div>
    </div>
  );
}
