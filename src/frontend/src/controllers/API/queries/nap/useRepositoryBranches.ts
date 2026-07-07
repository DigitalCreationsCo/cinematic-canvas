import type { useQueryFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";
import type { BranchRead } from "./index";

interface IRepositoryBranchesRecentParams {
  repositoryId: string;
  limit?: number;
}

export const useRepositoryBranchesRecent: useQueryFunctionType<
  IRepositoryBranchesRecentParams,
  BranchRead[]
> = ({ repositoryId, limit = 20 }, options?) => {
  const { query } = UseRequestProcessor();

  const fn = async (): Promise<BranchRead[]> => {
    const res = await api.get(
      `${getURL("NAP")}/repositories/${repositoryId}/branches/recent`,
      { params: { limit } },
    );
    return res.data;
  };

  return query(["useRepositoryBranchesRecent", repositoryId, limit], fn, {
    ...options,
    enabled: !!repositoryId && (options?.enabled ?? true),
  });
};

interface IRepositoryBranchesSearchParams {
  repositoryId: string;
  q: string;
}

export const useRepositoryBranchesSearch: useQueryFunctionType<
  IRepositoryBranchesSearchParams,
  BranchRead[]
> = ({ repositoryId, q }, options?) => {
  const { query } = UseRequestProcessor();
  const trimmedQuery = q?.trim() ?? "";

  const fn = async (): Promise<BranchRead[]> => {
    const res = await api.get(
      `${getURL("NAP")}/repositories/${repositoryId}/branches/search`,
      { params: { q: trimmedQuery } },
    );
    return res.data;
  };

  return query(["useRepositoryBranchesSearch", repositoryId, trimmedQuery], fn, {
    ...options,
    enabled: !!repositoryId && !!trimmedQuery && (options?.enabled ?? true),
  });
};
