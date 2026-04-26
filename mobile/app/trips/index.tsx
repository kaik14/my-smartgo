import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import AppScreen from "../../components/AppScreen";
import TripCard from "../../components/TripCard";
import { getTrips } from "../../services/api";

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTrips();
      setTrips(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <AppScreen title="My Trips" subtitle="Your itinerary list">
      <View style={styles.row}>
        <View />
        <Pressable style={styles.iconBtn} onPress={() => router.push("/profile" as any)}>
          <Ionicons name="person-outline" size={20} color="#0f172a" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#16a34a" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : trips.length === 0 ? (
        <Text style={styles.empty}>No trips yet. Tap + to create.</Text>
      ) : (
        trips.map((trip) => (
          <TripCard key={String(trip.trip_id)} trip={trip} onPress={() => router.push((`/trips/${trip.trip_id}` as any))} />
        ))
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  loadingText: {
    color: "#64748b",
  },
  empty: {
    marginTop: 14,
    color: "#64748b",
  },
});
