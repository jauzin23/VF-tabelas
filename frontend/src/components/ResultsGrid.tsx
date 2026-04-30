/* eslint-disable @next/next/no-img-element */
"use client";

import useSWR from "swr";
import type { JobData } from "../lib/types";
import { getJobImages } from "../lib/api";

interface Props {
  job: JobData;
}

export function ResultsGrid({ job }: Props) {
  const { data, error, isLoading } = useSWR(
    job?.id ? ["job-images", job.id] : null,
    () => getJobImages(job.id),
    { revalidateOnFocus: false, dedupingInterval: 1500 },
  );

  const raw = data?.raw ?? [];
  const passed = data?.passed ?? [];
  const tabela = data?.tabela ?? [];
  const total = raw.length + passed.length + tabela.length;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
          Imagens descarregadas
        </h3>
        <span
          style={{
            fontSize: 12,
            color: "#64748b",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          }}
        >
          {isLoading
            ? "a carregar…"
            : `${total} (raw=${raw.length}, passed=${passed.length}, tabela=${tabela.length})`}
        </span>
      </div>

      {error ? (
        <p style={{ marginTop: 10, color: "#b91c1c", fontSize: 12 }}>
          Falha ao obter imagens do backend: {error instanceof Error ? error.message : String(error)}
        </p>
      ) : null}

      {!isLoading && total === 0 ? (
        <p style={{ marginTop: 10, color: "#64748b", fontSize: 12 }}>
          Ainda não existem imagens descarregadas para este job.
        </p>
      ) : null}

      {raw.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 8 }}>
            Raw
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {raw.map((img) => (
              <a
                key={`raw:${img.name}`}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                  textDecoration: "none",
                }}
                title={img.name}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "#475569",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {img.name}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {passed.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 8 }}>
            Passed (OCR)
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {passed.map((img) => (
              <a
                key={`passed:${img.name}`}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                  textDecoration: "none",
                }}
                title={img.name}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "#475569",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {img.name}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {tabela.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 8 }}>
            Tabela
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {tabela.map((img) => (
              <a
                key={`tabela:${img.name}`}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                  textDecoration: "none",
                }}
                title={img.name}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "#475569",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {img.name}
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
