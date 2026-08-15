// ============================================================
// STATISTIK — Kehadiran, Apel, Kegiatan Luar Gedung,
// dan detail per-pegawai saat nama diklik
// ============================================================

// ============================================================
// STATISTIK KEHADIRAN
// ============================================================
function populateStatAbsenBulanOptions() {
  const sel = document.getElementById("statAbsenBulan");
  const prevValue = sel.value;
  sel.innerHTML = "";
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
    sel.innerHTML += `<option value="${value}">${label}</option>`;
  }
  if (prevValue) sel.value = prevValue; // pertahankan bulan yang sedang dipilih user (kalau ada)

  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => loadDataForTab("statAbsen"));
    document.getElementById("toggleStatAbsenBtn").addEventListener("click", () => {
      state.statAbsenExpanded = !state.statAbsenExpanded;
      renderStatAbsen();
    });
    setupStatSearchInput("statAbsenSearch", renderStatAbsen);
  }
}

function countWorkingDaysInMonth(year, month, upToDay) {
  const lastDay = upToDay || new Date(year, month + 1, 0).getDate();
  const liburSet = getLiburDatesSet();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month, d).getDay();
    const key = dateKey(year, month, d);
    if (CONFIG.HARI_KERJA.includes(dow) && !liburSet.has(key)) count++;
  }
  return count;
}

function renderStatAbsen() {
  const [y, m] = document.getElementById("statAbsenBulan").value.split("-").map(Number);
  const year = y, month = m - 1;

  const now = new Date();
  const isBulanBerjalan = (year === now.getFullYear() && month === now.getMonth());
  const jumlahHariBulan = new Date(year, month + 1, 0).getDate();
  const periodeMulai = `${year}-${pad2(month + 1)}-01`;
  // Untuk bulan yang sedang berjalan, hitung hari kerja hanya sampai HARI INI —
  // supaya hari-hari yang belum terjadi tidak dianggap "tidak hadir".
  const periodeSelesai = isBulanBerjalan
    ? `${year}-${pad2(month + 1)}-${pad2(now.getDate())}`
    : `${year}-${pad2(month + 1)}-${pad2(jumlahHariBulan)}`;

  const prefix = `${year}-${pad2(month + 1)}`;
  const liburSet = getLiburDatesSet();

  const results = state.data.pegawai.map(p => {
    // Pegawai rotasi/sementara: kalau belum mulai kerja atau sudah selesai
    // sebelum bulan ini, kecualikan total dari daftar (bukan dianggap 100%).
    const rentang = hitungRentangAktifPegawai(p, periodeMulai, periodeSelesai);
    if (!rentang) return null;

    const workingDays = countWorkingDaysInRange(rentang.mulai, rentang.selesai);
    const tidakHadir = state.data.absensi.filter(a =>
      a.Nama === p.Nama && a.Tanggal && a.Tanggal.startsWith(prefix) &&
      a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai && !liburSet.has(a.Tanggal)
    ).length;
    const hadir = Math.max(workingDays - tidakHadir, 0);
    const pct = workingDays > 0 ? Math.round((hadir / workingDays) * 100) : 0;
    return { nama: p.Nama, pct };
  }).filter(Boolean).sort((a, b) => a.pct - b.pct);

  renderStatList("statAbsenList", results, state.statAbsenExpanded, "absen");
  document.getElementById("toggleStatAbsenBtn").textContent =
    state.statAbsenExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}


// ============================================================
// STATISTIK APEL (Pagi & Siang terpisah)
// ============================================================
function populateStatApelBulanOptions() {
  const sel = document.getElementById("statApelBulan");
  const prevValue = sel.value;
  sel.innerHTML = "";
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
    sel.innerHTML += `<option value="${value}">${label}</option>`;
  }
  if (prevValue) sel.value = prevValue;

  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => loadDataForTab("statApel"));
    document.getElementById("toggleStatApelBtn").addEventListener("click", () => {
      state.statApelExpanded = !state.statApelExpanded;
      renderStatApel();
    });
    setupStatSearchInput("statApelSearch", renderStatApel);
  }
}

