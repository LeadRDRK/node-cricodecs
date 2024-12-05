import fs from "fs/promises";
import path from "path";
import { HCA } from "./hca";
import { AFS2 } from "./afs2";
import { UTF, UTFRow } from "./utf";

export class ACB {
    buffer: Buffer;
    info: UTFRow;
    memoryAwb: AFS2 | null;
    streamAwbs: AFS2[];

    private constructor(buffer: Buffer) {
        this.buffer = buffer;
        const utf = new UTF(buffer);
        if (!utf) {
            throw new Error("Not an ACB file");
        }
        if (utf.table.length !== 1) {
            throw new Error("More than one UTF entry in ACB");
        }

        const info = utf.get(0);
        this.info = info;

        const awbFile = info.AwbFile;
        this.memoryAwb = awbFile ? AFS2.fromBuffer(awbFile.getData()) : null;

        this.streamAwbs = [];
    }

    private async loadStreamAwbs(resolveAwb: (awbName: string) => Promise<Buffer> | Buffer) {
        const info = this.info;

        let streamAwbHash: UTF | undefined;
        try {
            streamAwbHash = info.StreamAwbHash.asUTF();
        }
        catch {
        }

        if (streamAwbHash) {
            for (const streamAwb of streamAwbHash) {
                this.streamAwbs.push(AFS2.fromBuffer(await resolveAwb(streamAwb.Name.getString())));
            }

            const waveformTable = info.WaveformTable.asUTF();
            for (let i = 0; i < waveformTable.rowCount; ++i) {
                const waveform = waveformTable.get(i);
                const isMemory = waveform.Streaming.getNumber() === 0;
                if (!isMemory) {
                    if (!this.streamAwbs[waveform.StreamAwbPortNo.getNumber()]) {
                        throw new Error(`Missing ${streamAwbHash.get(i).Name}.awb`);
                    }
                }
            }
        }
    }

    static async fromBuffer(buffer: Buffer, resolveAwb?: (awbName: string) => Promise<Buffer> | Buffer) {
        const acb = new ACB(buffer);
        resolveAwb = resolveAwb || (() => { throw new Error("No method to resolve stream AWBs") });
        await acb.loadStreamAwbs(resolveAwb);
        return acb;
    }

    static async fromFile(p: string, resolveAwb?: (awbName: string) => Promise<Buffer> | Buffer) {
        const parsedPath = path.parse(p);
        const acb = new ACB(await fs.readFile(p));
        resolveAwb = resolveAwb || (awbName => fs.readFile(path.join(parsedPath.dir, awbName + ".awb")));
        await acb.loadStreamAwbs(resolveAwb);
        return acb;
    }

    async walk(callback: (hca: HCA, awbKey: number, isMemory: boolean, index: number) => Promise<void> | void) {
        const waveformTable = this.info.WaveformTable.asUTF();
        for (let i = 0; i < waveformTable.rowCount; ++i) {
            const waveform = waveformTable.get(i);
            const isMemory = waveform.Streaming.getNumber() === 0;

            let hca: HCA | undefined;
            let awbKey: number;
            if (isMemory) {
                if (!this.memoryAwb) continue;
                hca = this.memoryAwb.files[waveform.MemoryAwbId.getNumber()];
                awbKey = this.memoryAwb.key;
            }
            else {
                const streamAwb = this.streamAwbs[waveform.StreamAwbPortNo.getNumber()];
                if (!streamAwb) continue;
                hca = streamAwb.files[waveform.StreamAwbId.getNumber()];
                awbKey = streamAwb.key;
            }

            if (hca) {
                await callback(hca, awbKey, isMemory, i);
            }
        }
    }

    async decodeToWavFiles(key: bigint, wavDir: string, progressFn?: (current: number, total: number) => void) {
        await fs.mkdir(wavDir, { recursive: true });
        const files: string[] = [];
        let memory = 0, stream = 0;
        const total = this.info.WaveformTable.asUTF().rowCount;
        await this.walk(async (hca, awbKey, isMemory, i) => {
            progressFn?.(i, total);
            const name = isMemory ? `memory_${memory++}.wav` : `stream_${stream++}.wav`;
            const wavPath = path.join(wavDir, name);
            const wavBuffer = hca.decode(key, awbKey);
            await fs.writeFile(wavPath, wavBuffer);
            files.push(wavPath);
        });
        progressFn?.(total, total);
        return files;
    }
}