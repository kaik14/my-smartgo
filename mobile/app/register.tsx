import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AppScreen from "../components/AppScreen";
import { register } from "../services/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const usernameValue = username.trim();
    const emailValue = email.trim();

    if (!usernameValue) return setError("Username is required");
    if (!emailValue || !EMAIL_REGEX.test(emailValue)) return setError("Please enter a valid email");
    if (!PASSWORD_REGEX.test(password)) return setError("Password must be at least 6 characters and include letters and numbers");
    if (password !== confirmPassword) return setError("Confirm password does not match");

    try {
      setLoading(true);
      await register({ username: usernameValue, email: emailValue, password });
      router.replace({ pathname: "/login", params: { message: "Register successful, please login" } } as any);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Register failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen title="Register" subtitle="Create your SmartGo account">
      <View style={styles.card}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput value={username} onChangeText={setUsername} placeholder="Username" style={styles.input} autoCapitalize="none" />
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" style={styles.input} autoCapitalize="none" keyboardType="email-address" />

        <View style={styles.passwordWrap}>
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" style={[styles.input, { flex: 1, marginBottom: 0 }]} secureTextEntry={!showPassword} />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#334155" />
          </Pressable>
        </View>

        <View style={styles.passwordWrap}>
          <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password" style={[styles.input, { flex: 1, marginBottom: 0 }]} secureTextEntry={!showConfirmPassword} />
          <Pressable onPress={() => setShowConfirmPassword((v) => !v)} style={styles.eyeBtn}>
            <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#334155" />
          </Pressable>
        </View>

        <Pressable onPress={submit} disabled={loading} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Registering..." : "Register"}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push("/login" as any)}>
        <Text style={styles.link}>Already have an account? Login</Text>
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
});
