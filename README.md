# VF-Tabelas — Deteção Automática de Tabelas em Websites

Ferramenta de análise de tabelas em websites. Rastreia websites, extrai imagens e utiliza um modelo de IA (Table Transformer) para detetar quais contêm tabelas de dados.

---

## O que faz

1. **Rastreia o website** — navega automaticamente pelas páginas a partir de um URL inicial, seguindo paginações e links de detalhe.
2. **Extrai imagens** — encontra todas as imagens relevantes em cada página (filtrando ícones e elementos decorativos).
3. **Analisa com IA** — cada imagem é processada pelo modelo Table Transformer (Microsoft) que deteta a presença de tabelas de dados.
4. **Apresenta resultados** — o dashboard mostra quais imagens contêm tabelas, com exportação para Excel.

---

## Como funciona (por dentro)

### Pipeline de análise — URL único

Quando é submetido um URL, o backend cria uma tarefa assíncrona e lança o crawler. O progresso é transmitido ao frontend em tempo real via **SSE (Server-Sent Events)** — o backend empurra eventos ("página visitada", "imagem encontrada", "análise concluída") sem polling do lado do cliente.

### Modo multi-URL

No modo multi-URL (`POST /api/paginacao-multurls`), cada URL da lista é tratado como um ponto de entrada independente. As tarefas partilham um **gestor de browser singleton** com um semáforo global que limita os tabs Chromium simultâneos, evitando saturação de memória quando vários crawls correm em paralelo. Existe ainda uma fila global FIFO que serializa a execução quando os recursos estão sob pressão.

### Crawler — estratégia de dupla abordagem

O crawler combina duas camadas de extração para lidar com sites estáticos e dinâmicos:

1. **Camada estática (httpx)** — faz fetch do HTML diretamente e extrai imagens via parsing do DOM. Rápido e sem overhead, usado como pre-flight para qualquer URL.

2. **Camada dinâmica (Patchright/Chromium)** — controla um browser headless real. Após o `domcontentloaded`, executa scroll incremental, aguarda estabilização do DOM (contagem de `img` e `a[href]` estabilizada em 6 amostras consecutivas) e expande menus. Capta também respostas XHR/fetch para detetar APIs de paginação internas.

**Deteção e seguimento de paginação:** o crawler inspeciona o DOM à procura de padrões conhecidos (Ant Design pagination, links numéricos, atributo `rel=next`, etc.). Quando deteta uma API paginada via XHR, constrói as URLs das páginas restantes e processa-as em paralelo com concorrência controlada.

**Filtragem de imagens:** são descartadas automaticamente imagens abaixo de dimensão mínima configurável (`MIN_IMAGE_WIDTH` × `MIN_IMAGE_HEIGHT`), SVGs, data URIs, tiles de mapa e padrões de URL associados a ícones/logos/avatares.

### Análise de imagens — pipeline IA em duas fases

Cada imagem recolhida passa por dois modelos do Microsoft **Table Transformer** (baseados em DETR):

| Fase | Modelo | O que faz |
| --- | --- | --- |
| **S1 — Deteção** | `table-transformer-detection` | Analisa a imagem completa e devolve bounding boxes com pontuação de confiança para regiões candidatas a tabela. |
| **S2 — Validação estrutural** | `table-transformer-structure-recognition` | Recebe o recorte da região candidata e conta linhas, colunas e cabeçalhos. Valida alinhamento em grelha e aspeto geométrico. |

A confirmação final exige que **ambas as fases concordem**: S1 deteta uma região com confiança suficiente **e** S2 confirma estrutura mínima (≥ 2 linhas × ≥ 2 colunas, alinhamento linha-coluna sobrepostos). Existem regras adicionais para rejeitar falsos positivos comuns — calendários, grelhas de cards, blocos de título técnico e banners panorâmicos com UI embebida.

As análises correm com concorrência configurável (`ANALYSIS_CONCURRENCY`) via `asyncio.gather`, com suporte transparente a **CPU ou GPU (CUDA)** detetado em runtime pelo PyTorch.

