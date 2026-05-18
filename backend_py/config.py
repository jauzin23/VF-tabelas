"""
config.py - Configuração global: logging e ambiente.

Antes: utilitarios/registo.py + utilitarios/ambiente.py
"""
import logging
import os
import sys

from dotenv import load_dotenv


# ── Logging ──────────────────────────────────────────────────────────────────

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


# ── Ambiente ──────────────────────────────────────────────────────────────────

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


# ── Helpers de Ambiente ──────────────────────────────────────────────────────

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


# ── Segurança (API Keys) ─────────────────────────────────────────────────────

def carregar_api_keys() -> list[str]:
    """Carrega e valida as chaves de API a partir da variável de ambiente API_KEYS.
    Se a variável estiver ausente ou vazia, encerra a aplicação com erro crítico."""
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


# ── Configuração do Sistema de Filas ─────────────────────────────────────────

def carregar_config_fila() -> dict:
    """Carrega todas as configurações do sistema de filas a partir de env vars."""
    garantir_ambiente_carregado()
    return {
        # Fila
        "max_queue_size":         env_int("MAX_QUEUE_SIZE", 0),
        "max_concurrent_tasks":   env_int("MAX_CONCURRENT_TASKS", 1),
        # Limpeza de memória
        "cleanup_after_s":        env_int("CLEANUP_RESULTS_AFTER_S", 300),
        "results_flush_interval": env_int("RESULTS_FLUSH_INTERVAL", 100),
    }
