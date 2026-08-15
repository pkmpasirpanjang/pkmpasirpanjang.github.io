// ============================================================
// EXPORT EXCEL — unduh rekap Kehadiran/Apel/Kegiatan Luar (.xlsx)
// ============================================================

// ============================================================
// EXPORT EXCEL
// ============================================================
let exportJenisTerpilih = null; // "absen" | "apel" | "kegiatan"

function setupExportMenu() {
  document.getElementById("exportToggleBtn").addEventListener("click", () => {
    document.getElementById("exportChoices").classList.toggle("hidden");
  });

  document.querySelectorAll(".export-choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      exportJenisTerpilih = btn.dataset.jenis;
      document.getElementById("exportChoices").classList.add("hidden");

      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
      const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
      document.getElementById("exportDari").value = firstOfMonth;
      document.getElementById("exportSampai").value = todayStr;

      const judulMap = { absen: "Unduh Rekap Kehadiran", apel: "Unduh Rekap Apel", kegiatan: "Unduh Rekap Kegiatan Luar" };
      document.getElementById("exportModalTitle").textContent = judulMap[exportJenisTerpilih];
      updateExportSummary();
      showModal("exportDateModal");
    });
  });

  document.getElementById("exportDari").addEventListener("change", updateExportSummary);
  document.getElementById("exportSampai").addEventListener("change", updateExportSummary);

  document.getElementById("exportDownloadBtn").addEventListener("click", async () => {
    const dari = document.getElementById("exportDari").value;
    const sampai = document.getElementById("exportSampai").value;
    if (!dari || !sampai || dari > sampai) {
      showToast("Pilih rentang tanggal yang valid dulu.", true);
      return;
    }
    const btn = document.getElementById("exportDownloadBtn");
    const teksAsli = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Menyiapkan data...";
    try {
      // Pastikan semua bulan dalam rentang yang diminta sudah dimuat lengkap -
      // rentang laporan bisa mencakup bulan-bulan yang belum pernah dibuka user
      // di kalender/statistik, jadi datanya belum tentu sudah ada di state.data.
      await ensureMonthsLoaded(monthKeysInRange(dari, sampai));
      btn.textContent = "Membuat file...";
      if (exportJenisTerpilih === "absen") await exportKehadiranExcel(dari, sampai);
      else if (exportJenisTerpilih === "apel") await exportApelExcel(dari, sampai);
      else if (exportJenisTerpilih === "kegiatan") await exportKegiatanExcel(dari, sampai);
      hideModal("exportDateModal");
      showToast("Rekap berhasil diunduh.");
    } catch (err) {
      showToast("Gagal membuat file Excel: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = teksAsli;
    }
  });
}

function updateExportSummary() {
  const dari = document.getElementById("exportDari").value;
  const sampai = document.getElementById("exportSampai").value;
  const el = document.getElementById("exportSummary");
  if (!dari || !sampai) { el.textContent = ""; return; }
  if (sampai < dari) { el.textContent = "Tanggal selesai tidak boleh sebelum tanggal mulai."; return; }
  el.textContent = judulPeriode(dari, sampai);
}

// "BULAN: JULI 2026" kalau rentangnya pas 1 bulan penuh, atau "PERIODE: ..." kalau custom
function judulPeriode(dari, sampai) {
  const [y1, m1, d1] = dari.split("-").map(Number);
  const [y2, m2, d2] = sampai.split("-").map(Number);
  const lastDayBulan1 = new Date(y1, m1, 0).getDate();
  const isSatuBulanPenuh = (d1 === 1 && y1 === y2 && m1 === m2 && d2 === lastDayBulan1);
  if (isSatuBulanPenuh) return `BULAN: ${BULAN_ID[m1 - 1].toUpperCase()} ${y1}`;
  if (y1 === y2 && m1 === m2) return `PERIODE: ${d1}-${d2} ${BULAN_ID[m1 - 1].toUpperCase()} ${y1}`;
  return `PERIODE: ${d1} ${BULAN_ID[m1 - 1].toUpperCase()} ${y1} - ${d2} ${BULAN_ID[m2 - 1].toUpperCase()} ${y2}`;
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupJudulSheet(sheet, judulUtama, kolomTerakhir) {
  sheet.mergeCells(1, 1, 1, kolomTerakhir);
  sheet.getCell(1, 1).value = judulUtama;
  sheet.mergeCells(2, 1, 2, kolomTerakhir);
  sheet.getCell(2, 1).value = CONFIG.NAMA_INSTANSI_BARIS2.toUpperCase();
  sheet.mergeCells(3, 1, 3, kolomTerakhir);
  [1, 2, 3].forEach(r => {
    const cell = sheet.getCell(r, 1);
    cell.font = { bold: true, size: r === 1 ? 14 : 12 };
    cell.alignment = { horizontal: "center" };
  });
}

function styleHeaderRow(row) {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  });
}

