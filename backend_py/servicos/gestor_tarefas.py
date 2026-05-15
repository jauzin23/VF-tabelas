import uuid
import os
import json
import asyncio
from dataclasses import asdict
from datetime import datetime
from utilitarios.registo import registo
from utilitarios.ambiente import garantir_ambiente_carregado, resolver_caminho_dados
from .extrator import rastrear_site
from .detetor_tabelas import detetar_tabelas_para_tarefa
from .eventos_tarefa import publicar_atualizacao_tarefa


def _ambiente_int(chave, padrao):
    v = os.getenv(chave)
    if v is None:
        return padrao
    try:
        return int(v)
    except ValueError:
        return padrao


def _ambiente_booleano(chave, padrao=False):
    v = os.getenv(chave)
    if v is None:
        return padrao
    return v.strip().lower() in ("1", "true", "yes", "sim", "on")


def _concorrencia_automatica():
    cpu = os.cpu_count() or 4
    return max(3, min(8, cpu // 2))


garantir_ambiente_carregado()
CAMINHO_DADOS = resolver_caminho_dados(os.getenv("DATA_PATH", "./data"))

tarefas = {}


def obter_caminho_json_tarefa(id_tarefa):
    return os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa, "tarefa.json")


def obter_caminho_running_tarefa(id_tarefa):
    return os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa, "running.txt")


def formatar_tarefa(tarefa):
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
    }
    if tarefa.get("estatisticas_rastreio") is not None:
        saida["estatisticas_rastreio"] = tarefa["estatisticas_rastreio"]
    return saida


def preparar_resposta_bloqueante(tarefa):
    """
    Prepara a tarefa para uma resposta HTTP bloqueante (sem SSE).
    Remove campos internos e simplifica o formato.
    """
    resultado = formatar_tarefa(tarefa)
    
    # Limpeza de campos internos/debug para modo bloqueante
    resultado.pop("opcoes", None)
    resultado.pop("paginacao_inicial", None)
    resultado.pop("esta_a_correr", None)
    resultado.pop("estatisticas_rastreio", None)
    resultado.pop("url_atual", None)
    resultado.pop("urls_alvo", None) # Também limpamos urls_alvo redundante
    
    # Renomear progresso para resumo (já que a tarefa terminou ou falhou)
    if "progresso" in resultado:
        resultado["resumo"] = resultado.pop("progresso")
        
    return resultado


async def publicar_e_persistir(tarefa):
    formatada = formatar_tarefa(tarefa)
    await publicar_atualizacao_tarefa(formatada)

    dir_tarefa = os.path.dirname(obter_caminho_json_tarefa(tarefa["id"]))
    os.makedirs(dir_tarefa, exist_ok=True)
    with open(obter_caminho_json_tarefa(tarefa["id"]), "w", encoding="utf8") as f:
        json.dump(formatada, f, indent=2, ensure_ascii=False)


