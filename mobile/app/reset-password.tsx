import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AppScreen from "../components/AppScreen";
import { resetPassword } from "../services/api";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = String(params?.token || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!token) return setError("Reset token is missing. Please request a new reset link.");
    if (!PASSWORD_REGEX.test(password)) return setError("Password must be at least 6 characters and include letters and numbers");
    if (password !== confirmPassword) return setError("Confirm password does not match");

    try {
      setLoading(true);
      await resetPassword({ token, newPassword: password });
      router.replace({ pathname: "/login", params: { message: "Password reset successful, please login" } } as any);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Reset failed. Please request a new link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen title="Reset Password" subtitle="Set a new password for your account">
      <View style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.passwordWrap}>
          <TextInput value={password} onChangeText={setPassword} placeholder="New Password" style={[styles.input, { flex: 1, marginBottom: 0 }]} secureTextEntry={!showPassword} />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#334155" />
          </Pressable>
        </View>

        <View style={styles.passwordWrap}>
          <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm New Password" style={[styles.input, { flex: 1, marginBottom: 0 }]} secureTextEntry={!showConfirmPassword} />
          <Pressable onPress={() => setShowConfirmPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#334155" />
          </Pressable>
        </View>

        <Pressable onPress={submit} disabled={loading} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Updating..." : "Update Password"}</Text>
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
    marginBottom: 10,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  eyeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
});
