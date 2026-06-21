import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import type { CreateEntityRequest, CreateEntityResponse } from "@/types/nap";
import { api } from "../../api";
import { UseRequestProcessor } from "../../services/request-processor";

export const usePostCreateEntity: useMutationFunctionType<
  undefined,
  CreateEntityRequest,
  CreateEntityResponse
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  const createEntityFn = async (
    payload: CreateEntityRequest,
  ): Promise<CreateEntityResponse> => {
    const response = await api.post<CreateEntityResponse>(
      "/api/v1/nap/create",
      payload,
    );
    return response.data;
  };

  const mutation: UseMutationResult<
    CreateEntityResponse,
    unknown,
    CreateEntityRequest
  > = mutate(["usePostCreateEntity"], createEntityFn, {
    ...options,
  });

  return mutation;
};
