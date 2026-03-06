export const sectionCardStyle = {
  background: "rgba(255,255,255,0.78)",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
};

export const poiCardStyle = {
  background: "rgba(255,255,255,0.95)",
  borderRadius: 14,
  padding: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(148,163,184,0.15)",
  outline: "none",
};

export const poiCardEditableStyle = {
  cursor: "grab",
  borderColor: "rgba(14,165,233,0.22)",
};

export const poiCardClickableStyle = {
  cursor: "pointer",
};

export const poiCardSelectedStyle = {
  borderColor: "rgba(14,165,233,0.45)",
  boxShadow: "0 12px 28px rgba(14,165,233,0.14)",
};

export const poiCardDraggingStyle = {
  opacity: 0.62,
  cursor: "grabbing",
};

export const poiThumbWrapStyle = {
  width: 68,
  minWidth: 68,
  height: 68,
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(248,250,252,0.95)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
};

export const poiThumbImgStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  opacity: 0,
  transition: "opacity 0.2s ease",
};

export const poiThumbPlaceholderStyle = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  fontSize: 22,
  color: "#475569",
  background: "linear-gradient(135deg, rgba(14,165,233,0.10), rgba(16,185,129,0.10))",
};

export const dragHandleStyle = {
  minWidth: 18,
  color: "#94a3b8",
  lineHeight: 1,
  fontSize: 18,
  userSelect: "none",
  paddingTop: 2,
};

export const overviewRouteTextStyle = {
  fontSize: 15,
  lineHeight: 1.5,
  color: "#0f172a",
  background: "rgba(255,255,255,0.9)",
  border: "1px dashed rgba(148,163,184,0.28)",
  borderRadius: 14,
  padding: "12px 14px",
  wordBreak: "break-word",
};

export const tripNoteTextStyle = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#334155",
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 12,
  padding: "10px 12px",
  minHeight: 112,
  flex: 1,
  whiteSpace: "pre-wrap",
};

export const tripInfoSplitRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "stretch",
};

export const tripInfoHalfCardStyle = {
  flex: "1 1 320px",
  minWidth: 0,
};

export const tripWeatherListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: 190,
  overflowY: "auto",
};

export const tripWeatherItemStyle = {
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.95)",
  borderRadius: 12,
  padding: "10px 12px",
  minHeight: 72,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
};

export const tripMenuButtonStyle = {
  minWidth: 40,
  width: 40,
  height: 40,
  borderRadius: 999,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  lineHeight: 1,
  fontFamily: "inherit",
};

export const tripMenuCardStyle = {
  position: "absolute",
  top: 46,
  right: 0,
  minWidth: 160,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14,
  boxShadow: "0 16px 30px rgba(15,23,42,0.12)",
  padding: 6,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  zIndex: 20,
};

export const tripMenuItemStyle = {
  border: "none",
  background: "transparent",
  textAlign: "left",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  fontWeight: 600,
  color: "#0f172a",
  cursor: "pointer",
};

export const tripMenuDangerItemStyle = {
  color: "#b91c1c",
  background: "rgba(254,242,242,0.7)",
};

export const dayHeaderActionBtnStyle = {
  minHeight: 30,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 999,
  fontWeight: 700,
};

export const floatingRouteCtaWrapStyle = {
  position: "fixed",
  right: "max(16px, calc((100vw - 560px) / 2 + 16px))",
  bottom: 18,
  zIndex: 40,
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  pointerEvents: "none",
};

export const floatingAiCtaStyle = {
  pointerEvents: "auto",
  width: 52,
  minWidth: 52,
  height: 52,
  minHeight: 52,
  boxSizing: "border-box",
  padding: 0,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background: "linear-gradient(135deg, #8b5cf6, #22c55e)",
  boxShadow: "0 14px 28px rgba(91,33,182,0.22)",
  border: "1px solid rgba(255,255,255,0.24)",
};

export const floatingRouteCtaStyle = {
  pointerEvents: "auto",
  borderRadius: 999,
  height: 52,
  minHeight: 52,
  boxSizing: "border-box",
  padding: "0 22px",
  fontSize: 16,
  fontWeight: 700,
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 16px 30px rgba(15,23,42,0.22)",
  border: "1px solid rgba(15,23,42,0.08)",
};

export const poiSearchResultCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

export const poiSearchAddBtnStyle = {
  minHeight: 36,
  padding: "0 14px",
  borderRadius: 999,
  fontWeight: 700,
  fontFamily: "inherit",
};

