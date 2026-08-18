import { describe, expect, test } from "vitest";
import {
  captainReturnTone, captainWearerBadge, chipLabel, chipLegend, chipsTag,
  chipStrip, chipStripKicker, clubTag, CHIP_EXPIRY_GW, deltaNote,
  gameweekSpan, gwTag, money, movement, operatorFooter, opponentLabel,
  pounds, rankBand, recordKicker, seasonLabel, seatTeamSheet,
  SEASON_GAMEWEEKS, settledGws, sheetKicker, sheetSubLine, spreadLabels,
  statStrip, statusLine, transferCost, transferGwLabel, transfersHeading,
  validationRows
} from "../dashboard/src/fpl-view.js";

/**
 * Every step the FPL section takes between a response and what a reader sees:
 * the movement marker, money, the span the ranking is cumulative over, the
 * Gameweeks inside it the record holds, the Gameweek the movement was measured
 * against, the header's status line, the Cards variant's Chips tag, the weight
 * a place in the field is drawn at, where the Race chart's labels sit, and
 * every seat, tag and sentence a Team Sheet is drawn with. No database. They
 * are here because each of them renders perfectly while being wrong, and
 * nothing the pages do on their own has that property.
 */
describe("the ranking's movement marker", () => {
  test("reads a rise and a fall as opposite things", () => {
    expect(movement(2)).toEqual({ mark: "▲2", tone: "up" });
    expect(movement(-1)).toEqual({ mark: "▼1", tone: "down" });
    // The fall carries its size without its sign: the arrow is what says which
    // way, and "▼-1" would be a place lost twice.
    expect(movement(-4).mark).toBe("▼4");
  });

  test("distinguishes holding a place from having no place behind it", () => {
    // The design's dash means "did not move". The first Settled Gameweek of the
    // record has no snapshot behind it, and an Entrant nothing is known about
    // has not stood still -- so it draws nothing rather than the dash.
    expect(movement(0)).toEqual({ mark: "–", tone: "flat" });
    expect(movement(null)).toEqual({ mark: "", tone: "none" });
  });
});

describe("the Squad value column", () => {
  test("prints tenths of a million to one decimal", () => {
    expect(money(1012)).toBe("101.2");
    expect(money(1000)).toBe("100.0");
    expect(money(998)).toBe("99.8");
  });

  test("says nothing rather than nought for a Squad it has not read", () => {
    // Nought would be a Squad worth nothing, which is not a state the track
    // has: an Entrant with no Manager State has no Squad value at all.
    expect(money(null)).toBe("—");
  });
});

describe("the span the ranking is cumulative over", () => {
  test("names the first and the last Settled Gameweek", () => {
    expect(gameweekSpan(1, 5, [])).toBe("Cumulative, Gameweeks 1–5");
  });

  test("announces a Gameweek the record holds nothing for", () => {
    // The seeded Season's own shape: one Entrant stored no Manager State at
    // Gameweek 4, so ADR-0011 removes it from every Season path and no total on
    // the page counts it. "Gameweeks 1-5" alone would claim five Gameweeks that
    // four of them answer.
    expect(gameweekSpan(1, 5, [4]))
      .toBe("Cumulative, Gameweeks 1–5 · not in the record: GW4");
    expect(gameweekSpan(1, 6, [3, 4]))
      .toBe("Cumulative, Gameweeks 1–6 · not in the record: GW3, GW4");
  });

  test("does not pluralise a span of one Gameweek", () => {
    expect(gameweekSpan(2, 2, [])).toBe("Cumulative, Gameweek 2");
  });

  test("says nothing has settled rather than naming Gameweek nought", () => {
    expect(gameweekSpan(null, null, [])).toBe("Cumulative, no Gameweek settled");
  });
});

