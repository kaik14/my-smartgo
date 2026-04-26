import { useCallback, useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import AppScreen from "../components/AppScreen";
import { createFavoriteFromPlace, deleteFavorite, getFavorites } from "../services/api";
import { isLikelyMalaysiaCoordinates } from "../utils/malaysiaGeo";

const DEFAULT_CENTER = { latitude: 3.139, longitude: 101.6869, latitudeDelta: 0.12, longitudeDelta: 0.08 };

type NearbyPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: "food" | "attractions";
  rating: number | null;
  userRatingsTotal: number;
};

function toNearbyPlace(item: any): NearbyPlace | null {
  const lat = Number(item?.geometry?.location?.lat);
  const lng = Number(item?.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isLikelyMalaysiaCoordinates(lat, lng)) return null;

  const types = Array.isArray(item?.types) ? item.types : [];
  return {
    placeId: String(item?.place_id || ""),
    name: String(item?.name || "Unnamed place"),
    address: String(item?.vicinity || item?.formatted_address || ""),
    lat,
    lng,
    type: types.includes("restaurant") || types.includes("cafe") ? "food" : "attractions",
    rating: Number.isFinite(Number(item?.rating)) ? Number(item.rating) : null,
    userRatingsTotal: Number.isFinite(Number(item?.user_ratings_total)) ? Number(item.user_ratings_total) : 0,
  };
}

async function fetchNearbyPlaces(region: Region, tab: "all" | "food" | "attractions") {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");

  const fetchType = async (type: "restaurant" | "tourist_attraction") => {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${region.latitude},${region.longitude}&radius=2500&type=${type}&key=${apiKey}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json?.status !== "OK" && json?.status !== "ZERO_RESULTS") throw new Error(`Places failed: ${json?.status}`);
    return (json?.results || []).map(toNearbyPlace).filter(Boolean) as NearbyPlace[];
  };

  if (tab === "food") return fetchType("restaurant");
  if (tab === "attractions") return fetchType("tourist_attraction");

  const [food, attractions] = await Promise.all([fetchType("restaurant"), fetchType("tourist_attraction")]);
  const map = new Map<string, NearbyPlace>();
  [...food, ...attractions].forEach((item) => map.set(item.placeId, item));
  return Array.from(map.values()).slice(0, 20);
}

