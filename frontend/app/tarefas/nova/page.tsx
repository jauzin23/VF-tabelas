import { TaskCreateForm } from "@/components/task-create-form"

export default function PaginaNovaTarefa() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Nova tarefa
        </h1>
        <p className="text-balance text-muted-foreground">
          Configura os parâmetros de extração e submete um URL único ou um lote
          de URLs para processamento.
        </p>
      </div>
      <TaskCreateForm />
    </div>
  )
}
