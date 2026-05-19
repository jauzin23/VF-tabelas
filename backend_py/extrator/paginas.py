from __future__ import annotations

import hashlib
import json
import re
from dataclasses import replace
from typing import Any, Awaitable, Callable
from urllib.parse import parse_qsl, urlparse, urlunparse, urljoin

from selectolax.parser import HTMLParser

from .imagens import percorrer_paginacao, extrair_dados_next
from .tipos import Paginacao, PARAMETROS_PAGINACAO, construir_url_paginada, normalizar_url, parametro_pagina_de_url
from config import registo


def detetar_paginacao(
    *,
    url: str,
    html: str | None = None,
    dados_next: dict[str, Any] | None = None,
    informacao_dom: dict[str, Any] | None = None,
    registo_pedidos: list[dict[str, Any]] | None = None,
) -> Paginacao:
    pag = Paginacao()

    if dados_next is None and html:
        dados_next = extrair_dados_next(html)

    if dados_next:
        info = percorrer_paginacao(dados_next)
        if info.get("total_paginas"):
            pag.e_listagem_paginada = True
            pag.total_paginas = int(info["total_paginas"])
            pag.pagina_atual = int(info.get("pagina_atual", 1) or 1)
            pag.fonte = "__NEXT_DATA__" + (" (derivado)" if info.get("derivado") else "")
            registo.info(f"[Detetor] NEXT_DATA encontrou total={pag.total_paginas}")

    nome, valor = parametro_pagina_de_url(url)
    if nome:
        pag.parametro_pagina = nome
        if valor and valor > pag.pagina_atual:
            pag.pagina_atual = valor
        if not pag.e_listagem_paginada:
            pag.fonte = pag.fonte or "pista_url"

    if not pag.e_listagem_paginada and html:
        arvore = HTMLParser(html)
        no_ultimo = arvore.css_first('link[rel="last"]')
        if no_ultimo is not None:
            href_ultimo = (no_ultimo.attributes.get("href") or "").strip()
            if href_ultimo:
                ultimo_abs = urljoin(url, href_ultimo)
                _nome2, valor2 = parametro_pagina_de_url(ultimo_abs)
                if valor2:
                    pag.e_listagem_paginada = True
                    pag.total_paginas = valor2
                    pag.parametro_pagina = _nome2 or pag.parametro_pagina
                    pag.fonte = "rel_ultimo"
        no_proximo = arvore.css_first('link[rel="next"]') or arvore.css_first('a[rel="next"]')
        if no_proximo is not None and not pag.e_listagem_paginada:
            pag.e_listagem_paginada = True
            pag.fonte = "rel_proximo"

    if informacao_dom:
        total_dom = informacao_dom.get("paginacao_total") or 0
        if total_dom == -1 and not pag.e_listagem_paginada:
            pag.e_listagem_paginada = True
            pag.fonte = pag.fonte or (informacao_dom.get("deteccao") or "dom_indireto")
            registo.info(f"[Detetor] DOM indica paginação indireta (total=-1)")
        elif total_dom > 1:
            pag.e_listagem_paginada = True
            pag.total_paginas = max(int(total_dom), pag.total_paginas or 0)
            pag.fonte = pag.fonte or (informacao_dom.get("deteccao") or "antd_dom")
            registo.info(f"[Detetor] DOM indica total={pag.total_paginas}")
        atual = informacao_dom.get("paginacao_atual")
        if atual:
            try:
                pag.pagina_atual = max(int(atual), pag.pagina_atual)
            except (TypeError, ValueError):
                pass
        param = informacao_dom.get("parametro_pagina")
        if param:
            pag.parametro_pagina = param

        api = informacao_dom.get("api_capturada")
        if api and api.get("url"):
            pag.api_modelo = _templatizar_api(api["url"], pag.parametro_pagina)
            pag.api_metodo = (api.get("method") or "GET").upper()
            pag.api_corpo = api.get("body")
            pag.api_cabecalhos = api.get("headers")
            pag.chave_lista_api = api.get("chave_lista")
            pag.fonte = pag.fonte or "farejador_xhr"
            if not pag.e_listagem_paginada and (pag.total_paginas or 0) > 1:
                pag.e_listagem_paginada = True

    if registo_pedidos and not pag.api_modelo:
        for r in registo_pedidos:
            if r.get("totalPages") and r.get("url"):
                pag.api_modelo = _templatizar_api(r["url"], pag.parametro_pagina)
                pag.api_metodo = (r.get("method") or "GET").upper()
                if r.get("totalPages") and not pag.total_paginas:
                    pag.total_paginas = int(r["totalPages"])
                pag.chave_lista_api = r.get("chave_lista")
                pag.fonte = pag.fonte or "registo_pedidos"
                pag.e_listagem_paginada = True
                break
    if pag.e_listagem_paginada:
        registo.info(f"[Detetor] Paginação detectada: fonte={pag.fonte} total={pag.total_paginas} parametro={pag.parametro_pagina}")

    return pag


