/**
 * Every word the app shows, in one place.
 *
 * Each section answers what, why and how, in that order. Contract terms
 * (position, principal, buffer, buffer cap, beneficiary, heirs, succession,
 * check-in, harvest, spend, distribute) mean exactly what they mean in
 * PerennialVault.sol. "Margin" is the sizing multiplier and is never called a
 * buffer. What is simulated is said where the number is shown.
 */
import type { VaultId } from "./config";
import type { Phase } from "./lib/schedule";

export const brand = {
  name: "Perennial",
  descriptor: "A budget your agent cannot exceed and nobody can steal.",
  network: "Testnet",
} as const;

export const nav = {
  overview: "Overview",
  open: "Fund an agent",
  positions: "Positions",
  skip: "Skip to content",
  source: "Source",
} as const;

export const vaultNames: Record<VaultId, { name: string; rate: string; note: string }> = {
  agent: {
    name: "Standard vault",
    rate: "simulated at the Aave v3 USDC rate of 16 November 2026",
    note: "Pays 4.29% a year, the 30-day mean of Aave v3 USDC on Ethereum on 16 November 2026, from a pre-funded test reserve. Nothing earns it; it is never a return this vault earns.",
  },
  demo: {
    name: "Demo vault",
    rate: "accelerated testnet rate, simulated, not a return",
    note: "Pays 15,768% a year, so 20 fUSD pays about 2.6 calls a minute during a demonstration. It is a test setting, never a return.",
  },
  noyield: {
    name: "No-yield vault",
    rate: "no yield",
    note: "Its source pays nothing, as every source on QoreChain does today. Positions here run on budget mode and income paid in.",
  },
};

export const hero = {
  label: "QoreChain testnet · ML-DSA-87 authorisation · yield optional, simulated",
  headlineLines: ["A budget your agent cannot exceed", "and nobody can steal."],
  headline: "A budget your agent cannot exceed and nobody can steal.",
  lede:
    "The agent pays for each call with spend(), signed by its own ML-DSA-87 key and verified in the contract against the chain's key registry. In budget mode no more than payoutAmount leaves a position per payoutInterval, across spends and claims; a fuzz test and an invariant check that bound. A recovered secp256k1 key alone moves nothing. A stolen agent key takes at most one window's budget before the owner's signature closes the position. Yield, where a source pays one, only tops the budget up.",
  primary: "Fund an agent",
  secondary: "See a position",
  example: {
    label: "One 0.002 fUSD call an hour",
    deposit: "Deposit",
    depositValue: "500 fUSD",
    rate: "Budget, budget mode",
    rateValue: "1.46 fUSD a month",
    margin: "Stolen agent key takes",
    marginValue: "at most 1.46 fUSD a month",
    hourly: "Recovered classical key takes",
    hourlyValue: "0 fUSD",
    calls: "Lasts at 0% yield",
    callsValue: "28.5 years",
    note: "At Aave v3 USDC's 4.29% (30-day mean, 16 November 2026) the same 500 fUSD earns 21.45 a year, more than the 17.52 the calls cost, so the budget never runs down. Nothing on QoreChain pays that yield today; the testnet vaults simulate it.",
  },
} as const;

export const agentCalc = {
  label: "Size it",
  title: "How much your agent needs.",
  intro:
    "Pick how often your agent calls a model and what a call costs. The deposit is the margin times a year of calls, divided by the yield rate.",
  modeDeposit: "From calls to deposit",
  modeCalls: "From deposit to calls",
  callsPerHour: "Calls an hour",
  price: "Price per call",
  priceHint: "fUSD. A small model call costs about 0.002.",
  deposit: "Deposit",
  rate: "Yield rate",
  rateHint: "% a year. Nothing on QoreChain pays a yield today, so 0% is the assumption here; the others are rates on Ethereum, variable, with their protocols' risks.",
  presets: "Reference rates",
  presetZero: "0%, this chain today",
  preset: (name: string, percent: string) => `${name} ${percent}%`,
  presetSource: (source: string, date: string) => `30-day means from ${source}, ${date}.`,
  resultLasts: "The deposit lasts",
  days: "days",
  zeroNote: "At 0% nothing is earned: with budget mode the deposit itself pays the calls until it is spent. Income paid in extends it.",
  formulaZero: "days = deposit ÷ (calls a day × price)",
  margin: "Margin",
  marginHint: "× the break-even deposit. 1.15 lets the yield fall 13% before calls go unpaid.",
  resultDeposit: "Deposit needed",
  resultCalls: "Calls it pays an hour",
  perYear: "Spent a year",
  perDay: "Calls a day",
  formula: "deposit = margin × calls a year × price ÷ rate",
  invalid: "Enter calls and prices as plain numbers, the rate in percent and a margin of at least 1.",
  fund: "Fund an agent with this",
  anHour: "an hour",
} as const;

