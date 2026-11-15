import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  DollarSign,
  Eye,
  Filter,
  Globe,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";

import { cn } from "@/lib/utils";
import type {
  AuditEvent,
  Case,
  CaseStatus,
  FailureCategory,
  HumanAction,
  Lang,
  Owner,
  Qualification,
  ReasonCode,
  Snapshot,
} from "@/resolve/types";

import { Chip, PaytmLogo, StatusPill, clock, countdown, rupees, shortClock } from "./shared";
import { useActions } from "./useResolve";

/* ---------- Constants & Labels ---------- */

const REASON_LABEL: Record<string, string> = {
  REVERSAL_CONFIRMED: "Bank confirmed reversal",
  CREDIT_MATCHED: "Merchant credit matched",
  CREDIT_NOT_FOUND: "Credit not found yet",
  BANK_PENDING: "Bank response pending",
  REVERSAL_PENDING: "Reversal pending",
  CONFLICTING_DATA: "Conflicting data sources",
  TOOL_UNAVAILABLE: "Tool check unavailable / timeout",
  RECHECK_BUDGET_EXHAUSTED: "All re-checks exhausted",
};

const CATEGORY_LABEL: Record<FailureCategory, string> = {
  BANK_GATEWAY_TIMEOUT: "Bank Gateway Timeout",
  MERCHANT_SETTLEMENT_DELAY: "Merchant Settlement Delay",
  DATA_INCONSISTENCY: "Data Inconsistency",
  SUSPECTED_FRAUD: "Suspected Fraud / Dispute",
  USER_INPUT_ERROR: "User Input Error",
};

const ACTION_LABEL: Record<HumanAction, string> = {
  APPROVE_MANUAL_REFUND: "Approve Manual Refund",
  CREDIT_MERCHANT_MANUALLY: "Credit Merchant Manually",
  TRIGGER_RECHECK: "Force Immediate Re-check",
  REQUEST_BANK_STATEMENT: "Request Bank Statement",
  REJECT_CLAIM: "Reject Claim",
};

const CATEGORY_OPTIONS: FailureCategory[] = [
  "BANK_GATEWAY_TIMEOUT",
  "MERCHANT_SETTLEMENT_DELAY",
  "DATA_INCONSISTENCY",
  "SUSPECTED_FRAUD",
  "USER_INPUT_ERROR",
];

const ACTION_OPTIONS: HumanAction[] = [
  "APPROVE_MANUAL_REFUND",
  "CREDIT_MERCHANT_MANUALLY",
  "TRIGGER_RECHECK",
  "REQUEST_BANK_STATEMENT",
  "REJECT_CLAIM",
];

type StatusFilter = "ALL" | "ESCALATED" | "MONITORING" | "CLOSED_VERIFIED" | "NEEDS_INFO" | "INVESTIGATING";
type ReviewFilter = "ALL" | "PENDING" | "QUALIFIED";
type AmountFilter = "ALL" | "UNDER_500" | "500_1500" | "OVER_1500";
type SortOption = "NEWEST" | "OLDEST" | "AMOUNT_HIGH" | "AMOUNT_LOW";

/* ---------- Root Dashboard ---------- */

