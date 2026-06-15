import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export interface CreateCreditCheckoutRequest {
  package_id: number;
  success_url?: string;
  cancel_url?: string;
}

interface CreateCreditCheckoutResponse {
  url: string;
}

export const usePostCreateCreditCheckout: useMutationFunctionType<
  undefined,
  CreateCreditCheckoutRequest
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  async function createCreditCheckoutFn(
    data: CreateCreditCheckoutRequest,
  ): Promise<CreateCreditCheckoutResponse> {
    const response = await api.post<CreateCreditCheckoutResponse>(
      getURL("CREATE_CREDIT_CHECKOUT"),
      data,
    );
    return response.data;
  }

  const mutation: UseMutationResult<
    CreateCreditCheckoutResponse,
    Error,
    CreateCreditCheckoutRequest
  > = mutate(["usePostCreateCreditCheckout"], createCreditCheckoutFn, {
    retry: false,
    ...options,
  });

  return mutation;
};
