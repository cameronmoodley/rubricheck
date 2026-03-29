-- One database (DB_NAME), same Postgres instance as RubriCheck.
-- n8n uses schema "n8n"; Prisma uses "public" — no table collisions.
CREATE SCHEMA IF NOT EXISTS n8n;
