from __future__ import annotations

import os
from urllib.parse import (
    parse_qs, parse_qsl, urlencode, urljoin,
    urlparse, urlunparse, unquote,
)

EXTENSOES_IMAGEM = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif", ".avif")

EXTENSOES_IGNORAR = (
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".rar", ".gz", ".tar",
    ".mp4", ".mp3", ".avi", ".mov", ".wmv", ".flv", ".ogg", ".wav",
    ".xml", ".json", ".csv", ".txt", ".svg", ".ico",
)

HOSTS_RASTREAMENTO = {
    "googletagmanager.com", "google-analytics.com", "analytics.google.com",
    "doubleclick.net", "facebook.net", "connect.facebook.net",
    "hotjar.com", "clarity.ms", "segment.com", "cdn.segment.com",
    "intercom.io", "js.intercomcdn.com", "js.hubspot.com",
    "cookiebot.com", "onetrust.com", "cookiepro.com",
}

PARAMETROS_PAGINACAO = ("page", "pagina", "pg", "p", "offset", "inicio", "paginacao")


def normalizar_host(netloc: str) -> str:
    return netloc.lower().removeprefix("www.")


def obter_hosts(entrada: str | list[str]) -> set[str]:
    urls = entrada if isinstance(entrada, list) else [entrada]
    return {normalizar_host(urlparse(u).netloc) for u in urls if u and urlparse(u).netloc}


def _decompor_url(url: str):
    try:
        a = urlparse(url)
        esquema = a.scheme.lower() or "https"
        if esquema == "http":
            esquema = "https"
        host = a.netloc.lower().removeprefix("www.")
        caminho = a.path or "/"
        if len(caminho) > 1 and caminho.endswith("/"):
            caminho = caminho[:-1]
        return esquema, host, caminho, a
    except Exception:
        return None, None, None, None


def normalizar_url(url: str) -> str:
    esquema, host, caminho, a = _decompor_url(url)
    if not esquema:
        return url
    try:
        partes = parse_qsl(a.query, keep_blank_values=True)
        filtradas = [
            (k, v) for k, v in partes
            if not k.lower().startswith(("utm_", "fbclid", "gclid", "_ga", "_gl"))
        ]
        filtradas.sort()
        return urlunparse((esquema, host, caminho, a.params, urlencode(filtradas), ""))
    except Exception:
        return url


def normalizar_url_pagina(bruta: str) -> str | None:
    bruta = (bruta or "").strip()
    if not bruta:
        return None
    p = urlparse(bruta)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    saida = f"{p.scheme}://{p.netloc}{p.path or '/'}"
    if p.query:
        saida = f"{saida}?{p.query}"
    return saida


def parametro_pagina_de_url(url: str) -> tuple[str | None, int | None]:
    try:
        q = dict(parse_qsl(urlparse(url).query, keep_blank_values=True))
    except Exception:
        return None, None
    for nome in PARAMETROS_PAGINACAO:
        if nome in q:
            try:
                return nome, int(q[nome])
            except (TypeError, ValueError):
                return nome, None
    return None, None


def e_paginacao(u1: str, u2: str) -> bool:
    s1, h1, c1, a1 = _decompor_url(u1)
    s2, h2, c2, a2 = _decompor_url(u2)
    if not s1 or not s2 or h1 != h2 or c1 != c2:
        return False
    try:
        q1 = dict(parse_qsl(a1.query))
        q2 = dict(parse_qsl(a2.query))
    except Exception:
        return False
    pags = set(PARAMETROS_PAGINACAO)
    chaves = (set(q1) | set(q2)) - pags
    for k in chaves:
        if q1.get(k) != q2.get(k):
            return False
    return any(k in pags for k in q2)


def deve_ignorar_url(url: str) -> bool:
    try:
        caminho = unquote(urlparse(url).path.lower())
    except Exception:
        caminho = url.lower().split("?")[0]
    return caminho.endswith(EXTENSOES_IGNORAR)


def parece_imagem(url: str) -> bool:
    return urlparse(url).path.lower().endswith(EXTENSOES_IMAGEM)


def descodificar_imagem_next(url: str) -> str:
    p = urlparse(url)
    if p.path != "/_next/image":
        return url
    qs = parse_qs(p.query)
    interna = qs.get("url", [None])[0]
    if not interna:
        return url
    if interna.startswith("/"):
        return f"{p.scheme}://{p.netloc}{interna}"
    return interna


def construir_url_paginada(url_base: str, n: int, parametro: str = "page") -> str:
    p = urlparse(url_base)
    pares = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if k.lower() != parametro.lower()]
    pares.append((parametro, str(n)))
    return urlunparse(p._replace(query=urlencode(pares, doseq=True)))


def normalizar_imagem_url(url_pagina: str, src: str) -> str | None:
    if not src:
        return None
    src = src.strip()
    if src.startswith("data:") or "data:image/svg" in src or ".svg" in src.lower():
        return None
    completo = urljoin(url_pagina, src)
    p = urlparse(completo)
    if p.scheme not in ("http", "https"):
        return None
    completo = descodificar_imagem_next(completo)
    p = urlparse(completo)
    nome = p.path.split("/")[-1]
    tem_ext = "." in nome
    if tem_ext and not p.path.lower().endswith(EXTENSOES_IMAGEM):
        return None
    return completo


def env_int(chave: str, padrao: int) -> int:
    v = os.getenv(chave)
    if v is None:
        return padrao
    try:
        return int(v)
    except ValueError:
        return padrao


__all__ = [
    "EXTENSOES_IMAGEM", "EXTENSOES_IGNORAR", "HOSTS_RASTREAMENTO", "PARAMETROS_PAGINACAO",
    "normalizar_host", "obter_hosts", "normalizar_url", "normalizar_url_pagina",
    "parametro_pagina_de_url", "e_paginacao", "deve_ignorar_url",
    "parece_imagem", "descodificar_imagem_next", "construir_url_paginada",
    "normalizar_imagem_url", "env_int",
]
