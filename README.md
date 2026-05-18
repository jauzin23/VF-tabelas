# VF-Tabelas — Deteção Automática de Tabelas de Dados em Websites

O **VF-Tabelas** é uma plataforma avançada de extração de dados e visão computacional projetada para rastrear websites complexos (incluindo SPAs e sites dinâmicos renderizados em JavaScript), extrair imagens e analisar estruturalmente cada elemento visual através de modelos de Inteligência Artificial de ponta (**Table Transformer da Microsoft**). O seu objetivo principal é identificar de forma autónoma e precisa quais as imagens ou capturas de ecrã que contêm tabelas de dados legítimas, descartando falsos positivos como elementos de layout, cartazes ou grelhas de navegação.

Construído com uma arquitetura assíncrona robusta e concebido para operar estavelmente em ambientes de produção com recursos altamente restritos (como containers Docker com apenas 1 vCPU e 1GB de RAM), o sistema oferece processamento em tempo real, gestão inteligente de memória e exportação direta dos resultados analisados para Excel.

---

## 🚀 Principais Capacidades

- **Rastreio Híbrido Avançado**: Combina pedidos HTTP ultrarrápidos (`httpx`) com automação de browsers headless (`Patchright`/`Playwright` + Chromium) para lidar perfeitamente com sites estáticos e dinâmicos (ex: Next.js, React, Vue).
- **Descoberta Inteligente de Paginação**: Identifica automaticamente padrões de paginação no DOM e interceta chamadas de API (XHR/Fetch) internas para extrair catálogos inteiros em paralelo.
- **Pipeline de IA em Duas Fases (S1 & S2)**: Utiliza modelos baseados em DETR para detetar candidatos a tabela e validar rigorosamente a sua grelha interna (linhas, colunas, cabeçalhos e alinhamentos).
- **Fallbacks e Recuperação Estrutural**: Incorpora algoritmos de resgate de recortes expandidos e fallbacks globais para recuperar tabelas difíceis ou mal enquadradas com zero intervenção manual.
- **Filtragem Heurística Anti-Falsos-Positivos**: Distingue com precisão cirúrgica tabelas de dados reais de elementos que imitam grelhas (como calendários, blocos de título de plantas de arquitetura, grelhas de produtos ou capturas de UI em banners promocionais).
- **Otimização Extrema de Memória (1GB RAM)**: Implementa uma Fila Global FIFO de serialização, descarregamento dinâmico de modelos de IA e desativação proativa de recursos ociosos para garantir estabilidade contínua sem falhas de *Out-of-Memory* (OOM).
- **Configuração Centralizada e Zero-Env**: Toda a configuração do sistema reside nativa e diretamente no ficheiro `docker-compose.yml`, eliminando a necessidade de gerir ficheiros `.env` externos.
- **Feedback em Tempo Real via SSE**: Transmite cada progresso, página descoberta, imagem encontrada e resultado de análise instantaneamente para o frontend através de *Server-Sent Events*.

---

## 🧠 Arquitetura do Sistema e Otimização de Recursos

O sistema foi arquitetado para resolver um dos maiores desafios em automação web e IA: executar motores de browser pesados simultaneamente com modelos de *Deep Learning* (PyTorch) num ambiente com pouca RAM e CPU limitada.

```
+-------------------------------------------------------------------------------+
|                               FRONTEND (Next.js)                              |
+-------------------------------------------------------------------------------+
        | (Submissão de Tarefa / Multi-URLs)        ^ (Progresso em Tempo Real)
        v                                           | (Server-Sent Events - SSE)
+-------------------------------------------------------------------------------+
|                               BACKEND (FastAPI)                               |
+-------------------------------------------------------------------------------+
        |                                           |
        v [Enfileiramento FIFO]                     v [Gestor Ativo de RAM]
+-----------------------------------+       +-----------------------------------+
|         FILA GLOBAL FIFO          | <---> |        GESTOR DE IA & RAM         |
| (Garante 1 Tarefa Ativa por vez)  |       | (Carregamento Lazy / Unload Auto) |
+-----------------------------------+       +-----------------------------------+
        |                                                   |
        v [Execução de Tarefa]                              v [Inferência IA]
+---------------------------------------------------+   +-----------------------+
|                 CRAWLER HÍBRIDO                   |   |   TABLE TRANSFORMER   |
|  - Camada Estática (httpx / pre-flight)           |   |  - Fase S1: Deteção   |
|  - Camada Dinâmica (Chromium Headless Singleton)  |   |  - Fase S2: Estrutura |
+---------------------------------------------------+   +-----------------------+
```

