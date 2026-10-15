# Ticket: The runbooks name the Guest door

**What to build:** an operator reading "A new Base Model arrives" sees the Guest Seat as a
door beside the Exhibition Run and waiting for an Edition. The runbook says when each door
fits:
- a Guest when the question is whether the Base Model can forecast;
- an Exhibition when the question is only where it would have stood;
- an Edition when a roster ADR is due.

An operator reading "Opening an Edition" is told to settle every Guest at the boundary:
seat it, renew it, or withdraw it at the boundary's first Lock. A Guest the ADR does not
name is withdrawn. Spec: [0029](../specs/0029-guest-seats.md). Decision:
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md).

**Blocked by:** [0114](0114-a-guest-answers-at-the-lock-and-stands-nowhere-yet.md),
[0118](0118-the-exhibition-replay-stops-where-its-guest-begins.md). A door is documented
once it exists.

---

## What is already known

- **The Guest door's steps, in order:**
  1. an ADR naming the Base Model, its pin, its Competitions and its pre-approved spend,
     with at most two Guests at once;
  2. a pre-flight in every Competition the Base Model has not answered;
  3. the insert, which sets the first Lock;
  4. a top-up replay of any Exhibition row to that Lock;
  5. no further Exhibition replay.
- **The decision table in section 1** gains a row. Section 6 says the Exhibition row stops
  where a Guest begins.

## Acceptance

- [ ] "A new Base Model arrives" lists the Guest door, its steps and when to choose it
- [ ] "Opening an Edition" has the step that settles every Guest, and says silence ends it
- [ ] Both name ADR-0064 and point at ADR-0065 as the worked example
