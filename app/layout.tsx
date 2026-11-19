import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Notebook Scuola — Trova, condividi, studia",
  description: "Una raccolta indipendente di notebook NotebookLM condivisi dagli studenti. Cerca per materia, argomento e livello di studio.",
  applicationName: "Notebook Scuola",
    verification: {
    google: "n0_ITN0yN5pxiZa_wx6OIZFULfsrevv--cmPXxsj91Q",
  },
  openGraph: {
    title: "Notebook Scuola",
    description: "Scopri notebook di studio condivisi dalla community.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
