import type { Lang, Message, TemplateId } from "./types";

/**
 * Approved message templates. The agent can only send one of these by ID with
 * slot values taken from tool results. The model never writes customer or
 * merchant text, so it cannot promise a refund or claim an unverified outcome.
 */

type Tpl = { en: string; hi?: string; ta?: string };

export const TEMPLATES: Record<TemplateId, Tpl> = {
  C_INVESTIGATING: {
    en: "I'm on it. I'm checking your transaction, the bank's response and the merchant's credit.",
    hi: "मैं देख रहा हूँ। आपका ट्रांज़ैक्शन, बैंक का जवाब और मर्चेंट का क्रेडिट जाँच रहा हूँ।",
    ta: "நான் பார்க்கிறேன். உங்கள் பரிவர்த்தனை, வங்கியின் பதில் மற்றும் வணிகரின் வரவை சரிபார்க்கிறேன்.",
  },
  C_NEED_DETAILS: {
    en: "I couldn't find a matching payment. Please share the amount and who you paid.",
    hi: "मुझे मेल खाता पेमेंट नहीं मिला। कृपया राशि और किसे पेमेंट किया, बताएँ।",
    ta: "பொருந்தும் பணம் செலுத்தல் கிடைக்கவில்லை. தொகையையும் யாருக்கு செலுத்தினீர்கள் என்பதையும் சொல்லுங்கள்.",
  },
  C_PICK_TXN: {
    en: "I found more than one payment that fits. Which one do you mean?",
    hi: "मुझे एक से ज़्यादा मिलते-जुलते पेमेंट मिले। आप किसकी बात कर रहे हैं?",
    ta: "பொருந்தும் பணம் செலுத்தல்கள் ஒன்றுக்கு மேல் உள்ளன. எதைக் குறிப்பிடுகிறீர்கள்?",
  },
  C_REVERSAL_CONFIRMED: {
    en: "Verified: your ₹{amount} payment to {merchant} failed and your bank has confirmed the reversal. Case {caseId} is closed.",
    hi: "पुष्टि हुई: {merchant} को ₹{amount} का पेमेंट विफल हुआ और आपके बैंक ने रिवर्सल की पुष्टि कर दी है। केस {caseId} बंद है।",
    ta: "உறுதி செய்யப்பட்டது: {merchant}-க்கு ₹{amount} செலுத்தல் தோல்வியடைந்தது; உங்கள் வங்கி தொகை திரும்பியதை உறுதிப்படுத்தியுள்ளது. கேஸ் {caseId} மூடப்பட்டது.",
  },
  C_CREDIT_VERIFIED: {
    en: "Verified: {merchant} has received your ₹{amount}. Case {caseId} is closed.",
    hi: "पुष्टि हुई: {merchant} को आपके ₹{amount} मिल गए हैं। केस {caseId} बंद है।",
    ta: "உறுதி செய்யப்பட்டது: {merchant} உங்கள் ₹{amount}-ஐப் பெற்றுள்ளது. கேஸ் {caseId} மூடப்பட்டது.",
  },
  C_CREDIT_PENDING: {
    en: "Your bank shows ₹{amount} as paid, but {merchant}'s credit isn't confirmed yet. I've opened case {caseId} and will keep checking. You don't need to do anything.",
    hi: "आपके बैंक में ₹{amount} का पेमेंट सफल दिख रहा है, पर {merchant} का क्रेडिट अभी कन्फ़र्म नहीं हुआ। मैंने केस {caseId} खोला है और जाँच करता रहूँगा। आपको कुछ करने की ज़रूरत नहीं।",
    ta: "உங்கள் வங்கியில் ₹{amount} செலுத்தப்பட்டதாக உள்ளது, ஆனால் {merchant}-இன் வரவு இன்னும் உறுதியாகவில்லை. கேஸ் {caseId} திறந்துள்ளேன்; தொடர்ந்து சரிபார்க்கிறேன். நீங்கள் எதுவும் செய்ய வேண்டாம்.",
  },
  C_BANK_PENDING: {
    en: "Your ₹{amount} payment to {merchant} is still pending at the bank. I've opened case {caseId} and will re-check. Please don't pay again yet.",
    hi: "{merchant} को ₹{amount} का पेमेंट बैंक में अभी पेंडिंग है। मैंने केस {caseId} खोला है और दोबारा जाँचूँगा। कृपया अभी दोबारा पेमेंट न करें।",
    ta: "{merchant}-க்கு ₹{amount} செலுத்தல் வங்கியில் இன்னும் நிலுவையில் உள்ளது. கேஸ் {caseId} திறந்துள்ளேன்; மீண்டும் சரிபார்க்கிறேன். இப்போது மீண்டும் செலுத்த வேண்டாம்.",
  },
  C_REVERSAL_PENDING: {
    en: "Your ₹{amount} payment to {merchant} failed. The bank hasn't confirmed the reversal yet, so case {caseId} stays open until it does.",
    hi: "{merchant} को ₹{amount} का पेमेंट विफल हुआ। बैंक ने अभी रिवर्सल की पुष्टि नहीं की है, इसलिए पुष्टि होने तक केस {caseId} खुला रहेगा।",
    ta: "{merchant}-க்கு ₹{amount} செலுத்தல் தோல்வியடைந்தது. வங்கி இன்னும் தொகை திரும்பியதை உறுதிப்படுத்தவில்லை; அதுவரை கேஸ் {caseId} திறந்திருக்கும்.",
  },
  C_ESCALATED: {
    en: "I couldn't verify this on my own, so I've handed case {caseId} to our {owner} team with everything I found. You won't need to explain it again.",
    hi: "मैं इसे ख़ुद सत्यापित नहीं कर सका, इसलिए केस {caseId} पूरी जानकारी के साथ हमारी {owner} टीम को सौंप दिया है। आपको दोबारा समझाना नहीं पड़ेगा।",
    ta: "இதை என்னால் தனியாக உறுதிப்படுத்த முடியவில்லை. கண்டறிந்த அனைத்துடனும் கேஸ் {caseId}-ஐ எங்கள் {owner} குழுவிடம் ஒப்படைத்துள்ளேன். நீங்கள் மீண்டும் விளக்க வேண்டியதில்லை.",
  },
  M_HOLD_GOODS: {
    en: "₹{amount} (UPI {ref}) is not credited to you yet. Don't release goods yet. We're checking.",
  },
  M_CREDIT_VERIFIED: {
    en: "₹{amount} (UPI {ref}) credit verified. Safe to release goods.",
  },
  M_PAYMENT_FAILED: {
    en: "₹{amount} (UPI {ref}) failed and went back to the customer. Ask them to pay again.",
  },
  M_UNDER_REVIEW: {
    en: "₹{amount} (UPI {ref}) is under review by Paytm {owner}. Keep goods on hold; we'll update you.",
  },
};

/** Templates that assert a verified outcome. Used by the safety invariant. */
export const SUCCESS_CLAIMS: Partial<Record<TemplateId, "CREDIT" | "REVERSAL">> = {
  C_CREDIT_VERIFIED: "CREDIT",
  M_CREDIT_VERIFIED: "CREDIT",
  C_REVERSAL_CONFIRMED: "REVERSAL",
  M_PAYMENT_FAILED: "REVERSAL",
};

export function renderTemplate(
  id: TemplateId,
  slots: Record<string, string>,
  lang: Lang = "en",
): string {
  const tpl = TEMPLATES[id];
  const text = tpl[lang] ?? tpl.en;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? "");
}

export function renderMessage(msg: Message, lang: Lang = "en"): string {
  return renderTemplate(msg.templateId, msg.slots, msg.to === "merchant" ? "en" : lang);
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-IN");
}
