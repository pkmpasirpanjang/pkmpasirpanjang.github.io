// ============================================================
// KALENDER — render grid kalender, navigasi bulan,
// modal detail tanggal (absen, kegiatan luar, apel per hari)
// ============================================================

// ============================================================
// CALENDAR
// ============================================================
function setupCalendarNav() {
  document.getElementById("prevMonthBtn").addEventListener("click", async () => {
    state.currentMonth--;
    if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
    await loadDataForTab("kalender");
  });
  document.getElementById("nextMonthBtn").addEventListener("click", async () => {
    state.currentMonth++;
    if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
    await loadDataForTab("kalender");
  });
}


function renderCalendar() {
  const y = state.currentYear, m = state.currentMonth;
  document.getElementById("calendarTitle").textContent = `${BULAN_ID[m]} ${y}`;

  const firstDay = new Date(y, m, 1);
  // convert JS Sunday=0 to Monday-first index (0=Senin..6=Minggu)
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const absenByDate = groupByDate(state.data.absensi, "Tanggal");
  const kegiatanByDate = groupByDate(state.data.kegiatanLuar, "Tanggal");
  const liburSet = getLiburDatesSet();

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell empty";
    grid.appendChild(empty);
  }

  const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d);
    const isLibur = liburSet.has(key);
    const cell = document.createElement("div");
    cell.className = "cal-cell" + (key === todayKey ? " today" : "") + (isLibur ? " libur" : "");
    const absenCount = (absenByDate[key] || []).length;
    const kegiatanCount = (kegiatanByDate[key] || []).length;

    cell.innerHTML = `
      <div class="cal-daynum">${d}${isLibur ? ' <span class="libur-mark">🎌</span>' : ""}</div>
      <div class="cal-badges">
        ${absenCount ? `<span class="cal-badge-count"><i class="dot dot-absen"></i> ${absenCount}</span>` : ""}
        ${kegiatanCount ? `<span class="cal-badge-count"><i class="dot dot-kegiatan"></i> ${kegiatanCount}</span>` : ""}
      </div>`;
    cell.addEventListener("click", () => openDateModal(key));
    grid.appendChild(cell);
  }
}

function getLiburDatesSet() {
  return new Set((state.data.libur || []).map(l => l.Tanggal));
}

function getLiburRecord(key) {
  return (state.data.libur || []).find(l => l.Tanggal === key);
}

