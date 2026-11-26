import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const siteUrl = "https://notebookscuola.it";

// Rigenera la sitemap ogni ora per includere i nuovi notebook pubblicati.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/regole`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/termini`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Se Supabase non è configurato, restituisce comunque le pagine statiche.
  if (!supabaseUrl || !supabaseKey) return staticPages;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("notebooks")
    .select("id, updated_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) return staticPages;

  const notebookPages: MetadataRoute.Sitemap = data.map((notebook) => ({
    url: `${siteUrl}/notebook/${notebook.id}`,
    lastModified: notebook.updated_at
      ? new Date(notebook.updated_at)
      : new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...notebookPages];
}
