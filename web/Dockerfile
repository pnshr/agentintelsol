FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY next.config.mjs postcss.config.mjs tsconfig.json next-env.d.ts ./
COPY app ./app
COPY components ./components
COPY data ./data
COPY src ./src

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ARG NEXT_PUBLIC_API_AUTH_TOKEN=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_AUTH_TOKEN=$NEXT_PUBLIC_API_AUTH_TOKEN
ENV NEXT_STATIC_EXPORT=true

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 80
