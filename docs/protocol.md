# Table protocol

The host phone serves `GET /` (the web client) and `GET /ws` (WebSocket). All messages are JSON objects with a `t` field. The server is authoritative: clients send intents and receive full snapshots.

## Client → server
| `t` | Fields | Who | Effect |
|---|---|---|---|
| `hello` | `host?`, `seat?` | anyone | Identify. `host` (token) counts only from loopback. `seat` is a stored seat token. |
| `claim` | `id` | guest | Take a seat. Issues a new seat token and revokes the old one. |
| `join` | `name` | guest | Add yourself as a new player (posts a BB next hand), then claim. |
| `leave` | | player | Give up the seat on this device. |
| `act` | `id`, `move` (`fold`/`check`/`call`/`raise`), `to`, `seq` | player (self) or host | Betting action. `to` is raise-to. A stale `seq` is rejected. |
| `undo` | `seq` | host, or the player whose action was last | Pop the last event and replay. |
| `eval` | `board`, `hands[{name,cards}]` | anyone | Referee calculator; replies `eval`. |
| `cmd` | `c`, … | host | `setup`, `deal`, `award{ranking}`, `awardCards{board,holes}`, `add`, `remove`, `sitout`, `sitin`, `rebuy`, `adjust`, `rename`, `reorder`, `button`, `settings`, `timer{do}`, `end`, `reopen`, `reset`, `lan{open}` |
| `ping` | | anyone | Replies `pong` (used for health checks). |

## Server → client
| `t` | Fields |
|---|---|
| `welcome` | `role` (`host`/`player`/`guest`), `id` |
| `seat` | `token`, `id`. The client stores the token for silent rejoin. |
| `state` | `s`: the full snapshot (see `web/src/types.ts` `Snap`), broadcast on every change |
| `eval` | `r`: `{hands[{name,desc,cat,best}], winners, text, final}` |
| `error` | `msg` (human-readable), `stale` |

Snapshots carry `seq`, which increases on every game or config change. Presence changes rebroadcast without bumping it. Cards use two-character text: `As`, `Td`, `9h`.
