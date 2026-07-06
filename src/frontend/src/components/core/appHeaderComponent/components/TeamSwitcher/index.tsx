import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Team,
  useGetTeams,
} from "@/controllers/API/queries/teams/use-get-teams";
import useAuthStore from "@/stores/authStore";

export const TeamSwitcher = () => {
  const { activeTeamId, setActiveTeam, availableTeams } = useAuthStore();

  const { data: teams, error } = useGetTeams(
    // Disable API call if we have teams in store (e.g., from creation response)
    availableTeams ? { enabled: false } : undefined,
  );

  // Use store teams if available, otherwise use API response
  const teamsData = availableTeams || teams;

  if (error)
    return <div className="text-sm text-destructive">Failed to load teams</div>;
  if (!teamsData)
    return (
      <div className="text-sm text-muted-foreground">Loading teams...</div>
    );

  const handleTeamChange = (teamId: string) => {
    const team = teamsData.find((t) => t.id === teamId);
    if (team) {
      setActiveTeam(team.id, team.role);
    }
  };

  return (
    <Select value={activeTeamId || ""} onValueChange={handleTeamChange}>
      <SelectTrigger className="w-60 h-9 ml-2">
        <SelectValue placeholder="Select a team" />
      </SelectTrigger>
      <SelectContent>
        {teamsData.map((team: Team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
