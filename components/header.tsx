"use client";

import Link from "next/link";
import { BookOpen, Plus, UserRound, LogOut, Compass, Library } from "lucide-react";
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
        <nav className="nav-actions" aria-label="Navigazione principale">
          <a className="nav-link" href="/#risultati"><Compass size={15} /> Esplora</a>
          {user ? (
            <>
              <a className="nav-link" href="/?view=miei#risultati"><Library size={15} /> I miei notebook</a>
              <Link className="nav-link profile-nav-link" href="/profilo" title="Impostazioni del profilo">
                <UserRound size={15} /> {displayName || "Il mio profilo"}
              </Link>
              <Link className="button button-primary" href="/carica"><Plus size={16} /> Condividi</Link>
              <button className="button button-secondary" onClick={logout} aria-label="Esci dall'account"><LogOut size={15} /> Esci</button>
            </>
          ) : (
            <>
              <Link className="nav-link" href="/accedi">Accedi</Link>
              <Link className="button button-primary" href="/carica"><Plus size={16} /> Condividi notebook</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
