import torch
from transformers import AutoImageProcessor, AutoModelForObjectDetection, logging
import logging as python_logging
from PIL import Image
import io
import os
import time
import asyncio
from urllib.parse import urlparse

try:
    import niquests as _http
except ImportError:
    import requests as _http

from utilitarios.registo import registo
from utilitarios.ambiente import garantir_ambiente_carregado

garantir_ambiente_carregado()

CONFIANCA_MIN_TABELA     = float(os.getenv("TABLE_MIN_CONFIDENCE", 0.75))
CONFIANCA_MIN_ESTRUTURA  = float(os.getenv("STRUCTURE_MIN_CONFIDENCE", 0.4))
ESTRUTURA_MIN_LINHAS     = int(os.getenv("STRUCTURE_MIN_ROWS", 2))
ESTRUTURA_MIN_COLUNAS    = int(os.getenv("STRUCTURE_MIN_COLS", 2))

CONFIANCA_MIN_ESTRUTURA_REPETICAO       = float(os.getenv("STRUCTURE_MIN_CONFIDENCE_RETRY", 0.50))
CONFIANCA_MIN_ESTRUTURA_CONFIRMACAO = float(os.getenv("STRUCTURE_MIN_CONFIDENCE_CONFIRM", 0.70))

IMAGEM_MIN_LARGURA      = int(os.getenv("MIN_IMAGE_WIDTH", 120))
IMAGEM_MIN_ALTURA       = int(os.getenv("MIN_IMAGE_HEIGHT", 80))
TABELA_MIN_AREA_PERC    = float(os.getenv("TABLE_MIN_AREA_PERCENT", 0.05))
TABELA_MIN_LARGURA_PX   = int(os.getenv("TABLE_MIN_WIDTH_PX", 120))
TABELA_MIN_ALTURA_PX    = int(os.getenv("TABLE_MIN_HEIGHT_PX", 50))
TABELA_MAX_PROPORCAO    = float(os.getenv("TABLE_MAX_ASPECT_RATIO", 15.0))

S1_LIMIAR_ALTA_CONFIANCA = float(os.getenv("S1_HIGH_CONFIDENCE_BYPASS", 0.95))

_MARGEM_PONTUACAO_PROXIMA = 0.10

NOME_DETETOR = "microsoft/table-transformer-detection"
NOME_ESTRUTURA = "microsoft/table-transformer-structure-recognition"

registo.info(f"A carregar modelo...")

logging.set_verbosity_error()
python_logging.getLogger("transformers.modeling_utils").setLevel(python_logging.ERROR)

processador_detecao  = AutoImageProcessor.from_pretrained(NOME_DETETOR, use_fast=True)
modelo_detecao      = AutoModelForObjectDetection.from_pretrained(NOME_DETETOR)
processador_estrutura = AutoImageProcessor.from_pretrained(NOME_ESTRUTURA, use_fast=True)
modelo_estrutura    = AutoModelForObjectDetection.from_pretrained(NOME_ESTRUTURA)

dispositivo = torch.device("cuda" if torch.cuda.is_available() else "cpu")
modelo_detecao.to(dispositivo).eval()
modelo_estrutura.to(dispositivo).eval()

UA_HTTP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _obter_url_e_referencia(entrada):
    if isinstance(entrada, dict):
        u = entrada.get("url") or entrada.get("url_origem")
        r = entrada.get("referer") or entrada.get("url_pagina")
        return u, r
    if isinstance(entrada, (list, tuple)) and len(entrada) >= 1:
        return entrada[0], entrada[1] if len(entrada) > 1 else None
    return entrada, None


