export type EstadoTarefa = "em_fila" | "em_execucao" | "concluido" | "falhou"

export interface OpcoesTarefa {
  maxPages?: number
  maxDepth?: number
  pageTimeoutMs?: number
  maxJobSeconds?: number
  concurrency?: number
  analysisConcurrency?: number
  maxImagesPerPage?: number | null
  maxImagesTotal?: number | null
  seguirPaginacao?: boolean
  seguirDetalhe?: boolean
}

export interface ProgressoTarefa {
  paginas_descobertas: number
  paginas_processadas: number
  imagens_encontradas: number
  imagens_bulk: number
  imagens_bruto: number
  imagens_unicas: number
  imagens_analisadas: number
  tabelas_detetadas: number
  paginacao_total: number
}

export interface ImagemResultado {
  id: string
  url_pagina: string
  titulo_pagina: string
  url_origem: string
  url_contentor: string
  alt: string
  largura: number
  altura: number
  seccao: string
  classes_css: string
  contexto_texto: string
  e_imagem_og: boolean
  e_dados_next: boolean
  etiqueta: string
  pontuacao: number
  motivo: string
  paginas_origem: unknown[]
}

export interface Tarefa {
  id: string
  url_alvo: string
  urls_alvo?: string[] | null
  estado: EstadoTarefa
  criado_em: string
  iniciado_em: string | null
  terminado_em: string | null
  erro: string | null
  opcoes: OpcoesTarefa
  progresso: ProgressoTarefa
  resultados: ImagemResultado[]
  url_atual: string | null
  atualizado_em: string
  estatisticas_rastreio?: Record<string, unknown> | null
}

export interface DetecaoTabela {
  etiqueta: string
  pontuacao: number
  motivo: string
}

export interface SaudeServico {
  ok: boolean
  dispositivo: string
  servico: string
}
