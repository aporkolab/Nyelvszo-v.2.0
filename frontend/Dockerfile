# Multi-stage Dockerfile for Angular frontend

# Base stage
FROM node:18-alpine AS base
LABEL maintainer="Dr. Ádám Porkoláb <adam@porkolab.digital>"
LABEL version="2.2.0"
LABEL description="NyelvSzó Frontend"

# Install system dependencies
RUN apk add --no-cache curl wget ca-certificates \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Install dependencies
RUN npm ci

# Install Angular CLI globally
RUN npm install -g @angular/cli@16

# Copy source code
COPY . .

# Expose port
EXPOSE 4200

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:4200 || exit 1

# Start development server
CMD ["ng", "serve", "--host", "0.0.0.0", "--port", "4200", "--poll", "2000"]

# Build stage
FROM base AS build
ENV NODE_ENV=production

# Install dependencies
RUN npm ci

# Install Angular CLI
RUN npm install -g @angular/cli@16

# Copy source code
COPY . .

# Build the application
RUN ng build --configuration=production

# Production stage with Nginx
FROM nginx:alpine AS production
ENV NODE_ENV=production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application from build stage
COPY --from=build /app/dist/nyelvszo2.0 /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S nginx_user
RUN adduser -S nginx_user -u 1001

# Set permissions
RUN chown -R nginx_user:nginx_user /usr/share/nginx/html
RUN mkdir -p /var/cache/nginx/client_temp \
    && mkdir -p /var/log/nginx \
    && chown -R nginx_user:nginx_user /var/cache/nginx \
    && chown -R nginx_user:nginx_user /var/log/nginx \
    && chown -R nginx_user:nginx_user /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R nginx_user:nginx_user /var/run/nginx.pid

# Switch to non-root user
USER nginx_user

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

# Testing stage
FROM development AS testing
ENV NODE_ENV=test

# Install Chrome for testing
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Chrome path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser

# Run tests
RUN ng test --watch=false --browsers=ChromeHeadless --code-coverage

# Run e2e tests
# RUN ng e2e

# Default target is development
FROM development AS default
