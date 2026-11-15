/**
 * Every word the app shows, in one place.
 *
 * Contract terms (position, principal, buffer, beneficiary, heirs, succession,
 * check-in, harvest, distribute) mean exactly what they mean in
 * PerennialVault.sol. "Margin" is the sizing multiplier and is never called a
 * buffer. Risks are stated as plain facts.
 */
import type { Phase } from "./lib/schedule";

export const brand = {
  name: "Perennial",
  descriptor: "On-chain endowments with post-quantum signatures",
  network: "Testnet",
} as const;

export const nav = {
  overview: "Overview",
  open: "Open a position",
  positions: "Positions",
  skip: "Skip to content",
  source: "Source",
} as const;

export const hero = {
  label: "On-chain endowment · QoreChain testnet",
  headline: "Spend the income. Never the capital.",
  headlineLines: ["Spend the income.", "Never the capital."],
  lede:
    "Perennial keeps capital on chain and pays out only what it earns, on a schedule, to a beneficiary who checks in. Nobody holds the keys. Every instruction carries an ML-DSA-87 signature, so a classical key recovered by a quantum computer moves nothing.",
  primary: "Open a position",
  secondary: "Look up a position",
  example: {
    label: "Example position",
    payout: "Payout",
    payoutValue: "400 fUSD a month",
    rate: "Yield rate",
    rateValue: "5% a year",
    margin: "Margin",
    marginValue: "1.15×",
    principal: "Principal",
    principalValue: "110,400 fUSD",
    note: "Deposited once. Never paid out. Its yield pays the 400.",
  },
} as const;

export const live = {
  label: "The vault today",
  title: "Read from the chain, not from us.",
  opened: "Positions opened",
  principal: "Principal held",
  harvested: "Yield harvested",
  paidOut: "Paid out",
  loading: "Reading the vault",
  error: "The vault could not be read. The testnet RPC may be unavailable.",
  retry: "Try again",
  contract: "Vault contract",
  simulated: "Testnet tokens. The yield is simulated.",
} as const;

export const calculator = {
  label: "Sizing",
  title: "One equation decides the deposit.",
  intro:
    "To pay C a year from yield at rate r, a position needs a principal of P = k × C ÷ r. The margin k is headroom: at 1.15 the yield can fall 13% before the payout outruns it.",
  modePrincipal: "From payout to principal",
  modePayout: "From principal to payout",
  payout: "Payout",
  every: "every",
  principal: "Principal",
  rate: "Yield rate",
  rateHint: "% a year. The testnet source pays 5%.",
  margin: "Margin",
  marginHint: "× the break-even principal.",
  resultPrincipal: "Principal needed",
  resultPayout: "Payout it supports",
  perYear: "a year",
  breakEven: "Break-even yield",
  coverage: "Coverage",
  invalid: "Enter amounts as plain numbers, the rate in percent and a margin of at least 1.",
  formula: "P = k × C ÷ r",
} as const;

export const intervals = {
  weekly: { label: "week", adjective: "Weekly", hint: "every 7 days" },
  monthly: { label: "month", adjective: "Monthly", hint: "a twelfth of a year, about 30.4 days" },
  quarterly: { label: "quarter", adjective: "Quarterly", hint: "a quarter of a year" },
  yearly: { label: "year", adjective: "Yearly", hint: "365 days" },
} as const;

export const how = {
  label: "How it works",
  title: "Four steps, then it runs on its own.",
  steps: [
    {
      title: "Deposit",
      body: "The owner deposits fUSD once. It becomes the position's principal and goes straight into the yield source. A payout from the vault can never touch it.",
    },
    {
      title: "Harvest",
      body: "Anyone can call harvest. It moves what the principal has earned, and only that, into the position's buffer.",
    },
    {
      title: "Claim and check in",
      body: "On schedule, the beneficiary signs a claim and the buffer pays them. A claim is also proof of life. Between claims a signed check-in does the same.",
    },
    {
      title: "Succession",
      body: "If the beneficiary is silent for the check-in period and the grace period, anyone can trigger succession. From then on, the payouts are split between the heirs. The principal stays invested.",
    },
  ],
} as const;

