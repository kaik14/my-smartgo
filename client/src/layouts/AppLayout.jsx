import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";

function NavItem({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}
    >
      <div style={{ fontSize: 18, lineHeight: 1 }}>{icon}</div>
      <div>{label}</div>
    </NavLink>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ 这里必须存在
  const isWide = location.pathname.startsWith("/nearby");

  return (
    <>
      <div className="appShell">
        <div className={`container ${isWide ? "wide" : ""}`}>
          <Outlet />
        </div>
      </div>

      <div className="bottomNav">
        <NavItem to="/trips" label="Itinerary" icon="👜" />

        <button
          className="plusBtn"
          onClick={() => navigate("/create")}
          aria-label="Create trip"
        >
          <span style={{ fontSize: 24, fontWeight: 900 }}>+</span>
        </button>

        <NavItem to="/nearby" label="Nearby" icon="📍" />
      </div>
    </>
  );
}