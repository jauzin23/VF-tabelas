"""
tarefas.py - Gestão de estado, persistência, fila global e eventos (SSE) de tarefas.

Sistema de filas FIFO para containers com pouca RAM:
- Apenas MAX_CONCURRENT_TASKS tarefas executam em simultâneo (default: 1)
- Tarefas extras ficam em estado "na_fila" com posição visível
- Resultados são periodicamente flushed para disco
- Memória é limpa após conclusão
"""
import asyncio
import gc
import json
import os
import shutil
import uuid
from dataclasses import asdict
from datetime import datetime

from config import (
    registo, garantir_ambiente_carregado, resolver_caminho_dados,
    carregar_config_fila, env_int,
)
from extrator import rastrear_site
from detetor import detetar_tabelas_para_tarefa, descarregar_modelos

garantir_ambiente_carregado()
CAMINHO_DADOS = resolver_caminho_dados(os.getenv("DATA_PATH", "./data"))
_CONFIG_FILA = carregar_config_fila()

tarefas = {}

canais_eventos = {}

_ia_em_uso = False


def definir_ia_em_uso(estado: bool):
    global _ia_em_uso
    _ia_em_uso = estado


def ia_em_uso_por_tarefa() -> bool:
    return _ia_em_uso


def existem_tarefas_ativas_ou_pendentes() -> bool:
    if fila_global.tarefa_ativa is not None or len(fila_global.tarefas_em_espera) > 0:
        return True
    for t in tarefas.values():
        if t.get("estado") in ("pendente", "na_fila", "em_execucao"):
            return True
    return False



def _ambiente_int(chave, padrao):
    v = os.getenv(chave)
    if v is None:
        return padrao
    try:
        return int(v)
    except ValueError:
        return padrao


def _concorrencia_automatica():
    cpu = os.cpu_count() or 4
    return max(3, min(8, cpu // 2))


def obter_caminho_json_tarefa(id_tarefa):
    return os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa, "tarefa.json")


def obter_caminho_running_tarefa(id_tarefa):
    return os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa, "running.txt")


def obter_caminho_resultados_parciais(id_tarefa):
    return os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa, "resultados_parciais.json")


def formatar_tarefa(tarefa):
    """Prepara o dicionário da tarefa para consumo externo."""
    saida = {
        "id":           tarefa["id"],
        "url_alvo":     tarefa["url_alvo"],
        "estado":       tarefa["estado"],
        "criado_em":    tarefa["criado_em"],
        "iniciado_em":  tarefa.get("iniciado_em"),
        "terminado_em": tarefa.get("terminado_em"),
        "erro":         tarefa.get("erro"),
        "opcoes":       tarefa["opcoes"],
        "progresso":    tarefa["progresso"],
        "resultados":   [asdict(r) if hasattr(r, "__dataclass_fields__") else r for r in tarefa.get("resultados", [])],
        "urls_alvo":    tarefa.get("urls_alvo"),
        "url_atual":    tarefa.get("url_atual"),
        "atualizado_em": datetime.utcnow().isoformat() + "Z",
        "esta_a_correr": os.path.exists(obter_caminho_running_tarefa(tarefa["id"])),
        "posicao_fila": tarefa.get("posicao_fila"),
    }
    if tarefa.get("estatisticas_rastreio") is not None:
        saida["estatisticas_rastreio"] = tarefa["estatisticas_rastreio"]
    return saida


def preparar_resposta_bloqueante(tarefa):
    """Simplifica a tarefa para respostas HTTP tradicionais (sem SSE)."""
    resultado = formatar_tarefa(tarefa)
    resultado.pop("opcoes", None)
    resultado.pop("esta_a_correr", None)
    resultado.pop("estatisticas_rastreio", None)
    resultado.pop("url_atual", None)
    resultado.pop("urls_alvo", None)
    resultado.pop("posicao_fila", None)
    
    if "progresso" in resultado:
        resultado["resumo"] = resultado.pop("progresso")
    return resultado


# ── Persistência e Eventos ───────────────────────────────────────────────────

async def publicar_atualizacao_tarefa(tarefa_dict):
    id_tarefa = tarefa_dict["id"]
    if id_tarefa in canais_eventos:
        mensagem = json.dumps(tarefa_dict)
        for fila in canais_eventos[id_tarefa]:
            await fila.put(mensagem)


