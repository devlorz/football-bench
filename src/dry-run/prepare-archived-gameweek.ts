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

/**
 * Lists the Competitions the archive can actually answer for, because the
 * fetch below walks that table and a Season listing none reaches no source at
 * all — which in a database built from scratch is every database this function
 * is ever handed.
 *
 * Read off the snapshot names rather than declared: `PL` because its sources
 * are the ones every archive has, and one row per football-data.org snapshot,
 * whose source name carries the code it was fetched for. An archive that never
 * saw a league cannot rehearse it, and listing it anyway would replay a fetch
 * against bytes that are not there.
 */
async function listArchivedCompetitions(
  database: Database,
  archive: DryRunArchive,
  season: string
): Promise<void> {
  const codes = new Set(["PL"]);
  for (const { source } of archive.snapshots) {
    const code = /^football_data_org:[^:]+:(.+)$/.exec(source)?.[1];
    if (code !== undefined) {
      codes.add(code);
    }
  }
  for (const competition of [...codes].sort()) {
    await database.query(
      `insert into competitions (competition, season) values ($1, $2)
       on conflict do nothing`,
      [competition, season]
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
  await listArchivedCompetitions(target, archive, season);
  await runDailyFetch({
    database: target,
    season,
    footballDataSeason,
    // A replay answers from the archive and reaches no live source, so this is
    // a stand-in and never a credential: the fetch refuses a Competition whose
    // token is absent before it looks at the fetcher at all, which is right
    // against the network and wrong against bytes already on disk. `null` here
    // failed every rehearsal of a Competition that reads football-data.org,
    // with a message about a missing secret that was not missing and would not
    // have been spent.
    footballDataOrgToken: "archive-replay",
    http: createArchiveReplayFetcher(archive.snapshots),
    now: () => archive.observedAt
  });
}
