import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSnapshot, pickTxn, qualifyFailure, resetDemo, runSim, sendComplaint, setFault } from "@/resolve/api";
import type { FailureCategory, Faults, HumanAction, SimAction } from "@/resolve/types";

const KEY = ["resolve-snapshot"];

/** Polls the server once a second. Each poll also drives the verify loop. */
export function useSnapshot() {
  return useQuery({ queryKey: KEY, queryFn: () => getSnapshot(), refetchInterval: 1000 });
}

export function useActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    complain: async (text: string) => {
      await sendComplaint({ data: { text } });
      await refresh();
    },
    pick: async (caseId: string, ref: string) => {
      await pickTxn({ data: { caseId, ref } });
      await refresh();
    },
    sim: async (action: SimAction, ref?: string) => {
      await runSim({ data: ref ? { action, ref } : { action } });
      await refresh();
    },
    fault: async (key: keyof Faults, on: boolean) => {
      await setFault({ data: { key, on } });
      await refresh();
    },
    reset: async () => {
      await resetDemo();
      await refresh();
    },
    qualify: async (caseId: string, category: FailureCategory, action: HumanAction, note: string, reviewer: string) => {
      await qualifyFailure({ data: { caseId, category, action, note, reviewer } });
      await refresh();
    },
  };
}