def _templatizar_api(api_url: str, parametro: str) -> str:
    p = urlparse(api_url)
    pares = parse_qsl(p.query, keep_blank_values=True)
    novos: list[tuple[str, str]] = []
    encontrado = False
    for k, v in pares:
        if k.lower() == parametro.lower():
            novos.append((k, "{N}"))
            encontrado = True
        else:
            novos.append((k, v))
    if not encontrado:
        novos.append((parametro, "{N}"))
    query = "&".join(f"{k}={v}" for k, v in novos)
    return urlunparse((p.scheme, p.netloc, p.path, p.params, query, p.fragment))


JS_DETETAR_PAGINACAO = r"""async () => {
    const saida = {
        paginacao_total: 0,
        paginacao_atual: 1,
        parametro_pagina: 'page',
        amostra_paginacao: [],
        deteccao: '',
        nextHref: '',
    };
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    const numerosDe = (nos) => {
        const vals = [];
        for (const no of nos) {
            const bruto = (no?.getAttribute?.('title') || no?.textContent || '').trim();
            const n = parseInt(bruto);
            if (!isNaN(n)) vals.push(n);
        }
        return vals;
    };

    const itensAntd = Array.from(document.querySelectorAll('li.ant-pagination-item[title]'));
    if (itensAntd.length) {
        const numeros = itensAntd.map(li => parseInt(li.getAttribute('title'))).filter(n => !isNaN(n));
        if (numeros.length) saida.paginacao_total = Math.max(...numeros);
        const ativo = document.querySelector('li.ant-pagination-item-active[title]');
        if (ativo) {
            const v = parseInt(ativo.getAttribute('title'));
            if (!isNaN(v)) saida.paginacao_atual = v;
        }
        for (const li of itensAntd) {
            const a = li.querySelector('a[href]');
            if (a && a.href) saida.amostra_paginacao.push(a.href);
        }
        saida.deteccao = 'antd_pagination_item';
    }

    if (!saida.paginacao_total) {
        const sel =
            document.querySelector('.pagination--select .ant-select-selector') ||
            document.querySelector('[class*="pagination"] .ant-select-selector') ||
            document.querySelector('[class*="paginacao"] .ant-select-selector');
        if (sel) {
            const item = sel.querySelector('.ant-select-selection-item[title]');
            if (item) {
                const v = parseInt(item.getAttribute('title'));
                if (!isNaN(v)) saida.paginacao_atual = v;
            }
            try {
                sel.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window}));
                sel.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, cancelable: true, view: window}));
                sel.click();
                for (let i = 0; i < 15; i++) {
                    if (document.querySelectorAll('.ant-select-item-option[title]').length > 0) break;
                    await esperar(40);
                }
                const opcoesVistas = new Set();
                const recolher = () => {
                    const dropdownAberto = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
                    const opts = dropdownAberto
                        ? Array.from(dropdownAberto.querySelectorAll('.ant-select-item-option[title], .ant-select-item-option'))
                        : Array.from(document.querySelectorAll('.ant-select-item-option[title], .ant-select-item-option'));
                    for (const n of numerosDe(opts)) opcoesVistas.add(n);
                    return dropdownAberto;
                };
                let dropdown = recolher();
                const contentorScroll = dropdown?.querySelector('.rc-virtual-list-holder, .ant-select-item-option-content')?.closest?.('.rc-virtual-list-holder')
                    || dropdown?.querySelector('.rc-virtual-list-holder');
                if (contentorScroll) {
                    let semNovidades = 0;
                    let ultimoTamanho = opcoesVistas.size;
                    for (let i = 0; i < 30; i++) {
                        const proximo = Math.min(
                            contentorScroll.scrollTop + Math.max(48, Math.floor(contentorScroll.clientHeight * 0.9)),
                            contentorScroll.scrollHeight
                        );
                        contentorScroll.scrollTop = proximo;
                        contentorScroll.dispatchEvent(new Event('scroll', { bubbles: true }));
                        await esperar(60);
                        dropdown = recolher();
                        if (opcoesVistas.size === ultimoTamanho) semNovidades += 1;
                        else semNovidades = 0;
                        ultimoTamanho = opcoesVistas.size;
                        if (semNovidades >= 3) break;
                        if (contentorScroll.scrollTop + contentorScroll.clientHeight >= contentorScroll.scrollHeight - 2) break;
                    }
                }
                const numeros = Array.from(opcoesVistas.values());
                if (numeros.length) {
                    saida.paginacao_total = Math.max(...numeros);
                    saida.deteccao = 'antd_select_options';
                }
                document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                await esperar(40);
            } catch (e) {}
        }
    }

    if (!saida.paginacao_total || saida.paginacao_total < 2) {
        try {
            const containers = Array.from(document.querySelectorAll('[class*="pagination"], [class*="paginacao"], nav, footer'));
            for (const c of containers) {
                const txt = (c.innerText || '').trim();
                const m = txt.match(/(?:page|página)?\s*(\d+)\s*(?:de|of|from|\/)\s*(\d+)/i);
                if (m && m[2]) {
                    const v = parseInt(m[2]);
                    if (v > 1 && v < 5000) {
                        saida.paginacao_total = v;
                        saida.deteccao = 'label_de_n';
                        break;
                    }
                }
            }
        } catch (e) {}
    }

    let nextHref = '';
    const nextSels = [
        'a[rel="next"]', '[aria-label*="Next" i]', '[aria-label*="Próxim" i]',
        '[aria-label*="Seguinte" i]', '.pagination .next a', '.pagination a.next',
        '.pager-next a', 'a.nextpostslink', '.nav-next a',
        '[data-testid*="pagination-next" i]', 'a[title*="Página seguinte" i]',
        'a[title*="Seguinte" i]', 'a[class*="next" i]:not([class*="newest" i])',
        '.pagination--select__next', '.ant-pagination-next a', '.ant-pagination-next'
    ];
    
    for (const sel of nextSels) {
        const el = document.querySelector(sel);
        const href = el?.href || el?.getAttribute('href');
        if (href && !href.startsWith('javascript:')) { nextHref = href; break; }
    }

    if (!nextHref) {
        const clickables = document.querySelectorAll('a, button, [role="button"]');
        let btnPaginacao = null;
        for (const el of clickables) {
            const txt = (el.innerText || el.textContent || "").toLowerCase().trim();
            const isNext = txt.includes('página seguinte') || txt.includes('próxima') || 
                           (txt.includes('seguinte') && !txt.includes('anterior')) ||
                           el.classList.contains('pagination--select__next') ||
                           el.classList.contains('ant-pagination-next');
            
            if (isNext) {
                if (el.href && !el.href.startsWith('javascript:')) { nextHref = el.href; break; }
                btnPaginacao = el;
            }
        }

        if (!nextHref && btnPaginacao) {
            const oldUrl = window.location.href;
            try {
                btnPaginacao.click();
                for (let i = 0; i < 20; i++) {
                    await esperar(100);
                    if (window.location.href !== oldUrl) {
                        nextHref = window.location.href;
                        break;
                    }
                }
            } catch(e) {}
        }
    }
    
    if (nextHref) {
        saida.nextHref = nextHref;
        saida.amostra_paginacao.push(nextHref);
        if (!saida.paginacao_total) saida.paginacao_total = -1;
    }

    const candidatos = [
        '[role="navigation"][aria-label*="pagina" i] a',
        '[class*="pagination"] a',
        '[class*="paginacao"] a',
        'nav.pagination a',
        'ul.pagination a',
    ];
    let maxN = 0;
    for (const s of candidatos) {
        document.querySelectorAll(s).forEach(el => {
            const txt = (el.textContent || '').trim();
            const n = parseInt(txt);
            if (!isNaN(n) && n > maxN) maxN = n;
            if (el.href) {
                try {
                    const u = new URL(el.href, window.location.href);
                    for (const k of ['page', 'pagina', 'pg', 'p', 'offset', 'inicio']) {
                        const v = u.searchParams.get(k);
                        if (v && /^\d+$/.test(v)) {
                            saida.parametro_pagina = k;
                            saida.amostra_paginacao.push(el.href);
                            const val = parseInt(v);
                            if (val > maxN) maxN = val;
                        }
                    }
                } catch (e) {}
            }
        });
    }
    
    if (maxN > (saida.paginacao_total || 0)) {
        saida.paginacao_total = maxN;
        saida.deteccao = saida.deteccao || 'numeric_links';
    }

    for (const href of saida.amostra_paginacao) {
        try {
            const u = new URL(href, window.location.href);
            for (const k of ['page', 'pagina', 'pg', 'p', 'offset', 'inicio']) {
                if (u.searchParams.get(k)) { saida.parametro_pagina = k; break; }
            }
        } catch (e) {}
    }

    return saida;
}
"""


