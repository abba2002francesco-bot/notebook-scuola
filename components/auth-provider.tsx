"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthValue = { user: User | null; loading: boolean; displayName: string };
const AuthContext = createContext<AuthValue>({ user: null, loading: true, displayName: "" });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const current = data.session?.user ?? null;
      setUser(current);
      setDisplayName(String(current?.user_metadata?.display_name ?? current?.email?.split("@")[0] ?? ""));
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user ?? null;
      setUser(current);
      setDisplayName(String(current?.user_metadata?.display_name ?? current?.email?.split("@")[0] ?? ""));
      setLoading(false);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading, displayName }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