### 1. Fila Global FIFO e Serialização de Processos
Quando múltiplos pedidos ou listas de URLs são submetidos (`POST /api/tarefas` ou `POST /api/paginacao-multurls`), o backend não lança todas as execuções simultaneamente. Em vez disso, as tarefas entram numa **Fila Global FIFO** controlada. Em ambientes configurados para baixa memória (`MAX_CONCURRENT_TASKS=1`), apenas uma tarefa pesada é executada de cada vez, garantindo que a largura de banda da rede, a CPU e a RAM estão 100% dedicadas ao trabalho ativo. O utilizador recebe um identificador de tarefa e a sua posição exata na fila, sendo atualizado em tempo real.

### 2. Gestão Dinâmica de RAM da IA (Lazy Loading & Proactive Unloading)
Os modelos de visão computacional da Microsoft baseados no PyTorch consomem centenas de megabytes de memória. Para coexistirem pacificamente com o Chromium:
- **Carregamento Preguiçoso (*Lazy Loading*)**: Os tensores e processadores (`DetrImageProcessor`) só são carregados para a RAM no exato milissegundo em que a primeira imagem precisa de ser analisada.
- **Descarregamento Proativo (*Proactive Unloading*)**: Uma rotina de background (`gestor_ia_ram_loop`) monitoriza continuamente o estado do servidor. Se o crawler estiver ativamente a navegar em páginas web e a extrair DOM, a IA é totalmente removida da memória (`gc.collect()`), libertando recursos vitais para as abas do browser. A IA só regressa à RAM quando a extração termina e se inicia o lote de análise visual.
- **Controlo de CPU PyTorch**: O PyTorch é estritamente limitado a 1 thread (`torch.set_num_threads(1)`), impedindo picos repentinos de 500% de uso de CPU que causariam estrangulamento ou bloqueio do container.
- **Flush Periódico para Disco**: Durante tarefas longas que descobrem milhares de imagens, os resultados parciais são descarregados de forma incremental para o disco (`resultados_parciais.json`) a cada N itens (`RESULTS_FLUSH_INTERVAL`), mantendo a pegada de memória do processo Python baixa e perfeitamente constante.

---

## 🕷️ Motor de Rastreio (Crawler) e Extração

O crawler utiliza uma estratégia híbrida em duas camadas para maximizar a velocidade em sites fáceis e garantir precisão absoluta em páginas renderizadas via JavaScript complexo.

### 1. Camada Estática (`httpx`)
Serve como *pre-flight* ultrarrápido para qualquer URL. Faz o download do HTML bruto instantaneamente, permitindo extrair metadados essenciais, tags de paginação estática e imagens declaradas diretamente no código ou no objeto `__NEXT_DATA__` (comum em aplicações Next.js).

