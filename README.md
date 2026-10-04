# Travel Nepal — 3D

A three.js version of **Travel Nepal**, the reality travel adventure board game by
Vajra Portal Pvt. Ltd. Hot-seat for now: two to four travelers share one device.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The start screen offers three ways to play:
on this device (hot-seat), host an online room, or join one.

| URL parameter | Effect |
| --- | --- |
| `?seed=42` | Replay an identical game. Same seed ⇒ same dice, same shuffles. |
| `?players=4` | Two to four travelers (default 2). |
| `?auto=1` | The travelers play themselves — a demo, and a flow smoke-test. |

Space bar triggers whatever the current primary action is (spin, draw, end turn…). Drag to orbit, scroll
to zoom. At a junction, click a glowing tile or use the buttons in the panel.

## What's built

The **full printed board**: 174 tiles traced square-by-square off a photo of the
cardboard original, in the same places. The main road (107 tiles) runs out of
Tribhuvan International Airport through Nepal Mandal and its red ticket lane,
down to Chitwan, west through Lumbini, up into Pokhara and round the lake,
through the Himalayan villages, across the top and back down the Kathmandu road
to Departure. Four gated trips hang off junctions on that road — the
**Eastern Trip**, **Western Terai Trip**, **Western Hillside Trip** and
**Mountain Expedition** — each behind its printed IN arrow. Every section has
its own card deck.

Implemented from the printed rules:

- **Checkpoints** are hard stops. Whatever you rolled, you stop, and you play a
  mini-game for an entry ticket.
- **Ticket counters** sell an entry ticket for a deeper trip.
- **Junctions** hand you the ticket outright if you stop on one, then you choose
  a road. Sub-sections are gated: no ticket, no entry.
- **Cards** are drawn from the deck of the section you stopped in. Collectables
  (Photograph, Souvenir) score; Moments (Travel & Tour, Get Together, 1v1, 2v2)
  come with a mini-game; Wild cards apply an effect and never enter the passport.
- **Wild effects**: Hire a Bike (five single-die rolls), Home Sick / Duty Call
  (ten steps forward), Extend Vacation (ten steps back).
- **Scoring**: passport points, ties broken by number of cards.

## The world around the board

All renderer-side (nothing in `src/engine/` changed):

- **Environment** (`render/environment.ts`): a painted sky dome with a morning sun,
  the valley the board sits in (terraced foothills, ~1,600 instanced pines), the
  Himalaya in three rows of faceted peaks with Machhapuchhre's fishtail, and
  drifting clouds. A slow camera fly-in opens the game; any drag skips it.
- **The board** (`render/board3d.ts`): a printed card face with a dhaka-weave
  border, corner mandalas and the title; a lacquered wooden frame with brass
  corners; bevelled tiles; checkpoint barriers with a STOP sign and blinking lamp;
  junction choices glow with a ring and a beam of light.
- **Props** (`render/props.ts`): Boudhanath with its painted eyes and 13-ring
  spire, Newar pagodas with flared eaves, a shikhara, chortens, a Bodhi tree,
  rhododendrons, a suspension footbridge, base-camp tents, an airport with a
  runway and a pagoda-roofed terminal — and prayer flags strung everywhere,
  fluttering.
- **Life** (`render/life.ts`): a flock of birds, a mountain-flight jet circling
  the range, paragliders over Phewa Lake, chimney smoke in the Himalayan
  village; plus turning prayer wheels, bobbing doongas, rippling water, a rhino
  and an elephant that move.
- **Pawns** (`render/pawn.ts`): little travelers (hat, jacket, backpack and
  bedroll) on brass-rimmed bases; the active one has a spinning gem overhead
  and a glowing ring underfoot; hops squash-and-stretch and kick up dust.
- **Post** (`render/scene.ts`): image-based lighting, soft shadows, a restrained
  bloom (only beacons and highlights glow), a vignette, and valley haze.

## Playing online

Someone hosts a room and gets a 4-letter code and an invite link; up to three
friends join from their own devices; the host presses Start. Everyone sees the
same board and every move live, and only the traveler whose turn it is can act.

```bash
npm run online      # build the game and serve it, with rooms, on :8787
```

Then open http://localhost:8787. Friends on the same Wi-Fi open
`http://<your computer's IP>:8787`. While developing, run `npm run server` in
one terminal and `npm run dev` in another — Vite proxies `/ws` to the server.

To play over the internet, deploy it as one web service — for example on
Render (a `render.yaml` blueprint is included): **Build command**
`npm install --include=dev && npm run build`, **Start command** `npm start`,
Node 22.6+. The server reads `PORT` from the environment. Don't use
`npm run dev` as the start command on a host: that's the Vite dev server, which
has no rooms (and blocks unknown hostnames).

How it works (`server/index.ts`, `src/net/`):

- **The server owns the game.** It keeps the one true `GameState`, checks that
  an action comes from the traveler whose turn it is, applies it with the same
  pure reducer, and broadcasts it. Every browser applies the same action to its
  own copy and plays the animation — a checksum after each action catches any
  drift, and a drifted client asks for a fresh snapshot.
- **Mini-games are played on everyone's own screen at once.** In a duel, each
  participant plays the same round on their device; the server collects the
  scores, judges them (`ui/minigames/pick.ts`, shared with the browser) and
  applies the result.
