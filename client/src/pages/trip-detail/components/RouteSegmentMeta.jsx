import {
  formatRouteDistance,
  formatRouteDuration,
  getRouteModeMeta,
  SEGMENT_MODE_OPTIONS,
} from "../utils/tripDetailHelpers";
import {
  poiRouteMetaStyle,
  poiRouteModeBadgeStyle,
  segmentModeSwitchWrapStyle,
  segmentModeChipStyle,
  segmentModeChipActiveStyle,
  segmentModeIconSlotStyle,
  segmentRouteHintStyle,
  segmentRouteErrorStyle,
} from "../styles/tripDetailStyles";

export function RouteModeLineIcon({ modeKey, size = 14, color = "currentColor" }) {
  const isWalking = modeKey === "WALKING";
  const renderSize = isWalking ? size + 1 : size;
  const common = {
    width: renderSize,
    height: renderSize,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: "false",
    style: {
      display: "block",
      transform: isWalking ? "translateY(0.8px)" : undefined,
    },
  };

  if (modeKey === "WALKING") {
    return (
      <svg {...common}>
        <circle cx="12" cy="5" r="1.7" />
        <path d="M12 7.2v5.4" />
        <path d="M9.8 9.8l2.2-1.2 2.2 1.2" />
        <path d="M12 12.6l-2 4.4" />
        <path d="M12 12.6l2 4.4" />
        <path d="M10 17h4" />
      </svg>
    );
  }
  if (modeKey === "DRIVING") {
    return (
      <svg {...common}>
        <path d="M5 16l1.5-4.5A2 2 0 0 1 8.4 10h7.2a2 2 0 0 1 1.9 1.5L19 16" />
        <path d="M4 16h16v3a1 1 0 0 1-1 1h-1v-2H6v2H5a1 1 0 0 1-1-1z" />
        <circle cx="7.5" cy="16" r=".8" fill={color} stroke="none" />
        <circle cx="16.5" cy="16" r=".8" fill={color} stroke="none" />
      </svg>
    );
  }
  if (modeKey === "TRANSIT") {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="12" height="14" rx="2" />
        <path d="M9 17l-1 4" />
        <path d="M15 17l1 4" />
        <path d="M8 8h8" />
        <path d="M10 12h4" />
        <circle cx="9" cy="14" r=".7" fill={color} stroke="none" />
        <circle cx="15" cy="14" r=".7" fill={color} stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function TrashLineIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <rect x="6" y="7" width="12" height="13" rx="2" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

export function PoiRouteSegmentMeta({ segment, overrideMode = "AUTO", onChangeMode }) {
  if (!segment) return null;
  const modeMeta = getRouteModeMeta(segment.modeKey);
  const effectiveSelectedMode = segment.displayOverrideMode || overrideMode;

  return (
    <div style={poiRouteMetaStyle}>
      <span style={poiRouteModeBadgeStyle(modeMeta.color)} aria-hidden="true">
        <RouteModeLineIcon modeKey={segment.modeKey} size={12} color="#fff" />
      </span>
      <span style={{ color: "#334155", fontWeight: 600 }}>{modeMeta.shortLabel}</span>
      <span className="muted">{formatRouteDistance(segment.distanceMeters)}</span>
      <span className="muted">{formatRouteDuration(segment.durationSeconds)}</span>
      {onChangeMode ? (
        <div style={segmentModeSwitchWrapStyle}>
          {SEGMENT_MODE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeMode(option.key);
              }}
              style={{
                ...segmentModeChipStyle,
                ...(effectiveSelectedMode === option.key ? segmentModeChipActiveStyle : null),
              }}
              title={option.label}
            >
              <span style={segmentModeIconSlotStyle}>
                <RouteModeLineIcon modeKey={option.key} size={13} color="#334155" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {segment.warning ? <div style={segmentRouteHintStyle}>{segment.warning}</div> : null}
      {segment.error ? <div style={segmentRouteErrorStyle}>{segment.error}</div> : null}
    </div>
  );
}
