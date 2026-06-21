import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import type { DiffRequest, DiffResponse } from "@/types/nap";
import { api } from "../../api";
import { UseRequestProcessor } from "../../services/request-processor";

export const usePostDiff: useMutationFunctionType<
  undefined,
  DiffRequest,
  DiffResponse
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  const diffFn = async (payload: DiffRequest): Promise<DiffResponse> => {
    const response = await api.post<DiffResponse>("/api/v1/nap/diff", payload);
    return response.data;
  };

  const mutation: UseMutationResult<DiffResponse, unknown, DiffRequest> =
    mutate(["usePostDiff"], diffFn, {
      ...options,
    });

  return mutation;
};
