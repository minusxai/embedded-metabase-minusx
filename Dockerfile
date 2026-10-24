FROM node:22.23.4-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 9090

CMD ["node", "server.js"]
