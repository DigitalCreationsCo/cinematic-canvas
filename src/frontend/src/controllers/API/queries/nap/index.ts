export { useCreateLoreProject } from "./useCreateLoreProject";
export { useRecentRepositories } from "./useRecentRepositories";
export { useRepositorySearch } from "./useRepositorySearch";

import type { useQueryFunctionType } from "@/types/api";
import type { NapRepositoryRead } from "@/types/nap";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

// NOTE: Add these fields to NapRepositoryRead in "@/types/nap" if they
// aren't already there — the backend now returns them on every
// repository response:
//   tag: string;
//   pinned_commit_hash: string | null;

export interface TagRead {
  name: string;
  commit_hash: string;
  updated_at: number | null;
}

interface IRepositoryTagsRecentParams {
  repositoryId: string;
  limit?: number;
}

export const useRepositoryTagsRecent: useQueryFunctionType<
  IRepositoryTagsRecentParams,
  TagRead[]
> = ({ repositoryId, limit = 20 }, options?) => {
  const { query } = UseRequestProcessor();

  const fn = async (): Promise<TagRead[]> => {
    const res = await api.get(
      `${getURL("NAP")}/repositories/${repositoryId}/tags/recent`,
      { params: { limit } },
    );
    return res.data;
  };

  return query(["useRepositoryTagsRecent", repositoryId, limit], fn, {
    ...options,
    enabled: !!repositoryId && (options?.enabled ?? true),
  });
};

interface IRepositoryTagsSearchParams {
  repositoryId: string;
  q: string;
}

export const useRepositoryTagsSearch: useQueryFunctionType<
  IRepositoryTagsSearchParams,
  TagRead[]
> = ({ repositoryId, q }, options?) => {
  const { query } = UseRequestProcessor();
  const trimmedQuery = q?.trim() ?? "";

  const fn = async (): Promise<TagRead[]> => {
    const res = await api.get(
      `${getURL("NAP")}/repositories/${repositoryId}/tags/search`,
      { params: { q: trimmedQuery } },
    );
    return res.data;
  };

  return query(["useRepositoryTagsSearch", repositoryId, trimmedQuery], fn, {
    ...options,
    enabled: !!repositoryId && !!trimmedQuery && (options?.enabled ?? true),
  });
};

interface IRepositoryByFolderParams {
  folderId: string;
}

export const useRepositoryByFolder: useQueryFunctionType<
  IRepositoryByFolderParams,
  NapRepositoryRead | null
> = ({ folderId }, options?) => {
  const { query } = UseRequestProcessor();

  const fn = async (): Promise<NapRepositoryRead | null> => {
    const res = await api.get(
      `${getURL("NAP")}/repositories/by-folder/${folderId}`,
    );
    return res.data;
  };

  return query(["useRepositoryByFolder", folderId], fn, {
    ...options,
    enabled: !!folderId && (options?.enabled ?? true),
  });
};
