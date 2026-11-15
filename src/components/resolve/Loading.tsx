import { Loader2 } from "lucide-react";

export function Loading() {
  return (
    <div className="grid min-h-screen place-items-center text-muted-foreground">
      <span className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Starting Resolve…
      </span>
    </div>
  );
}
