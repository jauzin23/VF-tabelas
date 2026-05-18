"""
main.py — Ponto de entrada da API FastAPI.
Agrega todas as rotas, middleware e gestão do ciclo de vida.
Integra o sistema de filas para containers com pouca RAM.
"""
import asyncio
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from config import registo, garantir_ambiente_carregado
from tarefas import (
    criar_tarefa, inicializar_tarefa, executar_tarefa, publicar_e_persistir,
    obter_tarefa, eliminar_tarefa, listar_tarefas, formatar_tarefa,
    preparar_resposta_bloqueante, obter_eventos_tarefa, manutencao_canais_loop,
    fila_global, tarefas as tarefas_cache, ia_em_uso_por_tarefa,
    existem_tarefas_ativas_ou_pendentes,
)
from detetor import (
    detetar_tabelas_em_imagem, modelos_carregados,
    gestor_ia_ram_loop, descarregar_modelos,
)

garantir_ambiente_carregado()

# ── Ciclo de Vida ────────────────────────────────────────────────────────────

@asynccontextmanager
async def ciclo_vida(app: FastAPI):
    # Silenciar erros comuns do Playwright/Patchright que não afetam a lógica
    loop = asyncio.get_running_loop()
    manipulador_original = loop.get_exception_handler()
    
    def _manipulador_excecoes(loop, context):
        exc = context.get("exception")
        msg = context.get("message", "")
        if (exc and "TargetClosedError" in str(type(exc))) or "TargetClosedError" in msg:
            return
        if manipulador_original: manipulador_original(loop, context)
        else: loop.default_exception_handler(context)
            
    loop.set_exception_handler(_manipulador_excecoes)

    registo.info("A iniciar serviços de background...")
    
    # Iniciar fila global
    await fila_global.iniciar()
    
    # Iniciar tarefas de background
    tarefa_manutencao = asyncio.create_task(manutencao_canais_loop())
    tarefa_gestor_ram = asyncio.create_task(gestor_ia_ram_loop())
    
    yield
    
    registo.info("A encerrar serviços de background...")
    tarefa_manutencao.cancel()
    tarefa_gestor_ram.cancel()
    await fila_global.parar()


app = FastAPI(
    title="VF-Tabelas",
    version="1.2.0",
    lifespan=ciclo_vida
)

_origens_raw = os.getenv("ALLOWED_ORIGINS", "*").strip()
if _origens_raw == "*":
    _origens_permitidas = ["*"]
    _permitir_credenciais = False
else:
    _origens_permitidas = [o.strip() for o in _origens_raw.split(",") if o.strip()]
    _permitir_credenciais = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origens_permitidas,
    allow_credentials=_permitir_credenciais,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Modelos de Dados (Pydantic) ────────────────────────────────────────────────

class CargaCriarTarefa(BaseModel):
    url: Optional[str] = None
    urls: Optional[List[str]] = None
    opcoes: Optional[dict] = None
    sse: Optional[bool] = False

class CargaPaginacao(BaseModel):
    urls: Optional[List[str]] = None
    opcoes: Optional[dict] = None
    sse: Optional[bool] = False


# ── Rotas: Saúde ──────────────────────────────────────────────────────────────

@app.get("/saude")
async def saude():
    return "ok"


# ── Rotas: Tarefas ────────────────────────────────────────────────────────────

@app.get("/api/tarefas")
async def api_listar_tarefas():
    return listar_tarefas()

@app.post("/api/tarefas", status_code=201)
async def api_criar_tarefa(carga: CargaCriarTarefa):
    if not carga.url and not carga.urls:
        raise HTTPException(status_code=400, detail="É necessário fornecer 'url' ou 'urls'")
    
    carga_dict = carga.dict()
    if carga.sse:
        # Modo SSE: enfileirar e retornar imediatamente
        try:
            tarefa, posicao = await criar_tarefa(carga_dict)
        except asyncio.QueueFull:
            raise HTTPException(
                status_code=503,
                detail="Servidor ocupado — a fila de tarefas está cheia. Tente mais tarde."
            )
        return {
            "id":        tarefa["id"],
            "url_alvo":  tarefa["url_alvo"],
            "estado":    tarefa["estado"],
            "criado_em": tarefa["criado_em"],
            "posicao_fila": posicao,
        }
    else:
        # Modo bloqueante: executar diretamente (sem fila)
        tarefa = inicializar_tarefa(carga_dict)
        await publicar_e_persistir(tarefa)
        descarregar_modelos()
        await executar_tarefa(tarefa["id"])
        return preparar_resposta_bloqueante(tarefa)

