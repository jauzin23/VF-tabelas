"use client"

import { useEffect, useMemo, useState } from "react"
import XLSX from "xlsx-js-style"
import {
  ArrowUpDown,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileJson,
  Filter,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
  TableProperties,
} from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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
  PaginationEllipsis,
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"

import { api } from "@/lib/api"
import type { ImagemResultado } from "@/lib/types"
import { nomeDominio, truncar } from "@/lib/format"

type CampoOrdenacao = "tem_tabela"
type Direcao = "asc" | "desc"
type FiltroEtiqueta = "todas" | "com_tabela" | "sem_tabela"

const POR_PAGINA = 20

// ─── campo exportável ────────────────────────────────────────────────────────
const CAMPOS_EXPORTAVEIS = [
  { id: "id",            label: "ID" },
  { id: "url_origem",    label: "URL Imagem" },
  { id: "url_pagina",    label: "Página Principal" },
  { id: "titulo_pagina", label: "Título da Página" },
  { id: "alt",           label: "Texto Alt" },
  { id: "tem_tabela",    label: "Contém Tabela" },
  { id: "paginas_origem",label: "Todas as Localizações" },
] as const

type CampoId = typeof CAMPOS_EXPORTAVEIS[number]["id"]

interface Props {
  resultados: ImagemResultado[]
}

// ─── hooks auxiliares ────────────────────────────────────────────────────────
function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null)
  function copiar(texto: string, chave: string) {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(chave)
      toast.success("URL copiada")
      setTimeout(() => setCopiado(null), 1500)
    })
  }
  return { copiado, copiar }
}

