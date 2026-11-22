# 009 — Agent keys and the chain's spending rules: two independent limits

Status: accepted · 22 November 2026

## Context

A Perennial position limits what leaves it: without budget mode only the
buffer, with it at most `payoutAmount` per `payoutInterval` across spends and
claims (decision 007). That limit lives in the vault and is enforced by the
beneficiary's ML-DSA-87 signature on every action.

What reaches the beneficiary's own account (claims, spends to itself) is then
outside the vault. An agent that pays inference providers from that account
holds whatever key controls it, and today that key can move everything there.

QoreChain's `abstractaccount` module, enabled on the testnet by governance
proposal 18 (27 October 2026), lets an account link a second key with
permissions, an expiry and a spending rule the chain enforces:
`MsgUpdateSpendingRules` and `MsgRegisterAuthenticator` in one transaction
signed by the account, a possession proof from the linked key (chain v3.2.8),
and `MsgExecuteEVM` submitted by a relayer for each call the key signs.

## Decision

- The beneficiary account links the agent's working key (ed25519) with the
  `evm` permission and one enabled rule: fUSD (`erc20/0x9714…63CA`) is the only
  denom, capped per execution and per UTC day; the only EVM call allowed is
  fUSD's `transfer(address,uint256)`; the link expires within 30 days.
- The vault does not change and does not know about the link. Its limit and
  the chain's are independent:

  | Limit | Enforced by | Bounds | Authorised by |
  |---|---|---|---|
  | Budget mode | `PerennialVault` | what leaves the position, per `payoutInterval` | the beneficiary's ML-DSA-87 signature |
  | Spending rule | the chain (`abstractaccount`) | what the agent's key moves out of the beneficiary account, per call and per day | the agent's linked key, within the rule |

- `contracts/scripts/link-agent.ts` builds the two messages with the SDK's
  `linkAuthenticatorMsgs`, verifies the possession proof against the chain id
  and checks that the rule bounds every denom it allows. By default it is a
  dry run with an ephemeral key and sends nothing; `--broadcast` signs with the
  beneficiary account (`QORE_MNEMONIC`) and links `AGENT_ED25519_KEY`.
- Allowlisting the vault's `claim` or `spend` is not needed: both already
  require the beneficiary's ML-DSA-87 signature, and anyone may relay them.

## Threat model

- A recovered or stolen **linked key** (ed25519, a classical key) can move
  fUSD from the beneficiary account up to the rule's daily limit until the
  link expires or is revoked. It cannot touch the vault, change the rule,
  link or revoke keys (key management can never be delegated), or move other
  denoms.
- A stolen **beneficiary ML-DSA-87 key** remains the worst case and is bounded
  by the vault (decision 007), not by this rule.
- The owner's kill switch is unchanged: closing the position stops all
  further payouts. Revoking the link (`MsgRevokeAuthenticator`) stops the
  agent's key.

## Consequences

- The agent can run with a light classical key and no QOR: a relayer pays the
  fee and the chain checks the rule. Its exposure is two numbers the owner
  chose, one per limit.
- Not yet done on the testnet: the dry run has been run (22 November 2026,
  the deployer account, 0.01 fUSD per call, 1 fUSD a day, 30 days); the
  broadcast and an agent's `MsgExecuteEVM` have not, and QoreChain's docs do
  not report an executed `MsgExecuteEVM` either.
- A rule replaces the account's rules wholesale: an account with other rules
  must merge them before linking.