def construir_urls_fanout(
    pag: Paginacao,
    url_base: str,
    pagina_inicial_excluir: int | None = None,
    max_paginas: int = 100,
) -> list[str]:
    if not pag.total_paginas or pag.total_paginas < 2:
        return []

    if max_paginas <= 0:
        total = int(pag.total_paginas)
    else:
        total = min(int(pag.total_paginas), max_paginas)
    if pag.api_modelo and "{N}" in pag.api_modelo:
        urls = [pag.api_modelo.replace("{N}", str(k)) for k in range(1, total + 1)]
    else:
        urls = [construir_url_paginada(url_base, k, pag.parametro_pagina) for k in range(1, total + 1)]

    if pagina_inicial_excluir is not None:
        try:
            indice_excluir = pagina_inicial_excluir - 1
            if 0 <= indice_excluir < len(urls):
                urls.pop(indice_excluir)
        except Exception:
            pass

    return urls


def _hash_lista(itens: Any) -> str:
    try:
        bruto = json.dumps(itens, sort_keys=True, default=str, ensure_ascii=False)
    except Exception:
        bruto = repr(itens)
    return hashlib.sha1(bruto.encode("utf-8", "replace")).hexdigest()[:16]


async def probar_paginas(
    url_base: str,
    parametro: str,
    *,
    obter_e_extrair: Callable[[str], Awaitable[tuple[list, dict | None]]],
    max_paginas: int = 50,
    inicio: int = 1,
) -> list[str]:
    visto: dict[str, int] = {}
    urls_validas: list[str] = []
    para_tentar = max_paginas

    k = max(1, inicio)
    while para_tentar > 0:
        para_tentar -= 1
        url = construir_url_paginada(url_base, k, parametro)
        try:
            itens, _ = await obter_e_extrair(url)
        except Exception:
            break
        if not itens:
            break
        h = _hash_lista(itens)
        if h in visto:
            break
        visto[h] = k
        urls_validas.append(url)
        k += 1

    return urls_validas


__all__ = [
    "detetar_paginacao", "construir_urls_fanout", "probar_paginas",
    "JS_DETETAR_PAGINACAO",
]
