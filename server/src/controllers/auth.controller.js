import bcrypt from "bcrypt";
import pool from "../config/db.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

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
