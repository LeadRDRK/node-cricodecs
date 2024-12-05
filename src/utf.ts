export class UTF {
    buffer: Buffer;
    magic: string;
    dataSize: number;
    unknown: number;
    valueOffset: number;
    stringOffset: number;
    dataOffset: number;
    nameOffset: number;
    columnCount: number;
    rowWidth: number;
    rowCount: number;
    name: string;
    table: UTFRow[];

    constructor(buffer: Buffer) {
        if (buffer.length < 4) {
            throw new Error("Invalid buffer");
        }
        this.buffer = buffer;
        let pos = 0;
        this.magic = buffer.subarray(pos, 4).toString(); pos += 4;
        if (this.magic !== '@UTF') {
            throw new Error("Invalid file signature");
        }
        this.dataSize = buffer.readUInt32BE(pos); pos += 4;
        buffer = buffer.subarray(pos);
        pos = 0;
        this.unknown = buffer.readUInt16BE(pos); pos += 2;
        this.valueOffset = buffer.readUInt16BE(pos); pos += 2;
        this.stringOffset = buffer.readUInt32BE(pos); pos += 4;
        this.dataOffset = buffer.readUInt32BE(pos); pos += 4;
        this.nameOffset = buffer.readUInt32BE(pos); pos += 4;
        this.columnCount = buffer.readUInt16BE(pos); pos += 2;
        this.rowWidth = buffer.readUInt16BE(pos); pos += 2;
        this.rowCount = buffer.readUInt32BE(pos); pos += 4;
        let stringEnd = findZero(buffer, this.stringOffset);
        this.name = buffer.subarray(this.stringOffset, stringEnd).toString();
        let valuePos = this.valueOffset;
        this.table = [];
        let firstPos = pos;
        for (let i = 0; i < this.rowCount; i++) {
            let row: UTFRow = {};
            pos = firstPos;
            for (let j = 0; j < this.columnCount; j++) {
                let type = buffer.readUInt8(pos); pos = pos + 1;
                let stringOffset = this.stringOffset + buffer.readUInt32BE(pos); pos += 4;
                stringEnd = findZero(buffer, stringOffset);
                const key = buffer.subarray(stringOffset, stringEnd).toString();
                const method = type >>> 5;
                type = type & 0x1F;
                let value: UTFValue = null;
                if (method > 0) {
                    let offset = method === 1 ? pos : valuePos;
                    switch (type) {
                        case UTFType.I8: value = buffer.readInt8(offset); offset += 1; break;
                        case UTFType.U8: value = buffer.readUInt8(offset); offset += 1; break;
                        case UTFType.I16: value = buffer.readInt16BE(offset); offset += 2; break;
                        case UTFType.U16: value = buffer.readUInt16BE(offset); offset += 2; break;
                        case UTFType.I32: value = buffer.readInt32BE(offset); offset += 4; break;
                        case UTFType.U32: value = buffer.readUInt32BE(offset); offset += 4; break;
                        case UTFType.I64: value = buffer.readBigInt64BE(offset); offset += 8; break;
                        case UTFType.U64: value = buffer.readBigUInt64BE(offset); offset += 8; break;
                        case UTFType.FLOAT: value = buffer.readFloatBE(offset); offset += 4; break;
                        case UTFType.DOUBLE: value = buffer.readDoubleBE(offset); offset += 8; break;
                        case UTFType.STRING:
                            stringOffset = this.stringOffset + buffer.readUInt32BE(offset); offset += 4;
                            stringEnd = findZero(buffer, stringOffset);
                            value = buffer.subarray(stringOffset, stringEnd).toString();
                            break;
                        case UTFType.DATA:
                            const bufferStart = this.dataOffset + buffer.readUInt32BE(offset); offset += 4;
                            const bufferLen = buffer.readUInt32BE(offset); offset += 4;
                            value = buffer.subarray(bufferStart, bufferStart + bufferLen);
                            break;
                        default:
                            console.warn(`unknown type: ${type}`);
                            break;
                    }
                    if (method === 1) {
                        pos = offset;
                    }
                    else {
                        valuePos = offset;
                    }
                }
                row[key] = new UTFColumn(type, key, value);
            }
            this.table.push(row);
        }
    }

    get(index: number) {
        if (index < 0 || index >= this.table.length) {
            throw new Error("UTF: Row index out of range: " + index);
        }
        return this.table[index];
    }

    *[Symbol.iterator]() {
        for (const row of this.table) {
            yield row;
        }
    }
}

function findZero(buffer: Buffer, start: number) {
    while (buffer[start] !== 0x0) { start++; }
    return start;
}

export type UTFValue = string | number | bigint | Buffer | null;
export enum UTFType {
    I8 = 0x10,
    U8,
    I16,
    U16,
    I32,
    U32,
    I64,
    U64,
    FLOAT,
    DOUBLE,
    STRING,
    DATA
}

export class UTFColumn {
    type: UTFType | number;
    name: string;
    value: UTFValue;
    utf?: UTF;

    constructor(type: UTFType | number, name: string, value: UTFValue) {
        this.type = type;
        this.name = name;
        this.value = value;
    }

    checkType(type: UTFType) {
        if (this.type != type) {
            throw new UTFTypeError(this, UTFType[type]);
        }
    }

    getNumber(type?: Exclude<UTFType, UTFType.STRING | UTFType.DATA>): number {
        if (type) this.checkType(type);
        if (typeof this.value === "number") {
            return this.value;
        }
        else {
            throw new UTFTypeError(this, "numerical type");
        }
    }

    getString(): string {
        if (typeof this.value === "string") {
            return this.value;
        }
        else {
            throw new UTFTypeError(this, UTFType[UTFType.STRING]);
        }
    }

    getData(): Buffer {
        if (this.value instanceof Buffer) {
            return this.value;
        }
        else {
            throw new UTFTypeError(this, UTFType[UTFType.DATA]);
        }
    }

    asUTF(): UTF {
        if (!this.utf) {
            this.utf = new UTF(this.getData());
        }
        return this.utf;
    }
}

export class UTFTypeError extends Error {
    column: UTFColumn;
    expected: string;

    constructor(column: UTFColumn, expected: string) {
        const gotTypeName = UTFType[column.type] || column.type.toString();
        super(`Invalid column type for "${column.name}" (expected ${expected}, got ${gotTypeName})`);

        this.column = column;
        this.expected = expected;
    }
}

export type UTFRow = {[key: string]: UTFColumn};