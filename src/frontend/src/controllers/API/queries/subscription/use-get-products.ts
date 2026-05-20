import type { UseQueryResult } from "@tanstack/react-query";
import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface ProductTier {
  id: string;
  name: string;
  description: string;
  features: string[];
  price_id: string | null;
  price: number | null;
  currency: string | null;
}

export const useGetProducts: useQueryFunctionType<undefined, ProductTier[]> = (
  options?,
) => {
  const { query } = UseRequestProcessor();

  async function getProductsFn(): Promise<ProductTier[]> {
    const response = await api.get<ProductTier[]>(getURL("PRODUCTS"));
    return response.data;
  }

  const queryResult: UseQueryResult<ProductTier[]> = query(
    ["useGetProducts"],
    getProductsFn,
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      ...options,
    },
  );

  return queryResult;
};
