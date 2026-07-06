import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAddTeam } from "@/controllers/API/queries/teams/use-post-add-team";
import CustomLoader from "@/customization/components/custom-loader";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";

export default function CreateTeamPage() {
  const navigate = useCustomNavigate();
  const [teamName, setTeamName] = useState("");
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setActiveTeam = useAuthStore((state) => state.setActiveTeam);
  const setAvailableTeams = useAuthStore((state) => state.setAvailableTeams);

  const { mutate: addTeam, isPending } = useAddTeam({
    onSuccess: (data) => {
      setSuccessData({ title: "Workspace created successfully!" });

      // Set the active team immediately from the response
      setActiveTeam(data.id, data.role);

      // Manually set available teams with the new team to avoid refetching on onboarding page
      setAvailableTeams([data]);

      // Navigate after team is set
      navigate("/");
    },
    onError: (err: any) => {
      setErrorData({
        title: "Error creating team",
        list: [err?.response?.data?.detail || "An unexpected error occurred."],
      });
    },
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    // Using the CreateTeamPayload structure from your API definitions
    addTeam({ name: teamName });
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <h2 className="mb-2 text-2xl font-bold tracking-tight">
          Welcome to Portals
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          To get started, create a team workspace.
        </p>

        <form onSubmit={handleCreateTeam} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="teamName" className="text-sm font-medium">
              Team Name
            </label>
            <Input
              id="teamName"
              placeholder="e.g. Cinematic Studio Alpha"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !teamName.trim()}
            className="mt-2 w-full"
          >
            {isPending ? <CustomLoader remSize={20} /> : "Create Team"}
          </Button>
        </form>
      </div>
    </div>
  );
}
