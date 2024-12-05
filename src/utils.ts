import { PathLike } from "fs";
import fs from "fs/promises";

export async function pathExists(path: PathLike): Promise<boolean> {
    try {
        await fs.stat(path);
        return true;
    }
    catch {
        return false;
    }
}