"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { UrlForm } from "../components/UrlForm";
import { JobStatus } from "../components/JobStatus";
import { ResultsGrid } from "../components/ResultsGrid";
import { ModelTestUploader } from "../components/ModelTestUploader";
import { createJob, getJob } from "../lib/api";
import type { JobData } from "../lib/types";

// ─── Design tokens (shared with QA runner) ────────────────────────────────────
const NAVY = "#0d2a5e";
const NAVY_50 = "#e8eef7";
const NAVY_100 = "#c5d4ea";
const BG = "#f4f6fb";
const WHITE = "#ffffff";
const BORDER = "#dce3ef";
const T1 = "#0d1f3c";
const T2 = "#4a5a75";
const T3 = "#9aa5bc";
const R_BG = "#faeaea";
const R_BD = "#f0b0b0";
const R_TX = "#922020";
const G_BG = "#eaf4ee";
const G_BD = "#b5d9c2";
const G_TX = "#1a6b38";
const Y_BG = "#fffbea";
const Y_BD = "#f5d97a";
const Y_TX = "#7a5a00";

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconSpinner({
  size = 14,
  color = NAVY,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.2"
      />
      <path
        d="M7 1.5A5.5 5.5 0 0112.5 7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChevron({ open, size = 10 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.2s",
        flexShrink: 0,
      }}
    >
      <path
        d="M3 1.5l4 3.5-4 3.5"
        stroke={NAVY}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSearch({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <circle
        cx="5.5"
        cy="5.5"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9.5 9.5l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconImage({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <rect
        x="1"
        y="2"
        width="11"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="4.5" cy="5" r="1" fill="currentColor" />
      <path
        d="M1 9l3-3 2.5 2.5L9 6l3 3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTable({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <rect
        x="1"
        y="1"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M1 4.5h11M5 4.5v7.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCheck({
  size = 14,
  color = G_TX,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke={color} strokeWidth="1.4" />
      <path
        d="M4 7l2.2 2.2L10 5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconX({ size = 14, color = R_TX }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke={color} strokeWidth="1.4" />
      <path
        d="M4.5 4.5l5 5M9.5 4.5l-5 5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClock({
  size = 11,
  color = T3,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.3" />
      <path
        d="M6 3.5V6l1.8 1.8"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Step header (same pattern as QA runner) ──────────────────────────────────
function Step({
  n,
  title,
  sub,
}: {
  n: string | number;
  title: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        marginBottom: 20,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: WHITE,
          background: NAVY,
          borderRadius: "50%",
          width: 22,
          height: 22,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: T1, margin: 0 }}>
        {title}
      </h2>
      {sub && <span style={{ fontSize: 12, color: T3 }}>{sub}</span>}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const config: Record<
    string,
    { bg: string; bd: string; tx: string; label: string }
  > = {
    queued: { bg: NAVY_50, bd: NAVY_100, tx: NAVY, label: "Em fila…" },
    running: { bg: NAVY_50, bd: NAVY_100, tx: NAVY, label: "A processar…" },
    completed: { bg: G_BG, bd: G_BD, tx: G_TX, label: "Concluído" },
    failed: { bg: R_BG, bd: R_BD, tx: R_TX, label: "Erro" },
    partial: { bg: Y_BG, bd: Y_BD, tx: Y_TX, label: "Parcial" },
  };
  const st = config[status] ?? config.queued;
  const isRunning = status === "running" || status === "queued";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: st.bg,
        border: `1px solid ${st.bd}`,
        color: st.tx,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.07em",
        padding: "3px 10px",
        borderRadius: 50,
        whiteSpace: "nowrap",
      }}
    >
      {isRunning && <IconSpinner size={11} color={st.tx} />}
      {status === "completed" && <IconCheck size={11} color={G_TX} />}
      {status === "failed" && <IconX size={11} color={R_TX} />}
      {st.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "18px 20px",
      }}
    >
      <div
        style={{ fontSize: 11, color: T3, fontWeight: 600, marginBottom: 8 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Job accordion ────────────────────────────────────────────────────────────
function JobAccordion({
  job,
  open,
  onToggle,
}: {
  job: JobData;
  open: boolean;
  onToggle: () => void;
}) {
  const isDone = job.status === "completed";
  const isError = job.status === "failed";

  const borderColor = isDone
    ? G_BD
    : isError
      ? R_BD
      : job.status === "running"
        ? NAVY_100
        : BORDER;

  return (
    <div
      style={{
        background: WHITE,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 8,
        transition: "border-color 0.3s",
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          cursor: "pointer",
          background: open ? BG : WHITE,
          transition: "background 0.15s",
        }}
      >
        <IconChevron open={open} />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: T1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.targetUrl}
        </span>
        <StatusPill status={job.status} />
        {isDone && job.durationMs != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: NAVY_50,
              border: `1px solid ${NAVY_100}`,
              color: T2,
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 50,
              whiteSpace: "nowrap",
              fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
            }}
          >
            <IconClock size={10} color={T2} />
            {Math.round(job.durationMs / 1000)}s
          </span>
        )}
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop: `1px solid ${BORDER}`, background: BG }}>
          <div style={{ padding: "16px 18px 20px" }}>
            <JobStatus job={job} />
            <ResultsGrid job={job} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [jobOpen, setJobOpen] = useState(true);

  const {
    data: job,
    mutate,
    isLoading,
  } = useSWR<JobData>(activeJobId ?? null, getJob, {
    refreshInterval: (latest) => {
      if (!latest) return 0;
      if (sseConnected) return 0;
      return latest.status === "running" || latest.status === "queued"
        ? 2000
        : 0;
    },
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 1500,
  });

  useEffect(() => {
    if (!activeJobId) return;
    const source = new EventSource(`/api/jobs/${activeJobId}/events`);
    setSseConnected(false);

    source.addEventListener("job", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as JobData;
        mutate(parsed, false);
      } catch {
        // ignore malformed messages
      }
    });
    source.addEventListener("open", () => setSseConnected(true));
    source.addEventListener("error", () => setSseConnected(false));

    return () => {
      source.close();
      setSseConnected(false);
    };
  }, [activeJobId, mutate]);

  const handleCreateJob = async (url: string) => {
    setRequestError(null);
    setJobOpen(true);
    try {
      const created = await createJob(url);
      setActiveJobId(created.id);
      await mutate(created, false);
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Erro ao iniciar tarefa",
      );
    }
  };

  const isDone = job?.status === "completed";
  const isRunning = job?.status === "running" || job?.status === "queued";

  return (
    <div
      style={{
        fontFamily: "'Montserrat', sans-serif",
        background: BG,
        minHeight: "100vh",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${BG}; }
        input, textarea, select, button { font-family: 'Montserrat', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
        .sec { padding: 36px 48px; border-bottom: 1px solid ${BORDER}; background: ${WHITE}; }
        .sec-alt { background: ${BG}; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: "30px 48px 0", background: WHITE }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: T1,
              letterSpacing: "-0.5px",
            }}
          >
            Detetor de Imagens
          </h1>
          {/* feature badges */}
        </div>
        <p
          style={{
            fontSize: 13,
            color: T2,
            paddingBottom: 28,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          Introduza um URL para analisar a página e detetar imagens que
          contenham tabelas.
        </p>
      </div>

      {/* ── Step 1 — URL input ── */}
      <div className="sec">
        <Step n="1" title="Endereço" sub="URL da página a analisar" />

        <UrlForm onSubmit={handleCreateJob} disabled={isLoading || isRunning} />

        {requestError && (
          <div
            style={{
              marginTop: 12,
              background: R_BG,
              border: `1px solid ${R_BD}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12,
              color: R_TX,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <IconX size={13} color={R_TX} />
            {requestError}
          </div>
        )}
      </div>

      {/* ── Model test (single image) ── */}
      <div className="sec">
        <Step
          n="1.5"
          title="Testar modelo"
          sub="Upload de uma imagem (apenas ONNX)"
        />
        <ModelTestUploader />
      </div>

      {/* ── Step 2 — Live results ── */}
      {job && (
        <div className="sec sec-alt">
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 24,
            }}
          >
            {isRunning ? (
              <>
                <IconSpinner size={16} color={NAVY} />
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: T1,
                    margin: 0,
                  }}
                >
                  A analisar página…
                </h2>
              </>
            ) : (
              <Step n="2" title="Resultados" />
            )}
            {isDone && job.createdAt && (
              <span style={{ fontSize: 12, color: T3, marginLeft: "auto" }}>
                {new Date(job.createdAt).toLocaleString("pt-PT")}
              </span>
            )}
          </div>

          {/* Stats row — only when done */}
          {isDone && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <StatCard
                label="Imagens analisadas"
                value={job.progress.imagesDownloaded ?? "—"}
                color={T1}
              />
              <StatCard
                label="Com tabelas"
                value={job.progress.tablesDetected ?? "—"}
                color={NAVY}
              />
              <StatCard
                label="Taxa de deteção"
                value={
                  job.progress.imagesDownloaded
                    ? `${Math.round(((job.progress.tablesDetected ?? 0) / job.progress.imagesDownloaded) * 100)}%`
                    : "—"
                }
                color={G_TX}
              />
            </div>
          )}

          {/* Accordion wrapping the existing components */}
          <JobAccordion
            job={job}
            open={jobOpen}
            onToggle={() => setJobOpen((p) => !p)}
          />
        </div>
      )}

      {/* ── Empty state ── */}
      {!job && !requestError && (
        <div className="sec sec-alt">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "64px 0",
              gap: 16,
              color: T3,
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: NAVY_50,
                border: `1.5px solid ${NAVY_100}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSearch size={22} />
            </span>
            <p
              style={{
                fontSize: 13,
                color: T3,
                textAlign: "center",
                maxWidth: 280,
              }}
            >
              Introduza um URL no passo 1 para iniciar a análise.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
