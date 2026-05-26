FROM node:20-alpine

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/

# Create persistent directories
RUN mkdir -p /data /uploads

ENV NODE_ENV=production
ENV DB_PATH=/data/vault.db
ENV UPLOADS_DIR=/uploads

EXPOSE 3000

CMD ["node", "src/server.js"]
