"use client";
// -------------------------------------------------------
// 目的: 運営者が資金配分を管理・実行するためのダッシュボード
// 作成日: 2025-12-26
//
// 更新履歴:
// 2025/12/31 00:00 引き出し可能残高テーブルのレスポンシブ改善（アドレス折返し・金額崩れ防止）
// 理由: モバイル幅でウォレットアドレス/金額が横にはみ出して表示崩れするため
// 2025-12-27 10:30 ウォレット接続処理のデバッグログ追加とエラーハンドリング強化
// 理由: ユーザーからの「接続ボタンが反応しない」という報告を受け、原因特定のため
// 2025-12-27 11:20 AccessControlによる権限判定に変更、owner()呼び出しを廃止
// 理由: コントラクトにowner()が存在せず、接続時にrevertが発生するため
// 2025-12-28 09:45 lint対応（any排除・未使用変数解消）
// 理由: CI相当のlintでエラーとなりビルド前検証が通らないため
// 2025-12-28 10:15 入金成功表示と分配失敗の原因（ネットワーク/権限）を明確化
// 理由: TX失敗でも「入金確認」扱いになり、その後の分配実行が失敗するため
// 2025-12-28 10:25 分配後の引き出し可能残高をオンチェーンから取得して表示
// 理由: 配分トランザクション成功後も表示が0のままで誤解を招くため
// 2025-12-27 10:00 デモモード承認後の配分額反映バグ修正、引き出しシミュレーションの安全性向上
// 理由: ステート更新の競合により、承認後に「引き出し可能額」が表示されない問題を解消するため
// 2025-12-26 15:30 JPYC直接入金対応、未分配残高管理、手動補正機能付き配分フロー実装
// 理由: ユーザー要望（比率確認・補正・承認フロー）に対応するため
// 2025-12-28 12:40 DEMO_MODEの宣言位置調整と依存解決
// 理由: TypeScriptで「宣言前参照」エラーが発生し、ビルド前検証が通らないため
// 2025/12/30 23:38 DEMO_MODEを環境変数で切り替え可能に変更
// 理由: オンチェーン動作デモとデモモードを切り替えて撮影するため
// -------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useDemoData } from "@/hooks/useDemoData";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, DISTRIBUTION_ABI, JPYC_ADDRESS, JPYC_ABI } from "@/utils/contract";
import { Wallet, Loader2, ShieldCheck, ArrowRight, RefreshCw, Calculator, TrendingUp, CheckCircle2 } from "lucide-react";

type Hut = {
  id: number;
  name: string;
  address: string;
  count: number;
};

type DistributionPlanItem = Hut & {
  adjustedCount: number;
  ratio: number;
  amount: number;
};

