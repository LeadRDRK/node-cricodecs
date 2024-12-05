import hca_wasm from '../hca-wasm/pkg/hca_wasm';

export class HCA {
    buffer: Buffer;
    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    decode(keycode: bigint, subkey: number) {
        return hca_wasm.decodeHca(new Uint8Array(this.buffer), keycode, subkey);
    }
}