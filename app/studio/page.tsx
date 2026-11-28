import type { Metadata } from "next";
import StudioClient from "./studio-client";

export const metadata: Metadata = {
  title: "Il mio spazio di studio | Notebook Scuola",
  description: "Crea e organizza i tuoi notebook personali di studio.",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return <StudioClient />;
}
