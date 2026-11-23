# @pq-apps/perennial

A small client for [Perennial](https://github.com/raldblox/perennial): an
on-chain inference budget an AI agent spends with its own ML-DSA-87 key,
inside a limit it cannot exceed. Use it from an agent, a relayer or a
dashboard to prepare and submit the agent's signed `spend`, and to read what a
position holds and may still spend.

```sh
npm install @pq-apps/perennial viem
```

```ts
import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { prepareAction, readPosition, spendArgs, testnet, vaultAbi } from "@pq-apps/perennial";

const vault = testnet.vaults.demo;
const position = await readPosition(client, vault, 1n);
console.log(position.budgetRemaining, position.buffer);

// The agent signs what the vault will verify, with whatever holds its ML-DSA-87 key.
const prepared = await prepareAction(client, vault, {
  id: 1n,
  action: "Spend",
  signer: agentAddress,
  spend: { to: provider, amount: 2_000n, ref: keccak256(stringToHex(requestBody)) },
});
const signature = signWithMlDsa87(prepared.message); // your signer; this package never sees the key

// Anyone may submit it: a relayer pays the fee.
await wallet.writeContract({ address: vault, abi: vaultAbi, functionName: "spend", args: spendArgs(prepared, signature) });
```

What it exports:

| Export | What |
|---|---|
| `vaultAbi`, `Action` | the vault's functions, events and errors; the signed-action enum |
| `encodeActionMessage` | the bytes the vault verifies, computed offline: `abi.encode(keccak256("Perennial.Action"), chainid, vault, positionId, action, nonce, deadline, paramsHash)` |
| `spendParamsHash`, `heirsParamsHash` | the parameter hashes a spend and a heir change are signed over |
| `prepareAction` | reads the nonce and the chain's clock and returns what to sign, from the vault's own `actionMessage` |
| `spendArgs` | the arguments of `vault.spend(...)` for a prepared spend and its signature |
| `readPosition`, `spendableNow` | a position's state, pending yield, heirs and the budget left in its window |
| `testnet` | the QoreChain testnet deployment: three vaults (no yield, simulated 4.29%, accelerated demo; every rate simulated), fUSD and the PQC precompiles |

The encoding is checked against the deployed vault's `actionMessage` in the
package's tests. Requires `viem` 2.

License: MIT.
