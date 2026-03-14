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

ENTRYPOINT ["./entrypoint.sh"]
CMD ["sh", "-c", "npx prisma generate && npx prisma db push --skip-generate && npx prisma db seed && node dist/index.js"]