describe("the footnote's movement reference", () => {
  test("names the Gameweek behind the one on screen", () => {
    expect(deltaNote(1, 4, []))
      .toBe("Δ is the change against the cumulative snapshot at GW3.");
  });

  test("names the last Gameweek with a snapshot and not the one before", () => {
    // The seeded Season's own shape again: nothing was scored at Gameweek 4, so
    // the movement beside every row was measured against Gameweek 3. Reading
    // `throughGw − 1` would print GW4 -- a sentence that reads perfectly and
    // names a Gameweek the record does not hold.
    expect(deltaNote(1, 5, [4]))
      .toBe("Δ is the change against the cumulative snapshot at GW3.");
  });

  test("skips two holes in a row the same way it skips one", () => {
    expect(deltaNote(1, 6, [4, 5]))
      .toBe("Δ is the change against the cumulative snapshot at GW3.");
  });

  test("reads the Gameweek behind a span that does not start at one", () => {
    // `fromGw` is where the record starts and not where the Season does.
    expect(deltaNote(12, 14, []))
      .toBe("Δ is the change against the cumulative snapshot at GW13.");
  });

  test("says nothing at the first Settled Gameweek", () => {
    // The Δ column is empty there, and a sentence explaining it would be naming
    // a Gameweek that does not exist.
    expect(deltaNote(1, 1, [])).toBe("");
    expect(deltaNote(null, null, [])).toBe("");
    // A span whose only other Gameweek is a hole is that same case.
    expect(deltaNote(1, 2, [1])).toBe("");
  });
});

describe("the Gameweeks the record holds", () => {
  test("is the span less the holes announced inside it", () => {
    expect(settledGws(1, 5, [])).toEqual([1, 2, 3, 4, 5]);
    // The seeded Season's own shape. The Race variant's axis is labelled from
    // this, so the hole is a longer segment in every line rather than a
    // Gameweek 4 label sitting where Gameweek 5's points were plotted.
    expect(settledGws(1, 5, [4])).toEqual([1, 2, 3, 5]);
  });

  test("holds nothing before the first Settled Gameweek", () => {
    expect(settledGws(null, null, [])).toEqual([]);
  });
});

describe("the Cards variant's Chips tag", () => {
  test("counts one Chip in the singular", () => {
    expect(chipsTag(1)).toBe("1 chip");
    expect(chipsTag(3)).toBe("3 chips");
    // Nought Chips left is a fact about the Entrant and reads as the plural.
    expect(chipsTag(0)).toBe("0 chips");
  });

  test("says nothing rather than nought for a count it has not read", () => {
    expect(chipsTag(null)).toBe("—");
  });
});

describe("the weight a place in the field is drawn at", () => {
  test("gives the design's three bands to the leader, the chasers and the rest", () => {
    expect(rankBand(1)).toEqual({ band: "1", dashed: false });
    expect(rankBand(2)).toEqual({ band: "top", dashed: false });
    expect(rankBand(4)).toEqual({ band: "rest", dashed: false });
    expect(rankBand(9)).toEqual({ band: "rest", dashed: false });
  });

  test("dashes third place alone, so second and third stay apart", () => {
    // Both are drawn at the same weight in the same ink. The dash is the only
    // thing between them, and it belongs to the rank rather than to the chart
    // that draws it -- the Cards tile reads the same answer and ignores it.
    expect(rankBand(3)).toEqual({ band: "top", dashed: true });
  });

  test("draws a rank it has not read as the rest of the field", () => {
    // Ranks are null before the first Settled Gameweek, where there is no Race
    // to draw. Nothing should reach here -- and if it does, an unranked Entrant
    // is not the leader.
    expect(rankBand(null)).toEqual({ band: "rest", dashed: false });
  });
});

