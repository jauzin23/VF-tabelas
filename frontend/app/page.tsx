import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardStats } from "@/components/dashboard-stats";
import { TaskList } from "@/components/task-list";

export default function PaginaInicial() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Painel
        </h1>
      </div>

      <DashboardStats />

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
  );
}