async def publicar_e_persistir(tarefa):
    formatada = formatar_tarefa(tarefa)
    await publicar_atualizacao_tarefa(formatada)

    caminho = obter_caminho_json_tarefa(tarefa["id"])
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf8") as f:
        json.dump(formatada, f, indent=2, ensure_ascii=False)


async def obter_eventos_tarefa(id_tarefa, pedido, estado_inicial=None):
    """Gerador para streaming SSE de uma tarefa."""
    fila = asyncio.Queue()
    if id_tarefa not in canais_eventos:
        canais_eventos[id_tarefa] = []
    canais_eventos[id_tarefa].append(fila)

    try:
        if estado_inicial:
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
    finally:
        if id_tarefa in canais_eventos:
            canais_eventos[id_tarefa].remove(fila)
            if not canais_eventos[id_tarefa]:
                del canais_eventos[id_tarefa]


# ── Flush de Resultados para Disco ───────────────────────────────────────────

def _flush_resultados_para_disco(id_tarefa, resultados):
    """Guarda resultados parciais em disco para libertar memória."""
    caminho = obter_caminho_resultados_parciais(id_tarefa)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    serializados = [
        asdict(r) if hasattr(r, "__dataclass_fields__") else r
        for r in resultados
    ]
    with open(caminho, "w", encoding="utf8") as f:
        json.dump(serializados, f, ensure_ascii=False)


