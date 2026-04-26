import bcrypt from "bcrypt";
import crypto from "crypto";
import pool from "../config/db.js";
import { sendPasswordResetEmail } from "../services/passwordResetEmailService.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
const RESET_TOKEN_EXP_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 20);
const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "If this email is registered, a password reset link has been sent.";

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function register(req, res) {
  try {
    const username = String(req.body?.username || "").trim();
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ error: "Password must be at least 6 characters and include letters and numbers" });
    }

    const [usernameRows] = await pool.query(
      "SELECT user_id FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (usernameRows.length > 0) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const [emailRows] = await pool.query(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (emailRows.length > 0) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `
      INSERT INTO users (username, password_hash, email)
      VALUES (?, ?, ?)
      `,
      [username, passwordHash, email]
    );

    return res.status(201).json({
      message: "Register successful",
      user_id: result.insertId,
      username,
      email,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to register" });
  }
}

export async function login(req, res) {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const [rows] = await pool.query(
      "SELECT user_id, username, email, password_hash FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    return res.status(200).json({
      message: "Login successful",
      user_id: user.user_id,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to login" });
  }
}

export async function forgotPassword(req, res) {
  try {
    const email = String(req.body?.email || "").trim();

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const [rows] = await pool.query(
      "SELECT user_id, username, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(200).json({ message: FORGOT_PASSWORD_SUCCESS_MESSAGE });
    }

    const user = rows[0];
    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashResetToken(rawResetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXP_MINUTES * 60 * 1000);

    await pool.query(
      `
      UPDATE users
      SET reset_token_hash = ?,
          reset_token_expires_at = ?,
          reset_token_used_at = NULL
      WHERE user_id = ?
      `,
      [resetTokenHash, expiresAt, user.user_id]
    );

    const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173").trim();
    const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawResetToken)}`;

    await sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      resetLink,
      expiresMinutes: RESET_TOKEN_EXP_MINUTES,
    });

    return res.status(200).json({ message: FORGOT_PASSWORD_SUCCESS_MESSAGE });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to process forgot password request" });
  }
}

export async function resetPassword(req, res) {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ error: "Password must be at least 6 characters and include letters and numbers" });
    }

    const tokenHash = hashResetToken(token);
    const [rows] = await pool.query(
      `
      SELECT user_id, reset_token_expires_at, reset_token_used_at
      FROM users
      WHERE reset_token_hash = ?
      LIMIT 1
      `,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Reset token is invalid or expired" });
    }

    const tokenRow = rows[0];
    const expiresAt = tokenRow.reset_token_expires_at
      ? new Date(tokenRow.reset_token_expires_at)
      : null;

    if (tokenRow.reset_token_used_at || !expiresAt || expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Reset token is invalid or expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `
      UPDATE users
      SET password_hash = ?,
          reset_token_hash = NULL,
          reset_token_expires_at = NULL,
          reset_token_used_at = NOW()
      WHERE user_id = ?
      `,
      [passwordHash, tokenRow.user_id]
    );

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
}
