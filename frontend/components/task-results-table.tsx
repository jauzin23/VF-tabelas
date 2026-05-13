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

import { api } from "@/lib/api"
import type { ImagemResultado } from "@/lib/types"
import { nomeDominio, truncar } from "@/lib/format"

type CampoOrdenacao = "tem_tabela"
type Direcao = "asc" | "desc"
type FiltroEtiqueta = "todas" | "com_tabela" | "sem_tabela"

const POR_PAGINA = 20

interface Props {
  resultados: ImagemResultado[]
}

export function TaskResultsTable({ resultados }: Props) {
  const [pesquisa, setPesquisa] = useState("")
  const [filtroEtiqueta, setFiltroEtiqueta] =
    useState<FiltroEtiqueta>("todas")
  const [campo, setCampo] = useState<CampoOrdenacao>("tem_tabela")
  const [direcao, setDirecao] = useState<Direcao>("desc")
  const [paginaAtual, setPaginaAtual] = useState(1)


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
        ]
          .filter(Boolean)
          .some((s) => s.toLowerCase().includes(q)),
      )
    }

    if (filtroEtiqueta === "com_tabela") {
      lista = lista.filter((r) => r.tem_tabela)
    } else if (filtroEtiqueta === "sem_tabela") {
      lista = lista.filter((r) => !r.tem_tabela)
    }

    lista.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      if (campo === "tem_tabela") {
        av = a.tem_tabela ? 1 : 0
        bv = b.tem_tabela ? 1 : 0
      }
      if (av < bv) return direcao === "asc" ? -1 : 1
      if (av > bv) return direcao === "asc" ? 1 : -1
      return 0
    })

    return lista
  }, [resultados, pesquisa, filtroEtiqueta, campo, direcao])

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
      "tem_tabela",
      "url_origem",
      "url_pagina",
      "titulo_pagina",
      "alt",
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
              placeholder="Pesquisar URL, título, alt…"
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
              <SelectItem value="todas">Todos os resultados</SelectItem>
              <SelectItem value="com_tabela">Com tabela</SelectItem>
              <SelectItem value="sem_tabela">Sem tabela</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                  onClick={() => alternarOrdenacao("tem_tabela")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Status
                  <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
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
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {r.titulo_pagina || nomeDominio(r.url_pagina)}
                      </span>
                      {r.paginas_origem?.length > 1 && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] bg-primary/5 text-primary border-primary/20">
                          +{r.paginas_origem.length - 1}
                        </Badge>
                      )}
                    </div>
                    
                    {r.paginas_origem && r.paginas_origem.length > 1 ? (
                      <details className="mt-1 group">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
                          <span className="group-open:rotate-90 transition-transform">▶</span>
                          Ver todas as {r.paginas_origem.length} páginas
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-2 border-l ml-1 max-h-24 overflow-y-auto">
                          {r.paginas_origem.map((p, i) => (
                            <li key={i} className="truncate text-[10px]">
                              <a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                {p.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground">
                        {truncar(r.alt || r.url_origem, 70)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                    {r.tem_tabela ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 font-medium text-white border-none">
                        <TableProperties className="size-3 mr-1" />
                        Tabela
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-rose-600 hover:bg-rose-700 font-medium text-white border-none">
                        Não tabela
                      </Badge>
                    )}
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
              className="h-full w-full object-contain"
            />
          </AspectRatio>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium">
              {imagem.tem_tabela ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-none">Tabela</Badge>
              ) : (
                <Badge variant="destructive" className="bg-rose-600 hover:bg-rose-700 text-white border-none">Não tabela</Badge>
              )}
            </dd>
            <dt className="text-muted-foreground">Páginas ({imagem.paginas_origem?.length || 1})</dt>
            <dd className="overflow-hidden">
              <ScrollArea className={(imagem.paginas_origem?.length || 0) > 3 ? "h-32" : ""}>
                <ul className="space-y-1">
                  {(imagem.paginas_origem && imagem.paginas_origem.length > 0 ? imagem.paginas_origem : [{ url: imagem.url_pagina, titulo: imagem.titulo_pagina }]).map((p, i) => (
                    <li key={i} className="truncate flex items-center gap-2">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-2 hover:underline text-xs truncate"
                        title={p.titulo || p.url}
                      >
                        {p.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </dd>
            <dt className="text-muted-foreground mt-1">Origem</dt>
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
          </dl>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
