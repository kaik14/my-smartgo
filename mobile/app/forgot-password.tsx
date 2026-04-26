import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AppScreen from "../components/AppScreen";
import { forgotPassword } from "../services/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async () => {
    setError("");
    setSuccess("");
    const emailValue = email.trim();
    if (!emailValue || !EMAIL_REGEX.test(emailValue)) {
      setError("Please enter a valid email");
      return;
    }

    try {
      setLoading(true);
      const res = await forgotPassword({ email: emailValue });
      setSuccess(res?.message || "If this email is registered, a password reset link has been sent.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen title="Forgot Password" subtitle="Enter your email and we will send you a reset link">
      <View style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <TextInput value={email} onChangeText={setEmail} placeholder="Email" style={styles.input} autoCapitalize="none" keyboardType="email-address" />

        <Pressable onPress={submit} disabled={loading} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Sending..." : "Send Reset Link"}</Text>
        </Pressable>
      </View>
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
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
  },
  success: {
    color: "#0f766e",
    fontSize: 13,
  },
});
