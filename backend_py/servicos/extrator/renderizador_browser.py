from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from utilitarios.registo import registo
from utilitarios.ambiente import resolver_caminho_dados
import hashlib

from .localizador_imagens import JS_EXTRAIR
from .paginacao import JS_DETETAR_PAGINACAO


try:
    from patchright.async_api import async_playwright as _async_pw
    from patchright.async_api import TimeoutError as _ErroTempoLimiteBrowser
    _MOTOR_BROWSER = "patchright"
except ImportError:
    from playwright.async_api import async_playwright as _async_pw
    from playwright.async_api import TimeoutError as _ErroTempoLimiteBrowser
    _MOTOR_BROWSER = "playwright"


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


JS_ACEITAR_COOKIES = r"""
() => {
    const palavras_chave = /aceitar|accept|agree|allow all|got it|ok, i agree|concordo|i agree/i;
    const botao = Array.from(document.querySelectorAll("button,a,[role='button']"))
        .find(el => palavras_chave.test(el.innerText) || palavras_chave.test(el.getAttribute('aria-label') || ''));
    if (botao) { botao.click(); return true; }
    return false;
}
"""

JS_EXPANDIR_MENUS = r"""
async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    const botoesMenu = Array.from(document.querySelectorAll("button, a, div")).filter(el => {
        const txt = (el.innerText || "").toLowerCase();
        return txt === "menu" || txt === "menu x" || el.classList.contains("burger") || el.id?.includes("menu");
    });
    
    for (const b of botoesMenu) {
        if (b.getBoundingClientRect().width > 0) {
            b.click();
            await sleep(500);
        }
    }

    const seletoresExpander = [
        "[class*='arrow']", "[class*='chevron']", "[class*='plus']",
        "button[aria-expanded='false']", "li[aria-haspopup='true']",
        ".ant-menu-submenu-title", ".menu-item-has-children"
    ];
    
    let totalClicados = 0;
    let novasTentativas = 3;
    
    while (novasTentativas > 0) {
        const elementos = document.querySelectorAll(seletoresExpander.join(","));
        let clicadosNestaRonda = 0;
        
        for (const el of elementos) {
            if (totalClicados > 30) break;
            
            if (el.getAttribute("aria-expanded") === "true") continue;
            
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.top < window.innerHeight) {
                try {
                    el.click();
                    clicadosNestaRonda++;
                    totalClicados++;
                    await sleep(300);
                } catch(e){}
            }
        }
        if (clicadosNestaRonda === 0) break;
        novasTentativas--;
    }
    
    return totalClicados;
}
"""

JS_SCROLL = r"""
async () => {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const body = document.body;
    const html = document.documentElement;
    const height = Math.max(
        body ? body.scrollHeight : 0,
        html ? html.scrollHeight : 0,
        body ? body.offsetHeight : 0
    );
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= height; y += step) {
        window.scrollTo(0, y);
        await delay(200);
    }
    window.scrollTo(0, 0);
    await delay(200);
}
"""

JS_AGUARDAR_ESTABILIDADE = r"""
async () => {
    return new Promise(resolve => {
        let lastCount = 0;
        let sameCount = 0;
        const check = () => {
            const currentCount = document.querySelectorAll('img, a[href]').length;
            if (currentCount === lastCount && currentCount > 0) {
                sameCount++;
            } else {
                sameCount = 0;
            }
            lastCount = currentCount;
            if (sameCount >= 6 || (currentCount > 30 && sameCount >= 3)) {
                resolve(true);
            } else {
                setTimeout(check, 400);
            }
        };
        check();
        setTimeout(() => resolve(false), 8000);
    });
}
"""