export const intervals = {
  weekly: { label: "week", adjective: "Weekly", hint: "every 7 days" },
  monthly: { label: "month", adjective: "Monthly", hint: "a twelfth of a year, about 30.4 days" },
  quarterly: { label: "quarter", adjective: "Quarterly", hint: "a quarter of a year" },
  yearly: { label: "year", adjective: "Yearly", hint: "365 days" },
} as const;

export const why = {
  label: "Why",
  title: "A wallet gives everything to whoever holds the key. A position does not.",
  body:
    "An agent that calls a model has to pay per call. A funded wallet lets anyone with its key take the whole balance. A Perennial position splits the authority: the agent can spend within a budget, the owner can stop it, and heirs inherit if it goes silent. Every one of those actions needs an ML-DSA-87 signature.",
  roles: [
    { who: "You, the owner", what: "Deposit once, with a key you can keep offline. You may keep the right to close and take the capital back." },
    { who: "Your agent, the beneficiary", what: "Has its own account and ML-DSA-87 key. It can spend within the budget, call by call, and nothing else." },
    { who: "Your heirs", what: "If the agent stops working, its income passes to them, for example back to you." },
  ],
  worstCase:
    "If the agent's ML-DSA-87 key is stolen, the thief can take what the buffer holds or, in budget mode, one window's budget, until the owner closes. A recovered classical key alone can take nothing.",
} as const;

export const how = {
  label: "How it works",
  title: "Four steps. The last two repeat for every call.",
  steps: [
    {
      title: "Deposit",
      body: "You deposit fUSD once. It becomes the position's principal and goes into the yield source. Nothing in the vault can pay it out.",
    },
    {
      title: "Earn",
      body: "The principal earns at the source's rate. A harvest, which anyone can call, moves what it has earned into the position's buffer.",
    },
    {
      title: "Spend",
      body: "For each call, the agent signs a spend with its ML-DSA-87 key: who is paid, how much, and a reference to the request. Anyone can submit it; the vault pays from the buffer only.",
    },
    {
      title: "Compound",
      body: "Yield above the buffer cap is added to the principal, so it keeps earning and can never be spent. If the agent stops spending and checking in, the income goes to its heirs.",
    },
  ],
  compoundingRule: "Yield above the buffer cap is added to the principal, so it keeps earning and can never be spent.",
} as const;

export const live = {
  label: "On chain now",
  title: "Read from the vaults, not from us.",
  opened: "Positions opened",
  principal: "Principal held",
  spends: "Calls paid",
  spent: "Spent from yield",
  loading: "Reading the vaults",
  error: "The vaults could not be read. The testnet RPC may be unavailable.",
  retry: "Try again",
  contract: "Contract",
  reserveLabel: "Test reserve left",
} as const;

export const roles = {
  label: "Who can do what",
  title: "Authority is a signature, not an address.",
  intro:
    "Every action that moves money to someone needs an ML-DSA-87 signature from the role holder's registered key, checked inside the contract. Anyone may submit the transaction, and the money still goes where the signature says.",
  columns: { action: "Action", who: "Authorised by", note: "Note" },
  rows: [
    { action: "Open, top up", who: "Whoever pays", note: "The beneficiary must already hold a proven ML-DSA-87 key." },
    { action: "Harvest", who: "Anyone", note: "Yield lands in the buffer; above the cap, in the principal." },
    { action: "Spend", who: "Beneficiary's signature", note: "Pays from the buffer to the signed recipient, for the signed amount and reference. Counts as a check-in." },
    { action: "Claim", who: "Beneficiary's signature", note: "Pays the schedule to the beneficiary itself. Counts as a check-in." },
    { action: "Check in", who: "Beneficiary's signature", note: "Restarts the check-in period." },
    { action: "Change heirs", who: "Beneficiary's signature", note: "Signed over the new list. Not possible after succession." },
    { action: "Trigger succession", who: "Anyone, after the deadline", note: "Cannot be undone." },
    { action: "Distribute", who: "Anyone, after succession", note: "Heirs and weights are frozen at succession." },
    { action: "Close", who: "Owner's signature", note: "Only if the owner kept the right when opening. Principal to the owner, buffer to the beneficiary or, after succession, the heirs." },
  ],
  footnote:
    "The vault has no admin, no upgrade path and no pause. A signature is bound to the chain, the vault, the position, the action, a nonce and an expiry, so it works once and nowhere else.",
} as const;

