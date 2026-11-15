import { z } from "zod";
import type { CaseFacts, Llm, TxnBrief } from "./index";

/**
 * Sarvam chat-completions client (OpenAI-compatible shape).
 * Docs: https://docs.sarvam.ai/api-reference-docs/chat/chat-completions
 * Server-side only: the key is read from process.env and never sent to the browser.
 */

const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";
const STT_ENDPOINT = "https://api.sarvam.ai/speech-to-text";

let envLoaded = false;
/** Vite only exposes VITE_* vars, so server-side keys are read from .env.local directly. */
function loadEnv() {
  if (envLoaded) return;
  envLoaded = true;
  if (typeof process === "undefined" || typeof process.loadEnvFile !== "function") return;
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* file not present */
    }
  }
}

export const sarvamKey = () => {
  loadEnv();
  return process.env["SARVAM_API_KEY"]?.trim() || null;
};
const model = () => process.env["SARVAM_MODEL"]?.trim() || "sarvam-105b";

const IntakeOut = z.object({
  language: z.enum(["en", "hi", "ta"]).catch("en"),
  intent: z
    .enum([
      "DEBITED_NOT_RECEIVED",
      "PAYMENT_FAILED",
      "PAYMENT_PENDING",
      "REFUND_NOT_RECEIVED",
      "OTHER",
    ])
    .catch("OTHER"),
  amount: z.number().nullable().catch(null),
  merchantHint: z.string().nullable().catch(null),
  selectedRef: z.string().nullable().catch(null),
  gist: z.string().catch(""),
});

async function chat(
  system: string,
  user: string,
  json: boolean,
  timeoutMs = 12_000,
): Promise<string> {
  const key = sarvamKey();
  if (!key) throw new Error("SARVAM_API_KEY not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "api-subscription-key": key,
    },
    body: JSON.stringify({
      model: model(),
      temperature: 0.1,
      max_tokens: json ? 400 : 300,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Sarvam ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Sarvam returned no content");
  return content;
}

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model reply had no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const INTAKE_SYSTEM = `You are the intake step of a UPI payment-support agent in India.
The customer may write in English, Hindi, Tamil or Hinglish (Hindi in Latin script), and may be vague.
You are given the customer's recent transactions. Work out which one they mean.

Reply with ONE JSON object and nothing else:
{
  "language": "en" | "hi" | "ta",          // language to reply in; Hinglish counts as "hi"
  "intent": "DEBITED_NOT_RECEIVED" | "PAYMENT_FAILED" | "PAYMENT_PENDING" | "REFUND_NOT_RECEIVED" | "OTHER",
  "amount": number | null,                  // rupees the customer mentioned, else null
  "merchantHint": string | null,            // merchant name exactly as in the list if you can tell, else null
  "selectedRef": string | null,             // "ref" of the one transaction they mean; null if none fits or more than one fits equally
  "gist": string                            // one short English sentence restating the complaint
}

Rules:
- selectedRef must be a ref from the list. Never invent one.
- If two or more transactions fit equally well, set selectedRef to null.
- Do not judge whether the payment succeeded. You only identify the transaction.`;

const SUMMARY_SYSTEM = `You write handoff notes for a payments operations team.
Given the facts of a case, write a summary of at most 70 words in plain English:
what the customer reported, what was checked and found, what is still unknown, and the single most useful next check.
Use only the facts provided. Do not state or imply any outcome that the facts do not show.
Do not promise a refund or a timeline. No greeting, no bullet points.`;

export const sarvamLlm: Llm = {
  name: "sarvam",
  async understand(text: string, candidates: TxnBrief[]) {
    const user = `Recent transactions:\n${JSON.stringify(candidates)}\n\nCustomer message:\n${text}`;
    const out = IntakeOut.parse(parseJson(await chat(INTAKE_SYSTEM, user, true)));
    return out;
  },
  async summarize(facts: CaseFacts) {
    const text = await chat(SUMMARY_SYSTEM, JSON.stringify(facts), false);
    return text.trim().replace(/\s+/g, " ");
  },
};

/** Docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe */
export async function sarvamTranscribe(
  audio: Uint8Array,
  mime: string,
): Promise<{ text: string; language: string | null }> {
  const key = sarvamKey();
  if (!key) throw new Error("SARVAM_API_KEY not set");
  const ext = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mp4")
      ? "mp4"
      : mime.includes("wav")
        ? "wav"
        : "webm";
  const form = new FormData();
  form.append(
    "file",
    new Blob([audio as BlobPart], { type: mime.split(";")[0] ?? "audio/webm" }),
    `complaint.${ext}`,
  );
  form.append("model", process.env["SARVAM_STT_MODEL"]?.trim() || "saaras:v4");
  form.append("language_code", "unknown");
  const res = await fetch(STT_ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "api-subscription-key": key },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { transcript?: string; language_code?: string | null };
  return { text: data.transcript ?? "", language: data.language_code ?? null };
}
