FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/prisma ./prisma
COPY backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
COPY --from=build /app/dist ./dist

RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001 \
 && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8001

RUN cat > /app/migrate.sh << 'EOF'
#!/bin/sh
npx prisma generate

# Try migration without data loss flag first (safer for existing data)
if npx prisma db push --skip-generate 2>&1; then
  # Success - proceed
  npx prisma db seed
  exec node dist/index.js
else
  # If it failed with data loss error, retry with flag (for fresh databases)
  echo "Retrying migration with --accept-data-loss flag..."
  npx prisma db push --skip-generate --accept-data-loss
  npx prisma db seed
  exec node dist/index.js
fi
EOF
chmod +x /app/migrate.sh

ENTRYPOINT ["./entrypoint.sh"]
CMD ["sh", "/app/migrate.sh"]
