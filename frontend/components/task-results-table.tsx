"use client"

import { useMemo, useState } from "react"
import {
  ArrowUpDown,
  Download,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  Search,
  TableProperties,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { AspectRatio } from "@/components/ui/aspect-ratio"

import type { ImagemResultado } from "@/lib/types"
import { nomeDominio, truncar } from "@/lib/format"

type CampoOrdenacao = "pontuacao" | "etiqueta" | "largura" | "altura"
type Direcao = "asc" | "desc"
type FiltroEtiqueta = "todas" | "table" | "outras"

const POR_PAGINA = 20

interface Props {
  resultados: ImagemResultado[]
}

export function TaskResultsTable({ resultados }: Props) {
  const [pesquisa, setPesquisa] = useState("")
  const [filtroEtiqueta, setFiltroEtiqueta] =
    useState<FiltroEtiqueta>("todas")
  const [pontuacaoMin, setPontuacaoMin] = useState(0)
  const [campo, setCampo] = useState<CampoOrdenacao>("pontuacao")
  const [direcao, setDirecao] = useState<Direcao>("desc")
  const [paginaAtual, setPaginaAtual] = useState(1)

  const etiquetasUnicas = useMemo(() => {
    const s = new Set<string>()
    resultados.forEach((r) => r.etiqueta && s.add(r.etiqueta))
    return Array.from(s)
  }, [resultados])

  const filtradas = useMemo(() => {
    let lista = [...resultados]

    if (pesquisa.trim()) {
      const q = pesquisa.trim().toLowerCase()
      lista = lista.filter((r) =>
        [
          r.url_origem,
          r.url_pagina,
          r.titulo_pagina,
          r.alt,
          r.contexto_texto,
          r.seccao,
          r.etiqueta,
        ]
          .filter(Boolean)
          .some((s) => s.toLowerCase().includes(q)),
      )
    }

    if (filtroEtiqueta === "table") {
      lista = lista.filter((r) => r.etiqueta === "table")
    } else if (filtroEtiqueta === "outras") {
      lista = lista.filter((r) => r.etiqueta !== "table")
    }

    if (pontuacaoMin > 0) {
      lista = lista.filter((r) => (r.pontuacao ?? 0) >= pontuacaoMin / 100)
    }

    lista.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      switch (campo) {
        case "pontuacao":
          av = a.pontuacao ?? 0
          bv = b.pontuacao ?? 0
          break
        case "etiqueta":
          av = a.etiqueta ?? ""
          bv = b.etiqueta ?? ""
          break
        case "largura":
          av = a.largura ?? 0
          bv = b.largura ?? 0
          break
        case "altura":
          av = a.altura ?? 0
          bv = b.altura ?? 0
          break
      }
      if (av < bv) return direcao === "asc" ? -1 : 1
      if (av > bv) return direcao === "asc" ? 1 : -1
      return 0
    })

    return lista
  }, [resultados, pesquisa, filtroEtiqueta, pontuacaoMin, campo, direcao])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const inicio = (paginaSegura - 1) * POR_PAGINA
  const visiveis = filtradas.slice(inicio, inicio + POR_PAGINA)

  function alternarOrdenacao(c: CampoOrdenacao) {
    if (campo === c) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setCampo(c)
      setDirecao("desc")
    }
  }

  function exportarJSON() {
    const blob = new Blob([JSON.stringify(filtradas, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "resultados.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportarCSV() {
    if (filtradas.length === 0) return
    const cabecalhos = [
      "id",
      "etiqueta",
      "pontuacao",
      "largura",
      "altura",
      "url_origem",
      "url_pagina",
      "titulo_pagina",
      "alt",
      "seccao",
    ]
    const linhas = filtradas.map((r) =>
      cabecalhos
        .map((c) => {
          const v = (r as unknown as Record<string, unknown>)[c]
          const s = v == null ? "" : String(v)
          return `"${s.replace(/"/g, '""')}"`
        })
        .join(","),
    )
    const csv = [cabecalhos.join(","), ...linhas].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "resultados.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  if (resultados.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon />
          </EmptyMedia>
          <EmptyTitle>Sem resultados ainda</EmptyTitle>
          <EmptyDescription>
            Quando a tarefa começar a extrair imagens, aparecerão aqui em tempo
            real.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base font-semibold">
            {filtradas.length} de {resultados.length} resultado
            {resultados.length === 1 ? "" : "s"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportarCSV}>
              <Download className="size-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportarJSON}>
              <Download className="size-4" />
              JSON
            </Button>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <InputGroup>
            <InputGroupAddon>
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Pesquisar URL, título, alt, contexto…"
              value={pesquisa}
              onChange={(e) => {
                setPesquisa(e.target.value)
                setPaginaAtual(1)
              }}
            />
          </InputGroup>
          <Select
            value={filtroEtiqueta}
            onValueChange={(v) => {
              setFiltroEtiqueta(v as FiltroEtiqueta)
              setPaginaAtual(1)
            }}
          >
            <SelectTrigger className="min-w-[160px]">
              <Filter className="size-4" />
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as etiquetas</SelectItem>
              <SelectItem value="table">Apenas tabelas</SelectItem>
              <SelectItem value="outras">Excluir tabelas</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex w-full min-w-[180px] flex-col gap-1 lg:w-44">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Confiança mín.</span>
              <span className="tabular-nums">{pontuacaoMin}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[pontuacaoMin]}
              onValueChange={(v) => {
                setPontuacaoMin(v[0] ?? 0)
                setPaginaAtual(1)
              }}
            />
          </div>
        </div>
        {etiquetasUnicas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Etiquetas detetadas:
            </span>
            {etiquetasUnicas.map((e) => (
              <Badge key={e} variant="secondary" className="font-normal">
                {e}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Prévia</TableHead>
              <TableHead className="min-w-[220px]">Imagem / Página</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("etiqueta")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Etiqueta
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("pontuacao")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Confiança
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <button
                  type="button"
                  onClick={() => alternarOrdenacao("largura")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Dimensões
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="hidden lg:table-cell">Secção</TableHead>
              <TableHead className="w-[1%] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nenhum resultado corresponde aos filtros.
                </TableCell>
              </TableRow>
            )}
            {visiveis.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell>
                  <PreviaImagem imagem={r} />
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {r.titulo_pagina || nomeDominio(r.url_pagina)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {truncar(r.alt || r.url_origem, 70)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={r.etiqueta === "table" ? "default" : "secondary"}
                    className="font-normal"
                  >
                    {r.etiqueta === "table" && (
                      <TableProperties className="size-3" />
                    )}
                    {r.etiqueta || "—"}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {((r.pontuacao ?? 0) * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="hidden md:table-cell tabular-nums text-muted-foreground">
                  {r.largura}×{r.altura}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="truncate text-xs text-muted-foreground">
                    {r.seccao || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon">
                    <a
                      href={r.url_pagina}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abrir página de origem"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalPaginas > 1 && (
          <div className="border-t p-3">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={paginaSegura === 1}
                    onClick={(e) => {
                      e.preventDefault()
                      if (paginaSegura > 1) setPaginaAtual(paginaSegura - 1)
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: totalPaginas }).slice(0, 5).map((_, i) => {
                  const n = i + 1
                  return (
                    <PaginationItem key={n}>
                      <PaginationLink
                        href="#"
                        isActive={paginaSegura === n}
                        onClick={(e) => {
                          e.preventDefault()
                          setPaginaAtual(n)
                        }}
                      >
                        {n}
                      </PaginationLink>
                    </PaginationItem>
                  )
                })}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={paginaSegura === totalPaginas}
                    onClick={(e) => {
                      e.preventDefault()
                      if (paginaSegura < totalPaginas)
                        setPaginaAtual(paginaSegura + 1)
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PreviaImagem({ imagem }: { imagem: ImagemResultado }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="block size-12 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ampliar prévia"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagem.url_origem || "/placeholder.svg"}
            alt={imagem.alt || "Prévia"}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            className="size-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            {imagem.titulo_pagina || nomeDominio(imagem.url_pagina)}
          </DialogTitle>
          <DialogDescription className="truncate">
            {imagem.alt || imagem.url_origem}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <AspectRatio ratio={16 / 10} className="overflow-hidden rounded-md bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagem.url_origem || "/placeholder.svg"}
              alt={imagem.alt || "Imagem extraída"}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              className="h-full w-full object-contain"
            />
          </AspectRatio>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Etiqueta</dt>
            <dd className="font-medium">{imagem.etiqueta || "—"}</dd>
            <dt className="text-muted-foreground">Confiança</dt>
            <dd className="font-medium tabular-nums">
              {((imagem.pontuacao ?? 0) * 100).toFixed(2)}%
            </dd>
            <dt className="text-muted-foreground">Motivo</dt>
            <dd className="font-medium">{imagem.motivo || "—"}</dd>
            <dt className="text-muted-foreground">Dimensões</dt>
            <dd className="font-medium tabular-nums">
              {imagem.largura}×{imagem.altura}
            </dd>
            <dt className="text-muted-foreground">Página</dt>
            <dd className="truncate">
              <a
                href={imagem.url_pagina}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {imagem.url_pagina}
              </a>
            </dd>
            <dt className="text-muted-foreground">Origem</dt>
            <dd className="truncate">
              <a
                href={imagem.url_origem}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {imagem.url_origem}
              </a>
            </dd>
            {imagem.contexto_texto && (
              <>
                <dt className="text-muted-foreground">Contexto</dt>
                <dd className="text-sm text-muted-foreground">
                  {imagem.contexto_texto}
                </dd>
              </>
            )}
          </dl>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
