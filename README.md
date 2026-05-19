# Deteção de Tabelas de Dados em Websites

Ferramenta para dar crawl a websites, extrair imagens e analisá-las utilizando **YOLO11** para identificar tabelas de dados.

---

## Como Iniciar

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/jauzin23/VF-tabelas.git
   cd VF-tabelas
   ```
2. **Configurar:** Ajuste as variáveis em `docker-compose.yml` (especialmente a chave de API `API_KEYS`).
3. **Executar:**

   ```bash
   docker compose up -d
   ```

   - O backend estará disponível em `http://localhost:4000` e o frontend em `http://localhost:3001`.

---

## Arquitetura e Funcionalidades

- **Crawl Automático (Patchright/Chromium)**:
  - Aceitação automática de cookies e scroll incremental para carregar conteúdos dinâmicos.
  - Estabilização do DOM (aguarda até que a contagem de links/imagens estabilize) e limite de abas abertas (`BROWSER_CONCURRENCY`).
- **Análise de IA (YOLO11)**:
  - Carregamento dinâmico do modelo (_Lazy Loading_) e descarregamento automático da RAM durante o crawl para otimização de recursos.
  - Configurações de confiança (`TABLE_MIN_CONFIDENCE`) e redimensionamento interno (`YOLO_IMGSZ`).
- **Gestão de Fila**: Fila global com execução ordenada (`MAX_CONCURRENT_TASKS=1`) para evitar sobrecarga de CPU e RAM no servidor.

---

## ⚙️ Principais Variáveis de Configuração

Configuráveis no `docker-compose.yml`:

| Variável                  | Padrão        | Descrição                                                      |
| :------------------------ | :------------ | :------------------------------------------------------------- |
| `API_KEYS`                | (Obrigatório) | Chaves de API autorizadas (separadas por vírgula).             |
| `MAX_CONCURRENT_TASKS`    | `1`           | Máximo de tarefas em execução paralela.                        |
| `BROWSER_CONCURRENCY`     | `3`           | Número máximo de abas Chromium abertas em simultâneo.          |
| `TABLE_MIN_CONFIDENCE`    | `0.5`         | Confiança mínima do modelo YOLO11 para classificar uma tabela. |
| `YOLO_IMGSZ`              | `1024`        | Tamanho de redimensionamento da imagem na inferência.          |
| `CLEANUP_RESULTS_AFTER_S` | `300`         | Segundos antes de limpar os resultados pesados da memória.     |

---

## API Endpoints

Todos os endpoints (exceto `/saude`) requerem autenticação por API Key.

### Tarefas

- **`POST /api/tarefas`**: Cria e submete uma tarefa de crawl e análise.
- **`GET /api/tarefas`**: Lista todas as tarefas.
- **`GET /api/tarefas/{id_tarefa}`**: Detalhes, progresso e resultados de uma tarefa.
- **`DELETE /api/tarefas/{id_tarefa}`**: Cancela e remove uma tarefa e os seus ficheiros do disco.
- **`GET /api/tarefas/{id_tarefa}/eventos`**: SSE (Server-Sent Events) para progresso em tempo real.
- **`GET /api/tarefas/{id_tarefa}/imagens`**: Detalhes simplificados das imagens de tabelas encontradas.

### Sistema e Modelo

- **`POST /api/modelo/detetar-tabela`**: Envia uma imagem direta (multipart/form-data) para análise de IA.
- **`POST /api/paginacao-multurls`**: Submete múltiplos URLs em lote para processamento.
- **`GET /api/sistema/fila`**: Estado atual da fila de processamento.
- **`GET /saude`**: Diagnóstico rápido do servidor (Público).

---

### Tecnologias

#### Linguagens

[![](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)]() [![](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)]()

#### Frameworks & Ferramentas

[![](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)]() [![](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)]() [![](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)]() [![](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)]() [![](https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)]() [![](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)]()
