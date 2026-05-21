import { UseQueryResult } from "@tanstack/react-query";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import { UseRequestProcessor } from "@/controllers/API/services/request-processor";

export interface TenantModelCapability {
  identifier: string;
  displayName: string;
  description: string;
  supportsAgenticWorkflow: boolean;
  maxContextTokens: number;
}

export interface TenantModelsResponsePayload {
  tenantId: string;
  tier: string;
  models: TenantModelCapability[];
}

const TENANT_MODELS_QUERY_KEY = ["tenant", "provisioned-models"] as const;

export function useGetTenantModels(): UseQueryResult<
  TenantModelsResponsePayload,
  Error
> {
  console.trace("[useGetTenantModels] Hook execution initiated.");

  const { query } = UseRequestProcessor();

  const fetchTenantProvisionedModels =
    async (): Promise<TenantModelsResponsePayload> => {
      console.info(
        "[fetchTenantProvisionedModels] Initiating network request to retrieve tenant tier capabilities.",
      );

      try {
        const response = await api.get<TenantModelsResponsePayload>(
          `${getURL("MODELS")}/provisioned_models`,
        );

        if (!response.data || !Array.isArray(response.data.models)) {
          console.error(
            "[fetchTenantProvisionedModels] Invalid payload structure returned from BFF.",
            response.data,
          );

          throw new Error(
            "Malformed response: Expected a 'models' array in the tenant configuration payload.",
          );
        }

        console.debug(
          `[fetchTenantProvisionedModels] Successfully retrieved ${response.data.models.length} provisioned models for tenant tier: ${response.data.tier}`,
        );

        return response.data;
      } catch (networkOrSystemError) {
        console.error(
          "[fetchTenantProvisionedModels] System exception during tenant model resolution.",
          networkOrSystemError,
        );

        throw networkOrSystemError;
      }
    };

  return query(TENANT_MODELS_QUERY_KEY, fetchTenantProvisionedModels, {
    // Stale time prevents aggressive refetching of static tier configurations during rapid UI navigation
    // across the workspace.
    staleTime: 1000 * 60 * 5, // 5 minutes

    retry: (failureCount, error) => {
      // Do not retry on 401/403 authorization failures; fail fast and surface the error.
      // Assuming the API utility attaches a status code to the error object.
      // biome-ignore lint/suspicious/noExplicitAny: error object structure is dynamic from API
      const httpStatus = (error as any)?.response?.status;

      if (httpStatus === 401 || httpStatus === 403) {
        console.warn(
          `[useGetTenantModels] Authentication/Authorization failure (${httpStatus}). Bypassing retry logic.`,
        );

        return false;
      }

      const shouldRetry = failureCount < 3;

      if (shouldRetry) {
        console.info(
          `[useGetTenantModels] Network transient failure. Initiating retry attempt ${failureCount + 1} of 3.`,
        );
      } else {
        console.error(
          "[useGetTenantModels] Exhausted all retry attempts for tenant capabilities.",
        );
      }

      return shouldRetry;
    },
  }) as UseQueryResult<TenantModelsResponsePayload, Error>;
}
