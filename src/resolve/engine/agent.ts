import { SUCCESS_CLAIMS, formatAmount, renderTemplate } from "../templates";
import type { Case, Decision, Evidence, Intake, TemplateId } from "../types";
import { extractHints } from "./llm/fallback";
import { withLlm, type CaseFacts, type ProviderMode, type TxnBrief } from "./llm";
import { decide } from "./policy";
import { DEMO_CUSTOMER, audit, now, pause, type Store } from "./store";
import {
  ToolError,
  callTool,
  checkMerchantCredit,
  getBankResponse,
  getTransactionStatus,
} from "./tools";

/**
 * Re-check schedule on the demo clock. Mirrors NPCI's guidance for status
 * polling: wait before the first check, and make at most three.
 */
export const RECHECK_DELAYS_MS = [90_000, 5 * 60_000, 15 * 60_000];

const OPEN: Case["status"][] = ["INTAKE", "NEEDS_INFO", "INVESTIGATING", "MONITORING"];
export const isOpen = (c: Case) => OPEN.includes(c.status);

export function newCase(s: Store, origin: Case["origin"], customerId: string): Case {
  const at = now(s);
  const c: Case = {
    id: `PR-${10284 + s.caseSeq++}`,
    origin,
    status: "INTAKE",
    owner: "Resolve",
    customerId,
    complaint: null,
    complaints: [],
    language: "en",
    intake: null,
    candidates: [],
    ref: null,
    evidence: {},
    reason: null,
    recheck: { count: 0, max: RECHECK_DELAYS_MS.length, nextAt: null },
    summary: null,
    summaryBy: null,
    messages: [],
    createdAt: at,
    updatedAt: at,
    closedAt: null,
    busy: false,
  };
  s.cases.push(c);
  return c;
}

function briefsFor(s: Store, customerId: string): TxnBrief[] {
  const at = now(s);
  return [...s.world.txns.values()]
    .filter((t) => t.customerId === customerId && at - t.createdAt < 48 * 3_600_000)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => ({
      ref: t.ref,
      amount: t.amount,
      merchantName: t.merchantName,
      minutesAgo: Math.round((at - t.createdAt) / 60_000),
      status: t.status,
    }));
}

/* ---------- Notifications: approved templates only ---------- */

function notify(s: Store, c: Case, to: "customer" | "merchant", templateId: TemplateId) {
  // A customer who never complained is not messaged about a proactive case.
  if (to === "customer" && c.complaints.length === 0) return;

  // Safety invariant: a template that claims an outcome needs matching evidence.
  const claim = SUCCESS_CLAIMS[templateId];
  const supported =
    !claim ||
    (claim === "CREDIT" &&
      c.evidence.credit?.state === "MATCHED" &&
      c.evidence.bank?.state === "SUCCESS") ||
    (claim === "REVERSAL" && c.evidence.bank?.reversal === "CONFIRMED");
  if (!supported) {
    audit(s, {
      caseId: c.id,
      kind: "POLICY",
      actor: "code",
      title: `Blocked ${templateId}`,
      detail: "Template claims a verified outcome that the evidence does not support.",
    });
    return;
  }

  const txn = c.ref ? s.world.txns.get(c.ref) : undefined;
  const slots = {
    amount: txn ? formatAmount(txn.amount) : "",
    merchant: txn?.merchantName ?? "",
    ref: c.ref ?? "",
    caseId: c.id,
    owner: c.owner,
  };
  const ev = audit(s, {
    caseId: c.id,
    kind: "NOTIFY",
    actor: "code",
    title: `notify_${to}(${templateId})`,
    detail: renderTemplate(templateId, slots, "en"),
  });
  c.messages.push({ id: ev.id, to, templateId, slots, at: ev.at });
}

/* ---------- Intake: the model's job ---------- */

