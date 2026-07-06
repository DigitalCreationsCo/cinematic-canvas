import type { useQueryFunctionType } from "@/types/api";
import type { NapRepositoryRead } from "@/types/nap";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface IRecentRepositoriesParams {
  limit?: number;
}

export const useRecentRepositories: useQueryFunctionType<
  IRecentRepositoriesParams | undefined,
  NapRepositoryRead[]
> = (params?, options?) => {
  const { query } = UseRequestProcessor();
  const limit = params?.limit ?? 3;

  const fn = async (): Promise<NapRepositoryRead[]> => {
    const res = await api.get(`${getURL("NAP")}/repositories/recent`, {
      params: { limit },
    });
    return res.data;
  };

  return query(["useRecentRepositories", limit], fn, options);
};
