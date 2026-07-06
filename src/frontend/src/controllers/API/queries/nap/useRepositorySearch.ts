import type { useQueryFunctionType } from "@/types/api";
import type { NapRepositoryRead } from "@/types/nap";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface ISearchRepos {
  q: string;
}

export const useRepositorySearch: useQueryFunctionType<
  ISearchRepos,
  NapRepositoryRead[]
> = ({ q }, options?) => {
  const { query } = UseRequestProcessor();
  const trimmedQuery = q?.trim() ?? "";

  const fn = async (): Promise<NapRepositoryRead[]> => {
    const res = await api.get(`${getURL("NAP")}/repositories/search`, {
      params: { q: trimmedQuery },
    });
    return res.data;
  };

  return query(["useRepositorySearch", trimmedQuery], fn, {
    ...options,
    enabled: !!trimmedQuery && (options?.enabled ?? true),
  });
};
