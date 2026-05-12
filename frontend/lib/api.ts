import type { Tarefa, OpcoesTarefa, DetecaoTabela, SaudeServico } from "./types"

const DEFAULT_BASE_URL = "http://localhost:4000"
const STORAGE_KEY = "vf_tabelas_api_base_url"

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BASE_URL
  return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_BASE_URL
}

export function setApiBaseUrl(url: string) {
  if (typeof window === "undefined") return
  const clean = url.trim().replace(/\/$/, "")
  if (clean) {
    window.localStorage.setItem(STORAGE_KEY, clean)
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl()
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    let mensagem = `Erro ${res.status}`
    try {
      const data = await res.json()
      if (data?.detail) mensagem = data.detail
    } catch {
      // ignore
    }
    throw new Error(mensagem)
  }
  return res.json() as Promise<T>
}

export const api = {
  saude: () => request<SaudeServico>("/saude"),

  listarTarefa: (id: string) => request<Tarefa>(`/api/tarefas/${id}`),

  criarTarefa: (url: string, opcoes?: OpcoesTarefa) =>
    request<Tarefa>("/api/tarefas", {
      method: "POST",
      body: JSON.stringify({ url, opcoes }),
    }),

  criarTarefaLote: (urls: string[], opcoes?: OpcoesTarefa) =>
    request<Tarefa>("/api/paginacao-multurls", {
      method: "POST",
      body: JSON.stringify({ urls, opcoes }),
    }),

  apagarTarefa: (id: string) =>
    request<{ sucesso: boolean }>(`/api/tarefas/${id}`, { method: "DELETE" }),

  imagensTarefa: (id: string) =>
    request<{ id: string; resultados: Tarefa["resultados"] }>(
      `/api/tarefas/${id}/imagens`,
    ),

  detetarTabela: (ficheiro: File) => {
    const form = new FormData()
    // O backend espera o campo "ficheiro" no multipart/form-data.
    form.append("ficheiro", ficheiro)
    return request<DetecaoTabela[]>("/api/modelo/detetar-tabela", {
      method: "POST",
      body: form,
    })
  },

  eventosTarefa: (id: string): EventSource => {
    const base = getApiBaseUrl()
    return new EventSource(`${base}/api/tarefas/${id}/eventos`)
  },
}