class GestorBrowser:
    def __init__(self) -> None:
        self._ctx_pw = None
        self._browser = None
        self._contexto = None
        self._bloqueio = asyncio.Lock()
        self._aberto = False

    async def iniciar(self) -> None:
        if self._aberto:
            return
        async with self._bloqueio:
            if self._aberto:
                return
            registo.info(f"[Browser] A iniciar ({_MOTOR_BROWSER})...")
            self._ctx_pw = await _async_pw().start()
            argumentos = [
                "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
            ]
            self._browser = await self._ctx_pw.chromium.launch(headless=True, args=argumentos)
            self._contexto = await self._browser.new_context(
                user_agent=_USER_AGENT, locale="pt-PT",
                viewport={"width": 1920, "height": 1080},
            )
            await self._contexto.route("**/*", _bloquear_recurso)
            self._aberto = True

    async def fechar_tudo(self) -> None:
        async with self._bloqueio:
            if not self._aberto:
                return
            try:
                if self._contexto:
                    await self._contexto.close()
            finally:
                try:
                    if self._browser:
                        await self._browser.close()
                finally:
                    if self._ctx_pw:
                        await self._ctx_pw.stop()
            self._aberto = False
            registo.info("[Browser] Encerrado")

    @asynccontextmanager
    async def pagina(self):
        await self.iniciar()
        pagina = await self._contexto.new_page()
        try:
            yield pagina
        finally:
            try:
                await pagina.close()
            except Exception:
                pass


async def _bloquear_recurso(rota) -> None:
    tipo = rota.request.resource_type
    if tipo in ("font", "media", "other", "webmanifest"):
        try:
            await rota.abort()
        except Exception:
            pass
        return
    try:
        await rota.continue_()
    except Exception:
        pass


_CHAVES_LISTA = ("items", "data", "results", "events", "eventos",
                  "agenda", "posts", "noticias", "noticia",
                  "products", "produtos", "list", "rows")
_CHAVES_TOTAL = ("totalpages", "total_pages", "pagecount", "page_count",
                  "total", "totalitems", "total_items")


def _capturar_xhr_do_pedido(json_resposta: Any) -> dict[str, Any] | None:
    if not isinstance(json_resposta, dict):
        return None

    chave_lista = None
    tamanho_itens = 0
    total_paginas = 0

    def _normalizar(k: str) -> str:
        return (k or "").lower().replace("-", "").replace("_", "")

    for k, v in json_resposta.items():
        if isinstance(v, (int, float)) and _normalizar(k) in _CHAVES_TOTAL:
            try:
                total_paginas = max(total_paginas, int(v))
            except Exception:
                pass

    if total_paginas == 0:
        for v in json_resposta.values():
            if isinstance(v, dict):
                for k2, v2 in v.items():
                    if isinstance(v2, (int, float)) and _normalizar(k2) in _CHAVES_TOTAL:
                        try:
                            total_paginas = max(total_paginas, int(v2))
                        except Exception:
                            pass

    for k, v in json_resposta.items():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            if _normalizar(k) in tuple(_normalizar(x) for x in _CHAVES_LISTA) or len(v) > tamanho_itens:
                chave_lista = k
                tamanho_itens = len(v)

    if total_paginas > 1 or (tamanho_itens and total_paginas):
        return {
            "totalPages": int(total_paginas) if total_paginas else None,
            "items_len": tamanho_itens,
            "chave_lista": chave_lista,
        }
    return None


