import logging
import os
import sys
from typing import Optional

from dotenv import load_dotenv
from fastapi import Request, HTTPException, Query
from starlette.status import HTTP_401_UNAUTHORIZED

def _configurar_registo() -> logging.Logger:
    formatador = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )
    consola = logging.StreamHandler(sys.stdout)
    consola.setFormatter(formatador)

    registo_obj = logging.getLogger("backend")
    registo_obj.setLevel(logging.INFO)
    registo_obj.addHandler(consola)
    return registo_obj


registo = _configurar_registo()

def garantir_ambiente_carregado():
    raiz_repo = os.path.dirname(os.path.dirname(__file__))
    env_raiz = os.path.join(raiz_repo, ".env")
    if os.path.exists(env_raiz):
        load_dotenv(env_raiz, override=False)
    load_dotenv(override=False)


def resolver_caminho_dados(caminho_str):
    if not caminho_str:
        return os.path.abspath("./data")
    if os.path.isabs(caminho_str):
        return caminho_str
    return os.path.abspath(caminho_str)


def env_int(chave: str, padrao: int) -> int:
    v = os.getenv(chave)
    if v is None:
        return padrao
    try:
        return int(v)
    except ValueError:
        return padrao


def env_float(chave: str, padrao: float) -> float:
    v = os.getenv(chave)
    if v is None:
        return padrao
    try:
        return float(v)
    except ValueError:
        return padrao


def env_bool(chave: str, padrao: bool) -> bool:
    v = os.getenv(chave)
    if v is None:
        return padrao
    return v.lower() in ("true", "1", "yes", "sim")


def carregar_api_keys() -> list[str]:
    garantir_ambiente_carregado()
    chaves_raw = os.getenv("API_KEYS", "")
    chaves = [c.strip() for c in chaves_raw.split(",") if c.strip()]
    if not chaves:
        registo.critical(
            "ERRO FATAL DE SEGURANÇA: A variável de ambiente API_KEYS não está definida ou está vazia. "
            "A API Key é estritamente obrigatória para proteger os endpoints do sistema. "
            "Defina API_KEYS no docker-compose.yml ou no ambiente e tente novamente."
        )
        sys.exit(1)
    return chaves


CHAVES_VALIDAS = carregar_api_keys()


async def verificar_api_key(
    request: Request,
    query_api_key: Optional[str] = Query(None, alias="api_key")
) -> str:
    chave_extraida: Optional[str] = None

    header_api_key = request.headers.get("X-API-Key")
    if header_api_key:
        chave_extraida = header_api_key.strip()

    if not chave_extraida:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            chave_extraida = auth_header[len("Bearer "):].strip()

    if not chave_extraida and query_api_key:
        chave_extraida = query_api_key.strip()

    if not chave_extraida or chave_extraida not in CHAVES_VALIDAS:
        registo.warning(f"Tentativa de acesso não autorizada (IP: {request.client.host if request.client else 'desconhecido'})")
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Não autorizado: API Key inválida ou ausente."
        )

    return chave_extraida


def carregar_config_fila() -> dict:
    garantir_ambiente_carregado()
    return {
        "max_queue_size":         env_int("MAX_QUEUE_SIZE", 0),
        "max_concurrent_tasks":   env_int("MAX_CONCURRENT_TASKS", 1),
        "cleanup_after_s":        env_int("CLEANUP_RESULTS_AFTER_S", 300),
        "results_flush_interval": env_int("RESULTS_FLUSH_INTERVAL", 100),
    }