---

## Funcionalidades

| Funcionalidade | Descrição |
| --- | --- |
| **Rastreio de URL único** | Introduz um URL e o sistema rastreia o site automaticamente |
| **Lote de URLs** | Submete múltiplos URLs de uma vez para análise em batch |
| **Deteção direta** | Carrega uma imagem diretamente para deteção instantânea de tabelas |
| **Seguir paginação** | Deteta automaticamente paginação (Ant Design, links numéricos, etc.) |
| **Seguir links de detalhe** | Navega para páginas de detalhe encontradas na listagem |
| **Progresso em tempo real** | Acompanha o estado da tarefa via SSE (Server-Sent Events) |
| **Exportação Excel** | Exporta resultados com estilos e links clicáveis |
| **GPU opcional** | Suporte a NVIDIA CUDA para aceleração da inferência |

---

## Instalação

### Pré-requisitos

- Docker ≥ 24.0
- Docker Compose ≥ 2.20
- *(Opcional)* Drivers NVIDIA + NVIDIA Container Toolkit (para GPU)

### 1. Clonar o repositório

```bash
git clone https://github.com/SEU_UTILIZADOR/vf-tabelas.git
cd vf-tabelas
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar o ficheiro `.env` conforme necessário. Os valores por omissão funcionam para desenvolvimento local.

> **Importante:** Nunca partilhar o ficheiro `.env` nem fazer commit para o Git. O `.env` está listado no `.gitignore` e não será incluído automaticamente.

### 3. Iniciar a aplicação

**Modo CPU (padrão):**

```bash
docker compose up -d
```

**Modo GPU (NVIDIA CUDA):**

```bash
docker compose -f docker-compose.yml -f docker-compose.cuda.yml up -d
```

O primeiro arranque demora alguns minutos a construir as imagens e a descarregar os modelos de IA.

### 4. Aceder à aplicação

| Serviço | URL |
| --- | --- |
| **Frontend** (dashboard) | [http://localhost:3000](http://localhost:3000) |
| **Backend** (API) | [http://localhost:4000](http://localhost:4000) |
| **Health check** | [http://localhost:4000/saude](http://localhost:4000/saude) |

---

## Variáveis de ambiente

Todas as variáveis estão documentadas no ficheiro `.env.example`. Eis a referência completa:

### Backend

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `BACKEND_PORT` | `4000` | Porta do servidor backend |
| `ALLOWED_ORIGINS` | `*` | Domínio(s) permitidos para CORS, separados por vírgula. `*` permite todos |
| `MAX_PAGES` | `50` | Número máximo de páginas a rastrear por tarefa |
| `MAX_DEPTH` | `3` | Profundidade máxima de navegação |
| `PAGE_TIMEOUT_MS` | `30000` | Tempo limite por página em milissegundos |
| `CRAWLER_CONCURRENCY` | `0` | Concorrência do rastreador (`0` = automático) |
| `JOB_TIMEOUT_S` | `600` | Tempo limite global por tarefa em segundos |
| `MIN_IMAGE_WIDTH` | `120` | Largura mínima de imagem em pixels |
| `MIN_IMAGE_HEIGHT` | `80` | Altura mínima de imagem em pixels |
| `MIN_IMAGE_AREA` | `9600` | Área mínima de imagem em pixels² |
| `TABLE_MIN_CONFIDENCE` | `0.5` | Confiança mínima para deteção de tabela (0.0–1.0) |
| `ANALYSIS_CONCURRENCY` | `2` | Número de imagens analisadas em paralelo |
| `IMAGE_HTTP_RETRIES` | `2` | Tentativas de download de cada imagem |
| `STRUCTURE_MIN_ROWS` | `2` | Linhas mínimas para validar estrutura de tabela |
| `STRUCTURE_MIN_COLS` | `2` | Colunas mínimas para validar estrutura de tabela |

### Frontend

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `FRONTEND_PORT` | `3000` | Porta do frontend |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | URL da API visível pelo browser. Em produção, usar o URL público |

---

## Deploy em Azure

A aplicação está preparada para correr como contentor(es) em **Azure VM**, **Azure Container Instances** ou **Azure App Service**.

### Opção 1 — Azure VM (recomendado)

SKUs recomendados:

| Uso | SKU | vCPUs | RAM | GPU |
| --- | --- | --- | --- | --- |
| CPU | Standard_D4s_v3 | 4 | 16 GB | — |
| GPU | Standard_NC6s_v3 | 6 | 112 GB | 1× Tesla V100 |

**Passos:**

1. Criar uma VM Ubuntu 22.04 no Azure

2. Instalar Docker e Docker Compose:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

3. *(Apenas GPU)* Instalar NVIDIA Container Toolkit:
```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

