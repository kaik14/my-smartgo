import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { resetPassword } from "../services/api";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "SmartGo | Reset Password";
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing. Please request a new reset link.");
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
      await resetPassword({
        token,
        newPassword: password,
      });
      navigate("/login", {
        state: { message: "Password reset successful, please login" },
      });
    } catch (err) {
      setError(err?.response?.data?.error || "Reset failed. Please request a new link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="h1" style={{ marginBottom: 4 }}>Reset Password</div>
      <div className="muted">Set a new password for your account</div>

      <form className="glass authCard authForm" style={{ marginTop: 16 }} onSubmit={submit}>
        {error ? <div className="errorText">{error}</div> : null}

        <div className="inputWrap">
          <input
            className="input withRightIcon"
            type={showPassword ? "text" : "password"}
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
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
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
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
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
