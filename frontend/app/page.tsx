import Link from "next/link"
import {
  ListChecks,
  PlusCircle,
  ImageIcon,
  ArrowRight,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { DashboardStats } from "@/components/dashboard-stats"
import { TaskList } from "@/components/task-list"

export default function PaginaInicial() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Painel de extração
        </h1>
        <p className="text-balance text-muted-foreground">
          Gere tarefas de scraping e deteção de tabelas em páginas web, com
          acompanhamento em tempo real do progresso.
        </p>
      </div>

      <DashboardStats />

      <div className="grid gap-4 md:grid-cols-1 grid-rows-2">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PlusCircle className="size-4 text-primary" />
              Nova tarefa
            </CardTitle>
            <CardDescription>
              Submete um URL ou um lote para iniciar a extração.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/tarefas?nova=true">
                Criar tarefa
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="size-4 text-primary" />
              Detetar imagem
            </CardTitle>
            <CardDescription>
              Carrega uma imagem para deteção direta de tabelas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/detetar">
                Abrir detetor
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Tarefas recentes
            </h2>
            <p className="text-sm text-muted-foreground">
              Lista das tarefas criadas a partir deste navegador.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/tarefas">
              Ver todas
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <TaskList limite={5} compacto />
      </div>
    </div>
  )
}
