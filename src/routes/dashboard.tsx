import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Dashboard } from "@/components/resolve/Dashboard";
import { Loading } from "@/components/resolve/Loading";
import { useSnapshot } from "@/components/resolve/useResolve";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Paytm Resolve | HITL Dashboard" },
      {
        name: "description",
        content:
          "Human-in-the-Loop failure qualification dashboard for the Paytm Resolve concept demo.",
      },
    ],
  }),
  component: View,
});

function View() {
  const { data: snap } = useSnapshot();
  if (!snap) return <Loading />;
  return <Dashboard snap={snap} />;
}