describe("the Race chart's label positions", () => {
  test("leaves labels that already clear each other where they are", () => {
    expect(spreadLabels([40, 100, 200], 17, 300)).toEqual([40, 100, 200]);
  });

  test("pushes a collision down to exactly the minimum gap", () => {
    expect(spreadLabels([100, 105, 140], 17, 300)).toEqual([100, 117, 140]);
    // The push carries: the third clears the second's new position and not the
    // one it asked for.
    expect(spreadLabels([100, 105, 110], 17, 300)).toEqual([100, 117, 134]);
  });

  test("returns positions in the order it was given them", () => {
    // The caller pairs a label with a row by index. Handed the ends of nine
    // lines out of rank order, the answer stays out of rank order -- and the
    // label that was above stays above.
    expect(spreadLabels([200, 100, 105], 17, 300)).toEqual([200, 100, 117]);
  });

  test("holds a whole field on one total inside the plot", () => {
    // Nine Entrants that opened on the same fifteen players end the first
    // Gameweek on the same total, so every line ends at the same height. The
    // run is pulled back off the foot of the panel, and every gap survives it.
    const stacked = spreadLabels(Array.from({ length: 9 }, () => 280), 17, 300);
    expect(stacked.at(-1)).toBe(300);
    expect(stacked[0]).toBe(300 - 8 * 17);
    for (let index = 1; index < stacked.length; index += 1) {
      expect(stacked[index]! - stacked[index - 1]!).toBe(17);
    }
  });

  test("does not carry a runaway leader off the top of the plot", () => {
    // A leader clear of a field packed on the baseline: the pack overflows the
    // foot and the leader does not. Pulling the whole column up by what the
    // pack overflowed by would put the leader's label above the panel -- it is
    // the labels that have to move that move, from the bottom up.
    const packed = spreadLabels(
      [30, ...Array.from({ length: 8 }, () => 280)], 17, 300
    );
    expect(packed[0]).toBe(30);
    expect(Math.min(...packed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...packed)).toBeLessThanOrEqual(300);
    for (let index = 2; index < packed.length; index += 1) {
      expect(packed[index]! - packed[index - 1]!).toBeGreaterThanOrEqual(17);
    }
  });

  test("gives labels that asked for one position the order they arrived in", () => {
    // Two equal ends are two lines crossing at the same point, and the sort
    // that separates them must not be the one deciding which name goes on top.
    expect(spreadLabels([50, 50], 17, 300)).toEqual([50, 67]);
  });
});

describe("the header's status line", () => {
  test("carries the Season, the Gameweek and the size of the field", () => {
    expect(statusLine("2026-27", 4, 9)).toBe("Season 2026/27 · GW4 settled · 9 entrants");
  });

  test("before the first Settled Gameweek claims none", () => {
    expect(statusLine("2026-27", null, 9))
      .toBe("Season 2026/27 · no Gameweek settled · 9 entrants");
  });

  test("spells the Season the way the panel beside it does", () => {
    // Both read it from here, so the header and the pre-Season panel cannot
    // print one Season two ways on one page.
    expect(seasonLabel("2026-27")).toBe("2026/27");
    expect(statusLine("2026-27", 4, 9)).toContain(seasonLabel("2026-27"));
  });
});

/**
 * A legal Team Sheet over a legal Squad: two goalkeepers, five defenders, five
 * midfielders and three forwards, starting 4-4-2 with one of each on the bench.
 * The bench is deliberately not keeper-first — the rules only require the four
 * who do not start, named in order — so the numbering has something to get
 * wrong.
 */
const SQUAD = [
  { fplId: 1, position: "GKP" as const },
  { fplId: 2, position: "GKP" as const },
  { fplId: 3, position: "DEF" as const },
  { fplId: 4, position: "DEF" as const },
  { fplId: 5, position: "DEF" as const },
  { fplId: 6, position: "DEF" as const },
  { fplId: 7, position: "DEF" as const },
  { fplId: 8, position: "MID" as const },
  { fplId: 9, position: "MID" as const },
  { fplId: 10, position: "MID" as const },
  { fplId: 11, position: "MID" as const },
  { fplId: 12, position: "MID" as const },
  { fplId: 13, position: "FWD" as const },
  { fplId: 14, position: "FWD" as const },
  { fplId: 15, position: "FWD" as const }
];