export default function AdminPage() {
  const EXPECTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID ?? "31337");

  // --------------------------------------------------------------------------------
  // デモモード設定
  // trueの場合: ブロックチェーン(Hardhat)に接続せず、React Stateだけで完結させる
  // これにより、Hardhat再起動なしでリセットや資金操作が自由に行える
  // --------------------------------------------------------------------------------
  const DEMO_MODE = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "false") === "true";

  const { 
    data: demoData, 
    deposit: demoDeposit, 
    allocate: demoAllocate, 
    withdrawHut: demoWithdrawHut, 
    withdrawFee: demoWithdrawFee,
    reset: demoReset
  } = useDemoData();

  const [account, setAccount] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  
  // コントラクト状態
  const [contractTotalBalance, setContractTotalBalance] = useState("0");
  const [totalAllocated, setTotalAllocated] = useState("0");
  const [unallocatedBalance, setUnallocatedBalance] = useState("0");
  const [feeNumerator, setFeeNumerator] = useState(1);
  const [feeDenominator, setFeeDenominator] = useState(18); // 1800:100 = 18:1
  
  // 計算用状態
  const [hutsData, setHutsData] = useState<Hut[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [distributionPlan, setDistributionPlan] = useState<DistributionPlanItem[]>([]);
  
  // 補正係数（特定の山小屋用）
  const [coefficients, setCoefficients] = useState<{[key: number]: number}>({});

  // 山小屋ごとの分配済み残高（引き出し可能額）
  const [hutAllocations, setHutAllocations] = useState<{[key: number]: string}>({});
  // 運営手数料の分配済み残高
  const [feeAllocation, setFeeAllocation] = useState("0");
  const [feeRecipientAddress, setFeeRecipientAddress] = useState<string | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [activeStep, setActiveStep] = useState(1); // 1:入金確認 -> 2:配分案作成 -> 3:承認実行

  // デモ用：JPYC直接入金機能
  const [demoDepositAmount, setDemoDepositAmount] = useState("10000");

  // totalCountが変わったらデモ入金額を自動調整（推奨値: 1900 * totalCount）
  // 既に残高がある場合は、不足分のみを補填するように計算
  useEffect(() => {
    if (totalCount > 0) {
      const targetAmount = totalCount * 1900;
      const currentBalance = Number(unallocatedBalance);
      const needed = targetAmount - currentBalance;
      
      // 不足している場合、または残高が0の場合にセット
      // 残高が多くても、ユーザーが追加したい場合のためにターゲット額自体は計算しておくが、
      // ここでは「目標額に合わせるための差額」または「目標額そのもの」を提案する
      if (needed > 0) {
        setDemoDepositAmount(needed.toString());
      } else if (currentBalance === 0) {
        setDemoDepositAmount(targetAmount.toString());
      } else {
        // 残高が十分ある場合でも、デモとして全額入金などを試せるようにターゲット額を入れておく
        setDemoDepositAmount(targetAmount.toString());
      }
    }
  }, [totalCount, unallocatedBalance]);

  // 初期データ取得
  useEffect(() => {
    const fetchDbData = async () => {
      try {
        const res = await fetch('/api/huts');
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (typeof data === 'object' && data !== null) {
          const record = data as { huts?: unknown; coefficients?: unknown };
          if (Array.isArray(record.huts)) {
            setHutsData(record.huts as Hut[]);
          }
          if (typeof record.coefficients === 'object' && record.coefficients !== null) {
            setCoefficients(record.coefficients as Record<number, number>);
          }
        }
      } catch (error) {
        console.error("Failed to fetch DB data", error);
      }
    };
    fetchDbData();
    fetchContractStatus();
  }, []);

  const fetchContractStatus = async (): Promise<null | {
    contractBalance: string;
    totalAllocated: string;
    unallocatedBalance: string;
    feeNumerator: number;
    feeDenominator: number;
  }> => {
    try {
      const res = await fetch('/api/contract/status');
      if (res.ok) {
        const data: {
          contractBalance: string;
          totalAllocated: string;
          feeNumerator: number;
          feeDenominator: number;
        } = await res.json();

        setContractTotalBalance(data.contractBalance);
        setTotalAllocated(data.totalAllocated);
        // Calculate unallocated
        const cBal = parseFloat(data.contractBalance);
        const tAlloc = parseFloat(data.totalAllocated);
        const unallocated = (cBal - tAlloc).toString();
        setUnallocatedBalance(unallocated);
        
        setFeeNumerator(data.feeNumerator);
        setFeeDenominator(data.feeDenominator);

        return {
          contractBalance: data.contractBalance,
          totalAllocated: data.totalAllocated,
          unallocatedBalance: unallocated,
          feeNumerator: data.feeNumerator,
          feeDenominator: data.feeDenominator,
        };
      }
    } catch (error) {
      console.error("Failed to fetch contract status via API", error);
    }
    return null;
  };

  const fetchAllocations = useCallback(async (provider: ethers.BrowserProvider) => {
    if (DEMO_MODE) return;

    try {
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) return;

      const distributionContract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, provider);

      if (hutsData.length > 0) {
        const values = await Promise.all(
          hutsData.map(async (hut) => {
            try {
              const amount = await distributionContract.allocations(hut.address);
              return amount as bigint;
            } catch {
              return BigInt(0);
            }
          })
        );

        const next: Record<number, string> = {};
        hutsData.forEach((hut, idx) => {
          next[hut.id] = values[idx].toString();
        });
        setHutAllocations(next);
      }

      try {
        const feeRecipient = await distributionContract.feeRecipient();
        setFeeRecipientAddress(feeRecipient);
        const feeAmount = await distributionContract.allocations(feeRecipient);
        setFeeAllocation((feeAmount as bigint).toString());
      } catch {
        setFeeRecipientAddress(null);
      }
    } catch (e) {
      console.error("Failed to fetch allocations", e);
    }
  }, [DEMO_MODE, EXPECTED_CHAIN_ID, hutsData]);

  // 変更を保存する関数
  const saveChanges = async (newHuts: Hut[], newCoefs: Record<number, number>) => {
    try {
      await fetch('/api/huts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          huts: newHuts,
          coefficients: newCoefs
        })
      });
    } catch (error) {
      console.error("Failed to save changes", error);
    }
  };

  useEffect(() => {
    // 合計計算（係数適用後）
    const total = hutsData.reduce((sum, hut) => {
      const coef = coefficients[hut.id] ?? 1.0;
      return sum + Math.floor(hut.count * coef);
    }, 0);
    setTotalCount(total);
  }, [hutsData, coefficients]);

  // カウント編集ハンドラー
  const handleCountChange = (id: number, newCount: string) => {
    const count = parseInt(newCount) || 0;
    const newHuts = hutsData.map(hut => 
      hut.id === id ? { ...hut, count: count < 0 ? 0 : count } : hut
    );
    setHutsData(newHuts);
    // デバウンスなしで即保存（簡易実装）
    saveChanges(newHuts, coefficients);
  };

  // 係数編集ハンドラー
  const handleCoefficientChange = (id: number, newCoef: string) => {
    const coef = parseFloat(newCoef);
    if (!isNaN(coef) && coef >= 0 && coef <= 2.0) { // 0.0~2.0の範囲で許可
      const newCoefs = {
        ...coefficients,
        [id]: coef
      };
      setCoefficients(newCoefs);
      saveChanges(hutsData, newCoefs);
    }
  };

  // デモデータの同期
  useEffect(() => {
    if (DEMO_MODE && demoData) {
      setContractTotalBalance(demoData.contractTotalBalance);
      setTotalAllocated(demoData.totalAllocated);
      setUnallocatedBalance(demoData.unallocatedBalance);
      setHutAllocations(demoData.hutAllocations);
      setFeeAllocation(demoData.feeAllocation);
    }
  }, [demoData, DEMO_MODE]);

  const connectWallet = async () => {
    console.log("Connect wallet button clicked");
    if (DEMO_MODE) {
      setIsLoading(true);
      // 擬似的なログイン処理
      setTimeout(() => {
        setAccount("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"); // Hardhat Account #0
        setIsOwner(true);
        setIsLoading(false);
        // 初期状態は0で開始
        demoReset();
        setStatus("デモモードで起動しました (Mock Mode)");
      }, 500);
      return;
    }

    if (typeof window !== "undefined" && typeof window.ethereum !== "undefined") {
      try {
        console.log("Starting wallet connection...");
        setIsLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum);
        console.log("Provider initialized");
        
        const accounts = await provider.send("eth_requestAccounts", []);
        console.log("Accounts received:", accounts);
        
        if (accounts.length > 0) {
            setAccount(accounts[0]);
            await checkData(accounts[0], provider);
        } else {
            setStatus("アカウントが見つかりませんでした");
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Connection failed", error);
        alert(`ウォレット接続エラー: ${message || "Unknown error"}`);
        setStatus("ウォレット接続に失敗しました");
      } finally {
        setIsLoading(false);
      }
    } else {
      console.log("No ethereum object found");
      alert("MetaMaskなどのウォレットをインストールしてください");
    }
  };

  const checkData = async (address: string, provider: ethers.BrowserProvider) => {
    if (DEMO_MODE) return; // デモモードなら何もしない（State管理）

    try {
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
        setIsOwner(false);
        setStatus(`ネットワークが一致しません。ウォレットを ChainId=${EXPECTED_CHAIN_ID} に切り替えてください（現在: ${network.chainId.toString()}）`);
        return;
      }

      const signer = await provider.getSigner();
      const distributionContract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);

      try {
        const operatorRole = await distributionContract.OPERATOR_ROLE();
        const isOperator = await distributionContract.hasRole(operatorRole, address);
        setIsOwner(Boolean(isOperator));
      } catch (e) {
        console.warn("Admin role check failed", e);
      }

      // 残高・状態確認 (API経由で取得することで、Walletのネットワーク状態に依存せず正確な値を表示)
      await fetchContractStatus();
      await fetchAllocations(provider);

    } catch (error) {
      console.error("Data check failed", error);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (DEMO_MODE) return;
      if (!account) return;
      const ethereum = window.ethereum;
      if (!ethereum) return;
      const provider = new ethers.BrowserProvider(ethereum);
      await fetchAllocations(provider);
    };

    run();
  }, [account, DEMO_MODE, fetchAllocations]);

  // デモ用：JPYC社からの入金をシミュレート
  const handleDemoDeposit = async () => {
    // account check is not strictly needed for backend simulation, but good for UI state
    if (!account) return;
    
    try {
      setIsLoading(true);
      
      if (DEMO_MODE) {
        setStatus("JPYC社からの入金をシミュレート中...");
        // デモモード: 単にStateを増やすだけ
        await new Promise(resolve => setTimeout(resolve, 800)); // 少し待つ演出
        const amount = Number(demoDepositAmount);
        demoDeposit(amount);
        
        setStatus(`¥${amount.toLocaleString()} の入金を確認しました (Demo Mode)`);
        setActiveStep(2);
        return;
      }

      const ethereum = window.ethereum;
      if (!ethereum) throw new Error("Wallet provider not found");
      const provider = new ethers.BrowserProvider(ethereum);
      const network = await provider.getNetwork();

      let usedWalletPath = false;
      if (network.chainId === BigInt(EXPECTED_CHAIN_ID)) {
        setStatus("【開発用】Faucet実行中: ウォレットから直接入金します...");
        usedWalletPath = true;
      } else {
        setStatus(`ウォレットのネットワークが一致しないため、APIで入金します（現在: ${network.chainId.toString()} / 期待: ${EXPECTED_CHAIN_ID}）`);
      }

      const signer = await provider.getSigner();

      const jpycContract = new ethers.Contract(JPYC_ADDRESS, JPYC_ABI, signer);
      const amountWei = ethers.parseUnits(demoDepositAmount, 18);

      if (usedWalletPath) {
        try {
          const mintTx = await jpycContract.mint(account, amountWei, { gasLimit: 300000 });
          await mintTx.wait();
        } catch (e) {
          console.warn("Mint failed, fallback continues", e);
        }

        try {
          setStatus("Approveを実行中...");
          const approveTx = await jpycContract.approve(CONTRACT_ADDRESS, amountWei, { gasLimit: 150000 });
          await approveTx.wait();

          setStatus("Depositを実行中...");
          const distributionContract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);
          const depositTx = await distributionContract.deposit(amountWei, { gasLimit: 300000 });
          await depositTx.wait();
        } catch (e: unknown) {
          const code = typeof e === 'object' && e !== null && 'code' in e
            ? (e as Record<string, unknown>).code
            : undefined;
          if (code === 4001) throw e;

          usedWalletPath = false;
          setStatus("ウォレット経由が失敗したため、API Faucetで入金します...");
        }
      }

      if (!usedWalletPath) {
        const res = await fetch('/api/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: demoDepositAmount })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "API deposit failed");
        }
      }

      const refreshed = await fetchContractStatus();
      const confirmedUnallocated = Number(refreshed?.unallocatedBalance ?? unallocatedBalance);
      if (confirmedUnallocated > 0) {
        setStatus(`入金を反映しました（未分配残高: ¥${confirmedUnallocated.toLocaleString()}）${usedWalletPath ? "" : " ※入金はAPI経由です"}`);
        setActiveStep(2);
      } else {
        setStatus("入金後の残高反映を確認できませんでした。ネットワーク/アドレスを確認してください");
        setActiveStep(1);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Deposit failed", error);
      setStatus(`入金処理に失敗しました: ${message || "Unknown Error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 配分案の計算
  const calculateDistribution = () => {
    const balance = Number(unallocatedBalance);
    if (balance <= 0) {
      alert("分配可能な残高がありません");
      return;
    }

    // 1. 手数料(18:1)の計算
    // Total = Hut + Fee
    // Fee = Hut * Num / Den
    // Total = Hut + Hut * Num / Den = Hut * (Den + Num) / Den
    // Hut = Total * Den / (Den + Num)
    const totalParts = feeDenominator + feeNumerator;
    // 配分原資 = balance * Den / (Den + Num)
    const hutsAllocationPool = Math.floor(balance * feeDenominator / totalParts);
    // 手数料は残額（計算上は Hut * Num / Den となるが、端数処理のため残額とする）
    const feeAmount = balance - hutsAllocationPool;

    console.log("Total:", balance, "Huts Pool:", hutsAllocationPool, "Fee:", feeAmount);

    const plan = hutsData.map((hut) => {
      const coef = coefficients[hut.id] ?? 1.0;
      const adjustedCount = Math.floor(hut.count * coef);
      const ratio = totalCount > 0 ? adjustedCount / totalCount : 0;
      
      // 最後の要素で端数調整を行う（もしあれば）
      // しかし、今回のロジックでは「比率で山分け」なので、
      // 基本的には hutsAllocationPool * ratio で計算し、最後に余りを調整する
      const amount = Math.floor(hutsAllocationPool * ratio); 
      
      return { ...hut, adjustedCount, ratio, amount };
    });

    // 端数調整：切り捨てによって発生した余りを、最もカウントが多い（または最後の）山小屋に加算する
    // 今回はシンプルに、ID順で最後の山小屋に加算する（本来は比率が高いところに加算するのが公平）
    const tempTotal = plan.reduce((sum, item) => sum + item.amount, 0);
    const remainder = hutsAllocationPool - tempTotal;
    
    if (remainder > 0 && plan.length > 0) {
        // 最後の山小屋に余りを加算
        plan[plan.length - 1].amount += remainder;
    }

    setDistributionPlan(plan);
    setActiveStep(3); // 確認ステップへ
  };

  // 配分実行（オンチェーン書き込み）
  const executeAllocation = async () => {
    if (!account || distributionPlan.length === 0) return;

    if (!isOwner) {
      alert("配分実行にはOPERATOR_ROLEが必要です");
      return;
    }
    
    // バリデーション
    const totalHutAmount = distributionPlan.reduce((sum, item) => sum + item.amount, 0);
    // 手数料の再計算 (Contract Logic: fee = hutAmount * Num / Den)
    const estimatedFee = Math.floor(totalHutAmount * feeNumerator / feeDenominator);
    const totalRequired = totalHutAmount + estimatedFee;

    if (totalRequired > Number(unallocatedBalance)) {
      alert(`配分総額(手数料込)が未分配残高を超えています。必要額: ${totalRequired}, 残高: ${unallocatedBalance}`);
      return;
    }

    try {
      setIsLoading(true);
      setStatus("ブロックチェーンに配分を記録中...");
      
      if (DEMO_MODE) {
        // デモモード: 擬似的に成功させる
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 配分実行
        const totalAmount = distributionPlan.reduce((sum, item) => sum + item.amount, 0);
        // 手数料の再計算
        const estimatedFee = Math.floor(totalAmount * feeNumerator / feeDenominator);
        const totalRequired = totalAmount + estimatedFee;

        demoAllocate(totalRequired, distributionPlan.map(p => ({id: p.id, amount: p.amount})), estimatedFee);

        setStatus("配分が完了し、各山小屋が引き出し可能になりました！(手数料も自動徴収されました) [Demo Mode]");
        alert("配分処理が完了しました！(Demo Mode)");
        
        setDistributionPlan([]);
        setActiveStep(1); 
        return;
      }

      const ethereum = window.ethereum;
      if (!ethereum) throw new Error("Wallet provider not found");
      const provider = new ethers.BrowserProvider(ethereum);

      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
        throw new Error(`ネットワークが一致しません（現在: ${network.chainId.toString()} / 期待: ${EXPECTED_CHAIN_ID}）`);
      }

      const signer = await provider.getSigner();
      const distributionContract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);

      // 配分対象データの作成
      // 金額が0より大きい山小屋のみを対象とする
      const targets = distributionPlan
        .filter(item => item.amount > 0)
        .map(item => ({
          hut: item.address,
          amount: ethers.parseUnits(item.amount.toString(), 18)
        }));

      if (targets.length === 0) {
        alert("配分対象がありません（金額が0以上の山小屋がありません）");
        setStatus("");
        setIsLoading(false);
        return;
      }

      const huts = targets.map(t => t.hut);
      const amounts = targets.map(t => t.amount);

      console.log("Batch Allocate:", huts, amounts);

      // batchAllocate実行
      // コントラクト内で手数料(5%)が自動的に追加徴収される
      const tx = await distributionContract.batchAllocate(huts, amounts);
      console.log("Tx Hash:", tx.hash);
      
      await tx.wait();
      
      setStatus("配分が完了し、各山小屋が引き出し可能になりました！(手数料も自動徴収されました)");
      alert("配分処理が完了しました！");
      
      setDistributionPlan([]);
      setActiveStep(1); // 最初に戻る
      await checkData(account, provider);
    } catch (error) {
      const message = (() => {
        if (error instanceof Error) return error.message;
        if (typeof error === 'object' && error !== null) {
          const maybeShort = 'shortMessage' in error ? (error as Record<string, unknown>).shortMessage : undefined;
          if (typeof maybeShort === 'string') return maybeShort;
        }
        return String(error);
      })();
      console.error("Allocate failed", error);
      setStatus(`配分トランザクションが失敗しました: ${message}`);
      alert(`配分処理に失敗しました: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 描画用の派生値計算 (Step 3用)
  const totalHutAmountPlan = distributionPlan.reduce((sum, item) => sum + item.amount, 0);
  const calculatedFee = Math.floor(totalHutAmountPlan * feeNumerator / feeDenominator);
  const calculatedTotal = totalHutAmountPlan + calculatedFee;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <h1 className="text-xl font-bold">Summit Gate Admin</h1>
          </div>
          <div>
            {!account ? (
              <button
                onClick={connectWallet}
                disabled={isLoading}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                ウォレット接続
              </button>
            ) : (
              <div className="flex items-center gap-4">
                {DEMO_MODE && (
                    <button
                        onClick={() => {
                            if(confirm("デモデータを完全にリセットしますか？\n（全ての入金・配分履歴が消去されます）")) {
                                demoReset();
                                setStatus("デモデータをリセットしました");
                                setActiveStep(1);
                                setDistributionPlan([]);
                            }
                        }}
                        className="text-xs text-red-400 hover:text-red-300 underline font-medium"
                    >
                        Reset Demo
                    </button>
                )}
                <div className="text-sm text-slate-300">
                  {account.slice(0, 6)}...{account.slice(-4)}
                  {isOwner && <span className="ml-2 bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs">OPERATOR</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {status && (
          <div className="bg-blue-50 text-blue-700 p-4 rounded-lg border border-blue-200 animate-fade-in">
            {status}
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex justify-between items-center px-10 py-4">
            <div className={`flex flex-col items-center ${activeStep >= 1 ? 'text-emerald-600' : 'text-slate-300'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2 ${activeStep >= 1 ? 'bg-emerald-100' : 'bg-slate-100'}`}>1</div>
                <span className="text-xs font-bold">入金確認</span>
            </div>
            <div className={`flex-1 h-1 mx-4 ${activeStep >= 2 ? 'bg-emerald-200' : 'bg-slate-200'}`} />
            <div className={`flex flex-col items-center ${activeStep >= 2 ? 'text-emerald-600' : 'text-slate-300'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2 ${activeStep >= 2 ? 'bg-emerald-100' : 'bg-slate-100'}`}>2</div>
                <span className="text-xs font-bold">配分案作成</span>
            </div>
            <div className={`flex-1 h-1 mx-4 ${activeStep >= 3 ? 'bg-emerald-200' : 'bg-slate-200'}`} />
            <div className={`flex flex-col items-center ${activeStep >= 3 ? 'text-emerald-600' : 'text-slate-300'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2 ${activeStep >= 3 ? 'bg-emerald-100' : 'bg-slate-100'}`}>3</div>
                <span className="text-xs font-bold">承認・実行</span>
            </div>
        </div>

        {!account ? (
          <div className="text-center py-20 text-slate-500">
            管理操作を行うにはウォレットを接続してください
          </div>
        ) : (
          <>
            {/* STEP 1: 入金確認 */}
            <section className={`bg-white p-6 rounded-xl shadow-sm border ${activeStep === 1 ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                <TrendingUp className="w-5 h-5 text-slate-500" />
                Step 1: 資金プールの状態 (Fund Status)
              </h2>
              
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">コントラクト総残高</p>
                    <p className="text-2xl font-mono font-bold">{Number(contractTotalBalance).toLocaleString()}</p>
                    <span className="text-xs text-slate-400">JPYC</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">配分済み（未引出）</p>
                    <p className="text-2xl font-mono font-bold text-slate-400">{Number(totalAllocated).toLocaleString()}</p>
                    <span className="text-xs text-slate-400">JPYC</span>
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                    <p className="text-xs text-emerald-600 mb-1 font-bold">今回分配可能額</p>
                    <p className="text-2xl font-mono font-bold text-emerald-700">{Number(unallocatedBalance).toLocaleString()}</p>
                    <span className="text-xs text-emerald-600">JPYC</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-700 mb-4">
                  <p className="font-bold mb-2">💳 デモ用資金追加 (Simulate Deposit)</p>
                  <p className="mb-2">JPYC社からの入金をシミュレートして資金プールに追加します。</p>
                  <p className="text-xs text-slate-500 mb-2">
                    ※ 現在のカウント総数に基づいた推奨残高: {totalCount}人 × 1,900 JPYC = {(totalCount * 1900).toLocaleString()} JPYC
                    {Number(unallocatedBalance) > 0 && ` (不足額: ${(Math.max(0, (totalCount * 1900) - Number(unallocatedBalance))).toLocaleString()} JPYC)`}
                  </p>
                  <div className="flex gap-2 max-w-sm items-center">
                      <input 
                          type="number" 
                          value={demoDepositAmount}
                          onChange={(e) => setDemoDepositAmount(e.target.value)}
                          className="border rounded px-3 py-2 text-sm w-32 font-mono"
                          placeholder="Amount"
                      />
                      <span className="text-xs font-bold text-slate-500">JPYC</span>
                      <button 
                          onClick={handleDemoDeposit}
                          disabled={isLoading}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded text-xs font-bold transition disabled:opacity-50"
                      >
                          {isLoading ? "処理中..." : "追加資金を入金"}
                      </button>
                  </div>
              </div>

              {Number(unallocatedBalance) > 0 && activeStep === 1 && (
                  <button
                    onClick={() => setActiveStep(2)}
                    className="w-full bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-800 transition flex justify-center items-center gap-2"
                  >
                      次へ: 配分案を作成する <ArrowRight className="w-4 h-4" />
                  </button>
              )}
            </section>

            {/* STEP 2: 配分案作成 */}
            {activeStep >= 2 && (
                <section className={`bg-white p-6 rounded-xl shadow-sm border ${activeStep === 2 ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                    <Calculator className="w-5 h-5 text-slate-500" />
                    Step 2: 配分計算 (Calculation)
                </h2>
                
                <div className="mb-6">
                    <p className="text-sm text-slate-600 mb-4">
                        アンテナから収集された利用実績データ（今回はモックデータ）に基づき、
                        未分配残高 <strong>{Number(unallocatedBalance).toLocaleString()} JPYC</strong> を按分します。<br/>
                        <span className="text-emerald-600 font-bold">※ データに誤りがある場合は、利用回数を直接修正してください。</span>
                    </p>

                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="p-3">山小屋名</th>
                                <th className="p-3 text-right">検知数 (編集可)</th>
                                <th className="p-3 text-right">補正係数</th>
                                <th className="p-3 text-right">補正後カウント</th>
                                <th className="p-3 text-right">比率</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {hutsData.map(hut => {
                                const coef = coefficients[hut.id] ?? 1.0;
                                const adjusted = Math.floor(hut.count * coef);
                                return (
                                <tr key={hut.id}>
                                    <td className="p-3 font-medium">
                                        {hut.name}
                                        {coef < 1.0 && <span className="ml-2 text-xs text-orange-500 bg-orange-50 px-1 rounded">動線重複補正</span>}
                                    </td>
                                    <td className="p-3 text-right">
                                        <input
                                            type="number"
                                            min="0"
                                            value={hut.count}
                                            onChange={(e) => handleCountChange(hut.id, e.target.value)}
                                            className="w-20 text-right border rounded px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        />
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <span className="text-slate-400 text-xs">x</span>
                                            <input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                max="2.0"
                                                value={coef}
                                                onChange={(e) => handleCoefficientChange(hut.id, e.target.value)}
                                                className={`w-16 text-right border rounded px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500 ${coef !== 1.0 ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold' : 'text-slate-500'}`}
                                            />
                                        </div>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-slate-700">
                                        {adjusted.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-right text-slate-500">
                                        {totalCount > 0 ? ((adjusted / totalCount) * 100).toFixed(1) : 0}%
                                    </td>
                                </tr>
                            )})}
                            <tr className="bg-slate-50 font-bold">
                                <td className="p-3">合計（補正後）</td>
                                <td className="p-3 text-right">-</td>
                                <td className="p-3 text-right">-</td>
                                <td className="p-3 text-right">{totalCount.toLocaleString()}</td>
                                <td className="p-3 text-right">100.0%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {activeStep === 2 && (
                     <button
                        onClick={calculateDistribution}
                        className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition flex justify-center items-center gap-2"
                    >
                        計算を実行し、承認画面へ進む <ArrowRight className="w-4 h-4" />
                    </button>
                )}
                </section>
            )}

            {/* STEP 3: 承認・実行 */}
            {activeStep === 3 && distributionPlan.length > 0 && (
                <section className="bg-white p-6 rounded-xl shadow-sm border border-emerald-500 ring-2 ring-emerald-100">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Step 3: 最終承認 (Approval)
                </h2>
                
                <div className="mb-6 bg-emerald-50/50 rounded-lg border border-emerald-100 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-emerald-100 text-emerald-800">
                            <tr>
                                <th className="p-3">山小屋名</th>
                                <th className="p-3 text-right">配分額 (JPYC)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-100">
                            {distributionPlan.map((plan, idx) => (
                                <tr key={idx}>
                                    <td className="p-3 font-medium text-emerald-900">{plan.name}</td>
                                    <td className="p-3 text-right font-mono font-bold text-emerald-700">
                                        {plan.amount.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-slate-50">
                                <td className="p-3 font-bold text-slate-600">山小屋配分計</td>
                                <td className="p-3 text-right font-mono font-bold text-slate-700">
                                    {distributionPlan.reduce((acc, cur) => acc + cur.amount, 0).toLocaleString()}
                                </td>
                            </tr>
                            <tr className="bg-orange-50">
                                <td className="p-3 font-bold text-orange-800">運営手数料 (Ratio: {feeNumerator}/{feeDenominator})</td>
                                <td className="p-3 text-right font-mono font-bold text-orange-700">
                                    {calculatedFee.toLocaleString()}
                                </td>
                            </tr>
                            <tr className="bg-slate-900 text-white">
                                <td className="p-3 font-bold">配分総額 (今回使用される残高)</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-400 text-lg">
                                    {calculatedTotal.toLocaleString()}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveStep(2)}
                        className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-lg hover:bg-slate-300 transition"
                    >
                        戻る
                    </button>
                    <button
                        onClick={executeAllocation}
                        disabled={isLoading || !isOwner}
                        className="flex-[2] bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition font-bold shadow-lg shadow-indigo-200 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        承認して配分を実行する
                    </button>
                </div>
                {!isOwner && (
                    <p className="text-center text-xs text-red-500 mt-2">
                        ※ 配分実行には運営権限(OPERATOR_ROLE)が必要です
                    </p>
                )}
                </section>
            )}

            {/* Current Allocations Table */}
            <section className="bg-slate-50 p-6 rounded-xl shadow-inner border border-slate-200 mt-8">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                    <Wallet className="w-5 h-5 text-slate-500" />
                    各山小屋の引き出し可能残高 (Current Withdrawable Balance)
                </h2>
                <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
                    <table className="w-full text-sm text-left table-fixed">
                        <thead className="bg-slate-100 text-slate-600">
                            <tr>
                                <th className="p-3 w-32 sm:w-44">山小屋名</th>
                                <th className="p-3">ウォレットアドレス</th>
                                <th className="p-3 w-40 sm:w-48 text-right whitespace-nowrap">引き出し可能額 (JPYC)</th>
                                {DEMO_MODE && <th className="p-3 text-right">Demo Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {hutsData.map(hut => {
                                const amountWei = hutAllocations[hut.id] || "0";
                                // Demo mode uses simple numbers, Real mode uses Wei (10^18)
                                // But fetchContractStatus logic implies simple numbers for now in demo?
                                // Let's check: in demo execution, we add `plan.amount` which is simple number.
                                // In real mode `distributionContract.allocations` returns Wei.
                                // We need to normalize.
                                
                                let displayAmount = "0";
                                let rawAmount = 0;

                                if (DEMO_MODE) {
                                    rawAmount = Number(amountWei);
                                    displayAmount = rawAmount.toLocaleString();
                                } else {
                                    // Assuming Wei
                                    try {
                                        rawAmount = Number(ethers.formatUnits(amountWei, 18));
                                        displayAmount = rawAmount.toLocaleString();
                                    } catch {
                                        displayAmount = amountWei; // Fallback
                                    }
                                }

                                const handleSimulateWithdraw = async () => {
                                    if (!confirm(`${hut.name} の引き出しをシミュレートしますか？\n(残高が0になり、山小屋のウォレットに着金したことになります)`)) return;
                                    
                                    demoWithdrawHut(hut.id, hut.name);
                                    alert(`${hut.name} が ${displayAmount} JPYC を引き出しました`);
                                };

                                return (
                                <tr key={hut.id}>
                                    <td className="p-3 font-medium text-slate-800 break-words">{hut.name}</td>
                                    <td className="p-3 text-xs font-mono text-slate-400 break-all">
                                        {hut.address}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                                        {displayAmount}
                                    </td>
                                    {DEMO_MODE && (
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={handleSimulateWithdraw}
                                                disabled={rawAmount <= 0}
                                                className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded disabled:opacity-30"
                                            >
                                                Simulate Withdraw
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            )})}
                            
                            {/* Operation Fee Row */}
                            <tr className="bg-orange-50/50">
                                <td className="p-3 font-medium text-orange-900 flex items-center gap-2 break-words">
                                    <ShieldCheck className="w-4 h-4 text-orange-600" />
                                    運営手数料 (Summit Gate Ops)
                                </td>
                                <td className="p-3 text-xs font-mono text-orange-400 break-all">
                                    {(feeRecipientAddress ?? account) ? `${(feeRecipientAddress ?? account)?.toString()} (Fee Recipient)` : "-"}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-orange-600 whitespace-nowrap">
                                    {(() => {
                                      if (DEMO_MODE) return Number(feeAllocation).toLocaleString();
                                      try {
                                        return Number(ethers.formatUnits(feeAllocation, 18)).toLocaleString();
                                      } catch {
                                        return feeAllocation;
                                      }
                                    })()}
                                </td>
                                {DEMO_MODE && (
                                    <td className="p-3 text-right">
                                        <button
                                            onClick={() => {
                                                if (!confirm("運営手数料の引き出しをシミュレートしますか？")) return;
                                                demoWithdrawFee();
                                                alert(`運営手数料を引き出しました`);
                                            }}
                                            disabled={Number(feeAllocation) <= 0}
                                            className="text-xs bg-orange-200 hover:bg-orange-300 text-orange-700 px-2 py-1 rounded disabled:opacity-30"
                                        >
                                            Simulate Withdraw
                                        </button>
                                    </td>
                                )}
                            </tr>

                            {hutsData.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-4 text-center text-slate-400">
                                        データがありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

          </>
        )}
      </div>
    </main>
  );
}
