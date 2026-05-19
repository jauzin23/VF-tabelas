"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Trash2,
  Inbox,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { StateBadge } from "@/components/state-badge";
import { api } from "@/lib/api";
import { useTarefasLocais } from "@/lib/store";
import type { EstadoTarefa, Tarefa } from "@/lib/types";
import { formatarDataCurta, nomeDominio, truncar } from "@/lib/format";

type CampoOrdenacao = "criado_em" | "estado" | "progresso" | "url";
type DirecaoOrdenacao = "asc" | "desc";

interface Props {
  limite?: number;
  compacto?: boolean;
}

export function TaskList({ limite, compacto }: Props) {
  const { lastUpdate, remover } = useTarefasLocais();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [aActualizar, setAActualizar] = useState(false);

  const [pesquisa, setPesquisa] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoTarefa | "todos">(
    "todos",
  );
  const [campoOrdenacao, setCampoOrdenacao] =
    useState<CampoOrdenacao>("criado_em");
  const [direcaoOrdenacao, setDirecaoOrdenacao] =
    useState<DirecaoOrdenacao>("desc");

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ultimoSelecionado, setUltimoSelecionado] = useState<string | null>(
    null,
  );
  const [confirmarApagarLote, setConfirmarApagarLote] = useState(false);
  const [aApagarLote, setAApagarLote] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setACarregar(true);
    else setAActualizar(true);
    try {
      const r = await api.listarTarefas();
      setTarefas(r);
    } catch (e) {
      console.error("Erro ao carregar tarefas:", e);
      toast.error("Não foi possível carregar as tarefas do backend");
    } finally {
      setACarregar(false);
      setAActualizar(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, lastUpdate]);

  async function apagar(id: string) {
    try {
      await api.apagarTarefa(id);
      toast.success("Tarefa apagada");
      remover();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error("Não foi possível apagar no backend", { description: msg });
    }
  }

  const linhas = useMemo(() => {
    let lista = [...tarefas];

    if (pesquisa.trim()) {
      const q = pesquisa.trim().toLowerCase();
      lista = lista.filter((tarefa) => {
        const urls = [tarefa.url_alvo, ...(tarefa.urls_alvo ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return urls.includes(q) || tarefa.id.toLowerCase().includes(q);
      });
    }

    if (filtroEstado !== "todos") {
      lista = lista.filter((tarefa) => tarefa.estado === filtroEstado);
    }

    lista.sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      switch (campoOrdenacao) {
        case "criado_em":
          av = a.criado_em;
          bv = b.criado_em;
          break;
        case "estado":
          av = a.estado;
          bv = b.estado;
          break;
        case "progresso": {
          const ap = a.progresso;
          const bp = b.progresso;
          av =
            ap && ap.paginas_descobertas > 0
              ? ap.paginas_processadas / ap.paginas_descobertas
              : 0;
          bv =
            bp && bp.paginas_descobertas > 0
              ? bp.paginas_processadas / bp.paginas_descobertas
              : 0;
          break;
        }
        case "url":
          av = a.url_alvo;
          bv = b.url_alvo;
          break;
      }
      if (av < bv) return direcaoOrdenacao === "asc" ? -1 : 1;
      if (av > bv) return direcaoOrdenacao === "asc" ? 1 : -1;
      return 0;
    });

    return limite ? lista.slice(0, limite) : lista;
  }, [
    tarefas,
    pesquisa,
    filtroEstado,
    campoOrdenacao,
    direcaoOrdenacao,
    limite,
  ]);

  const lidarComSelecao = useCallback(
    (tarefaId: string, event: React.MouseEvent) => {
      const novos = new Set(selecionados);
      const checked = !selecionados.has(tarefaId);

      if (
        event.shiftKey &&
        ultimoSelecionado &&
        selecionados.has(ultimoSelecionado) === checked
      ) {
        const idxUltimo = linhas.findIndex((t) => t.id === ultimoSelecionado);
        const idxAtual = linhas.findIndex((t) => t.id === tarefaId);

        if (idxUltimo !== -1 && idxAtual !== -1) {
          const min = Math.min(idxUltimo, idxAtual);
          const max = Math.max(idxUltimo, idxAtual);

          for (let i = min; i <= max; i++) {
            const id = linhas[i].id;
            if (checked) {
              novos.add(id);
            } else {
              novos.delete(id);
            }
          }
        }
      } else {
        if (checked) {
          novos.add(tarefaId);
        } else {
          novos.delete(tarefaId);
        }
      }

      setSelecionados(novos);
      setUltimoSelecionado(tarefaId);
    },
    [selecionados, ultimoSelecionado, linhas],
  );

  async function apagarLote() {
    setAApagarLote(true);
    const ids = Array.from(selecionados);
    let sucesso = 0;
    let falhas = 0;
    const toastId = toast.loading(`A apagar ${ids.length} tarefas...`);

    try {
      await Promise.all(
        ids.map(async (id) => {
          try {
            await api.apagarTarefa(id);
            sucesso++;
          } catch (err) {
            console.error(`Erro ao apagar tarefa ${id}:`, err);
            falhas++;
          }
        }),
      );

      if (sucesso > 0) {
        toast.success(`${sucesso} tarefa(s) apagadas com sucesso`, {
          id: toastId,
        });
      } else {
        toast.error("Falha ao apagar as tarefas", { id: toastId });
      }

      if (falhas > 0) {
        toast.error(`Não foi possível apagar ${falhas} tarefa(s)`);
      }

      setSelecionados(new Set());
      setUltimoSelecionado(null);
      remover(); // Trigger update
    } catch (e) {
      toast.error("Ocorreu um erro ao apagar as tarefas", { id: toastId });
    } finally {
      setAApagarLote(false);
      setConfirmarApagarLote(false);
    }
  }

  function alternarOrdenacao(campo: CampoOrdenacao) {
    if (campoOrdenacao === campo) {
      setDirecaoOrdenacao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCampoOrdenacao(campo);
      setDirecaoOrdenacao("desc");
    }
  }

  if (aCarregar && tarefas.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <RefreshCw className="mx-auto size-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            A carregar tarefas...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (tarefas.length === 0 && !pesquisa && filtroEstado === "todos") {
    return <SemTarefas />;
  }

  return (
    <TooltipProvider>
      <Card className="gap-2">
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
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="na_fila">Na fila</SelectItem>
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
                aria-label="Atualizar"
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
                {!compacto && (
                  <TableHead className="w-[40px] pr-0 pl-4">
                    <Checkbox
                      checked={
                        linhas.length > 0 &&
                        linhas.every((t) => selecionados.has(t.id))
                          ? true
                          : linhas.length > 0 &&
                              linhas.some((t) => selecionados.has(t.id))
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) => {
                        const novos = new Set(selecionados);
                        if (checked === true) {
                          linhas.forEach((t) => novos.add(t.id));
                        } else {
                          linhas.forEach((t) => novos.delete(t.id));
                        }
                        setSelecionados(novos);
                      }}
                      aria-label="Selecionar todas as tarefas"
                    />
                  </TableHead>
                )}
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
                  <TableCell
                    colSpan={compacto ? 7 : 8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Nenhuma tarefa corresponde aos filtros.
                  </TableCell>
                </TableRow>
              )}
              {linhas.map((tarefa) => {
                const progresso = tarefa.progresso;
                const total = progresso?.paginas_descobertas ?? 0;
                const feitas = progresso?.paginas_processadas ?? 0;
                const percent =
                  total > 0 ? Math.round((feitas / total) * 100) : 0;
                const urlExibir =
                  tarefa.urls_alvo && tarefa.urls_alvo.length > 1
                    ? `${tarefa.urls_alvo.length} URLs em lote`
                    : tarefa.url_alvo;
                const running = tarefa.esta_a_correr;
                const isSelected = selecionados.has(tarefa.id);

                return (
                  <TableRow
                    key={tarefa.id}
                    className={cn(
                      "group transition-colors",
                      isSelected && "bg-muted/40 hover:bg-muted/50",
                    )}
                  >
                    {!compacto && (
                      <TableCell className="pr-0 pl-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}} // Controlled manually via onClick
                          onClick={(e) => {
                            e.stopPropagation();
                            lidarComSelecao(tarefa.id, e);
                          }}
                          aria-label={`Selecionar tarefa ${urlExibir}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <Link
                        href={`/tarefas/${tarefa.id}`}
                        className="flex flex-col gap-0.5 hover:underline"
                      >
                        <span className="truncate max-w-[280px]">
                          {truncar(urlExibir, 50)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {tarefa.urls_alvo && tarefa.urls_alvo.length > 1
                            ? "Tarefa em lote"
                            : nomeDominio(urlExibir)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StateBadge
                        estado={tarefa.estado}
                        posicaoFila={tarefa.posicao_fila}
                      />
                    </TableCell>
                    <TableCell>
                      {tarefa.estado === "na_fila" ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            {tarefa.posicao_fila != null
                              ? `Posição #${tarefa.posicao_fila} na fila`
                              : "Na fila"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            A aguardar execução
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Progress value={percent} className="h-1.5" />
                          <span className="text-xs text-muted-foreground">
                            {feitas}/{total || "-"} páginas
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell tabular-nums">
                      {tarefa.progresso.imagens_encontradas ?? "-"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell tabular-nums">
                      {tarefa.progresso.tabelas_detetadas ?? "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {formatarDataCurta(tarefa.criado_em)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon">
                          <Link
                            href={`/tarefas/${tarefa.id}`}
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
                              <AlertDialogTitle>
                                Apagar tarefa?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta operação remove a tarefa do backend
                                permanentemente. Os resultados serão
                                descartados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => apagar(tarefa.id)}
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Diálogo de confirmação de eliminação em lote */}
      <AlertDialog
        open={confirmarApagarLote}
        onOpenChange={setConfirmarApagarLote}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apagar {selecionados.size} tarefa
              {selecionados.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta operação irá remover permanentemente as {selecionados.size}{" "}
              tarefas selecionadas do servidor e descartar os seus resultados.
              Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                apagarLote();
              }}
              disabled={aApagarLote}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {aApagarLote ? "A apagar..." : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Barra de Ações Flutuante */}
      <div
        className={cn(
          "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full border bg-background/95 shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out select-none",
          selecionados.size > 0
            ? "translate-y-0 opacity-100 scale-100 animate-in fade-in slide-in-from-bottom-4 duration-300"
            : "translate-y-12 opacity-0 scale-95 pointer-events-none",
        )}
      >
        <span className="text-xs font-semibold text-foreground pl-1 whitespace-nowrap">
          {selecionados.size} selecionada{selecionados.size === 1 ? "" : "s"}
        </span>
        <div className="h-4 w-px bg-border mx-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelecionados(new Set());
            setUltimoSelecionado(null);
          }}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-full"
        >
          <X className="size-3.5 mr-1" />
          Desmarcar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmarApagarLote(true)}
          className="h-7 px-3 text-xs bg-destructive text-white hover:bg-destructive/90 rounded-full"
        >
          <Trash2 className="size-3.5 mr-1" />
          Apagar
        </Button>
      </div>
    </TooltipProvider>
  );
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
          Ainda não foram criadas tarefas de extração neste servidor.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/tarefas/nova">Criar primeira tarefa</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