async def executar_tarefa(id_tarefa):
    tarefa = tarefas[id_tarefa]
    tarefa["estado"]      = "em_execucao"
    tarefa["iniciado_em"] = datetime.utcnow().isoformat() + "Z"

    # Criar ficheiro de sinalização que está a correr
    caminho_running = obter_caminho_running_tarefa(id_tarefa)
    os.makedirs(os.path.dirname(caminho_running), exist_ok=True)
    with open(caminho_running, "w") as f:
        f.write("")

    registo.info(f"Tarefa {id_tarefa} iniciada")
    await publicar_e_persistir(tarefa)

    try:
        entrada_alvo = tarefa.get("urls_alvo") or tarefa["url_alvo"]
        tarefa["url_atual"] = None
        ultima_atualizacao_ui = 0

        def atualizar_progresso_controlado(**kwargs):
            nonlocal ultima_atualizacao_ui
            if "url_atual" in kwargs:
                tarefa["url_atual"] = kwargs.pop("url_atual")
            
            tarefa["progresso"].update(kwargs)
            if "imagens_bruto" in tarefa["progresso"] and "imagens_bulk" not in tarefa["progresso"]:
                tarefa["progresso"]["imagens_bulk"] = tarefa["progresso"]["imagens_bruto"]
            agora = asyncio.get_event_loop().time()
            if agora - ultima_atualizacao_ui > 0.4:
                asyncio.create_task(publicar_e_persistir(tarefa))
                ultima_atualizacao_ui = agora

        is_multi = len(tarefa.get("urls_alvo", [])) > 0
        
        opcoes_execucao = {
            "seguir_paginacao": tarefa["opcoes"].get("seguir_paginacao", True),
            "seguir_detalhe":   tarefa["opcoes"].get("seguir_detalhe", True),
            "max_paginas":      0 if is_multi else tarefa["opcoes"].get("max_paginas", 0),
            "max_profundidade": 2 if is_multi else tarefa["opcoes"].get("max_profundidade", 2),
            "max_imagens_por_pagina": None if is_multi else tarefa["opcoes"].get("max_imagens_por_pagina"),
            "id_tarefa":        id_tarefa,
        }

        tempo_limite_segundos = int(tarefa["opcoes"].get("maxJobSeconds")
                                   or _ambiente_int("JOB_TIMEOUT_S", 600))

        rastreados, estatisticas = await rastrear_site(
            entrada_alvo, opcoes_execucao, {
                "ao_descobrir_paginas": lambda c: atualizar_progresso_controlado(paginas_descobertas=c),
                "ao_visitar_url":       lambda u: atualizar_progresso_controlado(url_atual=u),
                "ao_processar_pagina":  lambda c: atualizar_progresso_controlado(paginas_processadas=c),
                "ao_encontrar_imagens": lambda c, b: atualizar_progresso_controlado(
                    imagens_encontradas=b,
                    imagens_bulk=b,
                    imagens_bruto=b,
                    imagens_unicas=c,
                ),
                "ao_detectar_paginacao": lambda total: None,
            }
        )

        await publicar_e_persistir(tarefa)

        tarefa["estatisticas_rastreio"] = estatisticas
        rastreados_dicts = [asdict(r) if hasattr(r, "__dataclass_fields__") else r for r in rastreados]
        tarefa["resultados"] = rastreados_dicts
        tarefa["progresso"]["imagens_unicas"] = len(rastreados_dicts)
        await publicar_e_persistir(tarefa)

        registo.info(f"Tarefa {id_tarefa}: analise de {len(rastreados_dicts)} imagens unicas")

        tarefa["resultados"] = await detetar_tabelas_para_tarefa(
            tarefa["resultados"],
            tarefa["id"],
            lambda p, d: atualizar_progresso_controlado(imagens_analisadas=p, tabelas_detetadas=d),
            concorrencia_analise=tarefa["opcoes"].get("concorrencia_analise"),
        )

        tarefa["estado"] = "concluido"
        registo.info(f"Tarefa {id_tarefa} concluida")

    except Exception as e:
        registo.error(f"Tarefa {id_tarefa} falhou: {e}", exc_info=True)
        tarefa["estado"] = "falhou"
        tarefa["erro"]   = str(e)

    tarefa["terminado_em"] = datetime.utcnow().isoformat() + "Z"
    
    # Remover ficheiro de sinalização
    caminho_running = obter_caminho_running_tarefa(id_tarefa)
    if os.path.exists(caminho_running):
        os.remove(caminho_running)

    await publicar_e_persistir(tarefa)


