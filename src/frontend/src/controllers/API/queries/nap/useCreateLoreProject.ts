import type { useMutationFunctionType } from "@/types/api";
import type {
  CreateProjectWithRepoRequest,
  CreateProjectWithRepoResponse,
} from "@/types/nap";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface ICreateProject {
  data: CreateProjectWithRepoRequest;
}

export const useCreateLoreProject: useMutationFunctionType<
  undefined,
  ICreateProject,
  CreateProjectWithRepoResponse
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const fn = async (
    payload: ICreateProject,
  ): Promise<CreateProjectWithRepoResponse> => {
    const res = await api.post(`${getURL("NAP")}/projects`, payload.data);
    return res.data;
  };

  return mutate(["useCreateLoreProject"], fn, {
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate queries that depend on the repository or folders list
      queryClient.invalidateQueries({ queryKey: ["useGetNapRepos"] });
      queryClient.invalidateQueries({ queryKey: ["useGetFolders"] });
      queryClient.invalidateQueries({ queryKey: ["useRecentRepositories"] });

      if (options?.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
  });
};