const SHEET = {
  starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
  bench: [12, 2, 7, 15],
  captain: 13,
  viceCaptain: 8
};

describe("seating a Team Sheet", () => {
  test("draws the eleven in the design's four rows, from the goal outwards", () => {
    const { rows } = seatTeamSheet(SQUAD, SHEET);
    expect(rows.map((row) => row.map(({ player }) => player.fplId))).toEqual([
      [1], [3, 4, 5, 6], [8, 9, 10, 11], [13, 14]
    ]);
  });

  test("keeps the bench in the order it would come on", () => {
    // The Sheet's own order and not the Squad's: the Sheet names the four who
    // do not start "in order", and re-sorting them by id would tell a reader
    // the wrong player comes on first.
    const { bench } = seatTeamSheet(SQUAD, SHEET);
    expect(bench.map(({ player }) => player.fplId)).toEqual([12, 2, 7, 15]);
  });

  test("numbers the bench among the outfielders and names the keeper", () => {
    // The goalkeeper is the substitution the rules make for you, so he is
    // labelled by his position and the other three are 1, 2, 3 among
    // themselves. Counting him would make the first outfielder to come on the
    // second.
    const { bench } = seatTeamSheet(SQUAD, SHEET);
    expect(bench.map(({ seat }) => seat.label))
      .toEqual(["Bench 1", "Bench GK", "Bench 2", "Bench 3"]);
    // The strip prints the slot alone, and it is the same answer read off the
    // same seat rather than the label with a word sliced off it.
    expect(bench.map(({ seat }) => seat.slot)).toEqual(["1", "GK", "2", "3"]);
    expect(bench.every(({ seat }) => seat.bench)).toBe(true);
    expect(bench.every(({ seat }) => seat.tone === "neutral")).toBe(true);
  });

  test("puts the armband on the captain and the vice and on nobody else", () => {
    const { all } = seatTeamSheet(SQUAD, SHEET);
    const badges = all
      .filter(({ seat }) => seat.badge !== null)
      .map(({ player, seat }) => [player.fplId, seat.badge]);
    expect(badges).toEqual([[8, "V"], [13, "C"]]);
  });

  test("tags the captain in the accent and the rest of the eleven outline", () => {
    const { all } = seatTeamSheet(SQUAD, SHEET);
    const byId = new Map(all.map((seated) => [seated.player.fplId, seated.seat]));
    expect(byId.get(13)).toEqual(
      { label: "Captain", tone: "accent", bench: false, slot: null, badge: "C" }
    );
    expect(byId.get(8)).toEqual(
      { label: "Vice", tone: "outline", bench: false, slot: null, badge: "V" }
    );
    expect(byId.get(9)).toEqual(
      { label: "Starter", tone: "outline", bench: false, slot: null, badge: null }
    );
  });

  test("lists all fifteen once, the eleven before the four", () => {
    const { all } = seatTeamSheet(SQUAD, SHEET);
    expect(all).toHaveLength(15);
    expect(new Set(all.map(({ player }) => player.fplId)).size).toBe(15);
    expect(all.slice(11).map(({ player }) => player.fplId))
      .toEqual([12, 2, 7, 15]);
  });

  test("stops on a player the Sheet seats nowhere", () => {
    // A Squad's fifteen are exactly the eleven and the four, so a player in
    // neither list is a broken record -- and drawing the other fourteen would
    // be a Team Sheet that looks complete and is missing a player.
    expect(() => seatTeamSheet(
      [...SQUAD, { fplId: 16, position: "FWD" as const }], SHEET
    )).toThrow("16");
  });

  test("seats nobody at all when there is no Sheet", () => {
    // The pre-Season state, which every page has to render: an Entrant with no
    // Manager State has no Team Sheet, and that is not a broken record.
    expect(seatTeamSheet(SQUAD, null))
      .toEqual({ rows: [[], [], [], []], bench: [], all: [] });
  });
});

