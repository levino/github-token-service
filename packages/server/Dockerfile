FROM node:22-alpine AS base
WORKDIR /app

FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run typecheck

FROM base AS production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/src ./src
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/database.json ./database.json
COPY --from=builder /app/public ./public
USER node
CMD ["npm", "start"]
