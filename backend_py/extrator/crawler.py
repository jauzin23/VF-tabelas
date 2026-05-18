from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import asdict
from typing import Any, Awaitable, Callable
from urllib.parse import urljoin, urlparse

import httpx

from config import registo, garantir_ambiente_carregado, resolver_caminho_dados

from .renderizador_browser import GestorBrowser, renderizar_e_extrair
from .suporte import construir_cliente
from .imagens import (
    extrair_estatico, extrair_links, extrair_rel_next,
    percorrer_paginacao, extrair_dados_next, percorrer_imagens,
)
from .paginas import (
    construir_urls_fanout, detetar_paginacao, probar_paginas,
)
from .tipos import (
    ImagemEncontrada, Paginacao,
    construir_url_paginada, deve_ignorar_url, env_int, normalizar_host, obter_hosts,
    normalizar_url, normalizar_url_pagina, parametro_pagina_de_url,
    parece_imagem, normalizar_imagem_url,
)


garantir_ambiente_carregado()


LARGURA_MIN = env_int("MIN_IMAGE_WIDTH", 120)
ALTURA_MIN = env_int("MIN_IMAGE_HEIGHT", 80)
AREA_MIN = env_int("MIN_IMAGE_AREA", 9600)


def _dimensoes_efetivas(img: dict[str, Any]) -> tuple[int, int]:
    l = max(int(img.get("largura") or 0), int(img.get("largura_natural") or 0))
    a = max(int(img.get("altura") or 0), int(img.get("altura_natural") or 0))
    return l, a


def _deve_ignorar_imagem_especifica(origem: str) -> bool:
    minuscula = origem.lower()
    path = urlparse(minuscula).path
    if "data:image/svg" in minuscula or path.endswith(".svg") or ".svg?" in minuscula:
        return True
    
    # Padroes comuns de icones e lixo
    for padrao in ("basemaps.cartocdn.com", "tile.openstreetmap.org",
                  "maps.googleapis.com", "maps.gstatic.com",
                  "/icon", "/logo", "/avatar", "favicon", "thumb", "advert", "pixel"):
        if padrao in minuscula:
            return True
    return False


_RE_DIMENSOES_URL = re.compile(r"[-_](\d+)x(\d+)(?:\.|@|_|$)", re.I)


def _imagem_muito_pequena(l: int, a: int, url: str = "") -> bool:
    # Se temos dimensoes explicitas, usamos
    if l > 0 and a > 0:
        if l < 10 or a < 10:
            return True
        if l < LARGURA_MIN or a < ALTURA_MIN or (l * a) < AREA_MIN:
            return True
        return False

    # Se nao temos dimensoes, tentamos inferir da URL
    if url:
        m = _RE_DIMENSOES_URL.search(url)
        if m:
            ul, ua = int(m.group(1)), int(m.group(2))
            if ul < LARGURA_MIN or ua < ALTURA_MIN or (ul * ua) < AREA_MIN:
                return True
        
        # Se contem palavras como icon, logo, etc. e nao temos dimensoes,
        # assumimos que pode ser pequeno.
        u_low = url.lower()
        if any(x in u_low for x in ("icon", "logo", "avatar", "favicon", "/thumb", "/small")):
             return True

    return False


