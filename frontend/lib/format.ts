import type { EstadoTarefa } from "./types"

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "-"
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  } catch {
    return iso
  }
}

export function formatarDataCurta(iso: string | null | undefined): string {
  if (!iso) return "-"
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  } catch {
    return iso
  }
}

export function formatarDuracao(inicio: string | null, fim: string | null): string {
  if (!inicio) return "-"
  const a = new Date(inicio).getTime()
  const b = fim ? new Date(fim).getTime() : Date.now()
  const diff = Math.max(0, b - a)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return `${m}m ${r}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function rotuloEstado(estado: EstadoTarefa): string {
  switch (estado) {
    case "pendente":
      return "Pendente"
    case "na_fila":
      return "Na fila"
    case "em_execucao":
      return "A executar"
    case "concluido":
      return "Concluída"
    case "falhou":
      return "Falhou"
    default:
      return estado
  }
}

export function truncar(texto: string, max = 60): string {
  if (!texto) return ""
  if (texto.length <= max) return texto
  return texto.slice(0, max - 1) + "…"
}

export function nomeDominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
