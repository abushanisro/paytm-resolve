import { SUCCESS_CLAIMS } from "../templates";
import type { CaseStatus, Lang } from "../types";
import { submitComplaint } from "./agent";
import { EVAL_CASES, type EvalCase } from "./eval-cases";
import type { ProviderMode } from "./llm";
import { createStore } from "./store";

export type EvalResult = {
  id: string;
  tag: string;
  text: string;
  expected: { ref: string | null; status: CaseStatus; lang: Lang };
  got: { ref: string | null; status: CaseStatus; lang: Lang; provider: string };
  refOk: boolean;
  statusOk: boolean;
  langOk: boolean;
  unverifiedClaims: number;
  pass: boolean;
};

export type EvalReport = {
  mode: ProviderMode;
  total: number;
  passed: number;
  unverifiedClaims: number;
  ms: number;
  results: EvalResult[];
};

async function runOne(e: EvalCase, mode: ProviderMode): Promise<EvalResult> {
  const s = createStore(); // isolated world per case, no step delay
  const { done } = submitComplaint(s, e.text, mode);
  await done;
  const c = s.cases[0];
  const provider = s.audit.find((a) => a.kind === "MODEL")?.title.match(/\((.*)\)/)?.[1] ?? "?";

  // Invariant: no message may claim an outcome the synthetic world does not show.
  let unverifiedClaims = 0;
  for (const m of c?.messages ?? []) {
    const claim = SUCCESS_CLAIMS[m.templateId];
    const ref = c?.ref ?? "";
    if (claim === "CREDIT" && s.world.credits.get(ref)?.state !== "MATCHED") unverifiedClaims++;
    if (claim === "REVERSAL" && s.world.bank.get(ref)?.reversal !== "CONFIRMED") unverifiedClaims++;
  }

  const got = {
    ref: c?.ref ?? null,
    status: c?.status ?? ("INTAKE" as CaseStatus),
    lang: c?.language ?? ("en" as Lang),
    provider,
  };
  const refOk = got.ref === e.ref;
  const statusOk = got.status === e.status;
  const langOk = got.lang === e.lang;
  return {
    id: e.id,
    tag: e.tag,
    text: e.text,
    expected: { ref: e.ref, status: e.status, lang: e.lang },
    got,
    refOk,
    statusOk,
    langOk,
    unverifiedClaims,
    pass: refOk && statusOk && langOk && unverifiedClaims === 0,
  };
}

export async function runEvals(mode: ProviderMode, concurrency = 4): Promise<EvalReport> {
  const started = Date.now();
  const results: EvalResult[] = new Array(EVAL_CASES.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < EVAL_CASES.length) {
        const i = next++;
        const e = EVAL_CASES[i];
        if (e) results[i] = await runOne(e, mode);
      }
    }),
  );
  return {
    mode,
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    unverifiedClaims: results.reduce((n, r) => n + r.unverifiedClaims, 0),
    ms: Date.now() - started,
    results,
  };
}
