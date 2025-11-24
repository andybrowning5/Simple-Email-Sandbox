# ---------- Build stage ----------
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies and build TypeScript output
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./tsconfig.json
COPY src ./src

# Build TS → JS (assumes "build" script outputs to /app/dist)
RUN npm run build


# ---------- Runtime stage ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Where the group config and DB will live inside the container
ENV GROUP_CONFIG_PATH=/data/config.json
ENV DB_PATH=/data/email.db

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled assets from the builder image
COPY --from=builder /app/dist ./dist

# Create /data for config & state, and make sure the node user owns it
RUN mkdir -p /data && chown node:node /data

# Optional: declare the volume so tools know this is persistent data
VOLUME ["/data"]

USER node

# index.js should:
#  - check for GROUP_CONFIG_PATH
#  - run the init wizard if it doesn't exist
#  - then start the MCP server
CMD ["node", "dist/index.js"]
