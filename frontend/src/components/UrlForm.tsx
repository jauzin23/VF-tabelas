"use client";

import { FormEvent, useState } from "react";

interface Props {
  onSubmit: (url: string) => Promise<void>;
  disabled?: boolean;
}

export function UrlForm({ onSubmit, disabled = false }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      new URL(url);
    } catch {
      setError("Por favor introduza um URL válido.");
      return;
    }

    await onSubmit(url);
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
      <label htmlFor="target-url">URL do website</label>
      <input
        id="target-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://exemplo.pt"
        disabled={disabled}
        style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
      />
      <button
        type="submit"
        disabled={disabled}
        style={{ padding: 10, borderRadius: 8, border: "none", cursor: "pointer" }}
      >
        Iniciar análise
      </button>
      {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
    </form>
  );
}
