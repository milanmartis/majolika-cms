# 1. Base image
FROM node:22-alpine AS builder

# 2. Pracovný priečinok
WORKDIR /app

# 3. Skopíruj závislosti a nainštaluj
COPY package*.json ./
# Inštalujeme aj devDependencies, aby bol TS k dispozícii
RUN npm install

# 4. Skopíruj zdroj a zbuilduj
COPY . .
RUN npm run build

# 5. Produkčný image
FROM node:22-alpine

WORKDIR /app

# 6. Skopíruj len produkčné závislosti
COPY package*.json ./
RUN npm install --production

# 7. Skopíruj buildnutú appku z buildera
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 8. Config Strapi
COPY --from=builder /app/config ./config

# 9. Port, env a start
ENV NODE_ENV=production
EXPOSE 1337
CMD ["node", "dist/server.js"]
