# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `PerennialVault`: open and top up a position, permissionless harvest,
  scheduled claims, proof-of-life check-in, heir updates, succession with a
  grace period, distribution to heirs, and an optional close by the owner.
- `PQCAuth`: ML-DSA-87 authorisation of sensitive actions through
  QoreChain's `pqcKeyStatus` and `pqcVerify` precompiles.
- `IYieldSource`, an ERC-4626 subset, and `MockYieldSource`.
- Unit, fuzz and invariant tests.
- Testnet deploy script and the EVM window helper.
- Research notes and design decisions 001 and 002.
- End-to-end script against the testnet deployment, and contract-scoped
  EVM windows in the window helper.

- Web app (`app/`): overview with a sizing calculator and live figures read
  from the vault, opening a position with heirs and a review step, a page per
  position with its deadlines, history and every vault action, and position
  lookup by number, address, unlocked account or connected QoreX account.
- In-browser signing from a recovery phrase held in the tab's memory, with
  EVM windows scoped to the vault and its asset (decision 003).
- Cover image, link preview and icons generated from the app's design tokens
  (`pnpm brand`).
- Threat model, decision 003, and CI for the app.

### Changed

- The README leads with the product as an on-chain endowment rather than a
  pension.
- The vault calls the chain's fixed PQC precompile addresses instead of
  taking them as constructor arguments, and refuses to deploy where they are
  inactive.