async def renderizar_e_extrair(
    url: str,
    gestor: GestorBrowser,
    *,
    tempo_limite_ms: int = 30000,
    capturar_api: bool = True,
    ignorar_nav_footer: bool = False,
) -> dict[str, Any]:
    registo_pedidos: list[dict[str, Any]] = []
    api_capturada: dict[str, Any] | None = None

    async with gestor.pagina() as pagina:

        async def _ao_responder(resposta) -> None:
            nonlocal api_capturada
            try:
                ct = (resposta.headers.get("content-type") or "").lower()
                if "json" not in ct:
                    return
                if not capturar_api:
                    return
                if resposta.request.method.upper() not in ("GET", "POST"):
                    return
                if resposta.status >= 400:
                    return
                tamanho = int(resposta.headers.get("content-length") or 0)
                if 0 < tamanho > 4 * 1024 * 1024:
                    return
                try:
                    dados = await resposta.json()
                except Exception:
                    return
                meta = _capturar_xhr_do_pedido(dados)
                if meta is None:
                    return
                req = resposta.request
                entrada = {
                    "url": req.url,
                    "method": req.method,
                    "totalPages": meta.get("totalPages"),
                    "items_len": meta.get("items_len"),
                    "chave_lista": meta.get("chave_lista"),
                }
                registo_pedidos.append(entrada)
                if api_capturada is None and entrada["totalPages"]:
                    api_capturada = {
                        "url": req.url,
                        "method": req.method,
                        "body": req.post_data,
                        "headers": {k: v for k, v in req.headers.items()
                                    if k.lower() in ("accept", "accept-language",
                                                     "content-type", "x-requested-with")},
                        "totalPages": entrada["totalPages"],
                        "chave_lista": meta.get("chave_lista"),
                    }
            except Exception:
                pass

        pagina.on("response", _ao_responder)

        t0 = time.monotonic()
        try:
            await pagina.goto(url, wait_until="domcontentloaded", timeout=tempo_limite_ms)
        except _ErroTempoLimiteBrowser:
            registo.warning(f"[Browser] Tempo limite excedido em domcontentloaded para {url}")

        try:
            await asyncio.wait_for(pagina.evaluate(JS_ACEITAR_COOKIES), timeout=0.3)
        except Exception:
            pass

        async def _aguardar_componentes():
            try:
                # Sono mínimo obrigatório para permitir o início da hidratação JS
                await asyncio.sleep(2.0)
                # Esperar por indicadores comuns de conteúdo ou qualquer imagem
                await pagina.wait_for_selector('.ant-pagination, .ant-list-item, .ant-card, .article, .content, img', timeout=5000)
                # Sono adicional após o seletor aparecer
                await asyncio.sleep(1.5)
            except:
                pass

        try:
            await asyncio.gather(
                pagina.evaluate(JS_SCROLL),
                pagina.evaluate(JS_EXPANDIR_MENUS),
                pagina.evaluate(JS_AGUARDAR_ESTABILIDADE),
                _aguardar_componentes(),
                return_exceptions=True
            )
        except Exception as e:
            registo.warning(f"[Browser] Erro na estabilização: {e}")
        finally:
            try:
                await pagina.evaluate("window.scrollTo(0, 0)")
            except Exception:
                pass

        try:
            dados = await asyncio.wait_for(pagina.evaluate(JS_EXTRAIR, ignorar_nav_footer), timeout=5.0)
        except Exception as e:
            registo.warning(f"[Browser] Falha JS_EXTRAIR: {e}")
            dados = {"imagens": [], "titulo": "", "url_final": url, "canonical": "", "e_next": False}

        try:
            pag_dom = await asyncio.wait_for(
                pagina.evaluate(JS_DETETAR_PAGINACAO), timeout=2.0
            )
        except Exception:
            pag_dom = {}

        if api_capturada:
            pag_dom = dict(pag_dom or {})
            pag_dom["api_capturada"] = api_capturada

        try:
            html = await pagina.content()
        except Exception:
            html = ""

        decorrido = time.monotonic() - t0
        registo.info(f"[Browser] {url} {decorrido:.2f}s ({_MOTOR_BROWSER})")

        return {
            "titulo": dados.get("titulo") or "",
            "url_final": dados.get("url_final") or url,
            "canonical": dados.get("canonical") or "",
            "e_next": bool(dados.get("e_next")),
            "html": html,
            "imagens": dados.get("imagens") or [],
            "links": dados.get("links") or [],
            "dom_paginacao": pag_dom or {},
            "registo_pedidos": registo_pedidos,
        }


__all__ = ["GestorBrowser", "renderizar_e_extrair"]