def _pedir_imagem_http(url: str, referencia: str | None, tempo_limite: float = 15.0):
    cabecalhos = {
        "User-Agent": UA_HTTP,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    if referencia:
        cabecalhos["Referer"] = referencia
        try:
            pr = urlparse(referencia)
            if pr.scheme and pr.netloc:
                cabecalhos["Origin"] = f"{pr.scheme}://{pr.netloc}"
        except Exception:
            pass

    ultima = None
    tentativas = int(os.getenv("IMAGE_HTTP_RETRIES", "2")) + 1
    for t in range(tentativas):
        ultima = _http.get(url, headers=cabecalhos, timeout=tempo_limite, verify=True)
        if ultima.status_code in (429, 500, 502, 503, 504) and t + 1 < tentativas:
            time.sleep(0.4 * (t + 1))
            continue
        return ultima
    return ultima


def _detetar_objetos(processador, modelo, imagem: Image.Image, limiar: float) -> tuple[list[dict], list[dict], float]:
    entradas = processador(images=imagem, return_tensors="pt")
    entradas = {k: v.to(dispositivo) for k, v in entradas.items()}

    with torch.no_grad():
        saidas = modelo(**entradas)

    tamanhos_alvo = torch.tensor([imagem.size[::-1]])
    resultados_brutos = processador.post_process_object_detection(
        saidas, threshold=0.0, target_sizes=tamanhos_alvo
    )[0]

    deteccoes = []
    quase_deteccoes = []
    pontuacao_maxima = 0.0

    for pontuacao_t, etiqueta_t, caixa_t in zip(
        resultados_brutos["scores"],
        resultados_brutos["labels"],
        resultados_brutos["boxes"],
    ):
        pontuacao = pontuacao_t.item()
        etiqueta = modelo.config.id2label[etiqueta_t.item()]
        caixa  = [round(c, 1) for c in caixa_t.tolist()]
        entrada = {"etiqueta": etiqueta, "pontuacao": pontuacao, "caixa": caixa}

        if etiqueta != "no object":
            pontuacao_maxima = max(pontuacao_maxima, pontuacao)

        if pontuacao >= limiar:
            deteccoes.append(entrada)
        elif pontuacao >= (limiar - _MARGEM_PONTUACAO_PROXIMA) and etiqueta != "no object":
            quase_deteccoes.append(entrada)

    return deteccoes, quase_deteccoes, pontuacao_maxima


def _validar_estrutura(imagem_recorte: Image.Image) -> dict:
    deteccoes, _, _ = _detetar_objetos(
        processador_estrutura, modelo_estrutura, imagem_recorte, CONFIANCA_MIN_ESTRUTURA
    )

    linhas  = [d for d in deteccoes if d["etiqueta"] == "table row"]
    colunas = [d for d in deteccoes if d["etiqueta"] == "table column"]
    cabecalhos = [d for d in deteccoes if "header" in d["etiqueta"]]

    n_linhas, n_colunas = len(linhas), len(colunas)

    pontuacoes_l = [l["pontuacao"] for l in linhas]
    pontuacoes_c = [c["pontuacao"] for c in colunas]

    media_l = sum(pontuacoes_l) / len(pontuacoes_l) if pontuacoes_l else 0
    media_c = sum(pontuacoes_c) / len(pontuacoes_c) if pontuacoes_c else 0

    largura_recorte, altura_recorte = imagem_recorte.size
    altura_media_linha = altura_recorte / n_linhas if n_linhas > 0 else 0

    if n_linhas < ESTRUTURA_MIN_LINHAS or n_colunas < ESTRUTURA_MIN_COLUNAS:
        return {
            "valido": False,
            "motivo": f"insuficiente ({n_linhas}L/{n_colunas}C)",
            "n_linhas": n_linhas,
            "n_colunas": n_colunas,
            "media_pontuacao_l": media_l,
            "media_pontuacao_c": media_c
        }

    if altura_media_linha < 15:
        return {
            "valido": False,
            "motivo": f"linhas_muito_finas ({altura_media_linha:.1f}px)",
            "n_linhas": n_linhas,
            "n_colunas": n_colunas,
            "media_pontuacao_l": media_l,
            "media_pontuacao_c": media_c
        }

    alinhado = any(ly1 < cy2 and ly2 > cy1
                   for l in linhas for c in colunas
                   for lx1, ly1, lx2, ly2 in [l["caixa"]]
                   for cx1, cy1, cx2, cy2 in [c["caixa"]])

    if not alinhado:
        return {
            "valido": False,
            "motivo": "sem_alinhamento_grelha",
            "n_linhas": n_linhas,
            "n_colunas": n_colunas,
            "media_pontuacao_l": media_l,
            "media_pontuacao_c": media_c
        }

    assimetria = 1.0
    if n_colunas >= 2:
        larguras = [abs(c["caixa"][2] - c["caixa"][0]) for c in colunas]
        if max(larguras) > 0:
            assimetria = min(larguras) / max(larguras)

    return {
        "valido": True,
        "n_linhas": n_linhas,
        "n_colunas": n_colunas,
        "n_cabecalhos": len(cabecalhos),
        "pontuacao_min_linhas": min(pontuacoes_l, default=0.0),
        "pontuacao_min_colunas": min(pontuacoes_c, default=0.0),
        "media_pontuacao_linhas": media_l,
        "media_pontuacao_colunas": media_c,
        "altura_media_linha": altura_media_linha,
        "assimetria_colunas": assimetria
    }


def _caixa_valida_geometricamente(caixa: list, area_imagem: int, pontuacao_s1: float = 0.0) -> tuple[bool, str]:
    x1, y1, x2, y2 = caixa
    largura, altura = abs(x2 - x1), abs(y2 - y1)
    area_rel = (largura * altura) / area_imagem
    proporcao = largura / (altura + 1e-6)

    if area_rel < TABELA_MIN_AREA_PERC:
        return False, f"area relativa pequena ({area_rel:.2%})"

    l_min = TABELA_MIN_LARGURA_PX if pontuacao_s1 < S1_LIMIAR_ALTA_CONFIANCA else 80
    a_min = TABELA_MIN_ALTURA_PX  if pontuacao_s1 < S1_LIMIAR_ALTA_CONFIANCA else 40

    if largura < l_min or altura < a_min:
        return False, f"dimensoes insuficientes ({largura:.0f}x{altura:.0f}px)"

    if proporcao > TABELA_MAX_PROPORCAO or proporcao < (1 / TABELA_MAX_PROPORCAO):
        return False, f"proporcao extrema ({proporcao:.2f})"

    return True, ""


def detetar_tabelas_em_imagem_pil(imagem: Image.Image) -> tuple:
    try:
        area_imagem = imagem.width * imagem.height
        candidatos_s1, _, pontuacao_max_s1 = _detetar_objetos(
            processador_detecao, modelo_detecao, imagem, CONFIANCA_MIN_TABELA
        )

        tabelas_candidatas = [d for d in candidatos_s1 if d["etiqueta"] in ("table", "table rotated")]

        registo.info(f"  S1: {len(tabelas_candidatas)} candidato(s) | {imagem.width}x{imagem.height}px")

        if not tabelas_candidatas:
            if pontuacao_max_s1 < CONFIANCA_MIN_TABELA and area_imagem < (800 * 600):
                registo.info("  [FALLBACK] S1 falhou — a tentar S2 na imagem completa")
                estrutura_total = _validar_estrutura(imagem)
                if estrutura_total["valido"]:
                    qualidade = min(estrutura_total["pontuacao_min_linhas"], estrutura_total["pontuacao_min_colunas"])
                    qualidade_media = (
                        estrutura_total.get("media_pontuacao_linhas", 0.0)
                        + estrutura_total.get("media_pontuacao_colunas", 0.0)
                    ) / 2
                    n_linhas = estrutura_total.get("n_linhas", 0)
                    n_colunas = estrutura_total.get("n_colunas", 0)
                    tem_cabecalhos = estrutura_total.get("n_cabecalhos", 0) > 0
                    if n_colunas < 3:
                        registo.info(
                            f"  [FALL-REJECT] estrutura fallback fraca ({n_linhas}Lx{n_colunas}C)"
                        )
                        return {"tem_tabela": False, "confianca": pontuacao_max_s1}, imagem
                    limiar_fallback = 0.80 if tem_cabecalhos else 0.85
                    
                    if n_linhas >= 10:
                        limiar_fallback = max(limiar_fallback, 0.85)

                    if not tem_cabecalhos and (n_linhas < 4 or n_colunas < 3):
                        registo.info(
                            f"  [FALL-REJECT] sem cabecalhos com estrutura fraca ({n_linhas}Lx{n_colunas}C)"
                        )
                        return {"tem_tabela": False, "confianca": pontuacao_max_s1}, imagem
                    if qualidade >= limiar_fallback:
                        if not tem_cabecalhos and qualidade_media < 0.86:
                            registo.info(
                                f"  [FALL-REJECT] media estrutural baixa ({qualidade_media:.3f} < 0.86)"
                            )
                            return {"tem_tabela": False, "confianca": pontuacao_max_s1}, imagem
                        registo.info(f"  [OK-FALLBACK] {n_linhas}Lx{n_colunas}C (q={qualidade:.3f}, cab={estrutura_total.get('n_cabecalhos', 0)})")
                        return {"tem_tabela": True, "confianca": pontuacao_max_s1, "fallback": True}, imagem
                    else:
                        registo.info(f"  [FALL-REJECT] qualidade insuficiente ({qualidade:.3f} < {limiar_fallback})")

            return {"tem_tabela": False, "confianca": 0.0}, imagem

        tabelas_confirmadas = []
        for idx, cand in enumerate(tabelas_candidatas):
            caixa, pontuacao = cand["caixa"], cand["pontuacao"]
            x1, y1, x2, y2 = caixa

            valida, motivo = _caixa_valida_geometricamente(caixa, area_imagem, pontuacao_s1=pontuacao)
            if not valida:
                registo.info(f"  [GEO-REJECT] #{idx+1} s1={pontuacao:.3f} — {motivo}")
                continue

            enchimento = 5
            recorte = imagem.crop((
                max(0, x1 - enchimento), max(0, y1 - enchimento),
                min(imagem.width, x2 + enchimento), min(imagem.height, y2 + enchimento)
            ))
            estrutura = _validar_estrutura(recorte)

            if not estrutura["valido"] and estrutura.get("n_colunas", 0) >= ESTRUTURA_MIN_COLUNAS:
                recorte_exp = imagem.crop((
                    max(0, x1 - enchimento), 0,
                    min(imagem.width, x2 + enchimento), imagem.height
                ))
                estrutura_repeticao = _validar_estrutura(recorte_exp)
                if estrutura_repeticao["valido"] and min(
                    estrutura_repeticao["pontuacao_min_linhas"], estrutura_repeticao["pontuacao_min_colunas"]
                ) >= CONFIANCA_MIN_ESTRUTURA_REPETICAO:
                    registo.info(f"  [RETRY-OK] #{idx+1} recuperada com recorte expandido")
                    estrutura = estrutura_repeticao

            if estrutura["valido"]:
                qualidade = min(estrutura["pontuacao_min_linhas"], estrutura["pontuacao_min_colunas"])
                qualidade_media = (estrutura["media_pontuacao_linhas"] + estrutura["media_pontuacao_colunas"]) / 2
                n_linhas = estrutura.get("n_linhas", 0)
                n_colunas = estrutura.get("n_colunas", 0)
                n_cabecalhos = estrutura.get("n_cabecalhos", 0)
                tem_cabecalhos = n_cabecalhos > 0

                if pontuacao >= S1_LIMIAR_ALTA_CONFIANCA:
                    limiar_confirmacao = CONFIANCA_MIN_ESTRUTURA
                    if qualidade < CONFIANCA_MIN_ESTRUTURA_CONFIRMACAO:
                        media_min = 0.78 if tem_cabecalhos else 0.88
                        # Se a confianca for absoluta (ex: 1.0), somos mais tolerantes com o min
                        if pontuacao >= 0.99:
                            piso_qualidade = 0.40 if qualidade_media >= 0.85 else 0.50
                        else:
                            piso_qualidade = 0.55 if qualidade_media >= 0.88 else 0.65
                            # Caso especial: 4 colunas com apenas 1 header precisa de mais qualidade se for "esparsa"
                            if n_colunas == 4 and n_cabecalhos <= 1:
                                altura_linha = estrutura.get("altura_media_linha", 0)
                                if altura_linha > 95:
                                    piso_qualidade = max(piso_qualidade, 0.70)
                        
                        if qualidade_media < media_min or qualidade < piso_qualidade:
                            registo.info(f"  [QUAL-REJECT] #{idx+1} s1={pontuacao:.3f} min={qualidade:.3f} avg={qualidade_media:.3f} h_lin={estrutura.get('altura_media_linha', 0):.1f}")
                            continue
                elif pontuacao >= 0.85:
                    # Baixado para 0.40 para evitar FN
                    limiar_confirmacao = 0.40
                else:
                    limiar_confirmacao = 0.60

                if n_colunas == 2:
                    if n_cabecalhos >= n_linhas and n_linhas <= 6:
                        registo.info(f"  [HEADER-REJECT] #{idx+1} {n_linhas}Lx{n_colunas}C todos cabecalhos")
                        continue

                    assimetria = estrutura.get("assimetria_colunas", 1.0)
                    if assimetria < 0.35:
                        registo.info(f"  [LIST-REJECT] #{idx+1} s1={pontuacao:.3f} assimetria={assimetria:.3f}")
                        continue

                    # Rejeitar listas equilibradas sem cabecalhos (0.97 limiar)
                    if not tem_cabecalhos and assimetria > 0.85 and n_linhas < 10 and pontuacao < 0.97:
                        registo.info(f"  [BALANCED-LIST-REJECT] #{idx+1} s1={pontuacao:.3f} assimetria={assimetria:.3f}")
                        continue

                # Restrição para tabelas de 2 colunas (comum em layouts de cards)
                # Aplicamos mesmo com cabecalhos se a confiança S1 for baixa
                if n_colunas <= 2:
                    if n_linhas >= 8 and not tem_cabecalhos:
                        registo.info(f"  [DENSITY-REJECT] #{idx+1} {n_linhas}Lx{n_colunas}C sem cabecalhos")
                        continue
                    if n_linhas >= 4 and pontuacao < 0.98:
                        # Se tiver muitos cabecalhos em relação às linhas, é quase certo que é layout
                        if n_cabecalhos >= (n_linhas - 1):
                            registo.info(f"  [DENSITY-REJECT] #{idx+1} {n_linhas}Lx{n_colunas}C densidade/cabecalhos suspeitos")
                            continue
                        if not tem_cabecalhos:
                            registo.info(f"  [DENSITY-REJECT] #{idx+1} {n_linhas}Lx{n_colunas}C sem cabecalhos (abaixo de 0.98)")
                            continue

                # Rejeitar estruturas rasas (2 linhas) com poucos headers em 3+ colunas
                if n_linhas <= 2 and n_colunas >= 3:
                    if n_cabecalhos <= 1:
                        registo.info(f"  [SHALLOW-REJECT] #{idx+1} {n_linhas}Lx{n_colunas}C cab={n_cabecalhos} — estrutura rasa")
                        continue

                # Caso especial: tabelas sem cabecalhos ou com cabecalhos muito fracos
                # Tabelas com 3+ colunas precisam de pelo menos 2 headers para ser "forte"
                # Escalar requisitos de cabecalho conforme o numero de colunas
                if n_colunas <= 2:
                    limiar_n_cab = 1
                elif n_colunas <= 4:
                    limiar_n_cab = 2
                elif n_colunas <= 6:
                    limiar_n_cab = 3
                else:
                    limiar_n_cab = 4
                tem_cabecalhos_fortes = n_cabecalhos >= limiar_n_cab

                # Caso especial: confianca extrema (ex: tabelas com headers coloridos que a IA nao reconhece)
                confianca_extrema = (pontuacao >= 0.99 and qualidade_media >= 0.85)
                
                # Forçar verificação de qualidade em 2 colunas ou se os cabecalhos nao forem robustos
                precisa_verificar_qualidade = not tem_cabecalhos_fortes or n_colunas <= 2
                
                if precisa_verificar_qualidade and not confianca_extrema:
                    # Limiar base de qualidade estrutural
                    if n_colunas <= 2:
                        limiar_fraco = 0.85
                    elif n_colunas == 3:
                        limiar_fraco = 0.80
                    elif n_colunas == 4:
                        limiar_fraco = 0.56 # Reduzido de 0.60 para evitar FN
                    else:
                        limiar_fraco = 0.52 # Reduzido de 0.55
                    
                    # Penalizar tabelas esparsas ou muito longas com poucos headers
                    # Falsos positivos de layout costumam ter linhas muito altas/espaçadas
                    altura_linha = estrutura.get("altura_media_linha", 0)
                    if n_cabecalhos <= 1:
                        if altura_linha > 90:
                            limiar_fraco += 0.12
                        if n_linhas > 12:
                            limiar_fraco += 0.08
                    
                    # Premiar qualidade media excepcional (resgata tabelas compactas e claras)
                    if qualidade_media >= 0.90: # Reduzido de 0.98 para abranger mais tabelas reais
                        limiar_fraco -= 0.05
                    
                    # Se 2 colunas e nenhum header, penaliza qualidade (+0.12)
                    if n_colunas <= 2 and n_cabecalhos == 0:
                        limiar_fraco += 0.12
                    
                    # Tabelas muito finas precisam de mais evidência se os headers forem fracos
                    if n_linhas <= 3:
                        limiar_fraco += 0.10
                        # Se tiver poucos headers em relação às colunas, aumentamos ainda mais
                        if n_cabecalhos <= 1 and n_colunas >= 4:
                            limiar_fraco += 0.05

                    # Se houver pelo menos um cabecalho, damos uma pequena margem (mas menor se for rasa)
                    if n_cabecalhos > 0: 
                        limiar_fraco -= (0.05 if n_linhas > 3 else 0.02)
                    
                    if qualidade < limiar_fraco:
                        registo.info(
                            f"  [WEAK-HEADER-REJECT] #{idx+1} q={qualidade:.3f} < {limiar_fraco:.2f} "
                            f"(cab={n_cabecalhos}/{n_colunas}, avg={qualidade_media:.3f}, h_lin={altura_linha:.1f})"
                        )
                        continue
                    if qualidade_media < 0.85:
                        registo.info(f"  [WEAK-HEADER-REJECT] #{idx+1} avg={qualidade_media:.3f} < 0.85")
                        continue

                # Rejeitar se a estrutura for dominada por cabecalhos (layout de card/lista)
                limiar_dominancia = n_linhas if n_linhas > 5 else (n_linhas - 1)
                if n_cabecalhos >= limiar_dominancia and n_linhas >= 3:
                    # Exceção: tabelas com 3+ colunas e confiança absoluta (1.0) costumam ser índices válidos
                    if not (n_colunas >= 3 and pontuacao >= 1.0):
                        registo.info(f"  [HEADER-REJECT] #{idx+1} estrutura dominada por cabecalhos ({n_cabecalhos}/{n_linhas})")
                        continue

                # Chão global de qualidade média para evitar falsos positivos estruturais
                # A menos que a confiança S1 seja absoluta (0.99+)
                piso_avg_global = 0.75
                if qualidade_media < piso_avg_global and pontuacao < 0.99:
                    registo.info(f"  [AVG-REJECT] #{idx+1} avg={qualidade_media:.3f} < {piso_avg_global} (s1={pontuacao:.3f})")
                    continue

                if qualidade >= limiar_confirmacao:
                    registo.info(
                        f"  [OK] #{idx+1} s1={pontuacao:.3f} s2={n_linhas}Lx{n_colunas}C "
                        f"q={qualidade:.3f} avg={qualidade_media:.3f} cabecalhos={estrutura.get('n_cabecalhos', 0)}"
                    )
                    tabelas_confirmadas.append({"caixa": caixa, "pontuacao": pontuacao, **estrutura})
                else:
                    registo.info(f"  [QUAL-REJECT] #{idx+1} s1={pontuacao:.3f} q={qualidade:.3f} < {limiar_confirmacao}")
            else:
                registo.info(f"  [STRUC-REJECT] #{idx+1} s1={pontuacao:.3f} — {estrutura['motivo']}")

        tem_tabela = len(tabelas_confirmadas) > 0
        pontuacao_maxima = max((t["pontuacao"] for t in tabelas_confirmadas), default=0.0)

        registo.info(
            f"  RESULTADO: {'[!] TABELA ENCONTRADA' if tem_tabela else '[.] Sem tabela'}"
            + (f" ({len(tabelas_confirmadas)} confirmada(s))" if tem_tabela else "")
        )

        return {"tem_tabela": tem_tabela, "confianca": pontuacao_maxima}, imagem

    except Exception as e:
        registo.error(f"Erro no pipeline: {e}")
        return {"tem_tabela": False, "erro": str(e)}, imagem


def _detetar_tabelas_em_imagem_sincrono(entrada_imagem):
    try:
        url_ref, referencia = _obter_url_e_referencia(entrada_imagem)
        if url_ref is None:
            return {"tem_tabela": False, "erro": "entrada_invalida", "motivo_analise": "entrada_invalida"}, None

        if isinstance(url_ref, str) and url_ref.startswith(("http://", "https://")):
            resposta = _pedir_imagem_http(url_ref, referencia, tempo_limite=15.0)

            if resposta.status_code != 200:
                return (
                    {
                        "tem_tabela": False,
                        "erro": f"HTTP {resposta.status_code}",
                        "motivo_analise": f"http_{resposta.status_code}",
                    },
                    None,
                )

            tipo_conteudo = resposta.headers.get("Content-Type", "").lower()
            if "text/html" in tipo_conteudo or "application/json" in tipo_conteudo:
                return (
                    {
                        "tem_tabela": False,
                        "erro": f"Conteudo invalido: {tipo_conteudo}",
                        "motivo_analise": "resposta_nao_imagem",
                    },
                    None,
                )

            imagem = Image.open(io.BytesIO(resposta.content)).convert("RGB")
        elif isinstance(url_ref, str):
            imagem = Image.open(url_ref).convert("RGB")
        elif isinstance(url_ref, bytes):
            imagem = Image.open(io.BytesIO(url_ref)).convert("RGB")
        elif hasattr(url_ref, "convert"):
            imagem = url_ref.convert("RGB")
        else:
            return {"tem_tabela": False, "erro": "tipo_entrada_nao_suportado", "motivo_analise": "tipo_invalido"}, None

        if imagem.width < IMAGEM_MIN_LARGURA or imagem.height < IMAGEM_MIN_ALTURA:
            return {"tem_tabela": False, "motivo": "imagem_muito_pequena", "motivo_analise": "imagem_muito_pequena"}, imagem

        return detetar_tabelas_em_imagem_pil(imagem)

    except Exception as e:
        registo.error(f"Falha ao carregar imagem: {str(e)}")
        return {"tem_tabela": False, "erro": str(e), "motivo_analise": "excecao_carregamento"}, None


async def detetar_tabelas_em_imagem(entrada_imagem):
    return await asyncio.to_thread(_detetar_tabelas_em_imagem_sincrono, entrada_imagem)


async def detetar_tabelas_para_tarefa(imagens, id_tarefa=None, ao_progredir=None, concorrencia_analise=None):
    total = len(imagens)
    conc  = max(1, int(concorrencia_analise or os.getenv("ANALYSIS_CONCURRENCY", "2")))
    registo.info(f"--- ANALISE IA INICIADA ({total} imagens, concorrencia={conc}) ---")

    for imagem_dict in imagens:
        imagem_dict["tem_tabela"]    = False

    semaforo  = asyncio.Semaphore(conc)
    bloqueio_progresso = asyncio.Lock()
    processadas = 0
    detetadas   = 0

    async def processar_uma(imagem_dict):
        nonlocal processadas, detetadas
        url_origem = (
            imagem_dict.get("url_origem")
            or imagem_dict.get("urlOrigem")
            or imagem_dict.get("imageSrc")
        )

        if not url_origem:
            imagem_dict["estado_tabela"] = "ignorado"
            imagem_dict["motivo_analise"] = "sem_url_origem"
            async with bloqueio_progresso:
                processadas += 1
                if ao_progredir:
                    ao_progredir(processadas, detetadas)
            return

        async with semaforo:
            try:
                registo.info(f"  Analisar: {url_origem[:90]}...")
                entrada  = {"url": url_origem, "referer": imagem_dict.get("url_pagina")}
                resultado, pil_img = await detetar_tabelas_em_imagem(entrada)
                imagem_dict["tem_tabela"] = resultado.get("tem_tabela", False)
            except Exception as e:
                registo.error(f"Erro ao processar {url_origem}: {e}")

            async with bloqueio_progresso:
                if imagem_dict["tem_tabela"]:
                    detetadas += 1
                processadas += 1
                if ao_progredir:
                    ao_progredir(processadas, detetadas)

    await asyncio.gather(*(processar_uma(d) for d in imagens))

    registo.info(f"--- ANALISE CONCLUIDA ({detetadas}/{total} com tabela) ---")
    return imagens