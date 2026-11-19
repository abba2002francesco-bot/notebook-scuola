import type { MetadataRoute } from "next";

const siteUrl = "https://free-notebooks.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/accedi", "/registrati", "/profilo", "/carica", "/notebook/*/modifica"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
