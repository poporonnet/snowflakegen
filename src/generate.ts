import { encodeBase32 } from "@jsr/std__encoding/base32"

declare const snowflakeNominal: unique symbol;
export type ID<T> = string & { [snowflakeNominal]: T };

export interface GeneratorOptions {
  clock: () => bigint;
  epochSecond: bigint
  workerId: number
}

export class SnowflakeIdGenerator {
  readonly #clock: () => bigint;
  readonly #workerId: number
  readonly #epoch: bigint

  #lastTimeStamp: bigint = 0n;
  #sequence: bigint = 0n;

  constructor(options: GeneratorOptions) {
    if (options.workerId > 2n ** 10n - 1n) throw new Error("workerId must be between 0 and 1023")
    if (options.epochSecond < 0n) throw new Error("invalid epoch");

    this.#clock = options.clock;
    this.#epoch = options.epochSecond;
    this.#workerId = options.workerId;
  }

  generateRawId(): bigint {
    let now = this.#clock();

    if (now < this.#lastTimeStamp) {
      throw new Error("Clock moved backwards");
    }

    if (now === this.#lastTimeStamp) {
      this.#sequence = (this.#sequence + 1n) & 0xFFFn;
      if (this.#sequence === 0n) {
        while (now <= this.#lastTimeStamp) {
          now = this.#clock();
        }
      }
    } else {
      this.#sequence = 0n;
    }

    this.#lastTimeStamp = now;

    const timestamp = now - this.#epoch * 1000n;
    return ((timestamp << 22n) | (BigInt(this.#workerId) << 12n) | this.#sequence);
  }

  encodeWithBase32<T>(): ID<T> {
    const id = this.generateRawId();
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, id);
    return encodeBase32(bytes) as ID<T>;
  }

}


