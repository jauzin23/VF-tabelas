# 🔍 Table Image Detector — Plano de Projeto

> Ferramenta web para detetar tabelas escondidas em imagens dentro de websites, com foco em acessibilidade.
> Caso de uso principal: prints de Excel/spreadsheets inseridos como imagem em vez de HTML.
> Stack: 100% Node.js/TypeScript — zero Python, zero binários externos.

---

## 📐 Visão Geral da Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                      Docker Compose                      │
│                                                          │
│  ┌──────────────┐          ┌──────────────────────────┐  │
│  │   Frontend   │          │         Backend          │  │
│  │  (Next.js)   │◄────────►│  (Node.js + Express)    │  │
│  │  Port 3000   │          │       Port 4000          │  │
│  └──────────────┘          │                          │  │
│                            │  ┌──────────────────┐    │  │
│                            │  │    Playwright     │    │  │
│                            │  │  (crawl + imgs)  │    │  │
│                            │  └──────────────────┘    │  │
│                            │  ┌──────────────────┐    │  │
│                            │  │  tesseract.js     │    │  │
│                            │  │  (OCR / filtro)   │    │  │
│                            │  └──────────────────┘    │  │
│                            │  ┌──────────────────┐    │  │
│                            │  │  ONNX Runtime     │    │  │
│                            │  │  (TATR detection) │    │  │
│                            │  └──────────────────┘    │  │
│                            └──────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │     Volume: /data  (modelo ONNX + jobs + imagens)  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Dois containers apenas**: `frontend` (Next.js) + `backend` (Node.js). Tudo — OCR, TATR, crawl — corre dentro do backend.

---

## 🧠 Decisões Técnicas

### OCR — `tesseract.js`

- Corre Tesseract em **puro WASM dentro do Node.js** — sem binários externos, sem apt-get
- Usado como **filtro de pré-análise**: só passam ao TATR as imagens onde o OCR deteta texto suficiente
- Suporta múltiplas línguas (relevante para websites em PT/EN/etc.)
- API simples: `await worker.recognize(imageBuffer)` → devolve texto extraído + confiança

### TATR — `onnxruntime-node`

- Modelo `microsoft/table-transformer-detection` exportado em ONNX (~115MB)
- `onnxruntime-node` executa inferência nativa em Node.js (biblioteca C++ compilada)
- Download automático do modelo no startup, guardado em volume Docker
- Pré-processamento da imagem para tensor feito com `jimp` (100% JS, sem binários)

### Por que `jimp` em vez de Sharp?

- `jimp` é 100% JavaScript — sem módulos nativos compilados, sem dependências de sistema
- Suficiente para as operações necessárias: resize, conversão de canais, extração de pixel values para Float32Array
- Dockerfile mais simples e portátil

---

## 🗂️ Estrutura de Pastas do Projeto

```
table-detector/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── frontend/                          # Next.js App
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── app/
│       │   ├── page.tsx               # Página principal
│       │   ├── layout.tsx
│       │   └── api/
│       │       └── jobs/
│       │           └── route.ts       # Proxy para o backend
│       ├── components/
│       │   ├── UrlForm.tsx            # Formulário de input de URL + opções
│       │   ├── JobStatus.tsx          # Polling de estado do job
│       │   ├── ResultsGrid.tsx        # Grid de imagens encontradas
│       │   ├── ImageCard.tsx          # Card com imagem + metadados + veredito
│       │   └── ProgressBar.tsx        # Barra de progresso do crawl
│       └── lib/
│           └── api.ts                 # Cliente HTTP para o backend
│
├── backend/                           # Node.js + Express
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts                   # Entry point + Express setup
│       ├── routes/
│       │   ├── jobs.ts                # POST /jobs, GET /jobs/:id
│       │   └── images.ts              # GET /images/:jobId/:filename
│       ├── services/
│       │   ├── crawler.ts             # Playwright: crawl + extração de imagens
│       │   ├── imageExtractor.ts      # Download de imagens + recolha de metadados
│       │   ├── ocrFilter.ts           # tesseract.js: OCR + filtro por texto detetado
│       │   ├── tableDetector.ts       # onnxruntime-node: inferência TATR
│       │   ├── modelManager.ts        # Download + cache do modelo ONNX
│       │   └── jobManager.ts          # Gestão de jobs (estado, progresso, fila)
│       ├── models/
│       │   └── types.ts               # Tipos TypeScript partilhados
│       └── utils/
│           ├── tensorUtils.ts         # jimp: imagem → tensor Float32 para ONNX
│           └── logger.ts
│
└── data/                              # Volume Docker partilhado
    ├── models/
    │   └── tatr.onnx                  # Modelo TATR em cache (~115MB)
    └── jobs/
        └── {jobId}/
            ├── metadata.json          # Estado do job + todos os resultados
            └── images/                # Imagens descarregadas (raw)
```

