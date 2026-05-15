from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from typing import Iterable
from urllib.parse import urlparse

from .tipos import ImagemEncontrada
from .utilitarios_url import env_int


_PISTAS_URL: dict[str, list[str]] = {
    "logotipo":   ["logo", "brand", "logotipo"],
    "icone":      ["icon", "favicon", "sprite", "icone", "pictogram"],
    "principal":  ["hero", "banner", "masthead", "cover", "splash", "header-img"],
    "produto":    ["product", "produto", "item", "sku", "catalog", "catalogue",
                   "shop", "loja", "article", "artigo"],
    "miniatura":  ["thumb", "thumbnail", "miniatura", "preview"],
    "fundo":      ["background", "bg-", "-bg", "pattern", "texture"],
    "avatar":     ["avatar", "profile", "user", "author", "pessoa"],
    "galeria":    ["gallery", "galeria", "slider", "carousel"],
}

_PISTAS_ALT: dict[str, list[str]] = {
    "logotipo": ["logo", "logotipo", "marca"],
    "icone":    ["icon", "ícone", "icone"],
    "principal": ["hero", "banner"],
    "produto":  ["product", "produto", "item"],
    "avatar":   ["avatar", "profile", "foto de perfil"],
}

_IMPULSO_SECCAO_ETIQUETA: dict[str, dict[str, float]] = {
    "nav":     {"logotipo": 0.25, "icone": 0.15},
    "hero":    {"principal": 0.30},
    "footer":  {"logotipo": 0.15, "icone": 0.10},
    "sidebar": {"miniatura": 0.10, "avatar": 0.10},
    "content": {"produto": 0.10, "galeria": 0.10},
}


def _pontuacoes_de_texto(texto: str, pistas: dict[str, list[str]]) -> dict[str, float]:
    t = (texto or "").lower()
    pontuacoes: dict[str, float] = {}
    for etiqueta, palavras_chave in pistas.items():
        for pc in palavras_chave:
            if pc in t:
                pontuacoes[etiqueta] = pontuacoes.get(etiqueta, 0.0) + 0.20
    return pontuacoes


def classificar_heuristica(img: ImagemEncontrada) -> tuple[str, float, str]:
    pontuacoes: dict[str, float] = {}
    motivos: list[str] = []

    p = urlparse(img.url_origem)
    url_blob = (p.path + " " + p.query).lower()

    if img.e_imagem_og:
        pontuacoes["og_image"] = pontuacoes.get("og_image", 0.0) + 0.60
        motivos.append("tag og:image")
    if img.e_dados_next:
        pontuacoes["produto"] = pontuacoes.get("produto", 0.0) + 0.20
        motivos.append("propriedades __NEXT_DATA__")

    for etiqueta, pnt in _pontuacoes_de_texto(url_blob, _PISTAS_URL).items():
        pontuacoes[etiqueta] = pontuacoes.get(etiqueta, 0.0) + pnt
        if pnt > 0:
            motivos.append(f"url:{etiqueta}")
    for etiqueta, pnt in _pontuacoes_de_texto(img.alt, _PISTAS_ALT).items():
        pontuacoes[etiqueta] = pontuacoes.get(etiqueta, 0.0) + pnt * 0.8
        if pnt > 0:
            motivos.append(f"alt:{etiqueta}")
    for etiqueta, pnt in _pontuacoes_de_texto(img.classes_css, _PISTAS_URL).items():
        pontuacoes[etiqueta] = pontuacoes.get(etiqueta, 0.0) + pnt * 0.6
        if pnt > 0:
            motivos.append(f"classe:{etiqueta}")
    for etiqueta, pnt in _pontuacoes_de_texto(img.contexto_texto, _PISTAS_URL).items():
        pontuacoes[etiqueta] = pontuacoes.get(etiqueta, 0.0) + pnt * 0.3

    w, h = img.largura, img.altura
    if w > 0 and h > 0:
        ratio = w / h
        if w >= 1000 and h >= 300:
            pontuacoes["principal"] = pontuacoes.get("principal", 0.0) + 0.25
            motivos.append("dims:principal")
        if w < 160 and h < 80:
            pontuacoes["logotipo"] = pontuacoes.get("logotipo", 0.0) + 0.20
            motivos.append("dims:logotipo_pequeno")
        if 0.85 <= ratio <= 1.15 and 150 <= w <= 800:
            pontuacoes["produto"] = pontuacoes.get("produto", 0.0) + 0.15
            motivos.append("dims:produto_quadrado")
        if w < 64 and h < 64:
            pontuacoes["icone"] = pontuacoes.get("icone", 0.0) + 0.30
            motivos.append("dims:icone")

    for etiqueta, impulso in _IMPULSO_SECCAO_ETIQUETA.get(img.seccao, {}).items():
        pontuacoes[etiqueta] = pontuacoes.get(etiqueta, 0.0) + impulso
        motivos.append(f"seccao:{img.seccao}->{etiqueta}")

    if not pontuacoes:
        return "desconhecido", 0.0, "sem_pistas"

    melhor = max(pontuacoes, key=lambda k: pontuacoes[k])
    pontuacao = min(pontuacoes[melhor], 1.0)
    ordenados = sorted(pontuacoes.values(), reverse=True)
    if len(ordenados) >= 2 and ordenados[1] > 0:
        comp = ordenados[1] / ordenados[0]
        pontuacao *= max(0.5, 1.0 - comp * 0.4)

    return melhor, round(pontuacao, 3), "; ".join(motivos[:5])


