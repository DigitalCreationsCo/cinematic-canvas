import { useEffect } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useGetTeams } from "@/controllers/API/queries/teams/use-get-teams";
import CustomLoader from "@/customization/components/custom-loader";
import { CustomNavigate } from "@/customization/components/custom-navigate";
import useAuthStore from "@/stores/authStore";

export const ProtectedTeamRoute = ({
  children,
  requiredRole,
}: {
  children?: React.ReactNode;
  requiredRole?: "owner" | "admin" | "member";
}) => {
  const { data: teams, isLoading, error } = useGetTeams();
  const activeTeamId = useAuthStore((state) => state.activeTeamId);
  const activeTeamRole = useAuthStore((state) => state.activeTeamRole);
  const setActiveTeam = useAuthStore((state) => state.setActiveTeam);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [searchParams] = useSearchParams();
  const location = useLocation();

  const hasTeams = teams && teams.length > 0;
  const activeTeam = hasTeams
    ? teams.find((team) => team.id === activeTeamId)
    : null;
  const isAuthorizedForActiveTeam = !!activeTeam;

  useEffect(() => {
    if (hasTeams && !isAuthorizedForActiveTeam) {
      setActiveTeam(teams[0].id, teams[0].role);
    } else if (activeTeam && activeTeamRole !== activeTeam.role) {
      setActiveTeam(activeTeam.id, activeTeam.role);
    }
  }, [
    hasTeams,
    isAuthorizedForActiveTeam,
    teams,
    setActiveTeam,
    activeTeam,
    activeTeamRole,
  ]);

  // GUARD 1: Fail-safe Authentication Check
  // Ensures the user hasn't lost their session before hitting team logic.
  if (!isAuthenticated) {
    return <CustomNavigate replace to="/login" />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <CustomLoader remSize={30} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-destructive">
          Failed to load teams. Please try again later.
        </p>
      </div>
    );
  }

  // Prevent UI flash or unauthorized downstream API calls while the useEffect corrects the activeTeamId
  if (
    hasTeams &&
    (!isAuthorizedForActiveTeam ||
      (activeTeam && activeTeamRole !== activeTeam.role))
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <CustomLoader remSize={30} />
      </div>
    );
  }

  // GUARD 3: Missing Team / Onboarding Interception
  if (!hasTeams) {
    const isJoin = searchParams.get("join") === "true";
    const token = searchParams.get("token");

    // Route to Join Team if token is present
    if (isJoin && token) {
      if (!location.pathname.includes("/join-team")) {
        return <CustomNavigate replace to={`/join-team?token=${token}`} />;
      }
    }
    // Route to Create Team otherwise
    else if (!location.pathname.includes("/create-team")) {
      return <CustomNavigate replace to="/create-team" />;
    }
  }

  if (
    requiredRole &&
    activeTeamRole !== requiredRole &&
    activeTeamRole !== "owner" &&
    activeTeamRole !== "admin"
  ) {
    // If they don't have the required role (and aren't a team admin), block access
    return <CustomNavigate replace to="/unauthorized" />;
  }

  // If all guards pass, render the workspace
  return children ? <>{children}</> : <Outlet />;
};
