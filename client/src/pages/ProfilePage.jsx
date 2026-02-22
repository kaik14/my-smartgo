import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "../components/icons";
import { clearGuestTrips } from "../services/api";

const FAVORITE_POIS_PLACEHOLDER = [
  { id: 1, name: "Petronas Twin Towers", type: "Landmark" },
  { id: 2, name: "Central Market", type: "Shopping" },
  { id: 3, name: "KL Forest Eco Park", type: "Nature" },
];

export default function ProfilePage() {
  const navigate = useNavigate();

  const user = useMemo(() => {
    // TODO: replace localStorage fallback with authenticated user API data.
    const raw = localStorage.getItem("smartgo_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const handleLogout = () => {
    const shouldLogout = window.confirm("Are you sure you want to log out?");
    if (!shouldLogout) return;
    localStorage.removeItem("smartgo_user");
    clearGuestTrips();
    navigate("/login");
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/trips");
  };

  return (
    <div>
      <div className="row" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <div className="h1" style={{ marginBottom: 4, marginTop: 0 }}>Profile</div>
        <button
          type="button"
          className="iconBtn"
          aria-label="Back"
          onClick={handleBack}
          title="Back"
        >
          <ArrowLeftIcon />
        </button>
      </div>
      <div className="muted">Your account and saved places</div>

      <div className="glass profileCard" style={{ marginTop: 16 }}>
        <div className="sectionTitle" style={{ marginTop: 0 }}>User Info</div>
        <div className="profileRow">
          <span className="muted">Username</span>
          <strong>{user?.username || "Guest"}</strong>
        </div>
        <div className="profileRow">
          <span className="muted">Email</span>
          <strong>{user?.email || "Not logged in"}</strong>
        </div>
      </div>

      <div className="sectionTitle">Favorite POIs</div>
      <div className="stack">
        {FAVORITE_POIS_PLACEHOLDER.map((poi) => (
          <div key={poi.id} className="glass poiCard">
            <div style={{ fontWeight: 800 }}>{poi.name}</div>
            <div className="muted">{poi.type}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>Feature pending implementation</div>
          </div>
        ))}
      </div>

      {!user ? (
        <div className="profileAuthCta">
          <button className="primaryBtn" onClick={() => navigate("/login")}>
            Login
          </button>
          <button className="textLink" onClick={() => navigate("/register")}>
            Register
          </button>
        </div>
      ) : null}

      {user ? (
        <div className="profileLogoutWrap">
          <button className="profileLogoutBtn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