function renderStatApel() {
  const sel = document.getElementById("statApelBulan");
  if (!sel.value) return; // belum sempat terisi (jalur cache super awal)
  const [y, m] = sel.value.split("-").map(Number);
  const year = y, month = m - 1;

  const now = new Date();
  const isBulanBerjalan = (year === now.getFullYear() && month === now.getMonth());
  const jumlahHariBulan = new Date(year, month + 1, 0).getDate();
  const periodeMulai = `${year}-${pad2(month + 1)}-01`;
  const periodeSelesai = isBulanBerjalan
    ? `${year}-${pad2(month + 1)}-${pad2(now.getDate())}`
    : `${year}-${pad2(month + 1)}-${pad2(jumlahHariBulan)}`;

  const prefix = `${year}-${pad2(month + 1)}`;

  const results = state.data.pegawai
    .filter(pegawaiWajibApel) // 9 pegawai "WajibApel: Tidak" dikecualikan total dari sini
    .map(p => {
      // Pegawai rotasi/sementara: kecualikan total kalau belum/tidak lagi aktif bulan ini
      const rentang = hitungRentangAktifPegawai(p, periodeMulai, periodeSelesai);
      if (!rentang) return null;
      const workingDaysTotal = countWorkingDaysInRange(rentang.mulai, rentang.selesai);

      // Tanggal Sakit/Izin/Cuti/Alpa OTOMATIS terhitung sebagai "tidak ikut apel"
      // (baik Pagi maupun Siang) - jadi tidak perlu dicentang manual satu-satu,
      // dan ikut menurunkan persentase (bukan dikecualikan).
      const absenDates = new Set(
        state.data.absensi
          .filter(a => a.Nama === p.Nama && a.Tanggal && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
          .map(a => a.Tanggal)
      );

      const missedPagiDates = new Set(absenDates);
      state.data.apel
        .filter(a => a.Nama === p.Nama && a.Sesi === "Pagi" && a.Tanggal && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
        .forEach(a => missedPagiDates.add(a.Tanggal));

      const missedSiangDates = new Set(absenDates);
      state.data.apel
        .filter(a => a.Nama === p.Nama && a.Sesi === "Siang" && a.Tanggal && a.Tanggal >= rentang.mulai && a.Tanggal <= rentang.selesai)
        .forEach(a => missedSiangDates.add(a.Tanggal));

      const pctPagi = workingDaysTotal > 0 ? Math.round(((workingDaysTotal - missedPagiDates.size) / workingDaysTotal) * 100) : 0;
      const pctSiang = workingDaysTotal > 0 ? Math.round(((workingDaysTotal - missedSiangDates.size) / workingDaysTotal) * 100) : 0;
      return { nama: p.Nama, pctPagi: Math.max(pctPagi, 0), pctSiang: Math.max(pctSiang, 0) };
    }).filter(Boolean).sort((a, b) => (a.pctPagi + a.pctSiang) - (b.pctPagi + b.pctSiang));

  const el = document.getElementById("statApelList");
  const filtered = applyNameSearchFilter(results, "statApelSearch");
  const shown = state.statApelExpanded ? filtered : filtered.slice(0, 10);
  el.innerHTML = shown.map(r => `
    <div class="stat-row apel-row clickable" data-nama="${r.nama}" data-pct-pagi="${r.pctPagi}" data-pct-siang="${r.pctSiang}">
      <div class="stat-name">${r.nama}</div>
      <div class="apel-badges">
        <span class="apel-badge">Pagi <b class="${getPctColorClass(r.pctPagi)}">${formatPctLabel(r.pctPagi)}</b></span>
        <span class="apel-badge">Siang <b class="${getPctColorClass(r.pctSiang)}">${formatPctLabel(r.pctSiang)}</b></span>
      </div>
    </div>
  `).join("");
  el.querySelectorAll(".stat-row").forEach(row => {
    row.addEventListener("click", () => openStatDetail(row.dataset.nama, "apel", {
      pctPagi: Number(row.dataset.pctPagi),
      pctSiang: Number(row.dataset.pctSiang)
    }));
  });

  document.getElementById("toggleStatApelBtn").textContent =
    state.statApelExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}


// ============================================================
// STATISTIK KEGIATAN LUAR
// ============================================================
function setupStatKegiatanEvents() {
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  document.getElementById("statKegiatanDari").value = firstOfMonth;
  document.getElementById("statKegiatanSampai").value = todayStr;

  document.getElementById("statKegiatanDari").addEventListener("change", () => loadDataForTab("statKegiatan"));
  document.getElementById("statKegiatanSampai").addEventListener("change", () => loadDataForTab("statKegiatan"));
  document.getElementById("toggleStatKegiatanBtn").addEventListener("click", () => {
    state.statKegiatanExpanded = !state.statKegiatanExpanded;
    renderStatKegiatan();
  });
  setupStatSearchInput("statKegiatanSearch", renderStatKegiatan);
}

function countWorkingDaysInRange(dariKey, sampaiKey) {
  const liburSet = getLiburDatesSet();
  const [y1, m1, d1] = dariKey.split("-").map(Number);
  const [y2, m2, d2] = sampaiKey.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (CONFIG.HARI_KERJA.includes(d.getDay()) && !liburSet.has(key)) count++;
  }
  return count;
}

// Sama seperti countWorkingDaysInRange, tapi mengembalikan daftar tanggalnya (bukan cuma jumlahnya).
// Dipakai untuk menyusun kolom "Tanggal Ikut Apel" di rekap Excel.
function getWorkingDaysListInRange(dariKey, sampaiKey) {
  const liburSet = getLiburDatesSet();
  const [y1, m1, d1] = dariKey.split("-").map(Number);
  const [y2, m2, d2] = sampaiKey.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  const list = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (CONFIG.HARI_KERJA.includes(d.getDay()) && !liburSet.has(key)) list.push(key);
  }
  return list;
}


