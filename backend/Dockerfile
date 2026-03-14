# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files
COPY backend/package*.json ./
RUN npm ci

# Copy Prisma schema and migrations
COPY backend/prisma ./prisma

# Copy source and tsconfig
COPY backend/tsconfig.json ./
COPY backend/src ./src

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl

ENV NODE_ENV=production

# Copy package files and install prod deps only
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy Prisma (needed for migrate/push)
COPY backend/prisma ./prisma

# Copy compiled app from build stage
COPY --from=build /app/dist ./dist

# Drop privileges
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001 \
 && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8001

# Run Prisma generate (client needed for seed & app), schema sync, seed, then start
CMD ["sh", "-c", "npx prisma generate && npx prisma db push --skip-generate && npx prisma db seed && node dist/index.js"]