export function submitComplaint(
  s: Store,
  text: string,
  mode: ProviderMode = "auto",
): { caseId: string; done: Promise<void> } {
  const c = newCase(s, "COMPLAINT", DEMO_CUSTOMER);
  c.complaint = text;
  c.busy = true;
  const ev = audit(s, {
    caseId: c.id,
    kind: "INTAKE",
    actor: "customer",
    title: "Complaint received",
    detail: text,
  });
  c.complaints.push({ id: ev.id, text, at: ev.at });
  const done = intake(s, c, text, mode).catch((err) => failSafe(s, c, err));
  return { caseId: c.id, done };
}

async function intake(s: Store, c: Case, text: string, mode: ProviderMode) {
  const briefs = briefsFor(s, c.customerId);
  await pause(s);
  const res = await withLlm(mode, (llm) => llm.understand(text, briefs));
  c.intake = res.value;
  c.language = res.value.language;
  audit(s, {
    caseId: c.id,
    kind: "MODEL",
    actor: "model",
    title: `Understood complaint (${res.provider})`,
    detail:
      (res.error ? `Sarvam call failed (${res.error}); used scripted fallback. ` : "") +
      `language=${res.value.language}, intent=${res.value.intent}, amount=${res.value.amount ?? "?"}, ` +
      `merchant=${res.value.merchantHint ?? "?"}, proposed txn=${res.value.selectedRef ?? "none"}. ${res.value.gist}`,
  });

  const sel = resolveSelection(text, res.value, briefs);
  if (sel.ref !== null) return attachAndInvestigate(s, c, sel.ref, mode);

  c.candidates = sel.pick;
  c.status = "NEEDS_INFO";
  c.busy = false;
  audit(s, {
    caseId: c.id,
    kind: "POLICY",
    actor: "code",
    title: sel.why,
    detail: `Asking the customer to choose between: ${sel.pick.join(", ")}`,
  });
  notify(s, c, "customer", sel.template);
  touch(s, c);
}

/**
 * The model proposes a transaction; code confirms it. An explicit reference in
 * the text wins. A proposal is rejected if it is not in the list, and is sent
 * back to the customer if another payment of the same amount to the same
 * merchant exists.
 */
export function resolveSelection(
  text: string,
  intakeOut: Intake,
  briefs: TxnBrief[],
):
  | { ref: string }
  | { ref: null; pick: string[]; template: "C_PICK_TXN" | "C_NEED_DETAILS"; why: string } {
  const hints = extractHints(text, briefs);
  if (hints.explicitRef) return { ref: hints.explicitRef };

  const proposed = briefs.find((b) => b.ref === intakeOut.selectedRef);
  if (proposed) {
    const twins = briefs.filter(
      (b) => b.amount === proposed.amount && b.merchantName === proposed.merchantName,
    );
    if (twins.length === 1) return { ref: proposed.ref };
    return {
      ref: null,
      pick: twins.map((b) => b.ref),
      template: "C_PICK_TXN",
      why: "Ambiguity guard: more than one payment of this amount to this merchant",
    };
  }

  const amount = intakeOut.amount ?? hints.amount;
  const merchant = (intakeOut.merchantHint ?? hints.merchant)?.toLowerCase() ?? null;
  let pool = briefs;
  if (amount != null && briefs.some((b) => b.amount === amount))
    pool = pool.filter((b) => b.amount === amount);
  if (merchant) {
    const byMerchant = pool.filter(
      (b) =>
        b.merchantName.toLowerCase().includes(merchant) ||
        merchant.includes(b.merchantName.toLowerCase()),
    );
    if (byMerchant.length) pool = byMerchant;
  }
  const narrowed = pool.length < briefs.length;
  const only = pool[0];
  if (narrowed && pool.length === 1 && only) return { ref: only.ref };
  if (narrowed && pool.length > 1) {
    return {
      ref: null,
      pick: pool.slice(0, 4).map((b) => b.ref),
      template: "C_PICK_TXN",
      why: "More than one payment fits the complaint",
    };
  }
  return {
    ref: null,
    pick: briefs.slice(0, 5).map((b) => b.ref),
    template: "C_NEED_DETAILS",
    why: "No payment matched the complaint",
  };
}

