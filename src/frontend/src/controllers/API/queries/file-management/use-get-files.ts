import { keepPreviousData, type UseQueryOptions } from "@tanstack/react-query";
import type { FileType } from "@/types/file_management";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

export type FilesResponse = FileType[];

interface GetFilesParams {
  folderId?: string;
}

export const useGetFilesV2 = (
  params?: GetFilesParams,
  config?: Omit<UseQueryOptions, "queryFn" | "queryKey">,
) => {
  const { query } = UseRequestProcessor();

  const folderId = params?.folderId;

  const getFilesFn = async () => {
    const response = await api.get<FilesResponse>(
      `${getURL("FILE_MANAGEMENT", {}, true)}`,
      {
        params: folderId ? { folder_id: folderId } : undefined,
      },
    );
    return response["data"] ?? [];
  };

  const queryResult = query(["useGetFilesV2", folderId ?? "all"], getFilesFn, {
    placeholderData: keepPreviousData,
    enabled: (folderId !== undefined || !params) && (config?.enabled ?? true),
    ...config,
  });

  return queryResult;
};
