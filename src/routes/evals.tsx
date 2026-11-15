import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, Play, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PaytmLogo, STATUS_LABEL } from "@/components/resolve/shared";
import { cn } from "@/lib/utils";
import { runEvalSuite } from "@/resolve/api";
import type { EvalReport } from "@/resolve/engine/evals";

export const Route = createFileRoute("/evals")({
  head: () => ({
    meta: [
      { title: "Paytm Resolve | Evals" },
      {
        name: "description",
        content:
          "Test complaints with expected decisions, run against the Resolve agent. Synthetic data only.",
      },
    ],
  }),
  component: Evals,
});

function Evals() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [running, setRunning] = useState<"auto" | "fallback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: "auto" | "fallback") => {
    setRunning(mode);
    setError(null);
    try {
      setReport(await runEvalSuite({ data: { mode } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1100px] p-4">
      <Link
        to="/"
        className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Demo stage
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2">
            <PaytmLogo className="!text-[20px]" />{" "}
            <span className="font-display text-[15px] font-bold">Resolve · Evals</span>
          </p>
          <h1 className="mt-2 font-display text-[26px] font-extrabold leading-tight">
            Does it pick the right payment and stay honest?
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            25 complaints in English, Hindi, Tamil and Hinglish, including vague, misspelt,
            duplicate and prompt-injection cases. Each runs against a fresh synthetic ledger. A case
            passes when the agent settles on the expected payment (or asks instead of guessing),
            reaches the expected state, replies in the right language, and makes no success claim
            the ledger doesn't support.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => run("auto")} disabled={running !== null}>
            {running === "auto" ? <Loader2 className="animate-spin" /> : <Play />} Run with Sarvam
          </Button>
          <Button variant="outline" onClick={() => run("fallback")} disabled={running !== null}>
            {running === "fallback" ? <Loader2 className="animate-spin" /> : <Play />} Run scripted
            fallback
          </Button>
        </div>
      </header>

      {error && (
        <p className="mt-4 rounded-lg bg-status-red-soft px-3 py-2 text-[13px] text-status-red">
          {error}
        </p>
      )}

      {report && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Passed"
              value={`${report.passed} / ${report.total}`}
              good={report.passed === report.total}
            />
            <Stat
              label="Unverified success claims"
              value={String(report.unverifiedClaims)}
              good={report.unverifiedClaims === 0}
            />
            <Stat
              label="Model used"
              value={[...new Set(report.results.map((r) => r.got.provider))].join(", ")}
            />
            <Stat label="Run time" value={`${(report.ms / 1000).toFixed(1)}s`} />
          </dl>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Case</th>
                  <th className="px-3 py-2 font-semibold">Complaint</th>
                  <th className="px-3 py-2 font-semibold">Payment</th>
                  <th className="px-3 py-2 font-semibold">State</th>
                  <th className="px-3 py-2 font-semibold">Lang</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.results.map((r) => (
                  <tr key={r.id} className={cn(!r.pass && "bg-status-red-soft/40")}>
                    <td className="whitespace-nowrap px-3 py-2 align-top">
                      <span className="font-bold">{r.id}</span>
                      <span className="block text-[10px] text-muted-foreground">{r.tag}</span>
                    </td>
                    <td className="px-3 py-2 align-top leading-snug">{r.text}</td>
                    <Cell ok={r.refOk} got={r.got.ref ?? "asks"} want={r.expected.ref ?? "asks"} />
                    <Cell
                      ok={r.statusOk}
                      got={STATUS_LABEL[r.got.status]}
                      want={STATUS_LABEL[r.expected.status]}
                    />
                    <Cell ok={r.langOk} got={r.got.lang} want={r.expected.lang} />
                    <td className="px-3 py-2 align-top">
                      {r.pass ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-status-green">
                          <Check className="size-3.5" aria-hidden /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-status-red">
                          <X className="size-3.5" aria-hidden /> Fail
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!report && !running && (
        <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          Run the suite to see results. The Sarvam run makes one model call per case; without a key
          it uses the scripted fallback.
        </p>
      )}
      {running && !report && (
        <p className="mt-8 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Running 25 cases…
        </p>
      )}
    </main>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-display text-[20px] font-extrabold",
          good === true && "text-status-green",
          good === false && "text-status-red",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Cell({ ok, got, want }: { ok: boolean; got: string; want: string }) {
  return (
    <td className="px-3 py-2 align-top">
      <span className={cn("font-medium", !ok && "text-status-red")}>{got}</span>
      {!ok && <span className="block text-[10px] text-muted-foreground">expected {want}</span>}
    </td>
  );
}
