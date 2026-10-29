FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 9090

CMD ["node", "server.js"]