class _EstadoJob:
    def __init__(self) -> None:
        self.resultados: list[ImagemEncontrada] = []
        self.url_para_resultado: dict[str, ImagemEncontrada] = {}
        self.paginas_visitadas: set[str] = set()
        self.paginas_em_fila: set[str] = set()
        self.paginas_concluidas: set[str] = set()
        self.paginas_paginacao_descobertas: int = 0
        self.paginas_paginacao_concluidas: int = 0
        self.caminho_persistencia: str | None = None
        self.bloqueio_resultados = asyncio.Lock()
        self.bloqueio_visitas = asyncio.Lock()
        self.estatisticas: dict[str, int] = {
            "excluidas_data_uri": 0,
            "excluidas_lista_negra": 0,
            "excluidas_dimensoes": 0,
            "excluidas_limite_total": 0,
            "excluidas_limite_pagina": 0,
            "imagens_incluidas": 0,
            "paginas_saltadas": 0,
            "paginas_timeout": 0,
            "paginas_erro": 0,
            "paginas_paginacao": 0,
        }
        self.bloqueio_estatisticas = asyncio.Lock()

    async def obter_totais(self) -> tuple[int, int]:
        async with self.bloqueio_visitas:
            total_normais_desc = len(self.paginas_visitadas) + len(self.paginas_em_fila)
            total_normais_conc = len(self.paginas_concluidas)
        async with self.bloqueio_estatisticas:
            total_pag_desc = self.paginas_paginacao_descobertas
            total_pag_conc = self.paginas_paginacao_concluidas
        
        descobertas = total_normais_desc + total_pag_desc
        processadas = total_normais_conc + total_pag_conc
        return descobertas, processadas

    async def emitir_progresso(self, retrochamadas: dict[str, Any]) -> None:
        if not retrochamadas:
            return
        cb_desc = retrochamadas.get("ao_descobrir_paginas")
        cb_proc = retrochamadas.get("ao_processar_pagina")
        if not cb_desc and not cb_proc:
            return
        
        descobertas, processadas = await self.obter_totais()
        if cb_desc:
            try: cb_desc(descobertas)
            except Exception: pass
        if cb_proc:
            try: cb_proc(processadas)
            except Exception: pass

    async def incrementar(self, chave: str, n: int = 1) -> None:
        async with self.bloqueio_estatisticas:
            self.estatisticas[chave] = self.estatisticas.get(chave, 0) + n

    async def persistir_estado_paginas(self) -> None:
        try:
            if not self.caminho_persistencia:
                return
            async with self.bloqueio_visitas:
                path = self.caminho_persistencia
                tmp = path + ".tmp"
                with open(tmp, "w", encoding="utf8") as f:
                    import json
                    json.dump(list(self.paginas_visitadas), f, ensure_ascii=False)
                os.replace(tmp, path)
        except Exception:
            pass

    async def adicionar_imagem(
        self, *, url_pagina: str, titulo: str,
        url_origem: str, url_contentor: str, bruta: dict[str, Any],
    ) -> bool:
        async with self.bloqueio_resultados:
            if url_origem in self.url_para_resultado:
                existente = self.url_para_resultado[url_origem]
                if not any(p["url"] == url_pagina for p in existente.paginas_origem):
                    existente.paginas_origem.append({"url": url_pagina, "titulo": titulo})
                return False
            dl, da = _dimensoes_efetivas(bruta)
            img = ImagemEncontrada(
                id=str(len(self.resultados) + 1),
                url_pagina=url_pagina, titulo_pagina=titulo,
                url_origem=url_origem, url_contentor=url_contentor,
                alt=bruta.get("alt", "") or "",
                paginas_origem=[{"url": url_pagina, "titulo": titulo}],
            )
            self.resultados.append(img)
            self.url_para_resultado[url_origem] = img
            return True


async def _processar_imagens_encontradas(
    estado: _EstadoJob,
    *,
    url_pagina: str,
    titulo: str,
    brutas: list[dict[str, Any]],
    extras_og: list[str],
    extras_dados_next: list[str],
    max_total: int | None,
    max_por_pagina: int | None,
    retrochamadas: dict[str, Any],
) -> int:
    todas = (
        [b for b in brutas]
        + [{"src": u, "alt": "og:image"} for u in extras_og]
        + [{"src": u, "alt": ""} for u in extras_dados_next]
    )

    adicionadas = 0
    total_bruto = len(todas)
    await estado.incrementar("bulk_bruto", total_bruto)
    bulk_acumulado = estado.estatisticas.get("bulk_bruto", 0)

    if retrochamadas.get("ao_encontrar_imagens"):
        try:
            retrochamadas["ao_encontrar_imagens"](
                len(estado.resultados) + adicionadas, bulk_acumulado,
            )
        except Exception:
            pass

    for bruta in todas:
        if max_total and max_total > 0 and len(estado.resultados) >= max_total:
            await estado.incrementar("excluidas_limite_total")
            break
        if max_por_pagina and max_por_pagina > 0 and adicionadas >= max_por_pagina:
            await estado.incrementar("excluidas_limite_pagina")
            break

        src = (bruta.get("url_origem") or bruta.get("src") or "").strip()
        if not src:
            continue
        url_resolvida = normalizar_imagem_url(url_pagina, src)
        if not url_resolvida:
            await estado.incrementar("excluidas_data_uri")
            continue
        if _deve_ignorar_imagem_especifica(url_resolvida):
            await estado.incrementar("excluidas_lista_negra")
            continue
        if _imagem_muito_pequena(*_dimensoes_efetivas(bruta), url=url_resolvida):
            await estado.incrementar("excluidas_dimensoes")
            continue

        url_contentor = normalizar_url(urljoin(url_pagina, src))
        url_origem = normalizar_url(url_resolvida)
        criada = await estado.adicionar_imagem(
            url_pagina=url_pagina, titulo=titulo,
            url_origem=url_origem, url_contentor=url_contentor if url_contentor != url_origem else url_origem,
            bruta=bruta,
        )
        if criada:
            adicionadas += 1
            await estado.incrementar("imagens_incluidas")

    if adicionadas > 0:
        registo.info(f"   [Extração] {url_pagina}: +{adicionadas} imagens novas (total={len(estado.resultados)})")

    if retrochamadas.get("ao_encontrar_imagens"):
        try:
            retrochamadas["ao_encontrar_imagens"](len(estado.resultados), estado.estatisticas.get("bulk_bruto", 0))
        except Exception:
            pass

    return adicionadas


