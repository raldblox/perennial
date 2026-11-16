/**
 * The parts of the deployed contracts the app calls, as human-readable ABI.
 * Kept in step with contracts/src by hand; the errors are listed so a revert
 * decodes to its name and arguments.
 */
import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "struct Heir { address account; uint16 bps; }",
  "struct OpenParams { uint256 amount; address beneficiary; uint256 payoutAmount; uint64 payoutInterval; uint64 checkInPeriod; uint64 gracePeriod; bool ownerCanClose; Heir[] heirs; uint256 bufferCap; bool budgetMode; }",
  "struct Position { address owner; address beneficiary; bool ownerCanClose; bool succeeded; bool closed; uint64 payoutInterval; uint64 checkInPeriod; uint64 gracePeriod; uint64 lastCheckIn; uint64 lastPayout; uint256 payoutAmount; uint256 principal; uint256 shares; uint256 buffer; uint256 nonce; uint256 bufferCap; bool budgetMode; uint64 windowStart; uint256 windowSpent; }",

  "function ASSET() view returns (address)",
  "function SOURCE() view returns (address)",
  "function positionCount() view returns (uint256)",
  "function position(uint256 positionId) view returns (Position)",
  "function heirs(uint256 positionId) view returns (Heir[])",
  "function pendingYield(uint256 positionId) view returns (uint256)",
  "function nextPayoutAt(uint256 positionId) view returns (uint256)",
  "function budgetRemaining(uint256 positionId) view returns (uint256)",
  "function successionDeadline(uint256 positionId) view returns (uint256)",
  "function actionMessage(uint256 positionId, uint8 action, uint256 nonce, uint256 deadline, bytes32 paramsHash) view returns (bytes)",

  "function open(OpenParams p) returns (uint256 positionId)",
  "function topUp(uint256 positionId, uint256 amount)",
  "function fund(uint256 positionId, uint256 amount)",
  "function harvest(uint256 positionId) returns (uint256)",
  "function claim(uint256 positionId, uint256 deadline, bytes signature) returns (uint256)",
  "function checkIn(uint256 positionId, uint256 deadline, bytes signature)",
  "function setHeirs(uint256 positionId, Heir[] newHeirs, uint256 deadline, bytes signature)",
  "function triggerSuccession(uint256 positionId)",
  "function distribute(uint256 positionId) returns (uint256)",
  "function closeByOwner(uint256 positionId, uint256 deadline, bytes signature)",
  "function spend(uint256 positionId, address to, uint256 amount, bytes32 ref, uint256 deadline, bytes signature)",

  "event Opened(uint256 indexed positionId, address indexed owner, address indexed beneficiary, uint256 amount, uint256 payoutAmount, uint64 payoutInterval, uint64 checkInPeriod, uint64 gracePeriod, bool ownerCanClose, uint256 bufferCap)",
  "event ToppedUp(uint256 indexed positionId, address indexed from, uint256 amount)",
  "event HeirsSet(uint256 indexed positionId, Heir[] heirs)",
  "event Harvested(uint256 indexed positionId, address indexed caller, uint256 yield)",
  "event SuccessionTriggered(uint256 indexed positionId, address indexed caller)",
  "event Distributed(uint256 indexed positionId, uint256 amount, uint256 periods)",
  "event Closed(uint256 indexed positionId, address indexed owner, uint256 principalReturned, uint256 yieldPaid)",
  "event CheckedIn(uint256 indexed positionId, address indexed beneficiary, uint256 successionDeadline)",
  "event Claimed(uint256 indexed positionId, address indexed beneficiary, uint256 amount, uint256 periods)",
  "event Spent(uint256 indexed positionId, address indexed to, uint256 amount, bytes32 indexed ref)",
  "event Compounded(uint256 indexed positionId, uint256 amount)",
  "event Funded(uint256 indexed positionId, address indexed from, uint256 amount)",
  "event PrincipalDrawn(uint256 indexed positionId, uint256 amount)",

  "error ZeroAddress()",
  "error ZeroAmount()",
  "error ZeroPeriod()",
  "error AssetMismatch()",
  "error UnsupportedToken()",
  "error UnknownPosition(uint256 positionId)",
  "error PositionClosed(uint256 positionId)",
  "error TooManyHeirs()",
  "error InvalidHeir()",
  "error DuplicateHeir(address account)",
  "error HeirWeightsMustTotalBps()",
  "error SignatureExpired(uint256 deadline)",
  "error PositionSucceeded(uint256 positionId)",
  "error PayoutNotDue(uint256 positionId, uint256 dueAt)",
  "error PositionNotSucceeded(uint256 positionId)",
  "error SuccessionNotDue(uint256 positionId, uint256 notBefore)",
  "error NoHeirs(uint256 positionId)",
  "error CloseNotAllowed(uint256 positionId)",
  "error InsufficientBuffer(uint256 positionId, uint256 available)",
  "error BudgetNeedsPayoutAmount()",
  "error BudgetExceeded(uint256 positionId, uint256 remaining)",
  "error PQCUnavailable(address precompile)",
  "error PQCKeyNotRegistered(address account)",
  "error PQCKeyUnsupported(address account)",
  "error PQCKeyNotProven(address account)",
  "error PQCSignatureInvalid(address account)",
  "error ReserveExhausted(uint256 needed, uint256 available)",
  "error NotShareOwner()",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error SafeERC20FailedOperation(address token)",
  "error ReentrancyGuardReentrantCall()",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
]);

export const yieldSourceAbi = parseAbi([
  "function RATE_PER_YEAR() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

export const pqcKeyStatusAbi = parseAbi([
  "function pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey, bool possessionProven)",
]);

/** The vault's `Action` enum. */
export const Action = { CheckIn: 0, Claim: 1, SetHeirs: 2, Close: 3, Spend: 4 } as const;
export type ActionName = keyof typeof Action;