describe("naming a club in three letters", () => {
  test("prints the code the club carries", () => {
    expect(clubTag({ club: "Nottingham Forest", clubCode: "NFO" })).toBe("NFO");
  });

  test("falls back to the name and never to three letters of it", () => {
    // `MAN` would name both Manchester clubs, and the record never said it.
    expect(clubTag({ club: "Man Utd", clubCode: null })).toBe("Man Utd");
  });
});

describe("the opponent on a name plate", () => {
  test("prints the code and the ground", () => {
    expect(opponentLabel([{ club: "Brentford", clubCode: "BRE", home: true }]))
      .toBe("BRE (H)");
    expect(opponentLabel([{ club: "Arsenal", clubCode: "ARS", home: false }]))
      .toBe("ARS (A)");
  });

  test("falls back to the club's name and never to three letters of it", () => {
    // A listing taken before the Lock recorded a code has none, and `MAN` for
    // both Manchester clubs would be a code the record never held.
    expect(opponentLabel([{ club: "Man Utd", clubCode: null, home: true }]))
      .toBe("Man Utd (H)");
  });

  test("says a blank Gameweek is blank rather than leaving the slot empty", () => {
    expect(opponentLabel([])).toBe("Blank");
  });

  test("names both Fixtures of a double Gameweek", () => {
    expect(opponentLabel([
      { club: "Brentford", clubCode: "BRE", home: true },
      { club: "Everton", clubCode: "EVE", home: false }
    ])).toBe("BRE (H) EVE (A)");
  });
});

describe("the stat strip's Chip cell", () => {
  test("spells a Chip the way the rules do", () => {
    expect(chipLabel("triple_captain")).toBe("Triple Captain");
    expect(chipLabel("bench_boost")).toBe("Bench Boost");
    expect(chipLabel("free_hit")).toBe("Free Hit");
    expect(chipLabel("wildcard")).toBe("Wildcard");
  });

  test("says None rather than nothing when no Chip is active", () => {
    expect(chipLabel(null)).toBe("None");
  });
});

describe("the validation block", () => {
  test("reads Repairs against the allowance the body served", () => {
    const [repairs] = validationRows(
      { repairs: 1, rolledOver: false, lastViolation: null }, 3
    );
    expect(repairs).toEqual({ label: "Repairs used", value: "1 of 3" });
  });

  test("distinguishes a clean Gameweek from a Gameweek with no record", () => {
    // `None` is a Gameweek that broke no rule of the game; the dash is a
    // Gameweek the record holds nothing for, and an Entrant that did not play
    // must not read as one that played cleanly.
    expect(validationRows(
      { repairs: null, rolledOver: null, lastViolation: null }, 3
    ).map(({ value }) => value)).toEqual(["—", "—", "None"]);
    expect(validationRows(
      { repairs: 0, rolledOver: false, lastViolation: null }, 3
    ).map(({ value }) => value)).toEqual(["0 of 3", "No", "None"]);
  });

  test("names the rule that was broken in the rules' own words", () => {
    expect(validationRows(
      { repairs: 3, rolledOver: true, lastViolation: "club_limit" }, 3
    )).toEqual([
      { label: "Repairs used", value: "3 of 3" },
      { label: "Rolled over", value: "Yes" },
      { label: "Last violation", value: "Club limit" }
    ]);
  });
});

