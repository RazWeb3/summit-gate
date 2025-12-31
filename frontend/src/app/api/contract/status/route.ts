// -------------------------------------------------------
// 目的: フロントエンド用に分配コントラクト状態（残高・手数料等）を返すAPI
// 作成日: 2025/12/26
//
// 更新履歴:
// 2025/12/28 09:55 BigIntリテラルを回避しTypeScript型検証を通す
// 理由: tsconfigのtargetがES2017でBigIntリテラルがコンパイル不可なため
// -------------------------------------------------------
import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, DISTRIBUTION_ABI, JPYC_ADDRESS, JPYC_ABI } from '@/utils/contract';

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const distributionContract = new ethers.Contract(CONTRACT_ADDRESS, DISTRIBUTION_ABI, provider);
    const jpycContract = new ethers.Contract(JPYC_ADDRESS, JPYC_ABI, provider);

    // Fetch data in parallel, but handle potential failures for new fields (fee params)
    const cBal = await jpycContract.balanceOf(CONTRACT_ADDRESS);
    
    let tAlloc = BigInt(0);
    try {
      tAlloc = await distributionContract.totalAllocated();
    } catch {
      console.warn("totalAllocated not found, defaulting to 0");
    }

    let feeNum = BigInt(1);
    let feeDen = BigInt(18);
    try {
      feeNum = await distributionContract.feeNumerator();
      feeDen = await distributionContract.feeDenominator();
    } catch {
      console.warn("Fee params not found on contract, using defaults (1/18)");
    }

    return NextResponse.json({
      contractBalance: ethers.formatUnits(cBal, 18),
      totalAllocated: ethers.formatUnits(tAlloc, 18),
      feeNumerator: Number(feeNum),
      feeDenominator: Number(feeDen)
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Failed to fetch contract status:", error);
    return NextResponse.json({ error: message || "Failed to fetch status" }, { status: 500 });
  }
}
