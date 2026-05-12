"use client"

import { useEffect, useState, useCallback } from "react"

const KEY = "vf_tabelas_tarefas_locais"

export interface TarefaLocal {
  id: string
  url_alvo: string
  criado_em: string
}

function ler(): TarefaLocal[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function escrever(lista: TarefaLocal[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(KEY, JSON.stringify(lista))
}

export function useTarefasLocais() {
  const [tarefas, setTarefas] = useState<TarefaLocal[]>([])

  useEffect(() => {
    setTarefas(ler())
    const handler = () => setTarefas(ler())
    window.addEventListener("storage", handler)
    window.addEventListener("vf_tabelas_local_update", handler)
    return () => {
      window.removeEventListener("storage", handler)
      window.removeEventListener("vf_tabelas_local_update", handler)
    }
  }, [])

  const adicionar = useCallback((tarefa: TarefaLocal) => {
    const atual = ler()
    if (atual.find((t) => t.id === tarefa.id)) return
    const novo = [tarefa, ...atual]
    escrever(novo)
    setTarefas(novo)
    window.dispatchEvent(new Event("vf_tabelas_local_update"))
  }, [])

  const remover = useCallback((id: string) => {
    const atual = ler().filter((t) => t.id !== id)
    escrever(atual)
    setTarefas(atual)
    window.dispatchEvent(new Event("vf_tabelas_local_update"))
  }, [])

  const limpar = useCallback(() => {
    escrever([])
    setTarefas([])
    window.dispatchEvent(new Event("vf_tabelas_local_update"))
  }, [])

  return { tarefas, adicionar, remover, limpar }
}
