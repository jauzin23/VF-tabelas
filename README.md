# VF-Tabelas - Deteção Automática de Tabelas em Websites

Ferramenta de análise de tabelas em websites. Rastreia websites, extrai imagens e utiliza um modelo de IA (Table Transformer) para detetar quais contêm tabelas de dados.

---

## O que faz

1. **Rastreia o website** - navega automaticamente pelas páginas a partir de um URL inicial, seguindo paginações e links de detalhe.
2. **Extrai imagens** - encontra todas as imagens relevantes em cada página (filtrando ícones e elementos decorativos).
3. **Analisa com IA** - cada imagem é processada pelo modelo Table Transformer (Microsoft) que deteta a presença de tabelas de dados.
4. **Apresenta resultados** - o dashboard mostra quais imagens contêm tabelas, com exportação para Excel.

---

## Como funciona (por dentro)

### Pipeline de análise - URL único

Quando é submetido um URL, o backend cria uma tarefa assíncrona e lança o crawler. O progresso é transmitido ao frontend em tempo real via **SSE (Server-Sent Events)** - o backend empurra eventos ("página visitada", "imagem encontrada", "análise concluída") sem polling do lado do cliente.

### Modo multi-URL

No modo multi-URL (`POST /api/paginacao-multurls`), cada URL da lista é tratado como um ponto de entrada independente. As tarefas partilham um **gestor de browser singleton** com um semáforo global que limita os tabs Chromium simultâneos, evitando saturação de memória quando vários crawls correm em paralelo. Existe ainda uma fila global FIFO que serializa a execução quando os recursos estão sob pressão (especialmente útil em containers de 1GB RAM).

### Crawler - estratégia de dupla abordagem

O crawler combina duas camadas de extração para lidar com sites estáticos e dinâmicos:

1. **Camada estática (httpx)** - faz fetch do HTML diretamente e extrai imagens via parsing do DOM. Rápido e sem overhead, usado como pre-flight para qualquer URL.

2. **Camada dinâmica (Patchright/Chromium)** - controla um browser headless real. Após o `domcontentloaded`, executa scroll incremental, aguarda estabilização do DOM (contagem de `img` e `a[href]` estabilizada em 6 amostras consecutivas) e expande menus. Capta também respostas XHR/fetch para detetar APIs de paginação internas.

**Deteção e seguimento de paginação:** o crawler inspeciona o DOM à procura de padrões conhecidos (Ant Design pagination, links numéricos, atributo `rel=next`, etc.). Quando deteta uma API paginada via XHR, constrói as URLs das páginas restantes e processa-as em paralelo com concorrência controlada.

**Filtragem de imagens:** são descartadas automaticamente imagens abaixo de dimensão mínima configurável (`MIN_IMAGE_WIDTH` × `MIN_IMAGE_HEIGHT`), SVGs, data URIs, tiles de mapa e padrões de URL associados a ícones/logos/avatares.

### Análise de imagens - pipeline IA em duas fases

Cada imagem recolhida passa por dois modelos do Microsoft **Table Transformer** (baseados em DETR):

| Fase                          | Modelo                                    | O que faz                                                                                                                    |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **S1 - Deteção**              | `table-transformer-detection`             | Analisa a imagem completa e devolve bounding boxes com pontuação de confiança para regiões candidatas a tabela.              |
| **S2 - Validação estrutural** | `table-transformer-structure-recognition` | Recebe o recorte da região candidata e conta linhas, colunas e cabeçalhos. Valida alinhamento em grelha e aspeto geométrico. |

A confirmação final exige que **ambas as fases concordem**: S1 deteta uma região com confiança suficiente **e** S2 confirma estrutura mínima (≥ 2 linhas × ≥ 2 colunas, alinhamento linha-coluna sobrepostos). Existem regras adicionais para rejeitar falsos positivos comuns - calendários, grelhas de cards, blocos de título técnico e banners panorâmicos com UI embebida.

As análises correm com concorrência configurável (`ANALYSIS_CONCURRENCY`) via `asyncio.gather`. O sistema utiliza **exclusivamente CPU** para minimizar o consumo de recursos e garantir estabilidade em ambientes de baixa memória.

---

## Funcionalidades

| Funcionalidade              | Descrição                                                            |
| --------------------------- | -------------------------------------------------------------------- |
| **Rastreio de URL único**   | Introduz um URL e o sistema rastreia o site automaticamente          |
| **Lote de URLs**            | Submete múltiplos URLs de uma vez para análise em batch              |
| **Deteção direta**          | Carrega uma imagem diretamente para deteção instantânea de tabelas   |
| **Seguir paginação**        | Deteta automaticamente paginação (Ant Design, links numéricos, etc.) |
| **Seguir links de detalhe** | Navega para páginas de detalhe encontradas na listagem               |
| **Progresso em tempo real** | Acompanha o estado da tarefa via SSE (Server-Sent Events)            |
| **Exportação Excel**        | Exporta resultados com estilos e links clicáveis                     |
| **Otimizado para 1GB RAM**  | Sistema de filas e gestão de memória para containers pequenos        |

---

## Instalação

### Pré-requisitos

- Docker ≥ 24.0
- Docker Compose ≥ 2.20

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

### 3. Iniciar a aplicação

```bash
docker compose up -d
```

O primeiro arranque demora alguns minutos a construir as imagens e a descarregar os modelos de IA.

---

## Variáveis de ambiente

### Backend

| Variável               | Padrão  | Descrição                                                                 |
| ---------------------- | ------- | ------------------------------------------------------------------------- |
| `BACKEND_PORT`         | `4000`  | Porta do servidor backend                                                 |
| `MAX_PAGES`            | `50`    | Número máximo de páginas a rastrear por tarefa                            |
| `CRAWLER_CONCURRENCY`  | `2`     | Concorrência do rastreador                                                |
| `ANALYSIS_CONCURRENCY` | `1`     | Imagens analisadas em paralelo (manter 1 para 1GB RAM)                    |
| `MAX_QUEUE_SIZE`       | `0`     | Máximo de tarefas na fila (0 = ilimitado)                                 |
| `MAX_CONCURRENT_TASKS` | `1`     | Tarefas a correr em simultâneo (manter 1 para 1GB RAM)                    |

---

## Estrutura do projeto

```
VF-tabelas/
├── .env                         # Configuração central
├── docker-compose.yml           # Orquestração Docker (CPU-only)
├── README.md                    # Esta documentação
│
├── backend_py/                  # Backend Python (FastAPI)
│   ├── Dockerfile               # Imagem Docker CPU
│   ├── requirements.txt         # Dependências otimizadas para CPU
│   ├── main.py                  # API e Ciclo de Vida
│   ├── tarefas.py               # Fila Global e Gestão de Tarefas
│   ├── detetor.py               # Pipeline IA (Lazy Loading)
│   └── extrator/                # Crawler e Browser Manager
│
└── frontend/                    # Frontend Next.js (React)
    ├── Dockerfile               # Imagem Docker
    ├── app/                     # Páginas (Dashboard, Tarefas)
    ├── components/              # UI Components (Badges, Forms)
    └── lib/                     # API Client e Types
```