describe("the Transfers below the Squad", () => {
  test("names the Gameweek they went into", () => {
    expect(transfersHeading(5, 4)).toBe("Transfers into GW5");
  });

  test("names the Gameweek behind when it is not the one before", () => {
    // A Gameweek an Entrant Gapped stores no Manager State, so the Squad is
    // diffed against the last one that stood -- and a heading that did not say
    // so would read a hole as a quiet week.
    expect(transfersHeading(5, 3)).toBe("Transfers into GW5, against GW3");
  });

  test("calls the opening Gameweek what it is", () => {
    // Fifteen players arriving is a Squad being bought, not fifteen Transfers.
    expect(transfersHeading(1, null)).toBe("Opening Squad, Gameweek 1");
  });

  test("states the Gameweek's cost once, because the record knows it once", () => {
    // A Manager State stores what the Gameweek's paid Transfers cost and never
    // which Transfer was the paid one, so the cost cannot go on a row.
    expect(transferCost(2, 4)).toBe("−4 Hit");
    expect(transferCost(1, 0)).toBe("No Hit taken");
    expect(transferCost(1, null)).toBe("No Hit taken");
  });

  test("a Gameweek nobody changed anything in has no cost to report", () => {
    // "No Hit taken" under an empty list answers a question the Gameweek did
    // not raise.
    expect(transferCost(0, 0)).toBe("No Transfers");
    expect(transferCost(0, null)).toBe("No Transfers");
  });
});

describe("the Entrant record's own GW column", () => {
  test("names the Gameweek alone when it was read against the one before", () => {
    expect(transferGwLabel(5, 4)).toBe("GW5");
  });

  test("names the Gameweek it was read against when it is not the one before", () => {
    // The seeded Season's own shape: GW5's Transfers are read against GW3 for
    // the Entrant that Gapped GW4, and a bare "GW5" would read that hole as a
    // quiet week the same way an unlabelled heading would.
    expect(transferGwLabel(5, 3)).toBe("GW5 (since GW3)");
  });

  test("has nothing to say at the Gameweek an Entrant opened in", () => {
    // Unreachable through the page today -- an opening Gameweek makes no
    // Transfer and never reaches a row of this history -- but the column
    // still owes a plain answer if one ever does.
    expect(transferGwLabel(1, null)).toBe("GW1");
  });
});

describe("money with the sign on it", () => {
  test("carries the unit where a single figure has nowhere else to", () => {
    expect(pounds(1012)).toBe("£101.2");
    expect(pounds(8)).toBe("£0.8");
  });

  test("prints the dash alone for a figure it has not read", () => {
    // `£—` is a price tag on a Squad the record holds nothing about.
    expect(pounds(null)).toBe("—");
  });
});

const SEAT = { baseModel: "x-ai/grok-4", provider: "xai" };

describe("the line under an Entrant's name", () => {
  test("names the Base Model, the provider and the deadline", () => {
    // All three are the design's, and all three are in the record: the first
    // two are columns of the seat the endpoint already reads, and the third is
    // the Gameweek's own deadline (spec 0014, story 21).
    expect(sheetSubLine(SEAT, "2026-09-18T17:30:00Z"))
      .toBe("x-ai/grok-4 · xai · locked Fri 18 Sept, 17:30 UTC");
  });

  test("stamps the Lock in UTC and says which zone it is", () => {
    // UTC and not the reader's zone: a Lock is one instant for the whole field,
    // and a reader in Bangkok reading a Friday deadline as Saturday morning
    // would have a different answer to which deadline this Sheet is for. The
    // Fixtures page states its next Lock locally, because that page answers
    // when the reader must look.
    expect(sheetSubLine(SEAT, "2026-09-18T17:30:00Z")).toContain("17:30 UTC");
  });

  test("carries the date, because a Season has 38 deadlines", () => {
    // The design's line is the weekday and the time. Four Gameweeks apart that
    // is unambiguous; 38 of them name the same weekday five times by the end of
    // the first month.
    expect(sheetSubLine(SEAT, "2026-08-21T17:30:00Z")).toContain("Fri 21 Aug");
    expect(sheetSubLine(SEAT, "2026-09-18T17:30:00Z")).toContain("Fri 18 Sept");
  });

  test("drops the clause where the record holds no deadline", () => {
    // Rather than a line that reads "locked" and then stops.
    expect(sheetSubLine(SEAT, null)).toBe("x-ai/grok-4 · xai");
  });
});

