// Every kode a meja seat can hold splits into exactly two roles: numeric
// ("1"/"2"/"3") is Giling, alpha ("A"/"B") is Batil. Shared by
// TambahPekerjaModal (which role is still open at a meja) and
// TambahSetoranModal (which role a scanned pekerja actually holds there).
export function isNumericCode(code: string): boolean {
  return /^[0-9]+$/.test(code);
}

export function isGilingCode(code: string): boolean {
  return isNumericCode(code);
}

export function isBatilCode(code: string): boolean {
  return !isNumericCode(code);
}
