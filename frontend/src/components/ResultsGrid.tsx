/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
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
const Y_BG = "#fffbea";
const Y_BD = "#f5d97a";
const R_BG = "#faeaea";
const R_BD = "#f0b0b0";
const R_TX = "#922020";
const CARD_BG = "#f8fbff";

interface Props {
  job: JobData;
}

type ImageEntry = {
  id: string;
  sourceUrl: string;
  foundPageUrls: string[];
  foundAt: string;
  size: { width: number; height: number; bytes?: number };
  ocrStatus: "passed" | "failed" | "skipped" | "error";
  hasTable: boolean;
  tableStatus: "detected" | "none" | "skipped" | "error";
};

function ImageCard({ img, badge }: { img: ImageEntry; badge?: string }) {
  return (
    <a
      key={img.id}
      href={img.sourceUrl}
      target="_blank"
      rel="noreferrer"
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        overflow: "hidden",
        background: WHITE,
        textDecoration: "none",
        display: "block",
        position: "relative",
      }}
      title={img.sourceUrl}
    >
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background:
              badge === "tabela"
                ? G_BG
                : badge === "passed"
                  ? "#e8eef7"
                  : "#f1f5f9",
            border: `1px solid ${badge === "tabela" ? G_BD : badge === "passed" ? "#c5d4ea" : BORDER}`,
            color: badge === "tabela" ? G_TX : badge === "passed" ? NAVY : T2,
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 50,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            zIndex: 1,
          }}
        >
          {badge}
        </span>
      )}
      <img
        src={img.sourceUrl}
        alt={`image-${img.id}`}
        loading="lazy"
        style={{
          width: "100%",
          height: 120,
          objectFit: "cover",
          display: "block",
        }}
      />
      <div
        style={{
          padding: "6px 10px",
          fontSize: 10,
          color: T3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
        }}
      >
        {img.sourceUrl}
      </div>
    </a>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        border: `1px dashed ${BORDER}`,
        borderRadius: 10,
        background: CARD_BG,
        color: T3,
        fontSize: 11,
        padding: "16px 12px",
      }}
    >
      {text}
    </div>
  );
}

function GroupSection({
  title,
  images,
  badge,
  accentColor,
}: {
  title: string;
  images: ImageEntry[];
  badge?: string;
  accentColor: string;
}) {
  if (images.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: accentColor,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 11,
            color: T3,
            fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
          }}
        >
          ({images.length})
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {images.map((img) => (
          <ImageCard key={img.id} img={img} badge={badge} />
        ))}
      </div>
    </div>
  );
}

export function ResultsGrid({ job }: Props) {
  const isDone = job.status === "completed" || job.status === "failed";
  const [openSections, setOpenSections] = useState({
    tabela: true,
    passed: true,
    pending: true,
    errors: true,
  });
  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const items: ImageEntry[] = useMemo(
    () =>
      (job.results ?? []).map((item) => ({
        id: item.id,
        sourceUrl: item.sourceUrl,
        foundPageUrls: item.foundPageUrls ?? [],
        foundAt: item.foundAt,
        size: item.size ?? { width: item.width ?? 0, height: item.height ?? 0 },
        ocrStatus: item.ocr?.status ?? "skipped",
        hasTable: Boolean(item.tableDetection?.status === "detected"),
        tableStatus: item.tableDetection?.status ?? "skipped",
      })),
    [job.results],
  );
  const stats = useMemo(() => {
    // Build mutually exclusive buckets by priority to avoid duplicates:
    // errors -> tabela -> passed -> pending
    const errors = items.filter(
      (item) => item.ocrStatus === "error" || item.tableStatus === "error",
    );
    const errorIds = new Set(errors.map((item) => item.id));

    const tabela = items.filter((item) => !errorIds.has(item.id) && item.hasTable);
    const tabelaIds = new Set(tabela.map((item) => item.id));

    const passed = items.filter(
      (item) =>
        !errorIds.has(item.id) &&
        !tabelaIds.has(item.id) &&
        item.ocrStatus === "passed" &&
        item.tableStatus === "none",
    );
    const passedIds = new Set(passed.map((item) => item.id));

    const pending = items.filter(
      (item) =>
        !errorIds.has(item.id) &&
        !tabelaIds.has(item.id) &&
        !passedIds.has(item.id),
    );

    return { passed, tabela, pending, errors };
  }, [items]);
  const total = items.length;

  if (total === 0) {
    return (
      <p style={{ marginTop: 12, color: T3, fontSize: 12 }}>
        {isDone
          ? "Nenhuma imagem encontrada para este job."
          : "A aguardar imagens…"}
      </p>
    );
  }

  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
          background: WHITE,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: "10px 12px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T1 }}>Imagens</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T2 }}>total: {total}</span>
          <span style={{ fontSize: 11, color: NAVY }}>
            OCR passed: {stats.passed.length}
          </span>
          <span style={{ fontSize: 11, color: G_TX }}>
            tabela: {stats.tabela.length}
          </span>
          <span style={{ fontSize: 11, color: "#7a5a00" }}>
            pendentes: {stats.pending.length}
          </span>
          <span style={{ fontSize: 11, color: R_TX }}>
            erros: {stats.errors.length}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {[
          { key: "tabela", title: "Tabela", images: stats.tabela, badge: "tabela", color: G_TX },
          { key: "passed", title: "Passed (OCR)", images: stats.passed, badge: "passed", color: NAVY },
          { key: "pending", title: "Pendentes/Skipped", images: stats.pending, badge: "pending", color: "#7a5a00" },
          { key: "errors", title: "Com erro", images: stats.errors, badge: "erro", color: R_TX },
        ].map((section) => (
          <div
            key={section.key}
            style={{
              background: WHITE,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => toggleSection(section.key as keyof typeof openSections)}
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: section.color }}>
                {section.title}
              </span>
              <span style={{ fontSize: 11, color: T3 }}>
                {section.images.length} · {openSections[section.key as keyof typeof openSections] ? "fechar" : "abrir"}
              </span>
            </button>
            {openSections[section.key as keyof typeof openSections] && (
              <div style={{ padding: "0 12px 12px" }}>
                {section.images.length > 0 ? (
                  <GroupSection
                    title={section.title}
                    images={section.images}
                    badge={section.badge}
                    accentColor={section.color}
                  />
                ) : (
                  <EmptyHint text="Sem imagens nesta secção de momento." />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
