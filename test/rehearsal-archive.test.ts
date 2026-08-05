import { describe, expect, test } from "vitest";
import { rehearsalArchive } from "../src/fpl-rehearsal/rehearsal-archive.js";

const OBSERVED_AT = new Date("2026-07-29T00:00:00Z");

function archived(snapshots: { source: string; body: string }[]) {
  return { observedAt: OBSERVED_AT, snapshots, entrants: [] };
}

describe("the archive a rehearsal replays", () => {
  test("takes the bootstrap out, because every rehearsed day is derived from it", () => {
    const archive = rehearsalArchive(
      archived([
        { source: "fpl_bootstrap", body: "{\"events\":[]}" },
        { source: "fpl_fixtures", body: "[]" }
      ]),
      "2026-27"
    );

    expect(archive.bootstrap).toBe("{\"events\":[]}");
    expect(archive.snapshots.map(({ source }) => source))
      .toEqual(["fpl_fixtures"]);
  });

  test("files the archived matches under the Season being rehearsed", () => {
    // The archive holds last Season's matches, because that is the history a
    // context is built from. The rehearsal plays 2026-27 and the daily fetch
    // refuses to run past its first Lock with no matches stored for it, so the
    // same bytes are filed under the Season the run is playing.
    const archive = rehearsalArchive(
      archived([
        { source: "fpl_bootstrap", body: "{}" },
        { source: "football_data:2025-26:E0", body: "Div,Date" },
        { source: "football_data:2025-26:E1", body: "Div,Date" }
      ]),
      "2026-27"
    );

    expect(archive.snapshots).toEqual([
      { source: "football_data:2026-27:E0", body: "Div,Date" },
      { source: "football_data:2026-27:E1", body: "Div,Date" }
    ]);
  });

  test("refuses an archive with no bootstrap to derive a Gameweek from", () => {
    expect(() => rehearsalArchive(archived([
      { source: "fpl_fixtures", body: "[]" }
    ]), "2026-27")).toThrow(
      "The archive holds no fpl_bootstrap snapshot to rehearse from"
    );
  });
});
