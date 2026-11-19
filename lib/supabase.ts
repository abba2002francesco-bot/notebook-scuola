import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const NOTEBOOK_LINK_HOSTS = ["notebooklm.google.com", "notebooklm.link.google"];

export function isNotebookLmUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      NOTEBOOK_LINK_HOSTS.includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function getPublicImageUrl(path: string) {
  if (!supabase) return "";
  return supabase.storage.from("notebook-images").getPublicUrl(path).data.publicUrl;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}