4. Abrir portas no Network Security Group (NSG):
   - Porta `3000` (frontend)
   - Porta `4000` (backend API)
   - Porta `80`/`443` se usar proxy reverso

5. Clonar e arrancar:
```bash
git clone https://github.com/SEU_UTILIZADOR/vf-tabelas.git
cd vf-tabelas
cp .env.example .env
nano .env  # editar ALLOWED_ORIGINS, NEXT_PUBLIC_API_URL, etc.
docker compose up -d
```

### Opção 2 — Azure Container Instances (ACI)

Ideal para testes rápidos sem gerir VMs. As variáveis de ambiente (conteúdo do `.env`) devem ser configuradas como **variáveis de ambiente no portal Azure** — não incluir o ficheiro `.env` na imagem.

### Produção — CORS e HTTPS

Antes de entrar em produção, configurar obrigatoriamente:

```dotenv
ALLOWED_ORIGINS=https://meudominio.com
NEXT_PUBLIC_API_URL=https://api.meudominio.com
```

Para HTTPS, recomenda-se um proxy reverso (nginx ou Caddy) com certificado Let's Encrypt à frente dos serviços.

---

## API REST

### `GET /saude`

Verifica se a API está operacional.

**Resposta:**
```json
"ok"
```

---

### `GET /api/tarefas`

Lista todas as tarefas existentes.

**Resposta:** Array de tarefas (resumo, sem resultados detalhados).

---

### `POST /api/tarefas`

Cria uma nova tarefa de rastreio e deteção.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `url` | string | URL do site a rastrear |
| `urls` | string[] | Lista de URLs para análise em lote |
| `opcoes` | object | Opções de execução (ver abaixo) |
| `sse` | boolean | `true` = retorna ID e executa em background; `false` = aguarda conclusão |

**Opções disponíveis:**

| Opção | Tipo | Padrão | Descrição |
| --- | --- | --- | --- |
| `max_paginas` | int | `50` | Máximo de páginas a rastrear |
| `max_profundidade` | int | `3` | Profundidade máxima |
| `seguir_paginacao` | bool | `true` | Seguir paginação automática |
| `seguir_detalhe` | bool | `true` | Seguir links de detalhe |
| `concorrencia_analise` | int | `2` | Análises IA em paralelo |

**Exemplo (modo SSE):**

```bash
curl -X POST http://localhost:4000/api/tarefas \
  -H "Content-Type: application/json" \
  -d '{"url": "https://exemplo.pt", "sse": true}'
```

**Resposta:**
```json
{
  "id": "uuid-da-tarefa",
  "url_alvo": "https://exemplo.pt",
  "estado": "pendente",
  "criado_em": "2026-01-01T00:00:00Z"
}
```

---

### `GET /api/tarefas/{id}`

Obtém o estado e resultados de uma tarefa.

---

### `GET /api/tarefas/{id}/eventos`

Stream SSE (Server-Sent Events) com atualizações em tempo real da tarefa.

---

### `DELETE /api/tarefas/{id}`

Elimina uma tarefa e os seus dados.

---

### `POST /api/tarefas/{id}/imagens`

Lista as imagens encontradas e os resultados da análise IA para uma tarefa.

---

### `POST /api/modelo/detetar-tabela`