export const roles = {
  label: "Who can do what",
  title: "Authority is a signature, not an address.",
  intro:
    "Sensitive actions need an ML-DSA-87 signature from the role holder's registered key, checked inside the contract. Anyone may submit the transaction, and the money still goes where the position says.",
  columns: { action: "Action", who: "Authorised by", note: "Note" },
  rows: [
    { action: "Open, top up", who: "Whoever pays", note: "The beneficiary must already hold a proven ML-DSA-87 key." },
    { action: "Harvest", who: "Anyone", note: "Yield can only land in the position's buffer." },
    { action: "Claim", who: "Beneficiary's signature", note: "Paid to the beneficiary, whoever submits it. Counts as a check-in." },
    { action: "Check in", who: "Beneficiary's signature", note: "Restarts the check-in period." },
    { action: "Change heirs", who: "Beneficiary's signature", note: "Signed over the new list. Not possible after succession." },
    { action: "Trigger succession", who: "Anyone, after the deadline", note: "Cannot be undone." },
    { action: "Distribute", who: "Anyone, after succession", note: "Heirs and weights are frozen at succession." },
    { action: "Close", who: "Owner's signature", note: "Only if the owner kept the right when opening. Principal to the owner, buffer to the beneficiary or, after succession, the heirs." },
  ],
  footnote:
    "The vault has no admin, no upgrade path and no pause. A signed action is bound to the chain, the vault, the position, the action, a nonce and an expiry, so it works once and nowhere else.",
} as const;

export const uses = {
  label: "Uses",
  title: "Anything that needs a small, steady income and a successor.",
  note: "Principal at 5% a year and a 1.15 margin. At 4%, add a quarter.",
  items: [
    { title: "An agent's running costs", body: "The agent's account is the beneficiary and claims its own income. Its operators are the heirs: if the agent stops checking in, the income returns to them.", payout: "250 a month", principal: "69,000" },
    { title: "A parent's income", body: "Children fund a monthly income for a parent. When the parent stops checking in, it passes to the children.", payout: "400 a month", principal: "110,400" },
    { title: "A personal income", body: "Your own capital, paid to you on a schedule, with your heirs named up front.", payout: "1,000 a month", principal: "276,000" },
    { title: "A maintainer's stipend", body: "A community funds the person who keeps a library alive. If they stop checking in, the stipend passes to the next maintainers.", payout: "1,500 a month", principal: "414,000" },
    { title: "A public good's fixed bill", body: "An endpoint, an archive or a domain that nobody budgets for, paid from the income of a fund that is never spent.", payout: "80 a month", principal: "22,080" },
  ],
  unit: "fUSD",
  payoutLabel: "Payout",
  principalLabel: "Principal",
} as const;

export const simulated = {
  label: "What is simulated",
  title: "Real signatures. Simulated yield.",
  items: [
    { term: "Real", body: "The vault, the ML-DSA-87 signature checks, the schedule, the check-ins and succession all run on the QoreChain testnet exactly as written." },
    { term: "Simulated", body: "The yield. The principal sits in a mock source that pays a fixed 5% a year out of a reserve someone funded in advance. Nothing earns it." },
    { term: "Reserve", body: "If the mock's reserve runs out, harvests and claims fail until someone refills it." },
    { term: "Tokens", body: "fUSD is the testnet's dollar token. It has no value." },
  ],
  reserveLabel: "Mock reserve left",
} as const;