### 2. Camada Dinâmica (`Patchright` / Chromium Headless)
Quando a página exige renderização completa ou interação, entra em ação o gestor singleton do browser. Para garantir que nenhum dado fica oculto antes da captura, o sistema executa automaticamente:
- **Aceitação Automática de Cookies**: Injeta e executa heurísticas JavaScript para detetar e clicar em botões de consentimento ("Aceitar todos", "Concordo", "Allow all").
- **Estabilização de DOM Avançada**: Aguarda não apenas por eventos padrão (`domcontentloaded`), mas monitoriza ativamente a contagem de elementos `<img>` e `<a>` no DOM. O crawler só avança quando o número de elementos estabiliza em 6 amostras consecutivas (com intervalos de 400ms).
- **Scroll Incremental Completo**: Simula um utilizador real a fazer scroll suave até ao final da página (em passos calculados de 80% da altura do ecrã) para forçar o carregamento de todas as imagens em *lazy-load*.
- **Expansão de Menus e Acordeões**: Procura ativamente por botões de navegação, menus de hambúrguer, setas de expansão (`[aria-expanded='false']`, `.ant-menu-submenu-title`) e clica neles para revelar links profundos ocultos na UI.
- **Semáforo Global de Abas (`BROWSER_MAX_TABS`)**: Limita estritamente quantas abas do Chromium podem estar abertas em paralelo, prevenindo que um site com dezenas de páginas de paginação trave a máquina por excesso de instâncias.
- **Modo "Fast-Render"**: Em páginas subsequentes de listagem ou detalhe, onde o layout já é conhecido, o sistema aplica esperas encurtadas, aumentando a velocidade geral do rastreio em mais de 60%.

```
[URL Inicial Submetido]
         |
         v
+-------------------------------------------------------------------+
| 1. Pré-Voo Estático (httpx)                                       |
|    - Download HTML Bruto | Extração de Imagens e Metadados        |
+-------------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------------+
| 2. Execução Dinâmica (Patchright Headless)                        |
|    - Aceitar Cookies Automático | Expansão de Menus & Acordeões   |
|    - Scroll Incremental até ao Fim | Aguardar Estabilidade do DOM |
+-------------------------------------------------------------------+
         |
         +---------------------------------+
         | (Se detetada paginação)         | (Links de Detalhe Encontrados)
         v                                 v
+-------------------------------+   +-------------------------------+
| 3. Fan-Out de Paginação       |   | 4. Rastreio de Detalhes       |
|    - Extração XHR/Fetch API   |   |    - Inspeção Profunda        |
|    - Processamento Paralelo   |   |    - Extração de Imagens      |
+-------------------------------+   +-------------------------------+
         |                                 |
         +----------------+----------------+
                          |
                          v [Lista de Imagens Limpas e Normalizadas]
```

### 3. Deteção e Seguimento de Paginação
O rastreador não se limita a raspar a página de entrada. Inspeciona o DOM à procura de:
- Componentes de paginação conhecidos (como Ant Design pagination, paginação Bootstrap, botões numéricos, atributos `rel="next"`).
- **Interceção XHR / Fetch API**: O browser escuta todo o tráfego de rede gerado pela página. Se detetar um endpoint JSON de paginação interna (que devolva metadados como `totalPages`, `total_items`, ou arrays de itens), o crawler reconstrói a estrutura da API e faz o *fetch* de todas as páginas restantes simultaneamente via HTTP assíncrono. Isto elimina a latência e a lentidão de ter de clicar página a página num browser real!

### 4. Filtragem e Limpeza Rigorosa na Fonte
Para evitar sobrecarregar o pipeline de IA com lixo visual, as imagens capturadas passam por um crivo rigoroso antes da análise:
- **Rejeição Heurística de URLs**: Eliminação automática de SVGs, data URIs puros de baixa fidelidade, tiles de mapas interativos (Google Maps, OpenStreetMap, Carto) e caminhos de URL que contenham `/icon`, `/logo`, `/avatar`, `favicon`, `/thumb`, `pixel` ou banners publicitários.
- **Validação de Dimensões (`MIN_IMAGE_WIDTH` / `MIN_IMAGE_HEIGHT`)**: Qualquer imagem com largura inferior a 120px, altura inferior a 80px ou área total inferior a 9.600px² é imediatamente descartada.

---

## 🤖 Pipeline de IA em Duas Fases & Fallbacks

Cada imagem sobrevivente ao rastreio entra no motor de inferência visual, composto por dois modelos distintos da família **Microsoft Table Transformer**. A deteção final exige o consenso de ambas as fases.

