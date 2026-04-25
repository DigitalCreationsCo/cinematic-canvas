import React, { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { Button } from "#client/components/ui/button.js";
import { Input } from "#client/components/ui/input.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "#client/components/ui/card.js";
import { Loader } from '#client/components/Loader.js';

interface LandingProps {
  onContinue: () => void;
}

const Landing: React.FC<LandingProps> = React.memo(({ onContinue }) => (
  <div className="min-h-screen text-foreground flex flex-col md:items-center md:justify-center p-8">
    <div className="w-full text-center space-y-2">
      <h1 className="text-[4rem] md:text-[6rem] lg:text-[13rem] font-heading antialiased tracking-wide mx-auto font-black uppercase leading-[1.1em]">
        Cinematic <em>Canvas</em>
      </h1>
      <p className="text-xl text-muted-foreground font-sans">
        Build your world. Tell your stories.
      </p>
      <Button
        size="lg"
        className="place-self-center uppercase font-heading tracking-wide max-w-md w-full mt-12 text-lg h-14"
        onClick={onContinue}
      >
        Start
      </Button>
    </div>
  </div>
));

Landing.displayName = "Landing";

type AuthMode = "login" | "signup";

const preventDefault = (e: React.FormEvent) => e.preventDefault();

export const AuthScreen: React.FC = () => {
  const [step, setStep] = useState<"start" | "email">("start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");

  const handleContinue = useCallback(() => setStep("email"), []);

  const toggleMode = useCallback(
    () => setMode((m) => (m === "login" ? "signup" : "login")),
    [],
  );

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    [],
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
    [],
  );

  const handleAuth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);

      try {
        const { error } =
          mode === "login"
            ? await supabase.auth.signInWithPassword({
              email,
              password,
            })
            : await supabase.auth.signUp({
              email,
              password,
            });

        if (error) throw error;
      } catch (err: any) {
        setError(err.message ?? "An error occurred during authentication.");
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, mode],
  );

  if (step === "start") {
    return <Landing onContinue={handleContinue} />;
  }

  return (
    <div className="min-h-screen text-foreground flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full border-none shadow-2xl backdrop-blur">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-heading font-bold">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {mode === "login" ? "Enter your credentials to continue" : "Sign up to start building worlds"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div role="form" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={handleEmailChange}
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={handlePasswordChange}
                required
                className="h-12"
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-none">
                {error}
              </div>
            )}

            <Button
              type="button"
              className="w-full h-12"
              disabled={isLoading}
              onClick={handleAuth}
            >
              {isLoading && <Loader />}
              {mode === "login" ? "Sign In" : "Sign Up"}
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex justify-center border-t border-border/50 pt-4">
          <Button
            variant="ghost"
            onClick={toggleMode}
            className="text-sm text-muted-foreground"
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};