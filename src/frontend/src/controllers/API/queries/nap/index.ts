export { useCreateLoreProject } from "./useCreateLoreProject";
export { useEnsureRepositoryCloned } from "./useEnsureRepositoryCloned";
export { useRecentRepositories } from "./useRecentRepositories";
export {
  useRepositoryBranchesRecent,
  useRepositoryBranchesSearch,
} from "./useRepositoryBranches";
export { useRepositorySearch } from "./useRepositorySearch";

import axios from "axios";
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

export interface BranchRead {
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

/**
 * Fetch the NAP repository linked to a folder.
 *
 * Returns `null` when the folder has no linked repository (HTTP 404) —
 * this is an expected state, not an error.
 *
 * Real errors (network, 500, etc.) are logged and propagated so the
 * caller can surface them to the user.
 */
export const useRepositoryByFolder: useQueryFunctionType<
  IRepositoryByFolderParams,
  NapRepositoryRead | null
> = ({ folderId }, options?) => {
  const { query } = UseRequestProcessor();

  const fn = async (): Promise<NapRepositoryRead | null> => {
    try {
      const res = await api.get(
        `${getURL("NAP")}/repositories/by-folder/${folderId}`,
      );
      return res.data ?? null;
    } catch (err) {
      // HTTP 404 means "no repo linked" — return null, don't throw.
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      // Real errors propagate (network, 500, etc.).
      console.error(
        "[useRepositoryByFolder] Failed to fetch repository for folder",
        folderId,
        err,
      );
      throw err;
    }
  };

  // Determine retry behaviour.
  // If the caller explicitly set retry (including `false`), respect that.
  // Otherwise default to: 404 → no retry, other errors → up to 3 attempts.
  const retry =
    options?.retry !== undefined
      ? options.retry
      : (failureCount: number, error: unknown) => {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            return false;
          }
          return failureCount < 3;
        };

  return query(["useRepositoryByFolder", folderId], fn, {
    ...options,
    enabled: !!folderId && (options?.enabled ?? true),
    retry,
  });
};
