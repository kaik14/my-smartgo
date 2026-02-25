import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { AiChatIcon, ArrowLeftIcon } from "../components/icons";
import {
  chatWithTripAssistant,
  generateAiTripDayItinerary,
  generateAiTripItinerary,
  getTripDetail,
  patchTrip,
} from "../services/api";

function getStorageKey(tripId) {
  return `smartgo_trip_ai_chat_${tripId}`;
}

function loadStoredMessages(tripId) {
  if (!tripId) return [];
  try {
    const raw = localStorage.getItem(getStorageKey(tripId));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        role: item?.role === "assistant" ? "assistant" : "user",
        content: String(item?.content || "").trim(),
      }))
      .filter((item) => item.content);
  } catch {
    return [];
  }
}

function saveStoredMessages(tripId, messages) {
  if (!tripId) return;
  try {
    localStorage.setItem(getStorageKey(tripId), JSON.stringify(messages.slice(-40)));
  } catch {
    // ignore localStorage quota issues
  }
}

function createMsg(role, content) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: String(content || "").trim(),
  };
}

function addDaysToYmd(ymd, daysToAdd) {
  const base = new Date(`${String(ymd || "")}T00:00:00`);
  if (Number.isNaN(base.getTime()) || !Number.isFinite(daysToAdd)) return ymd;
  base.setDate(base.getDate() + daysToAdd);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function getInclusiveDayCount(startYmd, endYmd) {
  const start = new Date(`${String(startYmd || "")}T00:00:00`);
  const end = new Date(`${String(endYmd || "")}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function parseChineseNumberToken(raw) {
  const token = String(raw || "").trim();
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  const digit = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (token === "十") return 10;
  if (token.length === 1 && digit[token]) return digit[token];
  if (token.startsWith("十")) return 10 + (digit[token.slice(1)] || 0);
  if (token.endsWith("十")) return digit[token.slice(0, -1)] ? digit[token.slice(0, -1)] * 10 : null;
  if (token.includes("十")) {
    const [tens, ones] = token.split("十");
    if (digit[tens] && digit[ones]) return digit[tens] * 10 + digit[ones];
  }
  return null;
}

function parseEnglishNumberToken(raw) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return map[token] ?? null;
}

function parseCountToken(raw, fallback = 1) {
  return parseChineseNumberToken(raw) ?? parseEnglishNumberToken(raw) ?? fallback;
}

function getLatestUserMessageText(messages) {
  const latestUser = [...messages].reverse().find((m) => m?.role === "user" && String(m?.content || "").trim());
  return String(latestUser?.content || "").trim();
}

function parseTripDateChangesFromLatestUserMessage(messages, trip) {
  const originalStart = String(trip?.start_date || "");
  const originalEnd = String(trip?.end_date || "");
  const latestText = getLatestUserMessageText(messages);
  const out = {
    latestText,
    nextStartDate: originalStart,
    nextEndDate: originalEnd,
    hasChange: false,
    warning: "",
    reasons: [],
  };
  if (!latestText || !originalStart || !originalEnd) return out;

  const currentDayCount = getInclusiveDayCount(originalStart, originalEnd);
  const countToken = "([0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|[\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341]+)";

  const startDateAbsoluteMatch =
    latestText.match(/(?:start\s*date|start)\s*(?:to|=|:)?\s*(\d{4}-\d{2}-\d{2})/i) ||
    latestText.match(/(?:\u5f00\u59cb\u65e5\u671f|\u51fa\u53d1\u65e5\u671f|\u5f00\u59cb)\s*(?:\u6539\u6210|\u6539\u4e3a|\u8c03\u6574\u5230|to|=|:)?\s*(\d{4}-\d{2}-\d{2})/);
  if (startDateAbsoluteMatch?.[1]) {
    out.nextStartDate = startDateAbsoluteMatch[1];
    out.reasons.push(`start date -> ${startDateAbsoluteMatch[1]}`);
  }

  let dayDelta = 0;
  let startShiftDays = 0;

  const addPatterns = [
    new RegExp(`(?:add|extend|increase)(?:\\s+by)?\\s+${countToken}\\s+days?`, "i"),
    new RegExp(`${countToken}\\s+more\\s+days?`, "i"),
    new RegExp(`(?:\\u591a\\u52a0|\\u589e\\u52a0|\\u52a0|\\u5ef6\\u957f|\\u591a\\u7559)\\s*${countToken}\\s*\\u5929`),
    /\u591a\u4e00\u5929/,
    /\u52a0\u4e00\u5929/,
    /\u5ef6\u957f\u4e00\u5929/,
    /\u591a\u7559\u4e00\u5929/,
  ];
  const reducePatterns = [
    new RegExp(`(?:reduce|shorten|remove)(?:\\s+by)?\\s+${countToken}\\s+days?`, "i"),
    new RegExp(`${countToken}\\s+fewer\\s+days?`, "i"),
    new RegExp(`(?:\\u51cf\\u5c11|\\u7f29\\u77ed|\\u51cf|\\u5c11)\\s*${countToken}\\s*\\u5929`),
    /\u5c11\u4e00\u5929/,
    /\u51cf\u4e00\u5929/,
    /\u7f29\u77ed\u4e00\u5929/,
  ];
  const startEarlierPatterns = [
    new RegExp(`(?:start(?:\\s+date)?)?\\s*${countToken}\\s+days?\\s+earlier`, "i"),
    new RegExp(`(?:\\u5f00\\u59cb|\\u51fa\\u53d1)?\\s*\\u63d0\\u524d\\s*${countToken}\\s*\\u5929`),
    /\u63d0\u524d\u4e00\u5929/,
  ];
  const startLaterPatterns = [
    new RegExp(`(?:start(?:\\s+date)?)?\\s*${countToken}\\s+days?\\s+later`, "i"),
    new RegExp(`(?:\\u5f00\\u59cb|\\u51fa\\u53d1)?\\s*(?:\\u5ef6\\u540e|\\u63a8\\u8fdf)\\s*${countToken}\\s*\\u5929`),
    /\u5ef6\u540e\u4e00\u5929/,
    /\u63a8\u8fdf\u4e00\u5929/,
  ];

  for (const pattern of addPatterns) {
    const match = latestText.match(pattern);
    if (!match) continue;
    const count = parseCountToken(match[1], 1);
    if (count > 0 && count <= 30) {
      dayDelta += count;
      out.reasons.push(`+${count} day${count > 1 ? "s" : ""}`);
    }
    break;
  }

  for (const pattern of reducePatterns) {
    const match = latestText.match(pattern);
    if (!match) continue;
    const count = parseCountToken(match[1], 1);
    if (count > 0 && count <= 30) {
      dayDelta -= count;
      out.reasons.push(`-${count} day${count > 1 ? "s" : ""}`);
    }
    break;
  }

  for (const pattern of startEarlierPatterns) {
    const match = latestText.match(pattern);
    if (!match) continue;
    const count = parseCountToken(match[1], 1);
    if (count > 0 && count <= 30) {
      startShiftDays -= count;
      out.reasons.push(`start earlier ${count} day${count > 1 ? "s" : ""}`);
    }
    break;
  }

  for (const pattern of startLaterPatterns) {
    const match = latestText.match(pattern);
    if (!match) continue;
    const count = parseCountToken(match[1], 1);
    if (count > 0 && count <= 30) {
      startShiftDays += count;
      out.reasons.push(`start later ${count} day${count > 1 ? "s" : ""}`);
    }
    break;
  }

  const ordinalWordToNum = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
  const explicitDayRef =
    latestText.match(/\bday[\s-]*(\d{1,2})\b/i) ||
    latestText.match(/\bday[\s-]*(one|two|three|four|five|six|seven|eight|nine|ten)\b/i) ||
    latestText.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+day\b/i) ||
    latestText.match(/\b(1st|2nd|3rd|[4-9]th|10th)\s+day\b/i) ||
    latestText.match(/\u7b2c\s*([0-9\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u5929/);
  if (explicitDayRef?.[1]) {
    const raw = explicitDayRef[1];
    const compactOrdinal = /^\d+(?:st|nd|rd|th)$/i.test(raw) ? Number(String(raw).replace(/\D/g, "")) : null;
    const ordinalWord = ordinalWordToNum[String(raw).toLowerCase()] ?? null;
    const referencedDay = compactOrdinal ?? ordinalWord ?? parseCountToken(raw, 0);
    if (referencedDay > currentDayCount) {
      const inferred = referencedDay - currentDayCount;
      if (dayDelta < inferred) {
        dayDelta = inferred;
        out.reasons.push(`inferred +${inferred} day${inferred > 1 ? "s" : ""} from day ${referencedDay}`);
      }
    }
  }

  if (startShiftDays !== 0) out.nextStartDate = addDaysToYmd(out.nextStartDate, startShiftDays);
  if (dayDelta !== 0) out.nextEndDate = addDaysToYmd(out.nextEndDate, dayDelta);

  const nextStart = new Date(`${out.nextStartDate}T00:00:00`);
  const nextEnd = new Date(`${out.nextEndDate}T00:00:00`);
  if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd < nextStart) {
    out.nextStartDate = originalStart;
    out.nextEndDate = originalEnd;
    out.warning = "Invalid date preview: end date would be earlier than start date.";
    out.reasons = [];
    return out;
  }

  out.hasChange = out.nextStartDate !== originalStart || out.nextEndDate !== originalEnd;
  return out;
}

function extractMentionedDayNumbersFromLatestUserMessage(messages) {
  const text = getLatestUserMessageText(messages);
  if (!text) return [];

  const result = new Set();
  const addIfValid = (raw) => {
    const n = parseCountToken(raw, 0);
    if (Number.isInteger(n) && n > 0 && n <= 31) result.add(n);
  };

  const englishNumericForms = text.matchAll(/\bday[\s-]*(\d{1,2})\b/gi);
  for (const match of englishNumericForms) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0 && n <= 31) result.add(n);
  }

  const englishWordAfterDay = text.matchAll(
    /\bday[\s-]*(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi
  );
  for (const match of englishWordAfterDay) {
    addIfValid(match[1]);
  }

  const englishOrdinalBeforeDay = text.matchAll(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+day\b/gi
  );
  const ordinalMap = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
  for (const match of englishOrdinalBeforeDay) {
    const key = String(match[1] || "").toLowerCase();
    if (ordinalMap[key]) result.add(ordinalMap[key]);
  }

  const compactOrdinalForms = text.matchAll(/\b(1st|2nd|3rd|[4-9]th|10th)\s+day\b/gi);
  for (const match of compactOrdinalForms) {
    const n = Number(String(match[1]).replace(/\D/g, ""));
    if (Number.isInteger(n) && n > 0 && n <= 31) result.add(n);
  }

  const chinese = text.matchAll(/\u7b2c\s*([0-9\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u5929/g);
  for (const match of chinese) {
    addIfValid(match[1]);
  }

  const chineseLoose = text.matchAll(
    /([0-9\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)\s*\u5929/g
  );
  for (const match of chineseLoose) {
    addIfValid(match[1]);
  }

  return Array.from(result).sort((a, b) => a - b);
}

function MessageBubble({ role, children }) {
  return (
    <div
      style={{
        justifySelf: role === "user" ? "end" : "start",
        maxWidth: "88%",
        borderRadius: 14,
        padding: "9px 11px",
        whiteSpace: "pre-wrap",
        lineHeight: 1.45,
        fontSize: 13,
        background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(34,197,94,0.1))",
        color: "#0f172a",
        border: role === "user" ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(124,58,237,0.18)",
        boxShadow:
          role === "user" ? "0 8px 18px rgba(34,197,94,0.08)" : "0 8px 18px rgba(124,58,237,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 4,
          color: role === "user" ? "#059669" : "#7c3aed",
          letterSpacing: 0.2,
        }}
      >
        {role === "user" ? "You" : "AI"}
      </div>
      {children}
    </div>
  );
}

export default function TripAiChatPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [typingTick, setTypingTick] = useState(0);
  const [streamingReply, setStreamingReply] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetail(null);
    setActionError("");
    setActionSuccess("");
    setMessages(loadStoredMessages(tripId));

    (async () => {
      try {
        const data = await getTripDetail(tripId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        const message = axios.isAxiosError(err) ? err.response?.data?.error || err.message : "Failed to load trip";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    saveStoredMessages(tripId, messages);
  }, [tripId, messages]);

  useEffect(() => {
    if (!sending) {
      setTypingTick(0);
      return undefined;
    }
    const timer = window.setInterval(() => setTypingTick((v) => (v + 1) % 4), 420);
    return () => window.clearInterval(timer);
  }, [sending]);

  const trip = detail?.trip || null;
  const typingLabel = useMemo(() => `AI is thinking${".".repeat(typingTick || 0)}`, [typingTick]);
  const isStreamingReply = Boolean(streamingReply);
  const busySending = sending || isStreamingReply;
  const pendingDateChange = useMemo(() => parseTripDateChangesFromLatestUserMessage(messages, trip), [messages, trip]);
  const mentionedDayNumbers = useMemo(() => extractMentionedDayNumbersFromLatestUserMessage(messages), [messages]);
  const canApply = useMemo(
    () =>
      Boolean(
        trip && messages.some((m) => m.role === "user") && !applying && !busySending && !pendingDateChange.warning
      ),
    [trip, messages, applying, busySending, pendingDateChange.warning]
  );

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || busySending) return;
    const userMsg = createMsg("user", text);
    const historyForApi = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setActionError("");
    setActionSuccess("");

    try {
      const response = await fetch(`/api/trips/${tripId}/ai-chat-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: historyForApi,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let streamedText = "";
      let streamErrored = null;

      const handleSseBlock = (block) => {
        const lines = block.split("\n");
        let data = "";
        eventName = "message";
        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) return;
        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }
        if (eventName === "chunk") {
          const chunkText = String(payload?.text || "");
          if (chunkText) {
            streamedText += chunkText;
            setStreamingReply(streamedText);
            setSending(false);
          }
        } else if (eventName === "error") {
          streamErrored = String(payload?.error || "Streaming failed");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let splitIndex = buffer.indexOf("\n\n");
        while (splitIndex !== -1) {
          const block = buffer.slice(0, splitIndex);
          buffer = buffer.slice(splitIndex + 2);
          handleSseBlock(block);
          splitIndex = buffer.indexOf("\n\n");
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleSseBlock(buffer);

      if (streamErrored) {
        throw new Error(streamErrored);
      }

      const finalReply = streamedText.trim();
      if (!finalReply) {
        throw new Error("Stream returned empty response");
      }
      setMessages((prev) => [...prev, createMsg("assistant", finalReply)]);
      setStreamingReply("");
      setSending(false);
    } catch (streamErr) {
      setStreamingReply("");
      try {
        const res = await chatWithTripAssistant(tripId, { message: text, history: historyForApi });
        const reply = String(res?.reply || "").trim() || "I can help adjust this trip. Tell me what to change.";
        setMessages((prev) => [...prev, createMsg("assistant", reply)]);
      } catch (err) {
        const message = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : streamErr instanceof Error
            ? streamErr.message
            : "Failed to send message";
        setActionError(message);
      } finally {
        setSending(false);
      }
    }
  };

  const applyAndRegenerate = async () => {
    if (!trip || applying || pendingDateChange.warning) return;
    setApplying(true);
    setActionError("");
    setActionSuccess("");
    try {
      const latestUserText = getLatestUserMessageText(messages);
      const patchPayload = {};
      if (pendingDateChange.hasChange) {
        patchPayload.start_date = pendingDateChange.nextStartDate;
        patchPayload.end_date = pendingDateChange.nextEndDate;
      }
      if (Object.keys(patchPayload).length > 0) {
        await patchTrip(trip.trip_id, patchPayload);
      }
      const validDayTargets = mentionedDayNumbers.filter(
        (n) => n >= 1 && n <= getInclusiveDayCount(
          pendingDateChange.hasChange ? pendingDateChange.nextStartDate : trip.start_date,
          pendingDateChange.hasChange ? pendingDateChange.nextEndDate : trip.end_date
        )
      );

      if (validDayTargets.length > 0) {
        for (const dayNumber of validDayTargets) {
          await generateAiTripDayItinerary(trip.trip_id, {
            day_number: dayNumber,
            user_request: latestUserText || undefined,
          });
        }
      } else {
        await generateAiTripItinerary(trip.trip_id, {
          user_request: latestUserText || undefined,
        });
      }

      const refreshed = await getTripDetail(trip.trip_id);
      setDetail(refreshed);
      setActionSuccess(
        validDayTargets.length > 0
          ? `AI instructions applied. Regenerated Day ${validDayTargets.join(", Day ")}${pendingDateChange.hasChange ? " and updated dates" : ""}.`
          : pendingDateChange.hasChange
            ? `AI instructions applied. Dates updated (${pendingDateChange.nextStartDate} -> ${pendingDateChange.nextEndDate}) and itinerary regenerated.`
            : "AI instructions applied and itinerary regenerated."
      );
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error || err.message : "Failed to apply AI changes";
      setActionError(message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="muted">Loading AI trip chat...</div>;

  if (error) {
    return (
      <div>
        <button className="secondaryBtn" type="button" onClick={() => navigate(`/trips/${tripId}`)}>
          Back
        </button>
        <div style={{ color: "#dc2626", marginTop: 12 }}>{error}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        minHeight: "calc(100vh - 84px)",
        marginTop: "calc(-1 * clamp(18px, 2.4vw, 28px))",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button className="secondaryBtn" type="button" onClick={() => navigate(`/trips/${tripId}`)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <ArrowLeftIcon size={16} />
            Back to Trip
          </span>
        </button>
        <button
          className="secondaryBtn"
          type="button"
          onClick={() => {
            setMessages([]);
            setStreamingReply("");
          }}
          disabled={busySending || applying}
        >
          Clear Chat
        </button>
      </div>

      <section
        style={{
          borderRadius: 20,
          border: "1px solid rgba(148,163,184,0.25)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
          boxShadow: "0 16px 32px rgba(15,23,42,0.07)",
          padding: "0 14px 14px",
        }}
      >
        <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 8, justifyContent: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div
              className="h1"
              style={{ fontSize: 20, marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <span>AI Trip Chat</span>
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  display: "inline-grid",
                  placeItems: "center",
                  color: "#fff",
                  background: "linear-gradient(135deg, #7c3aed, #22c55e)",
                  boxShadow: "0 8px 18px rgba(124,58,237,0.25)",
                  flexShrink: 0,
                }}
              >
                <AiChatIcon size={18} />
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {trip?.title || "Trip"} · {trip?.destination || "-"}
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.18)",
            background: "rgba(255,255,255,0.9)",
            minHeight: 360,
            maxHeight: "56vh",
            overflowY: "auto",
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          {messages.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Try asking: "Day 2 more food spots", "replace a museum with shopping", or "make the route less rushed".
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} role={m.role}>
                  {m.content}
                </MessageBubble>
              ))}
              {sending ? (
                <MessageBubble role="assistant">
                  <span>{typingLabel}</span>
                  <span style={{ marginLeft: 8, color: "#64748b", letterSpacing: 2 }}>...</span>
                </MessageBubble>
              ) : null}
              {isStreamingReply ? (
                <MessageBubble role="assistant">
                  {streamingReply}
                  <span style={{ opacity: 0.7 }}>|</span>
                </MessageBubble>
              ) : null}
            </>
          )}
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={6}
            placeholder="Tell AI what to adjust in this trip..."
            disabled={busySending || applying}
            style={{
              width: "100%",
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.28)",
              padding: 10,
              minHeight: 160,
              resize: "vertical",
              font: "inherit",
              outline: "none",
            }}
          />

          {pendingDateChange.warning ? <div style={{ color: "#b45309", fontSize: 12 }}>{pendingDateChange.warning}</div> : null}

          {trip && pendingDateChange.hasChange ? (
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(14,165,233,0.2)",
                background: "rgba(14,165,233,0.06)",
                padding: "8px 10px",
                fontSize: 12,
                lineHeight: 1.45,
                color: "#0f172a",
              }}
            >
              <div style={{ color: "#0369a1", fontWeight: 700, marginBottom: 4 }}>Date change preview</div>
              <div>Start: {trip.start_date}{" -> "}{pendingDateChange.nextStartDate}</div>
              <div>End: {trip.end_date}{" -> "}{pendingDateChange.nextEndDate}</div>
              <div>
                Days: {getInclusiveDayCount(trip.start_date, trip.end_date)}{" -> "}
                {getInclusiveDayCount(pendingDateChange.nextStartDate, pendingDateChange.nextEndDate)}
              </div>
              {pendingDateChange.reasons.length ? (
                <div className="muted" style={{ marginTop: 4 }}>
                  Parsed from latest message: {pendingDateChange.reasons.join(", ")}
                </div>
              ) : null}
              {mentionedDayNumbers.length ? (
                <div className="muted" style={{ marginTop: 4 }}>
                  Incremental apply target: Day {mentionedDayNumbers.join(", Day ")}
                </div>
              ) : null}
            </div>
          ) : null}
          {!pendingDateChange.hasChange && mentionedDayNumbers.length ? (
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(16,185,129,0.18)",
                background: "rgba(16,185,129,0.05)",
                padding: "8px 10px",
                fontSize: 12,
                color: "#065f46",
              }}
            >
              Incremental apply preview: only Day {mentionedDayNumbers.join(", Day ")} will be regenerated.
            </div>
          ) : null}

          {actionError ? <div style={{ color: "#dc2626", fontSize: 13 }}>{actionError}</div> : null}
          {actionSuccess ? <div style={{ color: "#059669", fontSize: 13 }}>{actionSuccess}</div> : null}

          <div className="row" style={{ gap: 10, justifyContent: "space-between", alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Chat replies are contextual. Regeneration uses recent chat instructions and date preview.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="secondaryBtn" type="button" onClick={sendMessage} disabled={busySending || applying || !input.trim()}>
                {sending ? "Sending..." : isStreamingReply ? "Generating..." : "Send"}
              </button>
              <button className="primaryBtn" type="button" onClick={applyAndRegenerate} disabled={!canApply || busySending}>
                {applying ? "Applying..." : "Apply & Regenerate"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
