FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY backend/ ./backend/
COPY railway.json .
EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 CMD curl -f http://localhost:8080/health || exit 1
CMD ["node", "backend/src/index.js"]