export function chooseTxn(
  s: Store,
  caseId: string,
  ref: string,
  mode: ProviderMode = "auto",
): Promise<void> {
  const c = s.cases.find((x) => x.id === caseId);
  if (!c || c.status !== "NEEDS_INFO" || !c.candidates.includes(ref)) return Promise.resolve();
  c.busy = true;
  const ev = audit(s, {
    caseId,
    kind: "INTAKE",
    actor: "customer",
    title: "Customer chose a payment",
    detail: `UPI ${ref}`,
  });
  const txn = s.world.txns.get(ref);
  c.complaints.push({
    id: ev.id,
    text: txn ? `₹${formatAmount(txn.amount)} to ${txn.merchantName} · UPI ${ref}` : ref,
    at: ev.at,
  });
  return attachAndInvestigate(s, c, ref, mode).catch((err) => failSafe(s, c, err));
}

async function attachAndInvestigate(s: Store, c: Case, ref: string, mode: ProviderMode) {
  // One payment, one case: a complaint about a payment Resolve already owns joins that case.
  const existing = s.cases.find((x) => x !== c && x.ref === ref && isOpen(x));
  if (existing) {
    existing.complaints.push(...c.complaints);
    existing.complaint ??= c.complaint;
    existing.language = c.language;
    existing.intake ??= c.intake;
    s.cases.splice(s.cases.indexOf(c), 1);
    for (const ev of s.audit) if (ev.caseId === c.id) ev.caseId = existing.id;
    audit(s, {
      caseId: existing.id,
      kind: "STATE",
      actor: "code",
      title: "Complaint linked to existing case",
      detail: `Resolve already owns UPI ${ref} (${existing.origin === "PROACTIVE" ? "detected proactively" : "earlier complaint"}).`,
    });
    const last = [...existing.messages].reverse().find((m) => m.to === "customer");
    notify(s, existing, "customer", last?.templateId ?? customerTemplateFor(existing));
    touch(s, existing);
    return;
  }
  c.ref = ref;
  c.candidates = [];
  await investigate(s, c, mode, false);
}

function customerTemplateFor(c: Case): TemplateId {
  return decide(c.evidence, c.recheck.max - c.recheck.count).customerTemplate;
}

/* ---------- Investigate, decide, act ---------- */

export async function investigate(s: Store, c: Case, mode: ProviderMode, isRecheck: boolean) {
  if (!c.ref) return;
  c.busy = true;
  if (!isRecheck) {
    c.status = "INVESTIGATING";
    notify(s, c, "customer", "C_INVESTIGATING");
  }
  const ref = c.ref;
  const ev: Evidence = {};
  c.evidence = ev;
  try {
    ev.txn = await callTool(
      s,
      c.id,
      "get_transaction_status",
      ref,
      getTransactionStatus,
      (t) => `ledger status ${t.status}, ₹${t.amount} to ${t.merchantName}`,
    );
    ev.bank = await callTool(
      s,
      c.id,
      "get_bank_response",
      ref,
      getBankResponse,
      (b) => `bank ${b.state}, reversal ${b.reversal}${b.note ? ` (${b.note})` : ""}`,
    );
    ev.credit = await callTool(
      s,
      c.id,
      "check_merchant_credit",
      ref,
      checkMerchantCredit,
      (cr) => `merchant credit ${cr.state}`,
    );
  } catch (err) {
    if (!(err instanceof ToolError)) throw err;
    ev.toolFailure = err.message;
  }

  await pause(s);
  const decision = decide(ev, c.recheck.max - c.recheck.count);
  audit(s, {
    caseId: c.id,
    kind: "POLICY",
    actor: "code",
    title: `decide() → ${decision.action}`,
    detail: `${decision.reason}. Facts: ledger=${ev.txn?.status ?? "?"}, bank=${ev.bank?.state ?? "?"}, reversal=${ev.bank?.reversal ?? "?"}, credit=${ev.credit?.state ?? "?"}, re-checks left=${c.recheck.max - c.recheck.count}.`,
  });
  await apply(s, c, decision, mode);
  c.busy = false;
  touch(s, c);
}

