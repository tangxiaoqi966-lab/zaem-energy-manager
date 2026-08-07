FROM node:22-bookworm-slim AS builder

WORKDIR /app/client

COPY client/package*.json ./

RUN npm install --production=false

COPY client/ .
COPY shared /app/shared

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html

COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
