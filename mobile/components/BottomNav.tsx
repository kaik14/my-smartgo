import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function isHiddenRoute(pathname: string) {
  return pathname.startsWith("/profile") || /^\/trips\/[^/]+$/.test(pathname) || pathname.startsWith("/chat/");
}

function NavItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <Ionicons name={icon} size={20} color={active ? "#166534" : "#64748b"} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (isHiddenRoute(pathname)) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(10, insets.bottom + 4) }]}>
      <NavItem label="Itinerary" icon="briefcase-outline" active={pathname.startsWith("/trips")} onPress={() => router.push("/trips" as any)} />

      <Pressable style={styles.plusBtn} onPress={() => router.push("/create" as any)}>
        <Ionicons name="add" size={26} color="#ffffff" />
      </Pressable>

      <NavItem label="Nearby" icon="location-outline" active={pathname.startsWith("/nearby")} onPress={() => router.push("/nearby" as any)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    height: 74,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  navText: {
    fontSize: 12,
    marginTop: 4,
    color: "#64748b",
    fontWeight: "700",
  },
  navTextActive: {
    color: "#166534",
  },
  plusBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -24,
    borderWidth: 3,
    borderColor: "#ffffff",
  },
});
