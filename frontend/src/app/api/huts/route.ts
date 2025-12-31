import { NextResponse } from 'next/server';
import { getDb } from '@/utils/db';
import fs from 'fs';
import path from 'path';

const LOGS_PATH = path.join(process.cwd(), '../data/dummy_rfid_logs.json');

const HUT_ID_MAP: { [key: string]: number } = {
  'unkaiso': 1,
  'houeisanso': 2,
  'goraikousanso': 3,
  'yamaguchisanso': 4,
  'ikedakan': 5,
  'mannenyukisanso': 6,
  'munatsukisanso': 7
};

export async function GET() {
  const db = await getDb();
  await db.read();

  // Try to read generated logs and update counts
  try {
    if (fs.existsSync(LOGS_PATH)) {
      const rawData = fs.readFileSync(LOGS_PATH, 'utf8');
      const logs: unknown = JSON.parse(rawData);
      
      // Reset counts to 0 before aggregating
      const newCounts: { [key: number]: number } = {};
      db.data.huts.forEach(h => newCounts[h.id] = 0);

      if (Array.isArray(logs)) {
        logs.forEach((log) => {
          if (typeof log !== 'object' || log === null) return;
          const record = log as { hutId?: unknown; count?: unknown };
          if (typeof record.hutId !== 'string') return;
          const id = HUT_ID_MAP[record.hutId];
          if (!id || newCounts[id] === undefined) return;
          const count = typeof record.count === 'number' ? record.count : Number(record.count);
          if (!Number.isFinite(count) || count <= 0) return;
          newCounts[id] += Math.floor(count);
        });
      }

      // Update db data
      let hasChanges = false;
      db.data.huts = db.data.huts.map(hut => {
        if (newCounts[hut.id] !== undefined && newCounts[hut.id] !== hut.count) {
          hasChanges = true;
          return { ...hut, count: newCounts[hut.id] };
        }
        return hut;
      });

      if (hasChanges) {
        await db.write();
      }
    }
  } catch (error: unknown) {
    console.error("Failed to sync with dummy logs:", error);
    // Continue with existing DB data if sync fails
  }

  return NextResponse.json(db.data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const db = await getDb();
  
  if (body.huts) {
    db.data.huts = body.huts;
  }
  
  if (body.coefficients) {
    db.data.coefficients = body.coefficients;
  }
  
  db.data.lastUpdated = new Date().toISOString();
  await db.write();
  
  return NextResponse.json({ success: true, data: db.data });
}