```
+----------------------------------------------------------------------------------+
|                              IMAGEM BRUTA CAPTURADA                              |
+----------------------------------------------------------------------------------+
                                         |
                                         v
+----------------------------------------------------------------------------------+
| PHASE 1: S1 — Deteção de Candidatos (table-transformer-detection)                |
| Procura Bounding Boxes de 'table' ou 'table rotated'.                            |
+----------------------------------------------------------------------------------+
               |                                                  |
        (Encontrou Box S1)                                (S1 Falhou / Zero Boxes)
               |                                                  |
               v                                                  v
+---------------------------------------------+   +--------------------------------+
| Validação Geométrica da Box                 |   | FALLBACK GLOBAL                |
| - Área Relativa >= 5%                       |   | Envia imagem inteira para S2.  |
| - Proporção de Aspeto <= 15:1               |   | Exige estrutura forte (>=3C)   |
| - Dimensões Mínimas (120x50px)              |   | e pontuação de qualidade >=80% |
+---------------------------------------------+   +--------------------------------+
               |                                                  |
               v [Recorte da Box com 5px Padding]                 |
               |                                                  |
+--------------+--------------------------------------------------+
|
v
+----------------------------------------------------------------------------------+
| PHASE 2: S2 — Validação Estrutural (table-transformer-structure-recognition)     |
| Conta e mapeia: 'table row', 'table column', 'header'. Valida sobreposição.      |
+----------------------------------------------------------------------------------+
                                         |
               +-------------------------+-------------------------+
               | (Falha Estrutural em Recorte Justo)               | (Grelha Validada)
               v                                                   v
+---------------------------------------------+   +--------------------------------+
| RETRY: Recorte Expandido                    |   | Análise Heurística de Qualidade|
| Expande o recorte por toda a altura da      |   | (Filtragem de Falsos Positivos)|
| imagem para tentar recuperar a tabela.      |   +--------------------------------+
+---------------------------------------------+                    |
                                                                   v
                                                  +--------------------------------+
                                                  | [!] TABELA LEGÍTIMA CONFIRMADA |
                                                  +--------------------------------+
```

### Fase 1: S1 — Deteção de Regiões Candidatas
O modelo `table-transformer-detection` analisa a imagem completa e devolve caixas delimitadoras (*bounding boxes*) com uma pontuação de confiança para regiões candidatas com a etiqueta `table`.
- **Validação Geométrica S1**: A caixa candidata é testada contra regras de viabilidade física. Tem de representar pelo menos 5% da área total da imagem (`TABLE_MIN_AREA_PERCENT`), possuir dimensões mínimas em pixels (120x50px) e não apresentar uma proporção de aspeto bizarra ou extremamente distorcida (acima de 15:1).

### Fase 2: S2 — Reconhecimento e Validação Estrutural
O sistema faz um recorte (*crop*) da região candidata detetada na Fase 1 (aplicando uma margem de segurança de 5px) e envia o recorte para o modelo `table-transformer-structure-recognition`. Este modelo identifica elementos granulares: linhas de tabela (`table row`), colunas de tabela (`table column`) e cabeçalhos (`table column header` / `table projected row header`).
- **Verificação de Grelha**: O sistema exige a confirmação de uma estrutura matricial mínima (pelo menos 2 linhas e 2 colunas). Valida se as caixas das linhas e das colunas se sobrepõem geometricamente para formar uma grelha coesa e garante que a altura média de cada linha é superior a 15px (descartando artefactos visuais finos).

### Mecanismos de Fallback e Auto-Recuperação

Para garantir a máxima taxa de descoberta (*recall*) sem sacrificar a precisão, o sistema incorpora dois poderosos motores de recuperação autónoma:

1. **Auto-Recuperação por Recorte Expandido (*Retry*)**:
   Em layouts web modernos, por vezes o modelo S1 faz um recorte demasiado justo que corta os cabeçalhos ou o rebordo inferior da tabela, levando o modelo estrutural S2 a falhar a contagem de linhas. Quando S2 falha num recorte inicial mas reconhece pelo menos 2 colunas nítidas, o sistema executa automaticamente um *retry*. Faz um novo recorte que mantém a largura detetada mas **expande a altura desde o topo absoluto até ao fundo absoluto da imagem original**. Se o modelo S2 validar a grelha neste recorte expandido (com confiança de repetição ≥ 0.50), a tabela é recuperada com sucesso!

