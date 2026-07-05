import { useQuery } from "@tanstack/react-query";
import axios from "@/lib/axios";
import {
  dashboardDateRangeToSearchParams,
  type DashboardDateRangeValue,
} from "@/lib/dashboard/date-range";

interface EmailMonitoringParams {
  range: DashboardDateRangeValue;
  status: string;
  emailType: string;
}

export function useEmailMonitoring(params: EmailMonitoringParams) {
  return useQuery({
    queryKey: ["email-monitoring", params],
    queryFn: async () => {
      const qs = dashboardDateRangeToSearchParams(params.range);
      if (params.status && params.status !== "all") qs.set("status", params.status);
      if (params.emailType && params.emailType !== "all") qs.set("emailType", params.emailType);

      const res = await axios.get(`/admin/email-monitoring?${qs.toString()}`);
      return res.data;
    },
  });
}