export const faq = {
  label: "Risks and questions",
  title: "What you should know before opening one.",
  items: [
    { q: "Is this live on mainnet?", a: "No. Perennial runs on the QoreChain testnet only. The post-quantum precompiles it depends on are not active on QoreChain mainnet." },
    { q: "Has it been audited?", a: "No. The contracts are open source and tested, including invariant tests, but no one has audited them." },
    { q: "Where does the yield come from?", a: "On the testnet, from a mock that pays a fixed rate out of a pre-funded reserve. No real yield is earned. A real source would be an on-chain vault, and a real source can lose value." },
    { q: "What if the yield source loses value?", a: "The position earns nothing until the source recovers. The vault never tops up the principal from anywhere." },
    { q: "Can I get my principal back?", a: "Only if you kept the right to close when you opened the position. Without it, the principal can never be withdrawn by anyone, including you." },
    { q: "What if the buffer cannot fund a payout?", a: "That period is paid in part, from what the buffer holds, and the shortfall is not carried over. Payouts never exceed what the principal has earned." },
    { q: "What happens if the beneficiary stops checking in?", a: "After the check-in period and the grace period, anyone can trigger succession. It cannot be undone. The payouts then go to the heirs by weight." },
    { q: "And if there are no heirs?", a: "Succession cannot happen. The income stays in the buffer, and only the beneficiary can claim it." },
    { q: "Who holds the keys?", a: "Nobody. The vault has no admin and no upgrade path. Every sensitive action needs the role holder's own ML-DSA-87 signature." },
    { q: "What does a quantum computer change?", a: "It could recover a classical secp256k1 key from its public key. In Perennial that key alone can claim nothing, check in for no one, change no heirs and close nothing. A stolen ML-DSA-87 key is a different matter: it can do whatever its role allows." },
    { q: "How does this page sign?", a: "With a key derived from a recovery phrase you type into this tab. The page derives the account's keys from it and then clears the phrase. The keys stay in the tab's memory, are never stored or sent, and are dropped when you lock, after 15 minutes idle or when the tab closes. Anyone who controls this page's code while it is unlocked can sign as that account. Use a phrase made for the testnet." },
  ],
} as const;

export const footer = {
  line: "Open source under the MIT licence. Testnet only. Unaudited.",
  explorer: "The QoreChain explorer opens on mainnet: use its Testnet switch. It does not look up EVM transaction hashes yet, so this page shows them in full.",
  vault: "Vault",
  asset: "Asset",
  source: "Yield source",
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
  openWindow: "Open a window for Perennial",
  openingWindow: "Opening the window",
  windowOpened: "Window opened, limited to the vault and fUSD.",
  closeWindow: "Close the window",
  autoLock: "Locks after 15 minutes without activity.",
  refresh: "Refresh",
  faucet: "Testnet faucet",
} as const;

export const unlock = {
  title: "Unlock an account",
  intro:
    "The QoreX wallet cannot yet sign arbitrary messages or EVM transactions for a web page, so this page signs with a key derived from your recovery phrase.",
  points: [
    "The page derives this account's keys from the phrase, then clears the phrase. The keys stay in this tab's memory. Neither is stored, sent anywhere or logged.",
    "The keys are dropped when you lock, after 15 minutes without activity, and when you close or reload the tab.",
    "While the account is unlocked, anyone who controls this page's code can sign as it. That includes whoever hosts the page and any browser extension that can read it.",
    "Use a phrase made for the testnet. Never a phrase that holds anything of value.",
  ],
  phrase: "Recovery phrase",
  phraseHint: "12 or 24 words, separated by spaces.",
  consent: "I understand the page holds this key while it is unlocked, and this is a testnet-only phrase.",
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
    body: "QoreChain admits EVM transactions only while the sending account has an open window, a permission signed with its post-quantum key. This page opens one limited to the vault and fUSD, for about an hour and a few transactions.",
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
    body: "This account holds no fUSD. The faucet pays fUSD as a native coin, which contracts cannot see: it has to be converted to the ERC-20 token, with the chain's MsgConvertCoin message sent to this account's 0x address, before it can be deposited.",
  },
} as const;

