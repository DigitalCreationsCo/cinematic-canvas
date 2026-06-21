import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import type { UploadMediaResponse } from "@/types/nap";
import { api } from "../../api";
import { UseRequestProcessor } from "../../services/request-processor";

interface IUploadMediaParams {
  file: File;
}

export const usePostUploadMedia: useMutationFunctionType<
  undefined,
  IUploadMediaParams,
  UploadMediaResponse
> = (options?) => {
  const { mutate } = UseRequestProcessor();

  const uploadMediaFn = async (
    payload: IUploadMediaParams,
  ): Promise<UploadMediaResponse> => {
    const formData = new FormData();
    formData.append("file", payload.file);

    const response = await api.post<UploadMediaResponse>(
      "/api/v1/nap/media/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return response.data;
  };

  const mutation: UseMutationResult<
    UploadMediaResponse,
    unknown,
    IUploadMediaParams
  > = mutate(["usePostUploadMedia"], uploadMediaFn, {
    ...options,
  });

  return mutation;
};