// ─── componente de cópia inline ──────────────────────────────────────────────
function BotaoCopiar({
  url,
  chave,
  copiado,
  copiar,
}: {
  url: string
  chave: string
  copiado: string | null
  copiar: (u: string, k: string) => void
}) {
  const ativo = copiado === chave
  return (
    <button
      type="button"
      aria-label="Copiar URL"
      onClick={(e) => { e.preventDefault(); copiar(url, chave) }}
      className={[
        "ml-1 rounded p-0.5 transition-all",
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        ativo
          ? "text-emerald-500"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {ativo ? <Check className="size-3" /> : <Clipboard className="size-3" />}
    </button>
  )
}

// ─── célula de página(s) ────────────────────────────────────────────────────
function CelulaOrigem({ r }: { r: ImagemResultado }) {
  const { copiado, copiar } = useCopiar()
  const paginas =
    r.paginas_origem && r.paginas_origem.length > 0
      ? r.paginas_origem
      : [{ url: r.url_pagina, titulo: r.titulo_pagina }]

  const primaria = paginas[0]
  const tituloDisplay = primaria.titulo || nomeDominio(primaria.url)
  const temMultiplas = paginas.length > 1

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {/* título / link primário */}
      <div className="group flex items-center gap-1 min-w-0">
        <a
          href={primaria.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-medium text-sm hover:underline underline-offset-2 text-foreground"
          title={primaria.url}
        >
          {tituloDisplay}
        </a>
        {temMultiplas && (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[10px] shrink-0 bg-primary/5 text-primary border-primary/20"
          >
            +{paginas.length - 1}
          </Badge>
        )}
        <BotaoCopiar
          url={primaria.url}
          chave={`main-${r.id}`}
          copiado={copiado}
          copiar={copiar}
        />
      </div>

      {/* lista expandível para múltiplas páginas */}
      {temMultiplas ? (
        <details className="mt-0.5 group/det">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
            <span className="group-open/det:rotate-90 transition-transform">▶</span>
            Ver todas as {paginas.length} páginas
          </summary>
          <ul className="mt-1 space-y-0.5 pl-2 border-l ml-1 max-h-24 overflow-y-auto">
            {paginas.map((p, i) => (
              <li key={i} className="group flex items-center gap-1 min-w-0 text-[10px]">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline truncate"
                  title={p.url}
                >
                  {p.titulo || p.url}
                </a>
                <BotaoCopiar
                  url={p.url}
                  chave={`page-${r.id}-${i}`}
                  copiado={copiado}
                  copiar={copiar}
                />
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
  )
}

// ─── modal de exportação ─────────────────────────────────────────────────────
function ExportModal({ resultados }: { resultados: ImagemResultado[] }) {
  const [aberto, setAberto] = useState(false)
  const [filtro, setFiltro] = useState<FiltroEtiqueta>("todas")
  const [campos, setCampos] = useState<Set<CampoId>>(
    new Set(CAMPOS_EXPORTAVEIS.map((c) => c.id))
  )

  const dadosFiltrados = useMemo(() => {
    if (filtro === "com_tabela") return resultados.filter((r) => r.tem_tabela)
    if (filtro === "sem_tabela") return resultados.filter((r) => !r.tem_tabela)
    return resultados
  }, [resultados, filtro])

  function toggleCampo(id: CampoId) {
    setCampos((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function construirObjeto(r: ImagemResultado): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    if (campos.has("id"))             obj.id = r.id
    if (campos.has("url_origem"))     obj.url_origem = r.url_origem
    if (campos.has("url_pagina"))     obj.url_pagina = r.url_pagina
    if (campos.has("titulo_pagina"))  obj.titulo_pagina = r.titulo_pagina
    if (campos.has("alt"))            obj.alt = r.alt
    if (campos.has("tem_tabela"))     obj.tem_tabela = r.tem_tabela
    if (campos.has("paginas_origem")) obj.paginas_origem = r.paginas_origem ?? []
    return obj
  }

  // gera slug de data: YYYY-MM-DD_HH-MM
  function slugData() {
    const agora = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return (
      `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}` +
      `_${pad(agora.getHours())}-${pad(agora.getMinutes())}`
    )
  }

  function nomeFicheiro(formato: string) {
    const filtroSlug = filtro === "todas" ? "todos" : filtro
    return `extração_${filtroSlug}_${slugData()}.${formato}`
  }

  function exportarJSON() {
    const dados = dadosFiltrados.map(construirObjeto)
    const blob = new Blob([JSON.stringify(dados, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = nomeFicheiro("json")
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${dados.length} resultado(s) exportados como JSON`)
    setAberto(false)
  }

  function exportarExcel() {
    const linhas = dadosFiltrados.map((r) => {
      const obj: Record<string, unknown> = {}
      if (campos.has("id"))             obj["ID"] = r.id
      if (campos.has("url_origem"))     obj["URL Imagem"] = r.url_origem
      if (campos.has("url_pagina"))     obj["Página Principal"] = r.url_pagina
      if (campos.has("titulo_pagina"))  obj["Título"] = r.titulo_pagina
      if (campos.has("alt"))            obj["Alt"] = r.alt
      if (campos.has("tem_tabela"))     obj["Contém Tabela"] = r.tem_tabela ? "Sim" : "Não"
      if (campos.has("paginas_origem")) {
        const pags = r.paginas_origem ?? []
        obj["Todas as Localizações"] = pags.map((p) => p.url).join("\n")
      }
      return obj
    })

    const ws = XLSX.utils.json_to_sheet(linhas)

    // auto-largura das colunas
    const cabecalhos = Object.keys(linhas[0] ?? {})
    const larguras = cabecalhos.map((cab) => {
      const maxConteudo = linhas.reduce((max, linha) => {
        const val = linha[cab]
        if (val == null) return max
        const maior = String(val).split("\n").reduce((m, l) => Math.max(m, l.length), 0)
        return Math.max(max, maior)
      }, 0)
      return { wch: Math.min(80, Math.max(cab.length + 2, maxConteudo + 2)) }
    })
    ws["!cols"] = larguras

    // Aplicar estilos (wrapText e cores)
    const intervalo = XLSX.utils.decode_range(ws["!ref"] ?? "A1")
    const idxTabela = cabecalhos.indexOf("Contém Tabela")

    for (let R = intervalo.s.r; R <= intervalo.e.r; R++) {
      for (let C = intervalo.s.c; C <= intervalo.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[addr]) continue

        // Estilo base (alinhamento e bordas leves)
        ws[addr].s = {
          alignment: { 
            wrapText: true, 
            vertical: "center",
            horizontal: R === 0 ? "center" : "left" 
          },
          font: { name: "Calibri", sz: 11 }
        }

        // Cabeçalho a negrito
        if (R === 0) {
          ws[addr].s.font.bold = true
          ws[addr].s.fill = { fgColor: { rgb: "F2F2F2" } }
        }

        // Links clicáveis e azuis para colunas de URL
        const colCabecalho = cabecalhos[C]
        const colunasURL = ["URL Imagem", "Página Principal", "Todas as Localizações"]
        
        if (R > 0 && colunasURL.includes(colCabecalho)) {
          const valor = ws[addr].v
          if (valor && typeof valor === "string" && valor.startsWith("http")) {
            // Se tiver múltiplas URLs (newline), SheetJS só suporta um link por célula.
            // Usamos o primeiro URL como alvo principal.
            const alvo = valor.split("\n")[0]
            ws[addr].l = { Target: alvo, Tooltip: "Clique para abrir" }
            ws[addr].s.font.color = { rgb: "0563C1" }
            ws[addr].s.font.underline = true
          }
        }

        // Cor condicional na coluna "Contém Tabela"
        if (R > 0 && C === idxTabela) {
          const valor = ws[addr].v
          if (valor === "Sim") {
            ws[addr].s.fill = { fgColor: { rgb: "C6EFCE" } } // Verde suave
            ws[addr].s.font = { color: { rgb: "006100" }, bold: true }
          } else {
            ws[addr].s.fill = { fgColor: { rgb: "FFC7CE" } } // Vermelho suave
            ws[addr].s.font = { color: { rgb: "9C0006" }, bold: true }
          }
          ws[addr].s.alignment.horizontal = "center"
        }
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Resultados")
    XLSX.writeFile(wb, nomeFicheiro("xlsx"))
    toast.success(`${linhas.length} resultado(s) exportados como Excel`)
    setAberto(false)
  }

  const nenhumCampo = campos.size === 0

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4" />
          Exportar
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar resultados</DialogTitle>
          <DialogDescription>
            Configure os filtros antes de exportar. Os filtros abaixo são
            independentes da tabela principal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-1">
          {/* filtro de conteúdo */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Conteúdo a exportar</Label>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroEtiqueta)}>
              <SelectTrigger>
                <Filter className="size-4 mr-2 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os resultados</SelectItem>
                <SelectItem value="com_tabela">Apenas tabelas</SelectItem>
                <SelectItem value="sem_tabela">Apenas não-tabelas</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {dadosFiltrados.length}
              </span>{" "}
              de {resultados.length} resultado(s) serão exportados
            </p>
          </div>

          <Separator />

          {/* seleção de campos */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Campos a incluir</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {CAMPOS_EXPORTAVEIS.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`campo-${c.id}`}
                    checked={campos.has(c.id)}
                    onCheckedChange={() => toggleCampo(c.id)}
                  />
                  <Label
                    htmlFor={`campo-${c.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {c.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* botões de formato */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Formato</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-14 flex-col gap-1 text-xs"
                disabled={nenhumCampo || dadosFiltrados.length === 0}
                onClick={exportarJSON}
              >
                <FileJson className="size-5" />
                JSON
              </Button>
              <Button
                variant="outline"
                className="h-14 flex-col gap-1 text-xs"
                disabled={nenhumCampo || dadosFiltrados.length === 0}
                onClick={exportarExcel}
              >
                <FileSpreadsheet className="size-5" />
                Excel (.xlsx)
              </Button>
            </div>
            {nenhumCampo && (
              <p className="text-xs text-destructive">
                Seleciona pelo menos um campo para exportar.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── componente principal ────────────────────────────────────────────────────
export function TaskResultsTable({ resultados }: Props) {
  const [pesquisa, setPesquisa] = useState("")
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<FiltroEtiqueta>("todas")
  const [campo, setCampo] = useState<CampoOrdenacao>("tem_tabela")
  const [direcao, setDirecao] = useState<Direcao>("desc")
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [porPagina, setPorPagina] = useState(20)
  const [vista, setVista] = useState<"tabela" | "grelha">("tabela")

  // Scroll para o topo ao mudar de página
  useEffect(() => {
    const el = document.getElementById("resultados-ancora")
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [paginaAtual, porPagina])

  const filtradas = useMemo(() => {
    let lista = [...resultados]

    if (pesquisa.trim()) {
      const q = pesquisa.trim().toLowerCase()
      lista = lista.filter((r) =>
        [r.url_origem, r.url_pagina, r.titulo_pagina, r.alt]
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
      const av = a.tem_tabela ? 1 : 0
      const bv = b.tem_tabela ? 1 : 0
      if (av < bv) return direcao === "asc" ? -1 : 1
      if (av > bv) return direcao === "asc" ? 1 : -1
      return 0
    })

    return lista
  }, [resultados, pesquisa, filtroEtiqueta, campo, direcao])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const inicio = (paginaSegura - 1) * porPagina
  const visiveis = filtradas.slice(inicio, inicio + porPagina)

  function alternarOrdenacao(c: CampoOrdenacao) {
    if (campo === c) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setCampo(c)
      setDirecao("desc")
    }
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
    <Card id="resultados-ancora">
      <CardHeader className="flex flex-col gap-4 border-b">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base font-semibold">
            {filtradas.length} de {resultados.length} resultado
            {resultados.length === 1 ? "" : "s"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Mostrar:</span>
              <Select 
                value={String(porPagina)} 
                onValueChange={(v) => {
                  setPorPagina(Number(v))
                  setPaginaAtual(1)
                }}
              >
                <SelectTrigger className="h-8 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center rounded-lg border bg-muted p-1 mr-2">
              <Button
                variant={vista === "tabela" ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                onClick={() => setVista("tabela")}
                title="Vista em tabela"
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={vista === "grelha" ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                onClick={() => setVista("grelha")}
                title="Vista em grelha"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
            <ExportModal resultados={resultados} />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
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
        {vista === "tabela" ? (
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
                <TableHead className="w-[1%] text-right">Abrir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Nenhum resultado corresponde aos filtros.
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((r) => (
                <TableRow key={r.id} className="align-middle">
                  <TableCell>
                    <PreviaImagem imagem={r} />
                  </TableCell>
                  <TableCell>
                    <CelulaOrigem r={r} />
                  </TableCell>
                  <TableCell>
                    {r.tem_tabela ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700 font-medium text-white border-none">
                        <TableProperties className="size-3 mr-1" />
                        Tabela
                      </Badge>
                    ) : (
                      <Badge
                        variant="destructive"
                        className="bg-rose-600 hover:bg-rose-700 font-medium text-white border-none"
                      >
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
        ) : (
          <div className="p-4">
            {visiveis.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                Nenhum resultado corresponde aos filtros.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {visiveis.map((r) => (
                  <div 
                    key={r.id} 
                    className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/20"
                  >
                    {/* Header / Imagem com Aspect Ratio */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      <PreviaImagem imagem={r} triggerOnly />
                      
                      {/* Badge de Status Flutuante */}
                      <div className="absolute top-2.5 right-2.5 z-10">
                        {r.tem_tabela ? (
                          <Badge className="bg-emerald-600/90 text-white backdrop-blur-md border-none shadow-sm font-medium">
                            Tabela
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-rose-600/90 text-white backdrop-blur-md border-none shadow-sm font-medium">
                            Não tabela
                          </Badge>
                        )}
                      </div>

                      {/* Ícone de lupa ao passar o rato (indicador visual) */}
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100 pointer-events-none">
                         <div className="rounded-full bg-white/20 p-2 backdrop-blur-md">
                            <ImageIcon className="size-5 text-white" />
                         </div>
                      </div>
                    </div>

                    {/* Conteúdo / Info */}
                    <div className="flex flex-col p-4 pt-3 gap-3">
                      <CelulaOrigem r={r} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


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

                <PaginacaoNumerica
                  total={totalPaginas}
                  atual={paginaSegura}
                  onChange={setPaginaAtual}
                />

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

// ─── prévia da imagem ────────────────────────────────────────────────────────
function PreviaImagem({ 
  imagem, 
  triggerOnly = false 
}: { 
  imagem: ImagemResultado;
  triggerOnly?: boolean;
}) {
  const trigger = triggerOnly ? (
    <div className="group relative block size-full cursor-zoom-in overflow-hidden outline-none">
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img
        src={imagem.url_origem || "/placeholder.svg"}
        alt={imagem.alt || "Prévia"}
        referrerPolicy="no-referrer"
        className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = "none"
        }}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
    </div>
  ) : (
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
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words leading-tight">
            {imagem.titulo_pagina || nomeDominio(imagem.url_pagina)}
          </DialogTitle>
          <DialogDescription className="break-words">
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
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-none">
                  Tabela
                </Badge>
              ) : (
                <Badge
                  variant="destructive"
                  className="bg-rose-600 hover:bg-rose-700 text-white border-none"
                >
                  Não tabela
                </Badge>
              )}
            </dd>
            <dt className="text-muted-foreground">
              Origens ({imagem.paginas_origem?.length || 1})
            </dt>
            <dd className="overflow-hidden">
              <ScrollArea
                className={(imagem.paginas_origem?.length || 0) > 3 ? "h-32" : ""}
              >
                <ul className="space-y-1">
                  {(
                    imagem.paginas_origem && imagem.paginas_origem.length > 0
                      ? imagem.paginas_origem
                      : [{ url: imagem.url_pagina, titulo: imagem.titulo_pagina }]
                  ).map((p, i) => (
                    <li key={i} className="truncate flex items-center gap-2">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-2 hover:underline text-xs truncate"
                        title={p.titulo || p.url}
                      >
                        {p.titulo || p.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </dd>
            <dt className="text-muted-foreground mt-1 shrink-0">URL da Imagem</dt>
            <dd className="min-w-0">
              <a
                href={imagem.url_origem}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline break-all text-xs"
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

// ─── paginação com elli'psis ──────────────────────────────────────────────────
function PaginacaoNumerica({
  total,
  atual,
  onChange,
}: {
  total: number
  atual: number
  onChange: (p: number) => void
}) {
  // constrói a sequência de páginas a mostrar, com null = ell'ipsis
  function paginas(): (number | null)[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

    const vizinhos = 1 // números à volta da página actual
    const inicio = Math.max(2, atual - vizinhos)
    const fim    = Math.min(total - 1, atual + vizinhos)

    const mostrar: (number | null)[] = [1]
    if (inicio > 2)      mostrar.push(null)          // ellipsis esquerdo
    for (let i = inicio; i <= fim; i++) mostrar.push(i)
    if (fim < total - 1) mostrar.push(null)          // ellipsis direito
    mostrar.push(total)
    return mostrar
  }

  return (
    <>
      {paginas().map((p, idx) =>
        p === null ? (
          <PaginationItem key={`ell-${idx}`}>
            <PaginationEllipsis />
          </PaginationItem>
        ) : (
          <PaginationItem key={p}>
            <PaginationLink
              href="#"
              isActive={atual === p}
              onClick={(e) => { e.preventDefault(); onChange(p) }}
            >
              {p}
            </PaginationLink>
          </PaginationItem>
        )
      )}
    </>
  )
}
