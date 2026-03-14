export function ensureDatabaseUrl(): void {
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
  if (DB_USER && DB_PASSWORD && DB_HOST && DB_PORT && DB_NAME) {
    const encodedPassword = encodeURIComponent(DB_PASSWORD);
    process.env.DATABASE_URL = `postgresql://${DB_USER}:${encodedPassword}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public`;
  }
}
