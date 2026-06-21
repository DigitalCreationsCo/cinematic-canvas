import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import type { MergePreviewRequest, MergePreviewResponse } from "@/types/nap";
import { api } from "../../api";
import { UseRequestProcessor } from "../../services/request-processor";

export const usePostMergePreview: useMutationFunctionType<
  undefined,
  MergePreviewRequest,
  MergePreviewResponse
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  const mergePreviewFn = async (
    payload: MergePreviewRequest,
  ): Promise<MergePreviewResponse> => {
    const response = await api.post<MergePreviewResponse>(
      "/api/v1/nap/merge",
      payload,
    );
    return response.data;
  };

  const mutation: UseMutationResult<
    MergePreviewResponse,
    unknown,
    MergePreviewRequest
  > = mutate(["usePostMergePreview"], mergePreviewFn, {
    ...options,
  });

  return mutation;
};
