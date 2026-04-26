import { useEffect, useState } from "react";
import { forgotPassword } from "../services/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "SmartGo | Forgot Password";
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
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
    } catch (err) {
      setError(err?.response?.data?.error || "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="h1" style={{ marginBottom: 4 }}>Forgot Password</div>
      <div className="muted">Enter your email and we will send you a reset link</div>

      <form className="glass authCard authForm" style={{ marginTop: 16 }} onSubmit={submit}>
        {error ? <div className="errorText">{error}</div> : null}
        {success ? <div className="successText">{success}</div> : null}

        <input
          className="input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <button className="primaryBtn" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
    </div>
  );
}
