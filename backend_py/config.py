"""
config.py — Configuração global: logging e ambiente.

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
        "max_results_memory":     env_int("MAX_RESULTS_IN_MEMORY", 500),
        "results_flush_interval": env_int("RESULTS_FLUSH_INTERVAL", 100),
        # Modelos IA
        "preload_models":         env_bool("PRELOAD_MODELS", False),
        "unload_models_after_s":  env_int("UNLOAD_MODELS_AFTER_S", 0),
        # Browser
        "browser_single_process": env_bool("BROWSER_SINGLE_PROCESS", True),
        "browser_max_tabs":       env_int("BROWSER_MAX_TABS", 2),
        "browser_idle_timeout_s": env_int("BROWSER_IDLE_TIMEOUT_S", 30),
        "browser_args_extra":     os.getenv("BROWSER_ARGS_EXTRA", ""),
    }
