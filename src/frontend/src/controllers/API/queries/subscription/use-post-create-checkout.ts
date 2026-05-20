import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface CreateCheckoutRequest {
  tier: string;
  success_url?: string;
  cancel_url?: string;
}

interface CreateCheckoutResponse {
  url: string;
}

export const usePostCreateCheckout: useMutationFunctionType<
  undefined,
  CreateCheckoutRequest
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  async function createCheckoutFn(
    data: CreateCheckoutRequest,
  ): Promise<CreateCheckoutResponse> {
    const response = await api.post<CreateCheckoutResponse>(
      getURL("CREATE_CHECKOUT"),
      data,
    );
    return response.data;
  }

  const mutation: UseMutationResult<
    CreateCheckoutResponse,
    Error,
    CreateCheckoutRequest
  > = mutate(["usePostCreateCheckout"], createCheckoutFn, {
    retry: false,
    ...options,
  });

  return mutation;
};
