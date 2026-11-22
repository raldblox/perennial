# Set up an agent, end to end

An AI agent with an inference budget it spends and nobody can steal: its
owner funds a Perennial position, the agent pays each model call from it
with its own ML-DSA-87 key through PQ-402, and an Overwinter service sells
the inference. Every step below runs on the QoreChain testnet
(`qorechain-diana`, EVM chain id 9800); `contracts/scripts/agent-lifecycle.ts`
runs them all in one go.

Two people, two accounts:

| Who | Account | Holds | Signs |
|---|---|---|---|
| **Owner** | `QORE_MNEMONIC` in `contracts/.env` | the deposit, the right to close | the window, the deposit, the close (ML-DSA-87) |
| **Agent** | `AGENT_MNEMONIC` in `contracts/.env.agent` | its own keys, some QOR for its own registration fees | each payment (ML-DSA-87) |

Both files are git-ignored. Use phrases made for the testnet.

## 0. Prepare

```bash
cd contracts
pnpm install
pnpm agent-lifecycle agent-new
pnpm agent-lifecycle status
```

`agent-new` writes a fresh agent phrase to `.env.agent` and prints nothing
secret. `status` shows both accounts: QOR, fUSD, keys and EVM window. The
owner needs QOR for fees (the faucet), fUSD as an ERC-20 (the in-app swap or
`pnpm swap`) and a registered ML-DSA-87 key (`pnpm window register`).

## 1. The owner funds the agent's fees and the agent registers its keys

```bash
pnpm agent-lifecycle fund-agent 0.3
pnpm agent-lifecycle agent-register
```

The agent registers its own ML-DSA-87 key, with a proof of possession, and
its ML-KEM-1024 key, which Overwinter seals answers to. The owner never sees
the agent's keys. The vault refuses a beneficiary without a proven key.

## 2. The owner opens a window and a budget-mode position for the agent

```bash
pnpm agent-lifecycle window-open 12
pnpm agent-lifecycle open 0.05 0.01
```

The window is scoped to the vault and fUSD: it admits calls to those two
contracts only. The position: 0.05 fUSD in Perennial's no-yield vault, budget
mode, at most 0.01 fUSD per day across spends and claims, the owner as heir,
the owner able to close. The approval is for exactly the deposit.

## 3. An Overwinter service sells the inference

