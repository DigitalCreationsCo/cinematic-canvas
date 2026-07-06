import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";
import CustomLoader from "@/customization/components/custom-loader";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";

export default function JoinTeamPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useCustomNavigate();
  const queryClient = useQueryClient();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setActiveTeam = useAuthStore((state) => state.setActiveTeam);
  const setAvailableTeams = useAuthStore((state) => state.setAvailableTeams);

  // Prevent strict-mode double firing
  const isProcessing = useRef(false);

  useEffect(() => {
    if (!token) {
      navigate("/create-team", { replace: true });
      return;
    }

    const joinTeam = async () => {
      if (isProcessing.current) return;
      isProcessing.current = true;

      try {
        // NOTE: Ensure your FastAPI backend has a corresponding POST /teams/join endpoint
        const response = await api.post(`${getURL("TEAMS")}/join`, { token });

        // Set the active team and available teams from the response
        const teamData = response.data;
        setActiveTeam(teamData.id, teamData.role);
        setAvailableTeams([teamData]);

        setSuccessData({ title: "Successfully joined team!" });
        navigate("/", { replace: true });
      } catch (err: any) {
        setErrorData({
          title: "Invalid or expired invite",
          list: [err?.response?.data?.detail || "Could not join the team."],
        });
        navigate("/create-team", { replace: true });
      }
    };

    joinTeam();
  }, [
    token,
    navigate,
    setSuccessData,
    setErrorData,
    setActiveTeam,
    setAvailableTeams,
  ]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
      <CustomLoader remSize={40} />
      <h3 className="text-lg font-medium text-muted-foreground">
        Validating your invite...
      </h3>
    </div>
  );
}