2. **Fallback Global (Quando S1 falha na deteção)**:
   Em certas tabelas web com designs altamente minimalistas, sem linhas de grelha visíveis ou com fundos transparentes, o detetor de candidatos S1 pode falhar e não devolver qualquer *bounding box*. Quando S1 falha completamente (zero candidatos) e a imagem capturada tem dimensões razoáveis (< 800x600px), o backend ativa o modo `[FALLBACK]`. A **imagem inteira** é injetada diretamente na Fase S2 de reconhecimento estrutural. Se o modelo S2 detetar uma grelha forte (pelo menos 3 colunas e várias linhas) com pontuações de confiança elevadas (≥ 0.80 se existirem cabeçalhos ou ≥ 0.85 sem cabeçalhos), a imagem inteira é validada e marcada como contendo uma tabela legítima!

### Filtragem Heurística Anti-Falsos-Positivos (Regras de Rejeição)

O maior perigo no uso de modelos de visão visual genéricos é a classificação acidental de elementos estruturados comuns em websites como tabelas. O **VF-Tabelas** integra um conjunto exaustivo de filtros estruturais avançados para eliminar falsos positivos:

- 🚫 **Layout Esparso (`[SPARSE-REJECT]`)**: Rejeita grelhas com poucas linhas (≤ 5), muitas colunas (≥ 4), com um cabeçalho ou nenhum, e pontuação S1 moderada (< 0.80). Isto elimina falsos positivos desencadeados por legendas numeradas de infográficos, barras de progresso ou pequenos calendários de rodapé.
- 🚫 **Flyers de Eventos e Cartazes (`[FLYER-REJECT]`)**: Rejeita imagens com grelhas densas (≥ 4 colunas e ≥ 8 linhas) mas pontuação S1 baixa (< 0.70) e ausência de cabeçalhos de tabela. Desencadeado frequentemente por cartazes de festivais ou folhetos promocionais organizados em matriz.
- 🚫 **Bloco de Título Técnico (`[TITLE-BLOCK-REJECT]`)**: Rejeita estruturas estreitas de 2 colunas com muitas linhas (≥ 10) e confiança S1 baixa (< 0.65). Ideal para filtrar caixas de especificações técnicas ou legendas de engenharia presentes em capturas de ecrã de documentos PDF ou desenhos de arquitetura.
- 🚫 **Screenshot de UI em Banners Panorâmicos (`[BANNER-REJECT]`)**: Quando a imagem capturada é extremamente larga (proporção > 1.8:1) e a região classificada como tabela ocupa uma pequena faixa lateral (< 45% da largura da imagem), a deteção é rejeitada. Isto impede que screenshots de aplicações ou de menus de websites inseridos num banner promocional sejam classificados como tabelas independentes.
- 🚫 **Listas Equilibradas e Grelhas de Cards (`[LIST-REJECT]`, `[DENSITY-REJECT]`)**: Em layouts de 2 colunas (como grelhas de produtos em e-commerce ou listas de notícias), o sistema verifica a assimetria das larguras das colunas e a rácio de cabeçalhos. Se todas as linhas detetadas forem classificadas como cabeçalhos (típico de uma lista de cartões com títulos), ou se a assimetria geométrica for extrema (< 0.35), a estrutura é rejeitada como elemento de layout web.
- ⚖️ **Chão Global de Qualidade Média (`piso_avg_global = 0.75`)**: A média aritmética das pontuações de confiança de todas as linhas e colunas detetadas tem de ser superior a 75%. Qualquer elemento difuso ou mal estruturado que passe no limiar mínimo de contagem é retido por este controlo rigoroso de qualidade.

---

## 🛠️ Instalação e Arranque Rápido

### Pré-requisitos
- **Docker** (versão 24.0 ou superior)
- **Docker Compose** (versão 2.20 ou superior)

### Passo 1: Clonar o Repositório
O projeto utiliza uma estrutura monorepo consolidada contendo tanto o backend Python como o frontend Next.js na raiz.