export const uses = {
  label: "Other uses",
  title: "The same vault pays people, on a schedule.",
  note: "Deposit at Aave v3 USDC's 4.29% (30-day mean, 16 November 2026) with a 1.15 margin. At sUSDS's 3.80%, add an eighth.",
  items: [
    { title: "A public good's fixed bill", body: "An endpoint or an archive nobody budgets for.", payout: "10 a month", principal: "3,217" },
    { title: "A maintainer's stipend", body: "If they stop checking in, it passes to the next maintainers.", payout: "100 a month", principal: "32,168" },
    { title: "A parent's allowance", body: "Paid monthly; passes to the children.", payout: "250 a month", principal: "80,420" },
  ],
  unit: "fUSD",
  payoutLabel: "Payout",
  principalLabel: "Deposit",
} as const;

export const simulated = {
  label: "Real and simulated",
  title: "Real signatures. Simulated yield.",
  items: [
    { term: "Real", body: "The vaults, the ML-DSA-87 checks, spends, the schedule, check-ins and succession, all on the QoreChain testnet." },
    { term: "Simulated", body: "The yield. Each vault's principal sits in a mock that pays a fixed rate from a reserve someone funded. Nothing on QoreChain pays a real return a contract can collect yet." },
    { term: "Accelerated", body: "The demo vault's rate, 15,768% a year, exists so a small deposit visibly pays several calls a minute. It is a test setting, never a return." },
    { term: "Tokens", body: "fUSD is the testnet's dollar token. It has no value." },
  ],
} as const;

export const faq = {
  label: "Risks and questions",
  title: "What you should know first.",
  items: [
    { q: "Is this live on mainnet?", a: "No. Perennial runs on the QoreChain testnet. The post-quantum precompiles it depends on are not active on QoreChain mainnet." },
    { q: "Has it been audited?", a: "No. The contracts are open source and tested, including fuzz and invariant tests, but no one has audited them." },
    { q: "Where does the yield come from?", a: "On the testnet, from a mock that pays a fixed rate out of a pre-funded reserve. Nothing on QoreChain today pays a real return that a contract can collect. A real source would be an ERC-4626 vault, and a real source can lose value." },
    { q: "What if my agent's key is stolen?", a: "The thief can spend what the buffer holds, up to its cap, and, holding that key, can also change the heirs. Not the principal. If you kept the right to close, close the position: the principal returns to you." },
    { q: "What if a classical key is recovered by a quantum computer?", a: "Alone, it can spend nothing, check in for no one, change no heirs and close nothing. Every one of those needs the role holder's ML-DSA-87 signature." },
    { q: "What happens to yield the agent does not spend?", a: "Up to the buffer cap it waits in the buffer. Above the cap it is added to the principal, keeps earning, and can never be spent; it returns to the owner only on close." },
    { q: "Can I get my deposit back?", a: "Only if you kept the right to close when you opened the position. Without it, the principal can never be withdrawn by anyone, including you." },
    { q: "What if the agent stops?", a: "Spends and claims count as check-ins. After the check-in period and the grace period, anyone can trigger succession, which cannot be undone; the income then goes to the heirs." },
    { q: "Does the agent need QOR for fees?", a: "No. A spend is a signature; whoever submits it pays the fee, so a relayer can pay for the agent." },
    { q: "How does this page sign?", a: "With keys derived from a recovery phrase you type into this tab. The page clears the phrase, keeps the keys in the tab's memory, never stores or sends them, and drops them when you lock, after 15 minutes idle or when the tab closes. Anyone who controls this page's code while it is unlocked can sign as that account. Use a testnet-only phrase." },
  ],
} as const;

export const footer = {
  line: "Open source under the MIT licence. Testnet only. Unaudited. Yield simulated.",
  explorer: "The QoreChain explorer opens on mainnet: use its Testnet switch. It does not look up EVM transaction hashes yet, so this page shows them in full.",
  asset: "Asset",
  code: "Code and documentation",
} as const;

export const common = {
  loading: "Loading",
  retry: "Try again",
  cancel: "Cancel",
  back: "Back",
  continue: "Continue",
  close: "Close",
  copy: "Copy",
  copied: "Copied",
  explorer: "Explorer",
  explorerNote: "The QoreChain explorer opens on mainnet. Use its Testnet switch to see this.",
  evmHashNote: "The QoreChain explorer does not look up EVM transaction hashes yet. Any EVM RPC can, with eth_getTransactionReceipt.",
  none: "None",
  yes: "Yes",
  no: "No",
  you: "you",
  unknown: "Unknown",
} as const;

