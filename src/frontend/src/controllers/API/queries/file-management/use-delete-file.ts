import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

interface IDeleteFile {
  id: string;
  folderId?: string | null;
}

export const useDeleteFileV2: useMutationFunctionType<IDeleteFile, void> = (
  params,
  options?,
) => {
  const { mutate, queryClient } = UseRequestProcessor();

  const deleteFileFn = async (): Promise<any> => {
    const response = await api.delete<any>(
      `${getURL("FILE_MANAGEMENT", { id: params.id }, true)}`,
    );

    return response.data;
  };

  const mutation: UseMutationResult<any, any, void> = mutate(
    ["useDeleteFileV2"],
    deleteFileFn,
    {
      onSettled: (data, error, variables, context) => {
        queryClient.invalidateQueries({
          queryKey: ["useGetFilesV2", params.folderId ?? "all"],
        });
        options?.onSettled?.(data, error, variables, context);
      },
      ...options,
    },
  );

  return mutation;
};
