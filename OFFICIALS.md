# Officials on fight night

## Sign in

The login page has three roles, in this order: **Admin**, **Referee**, **Judge**.
Promoter accounts sign in with **Admin** and keep promoter access. Everyone signs in
with their name and PIN, as before.

## Judges take their own seat

Bouts no longer have judges or a referee assigned in *Edit Bout*.

1. A judge opens the bout's **Memory Sheet**. Every judge sees the link in the bout list.
2. The judge types their name and chooses **Judge No. 1, 2 or 3**.
3. A seat that is already taken is not offered. If two judges pick the same number at
   the same moment, the second is asked to choose another.

A judge can change seat until they have submitted a card on that bout. The name they
type is the one shown on the scoreboard and in the officials list.

## The referee runs the bout

Only a **Referee** (or management) has:

- **Start round N**: starts the round clock on every tablet.
- **Stop round**: stops it. The clock also stops by itself when the round time is up,
  as long as the referee's sheet is open.
- the **finish buttons** (KO, TKO, Submission, …).

Any signed-in referee can do this on any bout. The first referee to start a bout is
recorded as its referee.

## Judges score and submit

- Judges mark the round while the clock runs. They have no start, stop or finish buttons.
- **Submit** turns on once the referee stops the round, or once the round time is up.
- When every seated judge has submitted, each judge's sheet moves to the next round,
  and the referee gets **Start round N**.
- A bout is decided by the judges who took a seat (one, two or three).

## Setup

Run `config/migrations/005_judge_seats_and_referee_control.sql` once in the WDS
Supabase project (SQL Editor), then upload `index.html` and `supabase-bridge.js`.

## Note for developers

These changes are made directly in the built app inside `index.html`, because
`src/` in this repo is older than the live app (it lacks the newer scoring criteria
and other changes). Do not rebuild `index.html` from `src/` without first porting
those changes back to `src/`.

## Deleting an official

Officials → **Edit** → **Delete official**:

- **Never submitted a judge's scorecard:** the official is deleted from the database,
  including their login, PIN, profile and invite. They disappear from the list, and the
  same email can be added again later. Bouts they refereed keep their results.
- **Has submitted scorecards:** they can't be deleted, because that would erase their
  cards from past bouts. They are made inactive instead (they can no longer sign in),
  and a message says so.
- You can't delete yourself or the last active admin.

Needs `config/migrations/006_delete_officials.sql`.