// ============================================================
// MASA AKTIF PEGAWAI (mendukung pegawai rotasi/sementara)
// Kolom TanggalMulai/TanggalSelesai di sheet Pegawai bersifat OPSIONAL -
// kalau kosong, dianggap sudah aktif sejak dulu / masih aktif terus
// (perilaku lama, tidak berubah untuk pegawai tetap).
// ============================================================
function hitungRentangAktifPegawai(pegawai, periodeMulai, periodeSelesai) {
  const mulai = pegawai.TanggalMulai && String(pegawai.TanggalMulai).trim()
    ? String(pegawai.TanggalMulai).trim() : periodeMulai;
  const selesai = pegawai.TanggalSelesai && String(pegawai.TanggalSelesai).trim()
    ? String(pegawai.TanggalSelesai).trim() : periodeSelesai;

  const efektifMulai = mulai > periodeMulai ? mulai : periodeMulai;
  const efektifSelesai = selesai < periodeSelesai ? selesai : periodeSelesai;

  if (efektifMulai > efektifSelesai) return null; // tidak aktif sama sekali di periode ini
  return { mulai: efektifMulai, selesai: efektifSelesai };
}

// Pegawai yang WajibApel diisi "Tidak" (tanpa memandang huruf besar/kecil)
// dikecualikan total dari Statistik Apel - tetap normal di statistik lain.
function pegawaiWajibApel(pegawai) {
  const nilai = (pegawai.WajibApel || "").toString().trim().toLowerCase();
  return nilai !== "tidak";
}

