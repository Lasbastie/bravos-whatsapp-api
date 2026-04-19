# Dockerfile para Railway - Bravos WhatsApp API
FROM node:20-slim

# Instalar dependencias do Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    build-essential \
    python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Variaveis para o Puppeteer usar o Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /app

# Copiar package files primeiro (cache layer)
COPY package*.json ./
RUN npm ci --only=production

# Copiar o resto do codigo
COPY . .

# Criar diretorios de dados
RUN mkdir -p data logs .wwebjs_auth && chmod -R 777 data logs .wwebjs_auth

# Porta padrao do app
EXPOSE 8095

# Rodar como usuario nao-root
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser && \
    mkdir -p /home/pptruser && chown -R pptruser:pptruser /home/pptruser && \
    chown -R pptruser:pptruser /app

USER pptruser

CMD ["node", "src/server.js"]
