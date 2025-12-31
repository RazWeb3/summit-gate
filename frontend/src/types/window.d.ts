// -------------------------------------------------------
// 目的: window.ethereum（EIP-1193 Provider）の型を定義しTypeScriptの型検証を通す
// 作成日: 2025/12/28
// -------------------------------------------------------

import type { Eip1193Provider } from "ethers";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export {};
