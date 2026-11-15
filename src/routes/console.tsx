import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { OpsConsole } from "@/components/resolve/OpsConsole";
import { Loading } from "@/components/resolve/Loading";
import { useSnapshot } from "@/components/resolve/useResolve";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "Paytm Resolve | Support console" },
      {
        name: "description",
        content: "Support console of the Paytm Resolve concept demo. Synthetic data only.",
      },
    ],
  }),
  component: View,
});

function View() {
  const { data: snap } = useSnapshot();
  if (!snap) return <Loading />;
  return (
    <main className="mx-auto flex min-h-screen max-w-[1200px] flex-col items-center gap-4 p-4">
      <Link
        to="/"
        className="flex items-center gap-1.5 self-start text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Demo stage
      </Link>
      <OpsConsole snap={snap} className="h-[calc(100vh-7rem)] w-full" />
    </main>
  );
}
