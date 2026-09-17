// Tambah Setoran — logs one new setoran submission (a giling + batil pair,
// the tray barcodes scanned for them, and any bad/waste count) against an
// existing SKT Header. Opened from the "+ Tambah Setoran" button at the
// bottom of SKTHeaderDetailScreen.
//
// Rendered as its own full-screen native Modal (not a bottom sheet, unlike
// DetailMejaModal) since the reference design is a dedicated screen with
// its own top bar — closer to AbsensiScanScreenCamera's full-takeover shape
// than to a dialog. Scanning (Pekerja Giling / Batil / Barcode Tray) all
// reuse the same "hide this modal, navigate to AbsensiScan, reopen once it
// resolves" pattern SKTHeaderDetailScreen already uses for TambahPekerjaModal
// — this component doesn't call navigation.navigate itself, the parent does
// (via onPressScanGiling/Batil/Tray) and hands the result back through the
// scannedGiling/scannedBatil/scannedTrayCode props.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { MasterPekerja, MejaGroup, PekerjaRow } from '../../../services/pekerja';
import { BarcodeTrayRow, SetoranWorker } from '../../../services/skt';
import { resolveBarcodeTray, SubmitSetoranPayload } from '../../../services/API/sktApi';
import { isNumericCode } from '../../../utils/pekerjaRole';
import { computePairSetoranKe } from '../../../utils/mejaGrouping';

// Reshapes a meja roster row into the MasterPekerja shape giling/batil
// state expects — same idea as SKTHeaderDetailScreen's workerToPekerjaStub,
// but for a manually-picked-from-the-roster seat instead of an existing
// setoran row. `id` here is the seat's skt_log_pekerja_id, not a
// skt_master_pekerja.id — fine, since a manual pick is submitted the same
// way a scan result is (masterPekerjaId is carried through as-is either
// way, see handleSubmit's payload below). active/isTraining/brakId have no
// equivalent on PekerjaRow, filled with harmless defaults to satisfy the
// type.
function pekerjaRowToMasterPekerja(p: PekerjaRow): MasterPekerja {
  return {
    id: p.id,
    nomorAbsen: p.nomorAbsen,
    nik: p.nik,
    namaPekerja: p.namaPekerja,
    detailPekerja: p.detailPekerja,
    active: true,
    isTraining: false,
    brakId: 0,
  };
}

// A roster seat tagged with which meja it belongs to — what `allPekerja`
// (and therefore gilingCandidates/batilCandidates) below is built from,
// once every meja's roster is flattened into a single header-wide pool.
type PekerjaWithMeja = PekerjaRow & { nomorMeja: number };

