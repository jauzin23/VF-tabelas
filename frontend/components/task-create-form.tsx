"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Link as LinkIcon, Layers, Sparkles, Settings2 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"

import { api } from "@/lib/api"
import { useTarefasLocais } from "@/lib/store"
import type { OpcoesTarefa } from "@/lib/types"

// Apenas opções que fazem sentido expor ao utilizador.
// Os ajustes técnicos (timeout por página, concorrência de scraping/análise)
// usam os valores definidos no servidor (.env) e não são expostos no UI.
// Para URLs em lote, as opções são desativadas (processamento sequencial).
type OpcoesUI = Required<
  Pick<
    OpcoesTarefa,
    | "maxPages"
    | "maxDepth"
    | "seguirPaginacao"
    | "seguirDetalhe"
  >
>

const PADRAO: OpcoesUI = {
  maxPages: 5,
  maxDepth: 2,
  seguirPaginacao: true,
  seguirDetalhe: true,
}

export function TaskCreateForm({ noCard = false }: { noCard?: boolean }) {
  const router = useRouter()
  const { adicionar } = useTarefasLocais()

  const [modo, setModo] = useState<"unico" | "lote">("unico")
  const [url, setUrl] = useState("")
  const [urlsTexto, setUrlsTexto] = useState("")
  const [aSubmeter, setASubmeter] = useState(false)
  const [opcoes, setOpcoes] = useState<OpcoesUI>(PADRAO)

  function actualizar<K extends keyof OpcoesUI>(chave: K, valor: OpcoesUI[K]) {
    setOpcoes((o) => ({ ...o, [chave]: valor }))
  }

  function parseUrls(texto: string): string[] {
    return texto
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  function validarUrl(u: string): boolean {
    try {
      new URL(u)
      return true
    } catch {
      return false
    }
  }

  async function submeter() {
    setASubmeter(true)
    try {
      if (modo === "unico") {
        if (!validarUrl(url)) {
          toast.error("URL inválido", {
            description: "Inclui o esquema (http:// ou https://).",
          })
          return
        }
        const t = await api.criarTarefa(url, opcoes)
        adicionar()
        toast.success("Tarefa criada", {
          description: "A redirecionar para o acompanhamento…",
        })
        router.push(`/tarefas/${t.id}`)
      } else {
        const lista = parseUrls(urlsTexto)
        if (lista.length === 0) {
          toast.error("Lista vazia", {
            description: "Indica pelo menos um URL.",
          })
          return
        }
        const invalidos = lista.filter((u) => !validarUrl(u))
        if (invalidos.length > 0) {
          toast.error(`${invalidos.length} URL(s) inválidos`, {
            description: invalidos.slice(0, 3).join("\n"),
          })
          return
        }
        const t = await api.criarTarefaLote(lista)
        adicionar()
        toast.success("Tarefa em lote criada", {
          description: `${lista.length} URLs enviados.`,
        })
        router.push(`/tarefas/${t.id}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido"
      toast.error("Falha ao criar tarefa", { description: msg })
    } finally {
      setASubmeter(false)
    }
  }

  const urlsParsed = parseUrls(urlsTexto)

  const FormContent = (
    <CardContent className={noCard ? "p-0" : ""}>
      {noCard && <div className="mb-4" />}
      <div className="space-y-6">
        <div>
          <Label className="mb-2 block text-sm font-medium">Origem</Label>
          <Tabs
            value={modo}
            onValueChange={(v) => setModo(v as "unico" | "lote")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="unico">
                <LinkIcon className="size-4" />
                URL único
              </TabsTrigger>
              <TabsTrigger value="lote">
                <Layers className="size-4" />
                Lote de URLs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="unico" className="pt-4">
              <div className="grid gap-2">
                <Label htmlFor="url">URL alvo</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://exemplo.pt"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </TabsContent>

            <TabsContent value="lote" className="pt-4">
              <div className="grid gap-2">
                <Label htmlFor="urls">Lista de URLs</Label>
                <Textarea
                  id="urls"
                  rows={8}
                  placeholder={"https://exemplo1.pt\nhttps://exemplo2.pt\nhttps://exemplo3.pt"}
                  value={urlsTexto}
                  onChange={(e) => setUrlsTexto(e.target.value)}
                  spellCheck={false}
                  className="font-mono text-sm"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Um URL por linha, ou separados por vírgulas.</span>
                  <span className="tabular-nums">
                    {urlsParsed.length} URL{urlsParsed.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <Separator className="my-6" />

          {modo === "unico" && (
            <Accordion type="single" collapsible defaultValue="opcoes">
              <AccordionItem value="opcoes" className="border-none">
                <AccordionTrigger className="text-sm font-medium pt-0">
                  <span className="flex items-center gap-2">
                    <Settings2 className="size-4" />
                    Opções de execução
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-6 pt-2">
                  <SliderField
                    id="maxPages"
                    rotulo="Máximo de páginas por URL"
                    ajuda="0 = sem limite"
                    min={0}
                    max={50}
                    step={1}
                    valor={opcoes.maxPages}
                    onChange={(v) => actualizar("maxPages", v)}
                  />
                  <SliderField
                    id="maxDepth"
                    rotulo="Profundidade máxima"
                    ajuda="0 = sem limite"
                    min={0}
                    max={50}
                    step={1}
                    valor={opcoes.maxDepth}
                    onChange={(v) => actualizar("maxDepth", v)}
                  />

                  <Separator />

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="seguirPag" className="text-sm">
                        Seguir paginação
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Acompanha ligações para próximas páginas.
                      </p>
                    </div>
                    <Switch
                      id="seguirPag"
                      checked={opcoes.seguirPaginacao}
                      onCheckedChange={(v) => actualizar("seguirPaginacao", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="seguirDet" className="text-sm">
                        Seguir páginas de detalhe
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Acede a páginas individuais de produtos/artigos.
                      </p>
                    </div>
                    <Switch
                      id="seguirDet"
                      checked={opcoes.seguirDetalhe}
                      onCheckedChange={(v) => actualizar("seguirDetalhe", v)}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpcoes(PADRAO)}
              disabled={aSubmeter}
            >
              Repor predefinições
            </Button>
            <Button
              type="button"
              onClick={submeter}
              disabled={
                aSubmeter ||
                (modo === "unico" ? !url : urlsParsed.length === 0)
              }
            >
              {aSubmeter ? (
                <>
                  <Spinner className="size-4" />
                  A criar…
                </>
              ) : (
                "Criar tarefa"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
  )

  if (noCard) {
    return FormContent
  }

  return (
    <div className="gap-6">
      <Card className="lg:col-span-2">{FormContent}</Card>
    </div>
  )
}

function Item({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </>
  )
}

function SliderField({
  id,
  rotulo,
  ajuda,
  min,
  max,
  step,
  valor,
  onChange,
  formatar,
}: {
  id: string
  rotulo: string
  ajuda: string
  min: number
  max: number
  step: number
  valor: number
  onChange: (v: number) => void
  formatar?: (v: number) => string
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{rotulo}</Label>
        <span className="text-sm font-medium tabular-nums">
          {formatar ? formatar(valor) : valor}
        </span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[valor]}
        onValueChange={(v) => onChange(v[0] ?? min)}
      />
      <p className="text-xs text-muted-foreground">{ajuda}</p>
    </div>
  )
}