export const account = {
  unlock: "Unlock an account",
  lock: "Lock",
  locked: "No account unlocked. Reading needs none.",
  unlocked: "Account unlocked",
  evm: "Sending account",
  native: "Native account of the same phrase",
  gas: "QOR for fees",
  token: "fUSD",
  key: "ML-DSA-87 key",
  keyUsable: "Registered, possession proven",
  keyMissing: "Not registered",
  keyUnproven: "Registered, possession not proven",
  keyMismatch: "Registered, but not the key this phrase derives",
  window: "EVM window",
  windowLive: (blocks: string, txs: string) => `Open: ${blocks} blocks and ${txs} transactions left`,
  windowNone: "Closed",
  windowExhausted: "Used up",
  windowUnknown: "Cannot be read from this site",
  windowScope: "Limited to",
  windowAny: "any contract",
  openWindow: "Open a window for this vault",
  openingWindow: "Opening the window",
  windowOpened: "Window opened, limited to this vault and fUSD.",
  closeWindow: "Close the window",
  autoLock: "Locks after 15 minutes without activity.",
  refresh: "Refresh",
  faucet: "Testnet faucet",
} as const;

export const swap = {
  title: "Get fUSD with QOR",
  body: "Swap QOR for fUSD in QoreChain's native AMM (pool 2). The page converts the guaranteed minimum into the token the vault takes, in the same transaction.",
  amount: "QOR to swap",
  amountHint: "At most 1 QOR.",
  quote: (out: string, min: string) => `About ${out} fUSD; at least ${min} fUSD, or nothing happens.`,
  getQuote: "Get a quote",
  submit: "Swap",
  swapping: "Swapping",
  done: "Swapped.",
  unreachable: "This site cannot reach the chain's native API, so it cannot swap. Run pnpm swap in the contracts folder instead.",
  invalid: "Enter an amount above 0 and at most 1.",
} as const;

export const unlock = {
  title: "Unlock an account",
  intro:
    "The QoreX wallet cannot yet sign arbitrary messages or EVM transactions for a web page, so this page signs with keys derived from your recovery phrase.",
  points: [
    "The page derives this account's keys from the phrase, then clears the phrase. The keys stay in this tab's memory. Neither is stored, sent anywhere or logged.",
    "The keys are dropped when you lock, after 15 minutes without activity, and when you close or reload the tab.",
    "While the account is unlocked, anyone who controls this page's code can sign as it. That includes whoever hosts the page and any browser extension that can read it.",
    "Use a phrase made for the testnet. Never a phrase that holds anything of value.",
  ],
  phrase: "Recovery phrase",
  phraseHint: "12 or 24 words, separated by spaces.",
  consent: "I understand the page holds these keys while it is unlocked, and this is a testnet-only phrase.",
  submit: "Unlock",
  deriving: "Deriving keys",
  invalid: "That is not a valid recovery phrase. Check the words and their order.",
  accounts:
    "The phrase gives two accounts: an EVM account, which sends the transactions, and a Native account, the one the QoreX wallet shows. Perennial can sign for either as beneficiary or owner.",
} as const;

export const requirements = {
  title: "Before this account can send",
  noKey: {
    title: "Register an ML-DSA-87 key first",
    body: "QoreChain admits EVM transactions only from accounts with a registered post-quantum key. Register one for this account in the QoreX app, or with pnpm window register in the contracts folder, then refresh.",
  },
  keyMismatch: {
    title: "The registered key is not this phrase's",
    body: "This account has an ML-DSA-87 key that this phrase does not derive. The vault would refuse every signature this page makes for it.",
  },
  noWindow: {
    title: "Open an EVM window",
    body: "QoreChain admits EVM transactions only while the sending account has an open window, a permission signed with its post-quantum key. This page opens one limited to this vault and fUSD, for about an hour and six transactions.",
  },
  windowUnreachable: {
    title: "This site cannot open the window",
    body: "The chain's native API, which opens windows, refuses requests from other websites, and this site does not forward them. Open a window for this account in the QoreX app, or run pnpm window open in the contracts folder with QORE_WINDOW_TARGETS set to the vault and fUSD. Transactions will then go through.",
  },
  noGas: {
    title: "Get QOR for fees",
    body: "The sending account has no QOR to pay fees. The testnet faucet sends some.",
  },
  noToken: {
    title: "Get fUSD",
    body: "This account holds no fUSD the vault can take. Swap QOR for it below, or use the faucet: faucet fUSD arrives as a native coin and has to be converted (MsgConvertCoin) before a contract can see it.",
  },
} as const;

