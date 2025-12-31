"use client";
// -------------------------------------------------------
// 目的: 山小屋ユーザーが自分の分配残高を確認し、引き出すためのトップページ
// 作成日: 2025/12/26
//
// 更新履歴:
// 2025/12/28 10:00 window.ethereumの型安全化とstrict対応
// 理由: TypeScript型検証でundefinedが許容されずビルド前チェックが通らないため
// -------------------------------------------------------

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, DISTRIBUTION_ABI, JPYC_ADDRESS, JPYC_ABI } from "@/utils/contract";
import { Wallet, Coins, ArrowRight, Loader2, Mountain } from "lucide-react";

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<string>("0");
  const [balance, setBalance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const connectWallet = async () => {
    const ethereum = window.ethereum;
    if (typeof ethereum !== "undefined") {
      try {
        setIsLoading(true);
        const provider = new ethers.BrowserProvider(ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
        await fetchData(accounts[0], provider);
      } catch (error) {
        console.error("Connection failed", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      alert("MetaMaskなどのウォレットをインストールしてください");
    }
  };

  const fetchData = async (address: string, provider: ethers.BrowserProvider) => {
    try {
      const signer = await provider.getSigner();
      const distributionContract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);
      const jpycContract = new ethers.Contract(JPYC_ADDRESS, JPYC_ABI, signer);

      const alloc = await distributionContract.allocations(address);
      const bal = await jpycContract.balanceOf(address);
      
      // コントラクト自体のJPYC残高（これが本当の分配原資）
      // const poolBalance = await jpycContract.balanceOf(CONTRACT_ADDRESS);

      setAllocation(ethers.formatUnits(alloc, 18));
      setBalance(ethers.formatUnits(bal, 18));
    } catch (error) {
      console.error("Fetch data failed", error);
    }
  };

  const handleClaim = async () => {
    if (!account) return;
    const ethereum = window.ethereum;
    if (!ethereum) {
      alert("MetaMaskなどのウォレットをインストールしてください");
      return;
    }

    try {
      setIsClaiming(true);
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, signer);

      // 償還額が0の場合はアラート
      if (parseFloat(allocation) <= 0) {
        alert("引き出し可能な残高がありません。");
        return;
      }

      const tx = await contract.withdraw(); // claim() -> withdraw() に変更（コントラクトに合わせる）
      setTxHash(tx.hash);
      
      await tx.wait();
      
      // データ更新
      await fetchData(account, provider);
      alert("引き出しが完了しました！");
    } catch (error) {
      console.error("Withdraw failed", error);
      alert("引き出しに失敗しました。");
    } finally {
      setIsClaiming(false);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      // 既に接続済みか確認するロジックなどをここに入れることも可能
    }
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 p-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Mountain className="w-8 h-8 text-emerald-600" />
            <h1 className="text-xl font-bold text-stone-800">Summit Gate</h1>
          </div>
          <div>
            {!account ? (
              <button
                onClick={connectWallet}
                disabled={isLoading}
                className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-800 transition disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                ウォレット接続
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-100">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm font-mono">{account.slice(0, 6)}...{account.slice(-4)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-stone-800 mb-2">山小屋分配金ダッシュボード</h2>
            <p className="text-stone-500">
              現在の分配可能額を確認し、ウォレットへ引き出すことができます。
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-800 mb-2">
                <Coins className="w-5 h-5" />
                <span className="font-medium">引き出し可能額</span>
              </div>
              <div className="text-3xl font-bold text-emerald-900 mb-1">
                {parseFloat(allocation).toLocaleString()} <span className="text-lg font-normal">JPYC</span>
              </div>
              <p className="text-emerald-600 text-sm">
                現在プールされているあなたの取り分です
              </p>
            </div>

            <div className="bg-stone-50 rounded-xl p-6 border border-stone-100">
              <div className="flex items-center gap-2 text-stone-600 mb-2">
                <Wallet className="w-5 h-5" />
                <span className="font-medium">ウォレット残高</span>
              </div>
              <div className="text-3xl font-bold text-stone-800 mb-1">
                {parseFloat(balance).toLocaleString()} <span className="text-lg font-normal">JPYC</span>
              </div>
              <p className="text-stone-500 text-sm">
                現在保有しているJPYCトークン
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            {!account ? (
              <div className="text-center p-8 bg-stone-50 rounded-lg w-full">
                <p className="text-stone-500 mb-4">
                  操作を行うにはウォレットを接続してください
                </p>
                <button
                  onClick={connectWallet}
                  className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-800 transition font-medium"
                >
                  ウォレットを接続する
                </button>
              </div>
            ) : (
              <button
                onClick={handleClaim}
                disabled={isClaiming || parseFloat(allocation) <= 0}
                className="w-full md:w-auto min-w-[200px] flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-lg shadow-emerald-100"
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    処理中...
                  </>
                ) : (
                  <>
                    分配金を引き出す
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            )}

            {txHash && (
              <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm w-full break-all text-center">
                <p className="font-bold mb-1">トランザクション送信完了</p>
                {txHash}
              </div>
            )}
          </div>

          <div className="mt-12 pt-8 border-t border-stone-100">
             <h3 className="font-bold text-stone-700 mb-4">使い方ガイド</h3>
             <ul className="space-y-2 text-sm text-stone-600">
                <li className="flex gap-2">
                   <span className="bg-stone-200 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                   山小屋の管理用ウォレット（MetaMask等）を接続してください。
                </li>
                <li className="flex gap-2">
                   <span className="bg-stone-200 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                   「引き出し可能額」に表示されている金額が、現在受け取れる分配金です。
                </li>
                <li className="flex gap-2">
                   <span className="bg-stone-200 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                   「分配金を引き出す」ボタンを押すと、あなたのウォレットにJPYCが送金されます。
                </li>
             </ul>
          </div>
        </div>
      </main>
    </main>
  );
}
