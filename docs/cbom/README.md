# Cryptographic bill of materials

`contracts.cbom.json` is a CycloneDX 1.6 CBOM of `contracts/src` and of the
deployer account's key status on the testnet, written by
[QoreScan Community](https://github.com/qorechain/qorescan) 0.1.0. It lists
each cryptographic primitive the contracts use and where.

It is produced by `.github/workflows/cbom.yml`, which builds QoreScan from
source at a pinned commit, and locally by `pnpm cbom` in `contracts/` (the npm
launcher verifies the release binary's SHA-256 before running it).

Status: the workflow and script are in place; the first CBOM has not been
generated yet. Until it is committed here, the expected inventory is the one
in the [threat model](../threat-model.md#cryptographic-inventory).

QoreScan output is an inventory aid, not a certification.