export const fund = {
  label: "Fund an agent",
  title: "Fund your agent's inference",
  intro:
    "Your deposit becomes the principal and is never spent. Its yield pays your agent's calls. Pick the agent, how often it calls, and what a call costs.",
  steps: ["Agent and deposit", "Heirs", "Review"],
  vault: "Vault",
  vaultHint: "The demo vault's rate is an accelerated test setting, not a return.",
  agent: "Agent account (beneficiary)",
  agentHint: "The account that signs your agent's spends, as a 0x address or a QoreX @handle. It needs a registered ML-DSA-87 key with proven possession.",
  agentUseEvm: "This account",
  agentUseNative: "Its Native account",
  callsPerHour: "Calls an hour",
  price: "Price per call",
  suggested: (deposit: string) => `At this vault's rate and a 1.15 margin, that needs ${deposit} fUSD.`,
  useSuggested: "Use this deposit",
  amount: "Deposit",
  amountHint: "Becomes the principal. Never spent.",
  pays: (calls: string, perMinute: string) => `This deposit pays about ${calls} ${calls === "1" ? "call" : "calls"} an hour (${perMinute} a minute) at this price.`,
  balance: "Balance",
  useMax: "Use all",
  cap: "Buffer cap",
  capHint: "Most the buffer keeps for the agent to spend. Suggested: a day of calls.",
  capRule: "Yield above the buffer cap is added to the principal, so it keeps earning and can never be spent.",
  capUseDay: "A day of calls",
  capNever: "Never compound",
  budgetMode: "Budget mode",
  budgetModeOn: "Spends and claims may draw on the principal once the buffer is empty, up to the claim amount per claim interval in total. The principal shrinks as it is used.",
  budgetModeOff: "Spends and claims are paid from yield and income only. The principal is never spent.",
  budgetModeNeedsPayout: "Budget mode needs a claim amount above zero: it is the most that can leave per interval.",
  advanced: "Schedule and safety",
  payout: "Claim to the agent per interval",
  payoutHint: "Separate from spends. Leave at 0 to let the agent claim everything in the buffer once per interval.",
  payoutEverything: "Everything in the buffer",
  interval: "Claim interval",
  checkInPeriod: "Check-in period",
  checkInHint: "How long the agent may go without a spend, claim or check-in.",
  grace: "Grace period",
  graceHint: "Extra time after a missed check-in before succession opens.",
  days: "days",
  ownerCanClose: "Keep the right to close",
  ownerCanCloseOn:
    "You can later close the position with your own signature: the principal, including anything compounded, returns to you and the buffer to the agent, or to the heirs after succession. Your account needs a registered ML-DSA-87 key.",
  ownerCanCloseOff:
    "The position is permanent. Nobody, including you, can ever withdraw the principal. Only its yield leaves the vault.",
  ownerCanCloseNote: "Fixed at opening.",
  heirsTitle: "Heirs",
  heirsIntro: "If the agent stops, the income goes to the heirs by weight, for example back to you. Weights must total 100%.",
  heirsNone: "No heirs. If the agent stops, nothing happens: the income stays in the buffer and compounds.",
  addHeir: "Add an heir",
  removeHeir: "Remove",
  heirAddress: "Heir address",
  heirPercent: "Share",
  split: "Split evenly",
  total: "Total",
  review: "Review",
  reviewIntro: "Check every line. After opening, only the heirs can be changed, and only by the agent's key.",
  approve: "Approve exactly",
  approving: "Approving",
  submit: "Open position",
  submitting: "Opening",
  opened: (id: string) => `Position ${id} is open.`,
  view: "Open its control panel",
  needsAccount: "Unlock an account to open a position. Everything else on this page works without one.",
  errors: {
    amount: "Enter a deposit above zero, with at most 6 decimals.",
    balance: "The deposit is more than this account's fUSD balance.",
    beneficiary: "Enter a valid 0x address.",
    beneficiaryKey: "This address has no registered ML-DSA-87 key with proven possession. The vault would refuse to open.",
    payout: "Enter an amount of zero or more, with at most 6 decimals.",
    days: "Enter a whole number of days, at least 1.",
    graceDays: "Enter a whole number of days, 0 or more.",
    ownerKey: "Your account needs a registered ML-DSA-87 key with proven possession to keep the right to close.",
    cap: "Enter a cap of zero or more, with at most 6 decimals.",
    budget: "Budget mode needs a claim amount above zero.",
  },
} as const;

