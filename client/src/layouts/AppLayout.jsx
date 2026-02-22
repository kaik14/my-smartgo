import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PinIcon, SuitcaseIcon } from "../components/icons";

function NavItem({ to, label, icon }) {
  return (
    <NavLink to={to} className={({ isActive }) => `navItem ${isActive ? "active" : ""}`}>
      <div className="navIcon" aria-hidden="true">{icon}</div>
      <div>{label}</div>
    </NavLink>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isWide = location.pathname.startsWith("/nearby");
  const hideBottomNav = location.pathname.startsWith("/profile");

  return (
    <>
      <div className="appShell">
        <div className={`container ${isWide ? "wide" : ""}`}>
          <Outlet />
        </div>
      </div>

      {!hideBottomNav ? (
        <div className="bottomNav">
          <NavItem to="/trips" label="Itinerary" icon={<SuitcaseIcon />} />

          <button className="plusBtn" onClick={() => navigate("/create")} aria-label="Create trip">
            <span style={{ fontSize: 24, fontWeight: 900 }}>+</span>
          </button>

          <NavItem to="/nearby" label="Nearby" icon={<PinIcon />} />
        </div>
      ) : null}
    </>
  );
}