// ============================================================
// DATE DETAIL MODAL
// ============================================================
function openDateModal(key) {
  state.selectedDate = key;
  const [y, m, d] = key.split("-").map(Number);
  document.getElementById("modalDateTitle").textContent = `${d} ${BULAN_ID[m - 1]} ${y}`;

  const liburRecord = getLiburRecord(key);
  const liburBar = document.getElementById("liburBar");
  const liburLabel = document.getElementById("liburLabel");
  const markBtn = document.getElementById("markLiburBtn");
  const unmarkBtn = document.getElementById("unmarkLiburBtn");

  if (liburRecord) {
    liburBar.classList.remove("hidden");
    liburLabel.textContent = liburRecord.Keterangan ? `Hari Libur — ${liburRecord.Keterangan}` : "Hari Libur";
    markBtn.classList.add("hidden");
    unmarkBtn.classList.remove("hidden");
    unmarkBtn.onclick = () => sendAction("deleteLibur", { _row: liburRecord._row });
  } else {
    liburBar.classList.add("hidden");
    markBtn.classList.remove("hidden");
    unmarkBtn.classList.add("hidden");
    markBtn.onclick = () => {
      const keterangan = prompt("Nama hari libur (opsional, boleh dikosongkan):", "");
      if (keterangan === null) return; // batal
      sendAction("addLibur", { Tanggal: key, Keterangan: keterangan });
    };
  }
  document.querySelector(".libur-actions").classList.toggle("hidden", !state.isAdmin);

  const absenList = state.data.absensi
    .filter(a => a.Tanggal === key)
    .sort((a, b) => {
      const idxA = CONFIG.STATUS_LIST.findIndex(s => s.value === a.Status);
      const idxB = CONFIG.STATUS_LIST.findIndex(s => s.value === b.Status);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  const kegiatanList = state.data.kegiatanLuar.filter(k => k.Tanggal === key);

  const absenEl = document.getElementById("modalAbsenList");
  absenEl.innerHTML = absenList.length ? "" : `<p class="empty-note">Semua pegawai hadir hari ini.</p>`;
  absenList.forEach(a => {
    const statusInfo = CONFIG.STATUS_LIST.find(s => s.value === a.Status) || { color: "#999" };
    const el = document.createElement("div");
    el.className = "modal-item" + (state.isAdmin ? " editable" : "");
    el.innerHTML = `<span class="status-chip" style="background:${statusInfo.color}">${a.Status}</span>
      <span class="item-title">${a.Nama}</span>
      ${a.Keterangan ? `<div class="item-sub">${a.Keterangan}</div>` : ""}`;
    if (state.isAdmin) el.addEventListener("click", () => openAbsenForm(a));
    absenEl.appendChild(el);
  });

  const kegEl = document.getElementById("modalKegiatanList");
  kegEl.innerHTML = kegiatanList.length ? "" : `<p class="empty-note">Tidak ada kegiatan luar gedung.</p>`;

  // Kelompokkan baris-baris dengan No ST + Nama Kegiatan + Lokasi yang sama
  // jadi satu kartu, supaya kegiatan yang diikuti banyak orang tidak berulang kartunya.
  const groups = {};
  kegiatanList.forEach(k => {
    const groupKey = `${k.NoST || ""}|${k.NamaKegiatan || ""}|${k.Lokasi || ""}`;
    if (!groups[groupKey]) groups[groupKey] = { info: k, items: [] };
    groups[groupKey].items.push(k);
  });

  Object.values(groups).forEach(group => {
    const k = group.info;
    const el = document.createElement("div");
    const warna = getActivityColor(k.NamaKegiatan || "");
    el.className = "modal-item kegiatan-card";
    el.style.borderLeftColor = warna;
    const chipsHtml = group.items.map(item => `
      <span class="person-chip${state.isAdmin ? " editable" : ""}" data-row="${item._row}">${item.Nama}</span>
    `).join("");
    el.innerHTML = `
      <div class="item-title" style="color:${warna}">${k.NamaKegiatan || "(Tanpa nama kegiatan)"}</div>
      <div class="item-sub">📍 ${k.Lokasi}${k.NoST ? `<span class="st-tag">No.ST: ${k.NoST}</span>` : `<span class="st-tag st-pending">⏳ Menunggu Nomor</span>`}</div>
      <div class="person-chip-row">${chipsHtml}</div>
    `;
    if (state.isAdmin) {
      el.querySelectorAll(".person-chip").forEach(chip => {
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          const row = Number(chip.dataset.row);
          const item = group.items.find(it => it._row === row);
          openKegiatanForm(item);
        });
      });
    }
    kegEl.appendChild(el);
  });

  // Tombol "Beri Nomor Surat Tugas" khusus untuk tanggal ini saja - cuma
  // muncul kalau admin aktif DAN ada kegiatan di tanggal ini yang masih
  // "Menunggu Nomor". Kegiatan menunggu nomor di tanggal LAIN tidak ikut
  // diproses walau sudah lama diinput - harus diklik dari tanggal masing-masing.
  const beriNomorBtn = document.getElementById("beriNomorTanggalBtn");
  const adaPending = kegiatanList.some(k => !k.NoST);
  beriNomorBtn.classList.toggle("hidden", !(state.isAdmin && adaPending));
  beriNomorBtn.onclick = async () => {
    const konfirmasi = confirm(
      `Beri nomor otomatis untuk semua kegiatan luar gedung yang menunggu nomor DI TANGGAL INI SAJA?\n\n` +
      `Nomor akan langsung tersimpan ke spreadsheet. Kalau ada kegiatan menunggu nomor di tanggal lain, ` +
      `harus diklik terpisah dari tanggal masing-masing.`
    );
    if (!konfirmasi) return;
    const result = await sendAction("beriNomorSuratTugas", { Tanggal: key });
    if (!result) return; // gagal - pesan error sudah ditampilkan oleh sendAction
    if (result.jumlahDiberiNomor === 0) {
      alert("Tidak ada kegiatan yang menunggu nomor di tanggal ini.");
      return;
    }
    const daftar = result.detail
      .map(d => `• No. ${d.NoST} — ${d.NamaKegiatan} (${d.Lokasi})`)
      .join("\n");
    alert(`${result.jumlahDiberiNomor} kegiatan di tanggal ini berhasil diberi nomor:\n\n${daftar}`);
  };

  document.getElementById("addAbsenBtn").classList.toggle("hidden", !state.isAdmin);
  document.getElementById("addKegiatanBtn").classList.toggle("hidden", !state.isAdmin);

  try {
    document.getElementById("apelAdminSection").classList.toggle("hidden", !state.isAdmin);
    if (state.isAdmin) {
      state.apelPagiSelected = new Set(
        state.data.apel.filter(a => a.Tanggal === key && a.Sesi === "Pagi").map(a => a.Nama)
      );
      state.apelSiangSelected = new Set(
        state.data.apel.filter(a => a.Tanggal === key && a.Sesi === "Siang").map(a => a.Nama)
      );
      document.getElementById("apelPagiSearch").value = "";
      document.getElementById("apelSiangSearch").value = "";
      const namesForApel = state.data.pegawai.map(p => p.Nama).sort();
      renderChecklistGeneric("apelPagiChecklist", namesForApel, "", state.apelPagiSelected);
      renderChecklistGeneric("apelSiangChecklist", namesForApel, "", state.apelSiangSelected);
    }
  } catch (err) {
    console.error("Gagal menyiapkan bagian Apel di pop-up tanggal:", err);
  }

  showModal("dateModal");
}

async function submitApel() {
  await sendAction("syncApelHari", {
    Tanggal: state.selectedDate,
    PagiList: Array.from(state.apelPagiSelected),
    SiangList: Array.from(state.apelSiangSelected)
  });
}

