export function hasValidCoordinates(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

export function isLikelyMalaysiaCoordinates(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;

  // Covers Peninsular + East Malaysia with a small buffer.
  return latNum >= 0 && latNum <= 8.5 && lngNum >= 99 && lngNum <= 120;
}

