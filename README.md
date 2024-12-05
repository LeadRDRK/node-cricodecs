# CriCodecs
CriWare codecs for Node.js. Uses Rust WASM modules for fast audio decoding.

## Supports
- **Node:** v18.0.0+
- **Extracting:**
    - ACB
    - AWB/AFS2
- **Decoding:**
    - HCA
- **Building/Encoding:** Not supported yet.

## Example
```js
import { ACB, AFS2 } from "cricodecs";
import { writeFile } from "fs/promises";
const key = 1234n; // bigint

// Decode ACB
const acb = await ACB.fromFile("audio.acb");
await acb.decodeToWavFiles(key, "path/to/acb_out", (current, total) => { // Optional progress monitor
    console.log(`Progress: ${current}/${total}`);
});
// Dump HCAs
await acb.walk(async (hca, awbKey, isMemory, index) => {
    const path = `path/to/acb_out/${index}.hca`;
    await writeFile(path, hca.buffer);
});

// Decode AWB
const awb = await AFS2.fromFile("audio.awb");
await awb.decodeToWavFiles(key, "path/to/awb_out", (current, total) => {
    console.log(`Progress: ${current}/${total}`);
});
// Dump HCAs
for (let i = 0; i < awb.files.length; ++i) {
    const path = `path/to/awb_out/${i}.hca`;
    await writeFile(path, awb.files[i].buffer);
};
```

## License
[ISC](LICENSE)

## Credits
- Originally based on [kohos/CriTools](https://github.com/kohos/CriTools).
- HCA decoding code from [vgmstream](https://github.com/vgmstream/vgmstream).