function renderStatKegiatan() {
  const dari = document.getElementById("statKegiatanDari").value;
  const sampai = document.getElementById("statKegiatanSampai").value;
  if (!dari || !sampai || dari > sampai) {
    document.getElementById("statKegiatanList").innerHTML =
      `<p class="empty-note">Pilih rentang tanggal yang valid (tanggal "Dari" tidak boleh setelah "Sampai").</p>`;
    return;
  }

  const results = state.data.pegawai.map(p => {
    const rentang = hitungRentangAktifPegawai(p, dari, sampai);
    if (!rentang) return null; // tidak aktif sama sekali di periode ini - kecualikan
    const workingDaysPegawai = countWorkingDaysInRange(rentang.mulai, rentang.selesai);

    const dates = new Set(
      state.data.kegiatanLuar
        .filter(k => k.Nama === p.Nama && k.Tanggal >= rentang.mulai && k.Tanggal <= rentang.selesai)
        .map(k => k.Tanggal)
    );
    const pct = workingDaysPegawai > 0 ? Math.round((dates.size / workingDaysPegawai) * 100) : 0;
    return { nama: p.Nama, pct };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);

  renderStatList("statKegiatanList", results, state.statKegiatanExpanded, "kegiatan");
  document.getElementById("toggleStatKegiatanBtn").textContent =
    state.statKegiatanExpanded ? "Tampilkan Lebih Sedikit" : "Lihat Semua Pegawai";
}

function renderStatList(containerId, results, expanded, type) {
  const el = document.getElementById(containerId);
  const searchInputId = type === "absen" ? "statAbsenSearch" : "statKegiatanSearch";
  const filtered = applyNameSearchFilter(results, searchInputId);
  const shown = expanded ? filtered : filtered.slice(0, 10);
  el.innerHTML = shown.map(r => {
    // Pewarnaan tingkat persentase HANYA untuk Statistik Kehadiran, bukan Kegiatan Luar
    const pctClass = type === "absen" ? getPctColorClass(r.pct) : "";
    const pctLabel = type === "absen" ? formatPctLabel(r.pct, 85) : `${r.pct}%`;
    return `
    <div class="stat-row clickable" data-nama="${r.nama}" data-pct="${r.pct}">
      <div class="stat-name">${r.nama}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${r.pct}%"></div></div>
      <div class="stat-pct ${pctClass}">${pctLabel}</div>
    </div>
  `;
  }).join("");

  el.querySelectorAll(".stat-row").forEach(row => {
    row.addEventListener("click", () => openStatDetail(row.dataset.nama, type, { pct: Number(row.dataset.pct) }));
  });
}


// ============================================================
// DETAIL PER PEGAWAI (saat nama diklik di daftar statistik)
// ============================================================
function openStatDetail(nama, type, pctInfo) {
  document.getElementById("statDetailTitle").textContent = nama;
  const contentEl = document.getElementById("statDetailContent");
  const periodeEl = document.getElementById("statDetailPeriode");

  // Efek transisi beda-beda tergantung asal statistiknya:
  // Kehadiran = slide-up, Apel = flip, Kegiatan Luar = bounce.
  const detailBox = document.querySelector("#statDetailModal .modal-box");
  detailBox.classList.remove("effect-slideup", "effect-flip", "effect-bounce");
  const efekMap = { absen: "effect-slideup", apel: "effect-flip", kegiatan: "effect-bounce" };
  detailBox.classList.add(efekMap[type] || "effect-slideup");

  // Reaksi singkat (menangis kalau ada yang ≤50%, tepuk tangan kalau 100% penuh) -
  // hanya untuk Kehadiran & Apel, bukan Kegiatan Luar.
  if (pctInfo && type === "absen") {
    if (pctInfo.pct <= 85) triggerStatReaction("😢");
    else if (pctInfo.pct >= 100) triggerStatReaction("👏");
  } else if (pctInfo && type === "apel") {
    if (pctInfo.pctPagi <= 50 || pctInfo.pctSiang <= 50) triggerStatReaction("😢");
    else if (pctInfo.pctPagi >= 100 && pctInfo.pctSiang >= 100) triggerStatReaction("👏");
  }

  // Kartu identitas (NIP, Pangkat/Golongan, Jabatan) - khusus Kehadiran & Apel.
  // NIP hanya tampil saat Mode Admin aktif - pegawai lain tidak melihatnya.
  const identityEl = document.getElementById("statDetailIdentity");
  if (type === "absen" || type === "apel") {
    const pegawai = state.data.pegawai.find(p => p.Nama === nama);
    const nipRow = state.isAdmin
      ? `<div class="id-row"><span class="id-label">NIP</span><span class="id-value">${(pegawai && pegawai.NIP) || "-"}</span></div>`
      : "";
    identityEl.innerHTML = `
      <div class="pegawai-id-card">
        ${nipRow}
        <div class="id-row"><span class="id-label">Pangkat/Gol</span><span class="id-value">${(pegawai && pegawai.PangkatGolongan) || "-"}</span></div>
        <div class="id-row"><span class="id-label">Jabatan</span><span class="id-value">${(pegawai && pegawai.Jabatan) || "-"}</span></div>
      </div>
    `;
  } else {
    identityEl.innerHTML = "";
  }

  if (type === "absen") {
    const [y, m] = document.getElementById("statAbsenBulan").value.split("-").map(Number);
    const prefix = `${y}-${pad2(m)}`;
    periodeEl.textContent = `Periode: ${BULAN_ID[m - 1]} ${y}`;

    const catatan = state.data.absensi
      .filter(a => a.Nama === nama && a.Tanggal && a.Tanggal.startsWith(prefix))
      .sort((a, b) => a.Tanggal.localeCompare(b.Tanggal));

    if (catatan.length === 0) {
      contentEl.innerHTML = `<p class="empty-note">Tidak ada catatan tidak hadir pada bulan ini — hadir penuh.</p>`;
    } else {
      // Kelompokkan per status: "Sakit: tanggal 2, 4, 20"
      const byStatus = {};
      catatan.forEach(c => {
        const tgl = Number(c.Tanggal.split("-")[2]);
        if (!byStatus[c.Status]) byStatus[c.Status] = [];
        byStatus[c.Status].push(tgl);
      });
      contentEl.innerHTML = Object.keys(byStatus).map(status => {
        const statusInfo = CONFIG.STATUS_LIST.find(s => s.value === status) || { color: "#999" };
        return `<div class="modal-item">
          <span class="status-chip" style="background:${statusInfo.color}">${status}</span>
          <span class="item-title">Tanggal ${byStatus[status].join(", ")}</span>
        </div>`;
      }).join("");
    }
  } else if (type === "kegiatan") {
    const dari = document.getElementById("statKegiatanDari").value;
    const sampai = document.getElementById("statKegiatanSampai").value;
    periodeEl.textContent = `Periode: ${formatTanggalIndo(dari)} — ${formatTanggalIndo(sampai)}`;

    const catatan = state.data.kegiatanLuar
      .filter(k => k.Nama === nama && k.Tanggal >= dari && k.Tanggal <= sampai)
      .sort((a, b) => a.Tanggal.localeCompare(b.Tanggal));

    if (catatan.length === 0) {
      contentEl.innerHTML = `<p class="empty-note">Tidak ada kegiatan luar gedung tercatat pada periode ini.</p>`;
    } else {
      contentEl.innerHTML = catatan.map(c => {
        const warna = getActivityColor(c.NamaKegiatan || "");
        return `
        <div class="modal-item kegiatan-card" style="border-left-color:${warna}">
          <div class="item-title" style="color:${warna}">${c.NamaKegiatan || "(tanpa nama kegiatan)"}</div>
          <div class="item-sub">${formatTanggalIndo(c.Tanggal)} · 📍 ${c.Lokasi}${c.NoST ? `<span class="st-tag">No.ST: ${c.NoST}</span>` : ""}</div>
        </div>`;
      }).join("");
    }
  } else if (type === "apel") {
    const [y, m] = document.getElementById("statApelBulan").value.split("-").map(Number);
    const prefix = `${y}-${pad2(m)}`;
    periodeEl.textContent = `Periode: ${BULAN_ID[m - 1]} ${y}`;

    // Tanggal Sakit/Izin/Cuti/Alpa otomatis digabung (bukan cuma yang dicentang manual)
    const absenMap = {}; // { "2026-07-01": "Sakit", ... }
    state.data.absensi
      .filter(a => a.Nama === nama && a.Tanggal && a.Tanggal.startsWith(prefix))
      .forEach(a => { absenMap[a.Tanggal] = a.Status; });

    function gabungkanTanggal(sesi) {
      const set = new Set(Object.keys(absenMap));
      state.data.apel
        .filter(a => a.Nama === nama && a.Sesi === sesi && a.Tanggal && a.Tanggal.startsWith(prefix))
        .forEach(a => set.add(a.Tanggal));
      return Array.from(set).sort().map(tgl => {
        const tglNum = Number(tgl.split("-")[2]);
        return absenMap[tgl] ? `${tglNum} (${absenMap[tgl]})` : `${tglNum}`;
      });
    }

    const missedPagi = gabungkanTanggal("Pagi");
    const missedSiang = gabungkanTanggal("Siang");

    contentEl.innerHTML = `
      <div class="modal-item">
        <div class="item-title">🌅 Tidak Ikut Apel Pagi</div>
        <div class="item-sub">${missedPagi.length ? "Tanggal " + missedPagi.join(", ") : "Tidak ada — ikut penuh bulan ini."}</div>
      </div>
      <div class="modal-item">
        <div class="item-title">🌇 Tidak Ikut Apel Siang</div>
        <div class="item-sub">${missedSiang.length ? "Tanggal " + missedSiang.join(", ") : "Tidak ada — ikut penuh bulan ini."}</div>
      </div>
    `;
  }

  showModal("statDetailModal");
}


document.addEventListener("DOMContentLoaded", setupStatKegiatanEvents);
