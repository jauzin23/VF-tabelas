from fastapi import APIRouter, HTTPException, Request
from typing import List, Optional
from pydantic import BaseModel
import os
from servicos.gestor_tarefas import (
    criar_tarefa, inicializar_tarefa, executar_tarefa, publicar_e_persistir, 
    obter_tarefa, eliminar_tarefa, listar_tarefas, formatar_tarefa,
    preparar_resposta_bloqueante
)
from servicos.eventos_tarefa import obter_eventos_tarefa
from fastapi.responses import StreamingResponse, JSONResponse

rota = APIRouter(prefix="/api/tarefas", tags=["tarefas"])


@rota.get("")
async def api_listar_tarefas():
    return listar_tarefas()


class CargaCriarTarefa(BaseModel):
    url: Optional[str] = None
    urls: Optional[List[str]] = None
    opcoes: Optional[dict] = None
    sse: Optional[bool] = False


@rota.post("", status_code=201)
async def api_criar_tarefa(carga: CargaCriarTarefa):
    if not carga.url and not carga.urls:
        raise HTTPException(status_code=400, detail="É necessário fornecer 'url' ou 'urls'")
    
    if carga.sse:
        # Modo SSE: retorna ID imediatamente e executa em background
        tarefa = criar_tarefa(carga.dict())
        return {
            "id":        tarefa["id"],
            "url_alvo":  tarefa["url_alvo"],
            "estado":    tarefa["estado"],
            "criado_em": tarefa["criado_em"]
        }
    else:
        # Modo Bloqueante: aguarda conclusão e retorna resultados
        tarefa = inicializar_tarefa(carga.dict())
        await publicar_e_persistir(tarefa)
        await executar_tarefa(tarefa["id"])
        
        # Retornamos a resposta formatada para modo bloqueante
        return preparar_resposta_bloqueante(tarefa)


@rota.get("/{id_tarefa}")
async def api_obter_tarefa(id_tarefa: str):
    tarefa = obter_tarefa(id_tarefa)
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa


@rota.delete("/{id_tarefa}")
async def api_eliminar_tarefa(id_tarefa: str):
    sucesso = eliminar_tarefa(id_tarefa)
    if not sucesso:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return {"sucesso": True}


@rota.get("/{id_tarefa}/eventos")
async def api_eventos_tarefa(id_tarefa: str, pedido: Request, format: Optional[str] = None):
    tarefa = obter_tarefa(id_tarefa)
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    
    # JSON mode: return task state as single JSON object
    if format == "json":
        return JSONResponse(tarefa)
    
    # SSE mode (default): stream events
    return StreamingResponse(
        obter_eventos_tarefa(id_tarefa, pedido, estado_inicial=tarefa),
        media_type="text/event-stream"
    )


@rota.get("/{id_tarefa}/imagens")
async def api_imagens_tarefa(id_tarefa: str):
    tarefa = obter_tarefa(id_tarefa)
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return {
        "id":         id_tarefa,
        "resultados": tarefa.get("resultados", [])
    }
