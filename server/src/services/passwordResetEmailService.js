const RESEND_API_URL = "https://api.resend.com/emails";

function getResendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  return {
    apiKey,
    from,
    enabled: Boolean(apiKey && from),
  };
}

export async function sendPasswordResetEmail({ to, username, resetLink, expiresMinutes }) {
  const resend = getResendConfig();

  if (!resend.enabled) {
    console.warn(
      `[auth] RESEND_API_KEY or RESEND_FROM_EMAIL is missing. Reset link for ${to}: ${resetLink}`
    );
    return;
  }

  const safeName = String(username || "there");
  const payload = {
    from: resend.from,
    to,
    subject: "Reset your SmartGo password",
    text: [
      `Hi ${safeName},`,
      "",
      "We received a request to reset your SmartGo password.",
      `This link expires in ${expiresMinutes} minutes:`,
      resetLink,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>Hi ${safeName},</p>`,
      "<p>We received a request to reset your SmartGo password.</p>",
      `<p>This link expires in <strong>${expiresMinutes} minutes</strong>:</p>`,
      `<p><a href=\"${resetLink}\">Reset Password</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to send reset email: ${response.status} ${errorBody}`);
  }
}
