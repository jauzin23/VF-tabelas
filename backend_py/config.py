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
    # Em Docker, os env vars são injetados pelo compose — override=False garante
    # que nunca são sobrescritos pelo ficheiro .env local.
    # Em desenvolvimento local, procura .env na raiz do repositório.
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