interface TambahSetoranModalProps {
  visible: boolean;
  onClose: () => void;
  sktHeaderId: number;
  brand: string;
  jenisLabel: string;
  brakLabel: string; // e.g. "Djinggo"
  // Which meja this setoran belongs to. In edit mode this is the pair's
  // fixed, immutable meja (re-scanning/re-picking is disabled — see
  // isEditing below). For a fresh add it's null: there is no meja to show
  // yet, since Pekerja Giling/Batil are now picked from every worker on
  // this SKT header (see mejaGroups below), not from one pre-chosen meja's
  // roster — the meja is only known, and the "Meja" field only populated,
  // once the admin actually picks (or scans) a Giling or Batil. See
  // `resolvedMeja` below for where that derived value lives.
  nomorMeja: number | null;
  // Every meja's roster (who's seated where, and as which kode) for this
  // whole SKT header — this is now the FULL candidate pool for Pekerja
  // Giling/Batil (both the manual "Pilih Pekerja" dropdowns and a scan),
  // not just whichever meja happens to be active elsewhere on screen. A
  // pick is only accepted in the role its own seat holds there (numeric
  // kode = Giling, alpha kode = Batil), and — once the OTHER side is
  // already picked — only if it's seated at that same meja (a setoran's
  // Giling and Batil must come from one meja, see the cross-meja checks
  // below).
  mejaGroups: MejaGroup[];
  // Provisional "Setoran ke" used as-is in edit mode, where the pair can't
  // change (re-scanning is disabled — see isEditing below) so the original
  // number is simply kept. Null for a fresh add: like nomorMeja above,
  // there's nothing real to show until both Giling and Batil are picked
  // and their shared meja is known (see computePairSetoranKe below).
  setoranKe: number | null;
  // Every existing setoran row (all meja, not just `nomorMeja`) — used to
  // recompute the real, pair-scoped "Setoran ke" (see computePairSetoranKe
  // in utils/mejaGrouping.ts) live as soon as both Giling and Batil are
  // picked in the add flow. Not consulted in edit mode.
  workers: SetoranWorker[];
  isSubmitting?: boolean;
  onSubmit: (payload: SubmitSetoranPayload) => void;
  // Edit-mode hook: pass the two existing skt_log_pekerja ids to show
  // Hapus, and (see initialGiling/initialBatil/initialBarcodeTrays/
  // initialBadWaste below) to pre-fill the rest of the form. Wired up from
  // SKTHeaderDetailScreen's handleEditSetoran, triggered by tapping a List
  // Setoran card.
  existingSetoranId?: { gilingId: number; batilId: number } | null;
  onDelete?: () => void;
  // Edit-mode pre-fill — the giling/batil already on this submission,
  // its already-scanned tray rows, and its current Bad/Waste count.
  // Consumed once, as each field's useState initial value (see the "no
  // reset on `visible`" note below for why this can't be a plain effect) —
  // the parent bumps `key` to remount this component for both a fresh
  // "+ Tambah Setoran" AND an edit open, so these are only ever read at
  // mount. Omitted (or left undefined) for the ordinary add flow.
  initialGiling?: MasterPekerja | null;
  initialBatil?: MasterPekerja | null;
  // The exact seat kode ("1"/"2"/"3" for Giling, "A"/"B" for Batil) each
  // side actually held on the original submission — carried alongside
  // initialGiling/initialBatil so editing (where re-scanning is disabled)
  // still submits the pair's real kode instead of losing track of it.
  // Not rendered anywhere — see the same field on SetoranWorker in skt.ts.
  initialGilingKode?: string | null;
  initialBatilKode?: string | null;
  initialBarcodeTrays?: BarcodeTrayRow[];
  initialBadWaste?: number;
  onPressScanGiling: () => void;
  onPressScanBatil: () => void;
  onPressScanTray: () => void;
  scannedGiling?: MasterPekerja | null;
  scannedBatil?: MasterPekerja | null;
  scannedTrayCode?: string | null;
  // Bumped by the parent on every single tray scan resolution, even ones
  // that hand back the exact same code as before. Needed because
  // scannedTrayCode alone can't be trusted to *change* on a repeat scan of
  // the same tray (React bails out of a setState that reuses the same
  // primitive value, so a same-code rescan wouldn't otherwise re-trigger
  // the duplicate-check effect below) — see its usage in the tray useEffect.
  scannedTrayToken?: number;
}

