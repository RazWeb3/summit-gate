const fs = require('fs');
const path = require('path');

// Configuration
// ------------------------------------------------------------------
// ユーザー設定: ここで「総人数」を変更できます
// 現在の設定: 77名 (デモ資金推奨額: 77 * 1900 = 146,300 JPYC)
// ------------------------------------------------------------------
const TOTAL_PEOPLE_COUNT = 100; 

const LOG_COUNT = TOTAL_PEOPLE_COUNT; // 1ログ = 1名として生成するため、ログ数 = 人数となります
const HUTS = [
    'unkaiso', 
    'houeisanso', 
    'goraikousanso', 
    'yamaguchisanso', 
    'ikedakan', 
    'mannenyukisanso', 
    'munatsukisanso'
]; // Real Fujinomiya Route 7 Huts

const LOCATIONS = {
    'unkaiso': '6th Station (Unkaiso)',
    'houeisanso': '6th Station (Houei-sanso)',
    'goraikousanso': 'New 7th Station (Goraikousanso)',
    'yamaguchisanso': 'Old 7th Station (Yamaguchi-sanso)',
    'ikedakan': '8th Station (Ikeda-kan)',
    'mannenyukisanso': '9th Station (Mannen-yuki-sanso)',
    'munatsukisanso': '9.5th Station (Munatsuki-sanso)'
};

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateLogs() {
    const logs = [];
    const baseDate = new Date('2025-07-15T04:00:00Z'); // 4 AM start (Sunrise climb)

    for (let i = 0; i < LOG_COUNT; i++) {
        // Weighted random to simulate realistic distribution
        // Lower huts (6th) get more traffic, higher huts get slightly less but focused
        const hutIndex = getRandomInt(0, HUTS.length - 1);
        const hutId = HUTS[hutIndex];
        
        // Randomly advance time (between 30 seconds to 5 minutes)
        baseDate.setSeconds(baseDate.getSeconds() + getRandomInt(30, 300));
        
        // Fixed count to 1 to ensure Total Count matches LOG_COUNT (77)
        const count = 1;

        logs.push({
            hutId: hutId,
            timestamp: baseDate.toISOString(),
            count: count,
            location: LOCATIONS[hutId]
        });
    }

    return logs;
}

const dummyData = generateLogs();
const outputPath = path.join(__dirname, '../data/dummy_rfid_logs.json');

fs.writeFileSync(outputPath, JSON.stringify(dummyData, null, 2));

console.log(`Generated ${LOG_COUNT} logs at: ${outputPath}`);
console.log('Sample data:', dummyData[0]);
