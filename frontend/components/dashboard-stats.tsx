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
  const { lastUpdate } = useTarefasLocais()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [aCarregar, setACarregar] = useState(true)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setACarregar(true)
      try {
        const r = await api.listarTarefas()
        if (cancelado) return
        setTarefas(r)
      } catch (e) {
        console.error("Erro ao carregar estatísticas:", e)
      } finally {
        if (!cancelado) setACarregar(false)
      }
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [lastUpdate])

  const emCurso = tarefas.filter(
    (t) => t.estado === "em_execucao" || t.estado === "pendente" || t.esta_a_correr,
  ).length
  const concluidas = tarefas.filter((t) => t.estado === "concluido").length
  const imagens = tarefas.reduce(
    (acc, t) => acc + (t.progresso?.imagens_encontradas ?? 0),
    0,
  )
  const tabelas = tarefas.reduce(
    (acc, t) => acc + (t.progresso?.tabelas_detetadas ?? 0),
    0,
  )

  const cartoes = [
    {
      titulo: "Total de tarefas",
      valor: tarefas.length,
      descricao: "No servidor",
      icone: ListChecks,
    },
    {
      titulo: "Em curso",
      valor: emCurso,
      descricao: `${concluidas} concluídas`,
      icone: Activity,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
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
              {aCarregar && tarefas.length === 0 ? (
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
