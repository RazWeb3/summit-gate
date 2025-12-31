import { JSONFilePreset } from 'lowdb/node';

// 型定義
export type HutData = {
  id: number;
  name: string;
  address: string;
  count: number;
};

export type CoefficientData = {
  [key: number]: number;
};

export type DbData = {
  huts: HutData[];
  coefficients: CoefficientData;
  lastUpdated: string;
};

// 初期データ
const defaultData: DbData = {
  huts: [
    { id: 1, name: "雲海荘（六合目）", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", count: 850 },
    { id: 2, name: "宝永山荘（六合目）", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", count: 1200 },
    { id: 3, name: "御来光山荘（新七合目）", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", count: 750 },
    { id: 4, name: "山口山荘（元祖七合目）", address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", count: 700 },
    { id: 5, name: "池田館（八合目）", address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", count: 600 },
    { id: 6, name: "萬年雪山荘（九合目）", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", count: 550 },
    { id: 7, name: "胸突山荘（九合五勺）", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", count: 500 },
  ],
  coefficients: {
    2: 0.7,
    7: 0.7
  },
  lastUpdated: new Date().toISOString()
};

// DB初期化関数（非同期）
export const getDb = async () => {
  const db = await JSONFilePreset<DbData>('db.json', defaultData);
  return db;
};
