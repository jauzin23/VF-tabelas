import type { JobData } from "../lib/types";

interface Props {
  job: JobData;
}

export function JobStatus({ job }: Props) {
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Estado do job: {job.status}</h2>
      <p style={{ margin: "6px 0" }}>Alvo: {job.targetUrl}</p>
      <p style={{ margin: "6px 0" }}>Páginas descobertas: {job.progress.pagesDiscovered}</p>
      <p style={{ margin: "6px 0" }}>Páginas processadas: {job.progress.pagesProcessed}</p>
      <p style={{ margin: "6px 0" }}>Imagens encontradas (não SVG): {job.progress.imagesFound}</p>
      <p style={{ margin: "6px 0" }}>Imagens descarregadas: {job.progress.imagesDownloaded}</p>
      <p style={{ margin: "6px 0" }}>
        OCR processadas: {job.progress.imagesOcrProcessed} (passaram: {job.progress.imagesPassedOcr})
      </p>
      {job.error ? <p style={{ color: "#b91c1c" }}>Erro: {job.error}</p> : null}
    </section>
  );
}
