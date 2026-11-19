import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div><strong>notebookscuola</strong> · Una community indipendente per condividere risorse di studio.</div>
        <div><Link href="/regole">Regole della community</Link> · <span>Non affiliato a Google o NotebookLM.</span></div>
      </div>
    </footer>
  );
}
