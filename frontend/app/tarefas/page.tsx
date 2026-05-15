"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/task-list";
import { TaskCreateForm } from "@/components/task-create-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function TarefasContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("nova") === "true") {
      setOpen(true);
      // Limpar o parâmetro da URL sem recarregar
      const params = new URLSearchParams(searchParams.toString());
      params.delete("nova");
      router.replace(`/tarefas?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Tarefas
          </h1>
          <p className="text-balance text-muted-foreground">
            Pesquisa, filtra e ordena tarefas
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="size-4" />
              Nova tarefa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova tarefa</DialogTitle>
              <DialogDescription>
                Configura os parâmetros de extração e submete um URL único ou um
                lote de URLs para processamento.
              </DialogDescription>
            </DialogHeader>
            <TaskCreateForm noCard />
          </DialogContent>
        </Dialog>
      </div>
      <TaskList />
    </div>
  );
}

export default function PaginaTarefas() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <TarefasContent />
    </Suspense>
  );
}