describe("the Gameweek a header or a kicker names", () => {
  test("spells a Gameweek one way wherever it is short", () => {
    expect(gwTag(5)).toBe("GW5");
    expect(sheetKicker(5)).toBe("Team Sheet · Gameweek 5");
  });

  test("names no Gameweek rather than Gameweek null", () => {
    expect(gwTag(null)).toBe("GW");
    expect(sheetKicker(null)).toBe("Team Sheet");
  });
});

describe("the stat strip over a Team Sheet", () => {
  const ENTRANT = {
    gwPoints: 57,
    totalPoints: 294,
    squadValueTenths: 985,
    bankTenths: 15,
    freeTransfers: 5,
    chipActive: null
  };

  test("labels the six cells and gives two of them the unit", () => {
    expect(statStrip(ENTRANT, 5)).toEqual([
      { label: "GW5 points", value: "57", tone: "accent" },
      { label: "Season total", value: "294", tone: null },
      { label: "Squad value", value: "£98.5", tone: null },
      { label: "In the bank", value: "£1.5", tone: null },
      { label: "Free transfers", value: "5", tone: null },
      { label: "Chip", value: "None", tone: "off" }
    ]);
  });

  test("brings the Chip cell up out of the dim when one is active", () => {
    const [, , , , , chip] =
      statStrip({ ...ENTRANT, chipActive: "bench_boost" }, 5);
    expect(chip).toEqual({
      label: "Chip", value: "Bench Boost", tone: "accent"
    });
  });

  test("says the record holds nothing rather than nought", () => {
    // Nought Free Transfers is a state an Entrant can be in; no Manager State
    // at all is not the same state and must not read as it.
    const strip = statStrip(
      {
        gwPoints: null, totalPoints: null, squadValueTenths: null,
        bankTenths: null, freeTransfers: null, chipActive: null
      },
      5
    );
    expect(strip.map(({ value }) => value))
      .toEqual(["—", "—", "—", "—", "—", "None"]);
  });
});

describe("the kicker over an Entrant's own record", () => {
  test("names the span it is read over", () => {
    expect(recordKicker(1, 5, [])).toBe("Entrant record · Gameweeks 1–5");
  });

  test("does not pluralise a span of one Gameweek", () => {
    expect(recordKicker(2, 2, [])).toBe("Entrant record · Gameweek 2");
  });

  test("names nothing before the first Settled Gameweek", () => {
    expect(recordKicker(null, null, [])).toBe("Entrant record");
  });

  test("announces a Gameweek the record holds nothing for", () => {
    // The seeded Season's own shape: this is the one place the record page's
    // own header says the hole, and the bars, the chart and the Chip strip
    // beneath it each say it again where a reader is looking.
    expect(recordKicker(1, 5, [4]))
      .toBe("Entrant record · Gameweeks 1–5 · not in the record: GW4");
  });
});

describe("the Chip strip", () => {
  test("draws all 38 Gameweeks whatever the record's own span is", () => {
    const cells = chipStrip(4, [], []);
    expect(cells).toHaveLength(SEASON_GAMEWEEKS);
    expect(cells.map(({ gw }) => gw)).toEqual(
      Array.from({ length: SEASON_GAMEWEEKS }, (_, index) => index + 1)
    );
  });

  test("marks the Gameweeks the record has already reached", () => {
    const cells = chipStrip(4, [], []);
    expect(cells.slice(0, 4).every(({ past }) => past)).toBe(true);
    expect(cells.slice(4).every(({ past }) => !past)).toBe(true);
  });

  test("says nothing has passed before the first Settled Gameweek", () => {
    expect(chipStrip(null, [], []).every(({ past }) => !past)).toBe(true);
  });

  test("places the Chip a Gameweek played at its own cell", () => {
    const cells = chipStrip(4, [{ chip: "wildcard", gw: 3 }], []);
    expect(cells[2]).toEqual({ gw: 3, chip: "wildcard", past: true, gap: false });
    expect(cells[1]).toEqual({ gw: 2, chip: null, past: true, gap: false });
  });

  test("fixes the expiry at GW19 whatever the record's own span is", () => {
    expect(CHIP_EXPIRY_GW).toBe(19);
  });

  test("marks a Gameweek nobody stored a Manager State for apart from an ordinary past one", () => {
    // The seeded Season's own shape again: GW4 is inside the span (past) but
    // is a Gap, and the strip must not read that as an unplayed Chip window
    // like every other past cell.
    const cells = chipStrip(5, [], [4]);
    expect(cells[3]).toEqual({ gw: 4, chip: null, past: true, gap: true });
    expect(cells[2]).toEqual({ gw: 3, chip: null, past: true, gap: false });
  });

  test("fixes the kicker's sentence to the same Gameweek", () => {
    expect(chipStripKicker())
      .toBe("Chip usage — first set expires at the GW19 deadline");
  });
});

