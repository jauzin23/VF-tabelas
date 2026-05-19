# VF-Tabelas - Deteção Automática de Tabelas de Dados em Websites

Esta é uma ferramenta para dar crawl a websites, extrair as suas imagens e analisar cada uma delas através do modelo IA (**YOLO11**). O objetivo principal é identificar imagens ou capturas de ecrã que contêm tabelas de dados.

---

## Principais Capacidades

- **Crawl**: Implementa automação de browsers headless (`Patchright`/`Playwright` + Chromium) para lidar com sites dinâmicos.
- **Descoberta de Paginação**: Identifica padrões de paginação no DOM para extrair catálogos inteiros.
- **Análise de IA**: Utiliza inferência baseada em YOLO11 para detetar tabelas.
- **Otimização de Memória**: Implementa uma Fila, descarregamento automático de modelos de IA e desativação de recursos ociosos para garantir estabilidade.
- **Configuração Centralizada**: Toda a configuração do sistema está no ficheiro `docker-compose.yml`.
- **Feedback em Tempo Real via SSE**: Transmite cada progresso, página descoberta, imagem encontrada e resultado de análise instantaneamente para o frontend através de _Server-Sent Events_ (opcional).

---

## Arquitetura do Sistema e Otimização de Recursos

### 1. Fila

Quando múltiplas tarefa são submetidas, as tarefas entram numa **Fila**. Configurado com `MAX_CONCURRENT_TASKS=1`, apenas uma tarefa é executada de cada vez, garantindo que a largura de banda, a CPU e a RAM estão dedicadas ao trabalho ativo.

### 2. Gestão Dinâmica de RAM

Apesar da eficiência do YOLO11, a coexistência com o Chromium num ambiente limitado exige otimizações:

- **_Lazy Loading_**: O modelo só é carregado para a RAM no momento em que a primeira imagem precisa de ser analisada.
- **Descarregamento Proativo**: Se o crawler estiver a navegar em páginas web e a extrair DOM, a IA é totalmente removida da memória, libertando recursos para o browser. A IA só regressa à RAM quando a extração termina e é iniciada a análise.

---

## Crawler e Extração de Imagens

O crawler utiliza uma estratégia avançada para garantir precisão em páginas renderizadas via JavaScript. Para garantir que nenhum dado fica oculto antes da captura, o sistema executa automaticamente:

- **Aceitação Automática de Cookies**: Injeta e executa JavaScript para detetar e clicar em botões de consentimento ("Aceitar todos", "Concordo", "Allow all").
- **Estabilização de DOM**: Aguarda não apenas por eventos padrão (`domcontentloaded`), mas monitoriza a contagem de elementos `<img>` e `<a>` no DOM. O crawler só avança quando o número de elementos estabiliza.
- **Scroll Incremental Completo**: Simula um utilizador real a fazer scroll até ao final da página para forçar o carregamento de todas as imagens.
- **Limite de Abas Abertas (`BROWSER_CONCURRENCY`)**: Limita o número de abas do Chromium que podem estar abertas em simultâneo.

Para evitar sobrecarregar a IA com lixo visual, as imagens capturadas passam por uma filtração inicial:

- **Rejeição de URLs**: Eliminação automática de SVGs, tiles de mapas interativos e caminhos de URL que contenham `/icon`, `/logo`, `/avatar`, `favicon`, `/thumb`, `pixel`.
- **Validação de Dimensões (`MIN_IMAGE_WIDTH` / `MIN_IMAGE_HEIGHT`)**: Qualquer imagem muito pequena é descartada.

---

## Análise de IA (YOLO11)

A análise das imagens é efetuada num único passo utilizando o modelo YOLO11 otimizado:

- O modelo redimensiona internamente as imagens consoante a configuração `YOLO_IMGSZ` (padrão: 1024px) para garantir que consegue captar a estrutura global da imagem.
- Realiza a inferência devolvendo a precisão (confiança) com que encontrou uma tabela.
- Se a confiança for igual ou superior a `TABLE_MIN_CONFIDENCE`, o sistema aceita a imagem como uma "Tabela Detetada".

---

## Instalação

### Passo 1: Clonar o Repositório

O projeto utiliza uma estrutura monorepo com o backend e o frontend.

```bash
git clone https://github.com/jauzin23/VF-tabelas.git
cd VF-tabelas
```

