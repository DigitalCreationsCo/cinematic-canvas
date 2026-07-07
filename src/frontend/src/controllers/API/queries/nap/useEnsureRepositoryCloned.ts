import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface EnsureRepositoryClonedParams {
  folderId: string;
}

export const useEnsureRepositoryCloned: useMutationFunctionType<
  void,
  EnsureRepositoryClonedParams
> = (options) => {
  const { mutate } = UseRequestProcessor();

  const ensureRepositoryClonedFn = async (
    params: EnsureRepositoryClonedParams,
  ) => {
    await api.post(
      `${getURL("NAP")}/repositories/ensure-cloned/${params.folderId}`,
    );
  };

  const mutationResult = mutate(
    ["useEnsureRepositoryCloned"],
    ensureRepositoryClonedFn,
    options,
  );

  return mutationResult;
};
