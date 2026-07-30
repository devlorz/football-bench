import { startTemporaryPostgres } from "../src/db/temporary-postgres.js";

export default function setup(): () => void {
  const postgres = startTemporaryPostgres("football-benchmark-postgres-");
  process.env.DATABASE_URL = postgres.connectionString;
  return postgres.stop;
}