Deteção direta de tabela numa imagem carregada.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `ficheiro` | file (multipart) | Imagem a analisar (JPEG, PNG, WebP) |

**Exemplo:**
```bash
curl -X POST http://localhost:4000/api/modelo/detetar-tabela \
  -F "ficheiro=@imagem.png"
```

**Resposta:**
```json
{
  "tem_tabela": true
}
```

---

### `POST /api/paginacao-multurls`

Cria uma tarefa de análise em lote para múltiplos URLs.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `urls` | string[] | Lista de URLs a analisar |
| `sse` | boolean | `true` = background; `false` = bloqueante |

**Exemplo:**
```bash
curl -X POST http://localhost:4000/api/paginacao-multurls \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://site1.pt/pagina", "https://site2.pt/pagina"], "sse": true}'
```

---

## GPU vs CPU

| | CPU (padrão) | GPU (CUDA) |
| --- | --- | --- |
| **Comando** | `docker compose up -d` | `docker compose -f docker-compose.yml -f docker-compose.cuda.yml up -d` |
| **Requisitos** | Docker | Docker + drivers NVIDIA + NVIDIA Container Toolkit |
| **Velocidade IA** | ~2-5s por imagem | ~0.1-0.5s por imagem |
| **Quando usar** | Desenvolvimento, tarefas pequenas | Produção, lotes grandes |

> O modelo Table Transformer funciona em CPU sem problemas. A GPU é opcional e apenas acelera a inferência.

---

## Estrutura do projeto

```
VF-tabelas/
├── .env.example                 # Configuração central (copiar para .env)
├── docker-compose.yml           # Orquestração Docker (CPU)
├── docker-compose.cuda.yml      # Override para GPU NVIDIA
├── README.md                    # Esta documentação
│
├── backend_py/                  # Backend Python (FastAPI)
│   ├── Dockerfile               # Imagem Docker (CPU)
│   ├── Dockerfile.cuda          # Imagem Docker (GPU)
│   ├── requirements.txt         # Dependências Python (CPU)
│   ├── requirements-cuda.txt    # Dependências Python (GPU)
│   ├── main.py                  # Ponto de entrada da API
│   ├── rotas/                   # Endpoints da API
│   │   ├── tarefas.py           # CRUD de tarefas
│   │   ├── modelo.py            # Deteção direta de tabela
│   │   └── paginacao.py         # Análise multi-URL
│   ├── servicos/                # Lógica de negócio
│   │   ├── gestor_tarefas.py    # Gestão do ciclo de vida das tarefas
│   │   ├── detetor_tabelas.py   # Pipeline de deteção IA (Table Transformer)
│   │   ├── eventos_tarefa.py    # SSE (Server-Sent Events)
│   │   └── extrator/            # Rastreador web
│   │       ├── executor_crawlee.py       # Motor de rastreio (Crawlee)
│   │       ├── renderizador_browser.py   # Renderização de páginas (Patchright)
│   │       ├── localizador_imagens.py    # Extração de imagens do DOM
│   │       ├── paginacao.py              # Deteção de paginação
│   │       ├── classificador.py          # Classificação de links
│   │       └── ...
│   └── utilitarios/             # Funções auxiliares
│       ├── ambiente.py          # Carregamento de variáveis de ambiente
│       └── registo.py           # Configuração de logging
│
└── frontend/                    # Frontend Next.js (React)
    ├── Dockerfile               # Imagem Docker (standalone)
    ├── next.config.mjs          # Configuração Next.js
    ├── package.json             # Dependências Node.js
    ├── app/                     # Páginas da aplicação
    │   ├── page.tsx             # Painel principal (dashboard)
    │   ├── tarefas/             # Gestão e detalhe de tarefas
    │   └── detetar/             # Deteção direta de imagem
    ├── components/              # Componentes React reutilizáveis
    └── lib/                     # Utilitários e cliente API
        ├── api.ts               # Cliente HTTP para o backend
        └── types.ts             # Tipos TypeScript
```
