import React, { useState } from "react";
import { useAuth } from "../../lib/auth-context.js";
import { useStore } from "../../lib/store.js";
import { Button } from "#/components/ui/button.js";
import { Input } from "#/components/ui/input.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "#/components/ui/card.js";
import { Loader2, Users } from "lucide-react";
import { apiFetch } from "../../lib/api.js";

interface TeamSetupProps {
  onComplete?: () => void;
}

export const TeamSetup: React.FC<TeamSetupProps> = ({ onComplete }) => {
  const [teamName, setTeamName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setActiveTeamId } = useStore();

  const handleJoinOrCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Calls our new backend endpoint to join or create a team
      const response = await apiFetch("/teams/join-or-create", {
        method: "POST",
        body: JSON.stringify({ name: teamName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to join or create team.");
      }

      const data = await response.json();
      setActiveTeamId(data.teamId);
      onComplete?.();
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full border-none shadow-2xl bg-card/50 backdrop-blur">
        <CardHeader className="text-center pb-6">
          <div className="flex justify-center mb-6">
            <div className="bg-primary/10 p-4 rounded-full">
              <Users className="w-12 h-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">
            Team Setup
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Enter a new or existing team name to collaborate on worlds and projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinOrCreateTeam} className="space-y-6">
            <div className="space-y-2">
              <Input
                placeholder="e.g. Acme Creative Studio"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                className="h-14 text-lg"
                autoFocus
              />
            </div>
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-14 text-lg" disabled={isLoading || !teamName.trim()}>
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};