async function apply(s: Store, c: Case, d: Decision, mode: ProviderMode) {
  const reasonChanged = c.reason !== d.reason;
  c.reason = d.reason;
  c.owner = d.owner;

  if (d.action === "CLOSE_VERIFIED") {
    c.status = "CLOSED_VERIFIED";
    c.closedAt = now(s);
    c.recheck.nextAt = null;
    audit(s, {
      caseId: c.id,
      kind: "STATE",
      actor: "code",
      title: "Case closed with evidence",
      detail: d.reason,
    });
    notify(s, c, "customer", d.customerTemplate);
    notify(s, c, "merchant", d.merchantTemplate);
    return;
  }

  if (d.action === "MONITOR") {
    c.status = "MONITORING";
    const delay = RECHECK_DELAYS_MS[c.recheck.count] ?? 15 * 60_000;
    c.recheck.nextAt = now(s) + delay;
    audit(s, {
      caseId: c.id,
      kind: "STATE",
      actor: "code",
      title: "Case stays open, re-check scheduled",
      detail: `Re-check ${c.recheck.count + 1} of ${c.recheck.max} in ${Math.round(delay / 1000)}s. Resolve remains the owner.`,
    });
    if (reasonChanged) {
      notify(s, c, "customer", d.customerTemplate);
      notify(s, c, "merchant", d.merchantTemplate);
    }
    return;
  }

  c.status = "ESCALATED";
  c.recheck.nextAt = null;
  const txn = c.ref ? s.world.txns.get(c.ref) : undefined;
  const facts: CaseFacts = {
    origin: c.origin,
    complaint: c.complaint,
    ref: c.ref ?? "",
    amount: txn?.amount ?? 0,
    merchant: txn?.merchantName ?? "",
    ...(c.evidence.txn && { txnStatus: c.evidence.txn.status }),
    ...(c.evidence.bank && {
      bankState: c.evidence.bank.state,
      reversal: c.evidence.bank.reversal,
    }),
    ...(c.evidence.credit && { creditState: c.evidence.credit.state }),
    ...(c.evidence.toolFailure && { toolFailure: c.evidence.toolFailure }),
    rechecksUsed: c.recheck.count,
    rechecksMax: c.recheck.max,
    reason: d.reason,
    owner: d.owner,
  };
  const res = await withLlm(mode, (llm) => llm.summarize(facts));
  c.summary = res.value;
  c.summaryBy = res.provider;
  audit(s, {
    caseId: c.id,
    kind: "MODEL",
    actor: "model",
    title: `Wrote handoff summary (${res.provider})`,
    detail:
      (res.error ? `Sarvam call failed (${res.error}); used scripted fallback. ` : "") + res.value,
  });
  audit(s, {
    caseId: c.id,
    kind: "STATE",
    actor: "code",
    title: `Escalated to ${d.owner}`,
    detail: d.reason,
  });
  notify(s, c, "customer", d.customerTemplate);
  notify(s, c, "merchant", d.merchantTemplate);
}

function touch(s: Store, c: Case) {
  c.updatedAt = now(s);
}

/** Anything unexpected ends in a human handoff, never a guess. */
function failSafe(s: Store, c: Case, err: unknown) {
  c.busy = false;
  c.status = "ESCALATED";
  c.owner = "Payments Ops";
  c.reason = "TOOL_UNAVAILABLE";
  c.recheck.nextAt = null;
  audit(s, {
    caseId: c.id,
    kind: "STATE",
    actor: "code",
    title: "Unexpected error, escalated to Payments Ops",
    detail: err instanceof Error ? err.message : String(err),
  });
  notify(s, c, "customer", "C_ESCALATED");
  touch(s, c);
}