---

## 🔄 Pipeline de Processamento (Passo a Passo)

### Fase 0 — Startup do Backend (uma vez)

```
Backend inicia
  → modelManager.ts verifica se /data/models/tatr.onnx existe
  → Se não existe: download do HuggingFace Hub (~115MB)
  → Carrega InferenceSession do ONNX Runtime em memória
  → tesseract.js Worker inicializado e pronto
  → Backend aceita requests
```

---

### Fase 1 — Crawl com Playwright

```
URL recebida → Playwright abre Chromium headless
             → Navega para a URL raiz
             → Descobre links internos do mesmo domínio (até maxDepth)
             → Para cada página:
                 - Aguarda networkidle
                 - Encontra todos os <img> e <picture>
                 - Para cada imagem extrai e guarda:
                     • src absoluto
                     • alt text
                     • getBoundingClientRect() — posição exata na página
                     • document.title — título da página
                     • URL da página
                     • innerText do elemento pai mais próximo (contexto textual)
                     • dimensões renderizadas (offsetWidth, offsetHeight)
                 - Faz download do ficheiro de imagem para /data/jobs/{id}/images/
                 - Regista metadados em metadata.json
```

**Limites configuráveis:**

- `maxPages` (default: 50)
- `maxDepth` (default: 3)
- Timeout por página: 30s
- Respeitar `robots.txt`

---

### Fase 2 — Filtro OCR com tesseract.js

```
Para cada imagem descarregada:

    1. tesseract.js Worker executa reconhecimento na imagem
       (lingua: por defeito 'eng+por', configurável)

    2. Analisa resultado:
       - Conta palavras reconhecidas
       - Verifica confiança média do OCR

    3. Critérios de filtragem:
       ✅ PASSA se: palavras reconhecidas >= 5  E  confiança média >= 40%
       ❌ DESCARTA se: poucas palavras ou confiança baixa
          (logos, fotos, ilustrações, ícones grandes, etc.)

    4. Para as imagens que PASSAM:
       - Guarda o texto OCR extraído nos metadados
         (útil para mostrar no frontend como preview do conteúdo)
```

> **Nota**: os thresholds (min palavras, min confiança) são configuráveis via `.env`.

---

### Fase 3 — Deteção de Tabelas com TATR (ONNX Runtime)

```
Para cada imagem que passou o filtro OCR:

    1. tensorUtils.ts — pré-processamento com jimp:
       - Carregar imagem (suporta PNG, JPEG, BMP, GIF)
       - Resize para 800x800 com letterboxing (mantém aspect ratio)
       - Extrair canais RGB pixel a pixel → Float32Array
       - Normalizar com ImageNet mean/std:
           mean = [0.485, 0.456, 0.406]
           std  = [0.229, 0.224, 0.225]
       - Criar OnnxTensor com shape [1, 3, 800, 800]

    2. tableDetector.ts — inferência:
       - session.run({ pixel_values: tensor })
       - Outputs: logits (classes) + pred_boxes (coordenadas)

    3. Post-processing:
       - Softmax nos logits → probabilidades por classe
       - Filtrar detections com score > confidenceThreshold (default: 0.7)
       - Converter boxes [cx, cy, w, h] → [x1, y1, x2, y2]
       - Escalar coordenadas para dimensões reais da imagem

    4. Guardar resultado em metadata.json:
       {
         "hasTable": true,
         "confidence": 0.94,
         "ocrText": "Produto Quantidade Preço Total ...",
         "boundingBoxes": [
           { "score": 0.94, "box": { "x1": 45, "y1": 20, "x2": 760, "y2": 580 } }
         ]
       }
```

---

### Fase 4 — Agregação de Resultados

