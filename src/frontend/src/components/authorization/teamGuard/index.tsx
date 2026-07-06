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
  const availableTeams = useAuthStore((state) => state.availableTeams);
  const {
    data: teams,
    isLoading,
    error,
  } = useGetTeams(
    // Disable API call if we have teams in store (e.g., from creation response)
    availableTeams ? { enabled: false } : undefined,
  );
  const activeTeamId = useAuthStore((state) => state.activeTeamId);
  const activeTeamRole = useAuthStore((state) => state.activeTeamRole);
  const setActiveTeam = useAuthStore((state) => state.setActiveTeam);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Use store teams if available, otherwise use API response
  const teamsData = availableTeams || teams;
  const hasTeams = teamsData && teamsData.length > 0;
  const activeTeam = hasTeams
    ? teamsData.find((team) => team.id === activeTeamId)
    : null;
  const isAuthorizedForActiveTeam = !!activeTeam;

  useEffect(() => {
    if (hasTeams && !isAuthorizedForActiveTeam) {
      setActiveTeam(teamsData[0].id, teamsData[0].role);
    } else if (activeTeam && activeTeamRole !== activeTeam.role) {
      setActiveTeam(activeTeam.id, activeTeam.role);
    }
  }, [
    hasTeams,
    isAuthorizedForActiveTeam,
    teamsData,
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
    // If we have teams in the store (from creation/join response), use those instead of redirecting
    if (availableTeams && availableTeams.length > 0) {
      // Continue with store data, ignore the error
    } else {
      // If we get a 403/401 error but the user is authenticated, treat it as "no teams"
      // This can happen when the user is authenticated but has no team membership yet
      const axiosError = error as any;
      const isAuthError =
        axiosError?.response?.status === 403 ||
        axiosError?.response?.status === 401;

      if (isAuthError && isAuthenticated) {
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
        // If already on create/join team page, render the page
        return children ? <>{children}</> : <Outlet />;
      }

      return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <p className="text-destructive">
            Failed to load teams. Please try again later.
          </p>
        </div>
      );
    }
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
