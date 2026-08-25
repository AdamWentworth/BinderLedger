FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY apps/client/package.json apps/client/package-lock.json ./
RUN npm ci

COPY apps/client ./
ARG EXPO_PUBLIC_API_URL=
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
RUN npm run export:web

FROM nginx:1.30-alpine
RUN apk upgrade --no-cache
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1:8080/ || exit 1