```bash
git clone https://github.com/SEU_UTILIZADOR/vf-tabelas.git
cd vf-tabelas
```

### Passo 2: Configurar Parâmetros no Docker Compose
O projeto não utiliza ficheiros `.env` externos nem requer ficheiros de configuração adicionais. Todas as variáveis e parâmetros do sistema estão embutidos e devidamente documentados no ficheiro `docker-compose.yml`.

Abra o ficheiro `docker-compose.yml` em qualquer editor de texto e ajuste os valores na secção `environment` do serviço `backend` conforme as capacidades da sua máquina (as configurações padrão já se encontram otimizadas para servidores com apenas 1GB de RAM).

### Passo 3: Iniciar a Aplicação
Para colocar todos os serviços em execução em background:

```bash
docker compose up -d
```

> ⚠️ **Nota de Primeiro Arranque**: O primeiro arranque demora entre 5 a 10 minutos. Durante a fase inicial de build, o Docker construirá as imagens do backend e do frontend, efetuando o download automático das dependências e dos pesos dos modelos PyTorch.

Para acompanhar os logs do sistema em tempo real:
```bash
docker compose logs -f
```

O painel de controlo (*dashboard*) estará imediatamente acessível no browser em `http://localhost:3001` (ou na porta definida na secção `ports` do frontend).

---

## ⚙️ Referência Completa de Configuração (`docker-compose.yml`)

O ficheiro `docker-compose.yml` centraliza o controlo total sobre o comportamento do motor de crawling, os limites do browser, os parâmetros de IA e o sistema de filas. Abaixo encontra-se a explicação exaustiva de todas as chaves configuráveis no serviço `backend`:

### Configurações de Servidor e Valores por Omissão de Rastreio
| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `BACKEND_PORT` | `4000` | Porta interna na qual o servidor FastAPI escuta pedidos. |
| `ALLOWED_ORIGINS` | `*` | Origens permitidas no middleware CORS (separadas por vírgula para múltiplos domínios ou `*` para público). |
| `MAX_PAGES` | `50` | Valor por omissão (fallback) de páginas a visitar caso a requisição à API não envie a opção `max_paginas`. (No modo multi-URL, o limite é gerido por categoria). |
| `MAX_DEPTH` | `3` | Valor por omissão de profundidade máxima de navegação caso não seja enviado no pedido. |
| `PAGE_TIMEOUT_MS` | `30000` | Tempo limite (em milissegundos) de fallback para o carregamento e estabilização de cada página web. |
| `JOB_TIMEOUT_S` | `1200` | Tempo máximo de vida (em segundos) de fallback alocado para a tarefa completa. |

### Concorrência e Paralelismo
| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `CRAWLER_CONCURRENCY` | `4` | Número de workers simultâneos a extrair páginas estáticas ou APIs em paralelo. |
| `BROWSER_CONCURRENCY` | `3` | Limite do semáforo global de abas do Chromium ativas em simultâneo no gestor singleton. |
| `ANALYSIS_CONCURRENCY`| `2` | Número de imagens enviadas simultaneamente para inferência no modelo PyTorch. (Para 1GB RAM, manter em 1 ou 2). |
| `IMAGE_HTTP_RETRIES` | `2` | Número de novas tentativas automáticas ao falhar o download de uma imagem (ex: erros HTTP 429 ou 50x). |

### Filtros na Fonte e Limiares de IA
| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `MIN_IMAGE_WIDTH` | `120` | Largura mínima em pixels exigida para que uma imagem seja retida para análise visual. |
| `MIN_IMAGE_HEIGHT` | `80` | Altura mínima em pixels exigida para retenção da imagem. |
| `MIN_IMAGE_AREA` | `9600` | Área mínima total (largura × altura) em pixels quadrados exigida. |
| `TABLE_MIN_CONFIDENCE`| `0.5` | Limiar mínimo de pontuação de confiança (0.0 a 1.0) exigido pelo modelo de deteção S1. |
| `STRUCTURE_MIN_ROWS` | `2` | Número mínimo absoluto de linhas de grelha exigidas pela validação estrutural S2. |
| `STRUCTURE_MIN_COLS` | `2` | Número mínimo absoluto de colunas de grelha exigidas pela validação estrutural S2. |

