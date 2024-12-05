import { ACB, AFS2 } from "../dist/index.js";
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from "node:assert";
import fs from 'fs/promises';
    
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const testAcb = path.join(dataDir, "test.acb");
const testAwb = path.join(dataDir, "test.awb");
const acbKey = path.join(dataDir, "acbkey.txt");
const awbKey = path.join(dataDir, "awbkey.txt");
const acbOutDir = path.join(dataDir, "acb_out");
const awbOutDir = path.join(dataDir, "awb_out");

async function loadKey(p) {
    return BigInt((await fs.readFile(p, { encoding: "utf8" })).trim());
}

function progressFn(current, total) {
    console.log(`${current}/${total}`);
}

test("ACB", async () => {
    await fs.rm(acbOutDir, { recursive: true, force: true });
    const acb = await ACB.fromFile(testAcb);
    const key = await loadKey(acbKey);
    assert.ok(acb.info.WaveformTable);
    await acb.decodeToWavFiles(key, acbOutDir, progressFn);
});

test("AWB/AFS2", async () => {
    await fs.rm(awbOutDir, { recursive: true, force: true });
    const afs2 = await AFS2.fromFile(testAwb);
    const key = await loadKey(awbKey);
    assert.ok(afs2.files.length > 0);
    await afs2.decodeToWavFiles(key, awbOutDir, progressFn);
});