import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { forecastQueryOptions, statusQueryOptions } from "@/api/hooks";

export function usePrefetch() {
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    // On Dashboard, prefetch forecast and status data for quick navigation
    if (location.pathname === "/") {
      queryClient.prefetchQuery(forecastQueryOptions({ model: "xgboost", horizon: 24 }));
      queryClient.prefetchQuery(statusQueryOptions());
    }
  }, [location.pathname, queryClient]);
}
