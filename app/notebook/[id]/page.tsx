import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import NotebookDetailClient from "./client-page";
import type { Notebook } from "@/lib/types";

const siteUrl = "https://notebookscuola.it";

type PageProps = { params: Promise<{ id: string }> };

async function getPublicNotebook(id: string): Promise<Notebook | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.from("notebooks").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", data.user_id)
    .maybeSingle();

  return { ...data, profiles: profile ?? null } as Notebook;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const notebook = await getPublicNotebook(id);
  if (!notebook) {
    return {
      title: "Notebook non disponibile | Notebook Scuola",
      robots: { index: false, follow: false },
    };
  }

  const description = [
    notebook.description,
    notebook.subject,
    notebook.topic,
    "Risorsa di studio condivisa su Notebook Scuola",
  ].filter(Boolean).join(" · ").slice(0, 300);
  const title = `${notebook.title} | Notebook Scuola`;
  const url = `${siteUrl}/notebook/${id}`;

  return {
    title,
    description,
    alternates: { canonical: `/notebook/${id}` },
    openGraph: {
      title,
      description,
      url,
      siteName: "Notebook Scuola",
      locale: "it_IT",
      type: "article",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function NotebookDetailPage({ params }: PageProps) {
  const { id } = await params;
  const notebook = await getPublicNotebook(id);
  return <NotebookDetailClient initialNotebook={notebook} />;
}
