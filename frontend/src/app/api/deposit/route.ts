import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, JPYC_ADDRESS, JPYC_ABI } from '@/utils/contract';

// Hardhat Default Account #0 (System Admin / JPYC Simulator)
// This is a well-known test private key for local Hardhat node. DO NOT USE IN PRODUCTION.
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount } = body;

    if (!amount) {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const jpycContract = new ethers.Contract(JPYC_ADDRESS, JPYC_ABI, wallet);

    console.log(`[API] Simulating Deposit of ${amount} JPYC...`);
    const amountWei = ethers.parseUnits(amount.toString(), 18);

    // Get nonce considering pending transactions to avoid collisions
    let nonce = await provider.getTransactionCount(wallet.address, "pending");

    // 1. Mint to System Wallet
    try {
        console.log(`[API] Minting with nonce ${nonce}...`);
        const mintTx = await jpycContract.mint(wallet.address, amountWei, { nonce: nonce });
        await mintTx.wait();
        console.log("[API] Mint successful:", mintTx.hash);
        nonce++; // Manually increment nonce for next transaction
    } catch (e: unknown) {
        console.error("[API] Mint failed:", e);
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Mint failed: ${message}`);
    }

    // 2. Transfer to Distribution Contract
    try {
        console.log(`[API] Transferring with nonce ${nonce}...`);
        const tx = await jpycContract.transfer(CONTRACT_ADDRESS, amountWei, { nonce: nonce });
        await tx.wait();
        console.log("[API] Transfer successful:", tx.hash);
        return NextResponse.json({ success: true, txHash: tx.hash });
    } catch (e: unknown) {
        console.error("[API] Transfer failed:", e);
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Transfer failed: ${message}`);
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Deposit simulation error:", error);
    return NextResponse.json({ 
        error: message || "Internal Server Error"
    }, { status: 500 });
  }
}
