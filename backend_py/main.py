import asyncio
import sys
import os
import torch

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from rotas.tarefas import rota as rota_tarefas
from rotas.modelo import rota as rota_modelo
from rotas.paginacao import rota as rota_paginacao
from utilitarios.registo import registo
from utilitarios.ambiente import garantir_ambiente_carregado
from servicos.eventos_tarefa import iniciar_tarefa_manutencao


@asynccontextmanager
async def ciclo_vida(app: FastAPI):
    loop = asyncio.get_running_loop()
    manipulador_original = loop.get_exception_handler()
    
    def _manipulador_excecoes(loop, context):
        exc = context.get("exception")
        msg = context.get("message", "")
        if (exc and "TargetClosedError" in str(type(exc))) or "TargetClosedError" in msg:
            return
        if manipulador_original:
            manipulador_original(loop, context)
        else:
            loop.default_exception_handler(context)
            
    loop.set_exception_handler(_manipulador_excecoes)

    registo.info("A iniciar serviços de background...")
    tarefa_manutencao = iniciar_tarefa_manutencao()
    yield
    registo.info("A encerrar serviços de background...")
    tarefa_manutencao.cancel()


garantir_ambiente_carregado()

app = FastAPI(
    title="VF-Tabelas",
    version="1.0.1",
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


@app.get("/saude")
async def saude():
    return "ok"


app.include_router(rota_tarefas)
app.include_router(rota_modelo)
app.include_router(rota_paginacao)

if __name__ == "__main__":
    import uvicorn
    porta = int(os.getenv("BACKEND_PORT", 4000))
    registo.info(f"A iniciar o backend Python na porta {porta}")
    uvicorn.run(app, host="0.0.0.0", port=porta)