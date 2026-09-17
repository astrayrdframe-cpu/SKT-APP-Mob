// Removes rows sharing the same id, keeping the FIRST occurrence. Applied
// right after every raw ORDS fetch (skt_header, skt_view,
// skt_master_pekerja, skt/test_temp — see sktApi.ts and pekerjaApi.ts) so a
// dirty view/join on the backend, or a pagination overlap in
// fetchAllOrdsRows, never surfaces downstream as duplicate cards/rows —
// duplicate SKT Header entries on the Dashboard list, duplicate pekerja
// rows in Detail Meja, or duplicate cards in List Setoran — after the
// admin taps "Get Data".
//
// Deliberately a plain "first wins" rule, not a merge — ORDS rows for the
// same id are expected to be byte-identical duplicates (a join fan-out or
// an overlapping page), not two genuinely different versions of the same
// record that need reconciling.
export function dedupeById<T>(rows: T[], getId: (row: T) => number | string): T[] {
  const seen = new Set<number | string>();
  const result: T[] = [];
  for (const row of rows) {
    const id = getId(row);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(row);
  }
  return result;
}
