import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import AppScreen from "../components/AppScreen";
import malaysiaLocations from "../data/malaysiaLocations";
import { createTrip, generateAiTripItinerary } from "../services/api";
import { writeJSON } from "../services/storage";

const PREFS = [
  { key: "classic", label: "Classic Must-Dos", emoji: "⭐" },
  { key: "food", label: "Food & Drink", emoji: "🍜" },
  { key: "niche", label: "Niche Exploration", emoji: "🧭" },
  { key: "photo", label: "Photogenic Shots", emoji: "📸" },
  { key: "shop", label: "Shopping", emoji: "🛍️" },
  { key: "walk", label: "City Walk", emoji: "🚶" },
  { key: "nature", label: "Nature Scenery", emoji: "🌿" },
  { key: "art", label: "Art & Exhibitions", emoji: "🎨" },
  { key: "history", label: "Historical Buildings", emoji: "🏛️" },
];

function ymdFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CreateTripPage() {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(ymdFromDate(new Date()));
  const [endDate, setEndDate] = useState(ymdFromDate(new Date(Date.now() + 86400000)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [specialRequest, setSpecialRequest] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  const destinationOptions = useMemo(() => {
    const featured = malaysiaLocations.featured.map((name) => ({ label: name, featured: true }));
    const cityOptions = malaysiaLocations.states.flatMap(({ state, cities }) =>
      cities.map((city) => ({ label: city === state ? city : `${city}, ${state}`, featured: false }))
    );

    const seen = new Set<string>();
    return [...featured, ...cityOptions].filter((item) => {
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const suggestions = useMemo(() => {
    const q = destination.trim().toLowerCase();
    const filtered = destinationOptions.filter((item) => (q ? item.label.toLowerCase().includes(q) : item.featured));
    return filtered.slice(0, 8);
  }, [destination, destinationOptions]);

  const title = useMemo(() => {
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    const days = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000) + 1);
    return `${destination || "Malaysia"} ${days}-Day Tour`;
  }, [destination, startDate, endDate]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const submit = async (mode: "smart" | "self") => {
    try {
      setLoading(true);
      setSubmitError("");
      const selectedPreferenceLabels = Array.from(selected)
        .map((key) => PREFS.find((pref) => pref.key === key)?.label)
        .filter(Boolean);

      const created = await createTrip({
        title: mode === "smart" ? `${title} (Smart)` : `${title} (Self)`,
        destination: destination.trim() || "Untitled Destination",
        start_date: startDate,
        end_date: endDate,
        preferences: selectedPreferenceLabels,
        note: specialRequest.trim() ? specialRequest.trim() : undefined,
      });

      const tripId = created?.trip_id;
      if (mode === "smart") {
        if (String(tripId).startsWith("guest-")) {
          setSubmitError("Smart Plan requires login because AI generation runs on the server.");
          router.push("/trips" as any);
          return;
        }

        await writeJSON(`smartgo_smart_plan_progress_${tripId}`, {
          tripId: String(tripId),
          status: "generating",
          message: "Smart plan is generating...",
          updatedAt: new Date().toISOString(),
        });

        router.push((`/trips/${tripId}` as any));

        void generateAiTripItinerary(tripId, {
          preferences: selectedPreferenceLabels.length ? selectedPreferenceLabels : undefined,
          user_request: specialRequest.trim() ? specialRequest.trim() : undefined,
        })
          .then(async () => {
            await writeJSON(`smartgo_smart_plan_progress_${tripId}`, {
              tripId: String(tripId),
              status: "completed",
              message: "Smart plan generated.",
              updatedAt: new Date().toISOString(),
            });
          })
          .catch(async (err: any) => {
            await writeJSON(`smartgo_smart_plan_progress_${tripId}`, {
              tripId: String(tripId),
              status: "error",
              message: err?.response?.data?.error || err?.message || "AI generation failed",
              updatedAt: new Date().toISOString(),
            });
          });
        return;
      }

      router.push("/trips" as any);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.error || "Failed to create trip");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen title="Where do you want to go?">
      <Text style={styles.label}>Destination</Text>
      <TextInput placeholder="Kuala Lumpur" style={styles.input} value={destination} onChangeText={setDestination} />

      {destination.length > 0 ? (
        <View style={styles.suggestionBox}>
          {suggestions.map((item) => (
            <Pressable key={item.label} onPress={() => setDestination(item.label)} style={styles.suggestionItem}>
              <Text style={styles.suggestionText}>{item.label}{item.featured ? "  Popular" : ""}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>How long do you want to go?</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
      <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />

      <Text style={styles.label}>Travel Preferences</Text>
      <View style={styles.chipsWrap}>
        {PREFS.map((pref) => (
          <Pressable key={pref.key} onPress={() => toggle(pref.key)} style={[styles.chip, selected.has(pref.key) && styles.chipActive]}>
            <Text style={[styles.chipText, selected.has(pref.key) && styles.chipTextActive]}>{pref.label} {pref.emoji}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Special Requests (Optional)</Text>
      <TextInput
        style={[styles.input, { height: 98, textAlignVertical: "top" }]}
        multiline
        value={specialRequest}
        onChangeText={setSpecialRequest}
        placeholder="Example: Keep total budget under RM 2,000..."
      />

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

      <View style={{ gap: 10, marginTop: 10 }}>
        <Pressable onPress={() => submit("smart")} disabled={loading} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Loading..." : "Smart Plan"}</Text>
        </Pressable>
        <Pressable onPress={() => submit("self")} disabled={loading} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Self Plan</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#0f172a",
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 8,
  },
  suggestionBox: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.12)",
  },
  suggestionText: {
    color: "#334155",
    fontSize: 13,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
    backgroundColor: "#ffffff",
  },
  chipActive: {
    borderColor: "#16a34a",
    backgroundColor: "#dcfce7",
  },
  chipText: {
    fontSize: 12,
    color: "#334155",
  },
  chipTextActive: {
    color: "#166534",
    fontWeight: "700",
  },
  primaryBtn: {
    minHeight: 46,
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
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: "#1e293b",
    fontWeight: "800",
  },
  error: {
    marginTop: 10,
    color: "#b91c1c",
    fontSize: 13,
  },
});
