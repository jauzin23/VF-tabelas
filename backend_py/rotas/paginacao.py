from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from servicos.gestor_tarefas import (
    inicializar_tarefa, executar_tarefa, publicar_e_persistir, 
    formatar_tarefa, criar_tarefa, preparar_resposta_bloqueante
)

rota = APIRouter(prefix="/api/paginacao-multurls", tags=["paginacao"])


class CargaPaginacao(BaseModel):
    urls: Optional[List[str]] = None
    opcoes: Optional[dict] = None
    sse: Optional[bool] = False


@rota.post("", status_code=201)
async def api_paginacao_multurls(carga: CargaPaginacao):
    if not carga.urls:
        raise HTTPException(status_code=400, detail="É necessário fornecer 'urls'")
    
    carga_dict = {
        "urls": carga.urls, 
        "opcoes": {"ignorar_nav_footer": True} # Forçamos opções limpas para multi-URL
    }
    
    if carga.sse:
        tarefa = criar_tarefa(carga_dict)
        return {
            "id":        tarefa["id"],
            "url_alvo":  tarefa["url_alvo"],
            "estado":    tarefa["estado"],
            "criado_em": tarefa["criado_em"]
        }
    else:
        tarefa = inicializar_tarefa(carga_dict)
        await publicar_e_persistir(tarefa)
        await executar_tarefa(tarefa["id"])
        
        # Retornamos a resposta formatada para modo bloqueante
        return preparar_resposta_bloqueante(tarefa)
