// -------------------------------------------------------
// 目的: デモモード用のデータをブラウザのlocalStorageで永続化・共有するためのフック
// 作成日: 2025/12/27
//
// 更新履歴:
// 2025/12/28 09:45 初期ロードをuseState初期化関数へ移動
// 理由: eslintのreact-hooks/set-state-in-effectにより検証が通らないため
// -------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'summit-gate-demo-data';

export type DemoData = {
  contractTotalBalance: string;
  totalAllocated: string;
  unallocatedBalance: string;
  hutAllocations: { [key: number]: string };
  feeAllocation: string;
  logs: string[];
};

const INITIAL_DATA: DemoData = {
  contractTotalBalance: "0",
  totalAllocated: "0",
  unallocatedBalance: "0",
  hutAllocations: {},
  feeAllocation: "0",
  logs: [],
};

export function useDemoData() {
  const [data, setData] = useState<DemoData>(() => {
    if (typeof window === 'undefined') return INITIAL_DATA;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return INITIAL_DATA;
    try {
      return JSON.parse(saved) as DemoData;
    } catch {
      return INITIAL_DATA;
    }
  });
  const isLoaded = typeof window !== 'undefined';

  // 変更を保存してイベント発火
  const saveToStorage = useCallback((newData: DemoData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    // 他のコンポーネント/タブに変更を通知
    window.dispatchEvent(new Event('storage'));
  }, []);

  // 他のタブ/ウィンドウからの変更を検知
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent | Event) => {
      // StorageEventならkeyチェック
      if ('key' in e && e.key !== STORAGE_KEY && e.key !== null) return;
      
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setData(prev => {
            // 文字列化して比較（簡易的なDeep Equal）
            if (JSON.stringify(prev) !== saved) {
              return parsed;
            }
            return prev;
          });
        } catch (e) {
            console.error(e);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    // 同じウィンドウ内の別コンポーネントからの変更検知用にはカスタムイベント等が要るが、
    // storageイベントは同オリジンの別タブ用。
    // 同一タブ内での同期のために、saveToStorage内でdispatchEventしたものをここで拾うには
    // window.addEventListener('storage') だけでは不十分な場合があるが、
    // モダンブラウザの挙動や、今回admin/hutを別タブで開く想定ならこれでOK。
    // 念のためカスタムイベントもリッスンするなら:
    // window.addEventListener('local-storage-update', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const updateData = useCallback((updater: (prev: DemoData) => DemoData) => {
    setData(prev => {
      const next = updater(prev);
      saveToStorage(next);
      return next;
    });
  }, [saveToStorage]);

  // Actions
  const deposit = useCallback((amount: number) => {
    updateData(prev => ({
      ...prev,
      contractTotalBalance: (Number(prev.contractTotalBalance) + amount).toString(),
      unallocatedBalance: (Number(prev.unallocatedBalance) + amount).toString(),
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] 入金: ${amount.toLocaleString()} JPYC`]
    }));
  }, [updateData]);

  const allocate = useCallback((totalRequired: number, distribution: {id: number, amount: number}[], fee: number) => {
    updateData(prev => {
      const nextHutAllocations = { ...prev.hutAllocations };
      distribution.forEach(d => {
        const current = Number(nextHutAllocations[d.id] || "0");
        nextHutAllocations[d.id] = (current + d.amount).toString();
      });

      return {
        ...prev,
        totalAllocated: (Number(prev.totalAllocated) + totalRequired).toString(),
        unallocatedBalance: (Number(prev.unallocatedBalance) - totalRequired).toString(),
        hutAllocations: nextHutAllocations,
        feeAllocation: (Number(prev.feeAllocation) + fee).toString(),
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] 分配承認: ${totalRequired.toLocaleString()} JPYC (内手数料: ${fee})`]
      };
    });
  }, [updateData]);

  const withdrawHut = useCallback((hutId: number, hutName: string) => {
    updateData(prev => {
      const amount = Number(prev.hutAllocations[hutId] || "0");
      if (amount <= 0) return prev;

      const nextHutAllocations = { ...prev.hutAllocations };
      nextHutAllocations[hutId] = "0";

      return {
        ...prev,
        contractTotalBalance: (Number(prev.contractTotalBalance) - amount).toString(),
        totalAllocated: (Number(prev.totalAllocated) - amount).toString(),
        hutAllocations: nextHutAllocations,
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] 引き出し(${hutName}): ${amount.toLocaleString()} JPYC`]
      };
    });
  }, [updateData]);

  const withdrawFee = useCallback(() => {
    updateData(prev => {
      const amount = Number(prev.feeAllocation);
      if (amount <= 0) return prev;

      return {
        ...prev,
        contractTotalBalance: (Number(prev.contractTotalBalance) - amount).toString(),
        totalAllocated: (Number(prev.totalAllocated) - amount).toString(),
        feeAllocation: "0",
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] 引き出し(運営): ${amount.toLocaleString()} JPYC`]
      };
    });
  }, [updateData]);

  const reset = useCallback(() => {
    updateData(() => ({
        ...INITIAL_DATA,
        logs: [`[${new Date().toLocaleTimeString()}] データリセット`]
    }));
  }, [updateData]);

  return {
    data,
    isLoaded,
    deposit,
    allocate,
    withdrawHut,
    withdrawFee,
    reset
  };
}
