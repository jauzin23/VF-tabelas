"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowUpDown,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Trash2,
  Inbox,
} from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

import { StateBadge } from "@/components/state-badge"
import { api } from "@/lib/api"
import { useTarefasLocais, type TarefaLocal } from "@/lib/store"
import type { EstadoTarefa, Tarefa } from "@/lib/types"
import { formatarDataCurta, nomeDominio, truncar } from "@/lib/format"

type CampoOrdenacao = "criado_em" | "estado" | "progresso" | "url"
type DirecaoOrdenacao = "asc" | "desc"

interface Props {
  limite?: number
  compacto?: boolean
}

export function TaskList({ limite, compacto }: Props) {
  const { tarefas: locais, remover } = useTarefasLocais()
  const [dados, setDados] = useState<Record<string, Tarefa | null>>({})
  const [aCarregar, setACarregar] = useState(true)
  const [aActualizar, setAActualizar] = useState(false)

  const [pesquisa, setPesquisa] = useState("")
  const [filtroEstado, setFiltroEstado] = useState<EstadoTarefa | "todos">(
    "todos",
  )
  const [campoOrdenacao, setCampoOrdenacao] =
    useState<CampoOrdenacao>("criado_em")
  const [direcaoOrdenacao, setDirecaoOrdenacao] =
    useState<DirecaoOrdenacao>("desc")

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setACarregar(true)
      else setAActualizar(true)
      const entradas = await Promise.all(
        locais.map(async (t) => {
          try {
            const r = await api.listarTarefa(t.id)
            return [t.id, r] as const
          } catch {
            return [t.id, null] as const
          }
        }),
      )
      setDados(Object.fromEntries(entradas))
      setACarregar(false)
      setAActualizar(false)
    },
    [locais],
  )

  useEffect(() => {
    carregar()
  }, [carregar])

  // Polling apenas para tarefas em curso
  useEffect(() => {
    const temEmCurso = Object.values(dados).some(
      (t) => t && (t.estado === "em_execucao" || t.estado === "em_fila"),
    )
    if (!temEmCurso) return
    const id = setInterval(() => carregar(true), 5000)
    return () => clearInterval(id)
  }, [dados, carregar])

  async function apagar(id: string) {
    try {
      await api.apagarTarefa(id)
      toast.success("Tarefa apagada")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro"
      toast.error("Não foi possível apagar no backend", { description: msg })
    }
    remover(id)
  }

  const linhas = useMemo(() => {
    type Linha = {
      local: TarefaLocal
      tarefa: Tarefa | null
    }
    let lista: Linha[] = locais.map((l) => ({
      local: l,
      tarefa: dados[l.id] ?? null,
    }))

    if (pesquisa.trim()) {
      const q = pesquisa.trim().toLowerCase()
      lista = lista.filter(({ local, tarefa }) => {
        const urls = [
          local.url_alvo,
          tarefa?.url_alvo,
          ...(tarefa?.urls_alvo ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return urls.includes(q) || local.id.toLowerCase().includes(q)
      })
    }

    if (filtroEstado !== "todos") {
      lista = lista.filter(({ tarefa }) => tarefa?.estado === filtroEstado)
    }

    lista.sort((a, b) => {
      let av: string | number = 0
      let bv: string | number = 0
      switch (campoOrdenacao) {
        case "criado_em":
          av = a.tarefa?.criado_em || a.local.criado_em
          bv = b.tarefa?.criado_em || b.local.criado_em
          break
        case "estado":
          av = a.tarefa?.estado || ""
          bv = b.tarefa?.estado || ""
          break
        case "progresso": {
          const ap = a.tarefa?.progresso
          const bp = b.tarefa?.progresso
          av =
            ap && ap.paginas_descobertas > 0
              ? ap.paginas_processadas / ap.paginas_descobertas
              : 0
          bv =
            bp && bp.paginas_descobertas > 0
              ? bp.paginas_processadas / bp.paginas_descobertas
              : 0
          break
        }
        case "url":
          av = a.tarefa?.url_alvo || a.local.url_alvo
          bv = b.tarefa?.url_alvo || b.local.url_alvo
          break
      }
      if (av < bv) return direcaoOrdenacao === "asc" ? -1 : 1
      if (av > bv) return direcaoOrdenacao === "asc" ? 1 : -1
      return 0
    })

    return limite ? lista.slice(0, limite) : lista
  }, [locais, dados, pesquisa, filtroEstado, campoOrdenacao, direcaoOrdenacao, limite])

  function alternarOrdenacao(campo: CampoOrdenacao) {
    if (campoOrdenacao === campo) {
      setDirecaoOrdenacao((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setCampoOrdenacao(campo)
      setDirecaoOrdenacao("desc")
    }
  }

  if (aCarregar && locais.length === 0) {
    return <SemTarefas />
  }

  if (locais.length === 0) {
    return <SemTarefas />
  }

  return (
    <Card>
      {!compacto && (
        <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold">
            {linhas.length} {linhas.length === 1 ? "tarefa" : "tarefas"}
          </CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputGroup className="sm:w-64">
              <InputGroupAddon>
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Pesquisar URL ou ID…"
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
              />
            </InputGroup>
            <Select
              value={filtroEstado}
              onValueChange={(v) =>
                setFiltroEstado(v as EstadoTarefa | "todos")
              }
            >
              <SelectTrigger className="sm:w-44">
                <Filter className="size-4" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                <SelectItem value="em_fila">Em fila</SelectItem>
                <SelectItem value="em_execucao">A executar</SelectItem>
                <SelectItem value="concluido">Concluída</SelectItem>
                <SelectItem value="falhou">Falhou</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => carregar()}
              disabled={aActualizar}
              aria-label="Actualizar"
            >
              <RefreshCw
                className={`size-4 ${aActualizar ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
      )}
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("url")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  URL alvo
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("estado")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Estado
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="min-w-[160px]">
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("progresso")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Progresso
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">Imagens</TableHead>
              <TableHead className="hidden md:table-cell">Tabelas</TableHead>
              <TableHead className="hidden lg:table-cell">
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("criado_em")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Criada
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="w-[1%] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Nenhuma tarefa corresponde aos filtros.
                </TableCell>
              </TableRow>
            )}
            {linhas.map(({ local, tarefa }) => {
              const progresso = tarefa?.progresso
              const total = progresso?.paginas_descobertas ?? 0
              const feitas = progresso?.paginas_processadas ?? 0
              const percent = total > 0 ? Math.round((feitas / total) * 100) : 0
              const urlExibir =
                tarefa?.urls_alvo && tarefa.urls_alvo.length > 1
                  ? `${tarefa.urls_alvo.length} URLs em lote`
                  : tarefa?.url_alvo || local.url_alvo

              return (
                <TableRow key={local.id} className="group">
                  <TableCell className="font-medium">
                    <Link
                      href={`/tarefas/${local.id}`}
                      className="flex flex-col gap-0.5 hover:underline"
                    >
                      <span className="truncate max-w-[280px]">
                        {truncar(urlExibir, 50)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tarefa?.urls_alvo && tarefa.urls_alvo.length > 1
                          ? "Tarefa em lote"
                          : nomeDominio(urlExibir)}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {tarefa ? (
                      <StateBadge estado={tarefa.estado} />
                    ) : (
                      <Skeleton className="h-5 w-20" />
                    )}
                  </TableCell>
                  <TableCell>
                    {tarefa ? (
                      <div className="flex flex-col gap-1">
                        <Progress value={percent} className="h-1.5" />
                        <span className="text-xs text-muted-foreground">
                          {feitas}/{total || "—"} páginas
                        </span>
                      </div>
                    ) : (
                      <Skeleton className="h-2 w-24" />
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell tabular-nums">
                    {tarefa?.progresso.imagens_encontradas ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell tabular-nums">
                    {tarefa?.progresso.tabelas_detetadas ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {formatarDataCurta(tarefa?.criado_em || local.criado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/tarefas/${local.id}`}
                          aria-label="Abrir tarefa"
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Apagar tarefa"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Apagar tarefa?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta operação remove a tarefa do backend e da lista
                              local. Os resultados serão descartados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => apagar(local.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Apagar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SemTarefas() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>Sem tarefas</EmptyTitle>
        <EmptyDescription>
          Ainda não criaste nenhuma tarefa de extração neste navegador.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/tarefas/nova">Criar primeira tarefa</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
