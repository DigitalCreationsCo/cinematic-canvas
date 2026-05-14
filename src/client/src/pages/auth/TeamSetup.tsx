import React, { useState } from "react";
import { useAuth } from "../../lib/auth-context.js";
import { Button } from "#client/components/ui/button.js";
import { Input } from "#client/components/ui/input.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#client/components/ui/card.js";
import { api } from "../../lib/api.js";
import { Loader } from '#client/components/Loader.js';

interface TeamSetupProps {
  onComplete?: () => void;
}

export const TeamSetup: React.FC<TeamSetupProps> = ({ onComplete }) => {
  const [teamName, setTeamName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setActiveTeamId } = useAuth();

  const handleJoinOrCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const team = await api.teams.joinOrCreate.mutate({
        name: teamName.trim(),
      });

      setActiveTeamId(team.id);
      onComplete?.();
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-foreground flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full card-cinematic-glass">
        <CardHeader className="text-center pb-6">
          <CardDescription className="text-base text-primary mt-2">
            Enter a new or existing team name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinOrCreateTeam} className="space-y-6">
            <div className="space-y-2">
              <Input
                placeholder="My Creative Studio"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                className="h-14 text-base"
                autoFocus
              />
            </div>
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-none">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-14 text-lg" disabled={isLoading || !teamName.trim()}>
              {isLoading ? <Loader /> : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};