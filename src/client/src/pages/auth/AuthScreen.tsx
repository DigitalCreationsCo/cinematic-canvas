import React, { useState } from "react";
import { useAuth } from "../../lib/auth-context.js";
import { supabase } from "../../lib/supabase.js";
import { Button } from "#client/components/ui/button.js";
import { Input } from "#client/components/ui/input.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "#client/components/ui/card.js";
import { Loader2, Film } from "lucide-react";
import { Loader } from '#client/components/Loader.js';

export const AuthScreen: React.FC = () => {
  const [step, setStep] = useState<"start" | "email">("start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "start") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col md:items-center md:justify-center p-8">
        <div className="w-full text-center space-y-2">
          <h1 className="text-[4rem] md:text-[6rem] lg:text-[13rem] font-heading mx-auto font-black uppercase leading-[1.1em]">Cinematic Canvas</h1>
          <p className="text-xl text-muted-foreground font-sans">
            Build your world. Tell your stories.
          </p>
          <Button
            size="lg"
            className="place-self-center max-w-md w-full mt-12 text-lg h-14"
            onClick={() => setStep("email")}
          >
            Start
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full border-none shadow-2xl bg-card/50 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-bold">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {mode === "login" ? "Enter your credentials to continue" : "Sign up to start building worlds"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12"
              />
            </div>
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-12" disabled={isLoading}>
              {isLoading ? <Loader /> : null}
              {mode === "login" ? "Sign In" : "Sign Up"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/50 pt-4">
          <Button
            variant="ghost"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-sm text-muted-foreground"
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};