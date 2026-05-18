"""
auth.py - Módulo de Autenticação e Segurança via API Keys.
Garante a verificação estrita de chaves nos endpoints protegidos.
"""
from typing import Optional
from fastapi import Request, HTTPException, Query, Security
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from starlette.status import HTTP_401_UNAUTHORIZED

from config import carregar_api_keys, registo

# Carrega e valida as chaves de API globais no arranque
CHAVES_VALIDAS = carregar_api_keys()


async def verificar_api_key(
    request: Request,
    query_api_key: Optional[str] = Query(None, alias="api_key")
) -> str:
    """
    Verifica se a requisição contém uma API Key válida em:
    1. Cabeçalho 'X-API-Key'
    2. Cabeçalho 'Authorization: Bearer <key>'
    3. Parâmetro de query '?api_key=<key>'
    """
    chave_extraida: Optional[str] = None

    # 1. Tentar extrair do cabeçalho X-API-Key
    header_api_key = request.headers.get("X-API-Key")
    if header_api_key:
        chave_extraida = header_api_key.strip()

    # 2. Tentar extrair do cabeçalho Authorization
    if not chave_extraida:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            chave_extraida = auth_header[len("Bearer "):].strip()

    # 3. Tentar extrair do query param (usado no EventSource/SSE)
    if not chave_extraida and query_api_key:
        chave_extraida = query_api_key.strip()

    # Validar se a chave extraída pertence ao conjunto de chaves autorizadas
    if not chave_extraida or chave_extraida not in CHAVES_VALIDAS:
        registo.warning(f"Tentativa de acesso não autorizada (IP: {request.client.host if request.client else 'desconhecido'})")
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Não autorizado: API Key inválida ou ausente."
        )

    return chave_extraida
