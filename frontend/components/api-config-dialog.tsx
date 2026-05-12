"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { getApiBaseUrl, setApiBaseUrl, api } from "@/lib/api"

interface Props {
  trigger: React.ReactNode
}

export function ApiConfigDialog({ trigger }: Props) {
  const [aberto, setAberto] = useState(false)
  const [url, setUrl] = useState("")
  const [aTestar, setATestar] = useState(false)

  useEffect(() => {
    if (aberto) setUrl(getApiBaseUrl())
  }, [aberto])

  async function guardar() {
    setApiBaseUrl(url)
    toast.success("Configuração guardada", {
      description: `Base URL definida para ${url}`,
    })
    setAberto(false)
    window.dispatchEvent(new Event("vf_tabelas_api_changed"))
  }

  async function testar() {
    setATestar(true)
    const anterior = getApiBaseUrl()
    setApiBaseUrl(url)
    try {
      const r = await api.saude()
      toast.success("Ligação estabelecida", {
        description: `Serviço ${r.servico} • Dispositivo ${r.dispositivo}`,
      })
    } catch (e) {
      setApiBaseUrl(anterior)
      const msg = e instanceof Error ? e.message : "Erro desconhecido"
      toast.error("Falha ao ligar", { description: msg })
    } finally {
      setATestar(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuração da API</DialogTitle>
          <DialogDescription>
            Define o endereço base onde o backend VF-Tabelas se encontra em
            execução.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="api-url">URL base</Label>
            <Input
              id="api-url"
              placeholder="http://localhost:4000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Não incluir a barra final. Exemplo: <code>http://localhost:4000</code>
            </p>
          </div>
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Endpoint de saúde</AlertTitle>
            <AlertDescription>
              É invocado <code>GET /saude</code> para validar a ligação.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={testar}
            disabled={aTestar || !url}
          >
            {aTestar ? "A testar…" : "Testar ligação"}
          </Button>
          <Button type="button" onClick={guardar} disabled={!url}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
