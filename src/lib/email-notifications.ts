type NoteReminderEmailInput = {
  toEmail: string;
  noteTitle: string;
  noteId: string;
  reminderAt: string;
};

export type EmailSendResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

function unwrapQuoted(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return "";
  return unwrapQuoted(raw);
}

function shouldSendReminderEmail() {
  const raw = getEnv("NOTE_REMINDER_EMAIL_ENABLED").toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "disabled", "no"].includes(raw);
}

function getReminderResendApiKey() {
  return (
    getEnv("NOTE_REMINDER_RESEND_API_KEY") ||
    getEnv("RESEND_API_KEY") ||
    getEnv("OTP_RESEND_API_KEY") ||
    getEnv("OTP_EMAIL_PROVIDER_KEY")
  );
}

function getReminderFromAddress() {
  return getEnv("NOTE_REMINDER_EMAIL_FROM") || getEnv("OTP_EMAIL_FROM") || "Vault <no-reply@password-vault.local>";
}

function getAppName() {
  return getEnv("OTP_APP_NAME") || "Vault";
}

function getAppBaseUrl() {
  return (
    getEnv("NEXT_PUBLIC_APP_URL") ||
    getEnv("APP_URL") ||
    getEnv("CAPACITOR_SERVER_URL")
  );
}

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatReminderTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("th-TH") + " / " + date.toLocaleString("en-US");
}

export async function sendNoteReminderEmail(input: NoteReminderEmailInput): Promise<EmailSendResult> {
  if (!shouldSendReminderEmail()) {
    return { ok: false, skipped: true, error: "Reminder email disabled" };
  }

  const apiKey = getReminderResendApiKey();
  if (!apiKey) {
    return { ok: false, skipped: true, error: "Reminder email API key is missing" };
  }

  const appName = getAppName();
  const from = getReminderFromAddress();
  const reminderTime = formatReminderTime(input.reminderAt);
  const noteTitle = sanitizeText(input.noteTitle) || "Untitled note";
  const notesUrlBase = getAppBaseUrl();
  const notesUrl = notesUrlBase ? notesUrlBase.replace(/\/+$/, "") + "/notes" : "";
  const subject = `${appName}: Note reminder / แจ้งเตือนโน้ต`;
  const text = [
    `${appName}`,
    "",
    "Reminder time / เวลาแจ้งเตือน:",
    reminderTime,
    "",
    "Note title / หัวข้อโน้ต:",
    noteTitle,
    "",
    notesUrl ? `Open notes: ${notesUrl}` : "",
    `Note ID: ${input.noteId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = [
    '<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">',
    `<h2 style="margin:0 0 12px">${appName}</h2>`,
    '<p style="margin:0 0 10px">แจ้งเตือนตามเวลาที่ตั้งไว้แล้ว / Scheduled reminder is due.</p>',
    `<p style="margin:0 0 8px"><strong>เวลาแจ้งเตือน / Reminder time:</strong> ${reminderTime}</p>`,
    `<p style="margin:0 0 8px"><strong>หัวข้อโน้ต / Note title:</strong> ${noteTitle}</p>`,
    notesUrl
      ? `<p style="margin:14px 0 0"><a href="${notesUrl}" style="color:#2563eb;text-decoration:none">เปิดหน้าโน้ต / Open notes</a></p>`
      : "",
    `<p style="margin:10px 0 0;color:#64748b;font-size:12px">Note ID: ${input.noteId}</p>`,
    "</div>",
  ]
    .filter(Boolean)
    .join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.toEmail],
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")) || `Resend API error: ${res.status}`;
    return { ok: false, error: body };
  }

  return { ok: true };
}
