import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://notebookscuola.it"),
  title: "Notebook Scuola | NotebookLM, appunti e risorse per studiare",
  description: "Scopri, cerca e condividi notebook di NotebookLM per scuola e università. Risorse di studio organizzate per materia, argomento e livello, condivise dagli studenti.",
  applicationName: "Notebook Scuola",
  verification: { google: "n0_ITN0yN5pxiZa_wx6OIZFULfsrevv--cmPXxsj91Q" },
  openGraph: {
    title: "Notebook Scuola | Risorse di studio condivise",
    description: "Trova e condividi notebook di NotebookLM per studiare meglio: matematica, fisica, storia, lingue e molte altre materie.",
    siteName: "Notebook Scuola",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Notebook Scuola | NotebookLM per studiare",
    description: "Trova e condividi risorse di studio organizzate per materia e argomento.",
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Notebook Scuola",
  alternateName: "NotebookScuola",
  url: "https://notebookscuola.it",
  description: "Scopri, cerca e condividi notebook di NotebookLM per scuola e università.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }}
        />
        <AuthProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
