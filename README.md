# VF-Tabelas - Deteção Automática de Tabelas de Dados em Websites

O **VF-Tabelas** é uma ferramenta para dar crawl a websites, extrair imagens e analisar visualmente cada elemento através de modelos IA (**YOLO11 da Ultralytics**). O seu objetivo principal é identificar imagens ou capturas de ecrã que contêm tabelas de dados.

---

## Principais Capacidades

- **Crawl Avançado**: Implementa automação de browsers headless (`Patchright`/`Playwright` + Chromium) para lidar com sites dinâmicos.
- **Descoberta Inteligente de Paginação**: Identifica automaticamente padrões de paginação no DOM para extrair catálogos inteiros em paralelo.
- **Análise de IA com YOLO11**: Utiliza inferência direta baseada em YOLO11 para detetar tabelas completas de forma rápida e eficiente.
- **Otimização de Memória**: Implementa uma Fila Global, descarregamento automático de modelos de IA e desativação de recursos ociosos para garantir estabilidade.
- **Configuração Centralizada**: Toda a configuração do sistema está no ficheiro `docker-compose.yml`.
- **Feedback em Tempo Real via SSE**: Transmite cada progresso, página descoberta, imagem encontrada e resultado de análise instantaneamente para o frontend através de _Server-Sent Events_.

---

## Arquitetura do Sistema e Otimização de Recursos

### 1. Fila Global

Quando múltiplas tarefa são submetidas (`POST /api/tarefas` ou `POST /api/paginacao-multurls`), as tarefas entram numa **Fila Global**. Configurado com `MAX_CONCURRENT_TASKS=1`, apenas uma tarefa é executada de cada vez, garantindo que a largura de banda, a CPU e a RAM estão dedicadas ao trabalho ativo.

### 2. Gestão Dinâmica de RAM

Apesar da eficiência do YOLO11, a coexistência com o Chromium num ambiente limitado exige otimizações rigorosas:

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

### Configurações de Servidor

| Variável          | Padrão  | Descrição                                                                                                                                          |
| :---------------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_PORT`    | `4000`  | Porta **interna** do backend.                                                                                                                      |
| `ALLOWED_ORIGINS` | `*`     | Origens permitidas no middleware CORS (separadas por vírgula para múltiplos domínios ou `*` para público).                                         |
| `MAX_PAGES`       | `50`    | Valor fallback do máximo de páginas a visitar caso a requisição à API não envie a opção `max_paginas`. (No modo multi-URL, este valor é ignorado). |
| `MAX_DEPTH`       | `3`     | Valor fallback da profundidade máxima de navegação caso não seja enviado no pedido (No modo multi-URL, este valor é ignorado).                     |
| `PAGE_TIMEOUT_MS` | `30000` | Tempo limite para o carregamento de cada página web.                                                                                               |

### Configurações de Otimização

| Variável               | Padrão | Descrição                                                    |
| :--------------------- | :----- | :----------------------------------------------------------- |
| `BROWSER_CONCURRENCY`  | `3`    | Limite global de abas do Chromium ativas em simultâneo.      |
| `ANALYSIS_CONCURRENCY` | `2`    | Número de imagens Analisadas simultaneamente.                |
| `IMAGE_HTTP_RETRIES`   | `2`    | Número de novas tentativas ao falhar o acesso de uma imagem. |

### Filtros e limites de IA

| Variável               | Padrão | Descrição                                                                                     |
| :--------------------- | :----- | :-------------------------------------------------------------------------------------------- |
| `MIN_IMAGE_WIDTH`      | `120`  | Largura mínima exigida antes de submeter a imagem à IA.                                       |
| `MIN_IMAGE_HEIGHT`     | `80`   | Altura mínima exigida antes de submeter a imagem à IA.                                        |
| `MIN_IMAGE_AREA`       | `9600` | Área mínima total exigida antes de submeter a imagem à IA.                                    |
| `TABLE_MIN_CONFIDENCE` | `0.5`  | Mínimo de pontuação de confiança (0.0 a 1.0) exigido pelo modelo YOLO11.                      |
| `YOLO_IMGSZ`           | `1024` | Tamanho de imagem (em pixels) para o qual o modelo YOLO fará o resize interno durante a inferência. |

### Fila Global e Gestão de Memória RAM

| Variável                  | Padrão | Descrição                                                                                  |
| :------------------------ | :----- | :----------------------------------------------------------------------------------------- |
| `MAX_CONCURRENT_TASKS`    | `1`    | Número máximo de tarefas a executar em simultâneo.                                         |
| `MAX_QUEUE_SIZE`          | `0`    | Limite máximo de tarefas em espera na fila global (0 = ilimitado).                         |
| `CLEANUP_RESULTS_AFTER_S` | `300`  | Tempo em segundos após a conclusão de uma tarefa para limpar os resultados pesados da RAM. |
| `RESULTS_FLUSH_INTERVAL`  | `100`  | Frequência com que o sistema escreve resultados parciais para o disco.                     |

### Otimizações do Browser (Chromium)

| Variável                 | Padrão  | Descrição                                                           |
| :----------------------- | :------ | :------------------------------------------------------------------ |
| `BROWSER_SINGLE_PROCESS` | `false` | Se `true`, executa o Chromium com `--single-process`.               |
| `BROWSER_ARGS_EXTRA`     | ``      | Argumentos adicionais a passar ao Chromium (separados por vírgula). |

### Frontend (Configurado em `docker-compose.yml`)

No serviço `frontend`, os seguintes parâmetros determinam o acesso:

- **Porta**: Mapeado na secção `ports` como `3001:3000`.
- **`NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_API_KEY`**: Estas duas variáveis necessitam de ser definidas em dois locais distintos do `docker-compose.yml` devido à arquitetura do Next.js:
  1. Em `build.args`: Permite que o Next.js embute estaticamente os valores no JavaScript gerado para os _Client Components_ (executados no browser do utilizador final) durante a fase de build (`docker compose build`).
  2. Em `environment`: Disponibiliza as variáveis em tempo real para que os _Server Components_ e rotas de API internas as possam ler dinamicamente em runtime.

---

## Endpoints da API

O backend disponibiliza uma API pronta para integração com outros sistemas.

### 1. Criar e Submeter Nova Tarefa

`POST /api/tarefas`
Submete um URL para rastreio e análise.

**Corpo do Pedido (JSON)**:

```json
{
  "url": "https://www.mcr.pt/avisos",
  "sse": false,
  "opcoes": {
    "max_paginas": 20,
    "max_profundidade": 2,
    "seguir_paginacao": true
  }
}
```

### 2. Deteção Direta

`POST /api/modelo/detetar-tabela`
Permite enviar um ficheiro de imagem diretamente para o modelo de IA e receber um veredicto booleano.

**Pedido**: Envio de formulário _multipart/form-data_ contendo o campo `ficheiro` com a imagem.

**Resposta (200 OK)**:

```json
{
  "tem_tabela": true
}
```

### 3. Múltiplos URLs

`POST /api/paginacao-multurls`

**Corpo do Pedido**:

```json
{
  "urls": ["https://loja.com/categoria1", "https://loja.com/categoria2"],
  "sse": false
}
```