function beriGarisTabel(sheet, dariBaris, sampaiBaris, jumlahKolom) {
  for (let r = dariBaris; r <= sampaiBaris; r++) {
    for (let c = 1; c <= jumlahKolom; c++) {
      sheet.getCell(r, c).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    }
  }
}

// ---------------- REKAP KEHADIRAN ----------------
async function exportKehadiranExcel(dari, sampai) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Kehadiran");
  const kolom = ["No", "Nama", "NIP", "Hadir", "Persentase Kehadiran", "Sakit", "Ijin", "Cuti", "Tanpa Berita", "Keterangan (Tanggal)"];
  sheet.columns = [6, 30, 20, 8, 12, 8, 8, 8, 12, 40].map(w => ({ width: w }));

  setupJudulSheet(sheet, "REKAPAN DAFTAR HADIR", kolom.length);
  sheet.mergeCells(4, 1, 4, kolom.length);
  sheet.getCell(4, 1).value = judulPeriode(dari, sampai);
  sheet.getCell(4, 1).font = { bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center" };

  sheet.getCell(5, 1).value = "JUMLAH HARI KERJA";
  sheet.getCell(5, 1).font = { bold: true };
  sheet.getCell(5, 2).value = countWorkingDaysInRange(dari, sampai);
  sheet.getCell(5, 2).font = { bold: true };

  const headerRowIdx = 7;
  const headerRow = sheet.getRow(headerRowIdx);
  kolom.forEach((k, i) => { headerRow.getCell(i + 1).value = k; });
  styleHeaderRow(headerRow);

  let baris = headerRowIdx + 1;
  let no = 1;
  state.data.pegawai.forEach(p => {
    const rentang = hitungRentangAktifPegawai(p, dari, sampai);
    if (!rentang) return; // pegawai belum/tidak lagi aktif di periode ini - lewati
    const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
    const catatan = state.data.absensi.filter(a =>
      a.Nama === p.Nama && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai
    );
    const sakit = catatan.filter(a => a.Status === "Sakit");
    const ijin = catatan.filter(a => a.Status === "Izin");
    const cuti = catatan.filter(a => a.Status === "Cuti");
    const alpa = catatan.filter(a => a.Status === "Alpa/Tanpa Keterangan");
    const hadir = Math.max(workingDays - catatan.length, 0);
    const pct = workingDays > 0 ? Math.round((hadir / workingDays) * 100) : 0;

    const ket = [];
    if (sakit.length) ket.push(`sakit tgl ${sakit.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);
    if (ijin.length) ket.push(`ijin tgl ${ijin.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);
    if (cuti.length) ket.push(`cuti tgl ${cuti.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);
    if (alpa.length) ket.push(`tanpa berita tgl ${alpa.map(a => Number(a.Tanggal.split("-")[2])).join(",")}`);

    const row = sheet.getRow(baris);
    row.getCell(1).value = no++;
    row.getCell(2).value = p.Nama;
    row.getCell(3).value = p.NIP || "-";
    row.getCell(4).value = hadir;
    row.getCell(5).value = `${pct}%`;
    row.getCell(6).value = sakit.length || "";
    row.getCell(7).value = ijin.length || "";
    row.getCell(8).value = cuti.length || "";
    row.getCell(9).value = alpa.length || "";
    row.getCell(10).value = ket.join("\n");
    row.getCell(10).alignment = { wrapText: true, vertical: "top" };
    row.eachCell(c => { c.alignment = c.alignment || { vertical: "middle" }; });
    baris++;
  });

  beriGarisTabel(sheet, headerRowIdx, baris - 1, kolom.length);
  await downloadWorkbook(workbook, `Rekap_Kehadiran_${dari}_sd_${sampai}.xlsx`);
}

// ---------------- REKAP APEL ----------------
async function exportApelExcel(dari, sampai) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Apel");
  const kolom = [
    "No", "Nama",
    "Ikut Apel Pagi", "% Pagi", "Tanggal Ikut Apel Pagi", "Tanggal Tidak Ikut Apel Pagi",
    "Ikut Apel Siang", "% Siang", "Tanggal Ikut Apel Siang", "Tanggal Tidak Ikut Apel Siang"
  ];
  sheet.columns = [6, 26, 10, 8, 26, 26, 10, 8, 26, 26].map(w => ({ width: w }));

  setupJudulSheet(sheet, "REKAPAN APEL PAGI & SIANG", kolom.length);
  sheet.mergeCells(4, 1, 4, kolom.length);
  sheet.getCell(4, 1).value = judulPeriode(dari, sampai);
  sheet.getCell(4, 1).font = { bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center" };

  const headerRowIdx = 6;
  const headerRow = sheet.getRow(headerRowIdx);
  kolom.forEach((k, i) => { headerRow.getCell(i + 1).value = k; });
  styleHeaderRow(headerRow);

  let baris = headerRowIdx + 1;
  let no = 1;
  state.data.pegawai.filter(pegawaiWajibApel).forEach(p => {
    const rentang = hitungRentangAktifPegawai(p, dari, sampai);
    if (!rentang) return;
    const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
    const workingDaysList = getWorkingDaysListInRange(rentang.mulai, rentang.selesai);

    const absenDates = new Set(
      state.data.absensi.filter(a => a.Nama === p.Nama && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai).map(a => a.Tanggal)
    );
    const missedPagi = new Set(absenDates);
    state.data.apel.filter(a => a.Nama === p.Nama && a.Sesi === "Pagi" && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
      .forEach(a => missedPagi.add(a.Tanggal));
    const missedSiang = new Set(absenDates);
    state.data.apel.filter(a => a.Nama === p.Nama && a.Sesi === "Siang" && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
      .forEach(a => missedSiang.add(a.Tanggal));

    const ikutPagiDates = workingDaysList.filter(t => !missedPagi.has(t));
    const ikutSiangDates = workingDaysList.filter(t => !missedSiang.has(t));
    const ikutPagi = ikutPagiDates.length;
    const ikutSiang = ikutSiangDates.length;
    const pctPagi = workingDays > 0 ? Math.round((ikutPagi / workingDays) * 100) : 0;
    const pctSiang = workingDays > 0 ? Math.round((ikutSiang / workingDays) * 100) : 0;

    const fmtTgl = (arr) => arr.length ? arr.map(t => Number(t.split("-")[2])).join(",") : "-";

    const row = sheet.getRow(baris);
    row.getCell(1).value = no++;
    row.getCell(2).value = p.Nama;
    row.getCell(3).value = ikutPagi;
    row.getCell(4).value = `${pctPagi}%`;
    row.getCell(5).value = fmtTgl(ikutPagiDates);
    row.getCell(6).value = fmtTgl(Array.from(missedPagi).sort());
    row.getCell(7).value = ikutSiang;
    row.getCell(8).value = `${pctSiang}%`;
    row.getCell(9).value = fmtTgl(ikutSiangDates);
    row.getCell(10).value = fmtTgl(Array.from(missedSiang).sort());
    [5, 6, 9, 10].forEach(c => { row.getCell(c).alignment = { wrapText: true, vertical: "top" }; });
    baris++;
  });

  beriGarisTabel(sheet, headerRowIdx, baris - 1, kolom.length);
  await downloadWorkbook(workbook, `Rekap_Apel_${dari}_sd_${sampai}.xlsx`);
}

// ---------------- REKAP KEGIATAN LUAR ----------------
async function exportKegiatanExcel(dari, sampai) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Kegiatan Luar");
  const kolom = ["No Urut", "Nomor Surat", "Tanggal", "Kegiatan", "Lokasi", "Nama Petugas"];
  sheet.columns = [8, 14, 12, 28, 22, 30].map(w => ({ width: w }));

  setupJudulSheet(sheet, "REKAPAN KEGIATAN LUAR GEDUNG", kolom.length);
  sheet.mergeCells(4, 1, 4, kolom.length);
  sheet.getCell(4, 1).value = judulPeriode(dari, sampai);
  sheet.getCell(4, 1).font = { bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center" };

  const headerRowIdx = 6;
  const headerRow = sheet.getRow(headerRowIdx);
  kolom.forEach((k, i) => { headerRow.getCell(i + 1).value = k; });
  styleHeaderRow(headerRow);

  // Kelompokkan baris-baris dengan No ST + Nama Kegiatan + Lokasi + Tanggal
  // yang sama jadi 1 baris (sama seperti kartu kegiatan di kalender)
  const groups = {};
  state.data.kegiatanLuar
    .filter(k => k.Tanggal >= dari && k.Tanggal <= sampai)
    .forEach(k => {
      const key = `${k.NoST || ""}|${k.Tanggal}|${k.NamaKegiatan || ""}|${k.Lokasi || ""}`;
      if (!groups[key]) groups[key] = { info: k, nama: [] };
      groups[key].nama.push(k.Nama);
    });

  const daftar = Object.values(groups).sort((a, b) => a.info.Tanggal.localeCompare(b.info.Tanggal));

  let baris = headerRowIdx + 1;
  let no = 1;
  daftar.forEach(g => {
    const row = sheet.getRow(baris);
    row.getCell(1).value = no++;
    row.getCell(2).value = g.info.NoST || "-";
    row.getCell(3).value = formatTanggalIndo(g.info.Tanggal);
    row.getCell(4).value = g.info.NamaKegiatan || "-";
    row.getCell(5).value = g.info.Lokasi || "-";
    row.getCell(6).value = g.nama.join("\n");
    row.getCell(6).alignment = { wrapText: true, vertical: "top" };
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    baris++;
  });

  beriGarisTabel(sheet, headerRowIdx, baris - 1, kolom.length);
  await downloadWorkbook(workbook, `Rekap_Kegiatan_Luar_${dari}_sd_${sampai}.xlsx`);
}