async def _obter_estatico(
    cliente: httpx.AsyncClient, url: str,
) -> tuple[str | None, dict[str, Any] | None, str | None, str]:
    try:
        resposta = await cliente.get(url)
    except httpx.HTTPError as e:
        registo.warning(f"[Estatico] Erro ao obter {url}: {e}")
        return None, None, None, url

    if resposta.status_code >= 400:
        registo.warning(f"[Estatico] {url} -> HTTP {resposta.status_code}")
        return None, None, resposta.headers.get("content-type"), str(resposta.url)

    ct = (resposta.headers.get("content-type") or "").lower()
    if "html" not in ct and "json" not in ct and "xml" not in ct:
        return None, None, ct, str(resposta.url)

    if "json" in ct:
        return resposta.text, None, ct, str(resposta.url)

    html = resposta.text
    nd = extrair_dados_next(html) if html else None
    return html, nd, ct, str(resposta.url)


async def _processar_pagina_estatica(
    estado: _EstadoJob,
    *,
    url: str,
    html: str | None,
    dados_next: dict[str, Any] | None,
    titulo_pagina: str = "",
    max_total: int | None,
    max_por_pagina: int | None,
    retrochamadas: dict[str, Any],
) -> int:
    if not html:
        return 0

    brutas_estaticas = extrair_estatico(html, url)
    extras_og = [b["url_origem"] for b in brutas_estaticas if b.get("e_imagem_og")]
    brutas = [b for b in brutas_estaticas if not b.get("e_imagem_og")]

    extras_dn: list[str] = []
    if dados_next:
        for u in percorrer_imagens(dados_next):
            if u:
                resolvida = normalizar_imagem_url(url, u)
                if resolvida:
                    extras_dn.append(resolvida)

    return await _processar_imagens_encontradas(
        estado,
        url_pagina=url, titulo=titulo_pagina,
        brutas=brutas, extras_og=extras_og, extras_dados_next=extras_dn,
        max_total=max_total, max_por_pagina=max_por_pagina,
        retrochamadas=retrochamadas,
    )


