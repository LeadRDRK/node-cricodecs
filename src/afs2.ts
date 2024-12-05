import fs from "fs/promises";
import path from "path";
import { HCA } from "./hca";

export class AFS2 {
    buffer: Buffer;
    magic: string;
    /**
     * 0x01=common, 0x02=2018+ (no apparent differences)
     */
    version: number;
    offsetSize: number;
    waveidAlign: number;
    fileCount: number;
    offsetAlign: number;
    key: number;
    fileIds: number[];
    files: HCA[];

    private constructor(buffer: Buffer) {
        if (buffer.length < 4) {
            throw new Error("Invalid buffer");
        }
        this.buffer = buffer;
        let pos = 0;
        this.magic = buffer.subarray(pos, 4).toString(); pos += 4;
        if (this.magic !== 'AFS2') {
            throw new Error("Invalid file signature");
        }
        this.version = buffer.readUInt8(pos); pos += 1;
        this.offsetSize = buffer.readUInt8(pos); pos += 1;
        this.waveidAlign = buffer.readUInt16LE(pos); pos += 2;
        this.fileCount = buffer.readUInt32LE(pos); pos += 4;
        this.offsetAlign = buffer.readUInt16LE(pos); pos += 2;
        this.key = buffer.readUInt16LE(pos); pos += 2;
        this.fileIds = [];
        for (let i = 0; i < this.fileCount; i++) {
            const fileId = buffer.readUInt16LE(pos);
            pos += this.waveidAlign;
            this.fileIds.push(fileId);
        }
        this.files = [];
        let start;
        if (this.offsetSize === 2) {
            start = buffer.readUInt16LE(pos); pos += 2;
        } else if (this.offsetSize === 4) {
            start = buffer.readUInt32LE(pos); pos += 4;
        } else {
            throw new Error("Invalid size length");
        }
        let mod = start % this.offsetAlign;
        if (mod !== 0) {
            start += this.offsetAlign - mod;
        }
        for (let i = 0; i < this.fileCount; i++) {
            let end;
            if (this.offsetSize === 2) {
                end = buffer.readUInt16LE(pos); pos += 2;
            } else if (this.offsetSize === 4) {
                end = buffer.readUInt32LE(pos); pos += 4;
            } else {
                throw new Error("Invalid size length");
            }
            this.files.push(new HCA(buffer.subarray(start, end)));
            start = end;
            mod = start % this.offsetAlign;
            if (mod !== 0) {
                start += this.offsetAlign - mod;
            }
        }
    }

    static fromBuffer(buffer: Buffer) {
        return new AFS2(buffer);
    }

    static async fromFile(path: string) {
        return new AFS2(await fs.readFile(path));
    }

    async decodeToWavFiles(key: bigint, wavDir: string, progressFn?: (current: number, total: number) => void) {
        await fs.mkdir(wavDir, { recursive: true });
        const files: string[] = [];
        const total = this.files.length
        for (let i = 0; i < total; i++) {
            progressFn?.(i, total);
            const hca = this.files[i];
            const wavPath = path.join(wavDir, i + ".wav");
            const wavBuffer = hca.decode(key, this.key);
            await fs.writeFile(wavPath, wavBuffer);
            files.push(wavPath);
        }
        progressFn?.(total, total);
        return files;
    }
}