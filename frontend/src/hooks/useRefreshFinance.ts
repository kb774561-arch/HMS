import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Query keys are namespaced by module: ["tenants", …], ["rooms"], ["rent", m, y],
 * ["payments", …], ["deposits"], ["dashboard", m, y], ["tenant", id].
 * Any money or occupancy change refreshes every screen that shows derived totals.
 */
export function useRefreshFinance() {
  const qc = useQueryClient();
  return useCallback(
    (...extra: string[]) =>
      Promise.all(
        ["tenants", "tenant", "rooms", "beds", "rent", "payments", "deposits", "dashboard", "outstanding", "expenses", ...extra].map((key) =>
          qc.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    [qc],
  );
}
