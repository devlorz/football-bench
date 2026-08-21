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
 * Lists the Competitions the rehearsal will walk, because the fetch below walks
 * that table and a Season listing none reaches no source at all — which in a
 * database built from scratch is every database this function is ever handed.
 *
 * The rehearsed Competition and `PL`, and deliberately nothing else. `PL`
 * because the FPL fetch runs whatever is listed and its sources are the ones
 * every archive has; the rehearsed Competition because that is the one being
 * rehearsed. A league nobody asked about contributes nothing to this run's
 * verdict and can only take it down with it.
 *
 * Listing every league the archive holds *a* snapshot for is what this used to
 * do, and one football-data.org snapshot turned out to be far too weak a
 * predicate for "the archive can answer for this league". Ticket 0033 captured
 * Serie A's and Ligue 1's schedules months before either was activated, so both
 * joined every rehearsal while their Understat, transfer and season-article
 * bytes did not exist — and `runDailyFetch` collects every miss and throws, so
 * the Premier League's own rehearsal went red over Serie A. It also made the
 * ordering circular: a Competition's snapshots only exist once it is activated,
 * and its activation is supposed to wait on a green rehearsal.
 *
 * A Competition whose own bytes are missing still fails, and fails naming
 * itself, which is the check that was wanted all along.
 */
/**
 * The Competitions a rehearsal lists, which is the one being rehearsed and no
 * other. Exposed so a test can read the list back: the whole fault this
 * scoping removes is a second league joining unasked, and that is a fact about
 * the table rather than about any one rehearsal's outcome.
 */
export async function listRehearsedCompetitions(
  database: Database,
  competition: string,
  season: string
): Promise<void> {
  // The rehearsed Competition alone. `PL` rode along here because every
  // archive holds its sources, which was free while its own feed was live and
  // stopped being free at its Gameweek 1 Lock: from that instant, with no
  // current-Season football-data file published, `PL` fails the stale-Season
  // guard and took every other league's rehearsal down with it. That is the
  // fault this scoping was written to remove, arriving through the door the
  // pairing left open.
  for (const code of [competition]) {
    await database.query(
      `insert into competitions (competition, season) values ($1, $2)
       on conflict do nothing`,
      [code, season]
    );
  }
}

export interface PrepareArchivedGameweekOptions {
  target: Database;
  archive: DryRunArchive;
  /** The Competition being rehearsed; the only one listed. */
  competition: string;
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
  competition,
  season,
  footballDataSeason
}: PrepareArchivedGameweekOptions): Promise<void> {
  await seedEntrants(target, archive.entrants);
  await listRehearsedCompetitions(target, competition, season);
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
