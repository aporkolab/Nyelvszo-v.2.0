# Multi-stage Dockerfile for Node.js backend

# Base stage
FROM node:18-alpine AS base
LABEL maintainer="Dr. Ádám Porkoláb <adam@porkolab.digital>"
LABEL version="2.2.0"
LABEL description="NyelvSzó Backend API"

# Create app directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Install all dependencies (including devDependencies)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application in development mode
CMD ["npm", "run", "dev"]

# Production dependencies stage
FROM base AS prod-deps
ENV NODE_ENV=production

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Production stage
FROM node:18-alpine AS production
ENV NODE_ENV=production

# Install only required system packages for production
RUN apk add --no-cache curl ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs docs ./docs
COPY --chown=nodejs:nodejs config ./config
COPY --chown=nodejs:nodejs package*.json ./

# Create logs directory and set permissions
RUN mkdir -p logs && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/index.js"]

# Testing stage
FROM development AS testing
ENV NODE_ENV=test

# Copy test files
COPY test ./test

# Run tests
RUN npm test

# Default target is development
FROM development AS default