/** Kept for the heirs editor, which is shared by the fund form and the control panel. */
export const open = fund;

export const handles = {
  off: "QoreX @handles need the handle registry's address and key, which this deployment does not have. Enter a 0x address.",
  resolving: "Resolving the @handle",
  failed: "The @handle could not be resolved.",
  sourceEvm: "EVM address signed by its owner",
  sourceNative: "its Native account, signed by its owner",
  firstSeen: "Verified against the registry's key. First time on this device: it is remembered when you continue.",
  match: "Verified, and the same address you accepted before on this device.",
  changed: (before: string, now: string) => `This handle pointed to ${before} when you last used it and now points to ${now}. Check with its owner before using it.`,
  accept: "Use the new address",
} as const;

export const heirErrors = {
  "address-missing": "Enter an address.",
  "address-invalid": "Not a valid 0x address.",
  "address-zero": "The zero address cannot inherit.",
  duplicate: "This address is listed twice.",
  "percent-invalid": "Enter a percent with at most two decimals.",
  "percent-zero": "A share must be above zero.",
  "too-many": "The vault allows at most 16 heirs.",
  total: "The shares must total exactly 100%.",
} as const;

export const positions = {
  label: "Positions",
  title: "Find a position",
  vault: "Vault",
  byId: "Position number",
  go: "Open",
  byAddress: "Positions for an address",
  addressHint: "Owner, beneficiary or heir.",
  search: "Search",
  yours: "Positions for your unlocked account",
  wallet: "Or connect QoreX to look up its account (read-only)",
  empty: "No positions involve this address.",
  scanning: "Reading the vault's history",
  invalidId: "Enter a position number.",
  invalidAddress: "Enter a valid 0x address.",
  columns: { id: "Position", role: "Role", principal: "Principal", status: "Status" },
  roleNames: { owner: "owner", beneficiary: "beneficiary", heir: "heir" },
  all: "All positions in this vault",
  none: "No positions yet.",
} as const;

export const phases: Record<Phase, { name: string; detail: string }> = {
  active: { name: "Active", detail: "The beneficiary is within the check-in period." },
  grace: { name: "Check-in overdue", detail: "The check-in period has passed. The grace period is running; a spend, claim or check-in still restores the position." },
  "succession-open": { name: "Succession open", detail: "The check-in and grace periods have both passed. Anyone can now trigger succession, unless the beneficiary acts first." },
  stalled: { name: "Silent, no heirs", detail: "The deadline has passed, but there are no heirs, so succession cannot happen." },
  succeeded: { name: "Succeeded", detail: "The beneficiary missed the deadline and succession was triggered. The income now goes to the heirs." },
  closed: { name: "Closed", detail: "The owner closed this position. Its principal was returned." },
};

