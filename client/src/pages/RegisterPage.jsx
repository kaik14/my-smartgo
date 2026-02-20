import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { register } from "../services/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    const usernameValue = username.trim();
    const emailValue = email.trim();

    if (!usernameValue) {
      setError("Username is required");
      return;
    }
    if (!emailValue || !EMAIL_REGEX.test(emailValue)) {
      setError("Please enter a valid email");
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError("Password must be at least 6 characters and include letters and numbers");
      return;
    }
    if (password !== confirmPassword) {
      setError("Confirm password does not match");
      return;
    }

    try {
      setLoading(true);
      await register({
        username: usernameValue,
        email: emailValue,
        password,
      });
      navigate("/login", {
        state: { message: "Register successful, please login" },
      });
    } catch (err) {
      setError(err?.response?.data?.error || "Register failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="h1" style={{ marginBottom: 4 }}>Register</div>
      <div className="muted">Create your SmartGo account</div>

      <form className="glass authCard authForm" style={{ marginTop: 16 }} onSubmit={submit}>
        {error ? <div className="errorText">{error}</div> : null}

        <input
          className="input"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="inputWrap">
          <input
            className="input withRightIcon"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="inputEyeBtn"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <div className="inputWrap">
          <input
            className="input withRightIcon"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            className="inputEyeBtn"
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            onClick={() => setShowConfirmPassword((v) => !v)}
          >
            {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "Registering..." : "Register"}
        </button>
      </form>

      <div className="authHint" style={{ marginTop: 14 }}>
        Already have an account?
        {" "}
        <button className="textLink inlineTextLink" onClick={() => navigate("/login")}>
          Login
        </button>
      </div>
    </div>
  );
}
