export function isLikelyMalaysiaCoordinates(lat: number, lng: number) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  return latNum >= 0 && latNum <= 8.5 && lngNum >= 99 && lngNum <= 120;
}

export const MALAYSIA_MAP_BOUNDS = {
  north: 8.5,
  south: 0,
  west: 99,
  east: 120,
};
