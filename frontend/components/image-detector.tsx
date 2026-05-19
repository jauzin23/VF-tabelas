"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  RotateCcw,
  TableProperties,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

import { api } from "@/lib/api";

interface ImageResult {
  id: string;
  file: File;
  preview: string;
  resultado: { tem_tabela: boolean } | null;
  aProcessar: boolean;
  erro: string | null;
}

export function ImageDetector() {
  const [ficheiros, setFicheiros] = useState<ImageResult[]>([]);
  const [aArrastar, setAArrastar] = useState(false);
  const [idxPreview, setIdxPreview] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (idxPreview === null) return;

    const lidarComTeclado = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && idxPreview > 0) {
        setIdxPreview(idxPreview - 1);
      } else if (
        e.key === "ArrowRight" &&
        idxPreview < ficheiros.length - 1
      ) {
        setIdxPreview(idxPreview + 1);
      }
    };

    window.addEventListener("keydown", lidarComTeclado);
    return () => window.removeEventListener("keydown", lidarComTeclado);
  }, [idxPreview, ficheiros.length]);

  const adicionarFicheiros = useCallback((files: FileList | null) => {
    if (!files) return;
    const novosFicheiros: ImageResult[] = Array.from(files)
      .filter((f) => {
        if (!f.type.startsWith("image/")) {
          toast.error("Ficheiro inválido", {
            description: `${f.name} não é uma imagem.`,
          });
          return false;
        }
        return true;
      })
      .map((f) => ({
        id: Math.random().toString(36),
        file: f,
        preview: URL.createObjectURL(f),
        resultado: null,
        aProcessar: false,
        erro: null,
      }));
    setFicheiros((prev) => [...prev, ...novosFicheiros]);
  }, []);

  const removerFicheiro = useCallback((id: string) => {
    setFicheiros((prev) => {
      const ficheiro = prev.find((f) => f.id === id);
      if (ficheiro) {
        URL.revokeObjectURL(ficheiro.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const detetarUm = useCallback(
    async (id: string) => {
      setFicheiros((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, aProcessar: true, erro: null } : f,
        ),
      );
      try {
        const ficheiro = ficheiros.find((f) => f.id === id);
        if (!ficheiro) return;
        const r = await api.detetarTabela(ficheiro.file);
        console.log(
          "[ImageDetector] API Response for",
          ficheiro.file.name,
          ":",
          r,
        );

        const resultado = { tem_tabela: !!r.tem_tabela };

        console.log("[ImageDetector] Normalized resultado:", resultado);
        setFicheiros((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, resultado, aProcessar: false } : f,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        console.error("[ImageDetector] Error detecting:", msg, e);
        toast.error("Erro na análise", { description: msg });
        setFicheiros((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, erro: msg, aProcessar: false } : f,
          ),
        );
      }
    },
    [ficheiros],
  );

  const detetarTodos = useCallback(async () => {
    const semResultado = ficheiros.filter(
      (f) => f.resultado === null && !f.erro,
    );
    for (const f of semResultado) {
      await detetarUm(f.id);
    }
  }, [ficheiros, detetarUm]);

  const limpar = useCallback(() => {
    ficheiros.forEach((f) => URL.revokeObjectURL(f.preview));
    setFicheiros([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [ficheiros]);

  return (
    <div className="grid gap-6">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4 text-primary" />
            Carregar imagens
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label
            htmlFor="ficheiros"
            onDragOver={(e) => {
              e.preventDefault();
              setAArrastar(true);
            }}
            onDragLeave={() => setAArrastar(false)}
            onDrop={(e) => {
              e.preventDefault();
              setAArrastar(false);
              adicionarFicheiros(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
              aArrastar
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/40"
            }`}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ImageIcon className="size-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                Arrasta uma ou múltiplas imagens ou clica para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                Formatos suportados: PNG, JPG, WEBP
              </p>
            </div>
            <input
              id="ficheiros"
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => adicionarFicheiros(e.target.files)}
            />
          </label>

          {ficheiros.length > 0 && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={limpar}
                disabled={ficheiros.some((f) => f.aProcessar)}
              >
                <Trash2 className="size-4" />
                Limpar tudo
              </Button>
              <Button
                type="button"
                onClick={detetarTodos}
                disabled={ficheiros.every(
                  (f) => f.resultado !== null || f.erro,
                )}
              >
                {ficheiros.some((f) => f.aProcessar) ? (
                  <>
                    <Spinner className="size-4" />A analisar…
                  </>
                ) : (
                  <>
                    <TableProperties className="size-4" />
                    Analisar tudo
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {ficheiros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultados</CardTitle>
            <CardDescription>
              {ficheiros.length} imagem(ns) carregada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ficheiros.map((img, idx) => {
                const temResultado = img.resultado !== null;
                const temTabela = img.resultado?.tem_tabela === true;

                return (
                  <div
                    key={img.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:gap-4 rounded-lg border p-3 bg-card hover:bg-accent/5 transition-colors overflow-hidden"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <button
                        onClick={() => setIdxPreview(idx)}
                        className="h-16 w-16 shrink-0 overflow-hidden rounded border bg-muted cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.preview}
                          alt={img.file.name}
                          className="h-full w-full object-cover"
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate text-sm font-medium block w-full"
                          title={img.file.name}
                        >
                          {img.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(img.file.size / 1024).toFixed(1)} KB
                        </p>

                        {img.aProcessar && (
                          <div className="mt-2 flex items-center gap-2">
                            <Spinner className="size-3" />
                            <Badge variant="outline">A analisar…</Badge>
                          </div>
                        )}

                        {img.erro && (
                          <div className="mt-2">
                            <Badge variant="destructive">{img.erro}</Badge>
                          </div>
                        )}

                        {!img.aProcessar && !img.erro && temTabela && (
                          <div className="mt-2">
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-none">
                              <TableProperties className="size-3 mr-1" />
                              Sim (Tabela)
                            </Badge>
                          </div>
                        )}
                        {!img.aProcessar &&
                          !img.erro &&
                          temResultado &&
                          !temTabela && (
                            <div className="mt-2">
                              <Badge
                                variant="destructive"
                                className="bg-rose-600 hover:bg-rose-700 text-white border-none"
                              >
                                Não
                              </Badge>
                            </div>
                          )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0 sm:w-auto w-full border-t sm:border-t-0 pt-2 sm:pt-0">
                      {(temResultado || img.erro) && !img.aProcessar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Re-analisar"
                          onClick={() => detetarUm(img.id)}
                          className="h-8 w-8 p-0"
                        >
                          <RotateCcw className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      )}
                      {!temResultado && !img.erro && (
                        <Button
                          size="sm"
                          onClick={() => detetarUm(img.id)}
                          disabled={img.aProcessar}
                        >
                          {img.aProcessar ? (
                            <>
                              <Spinner className="size-3" />
                            </>
                          ) : (
                            "Analisar"
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removerFicheiro(img.id)}
                        disabled={img.aProcessar}
                        className="h-8 w-8 p-0 border-destructive/20 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogo de visualização ampliada com navegação */}
      <Dialog
        open={idxPreview !== null}
        onOpenChange={(open) => !open && setIdxPreview(null)}
      >
        <DialogContent className="sm:max-w-2xl overflow-visible p-6">
          {idxPreview !== null && ficheiros[idxPreview] && (() => {
            const img = ficheiros[idxPreview];
            const temResultado = img.resultado !== null;
            const temTabela = img.resultado?.tem_tabela === true;
            return (
              <div className="relative">
                {/* Botões de navegação lateral */}
                {idxPreview > 0 && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIdxPreview(idxPreview - 1);
                    }}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 rounded-full border shadow-md bg-background/90 hover:bg-background backdrop-blur-xs transition-all z-50 size-10",
                      "left-4 md:-left-12"
                    )}
                    aria-label="Imagem anterior"
                  >
                    <ChevronLeft className="size-5" />
                  </Button>
                )}

                {idxPreview < ficheiros.length - 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIdxPreview(idxPreview + 1);
                    }}
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 rounded-full border shadow-md bg-background/90 hover:bg-background backdrop-blur-xs transition-all z-50 size-10",
                      "right-4 md:-right-12"
                    )}
                    aria-label="Próxima imagem"
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                )}

                {/* DialogHeader com Título e Descrição */}
                <div className="min-w-0 mb-4 flex flex-col gap-1 pr-6">
                  <DialogTitle className="break-words leading-tight text-lg font-semibold">
                    {img.file.name}
                  </DialogTitle>
                  <p className="break-words text-xs text-muted-foreground">
                    {(img.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>

                {/* Conteúdo rolável com scroll nativo responsivo */}
                <div className="max-h-[calc(85vh-160px)] overflow-y-auto pr-1 select-none scrollbar-thin">
                  <div className="relative w-full h-[200px] sm:h-[350px] rounded-md overflow-hidden bg-muted flex items-center justify-center border shadow-inner">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.preview}
                      alt={img.file.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground font-medium">Status</dt>
                    <dd className="font-medium">
                      {img.aProcessar ? (
                        <div className="flex items-center gap-2">
                          <Spinner className="size-3" />
                          <Badge variant="outline">A analisar…</Badge>
                        </div>
                      ) : img.erro ? (
                        <Badge variant="destructive">{img.erro}</Badge>
                      ) : temResultado ? (
                        temTabela ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-none font-semibold">
                            <TableProperties className="size-3 mr-1 inline" />
                            Sim (Tabela)
                          </Badge>
                        ) : (
                          <Badge
                            variant="destructive"
                            className="bg-rose-600 hover:bg-rose-700 text-white border-none font-semibold"
                          >
                            Não
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Não analisada</span>
                      )}
                    </dd>

                    <dt className="text-muted-foreground font-medium mt-1 shrink-0">
                      Nome do Ficheiro
                    </dt>
                    <dd className="min-w-0 text-xs font-mono font-medium truncate pt-0.5">
                      {img.file.name}
                    </dd>
                  </dl>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
