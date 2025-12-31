# Summit Gate 🗻

**Summit Gate** is an automated environmental conservation fee collection and distribution system for Mt. Fuji, powered by **Avalanche** and **JPYC**.

Summit Gate（サミットゲート）は、**Avalanche** ブロックチェーンと **JPYC**（日本円ステーブルコイン）を活用した、富士山における環境保全金（トイレチップ等）の自動徴収・分配システムです。

It solves the physical burden of transporting heavy coins, reduces personnel costs for toilet attendants, and ensures fair distribution of funds based on actual usage data captured by IoT gates.

大量の小銭を山頂から下ろす物理的負担、トイレ番の無人化、そしてIoTゲートによる正確な利用実績に基づいた公平な資金分配を実現します。

## 🏆 Stablecoin (JPYC) Innovation Challenge 2025 Submission

### 🔗 Project Resources (提出資料)
- **Pitch Deck (企画書)**: [Summit Gate - Google Slides](https://docs.google.com/presentation/d/1umUMvpxYTl8CiH7g8ADPHuqL_u4CANCGC9EmKY-lAnE/edit?usp=sharing)
- **Demo Video (デモ動画)**: [Functionality Demo: Distribution Flow](https://youtu.be/L0lhce0bD34)

### Core Value Proposition (提供価値)
- **Cashless & Weightless**: Eliminates the need to transport hundreds of kg of coins down the mountain.
  - **キャッシュレス & ウェイトレス**: 何百キロもの小銭を人力で下山させる重労働をゼロにします。
- **Unmanned Operation**: Replaces human "toilet attendants" with automated IoT gates.
  - **無人化・省人化**: 有人のトイレ番をIoTゲートに置き換え、人手不足を解消します。
- **Fair Distribution**: Distributes funds transparently using **JPYC** based on verifiable on-chain data.
  - **公正な分配**: ブロックチェーン上の検証可能なデータに基づき、JPYCで透明かつ即座に資金を分配します。

---

## 🛠 Features (機能)

### 1. AI Camera Mock Data Integration
- Demonstrates the data flow using mock data, assuming input from AI cameras at mountain hut toilets.
- Designed to handle offline-first scenarios typical in mountain environments.
- 山小屋トイレのAIカメラからの入力を想定した、モックデータによるデータ連携フローを実演。山岳地帯のオフライン環境を考慮した設計。

### 2. JPYC Smart Contract Allocation
- Aggregates passage data off-chain to calculate distribution ratios.
- Determines the **withdrawable JPYC balance** for each hut within the Smart Contract.
- Huts can "Pull" (Withdraw) their funds at any time, ensuring a non-custodial and autonomous distribution process.
- 通行データを集計し、スマートコントラクト内で各山小屋の**「引き出し可能額（Allowance）」**を確定させます。山小屋は任意のタイミングで資金を引き出す（Pull型）ことができ、運営が資金を管理しない非カストディな分配を実現します。

### 3. User-Friendly Dashboard (Wallet Integration)
- **Direct Wallet Connection**: Mountain hut owners can connect via MetaMask (or similar wallets) to verify their allocation directly from the smart contract.
- **One-Click Withdraw**: Simple UI to "Pull" funds from the contract with a single transaction, minimizing technical complexity.
- **ウォレット接続による直接確認**: 山小屋オーナーはMetaMask等を接続し、スマートコントラクト上の割当額を直接確認可能。ワンクリックで引き出し（Withdraw）を実行できるシンプルなUIを提供。

### 4. B2B Ecosystem (Future Vision)
- Envisions a circular economy where distributed JPYC is used directly for bulldozer transport fees and other B2B payments on the mountain.
- 分配されたJPYCを、ブルドーザー輸送費などの山小屋間B2B決済に直接利用する循環型経済圏を構想しています（将来構想）。

---

## 🏗 Architecture (アーキテクチャ)

We adopt a **Hybrid On-chain/Off-chain Model** to balance transparency with privacy and cost efficiency.

透明性とプライバシー、コスト効率のバランスを考慮し、**オンチェーン/オフチェーンのハイブリッドモデル**を採用しています。

1.  **Data Collection (IoT)**: AI Cameras capture passage logs (User ID, Timestamp, Location).
2.  **Aggregation (Off-chain)**: Cloud server aggregates logs and calculates "Valid Passage Counts" per hut.
3.  **Settlement (On-chain)**:
    - The system calculates the distribution amount based on valid counts.
    - An administrator reviews and executes `batchAllocateRewards` on the smart contract (Human-in-the-loop for initial phase).
    - **JPYC** allowance is updated for each mountain hut wallet.

1. **データ収集 (IoT)**: AIカメラが通行ログ（ID、日時、場所）を取得。
2. **集計 (Off-chain)**: クラウドサーバーがログを集計し、山小屋ごとの「有効通過数」を計算。
3. **精算 (On-chain)**:
    - 有効数に基づいて分配額を計算。
    - 管理者が内容を確認後、スマートコントラクトの `batchAllocateRewards` を実行（初期は手動確認、将来的には自動化を予定）。
    - 各山小屋ウォレットの **JPYC** 引き出し可能額が更新される。

---

## 💻 Tech Stack (技術スタック)

- **Blockchain**: Avalanche C-Chain
- **Smart Contract**: Solidity, Hardhat
- **Stablecoin**: JPYC (ERC-20)
- **Frontend**: Next.js, Tailwind CSS
- **Authentication**: Web3Auth (MPC Core Kit) (Planned)
- **Libraries**: ethers.js, viem, wagmi

---

## 🚀 Getting Started (起動方法)

### Prerequisites (事前準備)
- Node.js (v18+)
- npm or yarn

### Installation (インストール)

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/summit-gate.git
   cd summit-gate
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Demo (デモの実行)

1. **Start the Local Blockchain (Hardhat Node)**:
   ```bash
   npx hardhat node
   ```

2. **Deploy Contracts (Localhost)**:
   In a separate terminal, deploy the contracts and mock JPYC:
   （別ターミナルでコントラクトとMock JPYCをデプロイ）
   ```bash
   npx hardhat run scripts/deploy.ts --network localhost
   ```

3. **Start the Frontend**:
   ```bash
   npm run dev
   ```

4. **Access the App**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.
   （ブラウザで http://localhost:3000 にアクセス）

---

## 📂 Documentation

- [Specification (仕様書)](./docs/specification.md)
- [Roadmap (ロードマップ)](./docs/roadmap.md)

---

## 📄 License

MIT
