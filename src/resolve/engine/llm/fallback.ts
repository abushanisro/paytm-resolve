import type { Intake, Lang } from "../../types";
import type { CaseFacts, Llm, TxnBrief } from "./index";

/**
 * Keyless scripted stand-in for the model. Keeps the demo alive when the
 * Sarvam API is unreachable. Deliberately simple: regex and keyword matching.
 */

const ALIASES: Record<string, string> = {
  शर्मा: "sharma",
  किराना: "kirana",
  गुप्ता: "gupta",
  मेडिकल: "medical",
  अन्नपूर्णा: "annapurna",
  सिटी: "city",
  इलेक्ट्रॉनिक्स: "electronics",
  चाय: "chai",
  சர்மா: "sharma",
  கிரானா: "kirana",
  குப்தா: "gupta",
  மெடிக்கல்: "medical",
  அன்னபூர்ணா: "annapurna",
  சிட்டி: "city",
  எலக்ட்ரானிக்ஸ்: "electronics",
  சாய்: "chai",
};

const HINGLISH =
  /\b(paise|paisa|kat|kata|gaye|gaya|nahi|nahin|mila|hua|hui|kiya|bhai|rupaye|rupay|abhi|wapas|dukaan|dukan|ko|ka|mera|mere|lekin|par)\b/i;

export function detectLang(text: string): Lang {
  if (/[஀-௿]/.test(text)) return "ta";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (HINGLISH.test(text)) return "hi";
  return "en";
}

export function normalise(text: string): string {
  let out = text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[௦-௯]/g, (d) => String(d.charCodeAt(0) - 0x0be6));
  for (const [from, to] of Object.entries(ALIASES)) out = out.split(from).join(` ${to} `);
  return out.toLowerCase();
}

function detectIntent(t: string): Intake["intent"] {
  if (/refund|wapas|रिफंड|वापस|திரும்ப/.test(t)) return "REFUND_NOT_RECEIVED";
  if (/pending|stuck|processing|atka|पेंडिंग|अटक|நிலுவை/.test(t)) return "PAYMENT_PENDING";
  if (/fail|declin|विफल|फेल|தோல்வி/.test(t)) return "PAYMENT_FAILED";
  if (
    /debit|deduct|kat|कट|not rec|nahi mil|नहीं मिल|didn.?t (get|receive)|பிடித்த|கிடைக்கவில்லை|வரவில்லை/.test(
      t,
    )
  )
    return "DEBITED_NOT_RECEIVED";
  return "OTHER";
}

export function extractHints(text: string, candidates: TxnBrief[]) {
  const t = normalise(text);
  const numbers = (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
  const explicitRef =
    candidates.find((c) => new RegExp(`(^|\\D)${c.ref}(\\D|$)`).test(t))?.ref ?? null;
  const amount =
    numbers.find((n) => candidates.some((c) => c.amount === n)) ??
    numbers.find((n) => String(n) !== explicitRef) ??
    null;
  const merchant =
    candidates.find((c) =>
      c.merchantName
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.length >= 4 && !["store", "point"].includes(word) && t.includes(word)),
    )?.merchantName ?? null;
  return { t, explicitRef, amount, merchant };
}

export const fallbackLlm: Llm = {
  name: "scripted-fallback",
  async understand(text, candidates) {
    const { t, explicitRef, amount, merchant } = extractHints(text, candidates);
    const intent = detectIntent(t);
    let pool = candidates;
    if (amount != null) pool = pool.filter((c) => c.amount === amount);
    if (merchant) pool = pool.filter((c) => c.merchantName === merchant);
    if (amount == null && !merchant) {
      const want =
        intent === "PAYMENT_FAILED" ? "FAILED" : intent === "PAYMENT_PENDING" ? "PENDING" : null;
      pool = want ? candidates.filter((c) => c.status === want) : [];
    }
    return {
      language: detectLang(text),
      intent,
      amount,
      merchantHint: merchant,
      selectedRef: explicitRef ?? (pool.length === 1 ? (pool[0]?.ref ?? null) : null),
      gist: `Customer reports a payment problem${amount != null ? ` for ₹${amount}` : ""}${merchant ? ` to ${merchant}` : ""}.`,
    };
  },
  async summarize(f: CaseFacts) {
    const parts = [
      f.origin === "PROACTIVE"
        ? `Resolve detected this before any complaint.`
        : `Customer reported: "${f.complaint ?? "n/a"}".`,
      `₹${f.amount} to ${f.merchant} (UPI ${f.ref}).`,
      `Ledger: ${f.txnStatus ?? "not fetched"}. Bank: ${f.bankState ?? "not fetched"}${f.reversal && f.reversal !== "NONE" ? `, reversal ${f.reversal}` : ""}. Merchant credit: ${f.creditState ?? "not fetched"}.`,
      f.toolFailure ? `Tool failure: ${f.toolFailure}.` : "",
      `Re-checks used: ${f.rechecksUsed}/${f.rechecksMax}.`,
      `Escalated because: ${f.reason}. No outcome has been promised to the customer.`,
    ];
    return parts.filter(Boolean).join(" ");
  },
};
