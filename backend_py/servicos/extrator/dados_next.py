from __future__ import annotations

import json
import re
from typing import Any

from selectolax.parser import HTMLParser


_RE_IMG = re.compile(r"\.(?:jpg|jpeg|png|webp|avif|gif)\b", re.I)

_CHAVES_TOTAL = (
    "totalpages", "total_pages", "pagecount", "page_count",
    "totalpaginas", "total_paginas", "lastpage", "last_page",
    "numpages", "num_pages", "totalpages",
)
_CHAVES_ATUAL = (
    "currentpage", "current_page", "page", "pagina_atual", "paginaatual",
)
_CHAVES_TAMANHO = (
    "pagesize", "page_size", "perpage", "per_page", "limit",
)
_CHAVES_TOTAL_ITENS = (
    "totalitems", "total_items", "totalcount", "total_count", "total",
)


def extrair_dados_next(html: str) -> dict[str, Any] | None:
    if not html:
        return None
    try:
        arvore = HTMLParser(html)
    except Exception:
        return None
    no = arvore.css_first('script#__NEXT_DATA__')
    if no is None:
        return None
    texto = no.text(strip=False) or ""
    if not texto.strip():
        return None
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        return None


def percorrer_imagens(obj: Any, max_resultados: int = 200) -> list[str]:
    encontradas: list[str] = []
    vistos: set[str] = set()

    def _percorrer(o: Any) -> None:
        if len(encontradas) >= max_resultados:
            return
        if isinstance(o, str):
            if 5 < len(o) < 600 and _RE_IMG.search(o):
                if o not in vistos:
                    vistos.add(o)
                    encontradas.append(o)
            return
        if isinstance(o, list):
            for v in o:
                _percorrer(v)
            return
        if isinstance(o, dict):
            for v in o.values():
                _percorrer(v)

    _percorrer(obj)
    return encontradas


def _normalizar_chave(k: str) -> str:
    return k.lower().replace("-", "").replace("_", "")


def _procurar_chave(obj: Any, alvos: tuple[str, ...]) -> Any:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str) and _normalizar_chave(k) in alvos:
                return v
        for v in obj.values():
            r = _procurar_chave(v, alvos)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _procurar_chave(v, alvos)
            if r is not None:
                return r
    return None


def _maior_lista(obj: Any, profundidade: int = 0, max_prof: int = 6) -> list | None:
    if profundidade > max_prof:
        return None
    melhor: list | None = None
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            melhor = obj
        for v in obj:
            cand = _maior_lista(v, profundidade + 1, max_prof)
            if cand is not None and (melhor is None or len(cand) > len(melhor)):
                melhor = cand
    elif isinstance(obj, dict):
        for v in obj.values():
            cand = _maior_lista(v, profundidade + 1, max_prof)
            if cand is not None and (melhor is None or len(cand) > len(melhor)):
                melhor = cand
    return melhor


def percorrer_paginacao(dados_next: dict[str, Any] | Any) -> dict[str, Any]:
    if not isinstance(dados_next, (dict, list)):
        return {}
    props_pagina = dados_next.get("props", {}).get("pageProps", dados_next) if isinstance(dados_next, dict) else dados_next

    total_paginas = _procurar_chave(props_pagina, _CHAVES_TOTAL)
    pagina_atual  = _procurar_chave(props_pagina, _CHAVES_ATUAL)
    tamanho       = _procurar_chave(props_pagina, _CHAVES_TAMANHO)
    total_itens   = _procurar_chave(props_pagina, _CHAVES_TOTAL_ITENS)

    saida: dict[str, Any] = {}
    derivado = False

    def _para_int(v: Any) -> int | None:
        try:
            n = int(v)
            return n if n > 0 else None
        except (TypeError, ValueError):
            return None

    n_total = _para_int(total_paginas)
    n_atual = _para_int(pagina_atual)
    n_tam   = _para_int(tamanho)
    n_itens = _para_int(total_itens)

    if n_total is None and n_itens is not None and n_tam is not None:
        n_total = (n_itens + n_tam - 1) // n_tam
        derivado = True

    if n_total is None and n_itens is None and n_tam is None:
        return {}

    if n_total is not None:
        saida["total_paginas"] = n_total
    if n_atual is not None:
        saida["pagina_atual"] = n_atual
    if n_tam is not None:
        saida["tamanho_pagina"] = n_tam
    if n_itens is not None:
        saida["total_itens"] = n_itens
    if derivado:
        saida["derivado"] = True

    return saida


__all__ = ["extrair_dados_next", "percorrer_imagens", "percorrer_paginacao"]