def inicializar_tarefa(carga_util):
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
        "opcoes": {
            "max_paginas":              opcoes.get("max_paginas", opcoes.get("maxPages", _ambiente_int("MAX_PAGES", 0))),
            "max_profundidade":         opcoes.get("max_profundidade", opcoes.get("maxDepth", _ambiente_int("MAX_DEPTH", 1))),
            "tempo_limite_pagina_ms":  opcoes.get("tempo_limite_pagina_ms", opcoes.get("pageTimeoutMs", _ambiente_int("PAGE_TIMEOUT_MS", 15000))),
            "max_imagens_total":        opcoes.get("max_imagens_total", opcoes.get("maxImagesTotal")),
            "max_imagens_por_pagina":   opcoes.get("max_imagens_por_pagina", opcoes.get("maxImagesPerPage")),
            "concorrencia":             opcoes.get("concorrencia", opcoes.get("concurrency", _ambiente_int("CRAWLER_CONCURRENCY", _concorrencia_automatica()))),
            "concorrencia_analise":     opcoes.get("concorrencia_analise", opcoes.get("analysisConcurrency", _ambiente_int("ANALYSIS_CONCURRENCY", 2))),
            "seguir_paginacao":         bool(opcoes.get("seguir_paginacao", opcoes.get("seguirPaginacao", True))),
            "seguir_detalhe":           bool(opcoes.get("seguir_detalhe", opcoes.get("seguirDetalhe", True))),
            "tempo_limite_job_segundos": opcoes.get("tempo_limite_job_segundos", opcoes.get("maxJobSeconds", _ambiente_int("JOB_TIMEOUT_S", 600))),
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


def criar_tarefa(carga_util):
    tarefa = inicializar_tarefa(carga_util)
    asyncio.create_task(publicar_e_persistir(tarefa))
    asyncio.create_task(executar_tarefa(tarefa["id"]))
    return tarefa


def obter_tarefa(id_tarefa):
    # Tenta em memória primeiro
    if id_tarefa in tarefas:
        return formatar_tarefa(tarefas[id_tarefa])
    
    caminho = obter_caminho_json_tarefa(id_tarefa)
    if os.path.exists(caminho):
        try:
            with open(caminho, "r", encoding="utf8") as f:
                dados = json.load(f)
                tarefas[id_tarefa] = dados
                return formatar_tarefa(dados)
        except Exception as e:
            registo.error(f"Erro ao carregar tarefa {id_tarefa} do disco: {e}")
    return None


def listar_tarefas():
    pasta_tarefas = os.path.join(CAMINHO_DADOS, "tarefas")
    if not os.path.exists(pasta_tarefas):
        return []
    
    resultados = []
    ids = [d for d in os.listdir(pasta_tarefas) if os.path.isdir(os.path.join(pasta_tarefas, d))]
    
    for tid in ids:
        caminho_json = obter_caminho_json_tarefa(tid)
        if os.path.exists(caminho_json):
            try:
                # Lemos apenas o básico para não carregar ficheiros gigantes de resultados na listagem
                with open(caminho_json, "r", encoding="utf8") as f:
                    dados = json.load(f)
                    # Resumo para a listagem
                    resultados.append({
                        "id":           dados["id"],
                        "url_alvo":     dados["url_alvo"],
                        "estado":       dados["estado"],
                        "criado_em":    dados["criado_em"],
                        "opcoes":       dados["opcoes"],
                        "progresso":    dados["progresso"],
                        "esta_a_correr": os.path.exists(obter_caminho_running_tarefa(tid)),
                        # Não incluímos resultados na listagem por performance
                    })
            except:
                continue
    
    # Ordenar por data de criação desc
    resultados.sort(key=lambda x: x["criado_em"], reverse=True)
    return resultados


def eliminar_tarefa(id_tarefa):
    # Remover da memória
    if id_tarefa in tarefas:
        del tarefas[id_tarefa]
    
    # Remover do disco
    diretorio = os.path.join(CAMINHO_DADOS, "tarefas", id_tarefa)
    if os.path.exists(diretorio):
        import shutil
        try:
            shutil.rmtree(diretorio)
            return True
        except Exception as e:
            registo.error(f"Erro ao apagar diretório da tarefa {id_tarefa}: {e}")
            return False
    
    return False