async def _processar_api_paralela(
    cliente: httpx.AsyncClient,
    *,
    pag: Paginacao,
    estado: _EstadoJob,
    url_origem_pagina: str,
    titulo_origem: str,
    max_total: int | None,
    max_por_pagina: int | None,
    paginas_max: int,
    concorrencia: int,
    retrochamadas: dict[str, Any],
) -> list[str]:
    if not pag.api_modelo or not pag.total_paginas:
        return []

    total = min(int(pag.total_paginas), paginas_max)
    paginas = list(range(1, total + 1))
    if pag.pagina_atual == 1 and pag.fonte and "xhr" in pag.fonte.lower():
        paginas = [k for k in paginas if k != 1]

    if paginas:
        async with estado.bloqueio_estatisticas:
            estado.paginas_paginacao_descobertas += len(paginas)
        await estado.emitir_progresso(retrochamadas)

    semaforo = asyncio.Semaphore(concorrencia)
    urls_detalhe: list[str] = []
    bloqueio_detalhe = asyncio.Lock()

    metodo = (pag.api_metodo or "GET").upper()

    async def _uma_pagina(k: int) -> None:
        try:
            url_api = pag.api_modelo.replace("{N}", str(k))
            try:
                async with semaforo:
                    if metodo == "GET":
                        r = await cliente.get(url_api, headers=pag.api_cabecalhos or None)
                    else:
                        r = await cliente.request(
                            metodo, url_api, json=pag.api_corpo,
                            headers=pag.api_cabecalhos or None,
                        )
            except httpx.HTTPError as e:
                registo.warning(f"[API] {url_api}: {e}")
                await estado.incrementar("paginas_erro")
                return
            if r.status_code >= 400:
                await estado.incrementar("paginas_erro")
                return
            try:
                dados = r.json()
            except Exception:
                return

            urls_imgs = percorrer_imagens(dados)
            brutas = [{"src": u, "alt": ""} for u in urls_imgs]
            await _processar_imagens_encontradas(
                estado,
                url_pagina=construir_url_paginada(url_origem_pagina, k, pag.parametro_pagina),
                titulo=titulo_origem,
                brutas=brutas, extras_og=[], extras_dados_next=[],
                max_total=max_total, max_por_pagina=max_por_pagina,
                retrochamadas=retrochamadas,
            )

            if pag.chave_lista_api:
                itens = dados
                for chave in pag.chave_lista_api.split("."):
                    if isinstance(itens, dict):
                        itens = itens.get(chave)
                    else:
                        itens = None
                        break
                if isinstance(itens, list):
                    for item in itens:
                        if not isinstance(item, dict):
                            continue
                        for v in item.values():
                            if isinstance(v, str) and v.startswith(("/", "http")):
                                completa = urljoin(url_origem_pagina, v)
                                p = urlparse(completa)
                                if p.scheme in ("http", "https"):
                                    async with bloqueio_detalhe:
                                        urls_detalhe.append(normalizar_url(completa))

            await estado.incrementar("paginas_paginacao")
        finally:
            async with estado.bloqueio_estatisticas:
                estado.paginas_paginacao_concluidas += 1
            await estado.emitir_progresso(retrochamadas)

    await asyncio.gather(*(_uma_pagina(k) for k in paginas))
    return urls_detalhe


async def _processar_estatico_paralelo(
    cliente: httpx.AsyncClient,
    *,
    pag: Paginacao,
    url_base: str,
    titulo_pagina: str,
    estado: _EstadoJob,
    max_total: int | None,
    max_por_pagina: int | None,
    paginas_max: int,
    concorrencia: int,
    retrochamadas: dict[str, Any],
    ignorar_nav_footer: bool = False,
) -> list[str]:
    urls = construir_urls_fanout(
        pag, url_base, pagina_inicial_excluir=pag.pagina_atual,
        max_paginas=paginas_max,
    )
    if not urls:
        return []

    async with estado.bloqueio_estatisticas:
        estado.paginas_paginacao_descobertas += len(urls)
    await estado.emitir_progresso(retrochamadas)

    semaforo = asyncio.Semaphore(concorrencia)
    detalhes: list[str] = []
    bloqueio_detalhe = asyncio.Lock()
    host_alvo = normalizar_host(urlparse(url_base).netloc)

    async def _uma_pagina(url: str) -> None:
        try:
            async with semaforo:
                html, nd, _ct, _ = await _obter_estatico(cliente, url)
            if html is None:
                await estado.incrementar("paginas_erro")
                return
            await _processar_pagina_estatica(
                estado, url=url, html=html, dados_next=nd,
                titulo_pagina=titulo_pagina,
                max_total=max_total, max_por_pagina=max_por_pagina,
                retrochamadas=retrochamadas,
            )
            await estado.incrementar("paginas_paginacao")

            for link in extrair_links(html, url, ignorar_nav_footer=ignorar_nav_footer):
                if normalizar_host(urlparse(link).netloc) == host_alvo:
                    async with bloqueio_detalhe:
                        detalhes.append(normalizar_url(link))
        finally:
            async with estado.bloqueio_estatisticas:
                estado.paginas_paginacao_concluidas += 1
            await estado.emitir_progresso(retrochamadas)

    await asyncio.gather(*(_uma_pagina(u) for u in urls))
    return detalhes


