import type { Intake } from "../../types";
import { fallbackLlm } from "./fallback";
import { sarvamKey, sarvamLlm } from "./sarvam";

/** What the model is shown about a transaction: customer-visible fields only. */
export type TxnBrief = {
  ref: string;
  amount: number;
  merchantName: string;
  minutesAgo: number;
  status: string;
};

export type CaseFacts = {
  origin: string;
  complaint: string | null;
  ref: string;
  amount: number;
  merchant: string;
  txnStatus?: string;
  bankState?: string;
  reversal?: string;
  creditState?: string;
  toolFailure?: string;
  rechecksUsed: number;
  rechecksMax: number;
  reason: string;
  owner: string;
};

export interface Llm {
  name: string;
  understand(text: string, candidates: TxnBrief[]): Promise<Intake>;
  summarize(facts: CaseFacts): Promise<string>;
}

export type ProviderMode = "auto" | "fallback";

export const llmStatus = () => ({
  provider: sarvamKey() ? "Sarvam (sarvam-105b)" : "Scripted fallback (no SARVAM_API_KEY)",
  live: Boolean(sarvamKey()),
});

/**
 * Tries Sarvam when a key is present, and drops to the scripted fallback on
 * any error. Returns which provider actually answered so the audit log can
 * show it.
 */
export async function withLlm<T>(
  mode: ProviderMode,
  run: (llm: Llm) => Promise<T>,
): Promise<{ value: T; provider: string; error?: string }> {
  if (mode === "auto" && sarvamKey()) {
    try {
      return { value: await run(sarvamLlm), provider: sarvamLlm.name };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { value: await run(fallbackLlm), provider: fallbackLlm.name, error };
    }
  }
  return { value: await run(fallbackLlm), provider: fallbackLlm.name };
}
