import asyncio
import json
from datetime import datetime
from utilitarios.registo import registo

canais_eventos = {}


async def publicar_atualizacao_tarefa(tarefa):
    id_tarefa = tarefa["id"]
    if id_tarefa in canais_eventos:
        mensagem = json.dumps(tarefa)
        for fila in canais_eventos[id_tarefa]:
            await fila.put(mensagem)


async def obter_eventos_tarefa(id_tarefa, pedido, estado_inicial=None):
    fila = asyncio.Queue()
    if id_tarefa not in canais_eventos:
        canais_eventos[id_tarefa] = []

    canais_eventos[id_tarefa].append(fila)

    try:
        if estado_inicial:
            from servicos.gestor_tarefas import formatar_tarefa
            mensagem_inicial = json.dumps(formatar_tarefa(estado_inicial))
            yield f"data: {mensagem_inicial}\n\n"

        while True:
            if await pedido.is_disconnected():
                break

            try:
                dados = await asyncio.wait_for(fila.get(), timeout=1.0)
                yield f"data: {dados}\n\n"
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
    except (ConnectionResetError, BrokenPipeError):
        pass
    finally:
        if id_tarefa in canais_eventos:
            canais_eventos[id_tarefa].remove(fila)
            if not canais_eventos[id_tarefa]:
                del canais_eventos[id_tarefa]


async def _manutencao_canais():
    while True:
        await asyncio.sleep(60)


def iniciar_tarefa_manutencao():
    return asyncio.create_task(_manutencao_canais())