FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ sqlite-dev py3-setuptools

COPY package*.json ./
RUN rm -rf node_modules && npm ci --only=production
RUN npm rebuild sqlite3 --build-from-source

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node healthcheck.js

CMD ["node", "server.js"]
