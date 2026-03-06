import { AiChatIcon } from "../../../components/icons";
import { floatingRouteCtaWrapStyle, floatingAiCtaStyle, floatingRouteCtaStyle } from "../styles/tripDetailStyles";

export default function TripDetailFloatingActions({
  isMobileLayout,
  floatingRouteCtaRight,
  navigate,
  tripId,
  setRouteEditError,
  setDraggingDayPoi,
  setRouteEditMode,
  activeTab,
  sortedDays,
  setActiveTab,
  routeEditBusy,
  routeEditMode,
}) {
  return (
    <div
      style={{
        ...floatingRouteCtaWrapStyle,
        right: isMobileLayout ? 12 : floatingRouteCtaRight,
        bottom: isMobileLayout ? 12 : floatingRouteCtaWrapStyle.bottom,
        gap: isMobileLayout ? 8 : floatingRouteCtaWrapStyle.gap,
      }}
    >
      <button
        type="button"
        className="secondaryBtn"
        style={{
          ...floatingAiCtaStyle,
          ...(isMobileLayout
            ? {
                width: 46,
                minWidth: 46,
                height: 46,
                minHeight: 46,
              }
            : null),
        }}
        onClick={() => navigate(`/trips/${tripId}/ai-chat`)}
        aria-label="Open AI trip chat"
      >
        <AiChatIcon size={20} />
      </button>
      <button
        type="button"
        className="primaryBtn"
        style={{
          ...floatingRouteCtaStyle,
          ...(isMobileLayout
            ? {
                height: 46,
                minHeight: 46,
                padding: "0 18px",
                fontSize: 15,
              }
            : null),
        }}
        onClick={() => {
          setRouteEditError("");
          setDraggingDayPoi(null);
          setRouteEditMode((value) => {
            const next = !value;
            if (next && activeTab === "overview") {
              const firstRealDay = sortedDays.find((day) => !String(day.day_id).startsWith("virtual-"));
              if (firstRealDay) setActiveTab(String(firstRealDay.day_id));
            }
            return next;
          });
        }}
        disabled={routeEditBusy}
      >
        {routeEditBusy ? "Saving..." : routeEditMode ? "Done Editing" : "Edit Route"}
      </button>
    </div>
  );
}
