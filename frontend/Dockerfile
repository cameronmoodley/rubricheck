# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Accept build-time args
ARG VITE_API_URL
ARG VITE_COMPANY_NAME
ARG VITE_MOODLE_WEB_SERVICE_URL
ARG VITE_WSTOKEN

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_COMPANY_NAME=$VITE_COMPANY_NAME
ENV VITE_MOODLE_WEB_SERVICE_URL=$VITE_MOODLE_WEB_SERVICE_URL
ENV VITE_WSTOKEN=$VITE_WSTOKEN

ENV NODE_ENV=production
ENV CI=true
ENV GENERATE_SOURCEMAP=false
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy all source first (node_modules excluded via .dockerignore)
COPY frontend/ .

# Ensure serve.json exists with proper SPA routing that excludes ACME challenges
RUN test -f serve.json || echo '{"cleanUrls": false, "trailingSlash": false, "rewrites": [{"source": "^(?!.*\\.\\w+$|.*/.well-known|.*/__).+$", "destination": "/index.html"}]}' > serve.json

# Install all deps including devDependencies (Vite, TypeScript) for build
RUN npm ci --include=dev --no-audit --no-fund --prefer-offline --silent && npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve --silent

COPY --from=build /app/dist .
COPY --from=build /app/serve.json .

EXPOSE 3001

CMD ["serve", "-s", ".", "-l", "3001"]