export const deletePoiBtnStyle = {
  position: "absolute",
  top: -2,
  right: -2,
  width: 34,
  minWidth: 34,
  height: 34,
  minHeight: 34,
  padding: 0,
  borderRadius: 999,
  color: "#b91c1c",
  borderColor: "rgba(220,38,38,0.22)",
  background: "rgba(254,242,242,0.72)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const deletePoiBtnMobileTopRightStyle = {
  ...deletePoiBtnStyle,
  width: 32,
  minWidth: 32,
  height: 32,
  minHeight: 32,
};

export const noteButtonStyle = (hasNote) => ({
  marginTop: 10,
  width: "100%",
  textAlign: "left",
  border: "1px dashed rgba(148,163,184,0.45)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(248,250,252,0.9)",
  color: hasNote ? "#0f172a" : "#94a3b8",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1.35,
  outline: "none",
});

export const poiRouteMetaStyle = {
  marginTop: 10,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(248,250,252,0.95)",
};

export const poiRouteModeBadgeStyle = (color) => ({
  width: 20,
  height: 20,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "#fff",
  background: color || "#64748b",
  flexShrink: 0,
});

export const segmentModeSwitchWrapStyle = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

export const segmentModeChipStyle = {
  width: 26,
  height: 26,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  padding: 0,
};

export const segmentModeIconSlotStyle = {
  width: 14,
  height: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
  transform: "translateY(-0.5px)",
};

export const segmentModeChipActiveStyle = {
  borderColor: "#0f172a",
  background: "rgba(15,23,42,0.06)",
};

export const segmentRouteHintStyle = {
  width: "100%",
  marginTop: 6,
  fontSize: 12,
  color: "#7c2d12",
};

export const segmentRouteErrorStyle = {
  width: "100%",
  marginTop: 6,
  fontSize: 12,
  color: "#b91c1c",
};

export const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

export const modalCardStyle = {
  width: "min(560px, 100%)",
  background: "#fff",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
  border: "1px solid rgba(148,163,184,0.22)",
};

export const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "#334155",
};

export const inputStyle = {
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
};

export const textareaStyle = {
  ...inputStyle,
  width: "100%",
  resize: "vertical",
  minHeight: 100,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const errorTextStyle = {
  color: "#dc2626",
  fontSize: 13,
};

export const activeTabStyle = {
  background: "#0f172a",
  color: "#fff",
  borderColor: "#0f172a",
};

export const deleteTripButtonStyle = {
  width: 38,
  minWidth: 38,
  height: 38,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontSize: 18,
  borderColor: "rgba(220,38,38,0.28)",
  color: "#b91c1c",
  background: "rgba(255,255,255,0.95)",
};

export const pageShellStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 6,
};

export const heroMapPanelStyle = {
  position: "relative",
  borderRadius: 22,
  overflow: "hidden",
  background: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0.35))",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 16px 36px rgba(15,23,42,0.12)",
};

export const mapTopBarStyle = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export const heroMapCanvasStyle = {
  width: "100%",
  height: 320,
};

export const mapFloatingInfoStyle = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 2,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 16,
  padding: 10,
  boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

export const legendWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

export const legendItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(248,250,252,0.95)",
  border: "1px solid rgba(148,163,184,0.18)",
  fontSize: 12,
};

export const legendDotStyle = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
  flexShrink: 0,
};

export const drawerStyle = {
  marginTop: -8,
  background: "rgba(255,255,255,0.96)",
  borderRadius: 24,
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 20px 40px rgba(15,23,42,0.08)",
  padding: "10px 12px 16px",
};

export const mapShellStyle = {
  position: "relative",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(248,250,252,0.9)",
};

export const mapOverlayStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  textAlign: "center",
  color: "#475569",
  background: "rgba(255,255,255,0.68)",
  fontSize: 14,
  backdropFilter: "blur(2px)",
};

export const recommendedToggleWrapStyle = {
  position: "absolute",
  left: 10,
  bottom: 10,
  zIndex: 3,
  display: "grid",
  gap: 6,
  maxWidth: "min(280px, calc(100% - 20px))",
};

export const recommendedToggleBtnStyle = {
  minHeight: 38,
  borderRadius: 999,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  background: "rgba(255,255,255,0.96)",
};

export const recommendedToggleBtnActiveStyle = {
  borderColor: "rgba(14,165,233,0.24)",
  background: "rgba(240,249,255,0.96)",
  color: "#0c4a6e",
};

export const recommendedToggleHintStyle = {
  fontSize: 12,
  color: "#334155",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
  padding: "6px 10px",
  boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
};