export default function NearbyPage() {
  const [tab, setTab] = useState<"all" | "food" | "attractions">("all");
  const [region, setRegion] = useState<Region>(DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [detail, setDetail] = useState<NearbyPlace | null>(null);
  const [favoritePoiIds, setFavoritePoiIds] = useState<number[]>([]);
  const [busyFavorite, setBusyFavorite] = useState(false);

  const subtitle = useMemo(() => (tab === "all" ? "All nearby places" : tab === "food" ? "Food nearby" : "Attractions nearby"), [tab]);

  const locate = async () => {
    try {
      setLocating(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") throw new Error("Location permission denied");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.06,
      };
      if (!isLikelyMalaysiaCoordinates(next.latitude, next.longitude)) {
        throw new Error("This app currently supports Malaysia only");
      }
      setRegion(next);
    } catch (err: any) {
      setPlacesError(err?.message || "Failed to get location");
    } finally {
      setLocating(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setPlacesLoading(true);
      setPlacesError("");
      const rows = await fetchNearbyPlaces(region, tab);
      setPlaces(rows);
    } catch (err: any) {
      setPlaces([]);
      setPlacesError(err?.message || "Failed to fetch nearby places");
    } finally {
      setPlacesLoading(false);
    }
  }, [region, tab]);

  useEffect(() => {
    void locate();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const rows = await getFavorites();
      const ids = (Array.isArray(rows) ? rows : []).map((row) => Number(row?.poi_id)).filter((id) => Number.isInteger(id));
      setFavoritePoiIds(ids);
    })();
  }, []);

  const toggleFavorite = async () => {
    if (!detail) return;
    try {
      setBusyFavorite(true);
      const poiId = favoritePoiIds.find((id) => Number(id) > 0 && String(id) === String((detail as any).poi_id));
      if (poiId) {
        await deleteFavorite(poiId);
        setFavoritePoiIds((prev) => prev.filter((id) => id !== poiId));
      } else {
        const created = await createFavoriteFromPlace({
          google_place_id: detail.placeId,
          name: detail.name,
          type: detail.type,
          address: detail.address,
          lat: detail.lat,
          lng: detail.lng,
        });
        const nextPoiId = Number(created?.poi_id);
        if (Number.isInteger(nextPoiId)) {
          setFavoritePoiIds((prev) => (prev.includes(nextPoiId) ? prev : [...prev, nextPoiId]));
        }
      }
    } catch (err: any) {
      setPlacesError(err?.response?.data?.error || err?.message || "Failed to update favorite");
    } finally {
      setBusyFavorite(false);
    }
  };

  return (
    <AppScreen title="Nearby" subtitle={subtitle} scroll={false}>
      <View style={styles.tabWrap}>
        {(["all", "food", "attractions"] as const).map((key) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{key === "all" ? "All" : key === "food" ? "Food" : "Attractions"}</Text>
          </Pressable>
        ))}
      </View>

      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
      >
        {places.map((place) => (
          <Marker
            key={place.placeId}
            coordinate={{ latitude: place.lat, longitude: place.lng }}
            title={place.name}
            description={place.address}
            pinColor={place.type === "food" ? "#f97316" : "#0ea5e9"}
            onPress={() => setDetail(place)}
          />
        ))}
      </MapView>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={locate}>
          <Text style={styles.actionText}>{locating ? "Locating..." : "Locate Me"}</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={load}>
          <Text style={styles.actionText}>Refresh</Text>
        </Pressable>
      </View>

      {placesLoading ? (
        <View style={styles.overlay}><ActivityIndicator color="#16a34a" /></View>
      ) : null}

      {placesError ? <Text style={styles.errorText}>{placesError}</Text> : null}

      <Modal visible={Boolean(detail)} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{detail?.name}</Text>
            <Text style={styles.modalMeta}>{detail?.type === "food" ? "Food" : "Attraction"}</Text>
            {detail?.address ? <Text style={styles.modalAddress}>{detail.address}</Text> : null}
            <Text style={styles.modalMeta}>Rating: {detail?.rating ?? "N/A"} ({detail?.userRatingsTotal ?? 0})</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable style={styles.primaryBtn} onPress={toggleFavorite} disabled={busyFavorite}>
                <Text style={styles.primaryBtnText}>{busyFavorite ? "Saving..." : "Toggle Favorite"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => setDetail(null)}>
                <Text style={styles.secondaryBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 130 }}>
        {places.map((place) => (
          <Pressable key={place.placeId} style={styles.poiCard} onPress={() => setDetail(place)}>
            <Text style={styles.poiTitle}>{place.name}</Text>
            <Text style={styles.poiMeta}>{place.type === "food" ? "Food" : "Attraction"}</Text>
            <Text style={styles.poiAddress}>{place.address || "No address"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  tabWrap: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  tabActive: {
    backgroundColor: "#dcfce7",
  },
  tabText: {
    color: "#334155",
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#166534",
  },
  map: {
    width: "100%",
    height: 250,
    borderRadius: 16,
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(148,163,184,0.25)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  overlay: {
    position: "absolute",
    top: 160,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  errorText: {
    marginTop: 8,
    color: "#b91c1c",
  },
  list: {
    marginTop: 10,
  },
  poiCard: {
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    padding: 12,
    marginBottom: 8,
  },
  poiTitle: {
    fontWeight: "800",
    color: "#0f172a",
  },
  poiMeta: {
    marginTop: 4,
    color: "#166534",
    fontWeight: "700",
  },
  poiAddress: {
    marginTop: 6,
    color: "#475569",
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    minHeight: 220,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  modalMeta: {
    marginTop: 6,
    color: "#334155",
  },
  modalAddress: {
    marginTop: 8,
    color: "#475569",
  },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: "#1e293b",
    fontWeight: "800",
  },
});
