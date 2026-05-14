import Link from "next/link"
import { PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TaskList } from "@/components/task-list"

export default function PaginaTarefas() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Tarefas
          </h1>
          <p className="text-balance text-muted-foreground">
            Pesquisa, filtra e ordena tarefas.
          </p>
        </div>
        <Button asChild>
          <Link href="/tarefas/nova">
            <PlusCircle className="size-4" />
            Nova tarefa
          </Link>
        </Button>
      </div>
      <TaskList />
    </div>
  )
}
