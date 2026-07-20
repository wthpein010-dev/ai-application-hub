export class XorShift {
  constructor(words) {
    if (!Array.isArray(words) || words.length !== 4) {
      throw new TypeError("XorShift requires four state words");
    }
    this.words = words.map((word) => word >>> 0);
    if (this.words.every((word) => word === 0)) {
      this.words[3] = 1;
    }
  }

  static fromSeed(seed) {
    const value = Number(seed) | 0;
    return new XorShift([
      value >>> 0,
      (value ^ 0x9e3779b9) >>> 0,
      (Math.imul(value, 0x85ebca6b) + 1) >>> 0,
      (value ^ 0xc2b2ae35) >>> 0,
    ]);
  }

  nextUint32() {
    let [x, y, z, w] = this.words;
    const t = (x ^ (x << 11)) >>> 0;
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    this.words = [x, y, z, w];
    return w;
  }

  nextInt(min, maxExclusive) {
    const lower = Math.trunc(min);
    const upper = Math.trunc(maxExclusive);
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) {
      throw new RangeError("nextInt requires a non-empty range");
    }
    return lower + (this.nextUint32() % (upper - lower));
  }

  shuffle(list) {
    const result = [...list];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.nextInt(0, index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }
}
