"use client"

import { useCallback, useRef, useState } from "react"
import {
  CheckCircle2,
  Image as ImageIcon,
  RotateCcw,
  TableProperties,
  Upload,
  XCircle,
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
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"

import { api } from "@/lib/api"
import type { DetecaoTabela } from "@/lib/types"

export function ImageDetector() {
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [resultado, setResultado] = useState<DetecaoTabela[] | null>(null)
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aArrastar, setAArrastar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selecionar = useCallback((f: File | null) => {
    setResultado(null)
    setErro(null)
    if (!f) {
      setFicheiro(null)
      setPreview(null)
      return
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Ficheiro inválido", {
        description: "Apenas são aceites imagens.",
      })
      return
    }
    setFicheiro(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }, [])

  function repor() {
    setFicheiro(null)
    setPreview(null)
    setResultado(null)
    setErro(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function detetar() {
    if (!ficheiro) return
    setAProcessar(true)
    setErro(null)
    setResultado(null)
    try {
      const r = await api.detetarTabela(ficheiro)
      setResultado(r)
      toast.success("Análise concluída", {
        description: `${r.length} deteção(ões) devolvida(s).`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido"
      setErro(msg)
      toast.error("Falha na deteção", { description: msg })
    } finally {
      setAProcessar(false)
    }
  }

  const tabelas = resultado?.filter((r) => r.etiqueta === "table") ?? []
  const melhorPontuacao = resultado
    ? Math.max(0, ...resultado.map((r) => r.pontuacao ?? 0))
    : 0

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4 text-primary" />
            Carregar imagem
          </CardTitle>
          <CardDescription>
            Endpoint:{" "}
            <code className="font-mono">POST /api/modelo/detetar-tabela</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label
            htmlFor="ficheiro"
            onDragOver={(e) => {
              e.preventDefault()
              setAArrastar(true)
            }}
            onDragLeave={() => setAArrastar(false)}
            onDrop={(e) => {
              e.preventDefault()
              setAArrastar(false)
              const f = e.dataTransfer.files?.[0]
              if (f) selecionar(f)
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
                Arrasta uma imagem ou clica para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                Formatos suportados: PNG, JPG, WEBP
              </p>
            </div>
            <input
              id="ficheiro"
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => selecionar(e.target.files?.[0] ?? null)}
            />
          </label>

          {preview && (
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Pré-visualização
              </span>
              <AspectRatio
                ratio={16 / 10}
                className="overflow-hidden rounded-md border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview || "/placeholder.svg"}
                  alt={ficheiro?.name || "Pré-visualização"}
                  className="h-full w-full object-contain"
                />
              </AspectRatio>
              {ficheiro && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate font-mono">{ficheiro.name}</span>
                  <span className="tabular-nums">
                    {(ficheiro.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={repor}
              disabled={aProcessar || !ficheiro}
            >
              <RotateCcw className="size-4" />
              Limpar
            </Button>
            <Button
              type="button"
              onClick={detetar}
              disabled={aProcessar || !ficheiro}
            >
              {aProcessar ? (
                <>
                  <Spinner className="size-4" />
                  A analisar…
                </>
              ) : (
                <>
                  <TableProperties className="size-4" />
                  Detetar tabela
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Resultado</CardTitle>
          <CardDescription>
            Etiquetas e pontuações devolvidas pelo modelo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {erro && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          {!resultado && !erro && (
            <Empty className="min-h-[200px] border-0 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImageIcon />
                </EmptyMedia>
                <EmptyTitle>Sem análise</EmptyTitle>
                <EmptyDescription>
                  Carrega uma imagem e clica em &quot;Detetar tabela&quot; para
                  obter resultados.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {resultado && (
            <>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Veredicto</span>
                  {tabelas.length > 0 ? (
                    <Badge className="gap-1">
                      <CheckCircle2 className="size-3" />
                      Tabela detetada
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="size-3" />
                      Sem tabela
                    </Badge>
                  )}
                </div>
                <Separator className="my-3" />
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Confiança máxima</span>
                    <span className="tabular-nums">
                      {(melhorPontuacao * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={melhorPontuacao * 100} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {tabelas.length} de {resultado.length} deteções
                  classificadas como tabela.
                </p>
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead className="text-right">Confiança</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="text-center text-sm text-muted-foreground"
                        >
                          Nenhuma deteção devolvida.
                        </TableCell>
                      </TableRow>
                    )}
                    {resultado.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge
                            variant={
                              r.etiqueta === "table" ? "default" : "secondary"
                            }
                            className="font-normal"
                          >
                            {r.etiqueta}
                          </Badge>
                          {r.motivo && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.motivo}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {((r.pontuacao ?? 0) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
