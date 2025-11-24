# ---------- Build stage ----------
FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies (including better-sqlite3 native compilation)
COPY package*.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npm run build


# ---------- Runtime stage ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Where the group config and DB will live inside the container
ENV GROUP_CONFIG_PATH=/data/config.json
ENV DB_PATH=/data/email.db

# Install production dependencies with native modules
COPY package*.json ./
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && npm ci --omit=dev \
    && apt-get remove -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled assets from the builder image
COPY --from=builder /app/dist ./dist

# Create /data for config & state, and make sure the node user owns it
RUN mkdir -p /data && chown node:node /data

# Optional: declare the volume so tools know this is persistent data
VOLUME ["/data"]

USER node

# Start the server
CMD ["node", "dist/index.js"]
