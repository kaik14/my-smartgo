import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AppScreen from "../../components/AppScreen";
import {
  chatWithTripAssistant,
  generateAiTripDayItinerary,
  getTripDetail,
  patchTrip,
} from "../../services/api";
import { readJSON, writeJSON } from "../../services/storage";

type Msg = { id: string; role: "user" | "assistant"; content: string };

function getStorageKey(tripId: string) {
  return `smartgo_trip_ai_chat_${tripId}`;
}

function createMsg(role: Msg["role"], content: string): Msg {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content: String(content || "").trim(),
  };
}

function parseDayMentions(text: string) {
  const result = new Set<number>();
  for (const m of text.matchAll(/\bday\s*(\d{1,2})\b/gi)) {
    const n = Number(m[1]);
    if (n > 0 && n <= 31) result.add(n);
  }
  for (const m of text.matchAll(/第\s*([0-9一二两三四五六七八九十]+)\s*天/g)) {
    const raw = String(m[1]);
    const n = /^\d+$/.test(raw)
      ? Number(raw)
      : ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as any)[raw] || 0;
    if (n > 0 && n <= 31) result.add(n);
  }
  return Array.from(result).sort((a, b) => a - b);
}

function parseTripDateAdjust(text: string, startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  let delta = 0;
  const add = text.match(/(?:add|extend|增加|多加|延长)\s*([0-9]+)\s*(?:days?|天)/i);
  const minus = text.match(/(?:reduce|shorten|减少|缩短)\s*([0-9]+)\s*(?:days?|天)/i);
  if (add?.[1]) delta += Number(add[1]);
  if (minus?.[1]) delta -= Number(minus[1]);
  if (!delta) return null;

  end.setDate(end.getDate() + delta);
  if (end < start) return null;
  const nextEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { start_date: startDate, end_date: nextEnd };
}

export default function TripAiChatPage() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      setError("");
      const data = await getTripDetail(tripId);
      setDetail(data);
      const stored = await readJSON<Msg[]>(getStorageKey(tripId), []);
      setMessages(Array.isArray(stored) ? stored : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const canSend = useMemo(() => Boolean(input.trim()) && !sending, [input, sending]);

  const send = async () => {
    if (!tripId || !canSend || !detail?.trip) return;
    const text = input.trim();
    const userMsg = createMsg("user", text);
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    try {
      setSending(true);
      const res = await chatWithTripAssistant(tripId, {
        message: text,
        context: {
          trip: detail.trip,
          days: detail.days,
        },
      });

      const reply = String(res?.reply || res?.message || "I have updated your trip plan.");
      const assistantMsg = createMsg("assistant", reply);
      const saved = [...nextMessages, assistantMsg].slice(-40);
      setMessages(saved);
      await writeJSON(getStorageKey(tripId), saved);

      const dayMentions = parseDayMentions(text);
      if (dayMentions.length) {
        for (const day of dayMentions) {
          await generateAiTripDayItinerary(tripId, { day_number: day, user_request: text });
        }
      }

      const nextDate = parseTripDateAdjust(text, detail.trip.start_date, detail.trip.end_date);
      if (nextDate) {
        await patchTrip(tripId, nextDate);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "AI chat failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppScreen title="Trip AI Chat" subtitle={detail?.trip?.title || "Chat with your itinerary assistant"}>
      <View style={styles.topRow}>
        <Pressable style={styles.ghostBtn} onPress={() => router.back()}><Text style={styles.ghostBtnText}>Back</Text></Pressable>
      </View>

      {loading ? <Text style={styles.muted}>Loading...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.chatArea} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {messages.length === 0 ? <Text style={styles.muted}>Ask AI to refine your route, days, or POI picks.</Text> : null}
          {messages.map((msg) => (
            <View key={msg.id} style={[styles.bubble, msg.role === "user" ? styles.userBubble : styles.aiBubble]}>
              <Text style={[styles.role, msg.role === "user" ? styles.userRole : styles.aiRole]}>{msg.role === "user" ? "You" : "AI"}</Text>
              <Text style={styles.bubbleText}>{msg.content}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask AI to improve this trip..."
            style={styles.input}
            multiline
          />
          <Pressable onPress={send} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
            <Text style={styles.sendText}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
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
  chatArea: {
    maxHeight: 470,
    marginBottom: 8,
  },
  bubble: {
    borderRadius: 14,
    padding: 10,
    maxWidth: "92%",
  },
  userBubble: {
    backgroundColor: "#dcfce7",
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  aiBubble: {
    backgroundColor: "#eef2ff",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.28)",
  },
  role: {
    fontWeight: "800",
    fontSize: 11,
    marginBottom: 4,
  },
  userRole: {
    color: "#166534",
  },
  aiRole: {
    color: "#3730a3",
  },
  bubbleText: {
    color: "#0f172a",
    lineHeight: 19,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 9,
    textAlignVertical: "top",
  },
  sendBtn: {
    minWidth: 72,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16a34a",
  },
  sendBtnDisabled: {
    backgroundColor: "#94a3b8",
  },
  sendText: {
    color: "#fff",
    fontWeight: "800",
  },
  muted: {
    color: "#64748b",
  },
  error: {
    color: "#b91c1c",
    marginBottom: 8,
  },
});
