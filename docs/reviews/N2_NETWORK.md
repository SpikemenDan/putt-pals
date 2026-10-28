# N2 guest recovery, capacity, interpolation and connection errors

Task: [N2 #13](https://github.com/SpikemenDan/putt-pals/issues/13). Product defaults confirmed by the user on 2026-10-28: **8 active players** (changed from the proposed 4) and a **30-second guest reconnect grace**. Host migration, matchmaking and anti-cheat stay out of scope.

## What changed

| Area | Behaviour |
| --- | --- |
| Capacity | `MAX_PLAYERS` is 8, and every wire and link limit derives from it. A full host sends a `reject` frame (`room-full`) and flushes it before closing, so the ninth player is told why instead of timing out. |
| Connection errors | Join failures appear on the start screen as text a player can act on: room full, timeout (suggests a TURN relay), signalling lost, identity rejected. A browser without `RTCPeerConnection` is told up front that online rooms need WebRTC (T1's WebKit finding). |
| Guest identity | A guest gets a stable peer ID per room code and tab (`sessionStorage`), plus a secret token sent in `JOIN_ROOM`. The host keeps tokens privately and never broadcasts them. A link for a token-owned seat must present the same token before its commands or presence count. A wrong or missing token is refused with `identity-rejected`. |
| Grace | When a guest's link drops without a `LEAVE`, the host holds the seat for 30 s, during which the guest still counts as connected. The guest reports `reconnecting` and retries every 2 s, as a guest only. A reload resumes the same seat and scores, and the name and room are prefilled. An explicit Leave forgets the identity. |
| Host loss | Guests never claim the host ID. After the grace period they see the existing "Connection lost" notice. |
| Liveness | The host re-sends its snapshot at least once a second, and guests ping once a second. A link silent for 5 s is treated as dropped, which runs the grace and reconnect flow. Without this, a crashed host went unnoticed for over a minute. The check is opt-in at the transport layer and enabled by the app. |
| Interpolation | Remote balls are drawn 100 ms behind, between the two presence samples around that time. Jumps over 300 units (portals, respawns) snap rather than glide. The newest sample is held rather than extrapolated, and the tracks reset on each putt. The local ball is unchanged. |
| Stale and duplicate messages | Existing per-link sequence, session, round and putt checks are unchanged. A reconnecting link starts a new sequence. A duplicate connected ID is still refused, and an unverified link is ignored. |

## Measurements (jsdom, in-memory transport)

- 8 players, late in the first map of a 9-map tournament, every guest moving with an attack in flight: the snapshot is **4,372 bytes** encoded, against the 65,536-byte message limit.
- Snapshot rate with all 7 guests moving: **14 per second** per guest (one per 70 ms tick). An idle lobby sends about 1 per second (heartbeat).

## Verification

jsdom and fake transports (`npm test`, all suites passing): network 14 scenarios, app 12, ui 12 and session. New scenarios cover capacity and room-full (memory and PeerJS-shaped), resume and identity theft, grace, liveness, interpolation, measurement, 8-player app play, guest recovery with a reload, and the no-WebRTC message.

Real browser, kept separate from the jsdom results: an ad hoc, uncommitted Playwright script ran the built app (`vite preview`) in Chromium 156.0.8078.4 with WebGL disabled. It used real PeerJS and WebRTC through a local PeerServer, on Windows 11.

1. Eight players join one room; the host shows "8 players".
2. A ninth is refused with "That room is full (8 players)…" and stays on the start screen.
3. A guest reloads, finds its name prefilled, rejoins and keeps the same peer ID; the host still shows 8 players.
4. All of a guest's peer connections are force-closed (simulated network loss). The guest shows "Reconnecting…" at once and reconnects by itself to the same seat about 2 s later.
5. The host tab closes, and separately the host browser context is killed without `pagehide`. Guests show "Reconnecting…" (immediately on a close, within about 10 s on a kill), then "Connection lost" after the 30 s grace. No guest becomes host.
6. There are zero page errors.

Not covered: Firefox and WebKit real-browser runs, play over TURN or a real WAN, and a committed spec. The Playwright harness is on T1's PR #37. Once that merges, these checks should become committed specs.
