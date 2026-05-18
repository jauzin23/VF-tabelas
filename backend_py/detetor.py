"""
detetor.py - Deteção de tabelas via YOLO11 (yolo11-document-layout).
Modelo: Armaggheddon/yolo11-document-layout  (yolo11n_doc_layout.pt)
Mantém a mesma interface pública assíncrona usada pelo resto da aplicação.
"""
import io
import os
import gc
import sys
import time
import asyncio
import threading
from urllib.parse import urlparse

import cv2
import numpy as np
from PIL import Image

try:
    import niquests as _http
except ImportError:
    import requests as _http

from config import registo, garantir_ambiente_carregado, env_bool, env_int

garantir_ambiente_carregado()

# ── Configuração ──────────────────────────────────────────────────────────────

REPO_ID   = "Armaggheddon/yolo11-document-layout"
FILENAME  = "yolo11n_doc_layout.pt"

# Classe "Table" no modelo
TABLE_CLASS_ID = 8

CONFIANCA_MIN    = float(os.getenv("TABLE_MIN_CONFIDENCE", "0.35"))
IMGSZ            = int(os.getenv("YOLO_IMGSZ", "1024"))
IMAGEM_MIN_LARGURA = int(os.getenv("MIN_IMAGE_WIDTH", "120"))
IMAGEM_MIN_ALTURA  = int(os.getenv("MIN_IMAGE_HEIGHT", "80"))

UA_HTTP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ── Estado global do modelo ───────────────────────────────────────────────────

_bloqueio_modelos   = threading.Lock()
_carregando_modelos = False
_modelos_carregados = False
_ultimo_uso_modelo  = 0.0

_modelo = None   # instância YOLO


# ── Carregamento / descarregamento ────────────────────────────────────────────

def _garantir_modelos():
    """Descarrega o modelo YOLO11 (lazy loading, thread-safe)."""
    global _modelos_carregados, _carregando_modelos, _ultimo_uso_modelo, _modelo

    if _modelos_carregados:
        _ultimo_uso_modelo = time.monotonic()
        return

    with _bloqueio_modelos:
        if _modelos_carregados:
            _ultimo_uso_modelo = time.monotonic()
            return

        if _carregando_modelos:
            registo.info("Modelo YOLO já está a ser carregado. A aguardar...")
            return

        registo.info("A descarregar / localizar modelo YOLO11...")
        _carregando_modelos = True
        try:
            t0 = time.monotonic()

            from huggingface_hub import hf_hub_download
            from ultralytics import YOLO

            model_path = hf_hub_download(repo_id=REPO_ID, filename=FILENAME)
            _modelo = YOLO(model_path)

            _modelos_carregados = True
            _ultimo_uso_modelo  = time.monotonic()
            registo.info(f"Modelo YOLO11 carregado em {time.monotonic() - t0:.1f}s")
        except Exception as e:
            registo.error(f"Falha ao carregar modelo YOLO11: {e}")
            raise
        finally:
            _carregando_modelos = False


def descarregar_modelos():
    """Liberta o modelo YOLO da memória."""
    global _modelos_carregados, _carregando_modelos, _modelo

    if not _modelos_carregados and not _carregando_modelos:
        return

    with _bloqueio_modelos:
        if not _modelos_carregados:
            return

        registo.info("A descarregar modelo YOLO para libertar memória...")
        _modelo = None
        _modelos_carregados = False

        gc.collect()
        registo.info("Modelo YOLO descarregado.")


def modelos_carregados() -> bool:
    """Retorna True se o modelo está em memória."""
    return _modelos_carregados


async def garantir_modelos_assincrono():
    await asyncio.to_thread(_garantir_modelos)


async def gestor_ia_ram_loop():
    """Tarefa de background: gere proativamente a RAM com base no estado das tarefas."""
    while True:
        await asyncio.sleep(10)
        try:
            from tarefas import existem_tarefas_ativas_ou_pendentes, ia_em_uso_por_tarefa
            ativas  = existem_tarefas_ativas_ou_pendentes()
            em_uso  = ia_em_uso_por_tarefa()

            if ativas and not em_uso:
                if _modelos_carregados:
                    registo.info("[Gestor RAM] Tarefa ativa em rastreio. A descarregar IA da RAM...")
                    descarregar_modelos()
            elif not ativas:
                if not _modelos_carregados and not _carregando_modelos:
                    registo.info("[Gestor RAM] Servidor ocioso. A pré-carregar IA na RAM...")
                    await garantir_modelos_assincrono()
        except Exception as e:
            registo.error(f"[Gestor RAM] Erro no loop de monitorização: {e}")