```
Após processar todas as imagens do job:

    Resumo global:
    - Total de páginas analisadas
    - Total de imagens encontradas
    - Total que passou o filtro OCR
    - Total com tabela detetada

    Por cada imagem com tabela detetada:
    - URL e título da página
    - Posição do elemento na página (para linkagem direta)
    - Alt text (sinalizado se vazio — problema de acessibilidade)
    - Texto circundante (contexto)
    - Texto OCR extraído (preview do conteúdo)
    - Score de confiança do TATR
    - Bounding boxes das tabelas dentro da imagem
```

---

## 📡 API do Backend

| Método   | Endpoint                         | Descrição                  |
| -------- | -------------------------------- | -------------------------- |
| `POST`   | `/api/jobs`                      | Criar novo job de crawl    |
| `GET`    | `/api/jobs/:id`                  | Estado e resultados do job |
| `GET`    | `/api/jobs/:id/images/:filename` | Servir imagem extraída     |
| `DELETE` | `/api/jobs/:id`                  | Cancelar/eliminar job      |

### POST `/api/jobs`

```json
{
  "url": "https://exemplo.com",
  "options": {
    "maxPages": 20,
    "maxDepth": 3,
    "confidenceThreshold": 0.7,
    "ocrMinWords": 5,
    "ocrMinConfidence": 40,
    "ocrLanguage": "eng+por"
  }
}
```

### GET `/api/jobs/:id`

```json
{
  "jobId": "abc123",
  "status": "running",
  "progress": {
    "pagesFound": 15,
    "pagesProcessed": 8,
    "imagesFound": 47,
    "imagesPassedOcr": 14,
    "imagesAnalyzed": 10
  },
  "results": [
    {
      "imageId": "img_001",
      "pageUrl": "https://exemplo.com/relatorio",
      "pageTitle": "Relatório Anual 2023",
      "imageSrc": "https://exemplo.com/assets/tabela-vendas.png",
      "imageAlt": "",
      "position": { "x": 120, "y": 450, "width": 800, "height": 400 },
      "surroundingText": "Os resultados por região estão indicados abaixo:",
      "ocrText": "Região Norte Sul Centro Total Vendas 1200 980 760 2940",
      "hasTable": true,
      "confidence": 0.94,
      "boundingBoxes": [
        { "score": 0.94, "box": { "x1": 10, "y1": 5, "x2": 790, "y2": 395 } }
      ],
      "imageFile": "/api/jobs/abc123/images/img_001.png",
      "altMissing": true
    }
  ],
  "summary": {
    "pagesAnalyzed": 15,
    "imagesFound": 47,
    "imagesPassedOcr": 14,
    "tablesDetected": 3,
    "completedAt": "2024-01-15T14:30:00Z"
  }
}
```

---

## 🖥️ Frontend (Next.js)

### UI Flow

1. **UrlForm** — input de URL + opções avançadas (max páginas, profundidade, thresholds de OCR e TATR, língua OCR)
2. **JobStatus** — polling a cada 2s, progresso em tempo real com breakdown por fase (crawl / OCR / TATR)
3. **ResultsGrid** — grelha de resultados quando completo

### ResultsGrid

- Filtros: "Todas" | "Só tabelas" | "Sem tabela" | filtrar por página
- Ordenação: por confiança (desc), por página
- Cada **ImageCard** mostra:
  - Miniatura da imagem com **bounding box overlay** (Canvas) onde a tabela foi detetada
  - Badge: 🔴 **TABELA DETETADA** (score%) / ⚪ Sem tabela
  - ⚠️ **ALT VAZIO** se `imageAlt` for vazio (problema de acessibilidade adicional)
  - URL da página (clicável)
  - Texto OCR extraído (collapsível)
  - Texto circundante

---

## 🐳 Docker Compose

```yaml
version: "3.8"

services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - BACKEND_URL=http://backend:4000
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "4000:4000"
    environment:
      - DATA_PATH=/data
      - MODEL_PATH=/data/models/tatr.onnx
      - CONFIDENCE_THRESHOLD=0.7
      - OCR_MIN_WORDS=5
      - OCR_MIN_CONFIDENCE=40
      - OCR_LANGUAGE=eng+por
      - MAX_CONCURRENT_JOBS=3
    volumes:
      - app_data:/data

volumes:
  app_data: # modelo ONNX + tessdata + imagens dos jobs
```

