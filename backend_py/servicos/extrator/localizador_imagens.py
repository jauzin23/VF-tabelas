from __future__ import annotations

import re
import json as _json
from typing import Any
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

from .utilitarios_url import normalizar_imagem_url


_RE_BG_URL = re.compile(r"""url\(\s*['"]?([^'")]+)['"]?\s*\)""", re.I)
_RE_SRCSET_PARTE = re.compile(r"\s+")


def _melhor_de_srcset(srcset: str) -> str | None:
    if not srcset:
        return None
    melhor_url = None
    melhor_desc = -1.0
    for parte in srcset.split(","):
        parte = parte.strip()
        if not parte:
            continue
        bits = _RE_SRCSET_PARTE.split(parte, maxsplit=1)
        url = bits[0].strip()
        if not url:
            continue
        desc = 1.0
        if len(bits) > 1:
            d = bits[1].strip().lower()
            try:
                desc = float(d.rstrip("wx"))
            except ValueError:
                desc = 1.0
        if desc > melhor_desc:
            melhor_desc = desc
            melhor_url = url
    return melhor_url


def extrair_estatico(html: str, url_pagina: str) -> list[dict[str, Any]]:
    if not html:
        return []
    arvore = HTMLParser(html)
    encontradas: list[dict[str, Any]] = []
    vistas: set[str] = set()

    def _adicionar(src: str, alt: str = "", largura: int = 0, altura: int = 0) -> None:
        url_resolvida = normalizar_imagem_url(url_pagina, src)
        if not url_resolvida or url_resolvida in vistas:
            return
        vistas.add(url_resolvida)
        encontradas.append({
            "url_origem": url_resolvida,
            "alt": alt or "",
            "largura": largura,
            "altura": altura,
        })

    for meta in arvore.css('meta'):
        prop = (meta.attributes.get("property") or meta.attributes.get("name") or "").lower()
        conteudo = (meta.attributes.get("content") or "").strip()
        if not conteudo:
            continue
        if prop in ("og:image", "og:image:secure_url",
                    "twitter:image", "twitter:image:src"):
            _adicionar(conteudo, alt="og:image")

    for img in arvore.css("img"):
        attrs = img.attributes
        alt = (attrs.get("alt") or "").strip()
        l = int(attrs.get("width") or 0)
        a = int(attrs.get("height") or 0)
        
        srcset = attrs.get("srcset") or attrs.get("data-srcset") or ""
        escolhido = _melhor_de_srcset(srcset) if srcset else None
        if escolhido:
            _adicionar(escolhido, alt=alt, largura=l, altura=a)
            continue
        src = (attrs.get("src") or attrs.get("data-src")
               or attrs.get("data-lazy-src") or "")
        if src:
            _adicionar(src, alt=alt, largura=l, altura=a)

    for source in arvore.css("picture source"):
        srcset = source.attributes.get("srcset") or ""
        escolhido = _melhor_de_srcset(srcset)
        if escolhido:
            _adicionar(escolhido)

    for el in arvore.css('[style*="background-image"]'):
        estilo = el.attributes.get("style") or ""
        m = _RE_BG_URL.search(estilo)
        if m:
            _adicionar(m.group(1))

    for script in arvore.css('script[type="application/ld+json"]'):
        try:
            dados = _json.loads(script.text(strip=False) or "")
        except _json.JSONDecodeError:
            continue
        candidatos = dados if isinstance(dados, list) else [dados]
        for d in candidatos:
            if not isinstance(d, dict):
                continue
            for chave in ("image", "logo", "thumbnailUrl"):
                v = d.get(chave)
                if isinstance(v, str):
                    _adicionar(v)
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, str):
                            _adicionar(item)

    return encontradas