async def _processar_browser_paralelo(
    gestor: GestorBrowser,
    *,
    pag: Paginacao,
    url_base: str,
    estado: _EstadoJob,
    max_total: int | None,
    max_por_pagina: int | None,
    paginas_max: int,
    tempo_limite_ms: int,
    retrochamadas: dict[str, Any],
    ignorar_nav_footer: bool = False,
) -> list[str]:
    """Processa páginas de paginação via browser em paralelo.
    A concorrência real é controlada pelo semáforo global em GestorBrowser.pagina().
    """
    urls = construir_urls_fanout(
        pag, url_base, pagina_inicial_excluir=pag.pagina_atual,
        max_paginas=paginas_max,
    )
    if not urls:
        return []

    async with estado.bloqueio_estatisticas:
        estado.paginas_paginacao_descobertas += len(urls)
    await estado.emitir_progresso(retrochamadas)

    detalhes: list[str] = []
    bloqueio_detalhe = asyncio.Lock()
    host_alvo = normalizar_host(urlparse(url_base).netloc)

    async def _uma_pagina(url: str) -> None:
        try:
            try:
                dados = await renderizar_e_extrair(
                    url, gestor, tempo_limite_ms=tempo_limite_ms, capturar_api=False,
                    ignorar_nav_footer=ignorar_nav_footer, modo_rapido=True,
                )
            except Exception as e:
                registo.warning(f"[BrowserParalelo] {url}: {e}")
                await estado.incrementar("paginas_erro")
                return

            brutas = dados.get("imagens") or []
            await _processar_imagens_encontradas(
                estado,
                url_pagina=url, titulo=dados.get("titulo", "") or "",
                brutas=brutas, extras_og=[], extras_dados_next=[],
                max_total=max_total, max_por_pagina=max_por_pagina,
                retrochamadas=retrochamadas,
            )
            await estado.incrementar("paginas_paginacao")

            links_encontrados = set(extrair_links(dados.get("html") or "", url, ignorar_nav_footer=ignorar_nav_footer))
            for l_js in (dados.get("links") or []):
                links_encontrados.add(l_js)

            for link in links_encontrados:
                if normalizar_host(urlparse(link).netloc) == host_alvo:
                    async with bloqueio_detalhe:
                        detalhes.append(normalizar_url(link))
        finally:
            async with estado.bloqueio_estatisticas:
                estado.paginas_paginacao_concluidas += 1
            await estado.emitir_progresso(retrochamadas)

    await asyncio.gather(*(_uma_pagina(u) for u in urls))
    return detalhes


