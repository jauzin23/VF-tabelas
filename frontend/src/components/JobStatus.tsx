"use client";

import type { JobData } from "../lib/types";

const NAVY = "#0d2a5e";
const BORDER = "#dce3ef";
const T1 = "#0d1f3c";
const T2 = "#4a5a75";
const T3 = "#9aa5bc";
const WHITE = "#ffffff";
const G_BG = "#eaf4ee";
const G_BD = "#b5d9c2";
const G_TX = "#1a6b38";
const R_BG = "#faeaea";
const R_BD = "#f0b0b0";
const R_TX = "#922020";

interface Props {
  job: JobData;
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      style={{
        height: 4,
        background: BORDER,
        borderRadius: 4,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div>
      <div
        style={{ fontSize: 10, color: T3, fontWeight: 600, marginBottom: 2 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: color ?? T1 }}>
        {value}
        {sub && (
          <span
            style={{ fontSize: 11, fontWeight: 600, color: T3, marginLeft: 4 }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export function JobStatus({ job }: Props) {
  const p = job.progress;
  const isDone = job.status === "completed";
  const ocrInconsistent = p.imagesOcrProcessed > p.imagesDownloaded;
  const tableInconsistent =
    (p.imagesTableProcessed ?? 0) > (p.imagesPassedOcr ?? 0);

  return (
    <div
      style={{
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      {/* URL */}
      <div
        style={{
          fontSize: 11,
          color: T3,
          fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 14,
        }}
        title={job.targetUrl}
      >
        {job.targetUrl}
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: "12px 16px",
        }}
      >
        <Stat
          label="Páginas descobertas"
          value={p.pagesDiscovered}
          color={NAVY}
        />
        <Stat label="Páginas processadas" value={p.pagesProcessed} />
        <Stat label="Imagens encontradas" value={p.imagesFound} />
        <Stat label="Descarregadas" value={p.imagesDownloaded} />
        <Stat label="OCR processadas" value={p.imagesOcrProcessed} />
        <Stat
          label="Passaram OCR"
          value={p.imagesPassedOcr}
          color={p.imagesPassedOcr > 0 ? G_TX : T1}
        />
        {p.imagesTableProcessed != null && (
          <Stat label="Análise tabela" value={p.imagesTableProcessed} />
        )}
        {p.tablesDetected != null && (
          <Stat
            label="Tabelas detetadas"
            value={p.tablesDetected}
            color={p.tablesDetected > 0 ? G_TX : T1}
          />
        )}
      </div>

      {/* Progress bar for crawl phase */}
      {!isDone && p.pagesDiscovered > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: T3,
              marginBottom: 2,
            }}
          >
            <span>Crawl</span>
            <span>
              {p.pagesProcessed}/{p.pagesDiscovered}
            </span>
          </div>
          <ProgressBar
            value={p.pagesProcessed}
            max={p.pagesDiscovered}
            color={NAVY}
          />
        </div>
      )}

      {/* OCR progress */}
      {!isDone && p.imagesDownloaded > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: T3,
              marginBottom: 2,
            }}
          >
            <span>OCR</span>
            <span>
              {p.imagesOcrProcessed}/{p.imagesDownloaded}
            </span>
          </div>
          <ProgressBar
            value={p.imagesOcrProcessed}
            max={p.imagesDownloaded}
            color={G_TX}
          />
        </div>
      )}

      {!isDone && (
        <div style={{ marginTop: 10, fontSize: 11, color: T2 }}>
          Fase atual:{" "}
          {p.imagesFound === 0
            ? "a descobrir imagens"
            : p.imagesDownloaded < p.imagesFound
              ? "a validar URLs e metadados"
              : p.imagesOcrProcessed < p.imagesDownloaded
                ? "a executar OCR"
                : (p.imagesTableProcessed ?? 0) < (p.imagesPassedOcr ?? 0)
                  ? "a verificar tabelas com IA"
                  : "a finalizar"}
        </div>
      )}

      {(ocrInconsistent || tableInconsistent) && (
        <div
          style={{
            marginTop: 12,
            background: R_BG,
            border: `1px solid ${R_BD}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: R_TX,
          }}
        >
          Inconsistência de contadores detetada. Atualiza a página para confirmar
          o estado mais recente.
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div
          style={{
            marginTop: 12,
            background: R_BG,
            border: `1px solid ${R_BD}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: R_TX,
          }}
        >
          {job.error}
        </div>
      )}

      {/* Duration */}
      {isDone && job.finishedAt && job.startedAt && (
        <div style={{ marginTop: 12, fontSize: 11, color: T3 }}>
          Duração:{" "}
          {Math.round(
            (new Date(job.finishedAt).getTime() -
              new Date(job.startedAt).getTime()) /
              1000,
          )}
          s
        </div>
      )}
    </div>
  );
}
