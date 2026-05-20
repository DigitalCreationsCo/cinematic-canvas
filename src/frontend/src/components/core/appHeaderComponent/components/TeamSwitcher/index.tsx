import {
  Team,
  useGetTeams,
} from "@/controllers/API/queries/auth/use-get-teams";
import useAuthStore from "@/stores/authStore";

export const TeamSwitcher = () => {
  const { activeTeamId, setActiveTeamId } = useAuthStore();

  const { data: teams, error } = useGetTeams();

  if (error) return <div>Failed to load teams</div>;
  if (!teams) return <div>Loading teams...</div>;

  return (
    <select
      value={activeTeamId || ""}
      onChange={(e) => setActiveTeamId(e.target.value)}
      className="tracking-wide w-60 h-9 ml-2 px-3 rounded-none text-sm focus:ring-none active:ring-none focus:outline-none active:outline-none"
    >
      <option value="">Select a team</option>
      {teams.map((team: Team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
};
