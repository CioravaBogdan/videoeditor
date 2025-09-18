# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Install FFmpeg with hardware acceleration support
RUN apk add --no-cache \
    ffmpeg \
    imagemagick \
    bash \
    curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY src/ ./src/

# Create required directories
RUN mkdir -p /uploads /outputs /tmp

# Set permissions
RUN chown -R node:node /app /uploads /outputs /tmp

# Switch to non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f "node.*worker.js" > /dev/null || exit 1

# Start the worker
CMD ["node", "src/worker.js"]