### Fila Global e Gestão Ativa de Memória RAM
| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `MAX_CONCURRENT_TASKS`| `1` | Número máximo de tarefas pesadas inteiras a executar em simultâneo. (1 = serialização estrita para 1GB RAM). |
| `MAX_QUEUE_SIZE` | `0` | Limite máximo de tarefas em espera na fila global (0 = ilimitado). |
| `CLEANUP_RESULTS_AFTER_S`| `300` | Tempo em segundos após a conclusão de uma tarefa para purgar os resultados pesados da RAM (mantém metadados). |
| `MAX_RESULTS_IN_MEMORY`| `500` | Limite de resultados guardados em memória antes de ativar descarregamentos agressivos para disco. |
| `RESULTS_FLUSH_INTERVAL`| `100` | Frequência (em número de novos itens encontrados) com que o sistema escreve resultados parciais para o disco. |
| `PRELOAD_MODELS` | `false` | Se `true`, carrega a IA na RAM no arranque do servidor. Se `false`, carrega apenas no primeiro uso (*lazy load*). |
| `UNLOAD_MODELS_AFTER_S`| `0` | Descarrega os modelos da RAM após N segundos ociosos sem inferências visuais (0 = desativado via timer; o gestor ativo gere por estado). |

### Otimizações do Motor de Browser (Chromium)
| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `BROWSER_SINGLE_PROCESS`| `false` | Se `true`, executa o Chromium com `--single-process` (poupa ~50MB RAM, mas causa instabilidade no Windows). |
| `BROWSER_MAX_TABS` | `2` | Configuração redundante de segurança para o teto máximo de abas do browser. |
| `BROWSER_IDLE_TIMEOUT_S`| `30` | Segundos ociosos entre tarefas após os quais o processo do Chromium é inteiramente terminado para poupar recursos. |
| `BROWSER_ARGS_EXTRA` | `` | Argumentos adicionais avançados de linha de comandos a passar ao binário do Chromium (separados por vírgula). |

### Frontend (Configurado em `docker-compose.yml`)
No serviço `frontend`, os seguintes parâmetros determinam o acesso:
- **Porta**: Mapeado na secção `ports` como `3001:3000` (acessível via `http://localhost:3001`).
- **`NEXT_PUBLIC_API_URL`**: Definido nos `args` de build como `http://localhost:4000` (aponta para a API do backend).

---

## 📂 Estrutura do Projeto

A organização de diretórios do repositório reflete uma separação limpa e modular de responsabilidades:

```
VF-tabelas/
├── docker-compose.yml           # Orquestração única de serviços (Backend + Frontend + Volumes)
├── README.md                    # Documentação técnica e arquitetura do sistema
│
├── backend_py/                  # Backend em Python 3.11+ (FastAPI)
│   ├── Dockerfile               # Configuração de container otimizada para CPU e baixa memória
│   ├── requirements.txt         # Lista exaustiva de dependências (PyTorch, Patchright, FastAPI)
│   ├── config.py                # Leitura de variáveis do sistema e logging
│   ├── main.py                  # Endpoints da API, rotas HTTP/SSE e gestão do ciclo de vida
│   ├── tarefas.py               # Fila Global FIFO, serialização, persistência em disco e SSE
│   ├── detetor.py               # Motor IA: Table Transformer, validação geométrica e gestor RAM
│   └── extrator/                # Módulo de Crawler e Scraping
│       ├── crawler.py           # Orquestrador de rastreio, lógica de fan-out e gestão de estado
│       ├── renderizador_browser.py # Gestor Singleton de Chromium, injeção JS e controlo de abas
│       ├── paginacao.py         # Analisador de padrões DOM e intercetor de APIs XHR/Fetch
│       ├── imagens.py           # Extrator de imagens, parsing de metadados e validação
│       └── ...                  # Utilitários auxiliares de URL e tipagem
│
└── frontend/                    # Aplicação Frontend em React 18 / Next.js (App Router)
    ├── Dockerfile               # Build multi-stage otimizado para produção (standalone)
    ├── package.json             # Dependências de interface e scripts de compilação
    ├── app/                     # Páginas da aplicação (Dashboard principal, Detalhe de Tarefa)
    ├── components/              # Componentes visuais modulares (Tabelas de Resultados, Badges, Modais)
    ├── lib/                     # Clientes HTTP, tipagem TypeScript e utilitários
    └── styles/                  # Sistema de estilização global e design tokens
```