export const open = {
  label: "New position",
  title: "Open a position",
  intro: "The deposit becomes the principal. It is never paid out. Its yield funds the payouts on the schedule below.",
  steps: ["Terms", "Heirs", "Review"],
  amount: "Principal",
  amountHint: "Deposited once, in fUSD.",
  balance: "Balance",
  useMax: "Use all",
  beneficiary: "Beneficiary",
  beneficiaryHint: "Receives the payouts. Must already hold a registered ML-DSA-87 key with proven possession.",
  beneficiaryUseEvm: "This account",
  beneficiaryUseNative: "Its Native account",
  payout: "Payout per interval",
  payoutHint: "Leave at 0 to pay out everything in the buffer each time.",
  payoutEverything: "Everything in the buffer",
  interval: "Payout interval",
  checkInPeriod: "Check-in period",
  checkInHint: "How long the beneficiary may go without a claim or check-in.",
  grace: "Grace period",
  graceHint: "Extra time after a missed check-in before succession opens.",
  days: "days",
  ownerCanClose: "Keep the right to close",
  ownerCanCloseOn:
    "You can later close the position with your own signature: the principal returns to you and the buffer to the beneficiary, or to the heirs after succession. Your account needs a registered ML-DSA-87 key.",
  ownerCanCloseOff:
    "The position is permanent. Nobody, including you, can ever withdraw the principal. Only its income leaves the vault.",
  ownerCanCloseNote: "This choice is fixed at opening and cannot be changed.",
  sizing: "Sizing check",
  sizingNeeds: (principal: string) => `At the source's rate and a 1.15 margin, this payout needs ${principal} fUSD.`,
  sizingShort: "The principal is smaller than the payout needs. The buffer will run short and periods will be paid in part.",
  sizingOk: "The principal covers the payout with margin.",
  sizingEverything: "Each payout is whatever the buffer holds.",
  heirsTitle: "Heirs",
  heirsIntro: "After succession, each payout is split between the heirs by weight. Weights must total 100%.",
  heirsNone: "No heirs. If the beneficiary stops checking in, nothing happens: the income stays in the buffer.",
  addHeir: "Add an heir",
  removeHeir: "Remove",
  heirAddress: "Heir address",
  heirPercent: "Share",
  split: "Split evenly",
  total: "Total",
  review: "Review",
  reviewIntro: "Check every line. After opening, only the heirs can be changed, and only by the beneficiary.",
  approve: "Approve fUSD",
  approving: "Approving",
  submit: "Open position",
  submitting: "Opening",
  opened: (id: string) => `Position ${id} is open.`,
  view: "View the position",
  needsAccount: "Unlock an account to open a position. Everything else on this page works without one.",
  errors: {
    amount: "Enter a principal above zero, with at most 6 decimals.",
    balance: "The principal is more than this account's fUSD balance.",
    beneficiary: "Enter a valid 0x address.",
    beneficiaryKey: "This address has no registered ML-DSA-87 key with proven possession. The vault would refuse to open.",
    payout: "Enter a payout of zero or more, with at most 6 decimals.",
    days: "Enter a whole number of days, at least 1.",
    graceDays: "Enter a whole number of days, 0 or more.",
    ownerKey: "Your account needs a registered ML-DSA-87 key with proven possession to keep the right to close.",
  },
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
  all: "All positions",
} as const;

export const phases: Record<Phase, { name: string; detail: string }> = {
  active: { name: "Active", detail: "The beneficiary is within the check-in period." },
  grace: { name: "Check-in overdue", detail: "The check-in period has passed. The grace period is running; a check-in or claim still restores the position." },
  "succession-open": { name: "Succession open", detail: "The check-in and grace periods have both passed. Anyone can now trigger succession, unless the beneficiary checks in first." },
  stalled: { name: "Silent, no heirs", detail: "The deadline has passed, but there are no heirs, so succession cannot happen. Only the beneficiary can claim." },
  succeeded: { name: "Succeeded", detail: "The beneficiary missed the deadline and succession was triggered. Payouts now go to the heirs." },
  closed: { name: "Closed", detail: "The owner closed this position. Its principal was returned." },
};

