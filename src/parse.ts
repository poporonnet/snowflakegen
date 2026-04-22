import { decodeBase32 } from "@jsr/std__encoding/base32"

export type ParsedSnowflakeId = {
  raw: bigint
  timestamp: bigint
  unixMs: bigint
  workerId: bigint
  sequence: bigint
}

export function parseSnowflakeId(id: bigint, epochSecond: bigint): ParsedSnowflakeId {
  const timestamp = id >> 22n
  const workerId  = (id >> 12n) & 0x3FFn
  const sequence  = id & 0xFFFn
  const unixMs    = timestamp + epochSecond * 1000n

  return { raw: id, timestamp, unixMs, workerId, sequence }
}

export function parseBase32SnowflakeId(encoded: string, epochSecond: bigint): ParsedSnowflakeId {
  const bytes = decodeBase32(encoded)
  const id = new DataView(bytes.buffer).getBigUint64(0)
  return parseSnowflakeId(id, epochSecond)
}

export function debugPrint(parsed: ParsedSnowflakeId): void {
  const date = new Date(Number(parsed.unixMs))
  console.log(`raw       : ${parsed.raw}`)
  console.log(`timestamp : ${parsed.timestamp} ms (offset from epoch)`)
  console.log(`unixMs    : ${parsed.unixMs} (${date.toISOString()})`)
  console.log(`workerId  : ${parsed.workerId}`)
  console.log(`sequence  : ${parsed.sequence}`)
}