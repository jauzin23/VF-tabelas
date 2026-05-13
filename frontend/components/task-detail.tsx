"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { TaskProgressCard } from "@/components/task-progress-card"
import { TaskResultsTable } from "@/components/task-results-table"
import { StateBadge } from "@/components/state-badge"
import { api } from "@/lib/api"
import { useTarefasLocais } from "@/lib/store"
import type { Tarefa } from "@/lib/types"
import { formatarData, formatarDuracao, nomeDominio } from "@/lib/format"

interface Props {
  id: string
}

export function TaskDetail({ id }: Props) {
  const router = useRouter()
  const { remover } = useTarefasLocais()
  const [tarefa, setTarefa] = useState<Tarefa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [ligadoSSE, setLigadoSSE] = useState(false)
  const sseRef = useRef<EventSource | null>(null)

  async function carregar() {
    try {
      const t = await api.listarTarefa(id)
      setTarefa(t)
      setErro(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido"
      setErro(msg)
    } finally {
      setACarregar(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // SSE
  useEffect(() => {
    if (!tarefa) return
    if (tarefa.estado === "concluido" || tarefa.estado === "falhou") {
      if (!tarefa.esta_a_correr) {
         if (sseRef.current) {
            sseRef.current.close()
            sseRef.current = null
            setLigadoSSE(false)
          }
          return
      }
    }
    if (sseRef.current) return
    try {
      const es = api.eventosTarefa(id)
      sseRef.current = es
      setLigadoSSE(true)
      es.onmessage = (ev) => {
        try {
          const dados = JSON.parse(ev.data) as Tarefa
          setTarefa(dados)
        } catch {
          // ignore
        }
      }
      es.onerror = () => {
        setLigadoSSE(false)
      }
    } catch {
      setLigadoSSE(false)
    }
    return () => {
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
        setLigadoSSE(false)
      }
    }
  }, [id, tarefa?.estado, tarefa?.esta_a_correr])

  async function apagar() {
    try {
      await api.apagarTarefa(id)
    } catch {
      /* ignore */
    }
    remover()
    toast.success("Tarefa apagada")
    router.push("/tarefas")
  }

  function copiarId() {
    navigator.clipboard.writeText(id)
    toast.success("ID copiado")
  }

  if (aCarregar) {
    return <DetalheSkeleton />
  }

  if (erro || !tarefa) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/tarefas">
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Não foi possível carregar a tarefa</AlertTitle>
          <AlertDescription>
            {erro ||
              "Verifica se o backend está em execução e se o ID está correto."}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button onClick={carregar} variant="outline">
            <RefreshCw className="size-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  const urls = tarefa.urls_alvo && tarefa.urls_alvo.length > 0
    ? tarefa.urls_alvo
    : [tarefa.url_alvo]
  const ehLote = (tarefa.urls_alvo?.length || 0) > 1
  const running = tarefa.esta_a_correr

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
            <Link href="/tarefas">
              <ArrowLeft className="size-4" />
              Voltar às tarefas
            </Link>
          </Button>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl truncate">
                  {ehLote
                    ? `Lote com ${urls.length} URLs`
                    : nomeDominio(tarefa.url_alvo)}
                </h1>
                <StateBadge estado={tarefa.estado} />
                {running && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-600 animate-pulse">
                    <RefreshCw className="size-3 animate-spin" />
                    A processar...
                  </span>
                )}
                {ligadoSSE && !running && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-chart-2/15 px-2 py-0.5 text-xs font-medium text-chart-2">
                    <Zap className="size-3" />
                    Em direto
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {ehLote ? `${urls.length} URLs em processamento` : tarefa.url_alvo}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={copiarId}>
                <Copy className="size-4" />
                <span className="hidden sm:inline">Copiar ID</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={carregar}
                disabled={aCarregar}
              >
                <RefreshCw className="size-4" />
                <span className="hidden sm:inline">Actualizar</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2 className="size-4" />
                    <span className="hidden sm:inline">Apagar</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar esta tarefa?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A tarefa será removida do servidor permanentemente. 
                      Os resultados serão descartados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={apagar}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Apagar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {tarefa.erro && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Erro reportado pelo backend</AlertTitle>
            <AlertDescription>{tarefa.erro}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="progresso">
          <TabsList>
            <TabsTrigger value="progresso">Progresso</TabsTrigger>
            <TabsTrigger value="resultados">
              Resultados
              <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                ({tarefa.resultados?.length ?? 0})
              </span>
            </TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
          </TabsList>

          <TabsContent value="progresso" className="mt-4">
            <TaskProgressCard tarefa={tarefa} />
            
          </TabsContent>

          <TabsContent value="resultados" className="mt-4">
            <TaskResultsTable resultados={tarefa.resultados ?? []} />
          </TabsContent>

          <TabsContent value="config" className="mt-4">
            <ConfiguracaoCard tarefa={tarefa} urls={urls} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

function ConfiguracaoCard({
  tarefa,
  urls,
}: {
  tarefa: Tarefa
  urls: string[]
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadados</CardTitle>
          <CardDescription>Identificação e cronologia</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <Linha rotulo="ID">
              <code className="font-mono text-xs">{tarefa.id}</code>
            </Linha>
            <Linha rotulo="Criada">{formatarData(tarefa.criado_em)}</Linha>
            <Linha rotulo="Iniciada">
              {formatarData(tarefa.iniciado_em)}
            </Linha>
            <Linha rotulo="Terminada">
              {formatarData(tarefa.terminado_em)}
            </Linha>
            <Linha rotulo="Duração">
              {formatarDuracao(tarefa.iniciado_em, tarefa.terminado_em)}
            </Linha>
            {tarefa.url_atual && (
              <Linha rotulo="A processar">
                <span className="truncate text-xs">{tarefa.url_atual}</span>
              </Linha>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opções de execução</CardTitle>
          <CardDescription>Parâmetros aplicados</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <Linha rotulo="Páginas máx.">
              {tarefa.opcoes.maxPages === 0
                ? "Ilimitado"
                : tarefa.opcoes.maxPages ?? "-"}
            </Linha>
            <Linha rotulo="Profundidade">
              {tarefa.opcoes.maxDepth ?? "-"}
            </Linha>
            <Linha rotulo="Concorrência">
              {tarefa.opcoes.concurrency ?? "-"}
            </Linha>
            <Linha rotulo="Análise">
              {tarefa.opcoes.analysisConcurrency ?? "-"}
            </Linha>
            <Linha rotulo="Timeout pág.">
              {tarefa.opcoes.pageTimeoutMs
                ? `${(tarefa.opcoes.pageTimeoutMs / 1000).toFixed(0)} s`
                : "-"}
            </Linha>
            <Linha rotulo="Timeout total">
              {tarefa.opcoes.maxJobSeconds
                ? `${Math.round(tarefa.opcoes.maxJobSeconds / 60)} min`
                : "-"}
            </Linha>
            <Linha rotulo="Paginação">
              {tarefa.opcoes.seguirPaginacao ? "Sim" : "Não"}
            </Linha>
            <Linha rotulo="Detalhe">
              {tarefa.opcoes.seguirDetalhe ? "Sim" : "Não"}
            </Linha>
          </dl>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4" />
            URLs alvo
          </CardTitle>
          <CardDescription>
            {urls.length} URL{urls.length === 1 ? "" : "s"} configurado
            {urls.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm">
            {urls.map((u, i) => (
              <li
                key={`${u}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
              >
                <span className="truncate font-mono text-xs">{u}</span>
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${u}`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </>
  )
}

function DetalheSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