@app.get("/api/tarefas/{id_tarefa}")
async def api_obter_tarefa(id_tarefa: str):
    tarefa = obter_tarefa(id_tarefa)
    if not tarefa: raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa

@app.delete("/api/tarefas/{id_tarefa}")
async def api_eliminar_tarefa(id_tarefa: str):
    if not eliminar_tarefa(id_tarefa):
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return {"sucesso": True}

@app.get("/api/tarefas/{id_tarefa}/eventos")
async def api_eventos_tarefa(id_tarefa: str, pedido: Request, format: Optional[str] = None):
    tarefa = obter_tarefa(id_tarefa)
    if not tarefa: raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    
    if format == "json": return JSONResponse(tarefa)
    
    return StreamingResponse(
        obter_eventos_tarefa(id_tarefa, pedido, estado_inicial=tarefa),
        media_type="text/event-stream"
    )

@app.get("/api/tarefas/{id_tarefa}/imagens")
async def api_imagens_tarefa(id_tarefa: str):
    tarefa = obter_tarefa(id_tarefa)
    if not tarefa: raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return {"id": id_tarefa, "resultados": tarefa.get("resultados", [])}


# ── Rotas: Modelo IA ──────────────────────────────────────────────────────────

@app.post("/api/modelo/detetar-tabela")
async def api_detetar_tabela(ficheiro: UploadFile = File(...)):
    try:
        conteudo = await ficheiro.read()
        from PIL import Image
        import io
        imagem = Image.open(io.BytesIO(conteudo)).convert("RGB")
        
        resultado, _ = await detetar_tabelas_em_imagem(imagem)
        if not isinstance(resultado, dict): return JSONResponse(content=[])
        
        return JSONResponse(content={"tem_tabela": resultado.get("tem_tabela", False)})
    except Exception as e:
        registo.error(f"Erro ao processar imagem em memória: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao processar imagem: {str(e)}")


# ── Rotas: Paginação Multi-URLs ───────────────────────────────────────────────

@app.post("/api/paginacao-multurls", status_code=201)
async def api_paginacao_multurls(carga: CargaPaginacao):
    if not carga.urls: raise HTTPException(status_code=400, detail="É necessário fornecer 'urls'")
    
    carga_dict = {
        "urls": carga.urls, 
        "opcoes": {"ignorar_nav_footer": True}
    }
    
    if carga.sse:
        try:
            tarefa, posicao = await criar_tarefa(carga_dict)
        except asyncio.QueueFull:
            raise HTTPException(
                status_code=503,
                detail="Servidor ocupado — a fila de tarefas está cheia. Tente mais tarde."
            )
        return {
            "id":        tarefa["id"],
            "url_alvo":  tarefa["url_alvo"],
            "estado":    tarefa["estado"],
            "criado_em": tarefa["criado_em"],
            "posicao_fila": posicao,
        }
    else:
        tarefa = inicializar_tarefa(carga_dict)
        await publicar_e_persistir(tarefa)
        descarregar_modelos()
        await executar_tarefa(tarefa["id"])
        return preparar_resposta_bloqueante(tarefa)


# ── Rotas: Sistema (Monitorização) ───────────────────────────────────────────

@app.get("/api/sistema/fila")
async def api_fila():
    """Estado atual da fila de tarefas."""
    return fila_global.info()

@app.get("/api/sistema/memoria")
async def api_memoria():
    """Uso de memória do processo backend."""
    dados_extra = {
        "modelos_carregados": modelos_carregados(),
        "ia_em_uso_por_tarefa": ia_em_uso_por_tarefa(),
        "tarefas_ativas_ou_pendentes": existem_tarefas_ativas_ou_pendentes(),
        "tarefas_em_memoria": len(tarefas_cache),
        "fila": fila_global.info(),
    }
    try:
        import psutil
        proc = psutil.Process(os.getpid())
        mem = proc.memory_info()
        return {
            "rss_mb": round(mem.rss / 1024 / 1024, 1),
            "vms_mb": round(mem.vms / 1024 / 1024, 1),
            **dados_extra
        }
    except ImportError:
        return {
            "erro": "psutil não instalado",
            **dados_extra
        }


# ── Execução ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    porta = int(os.getenv("BACKEND_PORT", 4000))
    registo.info(f"A iniciar o backend Python na porta {porta}")
    uvicorn.run(app, host="0.0.0.0", port=porta)