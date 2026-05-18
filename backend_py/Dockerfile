FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

FROM python:3.11-slim

WORKDIR /app

# Instalar dependências de sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar dependências do builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 1. Criar o utilizador primeiro
RUN useradd -m appuser

# 2. Configurar Playwright num local acessível
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright && \
    patchright install --with-deps chromium && \
    chown -R appuser:appuser /ms-playwright

COPY . .

# 3. Criar pastas de dados e ajustar todas as permissões
RUN mkdir -p /data/tarefas /data/models /data/jobs && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app && \
    chown -R appuser:appuser /data && \
    chmod -R 777 /data

USER appuser

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DATA_PATH=/data
ENV UVICORN_LOOP=uvloop
ENV MALLOC_ARENA_MAX=2

EXPOSE 4000

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:4000/saude || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 4000 --workers 1 --log-level warning --access-log --loop ${UVICORN_LOOP:-auto} --http httptools"]