async def _rastrear_detalhes(
    cliente: httpx.AsyncClient,
    *,
    estado: _EstadoJob,
    urls_semente: list[str],
    hosts_permitidos: set[str],
    max_paginas: int,
    max_profundidade: int,
    concorrencia: int,
    max_total: int | None,
    max_por_pagina: int | None,
    retrochamadas: dict[str, Any],
    gestor_browser: GestorBrowser | None = None,
    tempo_limite_ms: int = 15000,
    ignorar_nav_footer: bool = False,
) -> None:
    if not urls_semente:
        return

    profundidade_ilimitada = (max_profundidade == 0)

    fila: asyncio.Queue[tuple[str, int]] = asyncio.Queue()
    semaforo = asyncio.Semaphore(concorrencia)

    async def _emitir_descobertas() -> None:
        await estado.emitir_progresso(retrochamadas)

    async def _enfileirar(url: str, profundidade: int) -> bool:
        n_url = normalizar_url(url)
        if deve_ignorar_url(n_url):
            return False
        h = normalizar_host(urlparse(n_url).netloc)
        if h not in hosts_permitidos:
            return False
        async with estado.bloqueio_visitas:
            total_unico = len(estado.paginas_visitadas) + len(estado.paginas_em_fila)
            if max_paginas > 0 and total_unico >= max_paginas:
                return False
            if n_url in estado.paginas_visitadas or n_url in estado.paginas_em_fila:
                return False
            estado.paginas_em_fila.add(n_url)
        await fila.put((n_url, profundidade))
        await _emitir_descobertas()
        return True

    for u in urls_semente:
        await _enfileirar(u, 1)

    async def _trabalhador() -> None:
        while True:
            try:
                url, profundidade = await asyncio.wait_for(fila.get(), timeout=0.4)
            except asyncio.TimeoutError:
                if fila.empty():
                    return
                continue

            async with estado.bloqueio_visitas:
                if url in estado.paginas_visitadas:
                    fila.task_done()
                    continue
                estado.paginas_visitadas.add(url)
                estado.paginas_em_fila.discard(url)

            await estado.emitir_progresso(retrochamadas)

            try:
                async with semaforo:
                    if retrochamadas.get("ao_visitar_url"):
                        try:
                            retrochamadas["ao_visitar_url"](url)
                        except Exception:
                            pass
                    t0 = time.monotonic()
                    try:
                        if parece_imagem(url):
                            resolvida = normalizar_url(url)
                            await estado.adicionar_imagem(
                                url_pagina="", titulo="", url_origem=resolvida,
                                url_contentor=resolvida, bruta={"src": resolvida, "alt": "Link direto"},
                            )
                            await estado.incrementar("imagens_incluidas")
                        else:
                            html, nd, _ct, final_url = await _obter_estatico(cliente, url)
                            
                            tentar_browser = (not html) or (gestor_browser is not None)
                            
                            if html:
                                # Processamento estático inicial (pre-flight)
                                await _processar_pagina_estatica(
                                    estado, url=url, html=html, dados_next=nd,
                                    max_total=max_total, max_por_pagina=max_por_pagina,
                                    retrochamadas=retrochamadas,
                                )
                            
                            # Sempre tenta o browser para detalhe em sites Next.js (garante conteúdo dinâmico)
                            if gestor_browser:
                                try:
                                    dados_b = await renderizar_e_extrair(
                                        url, gestor_browser, tempo_limite_ms=tempo_limite_ms,
                                        capturar_api=False, ignorar_nav_footer=ignorar_nav_footer,
                                        modo_rapido=True, # Detalhes em lote também usam modo rápido
                                    )
                                    html_b = dados_b.get("html")
                                    if html_b:
                                        html = html_b
                                        brutas = dados_b.get("imagens") or []
                                        registo.info(f"[Detalhe] {url} | Imagens dinâmicas: {len(brutas)}")
                                        await _processar_imagens_encontradas(
                                            estado,
                                            url_pagina=url, titulo=dados_b.get("titulo", "") or "",
                                            brutas=brutas, extras_og=[], extras_dados_next=[],
                                            max_total=max_total, max_por_pagina=max_por_pagina,
                                            retrochamadas=retrochamadas,
                                        )
                                except Exception as e:
                                    registo.warning(f"[DetalheBrowser] {url}: {e}")
                                    if not html:
                                        await estado.incrementar("paginas_erro")

                            if html and (profundidade_ilimitada or profundidade < max_profundidade):
                                links_encontrados = set(extrair_links(html, url, ignorar_nav_footer=ignorar_nav_footer))
                                
                                if "dados_b" in locals() and dados_b.get("links"):
                                    for l_js in dados_b["links"]:
                                        links_encontrados.add(l_js)
                                        
                                for link in links_encontrados:
                                    n_link = normalizar_url(link)
                                    await _enfileirar(n_link, profundidade + 1)
                    except Exception as e:
                        registo.warning(f"[Detalhe] Erro em {url}: {e}")
                        await estado.incrementar("paginas_erro")

                    try:
                        if estado.caminho_persistencia and len(estado.paginas_visitadas) % 50 == 0:
                            await estado.persistir_estado_paginas()
                    except Exception:
                        pass
                
                # Log de conclusão do detalhe
                adicionadas_nesta_pag = 0 # (seria bom ter esse tracking por pagina, mas estado.imagens_incluidas é global)
                registo.info(
                    f"[Detalhe] {url} ({time.monotonic() - t0:.2f}s) "
                    f"vis={len(estado.paginas_visitadas)} fila={fila.qsize()}"
                )
            finally:
                async with estado.bloqueio_visitas:
                    estado.paginas_concluidas.add(url)
                await estado.emitir_progresso(retrochamadas)
                fila.task_done()

    trabalhadores = [asyncio.create_task(_trabalhador())
                     for _ in range(max(1, concorrencia))]
    try:
        await fila.join()
    finally:
        for t in trabalhadores:
            t.cancel()
        await asyncio.gather(*trabalhadores, return_exceptions=True)


