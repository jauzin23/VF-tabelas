from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ImagemEncontrada:
    id: str
    url_pagina: str
    titulo_pagina: str
    url_origem: str
    url_contentor: str
    alt: str = ""
    tem_tabela: bool = False
    paginas_origem: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Paginacao:
    e_listagem_paginada: bool = False
    pagina_atual: int = 1
    total_paginas: int | None = None
    api_modelo: str | None = None
    api_metodo: str = "GET"
    api_corpo: dict[str, Any] | None = None
    api_cabecalhos: dict[str, str] | None = None
    parametro_pagina: str = "page"
    fonte: str = ""
    chave_lista_api: str | None = None