- **Dropping out is fine.** A refresh or a lost connection rejoins the same
  seat automatically. If the traveler whose turn it is stays away for 20
  seconds, the server plays their turn for them until they're back; a missing
  duelist scores 0.
- `?quality=low` turns off shadows and bloom and lowers the resolution — handy
  for phones.

`npm run netsim` (with the server running) plays whole online games with 2–4
bot clients over real sockets and checks every client stays in sync.

## The prayer-wheel spinner

Movement is one spin of the **Maane** — an eight-sided brass prayer wheel
(`render/spinner3d.ts`) — for 1 to 8 steps. It whirls beside the traveler and
settles with the number turned to the camera under a red pointer. On a hired
bike each spin is halved (rounded up) for five turns. Because a spin averages
4.5 steps rather than the old two-dice 10, a game now runs about twice as many
turns.

## Mini-games

Checkpoints, Travel & Tour cards and duel cards now play a real game instead
of a dice-off (`ui/minigames/`). Each card has a game themed to it:

| Game | How it plays | Used for |
| --- | --- | --- |
| Checkpoint Stamp | Stop the swinging stamp in the permit box, three times | Every checkpoint; boating, zipline, ridge walk |
| Summit Sprint | Alternate ← → (or tap two buttons) to climb for 8 s | Sherpa guide, summit race, tea-house race, chhurpi |
| Catch! | Move the plate/basket to catch good things, dodge bad | Momo contest, tea picking, cycling, paragliding, rafting |
| Snapshot | Frame the moving animal and take three photos | Jeep safari, tiger tracking, bird count |
| Prayer Flag Memory | Repeat a growing sequence of flag colours | Siddha Cave, Maghi dance, meditation |
| Pair Up | Find six matching picture pairs in 35 s | Gurung homestay |
| Guide's Quiz | Three questions built from the cards' own text | Heritage walk and other tours |

Solo games must reach a target score (the card's old dice target picks easy,
medium or hard). Duels are hot-seat: each traveler plays the same round in
turn and the active player needs the best score. The UI sends the scores with
`PLAY_MINIGAME`, so the reducer stays pure and replays stay exact; without a
result (autoplay, `npm run sim`) it falls back to the Ashtamangal die.

## Cards, the hand and the score

- **Card art** (`ui/cardart.ts`): every card in the decks has its own painted
  illustration, drawn in code in a travel-poster style. To use real artwork
  instead, add `"image": "cards/<id>.jpg"` to a card in its deck JSON and put
  the file in `public/cards/`.
- **The card** (`ui/cardview.ts`): deck-coloured border, category, gold points
  medallion, picture, title and blurb. Drawn cards deal in with a flip and tilt
  toward the pointer.
- **The hand** (`ui/hand.ts`): the passport fans out along the bottom of the
  screen. Hover lifts a card, click opens it in the viewer (← → to page
  through, Esc to close). Collected cards fly from the table into the hand.
  Click a traveler in the scoreboard to look at their hand.
- **Score counter**: the passport total sits beside the hand and ticks up with
  a "+points" pop when a card lands; the scoreboard counts up too.
- **Roads** are smooth curved ribbons now, and tiles turn to follow them.

## Layout

```
src/
  engine/     the rules — pure, deterministic, no three.js, no DOM
  data/       the board graph and the card decks, as JSON
  render/     three.js: board, pawns, dice, scenery, camera
  ui/         the side panel, cards and hand, mini-games, the lobby
  net/        the wire protocol and the browser's socket client
  main.ts     wiring, and the single dispatch chokepoint
server/       the room server (and netsim, its online test)
```

**`src/engine/` must never import three.js.** It is a pure reducer over a seeded
RNG: `applyAction(state, action) -> state`. The renderer reads that state and
draws it; animations never decide anything, they only play out a result the
reducer has already committed to.

That boundary is what made multiplayer an addition rather than a rewrite —
every mutation is a serializable `Action`, every random draw goes through a
seeded stream stored in state, and the server runs the very same reducer.

## Changing the board

`src/data/board.full.json` is generated — don't hand-edit it. The tile
positions live in `tools/gen_board.py` as pixel coordinates on the board photo
(x right, y down), so the 3D board keeps the printed geography:

```bash
python3 tools/gen_board.py src/data/board.full.json            # regenerate
python3 tools/gen_board.py out.json board-photo.png preview.png # + overlay check
```

A node is `{ id, section, kind, next[], pos[x,y,z] }`, plus `requiresTicket`
on the first tile of a gated trip and `ticketReward` on checkpoints and on the
red ticket squares (each sells the trip printed on it). Decks are in
`src/data/decks/` (`tools/gen_decks.py` writes the six newer ones), registered in
`DECK_FILES` in `src/main.ts` and `src/engine/sim.ts`. Scenery in
`src/render/scenery.ts` uses the same photo coordinates. The old slice is kept
as `src/data/board.vertical-slice.json`.

## Checking it

```bash
npm run typecheck   # tsc --noEmit
npm run sim         # 60 headless games, rule invariants + determinism
npm run build       # production bundle
```

`npm run sim` plays whole games with the autoplayer and asserts the things that
would be painful to find by hand: nobody enters a gated section without a ticket,
no move runs through a checkpoint, decks reshuffle instead of running dry,
non-passport cards never reach a passport, and two games from the same seed
produce byte-identical results.

## Not in this version

Modelled
(GLTF) temples and mountains · sound · save/resume · per-player difficulty settings.
