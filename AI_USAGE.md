# How AI was used to build Perennial

Perennial was written with Claude, Anthropic's model, working as a coding
agent (Claude Code, in the Claude desktop app) under the direction of one
person, the repository's owner. This file records what that means in
practice. It is kept factual and updated with the project.

## Who wrote what

- **Code, tests, documentation and commits** were written by Claude. Every
  commit in this repository carries a `Co-Authored-By` trailer naming the
  model: as of 22 November 2026, 80 of 104 commits name Claude Opus 5.5 and
  24 name Claude Fable 5.2. Commits are authored under the owner's account
  because the owner is responsible for them.
- **Decisions** were the owner's. Claude proposed options and wrote them up
  as decision records in [`docs/decisions/`](docs/decisions); the owner chose.
  Among them: what Perennial is for (an inference budget an agent spends,
  rules first and yield optional), budget mode and income from anyone, three
  testnet vaults and their rates, retiring the earlier test deployments,
  naming, and which QoreChain kits to integrate.
- **Anything that spends or publishes** was approved by the owner first:
  every testnet deployment and transaction batch (with a balance floor the
  agent had to respect), sending QOR to the deployer, signing in to and
  editing the project's pages on other sites, and deploying the web app.
  The owner ran the adversarial key-recovery exercise against the deployed
  vault personally.

## How the work was organised

- One coordinating Claude session held the owner's decisions and wrote each
  round's brief. Separate Claude sessions built each project (Perennial,
  PQ-402, Overwinter) and reported back with commits, command output,
  transaction hashes and balances.
- Secrets stayed out of the model's context: the deployer's recovery phrase
  is loaded only by scripts through `--env-file`, never printed or read back;
  EVM windows were scoped to the contracts being called and closed after use.
- Work happens on a branch; the owner merges and pushes.

## How changes were reviewed and tested

- **Contracts:** `forge fmt --check` and `forge test` before every commit:
  unit, fuzz and invariant tests (183 passing on 22 November 2026), including
  an explicit invariant that no payout exceeds the rate limit or what the
  position holds; optional fork tests against Aave and sDAI on Ethereum;
  tests against the QoreChain Asset Kit's ERC-4626 vault.
- **Review:** the first AI contract review (QoreChain dashboard, 16 November
  2026) is answered finding by finding in [`docs/AUDIT.md`](docs/AUDIT.md),
  each with a test. The coordinating session re-ran the test suites
  independently. No human security audit has been done.
- **On chain:** deployed bytecode was compared with a local build of the
  recorded commit; spends were made live with real ML-DSA-87 signatures.
- **App:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, chain mocked)
  and `pnpm build`, plus browser screenshots at phone and desktop widths in
  light and dark.

## Limits

An AI agent can be wrong with confidence. The tests, the decision records,
the threat model and the AI review exist so that its work can be checked
rather than trusted. Treat the contracts as unaudited testnet code.
