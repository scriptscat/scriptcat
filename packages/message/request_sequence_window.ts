const REQUEST_SEQUENCE_WINDOW_WORDS = 128;
export const REQUEST_SEQUENCE_WINDOW_SIZE = REQUEST_SEQUENCE_WINDOW_WORDS * 32;
const NativeUint32Array = Uint32Array;

export class RequestSequenceWindow {
  private highWater = 0;
  private readonly bitmap = new NativeUint32Array(REQUEST_SEQUENCE_WINDOW_WORDS);

  consume(sequence: unknown): void {
    if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error("page RPC sequence is invalid");
    }

    if (sequence <= this.highWater - REQUEST_SEQUENCE_WINDOW_SIZE) {
      throw new Error("page RPC sequence is outside the replay window");
    }

    const slot = sequence % REQUEST_SEQUENCE_WINDOW_SIZE;
    const wordIndex = slot >>> 5;
    const bit = 1 << (slot & 31);

    if (sequence > this.highWater) {
      // 广播端存在本地 broker-only 请求（不会推进 SW 侧序列），因此合法序列
      // 可能一次性向前跳跃超过窗口大小；跳跃达到窗口大小时，逐位清理已不再
      // 有意义，直接以固定 word 数整体清空 bitmap。
      const jump = sequence - this.highWater;
      if (jump >= REQUEST_SEQUENCE_WINDOW_SIZE) {
        this.bitmap.fill(0);
      } else {
        const firstExpired = Math.max(1, this.highWater - REQUEST_SEQUENCE_WINDOW_SIZE + 1);
        const lastExpired = sequence - REQUEST_SEQUENCE_WINDOW_SIZE;
        for (let expired = firstExpired; expired <= lastExpired; expired += 1) {
          const expiredSlot = expired % REQUEST_SEQUENCE_WINDOW_SIZE;
          const expiredWord = expiredSlot >>> 5;
          this.bitmap[expiredWord] &= ~(1 << (expiredSlot & 31));
        }
      }
      this.highWater = sequence;
    } else if ((this.bitmap[wordIndex] & bit) !== 0) {
      throw new Error("page RPC sequence was already used");
    }

    this.bitmap[wordIndex] |= bit;
  }
}