Overwinter is self-hosted ([github.com/raldblox/overwinter](https://github.com/raldblox/overwinter)).
In testnet mode its gateway account is paid, signs receipts and relays each
payment to the vault, paying the gas. Here the owner's account is the
gateway, so it uses the owner's window:

```bash
cd ../../overwinter
pnpm install && pnpm build
# .env (git-ignored): OVERWINTER_MODE=testnet, GATEWAY_MNEMONIC=<the gateway's phrase>,
# PERENNIAL_VAULT=0x76DAC5461fF361f911e5F39810c9455a6180C180, MAX_FEE_GWEI=150
pnpm service
```

The gateway needs a registered ML-DSA-87 key and ML-KEM-1024 key (PQ-402's
`pnpm testnet register` and `register-kem`).

## 4. The agent pays for inference, call by call

First the owner (or anyone) pays income into the position's buffer, so the
calls are paid from it:

```bash
pnpm agent-lifecycle fund <position> 0.01
OVERWINTER_URL=http://127.0.0.1:4020 pnpm agent-lifecycle pay <position> 2
```

Why fund first: with an empty buffer, a budget-mode `spend` draws on the
principal, which redeems shares from the yield source and costs more gas
than a spend from the buffer. Overwinter's gateway sends `spend` with a
350,000 gas limit; on 23 November 2026 a principal-drawing spend ran out of
gas at exactly that limit (`0xbacd85244ff115139ef555e01ab93fa42e09ffc2cf8c1bc497453c53eca75d26`,
reverted, nothing paid). Paid from the buffer, the same calls settled.

Each call: the service answers `402` with the price and the `pq-perennial`
scheme; the agent seals its prompt to the service's ML-KEM-1024 key and
signs a Perennial `spend` for exactly that request with its ML-DSA-87 key
(`@pq402/client`); the service relays `vault.spend(...)`, the vault checks the
signature in the contract and the budget, and emits `Spent` with the
request's hash as `ref`; the agent checks the service's signed receipt
against its on-chain key and opens the sealed answer. The agent needs no QOR
and no window to pay.

## 5. The owner reads the ledger, tops up, and closes

```bash
pnpm agent-lifecycle ledger <position>
pnpm agent-lifecycle fund <position> 0.01
pnpm agent-lifecycle close <position>
```

The same ledger is the position's page in the app:
`https://perennial-flax.vercel.app/#/position/noyield/<position>`.
`ledger` lists every event of the position with its transaction and `ref`.
`fund` pays income into the buffer; anyone may. `close` is signed with the
owner's ML-DSA-87 key: the principal returns to the owner and the buffer to
the agent. **Changing the limit** is not an in-place action: a position's
terms are fixed when it is opened, so the owner closes it and opens a new one
with the new budget. That is deliberate: no key, the owner's included, can
quietly raise what an agent may spend.

## 6. If the agent goes silent: succession

```bash
pnpm agent-lifecycle succession
```

Opens a 0.01 fUSD position with a 60-second check-in period and no grace,
lets a minute pass without the agent acting, then **anyone** triggers
succession and distributes the scheduled amount to the heirs (here the
owner), and the owner closes it. With real terms (30 days, 7 days of grace)
the same steps apply. Spends, claims and check-ins all count as proof of
life; after succession the heirs and their weights are frozen.

## 7. Close the window

```bash
pnpm agent-lifecycle window-close
pnpm agent-lifecycle status
```

## Everything in one go

```bash
OVERWINTER_URL=http://127.0.0.1:4020 pnpm agent-lifecycle all
```

with the Overwinter service from step 3 running. It stops before any
transaction that could take the owner below 3 QOR (`MIN_QOR`).

## A recorded run

QoreChain testnet, 22–23 November 2026. Owner `0x825c2e0282c4681fad2f99F514d3D3003cd27432`
(also Overwinter's gateway); agent `0xc83B5f64E50C81c2152FE6b1C1908b48F3086bA4`
(`qor1eqa47e89pjquy9f0u6curyytfress6ay4lkr8n`), a fresh account; Perennial's
no-yield vault `0x76DAC5461fF361f911e5F39810c9455a6180C180`; Overwinter
running locally in testnet mode with its local model.

| Step | Who | Transaction |
|---|---|---|
| Send the agent 0.3 QOR (native) | owner | `57501D27EE32DCAE39C2CD1709417AA437D11A9B9386C6AC0A3BEF8689B88D51` |
| Register its ML-DSA-87 key, with proof of possession (native) | agent | `5FE5DE28D76194EBE6B904E0B979B5F3CD934B5DF5BD1D6B33AE96B1F267CF82` |
| Register its ML-KEM-1024 key (native) | agent | `4E2D34FCBB8CEFFD94757AF71DD3CDE4A40D4AAD0F7D5D8A0E78E0F68CA93FCD` |
| EVM window, 12 txs, scoped to the vault and fUSD (native) | owner | `60DADA8C1EC55F38442C79F7A2D240017652B38780DDD30E9EC587B43B3DB10A` |
| Approve exactly 0.05 fUSD | owner | `0xcb5f13fb8935e9324fc2922a02ca0fbc3229e1310a141d05e714773c9cc88497` |
| Open position 2 for the agent: 0.05 fUSD, budget mode, 0.01 fUSD a day, owner as heir | owner | `0x38d5071101300afe2914b82b42df01289675eb71f5f2633726e3ce1c28778c8e` |
| A spend drawing on principal: out of gas at the gateway's 350,000 limit, reverted | gateway | `0xbacd85244ff115139ef555e01ab93fa42e09ffc2cf8c1bc497453c53eca75d26` |
| Close that window (native) | owner | `19CBCB47E343AC4B43A783B141721918427F6C171068BC671CB9850A67B27269` |
| EVM window again (native) | owner | `1DC95BD2DFB0AFD999EF1C654B275D92AD6FE51548B495BBA2C38FA8B3F97475` |
| Approve exactly 0.01 fUSD | owner | `0x024f388b46286503f5e17141d835d37f811a81404099b5cf09c204a4b2ee8d4a` |
| `fund` position 2 with 0.01 fUSD | owner | `0x662510cbd48da17092ca1ff4f2768670465fd12d0d9141e636710ab2db272c77` |
| Paid call 1: `spend` 0.002 fUSD, `ref 0x286213f2…22a9` | agent signs, gateway relays | `0xdfbf4dbf7226377448ba5b345527bf2ccffc40b30f33a319ca1e84a0f41d9a67` |
| Paid call 2: `spend` 0.002 fUSD, `ref 0xea53205e…a202` | agent signs, gateway relays | `0xf4f936b9062a1887b0a4da6548bda32a7a875107025e0bdd7f34674cf757d8eb` |
| `closeByOwner` position 2, ML-DSA-87 signed | owner | `0x83c58c3247fbac79868da0940fc6fcbb700639568824374917af613aeb104ce2` |
| Approve exactly 0.01 fUSD | owner | `0x45453530d167279c80a0675f758a67432713f47739689b5d13cce3a43b78d219` |
| Open position 3: 0.01 fUSD, check-in 60 s, no grace, 0.001 fUSD a minute, owner as heir | owner | `0xa7222a2125a9fa65ebde4d5dafc83fc10356693574c7f597f9edec3569f56e0b` |
| 75 s without the agent; `triggerSuccession` (anyone may) | owner's account | `0x7fd324942a665b3bad358c3a19335d894e6fd4cb4f57f3bd2d1a06131fc2c27f` |
| `distribute`: 0.001 fUSD drawn from principal to the heir | owner's account | `0xf21eca8fce3ff7a5a613aa98ebc49383fb5b70a86d4945391190aba6cd3a60e5` |
| `closeByOwner` position 3 | owner | `0x5bc9bdab4c44d7c7d04f0dd28218b3376cb38c7bc63e81b1d6f8a59d8e0b33f9` |
| Close the window (native) | owner | `37120F91ACE00F22F42F85846ADF89CFAC845AB81936164256CEF6D6EE8DD0A2` |

Both paid calls returned the local model's answer, with the prompt sealed to
the gateway's ML-KEM-1024 key and the gateway's receipt verified by the agent.
Position 2's ledger after the calls: opened 0.05, funded 0.01, two spends of
0.002, 0.006 fUSD of the day's budget left. At close the buffer (0.006 fUSD)
went to the agent and the principal (0.05) to the owner.

Balances: owner 4.656276 → 3.575140 QOR (0.3 sent to the agent, two windows,
the reverted spend and the fees above), 219.096933 → 219.090933 fUSD; agent
0 → 0.1 QOR and 0.006 fUSD. The owner never fell below 3 QOR: each window's
value bound was capped (`WINDOW_MAX_UQOR`) so that it could not.
