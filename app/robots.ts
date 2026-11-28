import type { MetadataRoute } from "next";

const siteUrl = "https://notebookscuola.it";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/accedi", "/registrati", "/profilo", "/carica", "/admin", "/consenso-genitore", "/studio", "/notebook/*/modifica"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
