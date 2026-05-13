"use client"

import { useEffect, useState, useCallback } from "react"

export function useTarefasLocais() {
  const [lastUpdate, setLastUpdate] = useState(0)

  useEffect(() => {
    const handler = () => setLastUpdate(Date.now())
    window.addEventListener("vf_tabelas_local_update", handler)
    return () => {
      window.removeEventListener("storage", handler)
      window.removeEventListener("vf_tabelas_local_update", handler)
    }
  }, [])

  const adicionar = useCallback(() => {
    window.dispatchEvent(new Event("vf_tabelas_local_update"))
  }, [])

  const remover = useCallback(() => {
    window.dispatchEvent(new Event("vf_tabelas_local_update"))
  }, [])

  const limpar = useCallback(() => {
    window.dispatchEvent(new Event("vf_tabelas_local_update"))
  }, [])

  return { lastUpdate, adicionar, remover, limpar }
}
