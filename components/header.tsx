"use client";

import Link from "next/link";
import { BookOpen, Plus, UserRound, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

export function Header() {
  const { user, displayName } = useAuth();
  async function logout() {
    await supabase?.auth.signOut();
    window.location.href = "/";
  }
  return (
    <header className="site-header">
      <div className="container nav">
        <Link href="/" className="brand" aria-label="Notebook Scuola, homepage">
          <span className="brand-mark"><BookOpen size={19} strokeWidth={2.3} /></span>
          <span>notebook<span style={{ color: "var(--accent)" }}>scuola</span></span>
        </Link>
        <nav className="nav-actions">
          <Link className="nav-link" href="/">Esplora</Link>
          {user ? (
            <>
              <Link className="nav-link" href="/?view=miei">I miei notebook</Link>
              <span className="nav-link" title={user.email ?? "Account"}><UserRound size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />{displayName || "Account"}</span>
              <button className="button button-secondary" onClick={logout}><LogOut size={15} />Esci</button>
            </>
          ) : (
            <>
              <Link className="nav-link" href="/accedi">Accedi</Link>
              <Link className="button button-primary" href="/carica"><Plus size={16} />Condividi notebook</Link>
            </>
          )}
          {user && <Link className="button button-primary" href="/carica"><Plus size={16} />Condividi</Link>}
        </nav>
      </div>
    </header>
  );
}
