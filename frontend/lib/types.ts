export type EstadoTarefa = "pendente" | "na_fila" | "em_execucao" | "concluido" | "falhou";

export interface OpcoesTarefa {
  maxPages?: number;
  maxDepth?: number;
  pageTimeoutMs?: number;
  concurrency?: number;
  analysisConcurrency?: number;
  maxImagesPerPage?: number | null;
  maxImagesTotal?: number | null;
  seguirPaginacao?: boolean;
  seguirDetalhe?: boolean;
}

export interface ProgressoTarefa {
  paginas_descobertas: number;
  paginas_processadas: number;
  imagens_encontradas: number;
  imagens_bulk: number;
  imagens_bruto: number;
  imagens_unicas: number;
  imagens_analisadas: number;
  tabelas_detetadas: number;
  paginacao_total: number;
}

export interface PaginaOrigem {
  url: string;
  titulo: string;
}

export interface ImagemResultado {
  id: string;
  url_pagina: string;
  titulo_pagina: string;
  url_origem: string;
  url_contentor: string;
  alt: string;
  tem_tabela: boolean;
  paginas_origem: PaginaOrigem[];
}

export interface Tarefa {
  id: string;
  url_alvo: string;
  urls_alvo?: string[] | null;
  estado: EstadoTarefa;
  criado_em: string;
  iniciado_em: string | null;
  terminado_em: string | null;
  erro: string | null;
  opcoes: OpcoesTarefa;
  progresso: ProgressoTarefa;
  resultados: ImagemResultado[];
  url_atual: string | null;
  atualizado_em: string;
  esta_a_correr?: boolean;
  estatisticas_rastreio?: Record<string, unknown> | null;
  posicao_fila?: number | null;
}

export interface InfoFila {
  tarefa_ativa: string | null;
  em_espera: string[];
  tamanho_fila: number;
  maximo: number;
  max_concurrent: number;
}

export interface InfoMemoria {
  rss_mb: number;
  vms_mb: number;
  fila: InfoFila;
  modelos_carregados: boolean;
  tarefas_em_memoria: number;
  erro?: string;
}
