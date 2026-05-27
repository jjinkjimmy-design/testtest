FROM node:20-alpine

# Build tools for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/

# Persistent data directories
RUN mkdir -p /data /uploads

ENV NODE_ENV=production
ENV DB_PATH=/data/vault.db
ENV UPLOADS_DIR=/uploads

EXPOSE 3000

CMD ["node", "src/server.js"]
