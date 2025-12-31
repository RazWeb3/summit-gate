"use client";
// -------------------------------------------------------
// 目的: 山小屋向けの引き出し（償還）状況を確認・実行する画面
// 作成日: 2025/12/26
//
// 更新履歴:
// 2025/12/28 09:45 lint対応（any排除・型付け）
// 理由: eslintのno-explicit-anyによりビルド前検証が通らないため
// 2025/12/28 09:55 TypeScript型エラー修正（undefined対策）
// 理由: strict modeで山小屋名がundefinedになり得るため
// 2025/12/30 23:38 ウォレットログインとオンチェーンwithdrawに対応
// 理由: 実トランザクションでの分配→引き出しデモ動画を撮影するため
// -------------------------------------------------------
import React, { useState, useEffect, useCallback } from 'react';
import { useDemoData } from '@/hooks/useDemoData';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, DISTRIBUTION_ABI } from '@/utils/contract';
import { Wallet, RefreshCw, LogOut, CheckCircle, Loader2 } from 'lucide-react';

type Hut = {
  id: number;
  name: string;
  address?: string;
  count?: number;
};

export default function HutDashboard() {
  const DEMO_MODE = (process.env.NEXT_PUBLIC_DEMO_MODE ?? "false") === "true";
  const EXPECTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID ?? "31337");

  const { data, isLoaded, withdrawHut } = useDemoData();
  const [selectedHutId, setSelectedHutId] = useState<number | null>(null);
  const [huts, setHuts] = useState<Hut[]>([]);

  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);
  const [onchainAllocation, setOnchainAllocation] = useState<string>("0");

  useEffect(() => {
    // 山小屋リスト取得
    fetch('/api/huts')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.huts)) {
          setHuts(data.huts as Hut[]);
        } else {
          console.error("Invalid API response format", data);
          setHuts([]);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!account) return;
    if (selectedHutId) return;

    const matched = huts.find(h => (h.address ?? "").toLowerCase() === account.toLowerCase());
    if (matched) setSelectedHutId(matched.id);
  }, [account, huts, selectedHutId]);

  const connectWallet = useCallback(async () => {
    setWalletStatus(null);
    setTxHash(null);

    const ethereum = window.ethereum;
    if (!ethereum) {
      setWalletStatus("MetaMaskなどのウォレットをインストールしてください");
      return;
    }

    try {
      setIsConnecting(true);
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const nextAccount = typeof accounts?.[0] === 'string' ? accounts[0] : null;
      if (!nextAccount) {
        setWalletStatus("ウォレット接続に失敗しました");
        return;
      }

      setAccount(nextAccount);
      const matched = huts.find(h => (h.address ?? "").toLowerCase() === nextAccount.toLowerCase());
      if (matched) {
        setSelectedHutId(matched.id);
      } else {
        setWalletStatus("このウォレットは山小屋として登録されていません（下の一覧から選択も可能です）");
      }
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null && 'code' in e
        ? (e as Record<string, unknown>).code
        : undefined;
      if (code === 4001) {
        setWalletStatus("接続がキャンセルされました");
      } else {
        const message = e instanceof Error ? e.message : String(e);
        setWalletStatus(message || "ウォレット接続に失敗しました");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [huts]);

  const fetchOnchainAllocation = useCallback(async (addr: string) => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
        setWalletStatus(`ネットワークが一致しません（現在: ${network.chainId.toString()} / 期待: ${EXPECTED_CHAIN_ID}）`);
        return;
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, provider);
      const raw = (await contract.allocations(addr)) as bigint;
      setOnchainAllocation(ethers.formatUnits(raw, 18));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setWalletStatus(message || "残高取得に失敗しました");
    }
  }, [EXPECTED_CHAIN_ID]);

  useEffect(() => {
    if (!account) return;
    if (DEMO_MODE) return;
    void fetchOnchainAllocation(account);
  }, [account, DEMO_MODE, fetchOnchainAllocation]);

  if (!isLoaded) return <div className="p-10 text-center">Loading...</div>;

  const currentHut = huts.find(h => h.id === selectedHutId);
  const allocation = selectedHutId
    ? (DEMO_MODE
        ? Number(data.hutAllocations[selectedHutId] || "0")
        : Number(onchainAllocation || "0"))
    : 0;

  if (!selectedHutId) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-6 text-slate-800 text-center">Summit Gate B2B Login</h1>
          <div className="space-y-3 mb-6">
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
              ウォレットでログイン
            </button>
            <p className="text-xs text-center text-slate-500">
              {DEMO_MODE ? "デモモード: ガスレス引き出し（シミュレーション）" : "オンチェーン: 引き出しは通常トランザクションです"}
            </p>
            {account && (
              <p className="text-xs text-center text-slate-400 font-mono break-all">
                {account}
              </p>
            )}
            {walletStatus && (
              <p className="text-xs text-center text-rose-600">{walletStatus}</p>
            )}
          </div>
          <p className="mb-4 text-slate-600 text-sm text-center">
            {account ? "一致する山小屋がない場合、一覧から選択できます" : "または、ログインする山小屋を一覧から選択できます"}
          </p>
          <div className="space-y-3">
            {huts.map(hut => (
              <button
                key={hut.id}
                onClick={() => setSelectedHutId(hut.id)}
                className="w-full p-4 text-left border rounded-lg hover:bg-slate-50 transition-colors flex justify-between items-center group"
              >
                <span className="font-medium text-slate-700">{hut.name}</span>
                <span className="text-slate-400 group-hover:text-blue-500">Login &rarr;</span>
              </button>
            ))}
            {huts.length === 0 && <p className="text-center text-gray-400">Loading huts...</p>}
          </div>
        </div>
      </div>
    );
  }

  const handleWithdraw = async () => {
    if (!selectedHutId) return;
    if (!confirm(`${allocation.toLocaleString()} JPYC を引き出しますか？`)) return;

    setWalletStatus(null);
    setTxHash(null);

    if (DEMO_MODE) {
      withdrawHut(selectedHutId, currentHut?.name ?? "不明");
      return;
    }

    const ethereum = window.ethereum;
    if (!ethereum) {
      setWalletStatus("Wallet provider not found");
      return;
    }

    if (!account) {
      setWalletStatus("ウォレットを接続してください");
      return;
    }

    try {
      setIsWithdrawing(true);
      const provider = new ethers.BrowserProvider(ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
        setWalletStatus(`ネットワークが一致しません（現在: ${network.chainId.toString()} / 期待: ${EXPECTED_CHAIN_ID}）`);
        return;
      }
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);
      const tx = await contract.withdraw();
      setTxHash(tx.hash);
      await tx.wait();
      await fetchOnchainAllocation(account);
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null && 'code' in e
        ? (e as Record<string, unknown>).code
        : undefined;
      if (code === 4001) {
        setWalletStatus("トランザクションがキャンセルされました");
      } else {
        const message = e instanceof Error ? e.message : String(e);
        setWalletStatus(message || "引き出しに失敗しました");
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-xl text-slate-800">Summit Gate <span className="text-blue-600">Partner</span></h1>
            <span className="bg-slate-100 px-3 py-1 rounded-full text-sm text-slate-600">
              {currentHut?.name}
            </span>
          </div>
          <button 
            onClick={() => {
              setSelectedHutId(null);
              setAccount(null);
              setWalletStatus(null);
              setTxHash(null);
              setOnchainAllocation("0");
            }}
            className="text-sm text-slate-500 hover:text-red-500 flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 py-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Balance Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Available Balance
            </h2>
            <div className="mb-6">
              <div className="text-4xl font-bold text-slate-900">
                {allocation.toLocaleString()} <span className="text-lg text-slate-500 font-normal">JPYC</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                最終更新: {new Date().toLocaleTimeString()}
              </p>
            </div>
            
            <button
              onClick={handleWithdraw}
              disabled={allocation <= 0 || isWithdrawing}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {isWithdrawing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
              {allocation > 0 ? (DEMO_MODE ? "ガスレスで引き出す (Demo)" : "資金を引き出す (Withdraw)") : "残高なし"}
            </button>

            {txHash && (
              <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-xs w-full break-all text-center">
                {txHash}
              </div>
            )}

            {walletStatus && (
              <p className="text-xs text-center text-rose-600 mt-3">{walletStatus}</p>
            )}
            
            <p className="text-xs text-center text-slate-400 mt-4">
              ※ {DEMO_MODE ? "デモではState更新のみで着金を表現します。" : "本番環境では指定銀行口座への振込依頼、または法人ウォレットへの送金が行われます。"}
            </p>
          </div>

          {/* History / Status Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
               Recent Activity
             </h2>
             <div className="space-y-4">
               {data.logs.filter(l => (currentHut?.name ? l.includes(currentHut.name) : false) || l.includes('分配承認')).slice(-5).reverse().map((log, i) => (
                 <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                   <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                   <span className="text-slate-600">{log}</span>
                 </div>
               ))}
               {data.logs.length === 0 && (
                 <p className="text-slate-400 text-sm text-center py-8">履歴はありません</p>
               )}
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
