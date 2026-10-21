import { describe, expect, it } from 'vitest';
import { buildSyncPayload, normalizeLibrary, type SyncPayload } from '../domain';
import { makeLesson } from '../test/entries';
import type { PushHeader } from './messages';
import { TransferAssembler, chunkFrame, isConsistentHeader, prepareTransfer } from './transfer';

const CHUNK_BYTES = 50;
const ARCHIVE = makeLesson('A1', '第1讲', ['柜子', '桌子', '猫', '工作']).map((entry) => ({
  ...entry,
  archivedAt: '2025-02-01T09:00:00.000Z',
}));
const PAYLOAD: SyncPayload = buildSyncPayload(
  normalizeLibrary({ pool: [], archive: ARCHIVE, order: [] }),
  { mode: 'full' },
);

function prepared() {
  const result = prepareTransfer('t1', PAYLOAD, CHUNK_BYTES);
  if (result === null) throw new Error('载荷不应超出上限');
  return result;
}

function frames(bytes: Uint8Array, header: PushHeader): ArrayBuffer[] {
  return Array.from(
    { length: header.chunks },
    (_, index) => chunkFrame(bytes, index, CHUNK_BYTES).slice().buffer,
  );
}

function assemble(header: PushHeader, parts: readonly ArrayBuffer[]) {
  const assembler = new TransferAssembler(header, CHUNK_BYTES);
  const steps = parts.map((part) => assembler.add(part));
  return { assembler, steps };
}

describe('分片传输', () => {
  it('推送头描述载荷：模式、词数、字节数、片数与校验和', () => {
    const { header, bytes } = prepared();
    expect(header).toMatchObject({ kind: 'push', id: 't1', mode: 'full', entries: 4 });
    expect(header.bytes).toBe(bytes.length);
    expect(header.chunks).toBe(Math.ceil(bytes.length / CHUNK_BYTES));
    expect(header.checksum).toMatch(/^[0-9a-f]{16}$/u);
    expect(isConsistentHeader(header, CHUNK_BYTES)).toBe(true);
    expect(isConsistentHeader({ ...header, chunks: header.chunks + 1 }, CHUNK_BYTES)).toBe(false);
  });

  it('每片以 4 字节大端片序号开头', () => {
    const { bytes } = prepared();
    const frame = chunkFrame(bytes, 1, CHUNK_BYTES);
    expect([...frame.subarray(0, 4)]).toEqual([0, 0, 0, 1]);
    expect([...frame.subarray(4)]).toEqual([...bytes.subarray(CHUNK_BYTES, 2 * CHUNK_BYTES)]);
  });

  it('按顺序收齐后还原出相同的载荷', () => {
    const { header, bytes } = prepared();
    const { assembler, steps } = assemble(header, frames(bytes, header));
    expect(steps.at(-1)).toBe('complete');
    expect(steps.slice(0, -1).every((step) => step === 'more')).toBe(true);
    expect(assembler.received).toBe(header.bytes);
    expect(assembler.finish()).toEqual(PAYLOAD);
  });

  it('乱序、重复、长度不符或多出的分片都视为无效', () => {
    const { header, bytes } = prepared();
    const parts = frames(bytes, header);
    const [first, second] = parts;
    if (first === undefined || second === undefined) throw new Error('至少应有两片');
    expect(assemble(header, [second]).steps).toEqual(['invalid']);
    expect(assemble(header, [first, first]).steps).toEqual(['more', 'invalid']);
    expect(assemble(header, [first.slice(0, 10)]).steps).toEqual(['invalid']);
    expect(assemble(header, [new ArrayBuffer(2)]).steps).toEqual(['invalid']);
    expect(assemble(header, [...parts, first]).steps.at(-1)).toBe('invalid');
  });

  it('没有收齐、校验和不符或结构不合法时不产出载荷', () => {
    const { header, bytes } = prepared();
    const parts = frames(bytes, header);
    expect(assemble(header, parts.slice(0, 1)).assembler.finish()).toBeNull();

    expect(assemble({ ...header, checksum: '0000000000000000' }, parts).assembler.finish()).toBe(
      null,
    );
    expect(assemble({ ...header, entries: 3 }, parts).assembler.finish()).toBeNull();
    expect(assemble({ ...header, mode: 'lessons' }, parts).assembler.finish()).toBeNull();

    // 校验和正确但内容不是合法载荷（例如对方发来恶意构造的数据）
    const forged = { mode: 'full', lessons: [], entries: [{ id: 1 }], order: [] };
    const forgedTransfer = prepareTransfer('t2', forged as unknown as SyncPayload, CHUNK_BYTES);
    if (forgedTransfer === null) throw new Error('载荷不应超出上限');
    const forgedParts = frames(forgedTransfer.bytes, forgedTransfer.header);
    expect(assemble(forgedTransfer.header, forgedParts).assembler.finish()).toBeNull();
  });

  it('非法 UTF-8 不会被解码', () => {
    const bytes = Uint8Array.of(0xff, 0xfe, 0xfd);
    const header: PushHeader = {
      kind: 'push',
      id: 't3',
      mode: 'full',
      entries: 0,
      bytes: bytes.length,
      chunks: 1,
      checksum: '0000000000000000',
    };
    const { assembler, steps } = assemble(header, frames(bytes, header));
    expect(steps).toEqual(['complete']);
    expect(assembler.finish()).toBeNull();
  });
});
