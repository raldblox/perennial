# AI contract review

QoreChain's dashboard has an AI contract reviewer
(<https://dashboard.qorechain.io/audit>, described at
<https://docs.qorechain.io/dashboard/contract-auditor>). It reads pasted
source only, runs once a day per account for free, and is **not** a formal
audit. This file records what was submitted, every finding, and what was done
about each: a fix with its commit, or the reason it is a false positive.

Status: **not yet run.** The sections below are ready to fill in.

## How to run it

The review needs a signed-in dashboard account, so it is run by hand.

1. Open <https://dashboard.qorechain.io/audit> and sign in.
2. Choose the setting **Ethereum (EVM/Solidity)**.
3. Paste the files of one run, in the order listed, each preceded by a
   comment line with its path (`// contracts/src/PerennialVault.sol`). Paste
   the files as they are in the repository at the commit named below, not a
   flattened build: OpenZeppelin's code is not under review.
4. Save the full report text into the run's section below, under
   "Raw report", unedited.
5. For each finding, add a row to the run's table and decide its verdict.

The free tier allows one run a day, so the two runs take two days.

### Run 1: the vault

Commit: the tip of the branch being released (fill in the hash).

1. `contracts/src/PerennialVault.sol`
2. `contracts/src/libraries/PQCAuth.sol`
3. `contracts/src/interfaces/IQorePQC.sol`
4. `contracts/src/interfaces/IYieldSource.sol`

### Run 2: the sources

1. `contracts/src/adapters/ERC4626Source.sol`
2. `contracts/src/mocks/MockYieldSource.sol`
3. `contracts/src/interfaces/IYieldSource.sol`

## What the reviewer should know

Paste this paragraph above the code in each run, so findings that only
restate a design decision can be recognised quickly:

> Authority over sensitive actions is an ML-DSA-87 signature checked through
> QoreChain's `pqcVerify` (0x…0A01) and `pqcKeyStatus` (0x…0A02)
> precompiles, not `msg.sender`; anyone may relay. A call to an inactive
> precompile returns empty data, so every call checks the return length and
> fails closed. The vault has no admin, no pause and no upgrade path by
> design. `harvest`, `triggerSuccession` and `distribute` are permissionless
> by design. The principal is never paid out; `closeByOwner` returns it only
> when the owner kept that right at opening. `MockYieldSource` is a test
> fixture that pays a fixed rate from a funded reserve.

## Run 1 results

Date: · Commit: · Setting: Ethereum (EVM/Solidity)

| # | Finding (as reported) | Severity | Location | Verdict | Fix or reason |
|---|---|---|---|---|---|
| | | | | | |

Raw report:

```
(paste here)
```

## Run 2 results

Date: · Commit: · Setting: Ethereum (EVM/Solidity)

| # | Finding (as reported) | Severity | Location | Verdict | Fix or reason |
|---|---|---|---|---|---|
| | | | | | |

Raw report:

```
(paste here)
```

## Verdicts

- **Fixed**: the finding was right; name the commit that fixes it and the
  test that now covers it.
- **False positive**: the finding misreads the code or the design; say which
  line or decision shows it, in one or two sentences.
- **Accepted**: the finding is right and is not changed; say why, and add it
  to the known limitations in the [threat model](threat-model.md).

A fix to `contracts/src` means a new deployment; the deployed vaults do not
change. Record any redeployment in [deployments](deployments.md).