def extrair_links(html: str, url_pagina: str, ignorar_nav_footer: bool = False) -> list[str]:
    if not html:
        return []
    arvore = HTMLParser(html)
    saida: list[str] = []
    vistos: set[str] = set()
    for a in arvore.css("a[href]"):
        href = (a.attributes.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
            
        if ignorar_nav_footer:
            c_name = str(a.attributes.get("class") or "").lower()
            if "sitemap" in c_name or "/mapadosite" in href.lower():
                continue

            ignorar = False
            no = a
            while no and no.tag and no.tag != "-document":
                tag = no.tag.lower()
                attrs = no.attributes or {}
                cls = str(attrs.get("class") or "").lower()
                ids = str(attrs.get("id") or "").lower()
                if (tag in ("navbar", "footer", "nav", "header") or
                    "navbar" in cls or "footer" in cls or "nav" in cls or "header" in cls or
                    "navbar" in ids or "footer" in ids or "nav" in ids or "header" in ids):
                    ignorar = True
                    break
                no = no.parent
                
            if ignorar:
                continue

        completo = urljoin(url_pagina, href)
        if completo not in vistos:
            vistos.add(completo)
            saida.append(completo)
    return saida


def extrair_rel_next(html: str, url_pagina: str) -> str | None:
    if not html:
        return None
    arvore = HTMLParser(html)
    no = arvore.css_first('link[rel="next"]') or arvore.css_first('a[rel="next"]')
    if no is None:
        return None
    href = (no.attributes.get("href") or "").strip()
    if not href:
        return None
    return urljoin(url_pagina, href)


JS_EXTRAIR = r"""
async (ignorarNavFooter = false) => {
    const imagens = [];
    const vistas = new Set();

    const registar = (origem, alt, largura = 0, altura = 0) => {
        if (!origem || vistas.has(origem)) return;
        if (origem.startsWith('data:')) return;
        vistas.add(origem);
        imagens.push({
            url_origem: origem, 
            alt: alt || '',
            largura: largura || 0,
            altura: altura || 0,
        });
    };

    document.querySelectorAll('img').forEach(el => {
        const alt = el.getAttribute('alt') || '';
        const l = el.naturalWidth || el.width || 0;
        const a = el.naturalHeight || el.height || 0;
        
        const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset') || '';
        if (srcset) {
            const partes = srcset.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]);
            partes.sort((a, b) => parseFloat(b[1] || '1') - parseFloat(a[1] || '1'));
            const melhor = partes[0];
            if (melhor && melhor[0]) { registar(melhor[0], alt, l, a); return; }
        }
        const src = el.currentSrc || el.getAttribute('src')
                 || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
        if (src) registar(src, alt, l, a);
    });

    document.querySelectorAll('picture source').forEach(el => {
        const ss = el.getAttribute('srcset') || '';
        if (!ss) return;
        const partes = ss.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]);
        partes.sort((a, b) => parseFloat(b[1] || '1') - parseFloat(a[1] || '1'));
        const melhor = partes[0];
        if (melhor && melhor[0]) {
            registar(melhor[0], '');
        }
    });

    document.querySelectorAll('[data-src]:not(img)').forEach(el => {
        const src = el.getAttribute('data-src');
        if (src) registar(src, '', el.offsetWidth || 0, el.offsetHeight || 0);
    });

    document.querySelectorAll('[style*="background-image"]').forEach(el => {
        if (!el.style || !el.style.backgroundImage) return;
        const m = /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage);
        if (m && m[2]) {
            registar(m[2], '', el.offsetWidth || 0, el.offsetHeight || 0);
        }
    });

    document.querySelectorAll('section, header, div').forEach(el => {
        const st = window.getComputedStyle(el);
        const bg = st && st.backgroundImage;
        if (!bg || bg === 'none') return;
        const m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
        if (m && m[1]) registar(m[1], '', el.offsetWidth || 0, el.offsetHeight || 0);
    });

    const links = new Set();
    const isIgnoredLink = el => {
        if (!ignorarNavFooter) return false;
        
        const h = (el.getAttribute('href') || '').toLowerCase();
        const c = (el.className || '').toString().toLowerCase();
        if (h.includes('/mapadosite') || c.includes('sitemap')) return true;

        let current = el;
        for (let i = 0; i < 15; i++) {
            if (!current || current === document.body) break;
            const tag = (current.tagName || '').toLowerCase();
            const cls = (current.className || '').toString().toLowerCase();
            const id = ((current.id || '') + '').toLowerCase();
            
            if (tag === 'header' || tag === 'footer' || tag === 'nav' || tag === 'navbar' ||
                cls.includes('header') || cls.includes('footer') || cls.includes('nav') || cls.includes('navbar') ||
                id.includes('header') || id.includes('footer') || id.includes('nav') || id.includes('navbar')) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    };

    document.querySelectorAll('a[href]').forEach(a => {
        if (isIgnoredLink(a)) return;
        const h = a.getAttribute('href');
        if (h && !h.startsWith('#') && !h.startsWith('javascript:') && !h.startsWith('mailto:') && !h.startsWith('tel:')) {
            try { links.add(new URL(h, window.location.href).href); } catch(e){}
        }
    });
    document.querySelectorAll('[onclick], [data-href], article, [class*="card"], [class*="item"]').forEach(el => {
        if (isIgnoredLink(el)) return;
        const h = el.getAttribute('data-href') || (el.getAttribute('onclick') || '').match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/)?.[1];
        if (h) try { links.add(new URL(h, window.location.href).href); } catch(e){}
    });

    if (window.__NEXT_DATA__) {
        const routesFound = new Set();
        const recursiveFind = (obj, depth = 0) => {
            if (!obj || typeof obj !== 'object' || depth > 10) return;
            for (let k in obj) {
                try {
                    const v = obj[k];
                    if (typeof v === 'string' && v.length > 1) {
                        if (v.startsWith('/') && !v.startsWith('//')) {
                             if (!v.includes('.') || v.includes('.html')) {
                                  routesFound.add(v);
                             }
                        }
                    } else if (typeof v === 'object') {
                        recursiveFind(v, depth + 1);
                    }
                } catch(e){}
            }
        };
        recursiveFind(window.__NEXT_DATA__);
        routesFound.forEach(v => {
            try { links.add(new URL(v, window.location.href).href); } catch(e){}
        });
    }

    const detetarPag = async () => {
        const saida = { paginacao_total: 0, paginacao_atual: 1, nextHref: '', deteccao: '' };
        const itensAntd = Array.from(document.querySelectorAll('li.ant-pagination-item[title]'));
        if (itensAntd.length) {
            const numeros = itensAntd.map(li => parseInt(li.getAttribute('title'))).filter(n => !isNaN(n));
            if (numeros.length) saida.paginacao_total = Math.max(...numeros);
            const ativo = document.querySelector('li.ant-pagination-item-active[title]');
            if (ativo) {
                const v = parseInt(ativo.getAttribute('title'));
                if (!isNaN(v)) saida.paginacao_atual = v;
            }
            saida.deteccao = 'antd';
        }
        if (!saida.paginacao_total) {
            const lbl = document.querySelector('[class*="pagination"] [class*="label"], [class*="paginacao"] [class*="label"]');
            if (lbl) {
                const texto = (lbl.innerText || '').trim();
                const m = texto.match(/(?:page|página)\s*(\d+)\s*(?:de|of|\/)\s*(\d+)/i);
                if (m) {
                    saida.paginacao_atual = parseInt(m[1]);
                    saida.paginacao_total = parseInt(m[2]);
                    saida.deteccao = 'label_de_n';
                }
            }
        }
        const nextSels = ['a[rel="next"]', '[aria-label*="Next" i]', '[aria-label*="Próxim" i]', '.ant-pagination-next a', '.ant-pagination-next'];
        for (const sel of nextSels) {
            const el = document.querySelector(sel);
            const href = el?.href || el?.getAttribute?.('href');
            if (href && !href.startsWith('javascript:')) { saida.nextHref = new URL(href, window.location.href).href; break; }
        }
        return saida;
    };
    const paginacao = await detetarPag();

    return {
        titulo: document.title,
        url_final: window.location.href,
        canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
        e_next: !!(window.__NEXT_DATA__ || document.querySelector("script[src*='_next']")),
        imagens,
        links: Array.from(links),
        dom_paginacao: paginacao,
    };
}
"""


__all__ = [
    "extrair_estatico", "extrair_links", "extrair_rel_next",
    "JS_EXTRAIR",
]