export default function TambahSetoranModal({
  visible,
  onClose,
  sktHeaderId,
  brand,
  jenisLabel,
  brakLabel,
  nomorMeja,
  mejaGroups,
  setoranKe,
  workers,
  isSubmitting = false,
  onSubmit,
  existingSetoranId = null,
  onDelete,
  initialGiling = null,
  initialBatil = null,
  initialGilingKode = null,
  initialBatilKode = null,
  initialBarcodeTrays = [],
  initialBadWaste = 0,
  onPressScanGiling,
  onPressScanBatil,
  onPressScanTray,
  scannedGiling,
  scannedBatil,
  scannedTrayCode,
  scannedTrayToken,
}: TambahSetoranModalProps) {
  const isEditing = !!existingSetoranId;

  const [giling, setGiling] = useState<MasterPekerja | null>(initialGiling);
  const [batil, setBatil] = useState<MasterPekerja | null>(initialBatil);
  // The specific seat kode each side resolved to — set alongside
  // giling/batil whenever a scan validates (see the scannedGiling/
  // scannedBatil effects below), since the same MasterPekerja can hold
  // different kode at different meja (or even two kode at the SAME meja,
  // dual-role) — kode isn't intrinsic to the pekerja, only to this scan.
  const [gilingKode, setGilingKode] = useState<string | null>(initialGilingKode);
  const [batilKode, setBatilKode] = useState<string | null>(initialBatilKode);
  // The "Pilih Pekerja" search box text for each side — mirrors
  // TambahPekerjaModal's searchQuery, but there's no separate Kode Pekerja
  // step here: which list a name is picked from (gilingCandidates vs
  // batilCandidates below) already fixes the role. Kept in sync with
  // giling/batil (set together on a scan, a manual pick, or a meja change)
  // so the box always reflects whoever's actually selected right now.
  const [gilingQuery, setGilingQuery] = useState(initialGiling?.namaPekerja ?? '');
  const [batilQuery, setBatilQuery] = useState(initialBatil?.namaPekerja ?? '');
  const [isGilingDropdownOpen, setIsGilingDropdownOpen] = useState(false);
  const [isBatilDropdownOpen, setIsBatilDropdownOpen] = useState(false);
  const [barcodeTrays, setBarcodeTrays] = useState<BarcodeTrayRow[]>(initialBarcodeTrays);
  const [badWaste, setBadWaste] = useState(initialBadWaste);
  const [isResolvingTray, setIsResolvingTray] = useState(false);
  // The meja a fresh add's pick(s) resolved to — null (nothing to show yet)
  // until a Giling or Batil is actually picked (manually or via scan). Once
  // one side sets this, the other side is validated against it (see the
  // scannedGiling/scannedBatil effects and handleSelectGiling/Batil below)
  // instead of being free to come from anywhere. Seeded from `nomorMeja` for
  // edit mode, where it's fixed and never changes.
  const [resolvedMeja, setResolvedMeja] = useState<number | null>(nomorMeja);

  // The real "Setoran ke" for THIS pair, recomputed live once both Giling
  // and Batil (and therefore `resolvedMeja`) are picked (see
  // computePairSetoranKe in utils/mejaGrouping.ts — it's scoped to this
  // exact two-person pair, not the whole meja). Null (nothing to show) until
  // then, and never recomputed in edit mode — re-scanning is disabled
  // there, so the pair (and therefore its number) can't change; the
  // original `setoranKe` is kept as-is.
  const displaySetoranKe = useMemo<number | null>(() => {
    if (isEditing) return setoranKe;
    if (!giling || !batil || resolvedMeja === null) return null;
    return computePairSetoranKe(workers, resolvedMeja, giling, batil);
  }, [isEditing, giling, batil, resolvedMeja, workers, setoranKe]);

  // Rendered in-tree instead of Alert.alert — same reasoning as
  // TambahPekerjaModal's errorMessage overlay: this dialog is its own
  // native <Modal>, and Alert.alert opens a separate native OS dialog
  // window that isn't guaranteed to stack above it. An in-tree overlay
  // stacks exactly like the rest of this component, so it always renders
  // in front.
  const [scanError, setScanError] = useState<{ title: string; message: string } | null>(null);

  // Every meja's roster flattened into one list, each row tagged with the
  // meja it's actually seated at — this (not any single meja's roster) is
  // now the full candidate pool for both "Pilih Pekerja" dropdowns below.
  // Picking a name no longer requires already knowing/choosing its meja
  // first; the meja is discovered FROM the pick (see resolvedMeja above).
  const allPekerja = useMemo(
    () => mejaGroups.flatMap((g) => g.pekerja.map((p) => ({ ...p, nomorMeja: g.nomorMeja }))),
    [mejaGroups]
  );

  // Manual-pick candidates for each field — every seat on this header
  // holding the matching role (numeric kode = Giling, alpha kode = Batil),
  // filtered further by whatever's typed in that field's search box. This
  // is the "don't need to pick any role" part of the manual flow: which
  // list a name can even appear in already fixes it as Giling or Batil, so
  // there's no separate Kode Pekerja step like Tambah Pekerja has. A
  // dual-role pekerja (holding both a numeric and an alpha kode at the same
  // meja) legitimately shows up in both lists.
  //
  // Meja-filtered ONLY once `resolvedMeja` is actually known — i.e. once
  // the OTHER side has already been picked (or, in edit mode, always).
  // Nothing's picked yet, both lists show every meja's candidates (that's
  // the "everyone on this header" starting point); the moment one side
  // locks in a meja, the other side's list narrows down to just that
  // meja's seats — e.g. pick Jumroh as Giling at Meja 1, and the Batil list
  // then only shows Meja 1's Batil-role seats, not every meja's.
  const gilingCandidates = useMemo(() => {
    const query = gilingQuery.trim().toLowerCase();
    return allPekerja.filter(
      (p) =>
        isNumericCode(p.kode) &&
        (resolvedMeja === null || p.nomorMeja === resolvedMeja) &&
        (!query || p.namaPekerja.toLowerCase().includes(query))
    );
  }, [allPekerja, gilingQuery, resolvedMeja]);
  const batilCandidates = useMemo(() => {
    const query = batilQuery.trim().toLowerCase();
    return allPekerja.filter(
      (p) =>
        !isNumericCode(p.kode) &&
        (resolvedMeja === null || p.nomorMeja === resolvedMeja) &&
        (!query || p.namaPekerja.toLowerCase().includes(query))
    );
  }, [allPekerja, batilQuery, resolvedMeja]);

  // NOTE: there's deliberately no "reset on `visible`" effect here anymore.
  // This component never actually unmounts between scans — hiding it just
  // toggles the native <Modal visible={...}> off while AbsensiScan is up,
  // then flips it back on once a scan resolves — and Giling/Batil/Barcode
  // Tray scans ALL hide-then-reshow this same dialog. A `visible`-keyed
  // reset would fire after EVERY one of those scans, wiping out whatever
  // was already filled in (e.g. Batil clearing the Giling you'd just
  // scanned, or a new tray silently erasing the ones scanned before it).
  // The real "this is a fresh dialog" signal is the parent remounting this
  // component via a bumped `key` prop on "+ Tambah Setoran" — see
  // SKTHeaderDetailScreen — which re-initializes every useState above for
  // free, without touching state across a scan's hide/reshow round trip.

  // Pick up a freshly scanned giling pekerja handed back from AbsensiScan.
  // Only accepted if they're actually seated SOMEWHERE on this header AND
  // hold the Giling (numeric) kode there — anyone else is rejected
  // outright. Note there's deliberately no "already picked as Batil" guard
  // here: a pekerja can hold BOTH a Giling and a Batil kode at the same
  // meja (see TambahPekerjaModal's dual-role rule), so the same pekerja
  // legitimately filling both slots in one setoran is the correct outcome,
  // not an error — the seat check below (via `.filter()` across every row
  // matching this pekerja's `detailPekerja`, not just the first match) is
  // what actually decides eligibility. If Batil is already picked, this
  // scan additionally has to land on that SAME meja — a setoran's pair
  // can't span two different meja (cross-meja check).
  useEffect(() => {
    if (!scannedGiling) return;
    const seatsForPekerja = allPekerja.filter(
      (p) => p.detailPekerja === scannedGiling.detailPekerja
    );
    if (seatsForPekerja.length === 0) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedGiling.namaPekerja} tidak terdaftar di meja manapun.`,
      });
      return;
    }
    const gilingSeat = seatsForPekerja.find((p) => isNumericCode(p.kode));
    if (!gilingSeat) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedGiling.namaPekerja} terdaftar sebagai Batil di Meja ${seatsForPekerja[0].nomorMeja}, bukan Giling.`,
      });
      return;
    }
    if (resolvedMeja !== null && gilingSeat.nomorMeja !== resolvedMeja) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedGiling.namaPekerja} terdaftar di Meja ${gilingSeat.nomorMeja}, sedangkan Batil yang sudah dipilih ada di Meja ${resolvedMeja}. Giling dan Batil harus berasal dari meja yang sama.`,
      });
      return;
    }
    setGiling(scannedGiling);
    // The actual seat kode ("1"/"2"/"3") this scan resolved to — see
    // SetoranPekerjaInput.kode in sktApi.ts for why this matters (a
    // hardcoded '1' would silently mislabel anyone not in the first seat).
    setGilingKode(gilingSeat.kode);
    // Keeps the manual "Pilih Pekerja" box in sync with a scan result too
    // — same field either way, so a scan should look exactly like picking
    // that name from the list.
    setGilingQuery(scannedGiling.namaPekerja);
    setIsGilingDropdownOpen(false);
    // Now known: this is the meja the whole setoran belongs to (see
    // resolvedMeja above) — populates the Meja/Setoran ke fields.
    setResolvedMeja(gilingSeat.nomorMeja);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedGiling]);

  // Pick up a freshly scanned batil pekerja handed back from AbsensiScan.
  // Only accepted if they're actually seated SOMEWHERE on this header AND
  // hold the Batil (alpha) kode there — anyone else is rejected outright.
  // Same dual-role reasoning as the Giling effect above: no "already picked
  // as Giling" guard, since the same pekerja can legitimately fill both
  // slots. groupWorkersByMeja sorts Giling (numeric) rows first, so a naive
  // `.find()` here would always land on their Giling row and wrongly
  // reject a dual-role pekerja's Batil scan — `.filter()` across every row
  // matching this pekerja's `detailPekerja` is what makes the check
  // correct. Same cross-meja check as the Giling effect above once Giling
  // is already picked.
  useEffect(() => {
    if (!scannedBatil) return;
    const seatsForPekerja = allPekerja.filter(
      (p) => p.detailPekerja === scannedBatil.detailPekerja
    );
    if (seatsForPekerja.length === 0) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedBatil.namaPekerja} tidak terdaftar di meja manapun.`,
      });
      return;
    }
    const batilSeat = seatsForPekerja.find((p) => !isNumericCode(p.kode));
    if (!batilSeat) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedBatil.namaPekerja} terdaftar sebagai Giling di Meja ${seatsForPekerja[0].nomorMeja}, bukan Batil.`,
      });
      return;
    }
    if (resolvedMeja !== null && batilSeat.nomorMeja !== resolvedMeja) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedBatil.namaPekerja} terdaftar di Meja ${batilSeat.nomorMeja}, sedangkan Giling yang sudah dipilih ada di Meja ${resolvedMeja}. Giling dan Batil harus berasal dari meja yang sama.`,
      });
      return;
    }
    setBatil(scannedBatil);
    setBatilKode(batilSeat.kode);
    setBatilQuery(scannedBatil.namaPekerja);
    setIsBatilDropdownOpen(false);
    setResolvedMeja(batilSeat.nomorMeja);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedBatil]);

  // Pick up a freshly scanned tray barcode and resolve it to a batang
  // count (see resolveBarcodeTray in sktApi.ts — placeholder until a real
  // master tray/batch table exists).
  //
  // A Nomor Tray already used earlier in THIS setoran is rejected outright
  // — one physical tray can't be counted twice toward the same submission.
  // The same Nomor Tray is fine again in a different Tambah Setoran
  // transaction: barcodeTrays always starts empty for a fresh transaction
  // (see the "no reset on `visible`" note above — a genuinely new dialog
  // comes from the parent's bumped `key`, which re-initializes this
  // useState for free), so this check only ever looks at trays already
  // scanned within the transaction currently open.
  //
  // Keyed on `scannedTrayToken`, not `scannedTrayCode` — the parent bumps
  // the token on every scan resolution, including a repeat scan of the
  // exact same code. Keying on the code alone would miss that case: React
  // bails out of a parent setState that reuses the same primitive string,
  // so re-scanning the same already-used tray back-to-back would silently
  // do nothing instead of showing "Nomor Tray Sudah Terpakai".
  useEffect(() => {
    if (!scannedTrayCode) return;
    if (barcodeTrays.some((t) => t.code === scannedTrayCode)) {
      setScanError({
        title: 'Nomor Tray Sudah Terpakai',
        message: `Nomor Tray ${scannedTrayCode} sudah discan di setoran ini. Nomor Tray yang sama masih bisa dipakai di transaksi Tambah Setoran lain.`,
      });
      return;
    }

    let isCancelled = false;
    setIsResolvingTray(true);
    resolveBarcodeTray(scannedTrayCode)
      .then((row) => {
        if (!isCancelled) setBarcodeTrays((prev) => [...prev, row]);
      })
      .catch(() => {
        if (!isCancelled) {
          setScanError({
            title: 'Gagal Membaca Barcode',
            message: `Barcode ${scannedTrayCode} tidak dikenali.`,
          });
        }
      })
      .finally(() => {
        if (!isCancelled) setIsResolvingTray(false);
      });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedTrayToken]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scanError) {
        setScanError(null);
      } else {
        onClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose, scanError]);

  const handleDeleteTray = (code: string) => {
    setBarcodeTrays((prev) => prev.filter((t) => t.code !== code));
  };

  // Manual alternative to the scan effects above. gilingCandidates/
  // batilCandidates are already meja-filtered once `resolvedMeja` is known
  // (see above), so in normal use `p` can only ever be from that same
  // meja — the cross-meja check here is belt-and-suspenders, same spirit
  // as the gilingKode/batilKode `!!` checks on canSubmit below, not an
  // expected extra gate in practice.
  const handleSelectGiling = (p: PekerjaWithMeja) => {
    if (resolvedMeja !== null && p.nomorMeja !== resolvedMeja) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${p.namaPekerja} terdaftar di Meja ${p.nomorMeja}, sedangkan Batil yang sudah dipilih ada di Meja ${resolvedMeja}. Giling dan Batil harus berasal dari meja yang sama.`,
      });
      return;
    }
    setGiling(pekerjaRowToMasterPekerja(p));
    setGilingKode(p.kode);
    setGilingQuery(p.namaPekerja);
    setIsGilingDropdownOpen(false);
    setResolvedMeja(p.nomorMeja);
  };
  const handleSelectBatil = (p: PekerjaWithMeja) => {
    if (resolvedMeja !== null && p.nomorMeja !== resolvedMeja) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${p.namaPekerja} terdaftar di Meja ${p.nomorMeja}, sedangkan Giling yang sudah dipilih ada di Meja ${resolvedMeja}. Giling dan Batil harus berasal dari meja yang sama.`,
      });
      return;
    }
    setBatil(pekerjaRowToMasterPekerja(p));
    setBatilKode(p.kode);
    setBatilQuery(p.namaPekerja);
    setIsBatilDropdownOpen(false);
    setResolvedMeja(p.nomorMeja);
  };

  // Typing clears whatever was picked (scanned or selected) — same rule as
  // TambahPekerjaModal's search box: the old pick no longer matches what's
  // in the box, so it has to be re-picked from the (now re-filtered) list.
  // Also releases `resolvedMeja` back to unknown once NEITHER side is
  // picked anymore — but only then: if the other side is still picked, its
  // meja still stands and the cleared side just needs to be re-picked
  // there.
  const handleGilingQueryChange = (text: string) => {
    setGilingQuery(text);
    setGiling(null);
    setGilingKode(null);
    setIsGilingDropdownOpen(true);
    if (!batil) setResolvedMeja(null);
  };
  const handleBatilQueryChange = (text: string) => {
    setBatilQuery(text);
    setBatil(null);
    setBatilKode(null);
    setIsBatilDropdownOpen(true);
    if (!giling) setResolvedMeja(null);
  };

  const totalBatang = barcodeTrays.reduce((sum, t) => sum + t.batang, 0);
  // gilingKode/batilKode are always set in the same effect that sets
  // giling/batil (see the scannedGiling/scannedBatil effects above, and
  // initialGilingKode/initialBatilKode for edit mode) — the `!!` checks
  // here are belt-and-suspenders, not an expected extra gate in practice.
  // resolvedMeja is always set alongside them too (same effects/handlers),
  // so its own check is the same kind of belt-and-suspenders.
  const canSubmit =
    !!giling &&
    !!gilingKode &&
    !!batil &&
    !!batilKode &&
    resolvedMeja !== null &&
    barcodeTrays.length > 0 &&
    !isSubmitting;

  const handleSubmit = () => {
    if (!giling || !gilingKode || !batil || !batilKode || resolvedMeja === null) return;
    // Belt-and-suspenders alongside canSubmit disabling the button below —
    // every setoran must carry at least one Nomor Tray, so this can never
    // go through with an empty barcodeTrays list.
    if (barcodeTrays.length === 0) {
      setScanError({
        title: 'Nomor Tray Belum Discan',
        message: 'Setoran harus memiliki minimal satu Nomor Tray sebelum disimpan.',
      });
      return;
    }
    onSubmit({
      sktHeaderId,
      nomorMeja: resolvedMeja,
      // displaySetoranKe is only ever null when giling/batil/resolvedMeja
      // aren't all set yet (see its useMemo above) — canSubmit already
      // guards on exactly that, so it's guaranteed a real number here.
      setoranKe: displaySetoranKe as number,
      giling: {
        masterPekerjaId: giling.id,
        nik: giling.nik,
        namaPekerja: giling.namaPekerja,
        nomorAbsen: giling.nomorAbsen,
        kode: gilingKode,
        role: 'giling',
      },
      batil: {
        masterPekerjaId: batil.id,
        nik: batil.nik,
        namaPekerja: batil.namaPekerja,
        nomorAbsen: batil.nomorAbsen,
        kode: batilKode,
        role: 'batil',
      },
      barcodeTrays,
      badWaste,
    });
  };

  const handleHapus = () => {
    if (!onDelete) return;
    Alert.alert('Hapus Setoran', 'Yakin ingin menghapus setoran ini?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{isEditing ? 'Edit Setoran' : 'Tambah Setoran'}</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.topRow}>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Brand</Text>
                  <Text style={styles.infoValue}>{brand}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Jenis</Text>
                  <Text style={styles.infoValue}>{jenisLabel}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Brak</Text>
                  <Text style={styles.infoValue}>{brakLabel}</Text>
                </View>
              </View>
            </View>

            {existingSetoranId && (
              <TouchableOpacity style={styles.hapusButton} onPress={handleHapus} activeOpacity={0.85}>
                <Text style={styles.hapusButtonText}>Hapus</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Pekerja Giling — scan OR pick manually from gilingCandidates
              (every Giling-role seat on this whole header, no separate role
              step like Tambah Pekerja's Kode Pekerja — see gilingCandidates
              above). Re-picking/re-scanning would swap the worker on an
              already-saved submission, so both are disabled in edit mode
              rather than removed (keeps the row's layout/labels consistent
              with the add flow). */}
          <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Pekerja Giling</Text>
          <View style={styles.pilihPekerjaBox}>
            <TextInput
              style={styles.searchInput}
              value={gilingQuery}
              onChangeText={handleGilingQueryChange}
              onFocus={() => setIsGilingDropdownOpen(true)}
              placeholder="Cari atau pilih pekerja giling..."
              placeholderTextColor="#98A2B3"
              editable={!isEditing}
            />
            <TouchableOpacity
              style={[styles.scanButton, isEditing && styles.scanButtonDisabled]}
              onPress={onPressScanGiling}
              activeOpacity={0.8}
              disabled={isEditing}
            >
              <Text style={styles.scanButtonText}>📷 Scan</Text>
            </TouchableOpacity>
          </View>
          {isGilingDropdownOpen && !isEditing && (
            <View style={styles.dropdown}>
              {gilingCandidates.length === 0 ? (
                <Text style={styles.dropdownEmptyText}>
                  {resolvedMeja !== null
                    ? `Tidak ada Pekerja Giling di Meja ${resolvedMeja}`
                    : 'Tidak ada Pekerja Giling ditemukan'}
                </Text>
              ) : (
                gilingCandidates.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.dropdownItem}
                    onPress={() => handleSelectGiling(p)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownItemName} numberOfLines={1}>
                      {p.namaPekerja}
                    </Text>
                    {/* Meja shown up front here — with candidates no longer
                        filtered to one meja, this is what lets the admin
                        actually tell apart, say, two "Andi"s seated at
                        different tables before picking one. */}
                    <Text style={styles.dropdownItemNik}>
                      {p.nik} · Meja {p.nomorMeja}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Pekerja Batil</Text>
          <View style={styles.pilihPekerjaBox}>
            <TextInput
              style={styles.searchInput}
              value={batilQuery}
              onChangeText={handleBatilQueryChange}
              onFocus={() => setIsBatilDropdownOpen(true)}
              placeholder="Cari atau pilih pekerja batil..."
              placeholderTextColor="#98A2B3"
              editable={!isEditing}
            />
            <TouchableOpacity
              style={[styles.scanButton, isEditing && styles.scanButtonDisabled]}
              onPress={onPressScanBatil}
              activeOpacity={0.8}
              disabled={isEditing}
            >
              <Text style={styles.scanButtonText}>📷 Scan</Text>
            </TouchableOpacity>
          </View>
          {isBatilDropdownOpen && !isEditing && (
            <View style={styles.dropdown}>
              {batilCandidates.length === 0 ? (
                <Text style={styles.dropdownEmptyText}>
                  {resolvedMeja !== null
                    ? `Tidak ada Pekerja Batil di Meja ${resolvedMeja}`
                    : 'Tidak ada Pekerja Batil ditemukan'}
                </Text>
              ) : (
                batilCandidates.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.dropdownItem}
                    onPress={() => handleSelectBatil(p)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownItemName} numberOfLines={1}>
                      {p.namaPekerja}
                    </Text>
                    <Text style={styles.dropdownItemNik}>
                      {p.nik} · Meja {p.nomorMeja}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Meja/Setoran ke are no longer admin-chosen — both are purely
              derived from whichever Giling/Batil ends up picked above (see
              resolvedMeja/displaySetoranKe), so they render as plain
              read-only boxes, blank ("—") until that happens. */}
          <View style={[styles.twoCol, styles.fieldSpacing]}>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Meja</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyValue}>{resolvedMeja ?? '—'}</Text>
              </View>
            </View>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Setoran ke</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyValue}>{displaySetoranKe ?? '—'}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.sectionHead, styles.fieldSpacing]}>
            <Text style={styles.fieldLabel}>Barcode Tray</Text>
            <TouchableOpacity
              style={styles.scanToAddButton}
              onPress={onPressScanTray}
              activeOpacity={0.8}
              disabled={isResolvingTray}
            >
              {isResolvingTray ? (
                <ActivityIndicator size="small" color="#2F5FD1" />
              ) : (
                <Text style={styles.scanToAddButtonText}>+ Scan to Add</Text>
              )}
            </TouchableOpacity>
          </View>

          {barcodeTrays.length > 0 && (
            <View style={styles.trayCard}>
              <View style={styles.trayHeaderRow}>
                <Text style={[styles.trayHeaderText, styles.trayColCode]}>Code</Text>
                <Text style={[styles.trayHeaderText, styles.trayColBatang]}>Batang</Text>
                <Text style={[styles.trayHeaderText, styles.trayColAct]}>Act</Text>
              </View>
              {barcodeTrays.map((tray) => (
                <View key={tray.code} style={styles.trayRow}>
                  <Text style={[styles.trayCellCode, styles.trayColCode]}>{tray.code}</Text>
                  <Text style={[styles.trayCellBatang, styles.trayColBatang]}>{tray.batang}</Text>
                  <TouchableOpacity
                    style={styles.trayColAct}
                    onPress={() => handleDeleteTray(tray.code)}
                    accessibilityLabel={`Hapus tray ${tray.code}`}
                  >
                    <Text style={styles.trayDeleteIcon}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.traySummary}>
            <Text style={styles.traySummaryText}>
              {barcodeTrays.length} Barcode Tray - {totalBatang} Batang
            </Text>
          </View>

          <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Bad / Waste</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setBadWaste((v) => Math.max(0, v - 1))}
              activeOpacity={0.8}
              accessibilityLabel="Kurangi Bad / Waste"
            >
              <Text style={styles.stepperButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{badWaste}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setBadWaste((v) => v + 1)}
              activeOpacity={0.8}
              accessibilityLabel="Tambah Bad / Waste"
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.stepperUnit}>Btg</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>{isEditing ? 'Simpan' : 'Submit'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {scanError && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorBox}>
              <View style={styles.errorIconCircle}>
                <Text style={styles.errorIconText}>✕</Text>
              </View>
              <Text style={styles.errorTitle}>{scanError.title}</Text>
              <Text style={styles.errorSubtitle}>{scanError.message}</Text>
              <TouchableOpacity
                style={styles.errorButton}
                onPress={() => setScanError(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.errorButtonText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  // Matches the "Pekerja Tidak Ditemukan" card from AbsensiScanScreenCamera
  // — icon circle + bold title + gray subtitle + full-width pill button —
  // rendered as an in-tree overlay (see the `scanError` state comment
  // above) rather than Alert.alert.
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 24, 40, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorBox: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorIconText: { fontSize: 24, color: '#D92D20', fontWeight: '700' },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 13,
    color: '#667085',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  errorButton: {
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
  },
  errorButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2F5FD1',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 16,
  },
  backIcon: { color: '#FFFFFF', fontSize: 20 },
  topBarTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { flexShrink: 1, paddingRight: 6 },
  infoLabel: { fontSize: 10, color: '#98A2B3', marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#101828' },
  hapusButton: {
    backgroundColor: '#D92D20',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hapusButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#101828' },
  fieldSpacing: { marginTop: 20, marginBottom: 8 },
  // "Pilih Pekerja" box for Pekerja Giling/Batil — same shape as
  // TambahPekerjaModal's pilihPekerjaBox (search input + inline Scan
  // button), just with "Scan" instead of "⌕ Scan" since this one still
  // needs to stay visually distinct as the camera-scan trigger, not a
  // dropdown-open toggle.
  pilihPekerjaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF1F5',
    borderRadius: 10,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchInput: { flex: 1, fontSize: 12, fontWeight: '700', color: '#101828', paddingVertical: 4 },
  dropdown: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    maxHeight: 176,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
  },
  dropdownItemName: { fontSize: 12, fontWeight: '600', color: '#101828', flex: 1, marginRight: 8 },
  dropdownItemNik: { fontSize: 11, color: '#98A2B3' },
  dropdownEmptyText: { fontSize: 11, color: '#98A2B3', padding: 12, textAlign: 'center' },
  scanButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2F5FD1',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  scanButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  scanButtonDisabled: { backgroundColor: '#B0C4EF' },

  twoCol: { flexDirection: 'row', gap: 12 },
  twoColItem: { flex: 1 },
  readonlyBox: {
    marginTop: 8,
    backgroundColor: '#EEF1F5',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  readonlyValue: { fontSize: 15, fontWeight: '700', color: '#101828' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanToAddButton: {
    borderWidth: 1.4,
    borderColor: '#2F5FD1',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  scanToAddButtonText: { color: '#2F5FD1', fontSize: 11, fontWeight: '700' },

  trayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF1F5',
    paddingHorizontal: 14,
    paddingTop: 10,
    marginTop: 10,
  },
  trayHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    paddingBottom: 8,
  },
  trayHeaderText: { fontSize: 10, color: '#98A2B3', fontWeight: '600' },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  trayColCode: { flex: 1 },
  trayColBatang: { flex: 1 },
  trayColAct: { flex: 0.6, alignItems: 'flex-end' },
  trayCellCode: { fontSize: 12, fontWeight: '600', color: '#101828' },
  trayCellBatang: { fontSize: 12, color: '#344054' },
  trayDeleteIcon: { fontSize: 13 },

  traySummary: {
    marginTop: 10,
    backgroundColor: '#EAF0FF',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  traySummaryText: { color: '#2F5FD1', fontSize: 12, fontWeight: '700' },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF1F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2F5FD1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', lineHeight: 19 },
  stepperValue: { fontSize: 17, fontWeight: '700', color: '#101828' },
  stepperUnit: { fontSize: 12, color: '#667085', fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: '#F7F8FA',
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1.4,
    borderColor: '#D92D20',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#D92D20', fontWeight: '700', fontSize: 14 },
  submitButton: {
    flex: 1.3,
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#B0C4EF' },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