async def rastrear_site(
    entrada_alvo: str | list[str],
    opcoes: dict[str, Any],
    chamadas_retorno: dict[str, Any],
) -> tuple[list[ImagemEncontrada], dict[str, int]]:
    e_multi = isinstance(entrada_alvo, list)
    if e_multi:
        primeira = entrada_alvo[0] if entrada_alvo else ""
        urls_iniciais = [normalizar_url(u) for u in entrada_alvo if u]
    else:
        primeira = entrada_alvo
        urls_iniciais = [normalizar_url(entrada_alvo)] if entrada_alvo else []

    if not urls_iniciais:
        return [], {}

    def _opc_int(chave: str, padrao: int) -> int:
        v = opcoes.get(chave)
        if v is None and chave in opcoes:
            return 0
        try:
            return int(v) if v is not None else padrao
        except (TypeError, ValueError):
            return padrao

    max_paginas = _opc_int("max_paginas", env_int("MAX_PAGES", 0))
    max_profundidade = _opc_int("max_profundidade", env_int("MAX_DEPTH", 2))
    tempo_limite_ms = _opc_int("tempo_limite_pagina_ms", env_int("PAGE_TIMEOUT_MS", 30000))
    max_total = opcoes.get("max_imagens_total")
    max_por_pagina = opcoes.get("max_imagens_por_pagina")
    concorrencia = _opc_int("concorrencia", env_int("CRAWLER_CONCURRENCY", 0))
    if concorrencia <= 0:
        concorrencia = max(4, (os.cpu_count() or 4) * 2)

    concorrencia_browser = _opc_int("concorrencia_browser", env_int("BROWSER_CONCURRENCY", 0))
    if concorrencia_browser <= 0:
        concorrencia_browser = 3

    seguir_paginacao = opcoes.get("seguir_paginacao", True)
    seguir_detalhe = opcoes.get("seguir_detalhe", True)

    hosts_alvo = set()
    for u in urls_iniciais:
        h = urlparse(u).netloc
        if h:
            hosts_alvo.add(normalizar_host(h))
            hosts_alvo.add(h.lower().removeprefix("www."))

    retrochamadas = chamadas_retorno or {}
    estado = _EstadoJob()

    caminho_dados = resolver_caminho_dados(os.getenv("DATA_PATH", "./data"))
    id_tarefa = opcoes.get("id_tarefa") or "_partilhado"
    dir_cache_http = os.path.join(caminho_dados, "tarefas", str(id_tarefa), "cache", "http")

    cliente = construir_cliente(diretorio_cache=dir_cache_http, tempo_limite=tempo_limite_ms / 1000)
    gestor_browser = GestorBrowser(max_tabs=concorrencia_browser)
    try:
        dir_tarefa = os.path.join(caminho_dados, "tarefas", str(id_tarefa))
        os.makedirs(dir_tarefa, exist_ok=True)
        estado.caminho_persistencia = os.path.join(dir_tarefa, "paginas_visitadas.json")
    except Exception:
        estado.caminho_persistencia = None

    async def _processar_ponto_entrada(url_inicial: str, ignorar_nav_footer: bool = False) -> list[str]:
        n_url = normalizar_url(url_inicial)
        async with estado.bloqueio_visitas:
            if n_url in estado.paginas_visitadas:
                return []
            estado.paginas_visitadas.add(n_url)

        await estado.emitir_progresso(retrochamadas)
        if retrochamadas.get("ao_visitar_url"):
            try:
                retrochamadas["ao_visitar_url"](url_inicial)
            except Exception:
                pass

        try:
            html, nd, ct, _final_url = await _obter_estatico(cliente, url_inicial)
            titulo_inicial = ""
            adicionadas_estatico = 0
            if html and ct and "html" in ct.lower():
                adicionadas_estatico = await _processar_pagina_estatica(
                    estado, url=url_inicial, html=html, dados_next=nd,
                    max_total=max_total, max_por_pagina=max_por_pagina,
                    retrochamadas=retrochamadas,
                )

            pag = detetar_paginacao(url=url_inicial, html=html, dados_next=nd) if seguir_paginacao else Paginacao()

            tem_pag_completa_estatica = (
                pag.e_listagem_paginada
                and pag.total_paginas
                and pag.total_paginas > 1
            )
            conteudo_escasso = (not nd) and (adicionadas_estatico <= 1)

            precisa_browser = True

            dados_browser: dict[str, Any] | None = None
            if precisa_browser:
                try:
                    dados_browser = await renderizar_e_extrair(
                        url_inicial, gestor_browser, tempo_limite_ms=tempo_limite_ms,
                        capturar_api=True, ignorar_nav_footer=ignorar_nav_footer,
                    )
                    titulo_inicial = dados_browser.get("titulo", "") or ""
                    brutas_b = dados_browser.get("imagens") or []
                    registo.info(f"[Pre-flight] {url_inicial} | Imagens: {len(brutas_b)}")
                    await _processar_imagens_encontradas(
                        estado, url_pagina=url_inicial, titulo=titulo_inicial,
                        brutas=brutas_b, extras_og=[], extras_dados_next=[],
                        max_total=max_total, max_por_pagina=max_por_pagina,
                        retrochamadas=retrochamadas,
                    )
                    pag = detetar_paginacao(
                        url=url_inicial, html=dados_browser.get("html") or html,
                        dados_next=nd, informacao_dom=dados_browser.get("dom_paginacao"),
                        registo_pedidos=dados_browser.get("registo_pedidos"),
                    )
                except Exception as e:
                    registo.warning(f"[Pre-flight browser] {url_inicial}: {e}")
                    await estado.incrementar("paginas_erro")

            registo.info(
                f"[Paginacao] {url_inicial} | e_listagem={pag.e_listagem_paginada} "
                f"total={pag.total_paginas} fonte={pag.fonte} "
                f"api={'sim' if pag.api_modelo else 'nao'}"
            )
            if retrochamadas.get("ao_detectar_paginacao") and pag.total_paginas:
                try:
                    retrochamadas["ao_detectar_paginacao"](int(pag.total_paginas))
                except Exception:
                    pass

            sementes_detalhe: list[str] = []
            paginas_max_uso = max_paginas if max_paginas > 0 else 9999

            if seguir_paginacao and pag.e_listagem_paginada and pag.total_paginas and pag.total_paginas > 1:
                if pag.api_modelo:
                    sementes_detalhe.extend(await _processar_api_paralela(
                        cliente, pag=pag, estado=estado,
                        url_origem_pagina=url_inicial, titulo_origem=titulo_inicial,
                        max_total=max_total, max_por_pagina=max_por_pagina,
                        paginas_max=paginas_max_uso, concorrencia=concorrencia,
                        retrochamadas=retrochamadas,
                    ))
                else:
                    via_estatica = (not dados_browser and bool(html) and (bool(nd) or adicionadas_estatico > 1))
                    if via_estatica:
                        sementes_detalhe.extend(await _processar_estatico_paralelo(
                            cliente, pag=pag, url_base=url_inicial, titulo_pagina=titulo_inicial,
                            estado=estado, max_total=max_total, max_por_pagina=max_por_pagina,
                            paginas_max=paginas_max_uso, concorrencia=concorrencia,
                            retrochamadas=retrochamadas, ignorar_nav_footer=ignorar_nav_footer,
                        ))
                    else:
                        sementes_detalhe.extend(await _processar_browser_paralelo(
                            gestor_browser, pag=pag, url_base=url_inicial,
                            estado=estado, max_total=max_total, max_por_pagina=max_por_pagina,
                            paginas_max=paginas_max_uso,
                            tempo_limite_ms=tempo_limite_ms,
                            retrochamadas=retrochamadas,
                            ignorar_nav_footer=ignorar_nav_footer,
                        ))

            if not dados_browser:
                registo.warning(f"[Crawler] Falha ao obter dados do browser para {url_inicial}")
                return []
                
            html = dados_browser.get("html") or ""
            links_iniciais = set(extrair_links(html, url_inicial, ignorar_nav_footer=ignorar_nav_footer))
            if dados_browser and dados_browser.get("links"):
                for l_js in dados_browser["links"]:
                    links_iniciais.add(l_js)
            
            for l in links_iniciais:
                h = normalizar_host(urlparse(l).netloc)
                if h in hosts_alvo:
                    sementes_detalhe.append(normalizar_url(l))

            return sementes_detalhe
        finally:
            async with estado.bloqueio_visitas:
                estado.paginas_concluidas.add(n_url)
            await estado.emitir_progresso(retrochamadas)

    ignorar_nav_footer = e_multi

    try:
        todas_sementes = []
        if e_multi:
            # Entry-points em paralelo - o semáforo global em GestorBrowser.pagina()
            # garante que no máximo concorrencia_browser tabs Chromium ficam activos
            # em simultâneo, prevenindo saturação sem sacrificar paralelismo.
            tarefas_iniciais = [
                asyncio.create_task(_processar_ponto_entrada(u, ignorar_nav_footer=ignorar_nav_footer))
                for u in urls_iniciais
            ]
            resultados_sementes = await asyncio.gather(*tarefas_iniciais)
            for res in resultados_sementes:
                todas_sementes.extend(res)
        else:
            sementes = await _processar_ponto_entrada(urls_iniciais[0], ignorar_nav_footer=False)
            todas_sementes.extend(sementes)

        if seguir_detalhe:
            await _rastrear_detalhes(
                cliente, estado=estado, urls_semente=todas_sementes,
                hosts_permitidos=hosts_alvo, max_paginas=max_paginas,
                max_profundidade=max_profundidade, concorrencia=concorrencia,
                max_total=max_total, max_por_pagina=max_por_pagina,
                retrochamadas=retrochamadas, gestor_browser=gestor_browser,
                tempo_limite_ms=tempo_limite_ms, ignorar_nav_footer=ignorar_nav_footer,
            )
    finally:
        await gestor_browser.fechar_tudo()
        await cliente.aclose()

    return estado.resultados, estado.estatisticas
