import type { Metadata } from "next";
import HomeClient from "./home-client";

export const metadata: Metadata = {
  title: "Notebook Scuola | NotebookLM per studiare e condividere risorse",
  description: "Esplora una raccolta gratuita di notebook NotebookLM per scuola e università. Cerca risorse per materia, argomento e livello oppure condividi i tuoi materiali di studio.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Notebook Scuola | NotebookLM per studiare",
    description: "Esplora e condividi risorse di studio NotebookLM organizzate per materia, argomento e livello.",
    url: "https://notebookscuola.it",
    siteName: "Notebook Scuola",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Notebook Scuola | NotebookLM per studiare",
    description: "Esplora e condividi risorse di studio NotebookLM organizzate per materia, argomento e livello.",
  },
};

export default function HomePage() {
  return <HomeClient />;
}
