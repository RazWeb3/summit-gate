// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// -------------------------------------------------------
// 目的: 山小屋への分配金（JPYC）を管理するスマートコントラクト
// 作成日: 2025/12/26
//
// 更新履歴:
// 2025/12/26 初版作成
// 理由: 山小屋への透明性ある分配と、資金決済法回避（非カストディ）を実現するため
// 2025/12/27 AccessControl導入
// 理由: 共同運営を可能にするため、権限をOPERATOR_ROLEとCONFIG_ROLEに分離
// -------------------------------------------------------

/**
 * @title SummitGateDistribution
 * @dev 山小屋へのJPYC分配を管理するコントラクト。
 *      Gasless Transaction（メタトランザクション）に対応するため、Contextを継承し _msgSender() を使用。
 */
contract SummitGateDistribution is Context, AccessControl, ReentrancyGuard {
    
    // ロール定義
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // 配分実行権限
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");     // 設定変更権限

    // JPYCトークンのインターフェース
    IERC20 public immutable jpyc;

    // 山小屋のウォレットアドレスごとの分配可能残高
    mapping(address => uint256) public allocations;

    // 既に割り当て済みの総額（未引き出し分を含む）
    uint256 public totalAllocated;

    // 手数料設定（比率指定: Numerator / Denominator）
    // 例: 1800:100 の場合 -> Hut: 18, Fee: 1 -> Fee = Hut * 1/18
    uint256 public feeNumerator = 1;
    uint256 public feeDenominator = 18;
    address public feeRecipient;

    // イベント定義
    event Deposited(address indexed from, uint256 amount, uint256 timestamp);
    event Allocated(address indexed hut, uint256 amount, uint256 timestamp);
    event Claimed(address indexed hut, uint256 amount, uint256 timestamp);
    event FeeCollected(address indexed recipient, uint256 amount, uint256 timestamp);
    event FeeConfigUpdated(uint256 newNumerator, uint256 newDenominator, address newRecipient);

    /**
     * @dev コンストラクタ
     * @param _jpycAddress JPYCコントラクトのアドレス（Avalanche C-Chain）
     */
    constructor(address _jpycAddress) {
        require(_jpycAddress != address(0), "Invalid JPYC address");
        jpyc = IERC20(_jpycAddress);
        feeRecipient = _msgSender(); // 初期手数料受取人はデプロイ者

        // デプロイ者に全ての権限を付与
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(OPERATOR_ROLE, _msgSender());
        _grantRole(CONFIG_ROLE, _msgSender());
    }

    /**
     * @dev 手数料設定の更新（CONFIG_ROLEのみ）
     *      上限（10%）を超える設定は不可 -> Rug Pull防止
     *      手数料率 = Num / (Num + Den) <= 1/10
     *      10 * Num <= Num + Den
     *      9 * Num <= Den
     */
    function setFeeConfig(uint256 _numerator, uint256 _denominator, address _recipient) external {
        _checkRole(CONFIG_ROLE);
        require(_denominator > 0, "Denominator cannot be zero");
        require(_recipient != address(0), "Invalid recipient");
        
        // Rug Pull防止: 手数料率が総額の10%を超えないことを確認
        // FeeRatio = Num / (Num + Den)
        // Max 10% -> 1/10
        // Num / (Num + Den) <= 1/10  =>  10*Num <= Num + Den  =>  9*Num <= Den
        require(9 * _numerator <= _denominator, "Fee exceeds limit (max 10%)");
        
        feeNumerator = _numerator;
        feeDenominator = _denominator;
        feeRecipient = _recipient;
        
        emit FeeConfigUpdated(_numerator, _denominator, _recipient);
    }

    /**
     * @dev JPYCを受け入れる関数
     *      誰でも実行可能（JPYC社、委託業者、寄付者など）
     *      事前に approve が必要
     * @param amount 入金するJPYCの額
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        
        // JPYCをコントラクトに転送
        require(jpyc.transferFrom(_msgSender(), address(this), amount), "Transfer failed");

        emit Deposited(_msgSender(), amount, block.timestamp);
    }

    /**
     * @dev 個別分配設定（OPERATOR_ROLEのみ）
     * @param hut 山小屋のアドレス
     * @param amount 分配額
     */
    function allocate(address hut, uint256 amount) external {
        _checkRole(OPERATOR_ROLE);
        require(hut != address(0), "Invalid hut address");
        require(amount > 0, "Amount must be greater than 0");

        uint256 contractBalance = jpyc.balanceOf(address(this));
        uint256 unallocatedBalance = contractBalance - totalAllocated;
        require(unallocatedBalance >= amount, "Insufficient unallocated balance");

        allocations[hut] += amount;
        totalAllocated += amount;

        emit Allocated(hut, amount, block.timestamp);
    }

    /**
     * @dev 運営が計算結果に基づいて、各山小屋への分配額を記録する関数（一括）
     *      実際の資金移動は行わず、引き出し権利（allocations）を更新するのみ
     *      資金決済法回避のため、運営は資金をプールせず、コントラクト上の数字のみを操作する
     *      OPERATOR_ROLEのみ実行可能
     * @param huts 山小屋のアドレスリスト
     * @param amounts 各山小屋への分配額リスト
     */
    function batchAllocate(address[] calldata huts, uint256[] calldata amounts) external {
        _checkRole(OPERATOR_ROLE);
        require(huts.length == amounts.length, "Mismatched arrays");

        uint256 totalNewHutAllocation = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalNewHutAllocation += amounts[i];
        }

        // 手数料計算: 山小屋配分額に対応する手数料を計算
        // fee = totalNewHutAllocation * Num / Den
        // 例: 1800 * 1 / 18 = 100
        uint256 feeAmount = 0;
        if (feeNumerator > 0 && feeDenominator > 0) {
            feeAmount = (totalNewHutAllocation * feeNumerator) / feeDenominator;
        }

        uint256 totalRequired = totalNewHutAllocation + feeAmount;

        // 割り当て可能な残高があるか確認
        // (コントラクトの全JPYC残高) - (既に割り当て済みの総額) >= (今回割り当てる総額 + 手数料)
        uint256 contractBalance = jpyc.balanceOf(address(this));
        uint256 unallocatedBalance = contractBalance - totalAllocated;
        require(unallocatedBalance >= totalRequired, "Insufficient unallocated balance");

        // 山小屋への配分
        for (uint256 i = 0; i < huts.length; i++) {
            require(huts[i] != address(0), "Invalid hut address");
            require(amounts[i] > 0, "Amount must be greater than 0");

            allocations[huts[i]] += amounts[i];
            emit Allocated(huts[i], amounts[i], block.timestamp);
        }

        // 手数料の配分（送金ではなく割り当て）
        if (feeAmount > 0) {
            allocations[feeRecipient] += feeAmount;
            emit FeeCollected(feeRecipient, feeAmount, block.timestamp);
        }
        
        // 総割り当て額を更新
        totalAllocated += totalRequired;
    }

    /**
     * @dev 山小屋が自分の割り当て分を引き出す関数
     *      Gasless Transactionに対応するため _msgSender() を使用
     *      ワンクリック償還UIの裏側で呼ばれることを想定
     */
    function withdraw() external nonReentrant {
        address hut = _msgSender();
        uint256 amount = allocations[hut];

        require(amount > 0, "No allocation to claim");

        // 残高をゼロにする（Reentrancy防止のため、送金前に更新）
        allocations[hut] = 0;
        
        // 総割り当て額からも減算（引き出されたため）
        // totalAllocated は「コントラクト内に残っている割り当て済み資金」を表す
        totalAllocated -= amount;

        // JPYCを山小屋のアドレスへ送金
        require(jpyc.transfer(hut, amount), "Transfer failed");

        emit Claimed(hut, amount, block.timestamp);
    }

    /**
     * @dev コントラクト内のJPYC残高を確認する関数
     */
    function getContractBalance() external view returns (uint256) {
        return jpyc.balanceOf(address(this));
    }
}