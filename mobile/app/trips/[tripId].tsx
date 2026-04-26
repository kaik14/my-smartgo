import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import AppScreen from "../../components/AppScreen";
import {
  createTripDay,
  deleteDayPoi,
  deleteTrip,
  deleteTripDay,
  generateAiTripItinerary,
  getTripDetail,
  patchDayPoiNote,
  patchTrip,
} from "../../services/api";
import { readJSON, removeKey } from "../../services/storage";

function formatDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "";
  return `${startDate} ~ ${endDate}`;
}

export default function TripDetailPage() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tripNoteDraft, setTripNoteDraft] = useState("");
  const [savingTripNote, setSavingTripNote] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      setError("");
      const data = await getTripDetail(tripId);
      setDetail(data);
      setTripNoteDraft(String(data?.trip?.note || ""));

      const progress = await readJSON<any>(`smartgo_smart_plan_progress_${tripId}`, null);
      if (progress?.status === "completed") {
        await removeKey(`smartgo_smart_plan_progress_${tripId}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const allPois = useMemo(() => {
    const points: { latitude: number; longitude: number; name: string }[] = [];
    for (const day of detail?.days || []) {
      for (const poi of day?.pois || []) {
        if (!Number.isFinite(Number(poi?.lat)) || !Number.isFinite(Number(poi?.lng))) continue;
        points.push({ latitude: Number(poi.lat), longitude: Number(poi.lng), name: String(poi.name || "POI") });
      }
    }
    return points;
  }, [detail?.days]);

  const initialRegion = useMemo(() => {
    if (!allPois.length) return { latitude: 3.139, longitude: 101.6869, latitudeDelta: 0.2, longitudeDelta: 0.15 };
    return {
      latitude: allPois[0].latitude,
      longitude: allPois[0].longitude,
      latitudeDelta: 0.2,
      longitudeDelta: 0.15,
    };
  }, [allPois]);

  const saveTripNote = async () => {
    if (!tripId) return;
    try {
      setSavingTripNote(true);
      await patchTrip(tripId, { note: tripNoteDraft });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save note");
    } finally {
      setSavingTripNote(false);
    }
  };

  const deleteThisTrip = () => {
    Alert.alert("Delete trip", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!tripId) return;
          try {
            setActionBusy(true);
            await deleteTrip(tripId);
            router.replace("/trips" as any);
          } catch (err: any) {
            setError(err?.response?.data?.error || "Delete failed");
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const addDay = async () => {
    if (!tripId) return;
    const dayNum = (detail?.days?.length || 0) + 1;
    try {
      setActionBusy(true);
      await createTripDay(tripId, dayNum);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to add day");
    } finally {
      setActionBusy(false);
    }
  };

  const regenerateAll = async () => {
    if (!tripId) return;
    try {
      setActionBusy(true);
      await generateAiTripItinerary(tripId, {});
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "AI regenerate failed");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <AppScreen title={detail?.trip?.title || "Trip Detail"} subtitle={formatDateRange(detail?.trip?.start_date, detail?.trip?.end_date)}>
      <View style={styles.topRow}>
        <Pressable style={styles.ghostBtn} onPress={() => router.back()}><Text style={styles.ghostBtnText}>Back</Text></Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => router.push((`/chat/${tripId}` as any))}><Text style={styles.ghostBtnText}>AI Chat</Text></Pressable>
      </View>

      {loading ? <Text style={styles.muted}>Loading...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={initialRegion}>
        {allPois.map((poi, idx) => (
          <Marker key={`${poi.name}-${idx}`} coordinate={{ latitude: poi.latitude, longitude: poi.longitude }} title={poi.name} />
        ))}
        {allPois.length > 1 ? (
          <Polyline coordinates={allPois.map((item) => ({ latitude: item.latitude, longitude: item.longitude }))} strokeColor="#16a34a" strokeWidth={3} />
        ) : null}
      </MapView>

      <View style={styles.card}>
        <Text style={styles.section}>Trip Note</Text>
        <TextInput
          style={styles.noteInput}
          multiline
          value={tripNoteDraft}
          onChangeText={setTripNoteDraft}
          placeholder="Write trip note..."
        />
        <Pressable style={styles.primaryBtn} onPress={saveTripNote} disabled={savingTripNote || actionBusy}>
          <Text style={styles.primaryBtnText}>{savingTripNote ? "Saving..." : "Save Note"}</Text>
        </Pressable>
      </View>

      <View style={styles.actionsGrid}>
        <Pressable style={styles.secondaryBtn} onPress={addDay} disabled={actionBusy}><Text style={styles.secondaryBtnText}>Add Day</Text></Pressable>
        <Pressable style={styles.secondaryBtn} onPress={regenerateAll} disabled={actionBusy}><Text style={styles.secondaryBtnText}>Regenerate AI</Text></Pressable>
        <Pressable style={styles.dangerBtn} onPress={deleteThisTrip} disabled={actionBusy}><Text style={styles.dangerBtnText}>Delete Trip</Text></Pressable>
      </View>

      <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {(detail?.days || []).map((day: any) => (
          <View key={String(day.day_id)} style={styles.card}>
            <View style={styles.dayHeader}>
              <Text style={styles.section}>Day {day.day_number}</Text>
              <Pressable
                onPress={async () => {
                  try {
                    setActionBusy(true);
                    await deleteTripDay(day.day_id);
                    await load();
                  } catch (err: any) {
                    setError(err?.response?.data?.error || "Failed to delete day");
                  } finally {
                    setActionBusy(false);
                  }
                }}
              >
                <Text style={styles.deleteText}>Delete day</Text>
              </Pressable>
            </View>

            {(day.pois || []).length === 0 ? <Text style={styles.muted}>No POIs yet.</Text> : null}
            {(day.pois || []).map((poi: any) => (
              <View key={String(poi.day_poi_id)} style={styles.poiCard}>
                <Text style={styles.poiTitle}>{poi.name}</Text>
                {poi.address ? <Text style={styles.poiAddress}>{poi.address}</Text> : null}
                <TextInput
                  placeholder="POI note"
                  style={styles.poiInput}
                  defaultValue={String(poi.note || "")}
                  onSubmitEditing={async (e) => {
                    try {
                      await patchDayPoiNote(poi.day_poi_id, e.nativeEvent.text || "");
                    } catch {}
                  }}
                />
                <Pressable
                  onPress={async () => {
                    try {
                      setActionBusy(true);
                      await deleteDayPoi(poi.day_poi_id);
                      await load();
                    } catch (err: any) {
                      setError(err?.response?.data?.error || "Failed to delete POI");
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                >
                  <Text style={styles.deleteText}>Delete POI</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.3)",
    backgroundColor: "#fff",
  },
  ghostBtnText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  map: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
    backgroundColor: "#fff",
    padding: 12,
    marginBottom: 10,
  },
  section: {
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  primaryBtn: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  actionsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: "#1e293b",
    fontWeight: "800",
    fontSize: 12,
  },
  dangerBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  poiCard: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.2)",
    paddingTop: 8,
  },
  poiTitle: {
    fontWeight: "700",
    color: "#0f172a",
  },
  poiAddress: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
  },
  poiInput: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteText: {
    marginTop: 8,
    color: "#dc2626",
    fontWeight: "700",
  },
  muted: {
    color: "#64748b",
  },
  error: {
    color: "#b91c1c",
    marginBottom: 8,
  },
});