describe("the Chip strip's legend", () => {
  test("names every Chip played and its Gameweek", () => {
    expect(chipLegend(
      [{ chip: "wildcard", gw: 3 }, { chip: "bench_boost", gw: 12 }], 6
    )).toEqual([
      { name: "Wildcard", when: "played GW3", chip: "wildcard" },
      { name: "Bench Boost", when: "played GW12", chip: "bench_boost" }
    ]);
  });

  test("states the absence rather than an unlit strip alone", () => {
    expect(chipLegend([], 8)).toEqual([
      { name: "No Chips played", when: "8 remaining across both halves", chip: null }
    ]);
  });

  test("says the record holds nothing rather than nought remaining", () => {
    expect(chipLegend([], null)[0]!.when).toBe("— remaining across both halves");
  });
});

describe("a captain's return", () => {
  test("draws a haul in the accent", () => {
    expect(captainReturnTone(12)).toBe("accent");
    expect(captainReturnTone(16)).toBe("accent");
  });

  test("mutes an ordinary week", () => {
    expect(captainReturnTone(11)).toBe("muted");
    expect(captainReturnTone(0)).toBe("muted");
  });

  test("mutes nobody wearing the armband the same as a small return", () => {
    // The null already tells a blank week apart from a nought
    // (`FplEntrantGameweek.captainPoints`); the tone need not repeat it.
    expect(captainReturnTone(null)).toBe("muted");
  });
});

describe("which of the two names beside a return actually earned it", () => {
  const CAPTAIN = { fplId: 13 };
  const VICE = { fplId: 8 };

  test("badges the captain wherever the captain played", () => {
    expect(captainWearerBadge({ captain: CAPTAIN, armband: { fplId: 13 } }))
      .toBe("C");
  });

  test("badges the vice where the captain did not play at all", () => {
    // The record's own reason the field exists: printing the return under
    // the Captain column alone would credit the captain with the vice's
    // score.
    expect(captainWearerBadge({ captain: CAPTAIN, armband: VICE })).toBe("V");
  });

  test("badges neither where nobody wore it", () => {
    expect(captainWearerBadge({ captain: CAPTAIN, armband: null })).toBeNull();
  });
});

describe("the operator footer", () => {
  test("labels the track's own record, not the sporting one beside it", () => {
    expect(operatorFooter(
      { repairs: 1, rollOvers: 0, hitPoints: 4, gaps: 0 }, "fpl-v1"
    )).toEqual([
      { label: "Repairs, Season", value: "1" },
      { label: "Roll Overs", value: "0" },
      { label: "Hit points", value: "4" },
      { label: "Gaps", value: "0" },
      { label: "Prompt Version", value: "fpl-v1" }
    ]);
  });

  test("says the record holds nothing rather than nought before the Season starts", () => {
    const rows = operatorFooter(
      { repairs: null, rollOvers: null, hitPoints: null, gaps: null }, "fpl-v1"
    );
    expect(rows.slice(0, 4).map(({ value }) => value))
      .toEqual(["—", "—", "—", "—"]);
  });
});
