import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface CreatePortalResponse {
  url: string;
}

export const usePostCreatePortal: useMutationFunctionType<undefined, void> = (
  options?,
) => {
  const { mutate } = UseRequestProcessor();

  async function createPortalFn(): Promise<CreatePortalResponse> {
    const response = await api.post<CreatePortalResponse>(
      getURL("CREATE_PORTAL"),
    );
    return response.data;
  }

  const mutation: UseMutationResult<CreatePortalResponse, Error, void> = mutate(
    ["usePostCreatePortal"],
    createPortalFn,
    {
      retry: false,
      ...options,
    },
  );

  return mutation;
};
