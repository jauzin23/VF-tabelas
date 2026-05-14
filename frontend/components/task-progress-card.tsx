"use client"

import {
  FileSearch,
  Files,
  ImageIcon,
  ImagePlus,
  Layers,
  ScanSearch,
  Sparkles,
  TableProperties,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import type { Tarefa } from "@/lib/types"

interface Props {
  tarefa: Tarefa
}

export function TaskProgressCard({ tarefa }: Props) {
  const p = tarefa.progresso
  const totalPaginas = p.paginas_descobertas || 0
  const feitas = p.paginas_processadas || 0
  const percentPaginas =
    totalPaginas > 0 ? Math.round((feitas / totalPaginas) * 100) : 0

  const totalImagens = p.imagens_unicas || p.imagens_encontradas || 0
  const analisadas = p.imagens_analisadas || 0
  const percentAnalise =
    totalImagens > 0 ? Math.round((analisadas / totalImagens) * 100) : 0

  const metricas = [
    {
      titulo: "Páginas Descobertas",
      valor: p.paginas_descobertas,
      icone: FileSearch,
    },
    {
      titulo: "Páginas Processadas",
      valor: p.paginas_processadas,
      icone: Files,
    },
    {
      titulo: "Imagens (Bulk)",
      valor: p.imagens_bulk,
      icone: Sparkles,
    },
    {
      titulo: "Imagens Únicas",
      valor: p.imagens_unicas === 0 ? "a carregar" : p.imagens_unicas === undefined ? "a carregar" : p.imagens_unicas,
      icone: ImagePlus, 
    },
    {
      titulo: "Imagens Analisadas",
      valor: p.imagens_analisadas,
      icone: ScanSearch,
    }
  ]

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progresso global</CardTitle>
          <CardDescription>
            Acompanhamento do scraping e da análise de imagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <BarraProgresso
            rotulo="Páginas processadas"
            descricao={`${feitas} de ${totalPaginas || "-"}`}
            valor={percentPaginas}
          />
          <BarraProgresso
            rotulo="Imagens analisadas"
            descricao={`${analisadas} de ${totalImagens || "-"}`}
            valor={percentAnalise}
          />
          {tarefa.url_atual && tarefa.esta_a_correr && (
            <>
              <Separator />
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  A processar
                </span>
                <span className="truncate font-mono text-sm">
                  {tarefa.url_atual}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {metricas.map((m) => {
          const Icone = m.icone
          return (
            <Card key={m.titulo} className={m.destaque ? "border-primary/40 bg-primary/5" : undefined}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {m.titulo}
                </CardTitle>
                <Icone className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {(m.valor ?? 0).toLocaleString("pt-PT")}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function BarraProgresso({
  rotulo,
  descricao,
  valor,
}: {
  rotulo: string
  descricao: string
  valor: number
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{rotulo}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {valor}%
        </span>
      </div>
      <Progress value={valor} />
      <span className="text-xs text-muted-foreground">{descricao}</span>
    </div>
  )
}
