# zkAttest Artifact Manifest

Generated for reviewer traceability on 2026-06-08.

## Real zkEmail-Derived Circuit

| Field | Value |
|---|---|
| Circuit name | `zkattest_email` |
| Circuit source | `real-circuit/zkattest_email.circom` |
| Circuit source SHA256 | `402d2ad03d1ae0078322dd28b81e127cdda3051338f797032458c64cc5206f18` |
| Constraint count | approximately 315k |
| Public inputs | 3 (`pubkeyHash`, `shaHi`, `shaLo`) |
| Verification key | `real-circuit/verification_key.json` and `spike/verification_key.json` |
| Verifier source | `real-circuit/Verifier.sol` and `spike/Verifier.sol` |
| Verifier bytecode | `real-circuit/Verifier.pvm` and `spike/Verifier.pvm` |
| Asset Hub verifier contract | `0xca1a3ad129e204d9af942a30f7f09282d20e28bf` |
| Deploy tx | `0x271f59aa8c7670809efb8f76c594628cc0eeb8bc9f68f796ca8eff8a8fbf1edc` |
| Verify tx | `0x82bdae3a8530797f890d41d279daccc087d3a4e7e35ecaf2b99275cad4f71acc` |

Hosted R2 artifacts:

| Artifact | URL | SHA256 |
|---|---|---|
| WASM | `https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/email_ownership/circuit.wasm` | `c5f1ad1b166b7d4645314cf7e0aa269a402040f1546d7cd61b5f4d3311db7e9a` |
| zkey | `https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/email_ownership/circuit_final.zkey` | `269565491d0f26b6418879b7d03f2bfa7d807969c567a3d0a512f7c9b5b96b4f` |
| verification key | `https://pub-a34a2db2f64d4ca1b7914c0cfe6652fc.r2.dev/email_ownership/verification_key.json` | `4845c55392c0344a9f53949854ffe9a4d09f72fc5925d521ca99a0a581268d49` |

Tracked local artifact hashes:

| Path | SHA256 |
|---|---|
| `real-circuit/Verifier.abi` | `b51452372460e81cdd06a20cb5ad0bdd6d01704d53921c7b7b47d5a8fc1ee836` |
| `real-circuit/Verifier.pvm` | `befd5c8463e7bcda3f2b0971169c848b9720c3d63f1eabfdbb29ac673d2332f7` |
| `real-circuit/Verifier.sol` | `9b0b5ad48da4628a77e6fdefbdb49aa674d6b70140d36fd8e0b4996f3d5effa3` |
| `real-circuit/test-proof.mjs` | `b1e0274bee26eb7c9822eebf11bf18b8f7d523d18ef9f6aa128ecac5326e2de0` |
| `real-circuit/verification_key.json` | `4845c55392c0344a9f53949854ffe9a4d09f72fc5925d521ca99a0a581268d49` |
| `spike/circuit.wasm` | `c5f1ad1b166b7d4645314cf7e0aa269a402040f1546d7cd61b5f4d3311db7e9a` |
| `spike/Verifier.pvm` | `befd5c8463e7bcda3f2b0971169c848b9720c3d63f1eabfdbb29ac673d2332f7` |
| `spike/Verifier.sol` | `9b0b5ad48da4628a77e6fdefbdb49aa674d6b70140d36fd8e0b4996f3d5effa3` |
| `spike/verification_key.json` | `4845c55392c0344a9f53949854ffe9a4d09f72fc5925d521ca99a0a581268d49` |

Tool versions recorded in project docs:

| Tool | Version |
|---|---|
| `@zk-email/circuits` | 6.3.4 |
| `@zk-email/helpers` | 6.4.2 |
| `snarkjs` | 0.7.6 |
| `resolc` | 1.1.0 |
| `solc` | 0.8.30 |
| Node.js used for this manifest pass | 22.16.0 |

## Toy Browser Circuit

| Field | Value |
|---|---|
| Circuit source | `web/circuit/circuit.circom` |
| Circuit source SHA256 | `2ab82eb5526b53cad3bce4dd4a5d46d9f64ae1c1d034b4d60c12bbe4dc7920fb` |
| Verifier contract | `0x4fa8678fb0188b29e49254759fb876eecdede468` |
| Verify tx | `0xe3e11b8a2b386e2aa77dd8168d7aac7200bb83529f44ad1d92e2922e061f76a8` |

Toy browser artifact hashes:

| Path | SHA256 |
|---|---|
| `web/circuit/circuit.wasm` | `8968bfc517ba7a3950d8703dc2f0c4f709329efb273cf50e02a59a71038c8fdc` |
| `web/circuit/circuit_final.zkey` | `cb79a7a0de07ea40ad20ebeff0d2095833e9b18c93a2ef95c770e9e868e31acc` |
| `web/circuit/verification_key.json` | `545f08f5ed3f4e5e304770ed5044cdac084b2f6531c792d322042c51c9cb5fbf` |
| `web/circuit/snarkjs.min.js` | `3f61bbd9ac0a10173902eaef65b510fa4e9a2c057f759c7f18a6d0446b20fd06` |
