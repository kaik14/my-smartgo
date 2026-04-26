import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import AppScreen from "../components/AppScreen";
import { clearGuestTrips, getFavorites } from "../services/api";
import { getLocalUser, removeKey } from "../services/storage";

export default function ProfilePage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState("");
  const [user, setUser] = useState<any>(null);

  const load = useCallback(async () => {
    const localUser = await getLocalUser();
    setUser(localUser);
    if (!localUser?.user_id) {
      setFavorites([]);
      return;
    }

    try {
      setFavoritesLoading(true);
      setFavoritesError("");
      const rows = await getFavorites();
      setFavorites(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setFavorites([]);
      setFavoritesError(err?.message || "Failed to load favorites");
    } finally {
      setFavoritesLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const subtitle = useMemo(() => (user?.user_id ? "Your account and saved places" : "Guest mode"), [user?.user_id]);

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await removeKey("smartgo_user");
          clearGuestTrips();
          router.replace("/login" as any);
        },
      },
    ]);
  };

  return (
    <AppScreen title="Profile" subtitle={subtitle}>
      <View style={styles.card}>
        <Text style={styles.section}>User Info</Text>
        <View style={styles.row}>
          <Text style={styles.muted}>Username</Text>
          <Text style={styles.strong}>{user?.username || "Guest"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Email</Text>
          <Text style={styles.strong}>{user?.email || "Not logged in"}</Text>
        </View>
      </View>

      <Text style={[styles.section, { marginTop: 14 }]}>Favorite POIs</Text>
      {!user ? (
        <View style={styles.card}><Text style={styles.muted}>Log in to see your saved POIs.</Text></View>
      ) : favoritesLoading ? (
        <View style={styles.card}><Text style={styles.muted}>Loading favorites...</Text></View>
      ) : favoritesError ? (
        <View style={styles.card}><Text style={styles.error}>{favoritesError}</Text></View>
      ) : favorites.length === 0 ? (
        <View style={styles.card}><Text style={styles.muted}>No favorite POIs yet.</Text></View>
      ) : (
        favorites.map((poi) => (
          <View key={String(poi.poi_id)} style={styles.card}>
            <Text style={styles.strong}>{poi.name}</Text>
            <Text style={styles.muted}>{String(poi.type || "other").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
            {poi.address ? <Text style={styles.address}>{poi.address}</Text> : null}
          </View>
        ))
      )}

      {!user ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/login" as any)}><Text style={styles.primaryBtnText}>Login</Text></Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.push("/register" as any)}><Text style={styles.secondaryBtnText}>Register</Text></Pressable>
        </View>
      ) : (
        <Pressable style={styles.logoutBtn} onPress={handleLogout}><Text style={styles.logoutText}>Log out</Text></Pressable>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
    backgroundColor: "#ffffff",
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  section: {
    fontWeight: "800",
    fontSize: 16,
    color: "#0f172a",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  muted: {
    color: "#64748b",
  },
  strong: {
    color: "#0f172a",
    fontWeight: "700",
  },
  address: {
    marginTop: 6,
    color: "#475569",
    fontSize: 13,
  },
  error: {
    color: "#b91c1c",
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16a34a",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  secondaryBtnText: {
    color: "#1e293b",
    fontWeight: "800",
  },
  logoutBtn: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444",
    marginTop: 12,
  },
  logoutText: {
    color: "#fff",
    fontWeight: "800",
  },
});
