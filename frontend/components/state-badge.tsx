import { CheckCircle2, Clock, ListOrdered, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { rotuloEstado } from "@/lib/format"
import type { EstadoTarefa } from "@/lib/types"

interface Props {
  estado: EstadoTarefa
  posicaoFila?: number | null
  className?: string
}

export function StateBadge({ estado, posicaoFila, className }: Props) {
  let icone = Clock
  let estilos = "bg-muted text-muted-foreground"
  let animar = false

  switch (estado) {
    case "pendente":
      icone = Clock
      estilos = "bg-muted text-foreground"
      break
    case "na_fila":
      icone = ListOrdered
      estilos = "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
      break
    case "em_execucao":
      icone = Loader2
      estilos = "bg-chart-2/15 text-chart-2 border-chart-2/30"
      animar = true
      break
    case "concluido":
      icone = CheckCircle2
      estilos = "bg-chart-1/15 text-chart-1 border-chart-1/30"
      break
    case "falhou":
      icone = XCircle
      estilos = "bg-destructive/15 text-destructive border-destructive/30"
      break
  }

  const Icone = icone

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 px-2 py-0.5 font-medium", estilos, className)}
    >
      <Icone className={cn("size-3.5", animar && "animate-spin")} />
      {rotuloEstado(estado)}
      {estado === "na_fila" && posicaoFila != null && (
        <span className="tabular-nums">#{posicaoFila}</span>
      )}
    </Badge>
  )
}
