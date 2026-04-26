import { describe, it, expect } from 'vitest'
import { SnowflakeIdGenerator } from './generate.js'

const EPOCH = 166985280n
const BASE_MS = EPOCH * 1000n + 1000n // 1000ms after epoch

function fields(id: bigint) {
  return {
    timestamp: id >> 22n,
    workerId: (id >> 12n) & 0x3FFn,
    sequence: id & 0xFFFn,
  }
}

function fixedClock(...ticks: bigint[]) {
  let i = 0
  return () => ticks[Math.min(i++, ticks.length - 1)]
}

describe('初期化', () => {
  it.each([
    {
      name: 'workerId = 1024 (境界値)',
      workerId: 1024,
      epochSecond: 0n,
      error: 'workerId must be between 0 and 1023',
    },
    {
      name: 'workerId = 9999 (明らかに大きい)',
      workerId: 9999,
      epochSecond: 0n,
      error: 'workerId must be between 0 and 1023',
    },
    {
      name: 'epochSecond = -1n (負値)',
      workerId: 0,
      epochSecond: -1n,
      error: 'invalid epoch',
    },
  ])('$name throws error', ({ workerId, epochSecond, error }) => {
    expect(
      () => new SnowflakeIdGenerator({ workerId, epochSecond, clock: () => 0n })
    ).toThrow(error)
  })
})

describe('generate', () => {
  it.each([
    {
      name: '初回呼び出し: sequence=0',
      ticks: [BASE_MS],
      workerId: 1,
      calls: 1,
      expected: { timestamp: 1000n, workerId: 1n, sequence: 0n },
    },
    {
      name: '同じミリ秒内 2回目: sequence=1',
      ticks: [BASE_MS, BASE_MS],
      workerId: 1,
      calls: 2,
      expected: { timestamp: 1000n, workerId: 1n, sequence: 1n },
    },
    {
      name: '同じミリ秒内 3回目: sequence=2',
      ticks: [BASE_MS, BASE_MS, BASE_MS],
      workerId: 1,
      calls: 3,
      expected: { timestamp: 1000n, workerId: 1n, sequence: 2n },
    },
    {
      name: '時刻が進んだとき: sequence がリセットされる',
      ticks: [BASE_MS, BASE_MS + 1n],
      workerId: 1,
      calls: 2,
      expected: { timestamp: 1001n, workerId: 1n, sequence: 0n },
    },
    {
      name: 'workerId = 0 (最小値)',
      ticks: [BASE_MS],
      workerId: 0,
      calls: 1,
      expected: { timestamp: 1000n, workerId: 0n, sequence: 0n },
    },
    {
      name: 'workerId = 1022 (最大値)',
      ticks: [BASE_MS],
      workerId: 1022,
      calls: 1,
      expected: { timestamp: 1000n, workerId: 1022n, sequence: 0n },
    },
    {
      name: 'sequence = 4095 (オーバーフロー手前)',
      ticks: Array(4096).fill(BASE_MS) as bigint[],
      workerId: 0,
      calls: 4096,
      expected: { timestamp: 1000n, workerId: 0n, sequence: 4095n },
    },
  ])('$name', ({ ticks, workerId, calls, expected }) => {
    const gen = new SnowflakeIdGenerator({
      workerId,
      epochSecond: EPOCH,
      clock: fixedClock(...ticks),
    })

    let id = 0n
    for (let i = 0; i < calls; i++) id = gen.generateRawId()

    expect(fields(id)).toEqual(expected)
  })

  it('時計の逆戻りでエラー', () => {
    const gen = new SnowflakeIdGenerator({
      workerId: 0,
      epochSecond: EPOCH,
      clock: fixedClock(BASE_MS + 10n, BASE_MS),
    })
    gen.generateRawId()
    expect(() => gen.generateRawId()).toThrow('Clock moved backwards')
  })

  it('生成された ID は単調増加する', () => {
    const ticks = [BASE_MS, BASE_MS, BASE_MS + 1n, BASE_MS + 1n]
    const gen = new SnowflakeIdGenerator({
      workerId: 0,
      epochSecond: EPOCH,
      clock: fixedClock(...ticks),
    })

    const ids = Array.from({ length: 4 }, () => gen.generateRawId())
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1])
    }
  })
})

describe('generate - sequence overflow', () => {
  it('同一ミリ秒で 4096 件を超えたとき次のミリ秒で sequence=0 から再開する', () => {
    // 4096 回は BASE_MS、4097 回目の初回 clock() も BASE_MS (overflow検出)、
    // while ループ内で BASE_MS+1 を返して脱出する
    let callCount = 0
    const gen = new SnowflakeIdGenerator({
      workerId: 0,
      epochSecond: EPOCH,
      clock: () => (callCount++ < 4097 ? BASE_MS : BASE_MS + 1n),
    })

    for (let i = 0; i < 4096; i++) gen.generateRawId()

    const id = gen.generateRawId()
    expect(fields(id)).toEqual({ timestamp: 1001n, workerId: 0n, sequence: 0n })
  })
})

describe('encodeWithBase32', () => {
  it('Base32 文字列を返す', () => {
    const gen = new SnowflakeIdGenerator({
      workerId: 0,
      epochSecond: EPOCH,
      clock: fixedClock(BASE_MS),
    })

    const encoded = gen.encodeWithBase32()
    expect(encoded).toMatch(/^[A-Z2-7]+=*$/)
    expect(encoded.length).toBe(16) // ceil(8 * 8 / 5) = 13 chars + padding → 16
    console.debug(encoded)
  })
})
