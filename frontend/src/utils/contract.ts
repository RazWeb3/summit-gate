// -------------------------------------------------------
// 目的: フロントエンドから参照するコントラクト定数とABIを集約する
// 作成日: 2025/12/26
//
// 更新履歴:
// 2025/12/27 11:20 ローカル再デプロイに伴いアドレス更新、AccessControl用ABIを追加
// 理由: owner()未実装による呼び出し失敗を避け、ロールで権限判定するため
// 2025/12/28 10:05 ローカルデプロイ結果に合わせてアドレス更新
// 理由: Hardhatノード上の実デプロイ先と不一致でAPIが失敗するため
// 2025/12/28 10:25 feeRecipient取得用ABIを追加
// 理由: 運営手数料（引き出し可能残高）表示のため
// 2025/12/30 23:38 ローカル再デプロイに合わせてアドレス更新
// 理由: オンチェーン動作デモで参照先を最新化するため
// -------------------------------------------------------

export const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
export const JPYC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const DISTRIBUTION_ABI = [
  "function allocations(address) view returns (uint256)",
  "function totalAllocated() view returns (uint256)",
  "function deposit(uint256 amount) external",
  "function allocate(address hut, uint256 amount) external",
  "function batchAllocate(address[] calldata huts, uint256[] calldata amounts) external",
  "function withdraw() external",
  "function getContractBalance() view returns (uint256)",
  "function feeNumerator() view returns (uint256)",
  "function feeDenominator() view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function OPERATOR_ROLE() view returns (bytes32)",
  "function CONFIG_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "event Deposited(address indexed from, uint256 amount, uint256 timestamp)",
  "event Allocated(address indexed hut, uint256 amount, uint256 timestamp)",
  "event Claimed(address indexed hut, uint256 amount, uint256 timestamp)"
];

export const JPYC_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function mint(address to, uint256 amount) external", // MockJPYCのみ
    "function transfer(address to, uint256 amount) external returns (bool)",
    // EIP-2612: Permit (Gasless Approval)
    "function nonces(address owner) view returns (uint256)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
    // EIP-3009: Transfer With Authorization (Gasless Transfer)
    "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
    "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"
];