export function Dashboard({ snap }: { snap: Snapshot }) {
  // Filter States
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("ALL");
  const [reasonFilter, setReasonFilter] = useState<ReasonCode | "ALL">("ALL");
  const [ownerFilter, setOwnerFilter] = useState<Owner | "ALL">("ALL");
  const [langFilter, setLangFilter] = useState<Lang | "ALL">("ALL");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("NEWEST");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const resetAllFilters = () => {
    setStatusFilter("ALL");
    setReviewFilter("ALL");
    setReasonFilter("ALL");
    setOwnerFilter("ALL");
    setLangFilter("ALL");
    setAmountFilter("ALL");
    setSortBy("NEWEST");
    setSearchQuery("");
  };

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    reviewFilter !== "ALL" ||
    reasonFilter !== "ALL" ||
    ownerFilter !== "ALL" ||
    langFilter !== "ALL" ||
    amountFilter !== "ALL" ||
    searchQuery.trim().length > 0;

  // Filtered and Sorted Cases
  const filtered = useMemo(() => {
    let list = [...snap.cases];

    // Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((c) => c.status === statusFilter);
    }

    // Review / Qualification filter
    if (reviewFilter === "PENDING") {
      list = list.filter((c) => !c.qualification);
    } else if (reviewFilter === "QUALIFIED") {
      list = list.filter((c) => Boolean(c.qualification));
    }

    // Reason code filter
    if (reasonFilter !== "ALL") {
      list = list.filter((c) => c.reason === reasonFilter);
    }

    // Owner filter
    if (ownerFilter !== "ALL") {
      list = list.filter((c) => c.owner === ownerFilter);
    }

    // Language filter
    if (langFilter !== "ALL") {
      list = list.filter((c) => c.language === langFilter);
    }

    // Amount range filter
    if (amountFilter !== "ALL") {
      list = list.filter((c) => {
        const t = snap.txns.find((x) => x.ref === c.ref);
        const amt = t?.amount ?? 0;
        if (amountFilter === "UNDER_500") return amt < 500;
        if (amountFilter === "500_1500") return amt >= 500 && amt <= 1500;
        if (amountFilter === "OVER_1500") return amt > 1500;
        return true;
      });
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const t = snap.txns.find((x) => x.ref === c.ref);
        return (
          c.id.toLowerCase().includes(q) ||
          (c.ref ?? "").toLowerCase().includes(q) ||
          (t?.utr ?? "").toLowerCase().includes(q) ||
          (t?.merchantName ?? "").toLowerCase().includes(q) ||
          (c.complaint ?? "").toLowerCase().includes(q) ||
          (c.qualification?.note ?? "").toLowerCase().includes(q) ||
          (c.qualification?.reviewer ?? "").toLowerCase().includes(q)
        );
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "NEWEST") return b.updatedAt - a.updatedAt;
      if (sortBy === "OLDEST") return a.updatedAt - b.updatedAt;
      const amtA = snap.txns.find((x) => x.ref === a.ref)?.amount ?? 0;
      const amtB = snap.txns.find((x) => x.ref === b.ref)?.amount ?? 0;
      if (sortBy === "AMOUNT_HIGH") return amtB - amtA;
      if (sortBy === "AMOUNT_LOW") return amtA - amtB;
      return 0;
    });

    return list;
  }, [
    snap.cases,
    snap.txns,
    statusFilter,
    reviewFilter,
    reasonFilter,
    ownerFilter,
    langFilter,
    amountFilter,
    searchQuery,
    sortBy,
  ]);

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  // Key Metrics
  const totalCases = snap.cases.length;
  const pendingReviewCount = snap.cases.filter((c) => c.status === "ESCALATED" && !c.qualification).length;
  const monitoringCount = snap.cases.filter((c) => c.status === "MONITORING").length;
  const qualifiedCount = snap.cases.filter((c) => Boolean(c.qualification)).length;
  const autoResolvedCount = snap.cases.filter((c) => c.status === "CLOSED_VERIFIED" && !c.qualification).length;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Demo Stage
            </Link>
            <PaytmLogo className="!text-[22px]" />
            <span className="font-display text-[17px] font-extrabold tracking-tight">
              Resolve · HITL Failure Dashboard
            </span>
            <span className="hidden rounded-full bg-brand-cyan/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-cyan sm:inline">
              Human-in-the-Loop Operations
            </span>
          </div>

          <nav className="flex items-center gap-1.5 text-[12px]">
            <Link
              to="/"
              className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Demo Stage
            </Link>
            <Link
              to="/customer"
              className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Customer Phone
            </Link>
            <Link
              to="/merchant"
              className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Merchant Phone
            </Link>
            <Link
              to="/console"
              className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Console
            </Link>
            <Link
              to="/evals"
              className="rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Evals
            </Link>
          </nav>
        </div>
      </header>

      {/* KPI Stats Bar */}
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-[1700px] flex-wrap gap-3 px-5 py-3">
          <button
            onClick={() => {
              resetAllFilters();
            }}
            className="text-left"
          >
            <StatCard label="All Cases" value={totalCases} active={!hasActiveFilters} />
          </button>
          <button
            onClick={() => {
              resetAllFilters();
              setStatusFilter("ESCALATED");
              setReviewFilter("PENDING");
            }}
            className="text-left"
          >
            <StatCard
              label="Action Needed"
              value={pendingReviewCount}
              tone="red"
              hint="Unqualified Escalations"
              active={statusFilter === "ESCALATED" && reviewFilter === "PENDING"}
            />
          </button>
          <button
            onClick={() => {
              resetAllFilters();
              setStatusFilter("MONITORING");
            }}
            className="text-left"
          >
            <StatCard
              label="Live Monitoring"
              value={monitoringCount}
              tone="amber"
              hint="Polling Gateway"
              active={statusFilter === "MONITORING"}
            />
          </button>
          <button
            onClick={() => {
              resetAllFilters();
              setReviewFilter("QUALIFIED");
            }}
            className="text-left"
          >
            <StatCard
              label="Human Qualified"
              value={qualifiedCount}
              tone="cyan"
              hint="Reviewed by Ops"
              active={reviewFilter === "QUALIFIED"}
            />
          </button>
          <button
            onClick={() => {
              resetAllFilters();
              setStatusFilter("CLOSED_VERIFIED");
              setReviewFilter("PENDING");
            }}
            className="text-left"
          >
            <StatCard
              label="Auto Resolved"
              value={autoResolvedCount}
              tone="green"
              hint="Closed by AI"
              active={statusFilter === "CLOSED_VERIFIED" && reviewFilter === "PENDING"}
            />
          </button>
        </div>
      </div>

      {/* Main Filter Toolbar */}
      <div className="border-b border-border bg-card/20 px-5 py-2.5">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-3">
          {/* Quick Presets & Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
              <Filter className="size-3.5" /> Status:
            </span>
            {(
              [
                ["ALL", "All"],
                ["ESCALATED", "Escalated"],
                ["MONITORING", "Monitoring"],
                ["CLOSED_VERIFIED", "Closed"],
                ["NEEDS_INFO", "Needs Info"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val as StatusFilter)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                  statusFilter === val
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}

            <span className="mx-1 text-muted-foreground/40">|</span>

            {/* Review status */}
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
              Review:
            </span>
            {(
              [
                ["ALL", "All"],
                ["PENDING", "Pending Review"],
                ["QUALIFIED", "Qualified"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setReviewFilter(val as ReviewFilter)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                  reviewFilter === val
                    ? "bg-brand-cyan text-brand-navy shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search, Advanced Toggle & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                showAdvancedFilters
                  ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              <Filter className="size-3.5" />
              <span>More Filters</span>
              {(reasonFilter !== "ALL" || ownerFilter !== "ALL" || langFilter !== "ALL" || amountFilter !== "ALL") && (
                <span className="grid size-4 place-items-center rounded-full bg-brand-cyan text-[9px] font-bold text-brand-navy">
                  !
                </span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-status-red-soft hover:text-status-red"
              >
                <X className="size-3.5" /> Clear All
              </button>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search ID, UPI, UTR, Merchant, Note…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-64 rounded-lg border border-border bg-background pl-8 pr-3 text-[12px] placeholder:text-muted-foreground focus:border-brand-cyan focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="mx-auto mt-3 max-w-[1700px] rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {/* Failure Reason */}
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <ShieldAlert className="size-3" /> Failure Reason
                </label>
                <select
                  value={reasonFilter}
                  onChange={(e) => setReasonFilter(e.target.value as ReasonCode | "ALL")}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] focus:border-brand-cyan focus:outline-none"
                >
                  <option value="ALL">All Reasons</option>
                  <option value="TOOL_UNAVAILABLE">Tool Unavailable / Timeout</option>
                  <option value="CONFLICTING_DATA">Conflicting Data</option>
                  <option value="RECHECK_BUDGET_EXHAUSTED">Budget Exhausted</option>
                  <option value="CREDIT_NOT_FOUND">Credit Not Found</option>
                  <option value="BANK_PENDING">Bank Pending</option>
                  <option value="REVERSAL_CONFIRMED">Reversal Confirmed</option>
                  <option value="CREDIT_MATCHED">Credit Matched</option>
                </select>
              </div>

              {/* Responsible Team / Owner */}
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Users className="size-3" /> Team / Owner
                </label>
                <select
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value as Owner | "ALL")}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] focus:border-brand-cyan focus:outline-none"
                >
                  <option value="ALL">All Teams</option>
                  <option value="Payments Ops">Payments Ops</option>
                  <option value="Settlement Ops">Settlement Ops</option>
                  <option value="Bank Disputes">Bank Disputes</option>
                  <option value="Resolve">Resolve (AI)</option>
                </select>
              </div>

              {/* Customer Language */}
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Globe className="size-3" /> Language
                </label>
                <select
                  value={langFilter}
                  onChange={(e) => setLangFilter(e.target.value as Lang | "ALL")}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] focus:border-brand-cyan focus:outline-none"
                >
                  <option value="ALL">All Languages</option>
                  <option value="en">English (en)</option>
                  <option value="hi">Hindi (hi)</option>
                  <option value="ta">Tamil (ta)</option>
                </select>
              </div>

              {/* Amount Range */}
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <DollarSign className="size-3" /> Transaction Amount
                </label>
                <select
                  value={amountFilter}
                  onChange={(e) => setAmountFilter(e.target.value as AmountFilter)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] focus:border-brand-cyan focus:outline-none"
                >
                  <option value="ALL">Any Amount</option>
                  <option value="UNDER_500">Under ₹500</option>
                  <option value="500_1500">₹500 - ₹1,500</option>
                  <option value="OVER_1500">Above ₹1,500</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <ArrowDownUp className="size-3" /> Sort Order
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] focus:border-brand-cyan focus:outline-none"
                >
                  <option value="NEWEST">Newest First</option>
                  <option value="OLDEST">Oldest First</option>
                  <option value="AMOUNT_HIGH">Highest Amount</option>
                  <option value="AMOUNT_LOW">Lowest Amount</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Split Master-Detail */}
      <div className="mx-auto flex w-full max-w-[1700px] flex-1 gap-0">
        {/* Left Side: Cases List */}
        <div className="w-[360px] shrink-0 overflow-y-auto border-r border-border bg-card/20">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Cases ({filtered.length} of {totalCases})
            </span>
            <span className="text-[10px] text-muted-foreground">Sorted by {sortBy.toLowerCase()}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <Eye className="size-8 text-muted-foreground/40" />
              <p className="text-[13px] font-semibold text-muted-foreground">No matching cases</p>
              <p className="text-[11px] text-muted-foreground/70">
                Try adjusting your search query or reset the filters.
              </p>
              <button
                onClick={resetAllFilters}
                className="mt-2 rounded-lg bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <ul>
              {filtered.map((c) => {
                const t = snap.txns.find((x) => x.ref === c.ref);
                const isSelected = selected?.id === c.id;
                const isUnqualifiedEscalation = c.status === "ESCALATED" && !c.qualification;

                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "block w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
                        isSelected && "border-l-4 border-l-brand-cyan bg-accent",
                        isUnqualifiedEscalation && !isSelected && "bg-status-red-soft/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-foreground">{c.id}</span>
                        <span className="text-[13px] font-bold tabular-nums text-foreground">
                          {t ? rupees(t.amount) : "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {t ? `${t.merchantName} · UPI ${t.ref}` : "Transaction unidentified"}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusPill status={c.status} />
                        {isUnqualifiedEscalation && (
                          <span className="flex items-center gap-1 rounded-full bg-status-red-soft px-2 py-0.5 text-[10px] font-bold text-status-red">
                            <AlertTriangle className="size-3" /> Review Needed
                          </span>
                        )}
                        {c.qualification && (
                          <span className="flex items-center gap-1 rounded-full bg-status-green-soft px-2 py-0.5 text-[10px] font-bold text-status-green">
                            <CheckCircle2 className="size-3" /> Qualified
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {shortClock(c.updatedAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Side: Case Detail + Qualification Form + Chat Workflow */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selected ? (
            <CasePanel c={selected} snap={snap} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="text-center">
                <ShieldCheck className="mx-auto size-12 text-muted-foreground/30" />
                <p className="mt-3 text-[15px] font-bold text-muted-foreground">
                  No case selected
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground/70">
                  Select a case from the list on the left to review facts and qualify failures.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- StatCard Helper ---------- */

function StatCard({
  label,
  value,
  tone,
  hint,
  active,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber" | "green" | "blue" | "cyan";
  hint?: string;
  active?: boolean;
}) {
  const tones = {
    red: "text-status-red border-status-red/40 bg-status-red-soft/30",
    amber: "text-status-amber border-status-amber/40 bg-status-amber-soft/30",
    green: "text-status-green border-status-green/40 bg-status-green-soft/30",
    blue: "text-brand-navy border-brand-cyan/40 bg-status-blue-soft/30",
    cyan: "text-brand-cyan border-brand-cyan/40 bg-status-cyan-soft/30",
  };

  return (
    <div
      className={cn(
        "cursor-pointer rounded-xl border border-border bg-card px-4 py-2 shadow-sm transition-all hover:border-brand-cyan hover:shadow-md",
        active && "ring-2 ring-brand-cyan border-brand-cyan",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[22px] font-extrabold tabular-nums",
            tone ? tones[tone].split(" ")[0] : "text-foreground",
          )}
        >
          {value}
        </span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

/* ---------- Case Panel (Detail View) ---------- */

function CasePanel({ c, snap }: { c: Case; snap: Snapshot }) {
  const t = snap.txns.find((x) => x.ref === c.ref);
  const events = useMemo(() => snap.audit.filter((e) => e.caseId === c.id), [snap.audit, c.id]);
  const next = countdown(c, snap.now);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Header Info */}
      <div className="border-b border-border bg-card/50 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[20px] font-extrabold">{c.id}</h2>
          <StatusPill status={c.status} />
          <Chip>Owner: {c.owner}</Chip>
          <Chip>{c.origin === "PROACTIVE" ? "Proactive Detection" : "Customer Complaint"}</Chip>
          <Chip>Language: {c.language.toUpperCase()}</Chip>
          {c.qualification && (
            <span className="rounded-full bg-status-green-soft px-2.5 py-0.5 text-[11px] font-bold text-status-green">
              ✓ Qualified by {c.qualification.reviewer}
            </span>
          )}
        </div>

        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {t
            ? `${rupees(t.amount)} to ${t.merchantName} · UPI Ref ${t.ref} · Bank UTR ${t.utr}`
            : "Transaction not linked yet"}
          {c.reason && (
            <>
              {" "}· <span className="font-medium text-foreground">{REASON_LABEL[c.reason] ?? c.reason}</span>
            </>
          )}
        </p>

        {c.complaint && (
          <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-[12px] italic leading-snug">
            "{c.complaint}"
          </p>
        )}

        {/* Facts Quad */}
        <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <FactBox label="Ledger Status" value={c.evidence.txn?.status} />
          <FactBox
            label="Bank Query (UDIR)"
            value={
              c.evidence.bank
                ? `${c.evidence.bank.state}${c.evidence.bank.reversal !== "NONE" ? ` (reversal ${c.evidence.bank.reversal})` : ""}`
                : undefined
            }
          />
          <FactBox label="Merchant Settlement" value={c.evidence.credit?.state.replace("_", " ")} />
          <FactBox
            label="Re-checks"
            value={`${c.recheck.count} of ${c.recheck.max}${next ? ` · next ${next}` : ""}`}
            neutral
          />
        </dl>

        {c.evidence.toolFailure && (
          <p className="mt-2 rounded-lg bg-status-red-soft px-3 py-2 text-[12px] font-medium text-status-red">
            Check failed: {c.evidence.toolFailure}
          </p>
        )}

        {/* AI Handoff Summary */}
        {c.summary && (
          <div className="mt-3 rounded-xl border border-border bg-status-blue-soft/70 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Bot className="size-3.5 text-brand-cyan" /> AI Operations Handoff Summary · by {c.summaryBy}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{c.summary}</p>
          </div>
        )}
      </div>

      {/* Detail Grid: Audit on Left, Qualification & Workflow on Right */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Audit Log */}
        <AuditTimeline events={events} />

        {/* Qualification & Live Chat Preview */}
        <div className="border-l border-border bg-card/20 p-4 space-y-4 overflow-y-auto">
          {/* Human Qualification Box */}
          <QualificationPanel c={c} />

          {/* Interactive Chat Workflow */}
          <ChatWorkflow c={c} snap={snap} />
        </div>
      </div>
    </div>
  );
}

/* ---------- FactBox ---------- */

function FactBox({
  label,
  value,
  neutral,
}: {
  label: string;
  value: string | undefined;
  neutral?: boolean;
}) {
  const good = value && /^(SUCCESS|MATCHED)/.test(value);
  const bad = value && /^(FAILED|NO MATCH|AMBIGUOUS|UNKNOWN)/.test(value);
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-[12px] font-bold",
          !value && "font-normal text-muted-foreground",
          !neutral && good && "text-status-green",
          !neutral && bad && "text-status-red",
          !neutral && value?.startsWith("PENDING") && "text-status-amber",
        )}
      >
        {value ?? "Not checked"}
      </dd>
    </div>
  );
}

/* ---------- Qualification Panel ---------- */

function QualificationPanel({ c }: { c: Case }) {
  const actions = useActions();
  const [category, setCategory] = useState<FailureCategory>("BANK_GATEWAY_TIMEOUT");
  const [action, setAction] = useState<HumanAction>("APPROVE_MANUAL_REFUND");
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState("Ops Specialist (You)");
  const [submitting, setSubmitting] = useState(false);

  // If already qualified
  if (c.qualification) {
    return (
      <div className="rounded-xl border-2 border-status-green/40 bg-status-green-soft/50 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-status-green" />
          <span className="text-[13px] font-bold text-status-green">Human Qualification Recorded</span>
        </div>
        <dl className="mt-3 space-y-2 text-[12px]">
          <div>
            <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Root Cause Category</dt>
            <dd className="font-bold text-foreground">{CATEGORY_LABEL[c.qualification.category]}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Action Taken</dt>
            <dd className="font-bold text-status-green">{ACTION_LABEL[c.qualification.action]}</dd>
          </div>
          {c.qualification.note && (
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Reviewer Note</dt>
              <dd className="italic text-muted-foreground">"{c.qualification.note}"</dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Verified By</dt>
            <dd className="text-muted-foreground">{c.qualification.reviewer} · {clock(c.qualification.at)}</dd>
          </div>
        </dl>
      </div>
    );
  }

  // If not escalated
  if (c.status !== "ESCALATED") {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
        <Clock className="mx-auto size-6 text-muted-foreground/50" />
        <p className="mt-2 text-[13px] font-bold text-muted-foreground">
          Handled by Autonomous Engine
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          This case is currently being processed by Resolve without requiring human intervention.
        </p>
      </div>
    );
  }

  // Qualification Form
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await actions.qualify(c.id, category, action, note, reviewer);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-status-amber/40 bg-status-amber-soft/40 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-status-amber" />
        <span className="text-[13px] font-bold text-status-amber">Human Review & Qualification</span>
      </div>

      <div className="mt-3 space-y-3">
        {/* Root Cause */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            1. Root Cause Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FailureCategory)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] focus:border-brand-cyan focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {/* Resolution Action */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            2. Resolution Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as HumanAction)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] focus:border-brand-cyan focus:outline-none"
          >
            {ACTION_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {ACTION_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {/* Reviewer */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            3. Reviewer Name
          </label>
          <input
            type="text"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] focus:border-brand-cyan focus:outline-none"
          />
        </div>

        {/* Investigation Note */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            4. Investigation Note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Confirmed with acquiring bank — settlement batch delayed. Refund approved."
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] leading-snug placeholder:text-muted-foreground focus:border-brand-cyan focus:outline-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-[12px] font-bold text-primary-foreground shadow transition-colors hover:bg-primary/90",
            submitting && "opacity-60",
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Recording…
            </>
          ) : (
            <>
              <Send className="size-3.5" /> Submit Qualification & Close Loop
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ---------- Chat Workflow Preview ---------- */

function ChatWorkflow({ c, snap }: { c: Case; snap: Snapshot }) {
  const t = snap.txns.find((x) => x.ref === c.ref);

  const steps = [
    {
      label: "AI Diagnostics",
      done: c.status !== "INTAKE",
      active: c.status === "INTAKE" || c.status === "INVESTIGATING",
    },
    {
      label: "Human Ops Review",
      done: Boolean(c.qualification),
      active: c.status === "ESCALATED" && !c.qualification,
    },
    {
      label: "Settlement Closed",
      done: c.status === "CLOSED_VERIFIED",
      active: false,
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="size-3.5 text-brand-cyan" /> Customer Chat Workflow Preview
      </h4>

      {/* 3-Step Lifecycle Tracker */}
      <div className="mt-3 flex items-center justify-between gap-1">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-1 items-center gap-1">
            <div
              className={cn(
                "flex-1 rounded-md py-1 text-center text-[10px] font-bold transition-all",
                step.done && "bg-status-green text-white",
                step.active && "bg-brand-cyan text-brand-navy animate-pulse shadow-sm",
                !step.done && !step.active && "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}. {step.label} {step.done && "✓"}
            </div>
            {i < steps.length - 1 && <ArrowRight className="size-3 text-muted-foreground/50 shrink-0" />}
          </div>
        ))}
      </div>

      {/* Simulated Live Messages */}
      <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        {/* User complaint */}
        {c.complaint && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-1.5 text-[11px] text-primary-foreground">
              {c.complaint}
            </div>
          </div>
        )}

        {/* AI response */}
        <div className="max-w-[88%]">
          <div className="rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-[11px] shadow-sm">
            {t ? (
              <p>
                Investigating your ₹{t.amount} payment to {t.merchantName} (UPI {t.ref}).
              </p>
            ) : (
              <p>Investigating your payment exception…</p>
            )}
          </div>
        </div>

        {/* Human escalation banner */}
        {c.status === "ESCALATED" && !c.qualification && (
          <div className="rounded-xl border border-status-amber/40 bg-status-amber-soft/50 p-2.5 text-[11px]">
            <p className="font-bold text-status-amber">Transferred to Human Specialist ({c.owner})</p>
            <p className="mt-0.5 text-muted-foreground">
              Our automated system reached its safe re-check limits. An operations engineer is reviewing your case.
            </p>
          </div>
        )}

        {/* Human qualification card */}
        {c.qualification && (
          <div className="rounded-xl border-2 border-status-green/50 bg-status-green-soft/60 p-2.5 text-[11px] shadow-sm">
            <div className="flex items-center gap-1.5 font-bold text-status-green">
              <CheckCircle2 className="size-3.5" /> Specialist Resolution: {ACTION_LABEL[c.qualification.action]}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Root cause: {CATEGORY_LABEL[c.qualification.category]}
            </p>
            {c.qualification.note && (
              <p className="mt-1 rounded bg-background/80 p-1.5 text-[11px] italic text-foreground">
                "{c.qualification.note}"
              </p>
            )}
            <p className="mt-1 text-[9px] text-muted-foreground">
              Resolved by {c.qualification.reviewer} · {shortClock(c.qualification.at)}
            </p>
          </div>
        )}

        {/* If statement requested */}
        {c.qualification?.action === "REQUEST_BANK_STATEMENT" && (
          <div className="rounded-xl border border-dashed border-brand-cyan bg-brand-cyan/10 p-2.5 text-center">
            <p className="text-[11px] font-semibold text-brand-cyan">Bank Statement Requested</p>
            <button
              onClick={() => alert("Simulated: Uploaded bank statement successfully!")}
              className="mt-1.5 rounded bg-brand-cyan px-3 py-1 text-[10px] font-bold text-brand-navy shadow-sm hover:opacity-90"
            >
              📎 Upload Statement / Passbook PDF
            </button>
          </div>
        )}

        {/* Verified closure */}
        {c.status === "CLOSED_VERIFIED" && !c.qualification && (
          <div className="max-w-[88%]">
            <div className="rounded-2xl rounded-tl-sm bg-status-green-soft px-3 py-1.5 text-[11px] font-medium text-status-green shadow-sm">
              ✓ Automated verification complete. Case resolved.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Audit Timeline ---------- */

function AuditTimeline({ events }: { events: AuditEvent[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events.length]);

  const ACTOR: Record<AuditEvent["actor"], { label: string; icon: typeof Bot; cls: string }> = {
    model: { label: "Model", icon: Bot, cls: "bg-status-cyan-soft text-brand-navy" },
    code: { label: "Code", icon: Code2, cls: "bg-muted text-muted-foreground" },
    presenter: { label: "Simulator", icon: Wrench, cls: "bg-status-amber-soft text-status-amber" },
    customer: { label: "Customer", icon: User, cls: "bg-status-blue-soft text-brand-navy" },
  };

  return (
    <div className="min-h-0 overflow-y-auto p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Audit log · {events.length} chronological events
      </h3>
      <ol className="mt-2 space-y-0">
        {events.map((e) => {
          const a = ACTOR[e.actor];
          return (
            <li
              key={e.id}
              className="grid grid-cols-[58px_74px_minmax(0,1fr)] gap-2 border-l border-border py-1.5 pl-3 text-[12px]"
            >
              <time className="font-mono text-[10px] leading-5 text-muted-foreground">
                {clock(e.at)}
              </time>
              <span
                className={cn(
                  "inline-flex h-5 items-center gap-1 self-start rounded px-1.5 text-[10px] font-semibold",
                  a.cls,
                )}
              >
                <a.icon className="size-3" /> {a.label}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "break-words font-semibold",
                    (e.kind === "TOOL" || e.kind === "POLICY" || e.kind === "NOTIFY") &&
                      "font-mono text-[11px]",
                    e.kind === "TOOL_ERROR" && "font-mono text-[11px] text-status-red",
                  )}
                >
                  {e.title}
                </span>
                {e.detail && (
                  <span className="block break-words leading-snug text-muted-foreground">
                    {e.detail}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div ref={end} />
    </div>
  );
}