export const position = {
  label: (id: string) => `Position ${id}`,
  notFound: (id: string) => `There is no position ${id} in this vault.`,
  principal: "Principal",
  principalNote: "Never paid out.",
  buffer: "Buffer",
  bufferNote: "Harvested yield, waiting to be paid.",
  pending: "Pending yield",
  pendingNote: "Earned, not yet harvested.",
  payableNow: "Payable now",
  payout: "Payout",
  payoutEverything: "Everything in the buffer",
  every: "every",
  nextPayout: "Next payout",
  due: "Due now",
  covered: "Payouts the buffer covers",
  coveredNone: "Not one full payout yet",
  coveredEverything: "Each payout is the whole buffer",
  expectedYield: "Expected yield per interval",
  selfFunding: "The expected yield covers the payout.",
  drawingDown: "The expected yield is less than the payout. Payouts will be partial once the buffer is empty.",
  checkInDue: "Check-in due",
  successionAt: "Succession possible after",
  lastCheckIn: "Last check-in",
  status: "Status",
  owner: "Owner",
  beneficiary: "Beneficiary",
  closable: "Owner can close",
  closableYes: "Yes, with the owner's signature",
  closableNo: "No. The principal is permanent.",
  nonce: "Signed actions so far",
  heirs: "Heirs",
  heirsNone: "No heirs. Succession cannot happen.",
  history: "History",
  historyEmpty: "No events yet.",
  actions: "Actions",
  actionsLocked: "Unlock an account to act. Harvest, trigger succession and distribute work from any account; the others need the role holder's signature.",
  readOnlyNote: "You are viewing this position read-only.",
  topUp: "Add principal",
  topUpHint: "Anyone can add principal. It is never paid out.",
  updated: "Updated",
  events: {
    Opened: "Opened",
    ToppedUp: "Principal added",
    HeirsSet: "Heirs set",
    Harvested: "Harvested",
    Claimed: "Claimed",
    Distributed: "Distributed to heirs",
    CheckedIn: "Checked in",
    SuccessionTriggered: "Succession triggered",
    Closed: "Closed",
  },
} as const;

export const actions = {
  harvest: { label: "Harvest", hint: "Moves pending yield into the buffer. Anyone can.", done: "Harvested." },
  claim: { label: "Claim", hint: "Pays what the schedule owes to the beneficiary. Also counts as a check-in.", done: "Claimed." },
  checkIn: { label: "Check in", hint: "Proves the beneficiary is there and restarts the check-in period.", done: "Checked in." },
  setHeirs: { label: "Change heirs", hint: "Replaces the heirs. Counts as a check-in.", done: "Heirs updated." },
  trigger: { label: "Trigger succession", hint: "Hands the income to the heirs. Cannot be undone.", done: "Succession triggered." },
  distribute: { label: "Distribute", hint: "Pays the scheduled amount to the heirs by weight. Anyone can.", done: "Distributed." },
  close: { label: "Close position", hint: "Returns the principal to the owner and the buffer to the beneficiary, or to the heirs after succession. Ends the position.", done: "Position closed." },
  topUp: { label: "Add principal", approve: "Approve fUSD", approved: "fUSD approved. Now add it.", done: "Principal added." },
  confirmTrigger: "Confirm: trigger succession",
  unavailable: {
    notDue: "No payout is due yet.",
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
  assetMismatch: "The vault's asset is not the configured fUSD address. Writing is disabled until the configuration matches.",
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
    ZeroPeriod: "The payout interval and check-in period must be above zero.",
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
    PayoutNotDue: "No payout is due yet.",
    PositionNotSucceeded: "Succession has not happened.",
    SuccessionNotDue: "The succession deadline has not passed.",
    NoHeirs: "The position has no heirs.",
    CloseNotAllowed: "The owner did not keep the right to close.",
    PQCUnavailable: "The chain's post-quantum precompile did not answer.",
    PQCKeyNotRegistered: "The account has no registered ML-DSA-87 key.",
    PQCKeyUnsupported: "The account's registered key is not ML-DSA-87.",
    PQCKeyNotProven: "The account's ML-DSA-87 key has no proof of possession.",
    PQCSignatureInvalid: "The vault rejected the ML-DSA-87 signature.",
    ReserveExhausted: "The mock yield source's reserve is empty. Harvests and claims fail until it is refilled.",
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
