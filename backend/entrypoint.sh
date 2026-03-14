#!/bin/sh
if [ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ] && [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ] && [ -n "$DB_NAME" ]; then
  ENCODED=$(node -e "console.log(encodeURIComponent(process.env.DB_PASSWORD))")
  export DATABASE_URL="postgresql://${DB_USER}:${ENCODED}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
fi
exec "$@"
