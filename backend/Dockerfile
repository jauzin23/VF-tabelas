FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build

EXPOSE 4000
CMD ["npm", "run", "start"]
