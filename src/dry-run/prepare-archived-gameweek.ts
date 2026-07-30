import type { Client } from "pg";
import { runDailyFetch } from "../fetch/daily-fetch.js";
import { createArchiveReplayFetcher } from "./archive-replay-fetcher.js";
import type { ArchivedEntrant, DryRunArchive } from "./load-archive.js";

type Database = Pick<Client, "query">;

async function seedEntrants(
  database: Database,
  entrants: ArchivedEntrant[]
): Promise<void> {
  for (const entrant of entrants) {
    await database.query(
      `insert into models
         (id, name, base_model, provider, quantization, prompt_version,
          role, config)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do nothing`,
      [
        entrant.id,
        entrant.name,
        entrant.base_model,
        entrant.provider,
        entrant.quantization,
        entrant.prompt_version,
        entrant.role,
        entrant.config
      ]
    );
  }
}

export interface PrepareArchivedGameweekOptions {
  target: Database;
  archive: DryRunArchive;
  season: string;
  footballDataSeason: string;
}

/**
 * Fills an empty database with the roster and the Gameweek data an archive
 * holds, replaying archived bytes rather than reaching the network. Shared by
 * the dry run and the preview so both build context from identical inputs and
 * differ only in who answers the prompt.
 *
 * Loading runs at the archive's own observation instant; a caller choosing a
 * later instant governs only the prediction path, where the Lock decides
 * whether a Prediction may be written.
 */
export async function prepareArchivedGameweek({
  target,
  archive,
  season,
  footballDataSeason
}: PrepareArchivedGameweekOptions): Promise<void> {
  await seedEntrants(target, archive.entrants);
  await runDailyFetch({
    database: target,
    season,
    footballDataSeason,
    http: createArchiveReplayFetcher(archive.snapshots),
    now: () => archive.observedAt
  });
}