# ── Utilitários HTTP ──────────────────────────────────────────────────────────

def _obter_url_e_referencia(entrada):
    if isinstance(entrada, dict):
        u = entrada.get("url") or entrada.get("url_origem")
        r = entrada.get("referer") or entrada.get("url_pagina")
        return u, r
    if isinstance(entrada, (list, tuple)) and len(entrada) >= 1:
        return entrada[0], entrada[1] if len(entrada) > 1 else None
    return entrada, None


def _pedir_imagem_http(url: str, referencia: str | None, tempo_limite: float = 15.0):
    cabecalhos = {
        "User-Agent": UA_HTTP,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    if referencia:
        cabecalhos["Referer"] = referencia
        try:
            pr = urlparse(referencia)
            if pr.scheme and pr.netloc:
                cabecalhos["Origin"] = f"{pr.scheme}://{pr.netloc}"
        except Exception:
            pass

    ultima = None
    tentativas = int(os.getenv("IMAGE_HTTP_RETRIES", "2")) + 1
    for t in range(tentativas):
        ultima = _http.get(url, headers=cabecalhos, timeout=tempo_limite, verify=True)
        if ultima.status_code in (429, 500, 502, 503, 504) and t + 1 < tentativas:
            time.sleep(0.4 * (t + 1))
            continue
        return ultima
    return ultima


# ── Pipeline de deteção ───────────────────────────────────────────────────────

def _pil_to_cv2(imagem: Image.Image) -> np.ndarray:
    """Converte PIL RGB → numpy BGR (formato OpenCV)."""
    return cv2.cvtColor(np.array(imagem), cv2.COLOR_RGB2BGR)


def detetar_tabelas_em_imagem_pil(imagem: Image.Image) -> tuple:
    """
    Corre o modelo YOLO11 na imagem PIL fornecida.
    Retorna (resultado_dict, imagem_pil).
    resultado_dict contém pelo menos 'tem_tabela' e 'confianca'.
    """
    try:
        _garantir_modelos()

        cv_img = _pil_to_cv2(imagem)

        results = _modelo.predict(
            source=cv_img,
            imgsz=IMGSZ,
            conf=CONFIANCA_MIN,
            verbose=False,
        )

        melhor_conf = 0.0
        n_tabelas   = 0

        for result in results:
            for box in result.boxes:
                cls = int(box.cls[0])
                if cls != TABLE_CLASS_ID:
                    continue
                n_tabelas += 1
                conf = float(box.conf[0])
                melhor_conf = max(melhor_conf, conf)
                registo.info(
                    f"  [YOLO] Tabela #{n_tabelas} conf={conf:.3f} "
                    f"bbox={list(map(int, box.xyxy[0]))}"
                )

        tem_tabela = n_tabelas > 0
        registo.info(
            f"  RESULTADO: {'[!] TABELA ENCONTRADA' if tem_tabela else '[.] Sem tabela'}"
            + (f" ({n_tabelas} detetada(s), conf={melhor_conf:.3f})" if tem_tabela else "")
        )

        return {"tem_tabela": tem_tabela, "confianca": melhor_conf}, imagem

    except Exception as e:
        registo.error(f"Erro no pipeline YOLO: {e}")
        return {"tem_tabela": False, "erro": str(e)}, imagem


def _detetar_tabelas_em_imagem_sincrono(entrada_imagem):
    try:
        url_ref, referencia = _obter_url_e_referencia(entrada_imagem)
        if url_ref is None:
            return {"tem_tabela": False, "erro": "entrada_invalida", "motivo_analise": "entrada_invalida"}, None

        if isinstance(url_ref, str) and url_ref.startswith(("http://", "https://")):
            resposta = _pedir_imagem_http(url_ref, referencia, tempo_limite=15.0)

            if resposta.status_code != 200:
                return (
                    {
                        "tem_tabela": False,
                        "erro": f"HTTP {resposta.status_code}",
                        "motivo_analise": f"http_{resposta.status_code}",
                    },
                    None,
                )

            tipo_conteudo = resposta.headers.get("Content-Type", "").lower()
            if "text/html" in tipo_conteudo or "application/json" in tipo_conteudo:
                return (
                    {
                        "tem_tabela": False,
                        "erro": f"Conteudo invalido: {tipo_conteudo}",
                        "motivo_analise": "resposta_nao_imagem",
                    },
                    None,
                )

            imagem = Image.open(io.BytesIO(resposta.content)).convert("RGB")
        elif isinstance(url_ref, str):
            imagem = Image.open(url_ref).convert("RGB")
        elif isinstance(url_ref, bytes):
            imagem = Image.open(io.BytesIO(url_ref)).convert("RGB")
        elif hasattr(url_ref, "convert"):
            imagem = url_ref.convert("RGB")
        else:
            return {"tem_tabela": False, "erro": "tipo_entrada_nao_suportado", "motivo_analise": "tipo_invalido"}, None

        if imagem.width < IMAGEM_MIN_LARGURA or imagem.height < IMAGEM_MIN_ALTURA:
            return {"tem_tabela": False, "motivo": "imagem_muito_pequena", "motivo_analise": "imagem_muito_pequena"}, imagem

        return detetar_tabelas_em_imagem_pil(imagem)

    except Exception as e:
        registo.error(f"Falha ao carregar imagem: {str(e)}")
        return {"tem_tabela": False, "erro": str(e), "motivo_analise": "excecao_carregamento"}, None


async def detetar_tabelas_em_imagem(entrada_imagem):
    resultado = await asyncio.to_thread(_detetar_tabelas_em_imagem_sincrono, entrada_imagem)
    try:
        from tarefas import existem_tarefas_ativas_ou_pendentes, ia_em_uso_por_tarefa
        if existem_tarefas_ativas_ou_pendentes() and not ia_em_uso_por_tarefa():
            registo.info("[Gestor RAM] Rastreio ativo após inferência. A libertar IA...")
            descarregar_modelos()
    except Exception as e:
        registo.warning(f"[Gestor RAM] Erro ao verificar estado da IA: {e}")
    return resultado


async def detetar_tabelas_para_tarefa(imagens, id_tarefa=None, ao_progredir=None, concorrencia_analise=None):
    total = len(imagens)
    conc  = max(1, int(concorrencia_analise or os.getenv("ANALYSIS_CONCURRENCY", "2")))
    registo.info(f"--- ANALISE IA INICIADA ({total} imagens, concorrencia={conc}) ---")

    for imagem_dict in imagens:
        imagem_dict["tem_tabela"] = False

    semaforo           = asyncio.Semaphore(conc)
    bloqueio_progresso = asyncio.Lock()
    processadas        = 0
    detetadas          = 0

    async def processar_uma(imagem_dict):
        nonlocal processadas, detetadas
        url_origem = (
            imagem_dict.get("url_origem")
            or imagem_dict.get("urlOrigem")
            or imagem_dict.get("imageSrc")
        )

        if not url_origem:
            imagem_dict["estado_tabela"]  = "ignorado"
            imagem_dict["motivo_analise"] = "sem_url_origem"
            async with bloqueio_progresso:
                processadas += 1
                if ao_progredir:
                    ao_progredir(processadas, detetadas)
            return

        async with semaforo:
            try:
                registo.info(f"  Analisar: {url_origem[:90]}...")
                entrada   = {"url": url_origem, "referer": imagem_dict.get("url_pagina")}
                resultado, _ = await detetar_tabelas_em_imagem(entrada)
                imagem_dict["tem_tabela"] = resultado.get("tem_tabela", False)
            except Exception as e:
                registo.error(f"Erro ao processar {url_origem}: {e}")

            async with bloqueio_progresso:
                if imagem_dict["tem_tabela"]:
                    detetadas += 1
                processadas += 1
                if ao_progredir:
                    ao_progredir(processadas, detetadas)

    await asyncio.gather(*(processar_uma(d) for d in imagens))

    registo.info(f"--- ANALISE CONCLUIDA ({detetadas}/{total} com tabela) ---")
    return imagens