---

## 🐳 Dockerfiles

### `backend/Dockerfile`

```dockerfile
FROM node:20-slim

# Apenas o Chromium para o Playwright — sem Tesseract binário (usamos tesseract.js WASM)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### `frontend/Dockerfile`

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## 📦 Dependências

### Backend (Node.js)

| Pacote             | Uso                                                    |
| ------------------ | ------------------------------------------------------ |
| `express`          | Framework HTTP                                         |
| `playwright`       | Crawling headless + extração de imagens                |
| `tesseract.js`     | OCR em WASM — filtro de imagens com texto              |
| `onnxruntime-node` | Inferência do modelo TATR em Node.js                   |
| `jimp`             | Pré-processamento de imagem para tensor ONNX (100% JS) |
| `axios`            | Download do modelo ONNX do HuggingFace                 |
| `uuid`             | Geração de IDs de job                                  |
| `p-queue`          | Fila de processamento concorrente                      |
| `typescript`       | Tipagem                                                |

### Frontend (Next.js)

| Pacote        | Uso                      |
| ------------- | ------------------------ |
| `next` 14     | Framework React          |
| `tailwindcss` | Estilos                  |
| `swr`         | Polling de estado do job |
| `typescript`  | Tipagem                  |

---

## 📋 Ordem de Implementação

### Fase 1 — Setup e Infraestrutura

- [ ] Estrutura de pastas e configuração TypeScript
- [ ] `docker-compose.yml` com dois serviços
- [ ] Dockerfiles (frontend e backend)
- [ ] Volume partilhado para dados e modelo

### Fase 2 — TATR em Node.js

- [ ] `modelManager.ts` — download e cache do ONNX do HuggingFace
- [ ] `tensorUtils.ts` — pré-processamento com `jimp` para tensor ONNX
- [ ] `tableDetector.ts` — inferência com `onnxruntime-node` + post-processing
- [ ] Testes de inferência isolados com prints de Excel

### Fase 3 — OCR com tesseract.js

- [ ] `ocrFilter.ts` — inicialização do Worker + reconhecimento de texto
- [ ] Lógica de filtragem por número de palavras e confiança
- [ ] Testes com imagens com e sem texto

### Fase 4 — Backend Core

- [ ] Sistema de jobs (criar, estado, progresso, fila com `p-queue`)
- [ ] Crawler Playwright (extração de imagens + metadados completos)
- [ ] Pipeline completo: crawl → OCR → TATR → resultado

### Fase 5 — Frontend

- [ ] Layout base Next.js + Tailwind
- [ ] Formulário de URL com opções avançadas
- [ ] Polling de estado com progresso por fase
- [ ] Grid de resultados com ImageCard + bounding box overlay em Canvas

### Fase 6 — Polish

- [ ] Limpeza automática de jobs antigos
- [ ] Tratamento de erros e timeouts em todo o pipeline
- [ ] README com instruções de deployment

---

## 🚀 Como Correr

```bash
git clone <repo>
cd table-detector
docker-compose up --build

# Na primeira execução:
#   - Backend faz download do modelo TATR ONNX (~115MB)
#   - tesseract.js descarrega os language packs (eng + por)
#   - Ambos ficam em cache no volume para restarts futuros
#
# Aceder a: http://localhost:3000
```

---

## ⚠️ Requisitos de Hardware

| Componente | Mínimo         | Notas                                                         |
| ---------- | -------------- | ------------------------------------------------------------- |
| RAM        | 4GB            | TATR ONNX ~300MB + tesseract.js WASM ~200MB + Chromium        |
| Disco      | 3GB            | Modelo ONNX (~115MB) + Chromium (~700MB) + tessdata + imagens |
| CPU        | 2 cores        | TATR ~0.1s/img em CPU; tesseract.js ~1-3s/img em WASM         |
| GPU        | Não necessário | `onnxruntime-node` suporta CUDA opcionalmente                 |

> **Zero Python, zero binários de sistema adicionais**: Tesseract corre em WASM via `tesseract.js`, TATR corre via `onnxruntime-node`. O único binário de sistema instalado no Dockerfile é o Chromium, necessário para o Playwright.
