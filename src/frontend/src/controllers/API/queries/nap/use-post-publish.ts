import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import type {
  PublishConflictResponse,
  PublishRequest,
  PublishSuccessResponse,
} from "@/types/nap";
import { api } from "../../api";
import { UseRequestProcessor } from "../../services/request-processor";

export const usePostPublish: useMutationFunctionType<
  undefined,
  PublishRequest,
  PublishSuccessResponse
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  const publishFn = async (
    payload: PublishRequest,
  ): Promise<PublishSuccessResponse> => {
    const response = await api.post<PublishSuccessResponse>(
      "/api/v1/nap/publish",
      payload,
    );
    return response.data;
  };

  const mutation: UseMutationResult<
    PublishSuccessResponse,
    PublishConflictResponse | unknown,
    PublishRequest
  > = mutate(["usePostPublish"], publishFn, {
    ...options,
  });

  return mutation;
};