export const panel = {
  label: (id: string) => `Position ${id}`,
  notFound: (id: string) => `There is no position ${id} in this vault.`,
  health: "Health",
  lasts: "Lasts",
  lastsDays: (days: string) => `${days} days at this spend rate`,
  lastsForever: "Indefinitely: income covers the spending",
  lastsIdle: "Indefinitely: nothing spent in the last day",
  lastsNote: "Indefinitely once income covers it.",
  lastsReach: (what: string) => `Counts ${what}.`,
  lastsReachBudget: "buffer and principal",
  lastsReachBuffer: "the buffer only",
  assume: "Assumed yield",
  assumeSource: "This vault's source",
  assumeZero: "0%, this chain today",
  assumeRef: (name: string, percent: string, date: string) => `${name}, ${percent}% (30-day mean, ${date})`,
  income: "Income",
  incomeValue: (perDay: string) => `${perDay} a day: yield plus income paid in over the last 30 days`,
  budget: "Budget mode",
  budgetOn: (remaining: string) => `On. ${remaining} left in this window.`,
  budgetOff: "Off. Only yield and income are spent.",
  earning: "Earning against spending",
  earningValue: (earn: string, spend: string) => `${earn} an hour earned, ${spend} an hour spent over the last day`,
  sustainable: "The yield covers the spending.",
  drawing: "Spending is above the yield: the buffer is shrinking.",
  deadline: "Check-in deadline",
  principal: "Principal",
  principalNote: "Never spent.",
  buffer: "Buffer",
  bufferNote: (cap: string) => `Cap ${cap}.`,
  bufferNoCap: "No cap: never compounds.",
  pending: "Pending yield",
  pendingNote: "Earned, not yet harvested.",
  spentDay: "Spent, last day",
  callsNote: (calls: string) => `${calls} payments`,
  compoundingRule: "Yield above the buffer cap is added to the principal, so it keeps earning and can never be spent.",
  schedule: "Schedule",
  payout: "Claim to the beneficiary",
  payoutEverything: "Everything in the buffer",
  every: "every",
  nextPayout: "Next claim",
  due: "Due now",
  checkInDue: "Check-in due",
  successionAt: "Succession possible after",
  lastCheckIn: "Last check-in",
  roles: "Roles",
  owner: "Owner",
  beneficiary: "Beneficiary",
  closable: "Owner can close",
  closableYes: "Yes, with the owner's signature",
  closableNo: "No. The principal is permanent.",
  nonce: "Signed actions so far",
  heirs: "Heirs",
  heirsNone: "No heirs. Succession cannot happen.",
  ledger: "Ledger",
  ledgerIntro: "Every harvest, spend, claim, top-up and compounding, with its transaction and reference.",
  ledgerEmpty: "Nothing yet.",
  columns: { what: "What", amount: "Amount", to: "To", ref: "Reference", block: "Block", tx: "Transaction" },
  controls: "Controls",
  controlsLocked: "Unlock an account to act. Harvest, trigger succession and distribute work from any account; the others need the role holder's signature.",
  topUp: "Add principal",
  topUpHint: "Anyone can add principal. It is never spent.",
  fund: "Pay income",
  fundHint: "Anyone can pay into the buffer, for example a customer paying the agent. Above the cap it joins the principal.",
  spend: "Send a payment",
  spendHint: "Pays from the buffer, signed with the beneficiary's key. This is what an agent does for each call.",
  spendTo: "Pay to",
  spendAmount: "Amount",
  spendRef: "Reference",
  spendRefHint: "What the payment is for, such as a request id. It is hashed into the signed reference.",
  events: {
    Opened: "Opened",
    ToppedUp: "Principal added",
    HeirsSet: "Heirs set",
    Harvested: "Harvested",
    Claimed: "Claimed",
    Spent: "Spent",
    Compounded: "Compounded",
    Funded: "Income paid in",
    PrincipalDrawn: "Drawn from principal",
    Distributed: "Distributed to heirs",
    CheckedIn: "Checked in",
    SuccessionTriggered: "Succession triggered",
    Closed: "Closed",
  },
} as const;

export const actions = {
  harvest: { label: "Harvest", hint: "Moves pending yield into the buffer; above the cap, into the principal. Anyone can.", done: "Harvested." },
  spend: { label: "Send", done: "Paid." },
  claim: { label: "Claim to self", hint: "Pays what the schedule owes to the beneficiary itself. Counts as a check-in.", done: "Claimed." },
  checkIn: { label: "Check in", hint: "Proves the beneficiary is there and restarts the check-in period.", done: "Checked in." },
  setHeirs: { label: "Change heirs", hint: "Replaces the heirs. Signed by the beneficiary. Counts as a check-in.", done: "Heirs updated." },
  trigger: { label: "Trigger succession", hint: "Hands the income to the heirs. Cannot be undone.", done: "Succession triggered." },
  distribute: { label: "Distribute", hint: "Pays the scheduled amount to the heirs by weight. Anyone can.", done: "Distributed." },
  close: { label: "Close position", hint: "Returns the principal to the owner and the buffer to the beneficiary, or to the heirs after succession. Ends the position.", done: "Position closed." },
  topUp: { label: "Add principal", approve: "Approve exactly", approved: "fUSD approved. Now add it.", done: "Principal added." },
  fund: { label: "Pay in", approve: "Approve exactly", approved: "fUSD approved. Now pay it in.", done: "Income paid in." },
  confirmTrigger: "Confirm: trigger succession",
  unavailable: {
    notDue: "No claim is due yet.",
    succeeded: "Not possible after succession.",
    notSucceeded: "Only after succession.",
    notOpen: "Not possible before the deadline.",
    noHeirs: "There are no heirs.",
    notClosable: "The owner did not keep the right to close.",
    notRole: (role: string) => `Needs the ${role}'s signature, and the unlocked phrase is not the ${role}'s.`,
    locked: "Unlock an account first.",
    closed: "The position is closed.",
  },
} as const;