class CacheClassificador:
    def __init__(self, diretorio: str | None = None) -> None:
        self._mem: dict[str, dict] = {}
        self._dc = None
        if diretorio:
            try:
                import diskcache
                os.makedirs(diretorio, exist_ok=True)
                self._dc = diskcache.Cache(diretorio, size_limit=64 * 1024 * 1024)
            except Exception:
                self._dc = None

    def obter(self, url: str) -> dict | None:
        if self._dc is not None:
            with suppress(Exception):
                return self._dc.get(url)
        return self._mem.get(url)

    def definir(self, url: str, etiqueta: str, pontuacao: float, motivo: str) -> None:
        registo = {"etiqueta": etiqueta, "pontuacao": float(pontuacao), "motivo": motivo}
        if self._dc is not None:
            with suppress(Exception):
                self._dc.set(url, registo)
                return
        self._mem[url] = registo

    def fechar(self) -> None:
        if self._dc is not None:
            with suppress(Exception):
                self._dc.close()


def classificar_lista(
    resultados: list[ImagemEncontrada],
    cache: CacheClassificador | None = None,
    max_trabalhadores: int | None = None,
) -> list[ImagemEncontrada]:
    if not resultados:
        return resultados

    trabalhadores = max_trabalhadores or env_int("CLASSIFIER_WORKERS", 8)

    def _trabalhar(img: ImagemEncontrada) -> ImagemEncontrada:
        if cache is not None:
            cacheado = cache.obter(img.url_origem)
            if cacheado:
                img.etiqueta = cacheado.get("etiqueta", "desconhecido")
                img.pontuacao = float(cacheado.get("pontuacao", 0.0))
                img.motivo = cacheado.get("motivo", "")
                return img
        etiqueta, pontuacao, motivo = classificar_heuristica(img)
        img.etiqueta, img.pontuacao, img.motivo = etiqueta, pontuacao, motivo
        if cache is not None:
            cache.definir(img.url_origem, etiqueta, pontuacao, motivo)
        return img

    with ThreadPoolExecutor(max_workers=trabalhadores) as pool:
        list(pool.map(_trabalhar, resultados))

    return resultados


__all__ = [
    "classificar_heuristica", "classificar_lista", "CacheClassificador",
]
