import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type Trip = {
  trip_id: number | string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  cover_image_url?: string | null;
};

export default function TripCard({ trip, onPress }: { trip: Trip; onPress?: () => void }) {
  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const nights = Math.max(0, days - 1);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.meta}>
        <Text style={styles.title}>{trip.title}</Text>
        <Text style={styles.line}>{days} Days {nights} Night{nights > 1 ? "s" : ""}</Text>
        <Text style={styles.line}>{trip.destination}</Text>
      </View>
      <Image
        source={{
          uri:
            trip.cover_image_url ||
            "https://images.unsplash.com/photo-1526481280695-3c687fd5432c?auto=format&fit=crop&w=800&q=60",
        }}
        style={styles.image}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    marginBottom: 12,
  },
  meta: {
    marginBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  line: {
    color: "#475569",
    fontSize: 13,
  },
  image: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
  },
});