export const signing = {
  title: "Sign this action",
  intro: "This page will sign the message below with the ML-DSA-87 key it derived from your phrase, then send it to the vault.",
  action: "Action",
  position: "Position",
  signer: "Signed as",
  nonce: "Nonce",
  expires: "Signature expires",
  expiresIn: "in 10 minutes",
  params: "Signed parameters",
  paramsNone: "None",
  bytes: "Message",
  bytesNote: "Exactly what the vault's actionMessage returns. The vault verifies the signature against the key registered for the signer.",
  confirm: "Sign and send",
  irreversible: "This cannot be undone.",
  heirsHash: (count: number) => `Hash of ${count} heir${count === 1 ? "" : "s"}`,
  spendSummary: (amount: string, to: string, ref: string) => `${amount} fUSD to ${to}, reference ${ref}`,
  actionNames: { CheckIn: "Check in", Claim: "Claim to self", SetHeirs: "Change heirs", Close: "Close position", Spend: "Spend from the buffer" },
} as const;

export const tx = {
  preparing: "Preparing",
  signing: "Signing with ML-DSA-87",
  sending: "Sending",
  pending: "Waiting for the block",
  success: "Confirmed",
  failed: "Failed",
  hash: "Transaction",
  dismiss: "Dismiss",
} as const;

export const errors = {
  generic: "Something went wrong.",
  rejectedByChain: "The chain refused the transaction.",
  network: "The network did not answer. Check your connection and try again.",
  wrongNetwork: (expected: number, actual: number) =>
    `The configured RPC is on chain ${actual}, not ${expected}. Nothing will be sent until this is fixed.`,
  assetMismatch: "A vault's asset is not the configured fUSD address. Writing is disabled until the configuration matches.",
  window: {
    "no-pqc-key": "This account has no registered ML-DSA-87 key, so the chain refuses its EVM transactions.",
    "no-window": "This account has no open EVM window, so the chain refused the transaction. Open one and try again.",
    exhausted: "The EVM window has run out of blocks, transactions or value. Open a new one.",
    invalid: "The chain refused the window's parameters.",
  },
  insufficientGas: "Not enough QOR to pay the fee.",
  contract: {
    ZeroAddress: "An address is missing.",
    ZeroAmount: "The amount must be above zero.",
    ZeroPeriod: "The claim interval and check-in period must be above zero.",
    AssetMismatch: "The yield source holds a different asset.",
    UnsupportedToken: "The token delivered less than was sent. Fee-on-transfer tokens are not supported.",
    UnknownPosition: "There is no such position.",
    PositionClosed: "The position is closed.",
    TooManyHeirs: "The vault allows at most 16 heirs.",
    InvalidHeir: "An heir has the zero address or a zero share.",
    DuplicateHeir: "An heir is listed twice.",
    HeirWeightsMustTotalBps: "The heirs' shares must total exactly 100%.",
    SignatureExpired: "The signature expired before the transaction was included. Sign again.",
    PositionSucceeded: "Succession has already happened.",
    PayoutNotDue: "No claim is due yet.",
    PositionNotSucceeded: "Succession has not happened.",
    SuccessionNotDue: "The succession deadline has not passed.",
    NoHeirs: "The position has no heirs.",
    CloseNotAllowed: "The owner did not keep the right to close.",
    InsufficientBuffer: "The buffer does not hold that much yet. Wait for more yield, or spend less.",
    BudgetNeedsPayoutAmount: "Budget mode needs a claim amount above zero.",
    BudgetExceeded: "This would take more than the budget allows in this window. Wait for the next window, or spend less.",
    PQCUnavailable: "The chain's post-quantum precompile did not answer.",
    PQCKeyNotRegistered: "The account has no registered ML-DSA-87 key.",
    PQCKeyUnsupported: "The account's registered key is not ML-DSA-87.",
    PQCKeyNotProven: "The account's ML-DSA-87 key has no proof of possession.",
    PQCSignatureInvalid: "The vault rejected the ML-DSA-87 signature.",
    ReserveExhausted: "The test yield source's reserve is empty. Harvests, claims and spends fail until it is refilled.",
    NotShareOwner: "The yield source refused the redemption.",
    ERC20InsufficientBalance: "Not enough fUSD.",
    ERC20InsufficientAllowance: "The vault is not approved to take this much fUSD. Approve first.",
    SafeERC20FailedOperation: "The token transfer failed.",
    ReentrancyGuardReentrantCall: "The vault refused a reentrant call.",
  },
} as const;

export const notFound = {
  title: "Nothing here.",
  body: "This page does not exist.",
  home: "Back to the overview",
} as const;

export type ContractErrorName = keyof typeof errors.contract;
