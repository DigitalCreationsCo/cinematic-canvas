import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";
import { Loader2 } from "lucide-react";
import { useProjectStore } from "../store/useProjectStore.js";
import { useAssetStore } from "../store/useAssetStore.js";
import { usePipelineStore } from "../store/usePipelineStore.js";
import { Loader } from '#client/components/Loader.js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  activeTeamId: string | null;
  setActiveTeamId: (id: string | null) => void;
  signOut: () => Promise<void>;
}

export let getActiveTeamId = () => null as string | null;

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  activeTeamId: null,
  setActiveTeamId: () => { },
  signOut: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTeamId, _setActiveTeamId] = useState<string | null>(null);

  const setActiveTeamId = (id: string | null) => {
    _setActiveTeamId(id);
    getActiveTeamId = () => id;
  };

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for changes on auth state (in, out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    useProjectStore.getState().clearSession();
    useAssetStore.getState().clearAllAssets();
    usePipelineStore.getState().clearAll();
    setActiveTeamId(null);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, session, isLoading, activeTeamId, setActiveTeamId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
