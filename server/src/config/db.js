import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const useTls = ["1", "true", "yes", "on"].includes(
  String(process.env.DB_SSL || "").trim().toLowerCase()
);

const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

if (useTls) {
  // TiDB Cloud public endpoints require TLS. We start with CA-less TLS for
  // easier deployment on Render, then can add a CA env var if verification fails.
  poolConfig.ssl = {
    minVersion: "TLSv1.2",
    rejectUnauthorized:
      !["0", "false", "no", "off"].includes(
        String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true")
          .trim()
          .toLowerCase()
      ),
  };
}

const pool = mysql.createPool(poolConfig);

export default pool;
