import type { UseMutationResult } from "@tanstack/react-query";
import type { useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";
import type { Team } from "./use-get-teams";

export interface CreateTeamPayload {
  name: string;
  description?: string;
}

export const useAddTeam: useMutationFunctionType<
  undefined,
  CreateTeamPayload
> = (options?) => {
  const { mutate, queryClient } = UseRequestProcessor();

  async function addTeamFn(payload: CreateTeamPayload): Promise<Team> {
    const response = await api.post<Team>(`${getURL("TEAMS")}/`, payload);
    return response.data;
  }

  const mutation: UseMutationResult<Team, Error, CreateTeamPayload> = mutate(
    ["useAddTeam"],
    addTeamFn,
    {
      retry: false,
      ...options,
      onSuccess: (data, variables, context) => {
        // Force refetch of teams list to keep local UI sync'd with remote state
        queryClient.invalidateQueries({ queryKey: ["useGetTeams"] });

        if (options?.onSuccess) {
          options.onSuccess(data, variables, context);
        }
      },
    },
  );

  return mutation;
};