---

## 🌐 Endpoints da API REST e Eventos (SSE)

O backend disponibiliza uma API limpa e documentada para integração com sistemas externos.

### 1. Criar e Submeter Nova Tarefa
`POST /api/tarefas`
Submete um URL único ou uma lista de URLs para rastreio e análise. Retorna imediatamente a identificação da tarefa e a sua posição na fila quando utilizado no modo assíncrono.

**Corpo do Pedido (JSON)**:
```json
{
  "url": "https://exemplo.com/tabelas",
  "sse": true,
  "opcoes": {
    "max_paginas": 20,
    "max_profundidade": 2,
    "seguir_paginacao": true
  }
}
```

**Resposta de Sucesso (201 Created)**:
```json
{
  "id": "c39b2b52-3d8a-49bf-a8c9-95e26715f401",
  "url_alvo": "https://exemplo.com/tabelas",
  "estado": "na_fila",
  "criado_em": "2026-05-18T10:15:30.123456Z",
  "posicao_fila": 1
}
```

### 2. Fluxo de Eventos em Tempo Real (Server-Sent Events)
`GET /api/tarefas/{id_tarefa}/eventos`
Abre um canal de *streaming* contínuo (SSE) que emite atualizações instantâneas à medida que o rastreador descobre novas páginas ou a IA deteta tabelas.

**Exemplo de Evento Recebido no Cliente**:
```http
data: {
  "id": "c39b2b52-3d8a-49bf-a8c9-95e26715f401",
  "estado": "em_execucao",
  "progresso": {
    "paginas_descobertas": 12,
    "paginas_processadas": 8,
    "imagens_encontradas": 45,
    "imagens_analisadas": 20,
    "tabelas_detetadas": 3
  },
  "url_atual": "https://exemplo.com/tabelas?page=2",
  "esta_a_correr": true
}
```

### 3. Deteção Direta em Imagem Avulsa (Síncrono)
`POST /api/modelo/detetar-tabela`
Permite enviar um ficheiro de imagem diretamente para o modelo de IA e receber um veredicto binário imediato.

**Pedido**: Envio de formulário *multipart/form-data* contendo o campo `ficheiro` com a imagem.

**Resposta (200 OK)**:
```json
{
  "tem_tabela": true
}
```

### 4. Paginação em Lote de Múltiplos URLs
`POST /api/paginacao-multurls`
Especializado para o modo multi-URL onde cada link da lista é tratado como um ponto de entrada para descoberta paralela de listagens.

**Corpo do Pedido**:
```json
{
  "urls": [
    "https://loja.com/categoria1",
    "https://loja.com/categoria2"
  ],
  "sse": true
}
```

### 5. Monitorização e Saúde do Sistema
- `GET /saude` — Retorna `"ok"` para sondas de *liveness* do Docker ou Kubernetes.
- `GET /api/sistema/fila` — Retorna estatísticas detalhadas sobre as tarefas ativas, em espera e a concorrência configurada.
- `GET /api/sistema/memoria` — Fornece o consumo atual de memória RAM em megabytes (RSS e VMS), bem como o estado de carregamento dos modelos de IA.

---

## 📄 Licença e Manutenção

O projeto **VF-Tabelas** é distribuído sob licença de código aberto. Sinta-se à vontade para efetuar *fork*, otimizar algoritmos de extração ou treinar modelos fine-tuned com base nas deteções realizadas pelo sistema. Em caso de dúvidas ou necessidade de suporte em ambientes empresariais, consulte os ficheiros de logs gerados no volume Docker de persistência (`/data`).
