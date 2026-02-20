import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { login } from "../services/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const successHint = location.state?.message || "";

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    try {
      setLoading(true);
      const res = await login({
        username: username.trim(),
        password,
      });
      localStorage.setItem("smartgo_user", JSON.stringify(res));
      navigate("/trips");
    } catch (err) {
      setError(err?.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="h1" style={{ marginBottom: 4 }}>Login</div>
      <div className="muted">Sign in to continue planning your trips</div>

      <form className="glass authCard authForm" style={{ marginTop: 16 }} onSubmit={submit}>
        {successHint ? <div className="authHint">{successHint}</div> : null}
        {error ? <div className="errorText">{error}</div> : null}

        <input
          className="input"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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

        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <div className="authHint centered" style={{ marginTop: 14 }}>
        No account?
        {" "}
        <button className="textLink inlineTextLink" onClick={() => navigate("/register")}>
          Register
        </button>
      </div>
    </div>
  );
}