### Passo 2: Configurar Parâmetros no Docker Compose

Abra o ficheiro `docker-compose.yml` e ajuste os valores na secção `environment` (se necessário).

### Passo 3: Iniciar a Aplicação

Para colocar todos os serviços em execução em background:

```bash
docker compose up -d
```

---

## Configuração do Sistema

### Segurança e Autenticação (API Keys)

O acesso a todos os endpoints protegidos (`/api/*`) exige a apresentação de uma chave de API válida.
| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `API_KEYS` | (Obrigatório) | Lista de chaves válidas autorizadas, separadas por vírgula (ex: `chave1,chave2`). |

#### Como Gerar Chaves Seguras

Para criar chaves de API fortes, pode utilizar qualquer um dos seguintes métodos:

- **Via Python**:
  ```bash
  python -c "import secrets; print('sk_vf_' + secrets.token_hex(28))"
  ```
- **Via Websites de Geradores Seguros**:
  Pode gerar chaves aleatórias em websites como o [Bitwarden Password Generator](https://bitwarden.com/password-generator/), [1Password Generator](https://1password.com/password-generator/) ou [Random.org](https://www.random.org/strings/).

#### Como Enviar a Chave nas Requisições

- **Múltiplas Chaves**: A variável `API_KEYS` do backend aceita uma lista de chaves separadas por vírgula (ex: `chave_front, chave_extra`). Defina uma chave exclusivamente para o frontend (`NEXT_PUBLIC_API_KEY`).
- **Usos Externos**: Envie a chave no header `X-API-Key: <sua_chave>` ou `Authorization: Bearer <sua_chave>`.
- **Ligação a Eventos em Tempo Real (SSE)**: Envie a chave na query string: `?api_key=<sua_chave>`.

### Configurações de Servidor

| Variável          | Padrão  | Descrição                                                                                                                                                                              |
| :---------------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_PORT`    | `4000`  | Porta **interna** do backend (Fallback no código: `4000`).                                                                                                                             |
| `DATA_PATH`       | `/data` | Diretório onde os resultados das tarefas, ficheiros e logs são guardados (Fallback no código: `./data`).                                                                               |
| `ALLOWED_ORIGINS` | `*`     | Origens permitidas no middleware CORS (separadas por vírgula para múltiplos domínios ou `*` para público).                                                                             |
| `MAX_PAGES`       | `50`    | Valor fallback do máximo de páginas a visitar caso a requisição à API não envie a opção `max_paginas` (Fallback no código: `0` [ilimitado]. No modo multi-URL, este valor é ignorado). |
| `MAX_DEPTH`       | `3`     | Valor fallback da profundidade máxima de navegação caso não seja enviado no pedido (Fallback no código: `2`. No modo multi-URL, este valor é ignorado).                                |
| `PAGE_TIMEOUT_MS` | `30000` | Tempo limite em milissegundos para o carregamento de cada página web (Fallback no código: `30000`).                                                                                    |

### Configurações de Otimização

| Variável               | Padrão | Descrição                                                                                                             |
| :--------------------- | :----- | :-------------------------------------------------------------------------------------------------------------------- |
| `CRAWLER_CONCURRENCY`  | `4`    | Concorrência máxima para pedidos HTTP paralelos no crawler (Fallback no código: dinâmico, baseado no número de CPUs). |
| `BROWSER_CONCURRENCY`  | `3`    | Limite global de abas do Chromium ativas em simultâneo (Fallback no código: `3` se não configurado ou `<= 0`).        |
| `ANALYSIS_CONCURRENCY` | `1`    | Número de imagens analisadas pela IA simultaneamente (Padrão no código: `2`).                                         |
| `IMAGE_HTTP_RETRIES`   | `2`    | Número de novas tentativas de download ao falhar o acesso de uma imagem.                                              |

### Filtros e limites de IA

| Variável               | Padrão | Descrição                                                                                             |
| :--------------------- | :----- | :---------------------------------------------------------------------------------------------------- |
| `MIN_IMAGE_WIDTH`      | `120`  | Largura mínima exigida antes de submeter a imagem à IA.                                               |
| `MIN_IMAGE_HEIGHT`     | `80`   | Altura mínima exigida antes de submeter a imagem à IA.                                                |
| `MIN_IMAGE_AREA`       | `9600` | Área mínima total exigida antes de submeter a imagem à IA.                                            |
| `TABLE_MIN_CONFIDENCE` | `0.5`  | Mínimo de pontuação de confiança (0.0 a 1.0) exigido pelo modelo YOLO11 (Fallback no código: `0.35`). |
| `YOLO_IMGSZ`           | `1024` | Tamanho de imagem (em pixels) para o qual o modelo YOLO fará o resize interno durante a inferência.   |

### Fila Global e Gestão de Memória RAM

| Variável                  | Padrão | Descrição                                                                                  |
| :------------------------ | :----- | :----------------------------------------------------------------------------------------- |
| `MAX_CONCURRENT_TASKS`    | `1`    | Número máximo de tarefas a executar em simultâneo.                                         |
| `MAX_QUEUE_SIZE`          | `0`    | Limite máximo de tarefas em espera na fila global (0 = ilimitado).                         |
| `CLEANUP_RESULTS_AFTER_S` | `300`  | Tempo em segundos após a conclusão de uma tarefa para limpar os resultados pesados da RAM. |
| `RESULTS_FLUSH_INTERVAL`  | `100`  | Frequência com que o sistema escreve resultados parciais para o disco.                     |

### Otimizações do Browser (Chromium)

| Variável                 | Padrão  | Descrição                                                                                                                                                |
| :----------------------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BROWSER_HEADLESS`       | `true`  | Se `true` (padrão), executa o browser sem interface gráfica. Pode ser definido como `false` localmente em ambiente de desenvolvimento para debug visual. |
| `BROWSER_SINGLE_PROCESS` | `false` | Se `true`, executa o Chromium com `--single-process` (poupa RAM mas desativado em Windows por estabilidade).                                             |
| `BROWSER_ARGS_EXTRA`     | ``      | Argumentos adicionais a passar ao Chromium (separados por vírgula).                                                                                      |

### Controlo de Threads CPU

No `docker-compose.yml`, as seguintes variáveis de ambiente são configuradas com `"1"` para controlar o uso do processador pelo PyTorch/OpenCV e evitar que a inferência da IA monopolize todos os cores da CPU do servidor:

- `OMP_NUM_THREADS`
- `MKL_NUM_THREADS`
- `OPENBLAS_NUM_THREADS`

### Frontend (Configurado em `docker-compose.yml`)

No serviço `frontend`, os seguintes parâmetros determinam o acesso:

- **Porta**: Mapeado na secção `ports` como `3001:3000`.
- **`NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_API_KEY`**: Estas duas variáveis necessitam de ser definidas em dois locais distintos do `docker-compose.yml` devido à arquitetura do Next.js:
  1. Em `build.args`: Permite que o Next.js embute estaticamente os valores no JavaScript gerado para os _Client Components_ (executados no browser do utilizador final) durante a fase de build (`docker compose build`).
  2. Em `environment`: Disponibiliza as variáveis em tempo real para que os _Server Components_ e rotas de API internas as possam ler dinamicamente em runtime.

---

## Endpoints da API

O backend disponibiliza uma API REST robusta para integração.

### 1. Saúde da API

`GET /saude`
Endpoint público (sem necessidade de API Key) para validação do estado do servidor.

- **Resposta (200 OK)**: `"ok"`

### 2. Criar e Submeter Nova Tarefa

`POST /api/tarefas`
Submete um URL para rastreio e análise.

- **Corpo do Pedido (JSON)**:
  ```json
  {
    "url": "https://www.mcr.pt/noticias",
    "sse": false,
    "opcoes": {
      "max_paginas": 20,
      "max_profundidade": 2,
      "seguir_paginacao": true
    }
  }
  ```

### 3. Listar Todas as Tarefas

`GET /api/tarefas` - Retorna todas as tarefas.

### 4. Obter Detalhes da Tarefa

`GET /api/tarefas/{id_tarefa}` - Obtém o progresso atual, metadados e os resultados da tarefa.

### 5. Eliminar Tarefa

`DELETE /api/tarefas/{id_tarefa}`
Cancela a tarefa (se estiver na fila) e apaga todos os ficheiros de resultados e imagens do disco.

### 6. Streaming de Eventos em Tempo Real (SSE)

`GET /api/tarefas/{id_tarefa}/eventos` - Canal SSE para acompanhar o progresso em tempo real.

- **Parâmetro**: Requer `?api_key=<chave>` na query string.

### 7. Imagens Detetadas (Formato Compacto)

`GET /api/tarefas/{id_tarefa}/imagens`
Retorna uma versão reduzida dos resultados contendo apenas os dados necessários de deteção da tarefa.

### 8. Deteção Direta

`POST /api/modelo/detetar-tabela`
Permite enviar um ficheiro de imagem diretamente para o modelo de IA e receber um booleano da análise.

- **Pedido**: Envio de formulário _multipart/form-data_ contendo o campo `ficheiro` com a imagem.
- **Resposta (200 OK)**:
  ```json
  {
    "tem_tabela": true
  }
  ```

### 9. Múltiplos URLs

`POST /api/paginacao-multurls`
Submete múltiplos URLs para processamento.

- **Corpo do Pedido (JSON)**:
  ```json
  {
    "urls": ["https://loja.com/categoria1", "https://loja.com/categoria2"],
    "sse": false
  }
  ```

### 10. Estado da Fila Global

`GET /api/sistema/fila` - Retorna o estado atual do agendamento.

---

## Guia de Utilização: Quando usar cada endpoint?

Para facilitar o desenvolvimento e integração com o sistema, utilize o seguinte guia rápido para escolher o endpoint adequado ao seu caso de uso:

### A. Rastreio Completo e Dinâmico de um Site (com Painel Web/UI)

- **Endpoint principal**: `POST /api/tarefas` com `"sse": true`.
- **Fluxo recomendado**:
  1. O frontend submete o URL do site a rastrear. O backend responde imediatamente com o `id` da tarefa e a sua `posicao_fila`.
  2. O frontend estabelece uma ligação com `GET /api/tarefas/{id}/eventos?api_key=<chave>` via `EventSource` (Server-Sent Events) para monitorizar o progresso em tempo real (páginas descobertas, imagens processadas, status da fila e tabelas encontradas).
  3. No final da tarefa, a ligação SSE é encerrada e os resultados finais podem ser recuperados ou atualizados dinamicamente a partir de `GET /api/tarefas/{id}`.

### B. Integração Síncrona Simples (Scripts CLI / Cronjobs)

- **Endpoint principal**: `POST /api/tarefas` com `"sse": false`.
- **Fluxo recomendado**:
  - Um script de automação deseja obter tabelas de um site sem monitorizar o progresso intermédio. Ao enviar `"sse": false`, a requisição HTTP bloqueia e aguarda a execução completa do crawler e do modelo IA. A resposta HTTP final conterá diretamente a estrutura completa da tarefa concluída com os resultados.

### C. Rastreio de Múltiplos URLs Específicos (Filtro de Ruído Visual)

- **Endpoint principal**: `POST /api/paginacao-multurls` (com `"sse": true` ou `false`).
- **Fluxo recomendado**:
  - Indicado quando já possui uma lista de URLs específicos (ex: páginas de catálogo pré-compiladas) e quer evitar o processamento de imagens repetitivas que se encontram em áreas comuns do site. Este endpoint força a ativação do parâmetro `ignorar_nav_footer`, instruindo o motor a ignorar qualquer imagem localizada dentro das tags `<nav>`, `<aside>`, `<header>` ou `<footer>` do DOM de cada página.

### D. Classificação Direta de Ficheiros Locais (sem Navegação Web)

- **Endpoint principal**: `POST /api/modelo/detetar-tabela`.
- **Fluxo recomendado**:
  - Se a sua aplicação já possui uma imagem localmente (ex: screenshot tirado no telemóvel, PDF renderizado localmente) e apenas necessita de saber se a mesma contém tabelas antes de prosseguir, envie a imagem em formato _multipart/form-data_. A inferência é executada de forma imediata na RAM, devolvendo `{"tem_tabela": true/false}` em milissegundos sem acionar o crawler.

### E. Monitorização e Gestão de Recursos

- **Endpoints principais**: `GET /saude`, `GET /api/sistema/fila`.
- **Fluxo recomendado**:
  - **Orquestração de Contentores**: Utilize `/saude` para as sondas de liveness/readiness do Docker/Kubernetes.
  - **Gestão de Filas**: Utilize `/api/sistema/fila` para obter métricas de concorrência ou detetar bloqueios na fila FIFO.
