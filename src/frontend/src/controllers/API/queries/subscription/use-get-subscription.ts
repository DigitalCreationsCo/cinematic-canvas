import type { UseQueryResult } from "@tanstack/react-query";
import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface SubscriptionResponse {
  tier: string;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

export const useGetSubscription: useQueryFunctionType<
  undefined,
  SubscriptionResponse
> = (options?) => {
  const { query } = UseRequestProcessor();

  async function getSubscriptionFn(): Promise<SubscriptionResponse> {
    const response = await api.get<SubscriptionResponse>(
      getURL("SUBSCRIPTION"),
    );
    return response.data;
  }

  const queryResult: UseQueryResult<SubscriptionResponse> = query(
    ["useGetSubscription"],
    getSubscriptionFn,
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...options,
    },
  );

  return queryResult;
};
