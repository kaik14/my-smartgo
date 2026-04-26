import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AppScreen from "../components/AppScreen";
import { login } from "../services/api";
import { writeJSON } from "../services/storage";

export default function LoginPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ message?: string }>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }
    try {
      setLoading(true);
      const res = await login({ username: username.trim(), password });
      await writeJSON("smartgo_user", res);
      router.replace("/trips" as any);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen title="Login" subtitle="Sign in to continue planning your trips">
      <View style={styles.card}>
        {params?.message ? <Text style={styles.success}>{params.message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput value={username} onChangeText={setUsername} placeholder="Username" style={styles.input} autoCapitalize="none" />

        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#334155" />
          </Pressable>
        </View>

        <Pressable onPress={submit} disabled={loading} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Logging in..." : "Login"}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/forgot-password" as any)}>
          <Text style={styles.link}>Forgot password? Reset now</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push("/register" as any)}>
        <Text style={styles.link}>No account? Register</Text>
      </Pressable>
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
  link: {
    color: "#166534",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
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
