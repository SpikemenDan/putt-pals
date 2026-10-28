# Embedded third-party inventory

This records what is actually embedded in putt-pals.html. It does not identify every transitive component in minified bundles or establish byte-for-byte identity with an upstream release archive.

| Component | Embedded version evidence | License evidence | Reference |
| --- | --- | --- | --- |
| Three.js | Runtime THREE.REVISION is 128, corresponding to package version 0.128.0 | Header: Copyright 2010–2021 Three.js Authors; SPDX-License-Identifier: MIT | https://github.com/mrdoob/three.js/tree/r128 |
| PeerJS | Embedded package JSON says name peerjs, version 1.5.4 | Same embedded metadata says license MIT | https://github.com/peers/peerjs/tree/v1.5.4 |

Exact byte lengths and SHA-256 hashes of the embedded script bodies are in tests/fixtures/source-inventory.json. The script body is measured after the `/* ... (inlined) */` marker and before its closing script tag, including its own leading/trailing whitespace. These boundaries match the inventory tool; they are not hashes of downloaded npm artifacts.

Generate/check with:

```sh
node scripts/inventory-baseline.cjs --write
node scripts/inventory-baseline.cjs --check
```

The tool evaluates the trusted local Three.js bundle in an isolated VM to read its revision and parses PeerJS's embedded package metadata. It uses the existing legacy headless loader for course and simulation data. It does not contact upstream servers or execute PeerJS networking.

## Provenance limits and migration handling

- Both direct libraries have MIT identifiers in the checked source. Complete upstream license texts and a complete bundled transitive-notice inventory have not been reconstructed by this task. Preserve existing comments/notices and verify upstream artifacts and required notices when replacing the embedded libraries with managed runtime dependencies.
- Three.js version 0.128.0 is inferred from the runtime revision, not from a separately embedded full package manifest. A locally modified bundle could report the same version; source hashes make that distinction visible.
- PeerJS includes bundled support code, such as WebRTC adapter and serialization/event helpers. Do not assume its direct package license field constitutes a full transitive attribution audit.
- B3's Vite 8.3.5 and jsdom 30.1.3 are development dependencies tracked by package-lock.json. They are not newly embedded game-runtime dependencies. This task leaves their versions and the lockfile unchanged.
- PeerJS's embedded default configuration includes STUN and public TURN endpoint entries. With an empty lobby ICE array the application uses PeerJS defaults; a nonempty array replaces the ICE configuration. The project has not provisioned or verified a relay service, its credentials, availability or capacity. The embedded endpoint entries are not proof of working or guaranteed TURN connectivity.

Keep procedural game meshes, shaders, textures, map definitions and WebAudio code separate from third-party dependencies when extracting modules. No external image, audio, font or model assets were introduced by B1.

## Modular renderer upgrade (R2)

The modular app's direct Three.js dependency is pinned to **0.186.1** in package.json/package-lock.json. The installed package declares MIT and supplies the complete license retained at [licenses/THREE.txt](licenses/THREE.txt). Upstream source: https://github.com/mrdoob/three.js/tree/r186 . This changes the npm renderer only; the embedded r128 inventory above and its source hashes remain historical/legacy evidence. See [R2 renderer review](reviews/R2_RENDERER.md) for migration checks and browser limits. Final hosted-distribution notices remain part of Q1's packaging review.
