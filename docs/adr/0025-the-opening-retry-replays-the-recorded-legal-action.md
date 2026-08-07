# The opening retry replays the recorded legal action

The FPL track's opening is all-or-none by design: `startFplTrack` commits nine opening
Manager States or none. But the call layer beneath it had no memory — a retry after one
seat's failure re-called every seat, re-billing answers already legally given and already
on the record. The season's dry opening measured the waste directly: forty-two Entrant
calls to obtain nine legal actions across three runs, where replay would have needed
roughly twenty-four. From now on a retry of the opening replays instead: a seat with a
recorded legal attempt for the Gameweek has its accepted action read back out of
`attempts.raw_response`, parsed at the point of use, and replayed through the rules
reducer as if freshly answered — no model call, full validation, all-or-none commit
unchanged. This is fair because the stored context is written `on conflict do nothing`:
every retry hands every seat the byte-identical text under the same hash, so a replayed
answer is an answer to exactly the question being asked. It is also the opening-side twin
of ADR 0011's fill discipline — a re-run fills what is missing and never re-asks what is
already answered; the season-long scheduled runs have obeyed it all along by skipping any
seat that holds the Gameweek's Manager State.

## Considered options

- **Committing the opening per seat**, as the weekly runs do, was rejected: it buys the
  same saving only by rewriting spec 0003's decision that the track starts for all nine
  Base Models at once or not at all. Replay leaves that decision alone.
- **Trusting the recorded `ok` flag and skipping straight to commit** was rejected:
  replay through the reducer costs nothing, re-proves legality against the state actually
  being committed, and turns any drift between two runs into a loud error instead of a
  silently committed stale action.
- **Persisting the parsed action, or a foreign key from attempts to contexts**, was
  rejected: `raw_response` already holds the accepted action byte-for-byte, the implicit
  key (season, Gameweek, track, seat) already reaches the context row, and byte-equality
  of the context across retries holds by construction — a migration would add a second
  copy of facts the audit trail already states.
