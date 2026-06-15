import type { UseQueryResult } from "@tanstack/react-query";
import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface CreditCostsResponse {
  model_credit_costs: Record<string, number>;
  allowance_balance: number;
  purchased_balance: number;
}

export const useGetCreditCosts: useQueryFunctionType<
  undefined,
  CreditCostsResponse
> = (options?) => {
  const { query } = UseRequestProcessor();

  async function getCreditCostsFn(): Promise<CreditCostsResponse> {
    const response = await api.get<CreditCostsResponse>(getURL("CREDIT_COSTS"));
    return response.data;
  }

  const queryResult: UseQueryResult<CreditCostsResponse> = query(
    ["useGetCreditCosts"],
    getCreditCostsFn,
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...options,
    },
  );

  return queryResult;
};
