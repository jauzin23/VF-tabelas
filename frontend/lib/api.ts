import type { Tarefa, OpcoesTarefa, InfoFila, InfoMemoria } from "./types";

const DEFAULT_BASE_URL = "http://localhost:4000";
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_BASE_URL;

export function getApiBaseUrl(): string {
  return BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const fullUrl = `${base}${path}`;
  const res = await fetch(fullUrl, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let mensagem = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) mensagem = data.detail;
    } catch {
      // ignore
    }
    throw new Error(mensagem);
  }
  return (await res.json()) as T;
}

export interface RespostaCriarTarefa {
  id: string;
  url_alvo: string;
  estado: string;
  criado_em: string;
  posicao_fila?: number | null;
}

export const api = {
  saude: () => request<{ dispositivo: string }>("/api/saude"),
  listarTarefas: () => request<Tarefa[]>("/api/tarefas"),
  listarTarefa: (id: string) => request<Tarefa>(`/api/tarefas/${id}`),

  criarTarefa: (url: string, opcoes?: OpcoesTarefa, sse: boolean = true) =>
    request<RespostaCriarTarefa>("/api/tarefas", {
      method: "POST",
      body: JSON.stringify({ url, opcoes, sse }),
    }),

  criarTarefaLote: (urls: string[], opcoes?: OpcoesTarefa, sse: boolean = true) =>
    request<RespostaCriarTarefa>("/api/paginacao-multurls", {
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
    form.append("ficheiro", ficheiro);
    return request<{ tem_tabela: boolean }>("/api/modelo/detetar-tabela", {
      method: "POST",
      body: form,
    });
  },

  eventosTarefa: (id: string): EventSource => {
    const base = getApiBaseUrl();
    return new EventSource(`${base}/api/tarefas/${id}/eventos`);
  },

  infoFila: () => request<InfoFila>("/api/sistema/fila"),
  infoMemoria: () => request<InfoMemoria>("/api/sistema/memoria"),
};
