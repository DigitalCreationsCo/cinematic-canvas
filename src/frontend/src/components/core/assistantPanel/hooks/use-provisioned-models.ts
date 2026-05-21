import { useMemo } from "react";
import { useGetTenantModels } from "@/controllers/API/queries/models/use-get-tenant-models";

export interface MappedProviderModel {
  model_name: string;
  displayName: string;
  description: string;
}

export interface MappedProviderShape {
  provider: string;
  icon: string;
  models: MappedProviderModel[];
}

interface UseProvisionedModelsReturn {
  hasEnabledModels: boolean;
  filteredProviders: MappedProviderShape[];
  isLoading: boolean;
  fetchError: Error | null;
}

export function useProvisionedModels(): UseProvisionedModelsReturn {
  const {
    data: tenantModelsData,
    isLoading: isModelDataLoading,
    error: fetchError,
  } = useGetTenantModels();

  const filteredProviders = useMemo(() => {
    if (!tenantModelsData?.models) return [];

    const agenticModels = tenantModelsData.models.filter(
      (m) => m.supportsAgenticWorkflow,
    );

    if (agenticModels.length === 0) return [];

    return [
      {
        provider: "Platform",
        icon: "Server",
        models: agenticModels.map((m) => ({
          model_name: m.identifier,
          displayName: m.displayName,
          description: m.description,
        })),
      },
    ];
  }, [tenantModelsData]);

  return {
    hasEnabledModels: filteredProviders.length > 0,
    filteredProviders,
    isLoading: isModelDataLoading,
    fetchError,
  };
}
