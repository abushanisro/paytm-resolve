# Paytm Resolve (concept demo)

An AI teammate that owns a UPI payment exception until it is verified closed: it investigates,
acts within limits, re-checks, and closes only on evidence. Hackathon concept. All data is
synthetic, no real payments are involved, and this is not affiliated with Paytm.

## Run it

```sh
npm install
cp .env.example .env.local   # add SARVAM_API_KEY; optional, see below
npm run dev                  # open the printed URL
npm test                     # policy, scenario and eval tests
```

No Paytm, NPCI or bank API is needed: those are mock adapters. The only key is `SARVAM_API_KEY`
(model calls and voice input). Without it the demo runs on a scripted fallback, and voice is off.
State is in server memory, so run it on a laptop; it will not hold state on a serverless host.

## What to show (about 90 seconds)

The home page is the demo stage: customer phone, merchant phone and support console on one case,
with presenter controls on top. The controls change the synthetic bank and settlement records,
never a case. Resolve has to find each change on its own re-check.

1. **Closes on its own.** Tap "My ₹800 payment to Annapurna Sweets failed". Bank confirms the
   reversal, so the case closes with evidence and the merchant is told to re-ask.
2. **Verify loop.** Tap the Hinglish "500 rupaye" sample. Two ₹500 payments match, so it asks
   which one. Pick UPI 4821: case opens, merchant sees "Wait". Press "Merchant credit lands"
   (nothing happens yet), then "Jump to next re-check": Resolve finds the credit and closes.
3. **Honest handoff.** Tap the Tamil sample and jump through three re-checks. The credit never
   appears, so it escalates to Settlement Ops with a written summary.
4. **Guardrails.** Turn on "Bank check times out" and send a complaint: it retries, then
   escalates instead of guessing.
5. **Proactive.** Press "New payment, credit delayed": a case opens and the merchant is alerted
   before anyone complains.

`/evals` runs 25 complaints (English, Hindi, Tamil, Hinglish, vague, duplicate, prompt injection)
and reports pass rate and the number of unverified success claims.

## How it works

| Step | Who does it | Where |
| --- | --- | --- |
| Understand the complaint, propose the transaction, write the handoff summary | Model (Sarvam, or scripted fallback) | `src/resolve/engine/llm/` |
| Confirm the transaction, fetch facts, decide, re-check, close | Code | `agent.ts`, `policy.ts`, `verifier.ts` |
| Customer and merchant wording | Fixed templates sent by ID | `src/resolve/templates.ts` |

The model never decides an outcome and never writes customer text. A case closes only on a
matched merchant credit or a bank-confirmed reversal. Every tool call, decision and message is
written to an append-only audit log, which is what the console timeline shows. Re-checks follow
NPCI's status-polling guidance: wait before the first check, at most three.

| Tool (mock) | Real source it stands in for |
| --- | --- |
| `get_transaction_status` | Paytm Transaction Status API (merchant) or internal ledger |
| `get_bank_response` | UDIR status check through Paytm's TPAP access |
| `check_merchant_credit` | Paytm Settlement API plus NPCI settlement files |
| case and notifications | Paytm's case tool and approved messaging |
