/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";

type ModelTestResult = {
  ok: true;
  elapsedMs: number;
  threshold: number | null;
  model?: string;
  hasTable: boolean;
  confidence: number;
  boundingBoxes: Array<{
    score: number;
    label: string;
    box: { x1: number; y1: number; x2: number; y2: number };
  }>;
};

export function ModelTestUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ModelTestResult | null>(null);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const response = await fetch("/api/model/table-detect", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: buffer,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const json = (await response.json()) as ModelTestResult;
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dce3ef",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "#0f172a" }}>
          Testar modelo (Ollama)
        </h3>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          Faz apenas a deteção de tabelas numa imagem
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setFile(next);
              setResult(null);
              setError(null);
            }}
          />

          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={run}
              disabled={!file || busy}
              style={{
                background: "#0d2a5e",
                color: "#fff",
                border: "1px solid #0d2a5e",
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: !file || busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "A correr…" : "Correr teste"}
            </button>

            {file ? (
              <span style={{ fontSize: 12, color: "#475569" }}>
                {file.name}{" "}
                <span style={{ color: "#94a3b8" }}>
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Escolha uma imagem</span>
            )}
          </div>

          {error ? (
            <div
              style={{
                marginTop: 10,
                background: "#faeaea",
                border: "1px solid #f0b0b0",
                color: "#922020",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </div>
          ) : null}

          {result ? (
            <div
              style={{
                marginTop: 10,
                background: result.hasTable ? "#eaf4ee" : "#fffbea",
                border: `1px solid ${result.hasTable ? "#b5d9c2" : "#f5d97a"}`,
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12,
                color: "#0f172a",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                {result.hasTable ? "Tabela detetada" : "Nenhuma tabela detetada"}
              </div>
              <div style={{ color: "#475569" }}>
                confiança={Math.round(result.confidence * 100)}% • caixas={result.boundingBoxes.length} •{" "}
                {result.elapsedMs}ms{result.model ? ` • model=${result.model}` : ""}
              </div>
            </div>
          ) : null}

          {result?.boundingBoxes?.length ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155", fontWeight: 800 }}>
                Ver detalhes (bounding boxes)
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  background: "#0b1220",
                  color: "#e2e8f0",
                  padding: 12,
                  borderRadius: 10,
                  fontSize: 11,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(result.boundingBoxes.slice(0, 50), null, 2)}
              </pre>
            </details>
          ) : null}
        </div>

        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
            background: "#f8fafc",
            minHeight: 180,
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="preview"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                padding: 14,
                color: "#94a3b8",
                fontSize: 12,
              }}
            >
              Preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

