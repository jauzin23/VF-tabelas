"use client"

import { useEffect, useState } from "react"
import { Activity, ImageIcon, ListChecks, TableProperties } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useTarefasLocais } from "@/lib/store"
import { api } from "@/lib/api"
import type { Tarefa } from "@/lib/types"

export function DashboardStats() {
  const { tarefas: locais } = useTarefasLocais()
  const [carregadas, setCarregadas] = useState<Tarefa[]>([])
  const [aCarregar, setACarregar] = useState(true)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setACarregar(true)
      const resultados = await Promise.all(
        locais.map(async (t) => {
          try {
            return await api.listarTarefa(t.id)
          } catch {
            return null
          }
        }),
      )
      if (cancelado) return
      setCarregadas(resultados.filter(Boolean) as Tarefa[])
      setACarregar(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [locais])

  const emCurso = carregadas.filter(
    (t) => t.estado === "em_execucao" || t.estado === "em_fila",
  ).length
  const concluidas = carregadas.filter((t) => t.estado === "concluido").length
  const imagens = carregadas.reduce(
    (acc, t) => acc + (t.progresso?.imagens_encontradas ?? 0),
    0,
  )
  const tabelas = carregadas.reduce(
    (acc, t) => acc + (t.progresso?.tabelas_detetadas ?? 0),
    0,
  )

  const cartoes = [
    {
      titulo: "Tarefas locais",
      valor: locais.length,
      descricao: "Criadas neste navegador",
      icone: ListChecks,
    },
    {
      titulo: "Em curso",
      valor: emCurso,
      descricao: `${concluidas} concluídas`,
      icone: Activity,
    },
    {
      titulo: "Imagens encontradas",
      valor: imagens,
      descricao: "Soma de todas as tarefas",
      icone: ImageIcon,
    },
    {
      titulo: "Tabelas detetadas",
      valor: tabelas,
      descricao: "Identificadas pelo modelo",
      icone: TableProperties,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cartoes.map((c) => {
        const Icone = c.icone
        return (
          <Card key={c.titulo}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.titulo}
              </CardTitle>
              <Icone className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {aCarregar && locais.length > 0 ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-semibold tracking-tight">
                  {c.valor.toLocaleString("pt-PT")}
                </div>
              )}
              <CardDescription className="mt-1 text-xs">
                {c.descricao}
              </CardDescription>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
