import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Small atomic local store. It deliberately avoids a native database in v0.1. */
export class JsonStore {
  #file;
  #defaultValue;
  #queue = Promise.resolve();

  constructor(file, defaultValue = {}) {
    this.#file = path.resolve(file);
    this.#defaultValue = structuredClone(defaultValue);
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.#file, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return structuredClone(this.#defaultValue);
      throw error;
    }
  }

  async write(value) {
    const operation = async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      const temporary = `${this.#file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.#file);
      return value;
    };
    this.#queue = this.#queue.then(operation, operation);
    return this.#queue;
  }

  async update(mutator) {
    const current = await this.read();
    const next = await mutator(structuredClone(current));
    return this.write(next ?? current);
  }
}
