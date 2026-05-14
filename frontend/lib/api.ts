import type { Tarefa, OpcoesTarefa } from "./types";

const DEFAULT_BASE_URL = "http://localhost:4000";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_BASE_URL;

export function getApiBaseUrl(): string {
  return BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const fullUrl = `${base}${path}`;
  console.log("[Request] Fetching:", fullUrl, "with method:", init?.method || "GET");
  const res = await fetch(fullUrl, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers || {}),
    },
  });
  console.log("[Request] Response status:", res.status, res.statusText);
  if (!res.ok) {
    let mensagem = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) mensagem = data.detail;
    } catch {
      // ignore
    }
    console.error("[Request] Error response:", mensagem);
    throw new Error(mensagem);
  }
  const data = await res.json() as T;
  console.log("[Request] Response data:", data);
  return data;
}

export const api = {
  saude: () => request<{ dispositivo: string }>("/api/saude"),
  listarTarefas: () => request<Tarefa[]>("/api/tarefas"),
  listarTarefa: (id: string) => request<Tarefa>(`/api/tarefas/${id}`),

  criarTarefa: (url: string, opcoes?: OpcoesTarefa, sse: boolean = true) =>
    request<Tarefa>("/api/tarefas", {
      method: "POST",
      body: JSON.stringify({ url, opcoes, sse }),
    }),

  criarTarefaLote: (urls: string[], opcoes?: OpcoesTarefa, sse: boolean = true) =>
    request<Tarefa>("/api/paginacao-multurls", {
      method: "POST",
      body: JSON.stringify({ urls, opcoes, sse }),
    }),

  apagarTarefa: (id: string) =>
    request<{ sucesso: boolean }>(`/api/tarefas/${id}`, { method: "DELETE" }),

  imagensTarefa: (id: string) =>
    request<{ id: string; resultados: Tarefa["resultados"] }>(
      `/api/tarefas/${id}/imagens`,
    ),

  detetarTabela: (ficheiro: File) => {
    const form = new FormData();
    // O backend espera o campo "ficheiro" no multipart/form-data.
    form.append("ficheiro", ficheiro);
    console.log("[API] Sending image detection request for:", ficheiro.name);
    return request<{ tem_tabela: boolean }>(
      "/api/modelo/detetar-tabela",
      {
        method: "POST",
        body: form,
      }
    ).then((result) => {
      console.log("[API] Image detection response:", result);
      return result;
    });
  },

  eventosTarefa: (id: string): EventSource => {
    const base = getApiBaseUrl();
    return new EventSource(`${base}/api/tarefas/${id}/eventos`);
  },
};
