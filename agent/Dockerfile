FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL=file:/data/agentintel.db

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "dist/index.js"]
