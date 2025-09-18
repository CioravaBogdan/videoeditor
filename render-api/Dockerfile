# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Install FFmpeg and other dependencies
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

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "src/server.js"]
