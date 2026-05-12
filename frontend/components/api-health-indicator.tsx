"use client"

import { useCallback, useEffect, useState } from "react"
import { Cpu, ServerCrash, ServerCog } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { api, getApiBaseUrl } from "@/lib/api"

type Estado = "a_verificar" | "ok" | "erro"

export function ApiHealthIndicator() {
  const [estado, setEstado] = useState<Estado>("a_verificar")
  const [dispositivo, setDispositivo] = useState<string>("")
  const [base, setBase] = useState<string>("")

  const verificar = useCallback(async () => {
    setEstado("a_verificar")
    setBase(getApiBaseUrl())
    try {
      const r = await api.saude()
      setDispositivo(r.dispositivo)
      setEstado("ok")
    } catch {
      setEstado("erro")
    }
  }, [])

  useEffect(() => {
    verificar()
    const handler = () => verificar()
    window.addEventListener("vf_tabelas_api_changed", handler)
    const interval = setInterval(verificar, 30000)
    return () => {
      window.removeEventListener("vf_tabelas_api_changed", handler)
      clearInterval(interval)
    }
  }, [verificar])

  let icone = ServerCog
  let texto = "A verificar…"
  let estilos = "bg-muted text-muted-foreground"

  if (estado === "ok") {
    icone = Cpu
    texto = `Online • ${dispositivo}`
    estilos = "bg-chart-1/15 text-chart-1 border-chart-1/30"
  } else if (estado === "erro") {
    icone = ServerCrash
    texto = "Offline"
    estilos = "bg-destructive/15 text-destructive border-destructive/30"
  }

  const Icone = icone

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={verificar}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            aria-label="Verificar estado da API"
          >
            <Badge variant="outline" className={`gap-1.5 ${estilos}`}>
              <Icone className="size-3.5" />
              <span className="hidden sm:inline">{texto}</span>
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="font-medium">Estado do backend</div>
          <div className="text-muted-foreground">{base || "—"}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
