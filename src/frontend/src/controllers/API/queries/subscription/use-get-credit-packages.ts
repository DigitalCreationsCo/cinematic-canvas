import type { UseQueryResult } from "@tanstack/react-query";
import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  price_cents: number | null;
  currency: string;
}

export const useGetCreditPackages: useQueryFunctionType<
  undefined,
  CreditPackage[]
> = (options?) => {
  const { query } = UseRequestProcessor();

  async function getCreditPackagesFn(): Promise<CreditPackage[]> {
    const response = await api.get<CreditPackage[]>(getURL("CREDIT_PACKAGES"));
    return response.data;
  }

  const queryResult: UseQueryResult<CreditPackage[]> = query(
    ["useGetCreditPackages"],
    getCreditPackagesFn,
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      ...options,
    },
  );

  return queryResult;
};
