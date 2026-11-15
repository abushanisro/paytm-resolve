import { createFileRoute } from "@tanstack/react-router";

import { CustomerPhone } from "@/components/resolve/CustomerPhone";
import { MerchantPhone } from "@/components/resolve/MerchantPhone";
import { OpsConsole } from "@/components/resolve/OpsConsole";
import { PresenterBar } from "@/components/resolve/PresenterBar";
import { Loading } from "@/components/resolve/Loading";
import { useSnapshot } from "@/components/resolve/useResolve";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paytm Resolve | Demo stage" },
      {
        name: "description",
        content:
          "A concept demo of an AI teammate that investigates a UPI payment exception, re-checks it, and closes the case only on evidence.",
      },
      { property: "og:title", content: "Paytm Resolve | Demo stage" },
      {
        property: "og:description",
        content:
          "Customer, merchant and support views of one payment case, kept open until it is verified.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Stage,
});

/** The 90-second view: all three personas looking at the same case. */
function Stage() {
  const { data: snap } = useSnapshot();
  if (!snap) return <Loading />;
  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4">
      <PresenterBar snap={snap} />
      <div className="grid flex-1 grid-cols-1 items-start justify-items-center gap-4 md:grid-cols-2 xl:grid-cols-[340px_340px_minmax(0,1fr)]">
        <CustomerPhone snap={snap} />
        <MerchantPhone snap={snap} />
        <OpsConsole snap={snap} className="h-[660px] w-full md:col-span-2 xl:col-span-1" />
      </div>
    </main>
  );
}
