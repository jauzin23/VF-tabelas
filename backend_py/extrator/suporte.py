"""
extrator/suporte.py - Utilitários de Suporte HTTP para o Crawler.
"""
from __future__ import annotations

import os
import httpx


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def construir_cliente(
    *,
    diretorio_cache: str | None = None,
    tempo_limite: float = 20.0,
    http2: bool = True,
) -> httpx.AsyncClient:
    cabecalhos = {
        "User-Agent": _USER_AGENT,
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
    }
    tempos_limite = httpx.Timeout(timeout=tempo_limite, connect=10.0)
    limites = httpx.Limits(max_keepalive_connections=20, max_connections=50)

    transporte: httpx.AsyncBaseTransport | None = None
    if diretorio_cache:
        try:
            import hishel
            os.makedirs(diretorio_cache, exist_ok=True)
            controlador = hishel.Controller(
                cacheable_methods=["GET"],
                cacheable_status_codes=[200, 301, 308],
                allow_stale=False,
                always_revalidate=False,
            )
            armazenamento = hishel.AsyncFileStorage(base_path=diretorio_cache, ttl=3600)
            transporte = hishel.AsyncCacheTransport(
                transport=httpx.AsyncHTTPTransport(http2=http2, retries=1),
                controller=controlador,
                storage=armazenamento,
            )
        except Exception:
            transporte = None

    if transporte is None:
        return httpx.AsyncClient(
            headers=cabecalhos, timeout=tempos_limite, limits=limites,
            http2=http2, follow_redirects=True,
        )

    return httpx.AsyncClient(
        transport=transporte, headers=cabecalhos, timeout=tempos_limite,
        limits=limites, http2=http2, follow_redirects=True,
    )


__all__ = [
    "construir_cliente",
]