def _carregar_resultados_de_disco(id_tarefa):
    """Carrega resultados parciais do disco."""
    caminho = obter_caminho_resultados_parciais(id_tarefa)
    if os.path.exists(caminho):
        try:
            with open(caminho, "r", encoding="utf8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


# ── Lógica de Execução ───────────────────────────────────────────────────────

async def executar_tarefa(id_tarefa):
    tarefa = tarefas.get(id_tarefa)
    if not tarefa: return
    
    tarefa["estado"]      = "em_execucao"
    tarefa["iniciado_em"] = datetime.utcnow().isoformat() + "Z"
    tarefa["posicao_fila"] = None

    # Ficheiro de sinalização
    caminho_running = obter_caminho_running_tarefa(id_tarefa)
    os.makedirs(os.path.dirname(caminho_running), exist_ok=True)
    with open(caminho_running, "w") as f: f.write("")

    registo.info(f"Tarefa {id_tarefa} iniciada")
    await publicar_e_persistir(tarefa)

    flush_interval = _CONFIG_FILA.get("results_flush_interval", 100)
    ultimo_flush = 0

    try:
        entrada_alvo = tarefa.get("urls_alvo") or tarefa["url_alvo"]
        ultima_atualizacao_ui = 0

        def atualizar_progresso_controlado(**kwargs):
            nonlocal ultima_atualizacao_ui, ultimo_flush
            if "url_atual" in kwargs:
                tarefa["url_atual"] = kwargs.pop("url_atual")
            
            tarefa["progresso"].update(kwargs)
            if "imagens_bruto" in tarefa["progresso"] and "imagens_bulk" not in tarefa["progresso"]:
                tarefa["progresso"]["imagens_bulk"] = tarefa["progresso"]["imagens_bruto"]
            
            agora = asyncio.get_event_loop().time()
            if agora - ultima_atualizacao_ui > 0.4:
                asyncio.create_task(publicar_e_persistir(tarefa))
                ultima_atualizacao_ui = agora

            # Flush periódico de resultados para disco
            total_resultados = len(tarefa.get("resultados", []))
            if flush_interval > 0 and total_resultados > 0 and total_resultados - ultimo_flush >= flush_interval:
                try:
                    _flush_resultados_para_disco(id_tarefa, tarefa["resultados"])
                    ultimo_flush = total_resultados
                    registo.info(f"Tarefa {id_tarefa}: flush de {total_resultados} resultados para disco")
                except Exception as e:
                    registo.warning(f"Tarefa {id_tarefa}: erro no flush: {e}")

        is_multi = bool(tarefa.get("urls_alvo"))
        opcoes_exec = {
            "seguir_paginacao": tarefa["opcoes"].get("seguir_paginacao", True),
            "seguir_detalhe":   tarefa["opcoes"].get("seguir_detalhe", True),
            "max_paginas":      0 if is_multi else tarefa["opcoes"].get("max_paginas", 0),
            "max_profundidade": 2 if is_multi else tarefa["opcoes"].get("max_profundidade", 2),
            "max_imagens_por_pagina": None if is_multi else tarefa["opcoes"].get("max_imagens_por_pagina"),
            "id_tarefa":        id_tarefa,
        }

        # 1. Rastreio / Extração
        registo.info(f"Tarefa {id_tarefa}: a iniciar rastreio. A garantir descarga da IA...")
        descarregar_modelos()
        rastreados, estatisticas = await rastrear_site(
            entrada_alvo, opcoes_exec, {
                "ao_descobrir_paginas": lambda c: atualizar_progresso_controlado(paginas_descobertas=c),
                "ao_visitar_url":       lambda u: atualizar_progresso_controlado(url_atual=u),
                "ao_processar_pagina":  lambda c: atualizar_progresso_controlado(paginas_processadas=c),
                "ao_encontrar_imagens": lambda c, b: atualizar_progresso_controlado(
                    imagens_encontradas=b, imagens_bulk=b, imagens_bruto=b, imagens_unicas=c
                ),
            }
        )

        tarefa["estatisticas_rastreio"] = estatisticas
        tarefa["resultados"] = [asdict(r) if hasattr(r, "__dataclass_fields__") else r for r in rastreados]
        tarefa["progresso"]["imagens_unicas"] = len(tarefa["resultados"])
        await publicar_e_persistir(tarefa)

        # 2. Análise IA
        registo.info(f"Tarefa {id_tarefa}: analise de {len(tarefa['resultados'])} imagens")
        definir_ia_em_uso(True)
        try:
            tarefa["resultados"] = await detetar_tabelas_para_tarefa(
                tarefa["resultados"],
                tarefa["id"],
                lambda p, d: atualizar_progresso_controlado(imagens_analisadas=p, tabelas_detetadas=d),
                concorrencia_analise=tarefa["opcoes"].get("concorrencia_analise"),
            )
        finally:
            definir_ia_em_uso(False)
            descarregar_modelos()

        tarefa["estado"] = "concluido"
        registo.info(f"Tarefa {id_tarefa} concluida")

    except Exception as e:
        registo.error(f"Tarefa {id_tarefa} falhou: {e}", exc_info=True)
        tarefa["estado"] = "falhou"
        tarefa["erro"]   = str(e)
        # Garantir descarga mesmo em caso de erro
        descarregar_modelos()

    tarefa["terminado_em"] = datetime.utcnow().isoformat() + "Z"
    if os.path.exists(caminho_running): os.remove(caminho_running)

    # Flush final de resultados para disco
    if tarefa.get("resultados"):
        try:
            _flush_resultados_para_disco(id_tarefa, tarefa["resultados"])
        except Exception:
            pass

    await publicar_e_persistir(tarefa)


# ── Fila Global ──────────────────────────────────────────────────────────────

class FilaGlobal:
    """Fila FIFO global que serializa a execução de tarefas.
    
    Em containers com pouca RAM (1GB), apenas 1 tarefa deve executar
    de cada vez. A fila garante que as restantes esperam ordeiramente.
    """
    def __init__(self):
        max_size = _CONFIG_FILA.get("max_queue_size", 10)
        self._max_concurrent = _CONFIG_FILA.get("max_concurrent_tasks", 1)
        self._fila = asyncio.Queue(maxsize=max_size if max_size > 0 else 0)
        self._tarefas_em_espera: list[str] = []
        self._tarefa_ativa: str | None = None
        self._worker_tasks: list[asyncio.Task] = []
        self._bloqueio = asyncio.Lock()
        self._cleanup_after_s = _CONFIG_FILA.get("cleanup_after_s", 300)

    @property
    def tarefa_ativa(self) -> str | None:
        return self._tarefa_ativa

    @property
    def tarefas_em_espera(self) -> list[str]:
        return list(self._tarefas_em_espera)

    @property
    def tamanho_fila(self) -> int:
        return self._fila.qsize()

    @property
    def maximo_fila(self) -> int:
        return self._fila.maxsize

    def fila_cheia(self) -> bool:
        if self._fila.maxsize <= 0:
            return False
        return self._fila.full()

    async def iniciar(self):
        """Inicia o(s) worker(s) da fila."""
        registo.info(
            f"[Fila] Iniciada (max_concurrent={self._max_concurrent}, "
            f"max_queue={self._fila.maxsize})"
        )
        for i in range(self._max_concurrent):
            task = asyncio.create_task(self._worker_loop(i))
            self._worker_tasks.append(task)

    async def parar(self):
        """Para todos os workers."""
        for t in self._worker_tasks:
            t.cancel()
        await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        self._worker_tasks.clear()

    async def enfileirar(self, id_tarefa: str) -> int:
        """Enfileira uma tarefa. Retorna a posição na fila.
        Lança asyncio.QueueFull se a fila estiver cheia.
        """
        async with self._bloqueio:
            if self.fila_cheia():
                raise asyncio.QueueFull()
            self._tarefas_em_espera.append(id_tarefa)
            posicao = len(self._tarefas_em_espera)

        await self._fila.put(id_tarefa)
        
        # Atualizar estado da tarefa para "na_fila"
        tarefa = tarefas.get(id_tarefa)
        if tarefa:
            tarefa["estado"] = "na_fila"
            tarefa["posicao_fila"] = posicao
            await publicar_e_persistir(tarefa)

        registo.info(f"[Fila] Tarefa {id_tarefa} enfileirada (posição {posicao})")
        return posicao

    async def _atualizar_posicoes(self):
        """Atualiza a posição de todas as tarefas em espera e notifica via SSE."""
        async with self._bloqueio:
            for i, tid in enumerate(self._tarefas_em_espera):
                tarefa = tarefas.get(tid)
                if tarefa:
                    tarefa["posicao_fila"] = i + 1
                    await publicar_e_persistir(tarefa)

    async def _worker_loop(self, worker_id: int):
        """Worker que consome tarefas da fila sequencialmente."""
        registo.info(f"[Fila] Worker {worker_id} iniciado")
        while True:
            try:
                id_tarefa = await self._fila.get()
            except asyncio.CancelledError:
                break

            # Remover da lista de espera
            async with self._bloqueio:
                if id_tarefa in self._tarefas_em_espera:
                    self._tarefas_em_espera.remove(id_tarefa)
                self._tarefa_ativa = id_tarefa

            # Atualizar posições das restantes
            await self._atualizar_posicoes()

            try:
                await executar_tarefa(id_tarefa)
            except Exception as e:
                registo.error(f"[Fila] Worker {worker_id} - erro na tarefa {id_tarefa}: {e}")
            finally:
                async with self._bloqueio:
                    self._tarefa_ativa = None
                self._fila.task_done()
                # Agendar limpeza de memória
                asyncio.create_task(self._limpar_memoria_tarefa(id_tarefa))

    async def _limpar_memoria_tarefa(self, id_tarefa: str):
        """Remove resultados da memória após CLEANUP_RESULTS_AFTER_S segundos."""
        if self._cleanup_after_s <= 0:
            return
        await asyncio.sleep(self._cleanup_after_s)
        tarefa = tarefas.get(id_tarefa)
        if tarefa and tarefa.get("estado") in ("concluido", "falhou"):
            # Manter metadados, remover resultados pesados
            tarefa["resultados"] = []
            if id_tarefa in tarefas:
                del tarefas[id_tarefa]
            gc.collect()
            registo.info(f"[Fila] Memória limpa para tarefa {id_tarefa}")

    def cancelar_na_fila(self, id_tarefa: str) -> bool:
        """Remove uma tarefa da fila (antes de ter sido executada)."""
        if id_tarefa in self._tarefas_em_espera:
            self._tarefas_em_espera.remove(id_tarefa)
            tarefa = tarefas.get(id_tarefa)
            if tarefa:
                tarefa["estado"] = "falhou"
                tarefa["erro"] = "Cancelada pelo utilizador"
                tarefa["terminado_em"] = datetime.utcnow().isoformat() + "Z"
                tarefa["posicao_fila"] = None
            return True
        return False

    def info(self) -> dict:
        """Retorna informação sobre o estado da fila."""
        return {
            "tarefa_ativa": self._tarefa_ativa,
            "em_espera": list(self._tarefas_em_espera),
            "tamanho_fila": self._fila.qsize(),
            "maximo": self._fila.maxsize,
            "max_concurrent": self._max_concurrent,
        }


# Instância global da fila
fila_global = FilaGlobal()


# ── Gestão de Ciclo de Vida ───────────────────────────────────────────────────

def inicializar_tarefa(carga_util):
    registo.info("Nova tarefa criada/inicializada. A descarregar modelos IA da RAM...")
    descarregar_modelos()
    id_tarefa = str(uuid.uuid4())
    urls      = carga_util.get("urls")
    url       = carga_util.get("url")
    opcoes    = carga_util.get("opcoes") or carga_util.get("options") or {}

    tarefa = {
        "id":         id_tarefa,
        "url_alvo":   (urls[0] if len(urls) == 1 else f"{len(urls)} URLs") if urls else url,
        "urls_alvo":  urls,
        "estado":     "pendente",
        "criado_em":  datetime.utcnow().isoformat() + "Z",
        "posicao_fila": None,
        "opcoes": {
            "max_paginas":              opcoes.get("max_paginas", _ambiente_int("MAX_PAGES", 0)),
            "max_profundidade":         opcoes.get("max_profundidade", _ambiente_int("MAX_DEPTH", 1)),
            "tempo_limite_pagina_ms":  opcoes.get("tempo_limite_pagina_ms", _ambiente_int("PAGE_TIMEOUT_MS", 15000)),
            "max_imagens_total":        opcoes.get("max_imagens_total"),
            "max_imagens_por_pagina":   opcoes.get("max_imagens_por_pagina"),
            "concorrencia":             opcoes.get("concorrencia", _ambiente_int("CRAWLER_CONCURRENCY", _concorrencia_automatica())),
            "concorrencia_analise":     opcoes.get("concorrencia_analise", _ambiente_int("ANALYSIS_CONCURRENCY", 2)),
            "seguir_paginacao":         bool(opcoes.get("seguir_paginacao", True)),
            "seguir_detalhe":           bool(opcoes.get("seguir_detalhe", True)),
        },
        "progresso": {
            "paginas_descobertas": 0, "paginas_processadas": 0,
            "imagens_encontradas": 0, "imagens_bulk": 0, "imagens_bruto": 0, "imagens_unicas": 0,
            "imagens_analisadas": 0, "tabelas_detetadas": 0,
        },
        "resultados": []
    }
    tarefas[id_tarefa] = tarefa
    return tarefa


async def criar_tarefa(carga_util):
    """Cria uma tarefa e enfileira para execução.
    Retorna (tarefa, posicao_fila).
    Lança asyncio.QueueFull se a fila estiver cheia.
    """
    tarefa = inicializar_tarefa(carga_util)
    posicao = await fila_global.enfileirar(tarefa["id"])
    return tarefa, posicao


def obter_tarefa(id_tarefa):
    if id_tarefa in tarefas:
        return formatar_tarefa(tarefas[id_tarefa])
    
    caminho = obter_caminho_json_tarefa(id_tarefa)
    if os.path.exists(caminho):
        try:
            with open(caminho, "r", encoding="utf8") as f:
                dados = json.load(f)
                # Carregar resultados do disco se não estiverem no JSON principal
                if not dados.get("resultados"):
                    resultados_disco = _carregar_resultados_de_disco(id_tarefa)
                    if resultados_disco:
                        dados["resultados"] = resultados_disco
                tarefas[id_tarefa] = dados
                return formatar_tarefa(dados)
        except Exception:
            pass
    return None


def listar_tarefas():
    pasta = os.path.join(CAMINHO_DADOS, "tarefas")
    if not os.path.exists(pasta): return []
    
    resultados = []
    for tid in os.listdir(pasta):
        caminho_json = obter_caminho_json_tarefa(tid)
        if os.path.exists(caminho_json):
            try:
                with open(caminho_json, "r", encoding="utf8") as f:
                    dados = json.load(f)
                    resultados.append({
                        "id":           dados["id"],
                        "url_alvo":     dados["url_alvo"],
                        "estado":       dados["estado"],
                        "criado_em":    dados["criado_em"],
                        "opcoes":       dados["opcoes"],
                        "progresso":    dados["progresso"],
                        "esta_a_correr": os.path.exists(obter_caminho_running_tarefa(tid)),
                        "posicao_fila": dados.get("posicao_fila"),
                    })
            except: continue
    
    resultados.sort(key=lambda x: x["criado_em"], reverse=True)
    return resultados


def eliminar_tarefa(id_tarefa):
    # Tentar cancelar da fila primeiro
    fila_global.cancelar_na_fila(id_tarefa)
    if id_tarefa in tarefas: del tarefas[id_tarefa]
    diretorio = os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa)
    if os.path.exists(diretorio):
        try:
            shutil.rmtree(diretorio)
            return True
        except Exception: return False
    return False


async def manutencao_canais_loop():
    while True:
        await asyncio.sleep(60)
