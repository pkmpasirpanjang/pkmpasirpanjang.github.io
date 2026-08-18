/**
 * ============================================================
 * BACKEND DASHBOARD ABSENSI & KEGIATAN LUAR GEDUNG
 * UPTD Puskesmas Pasir Panjang - Kota Kupang
 * ============================================================
 * CARA PASANG:
 * 1. Buka Google Sheet "Dasboard_Kalender" (hasil konversi Excel).
 * 2. Menu Extensions > Apps Script.
 * 3. Hapus isi default, lalu tempel SELURUH isi file ini.
 * 4. Klik Deploy > New deployment.
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Klik Deploy, salin URL Web App yang muncul.
 * 6. Tempel URL itu ke file js/config.js (variabel API_URL).
 *
 * Setiap kali Anda ubah kode ini, harus Deploy > Manage deployments
 * > edit (pensil) > Version: New version > Deploy ulang, supaya
 * perubahan kode benar-benar aktif di URL yang sama.
 *
 * KHUSUS SEKALI SAJA saat pertama kali memasang kode versi ini (yang
 * sudah punya pembacaan data lebih cepat & penomoran surat tugas otomatis):
 * jalankan (lewat dropdown sebelah tombol Run) fungsi-fungsi berikut, SATU
 * PER SATU, urutan bebas - sebelum Deploy:
 *   1. "siapkanKolomWaktuInput" - menyiapkan kolom pencatat waktu input
 *      di sheet KegiatanLuar (dibutuhkan fitur penomoran surat tugas).
 *   2. "urutkanUlangSemuaDataLama" - mengurutkan data yang sudah ada
 *      berdasarkan tanggal (dibutuhkan supaya pembacaan data lebih cepat).
 * Setelah kedua fungsi itu selesai dijalankan, baru Deploy seperti biasa.
 * ============================================================
 */

// Ganti PIN ini kapan saja sesuai kebutuhan Anda
const ADMIN_PIN = '4dministrasi';

const SHEET_PEGAWAI = 'Pegawai';
const SHEET_ABSENSI = 'Absensi';
const SHEET_KEGIATAN = 'KegiatanLuar';
const SHEET_LIBUR = 'Libur';
const SHEET_APEL = 'Apel';

// Dipakai tetap (Kupang = WITA) supaya tanggal tidak pernah geser
// akibat perbedaan zona waktu antara Sheets dan project Apps Script.
const TIMEZONE = 'Asia/Makassar';

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || 'data';
    if (action === 'data') {
      var dari = e.parameter && e.parameter.dari;
      var sampai = e.parameter && e.parameter.sampai;
      return jsonResponse(getAllData(dari, sampai));
    }
    return jsonResponse({ error: 'Aksi tidak dikenal: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'checkPin') {
      return jsonResponse({ success: body.pin === ADMIN_PIN });
    }

    if (body.pin !== ADMIN_PIN) {
      return jsonResponse({ success: false, error: 'PIN salah. Perubahan tidak disimpan.' });
    }

    // Kunci sementara supaya kalau ada 2 permintaan simpan datang berbarengan
    // (misal karena tombol Simpan sempat terklik dua kali), keduanya diproses
    // berurutan satu-satu - bukan bersamaan yang bisa saling tabrakan dan
    // menyebabkan salah satunya gagal / datanya tertimpa.
    var lock = LockService.getScriptLock();
    var dapatKunci = lock.tryLock(25000); // tunggu maksimal 25 detik
    if (!dapatKunci) {
      return jsonResponse({ success: false, error: 'Server sedang sibuk memproses permintaan lain, coba simpan lagi sebentar.' });
    }

    var result;
    try {
      switch (action) {
        case 'addAbsensi':
          result = addAbsensi(body.data);
          break;
        case 'addAbsensiRange':
          result = addAbsensiRange(body.data);
          break;
        case 'updateAbsensi':
          result = updateAbsensi(body.data);
          break;
        case 'deleteAbsensi':
          result = deleteRow(SHEET_ABSENSI, body.data._row);
          break;
        case 'addKegiatan':
          result = addKegiatan(body.data);
          break;
        case 'addKegiatanMulti':
          result = addKegiatanMulti(body.data);
          break;
        case 'updateKegiatan':
          result = updateKegiatan(body.data);
          break;
        case 'deleteKegiatan':
          result = deleteRow(SHEET_KEGIATAN, body.data._row);
          break;
        case 'addLibur':
          result = addLibur(body.data);
          break;
        case 'deleteLibur':
          result = deleteRow(SHEET_LIBUR, body.data._row);
          break;
        case 'syncApelHari':
          result = syncApelHari(body.data);
          break;
        case 'beriNomorSuratTugas':
          result = beriNomorSuratTugas(body.data.Tanggal);
          break;
        default:
          return jsonResponse({ success: false, error: 'Aksi tidak dikenal: ' + action });
      }
    } finally {
      lock.releaseLock();
    }
    return jsonResponse({ success: true, result: result });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sheet;
}

// Mengubah isi sheet jadi array of object berdasarkan header di baris 1.
// Setiap object diberi field _row = nomor baris asli di sheet (dipakai untuk edit/hapus).
function sheetToObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var isEmpty = row.every(function (c) { return c === '' || c === null; });
    if (isEmpty) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
      }
      obj[headers[j]] = val;
    }
    obj._row = i + 1;
    out.push(obj);
  }
  return out;
}

// Sheet "Libur" dibuat otomatis kalau belum ada, supaya Anda tidak perlu
// bikin manual di Google Sheets.
function getOrCreateLiburSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_LIBUR);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LIBUR);
    sheet.getRange(1, 1, 1, 2).setValues([['Tanggal', 'Keterangan']]);
  }
  return sheet;
}

// Sheet "Apel" dibuat otomatis kalau belum ada - tidak perlu Anda buat manual
// di Spreadsheet. Hanya mencatat pegawai yang TIDAK ikut (sama seperti pola
// sheet Absensi), supaya tidak perlu mencatat semua pegawai yang hadir tiap hari.
function getOrCreateApelSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_APEL);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_APEL);
    sheet.getRange(1, 1, 1, 4).setValues([['Tanggal', 'Nama', 'Sesi', 'Keterangan']]);
  }
  return sheet;
}

function getAllData(dari, sampai) {
  return {
    pegawai: sheetToObjects(getSheet(SHEET_PEGAWAI)), // sheet kecil, baca semua tetap aman
    absensi: filterByTanggalOptimized(getSheet(SHEET_ABSENSI), 1, 4, dari, sampai),
    kegiatanLuar: filterByTanggalOptimized(getSheet(SHEET_KEGIATAN), 2, 5, dari, sampai),
    libur: getGabunganLibur(), // sheet kecil, baca semua tetap aman
    apel: filterByTanggalOptimized(getOrCreateApelSheet(), 1, 4, dari, sampai)
  };
}

// ============================================================
// PEMBACAAN DATA TERARAH (per rentang tanggal) - PENTING untuk performa
// ============================================================
// Dipakai untuk sheet Absensi/KegiatanLuar/Apel yang terus bertambah
// bertahun-tahun. Daripada membaca SEMUA baris lalu membuang yang di luar
// rentang (cara lama), di sini kita:
//   1) baca HANYA kolom Tanggal dulu (1 kolom, jauh lebih ringan daripada
//      semua kolom x semua baris),
//   2) cari batas rentang lewat binary search DI MEMORI (bukan API call),
//      ini valid karena sheet selalu dijaga terurut menaik berdasarkan
//      tanggal oleh sortSheetByDate() setiap kali ada data baru disimpan,
//   3) baru baca 1 kali rentang baris yang benar-benar relevan saja.
// Hasilnya: waktu baca sebanding dengan JUMLAH DATA DI RENTANG YANG DIMINTA
// (biasanya 1 bulan), bukan sebanding dengan seluruh riwayat yang menumpuk.
//
// Kalau dari/sampai kosong (tidak ada filter), tetap baca semua seperti biasa.
function filterByTanggalOptimized(sheet, dateCol, jumlahKolom, dari, sampai) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  if (!dari && !sampai) return sheetToObjects(sheet);

  var dateValues = sheet.getRange(2, dateCol, lastRow - 1, 1).getValues();
  var dates = dateValues.map(function (r) {
    var v = r[0];
    return v instanceof Date ? Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd') : String(v);
  });

  var startIdx = dari ? lowerBound(dates, dari) : 0;
  var endIdx = sampai ? upperBound(dates, sampai) : dates.length;
  if (startIdx >= endIdx) return [];

  var startRow = 2 + startIdx; // +2: baris 1 = header, dates[0] = baris 2
  var numRows = endIdx - startIdx;
  var headers = sheet.getRange(1, 1, 1, jumlahKolom).getValues()[0];
  var values = sheet.getRange(startRow, 1, numRows, jumlahKolom).getValues();

  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (val instanceof Date) val = Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
      obj[headers[j]] = val;
    }
    obj._row = startRow + i;
    out.push(obj);
  }
  return out;
}

// Index pertama di array terurut "arr" yang nilainya >= target
function lowerBound(arr, target) {
  var lo = 0, hi = arr.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}
// Index pertama di array terurut "arr" yang nilainya > target
function upperBound(arr, target) {
  var lo = 0, hi = arr.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (arr[mid] <= target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Mengurutkan ulang sheet berdasarkan kolom tanggal (menaik). Dipanggil
// otomatis setiap kali ada data baru ditambah/diubah di Absensi & KegiatanLuar,
// supaya filterByTanggalOptimized() di atas selalu valid melakukan binary
// search. Baris kosong di bawah data tidak ikut tersentuh.
function sortSheetByDate(sheet, dateCol) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return; // 0 atau 1 baris data - tidak perlu diurutkan
  var lastCol = sheet.getLastColumn();
  sheet.getRange(2, 1, lastRow - 1, lastCol).sort({ column: dateCol, ascending: true });
}

// Gabungan: libur nasional (otomatis dari Google Calendar) + libur manual (dari sheet Libur)
function getGabunganLibur() {
  var manual = sheetToObjects(getOrCreateLiburSheet()).map(function (m) {
    m.Sumber = 'Manual';
    return m;
  });

  var nasional = [];
  var thisYear = new Date().getFullYear();
  // Ambil 2 tahun ke belakang & 2 tahun ke depan supaya navigasi kalender aman
  for (var y = thisYear - 2; y <= thisYear + 2; y++) {
    nasional = nasional.concat(getLiburNasional(y));
  }

  return nasional.concat(manual);
}

// Libur nasional Indonesia diambil dari kalender publik Google.
// Hasilnya disimpan sementara (cache 6 jam) supaya tidak lambat setiap dibuka.
function getLiburNasional(year) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'libur_nasional_' + year;
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var hasil = [];
  try {
    var kalender = CalendarApp.getCalendarById('en.indonesian#holiday@group.v.calendar.google.com');
    if (kalender) {
      var events = kalender.getEvents(new Date(year, 0, 1), new Date(year, 11, 31, 23, 59, 59));
      hasil = events.map(function (ev) {
        return {
          Tanggal: Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'yyyy-MM-dd'),
          Keterangan: ev.getTitle(),
          Sumber: 'Nasional'
        };
      });
    }
    // Hanya simpan ke cache kalau proses di atas berhasil (tidak error).
    // Kalau gagal (misal izin belum aktif), JANGAN di-cache supaya percobaan
    // berikutnya tetap mencoba lagi, bukan terus-menerus mengembalikan kosong.
    cache.put(cacheKey, JSON.stringify(hasil), 21600); // 6 jam
  } catch (err) {
    hasil = [];
  }

  return hasil;
}

// Jalankan SEKALI lewat tombol Run kalau Anda perlu memaksa dashboard
// mengambil ulang data libur nasional dari awal (misal setelah baru
// selesai mengaktifkan izin Calendar, supaya cache kosong yang lama dibuang).
function bersihkanCacheLibur() {
  var cache = CacheService.getScriptCache();
  var thisYear = new Date().getFullYear();
  for (var y = thisYear - 2; y <= thisYear + 2; y++) {
    cache.remove('libur_nasional_' + y);
  }
  Logger.log('Cache libur nasional sudah dibersihkan untuk tahun ' + (thisYear - 2) + '-' + (thisYear + 2) + '.');
}

function addLibur(d) {
  var sheet = getOrCreateLiburSheet();
  var row = sheet.getLastRow() + 1;
  writeTanggalAsText(sheet, row, 1, d.Tanggal);
  sheet.getRange(row, 2).setValue(d.Keterangan || '');
  return { _row: row, Tanggal: d.Tanggal, Keterangan: d.Keterangan || '', Sumber: 'Manual' };
}

function addAbsensi(d) {
  var sheet = getSheet(SHEET_ABSENSI);
  var row = sheet.getLastRow() + 1;
  writeTanggalAsText(sheet, row, 1, d.Tanggal);
  sheet.getRange(row, 2, 1, 3).setValues([[d.Nama, d.Status, d.Keterangan || '']]);
  sortSheetByDate(sheet, 1);
  // Baris yang baru ditambah bisa saja sudah berpindah posisi setelah
  // diurutkan - cari lagi baris aslinya sebelum dikembalikan ke frontend.
  var rowSekarang = cariBarisAbsensi(sheet, d.Tanggal, d.Nama, d.Status, d.Keterangan || '');
  return { _row: rowSekarang, Tanggal: d.Tanggal, Nama: d.Nama, Status: d.Status, Keterangan: d.Keterangan || '' };
}

// Setelah sortSheetByDate() dijalankan, baris yang baru saja ditulis bisa
// pindah posisi - fungsi ini mencarinya kembali berdasarkan isinya (dipanggil
// tepat setelah menulis, jadi kombinasi Tanggal+Nama+Status+Keterangan ini
// pasti masih unik/baru saja ditulis).
function cariBarisAbsensi(sheet, tanggal, nama, status, keterangan) {
  var data = sheetToObjects(sheet);
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if (r.Tanggal === tanggal && r.Nama === nama && r.Status === status && (r.Keterangan || '') === keterangan) {
      return r._row;
    }
  }
  return sheet.getLastRow(); // fallback (seharusnya tidak pernah terjadi)
}

// Mencatat 1 pegawai tidak hadir untuk banyak tanggal sekaligus (cuti/sakit panjang).
// d = { Nama, Status, Keterangan, TanggalMulai, TanggalSelesai } (format yyyy-MM-dd)
function addAbsensiRange(d) {
  var sheet = getSheet(SHEET_ABSENSI);
  var mulai = parseTanggalText(d.TanggalMulai);
  var selesai = parseTanggalText(d.TanggalSelesai);
  var jumlahHari = Math.round((selesai - mulai) / (24 * 60 * 60 * 1000)) + 1;
  if (jumlahHari < 1 || jumlahHari > 366) {
    throw new Error('Rentang tanggal tidak valid.');
  }

  var rows = [];
  for (var i = 0; i < jumlahHari; i++) {
    var tgl = new Date(mulai.getTime() + i * 24 * 60 * 60 * 1000);
    var tglText = Utilities.formatDate(tgl, TIMEZONE, 'yyyy-MM-dd');
    rows.push([tglText, d.Nama, d.Status, d.Keterangan || '']);
  }

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, 4).setValues(rows);
  sortSheetByDate(sheet, 1);
  // Tidak perlu lagi mencari _row akhir tiap baris di sini - setelah
  // diurutkan, frontend akan mengambil ulang data segar dari server
  // (lihat sendAction() di forms.js) alih-alih menempel _row lama.
  return { jumlah: rows.length, Nama: d.Nama, Status: d.Status };
}

// Mengubah teks "yyyy-MM-dd" jadi objek Date (tengah malam, sesuai TIMEZONE puskesmas)
function parseTanggalText(tglText) {
  var bagian = tglText.split('-');
  return new Date(Number(bagian[0]), Number(bagian[1]) - 1, Number(bagian[2]));
}

function updateAbsensi(d) {
  var sheet = getSheet(SHEET_ABSENSI);
  writeTanggalAsText(sheet, d._row, 1, d.Tanggal);
  sheet.getRange(d._row, 2, 1, 3).setValues([[d.Nama, d.Status, d.Keterangan || '']]);
  sortSheetByDate(sheet, 1);
  var rowSekarang = cariBarisAbsensi(sheet, d.Tanggal, d.Nama, d.Status, d.Keterangan || '');
  return { _row: rowSekarang, Tanggal: d.Tanggal, Nama: d.Nama, Status: d.Status, Keterangan: d.Keterangan || '' };
}

function addKegiatan(d) {
  var sheet = getSheet(SHEET_KEGIATAN);
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setValue(d.NoST || '');
  writeTanggalAsText(sheet, row, 2, d.Tanggal);
  sheet.getRange(row, 3, 1, 3).setValues([[d.NamaKegiatan, d.Lokasi, d.Nama]]);
  sheet.getRange(row, 6).setValue(new Date().toISOString());
  sortSheetByDate(sheet, 2);
  return true;
}

// Menambahkan 1 kegiatan yang sama untuk beberapa pegawai sekaligus.
// Setiap pegawai jadi 1 baris terpisah di sheet KegiatanLuar.
function addKegiatanMulti(d) {
  var sheet = getSheet(SHEET_KEGIATAN);
  var namaList = d.NamaList || [];
  if (namaList.length === 0) return true;

  // Waktu input dicatat (kolom F) supaya urutan "siapa lebih dulu diinput"
  // tetap bisa dilacak akurat walau baris nanti berpindah posisi akibat
  // pengurutan otomatis berdasarkan tanggal - dipakai saat penomoran surat
  // tugas otomatis (lihat beriNomorSuratTugas()) untuk kegiatan di tanggal
  // yang sama. Sama untuk semua baris di kelompok ini (1 surat = 1 waktu).
  var waktuInput = new Date().toISOString();
  var startRow = sheet.getLastRow() + 1;
  var rows = namaList.map(function (nama) {
    return [d.NoST || '', String(d.Tanggal), d.NamaKegiatan, d.Lokasi, nama, waktuInput];
  });

  // Pastikan kolom Tanggal (kolom ke-2) dibaca sebagai teks, bukan Date,
  // sebelum data dimasukkan - dilakukan sekali untuk semua baris sekaligus.
  sheet.getRange(startRow, 2, rows.length, 1).setNumberFormat('@');
  // Satu panggilan setValues untuk semua baris sekaligus (jauh lebih cepat
  // daripada menulis baris demi baris satu-satu).
  sheet.getRange(startRow, 1, rows.length, 6).setValues(rows);
  sortSheetByDate(sheet, 2);
  // Sama seperti addAbsensiRange - frontend mengambil ulang data segar
  // setelah ini (lihat sendAction() di forms.js), jadi tidak perlu lagi
  // mencari _row akhir tiap baris di sini.
  return { jumlah: rows.length, NamaKegiatan: d.NamaKegiatan, Lokasi: d.Lokasi };
}

function updateKegiatan(d) {
  var sheet = getSheet(SHEET_KEGIATAN);
  sheet.getRange(d._row, 1).setValue(d.NoST || '');
  writeTanggalAsText(sheet, d._row, 2, d.Tanggal);
  sheet.getRange(d._row, 3, 1, 3).setValues([[d.NamaKegiatan, d.Lokasi, d.Nama]]);
  sortSheetByDate(sheet, 2);
  var rowSekarang = cariBarisKegiatan(sheet, d.NoST || '', d.Tanggal, d.NamaKegiatan, d.Lokasi, d.Nama);
  return { _row: rowSekarang, NoST: d.NoST || '', Tanggal: d.Tanggal, NamaKegiatan: d.NamaKegiatan, Lokasi: d.Lokasi, Nama: d.Nama };
}

// Sama seperti cariBarisAbsensi() - dipakai setelah sortSheetByDate() supaya
// _row yang dikembalikan ke frontend selalu akurat.
function cariBarisKegiatan(sheet, noST, tanggal, namaKegiatan, lokasi, nama) {
  var data = sheetToObjects(sheet);
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if ((r.NoST || '') === noST && r.Tanggal === tanggal && r.NamaKegiatan === namaKegiatan &&
        r.Lokasi === lokasi && r.Nama === nama) {
      return r._row;
    }
  }
  return sheet.getLastRow(); // fallback (seharusnya tidak pernah terjadi)
}

// Set format kolom jadi Plain Text ("@") SEBELUM isi nilainya, supaya
// Google Sheets tidak otomatis mengubah teks tanggal jadi tipe Date
// (yang berisiko geser hari akibat perbedaan zona waktu).
function writeTanggalAsText(sheet, row, col, tanggal) {
  sheet.getRange(row, col).setNumberFormat('@').setValue(String(tanggal));
}

// Jalankan fungsi ini SEKALI lewat tombol "Run" untuk memicu Google meminta
// izin akses ke Google Calendar (dibutuhkan untuk fitur libur nasional otomatis).
// Setelah dijalankan, lihat "Execution log" di bawah — kalau muncul daftar
// tanggal libur, berarti izinnya sudah aktif dan fitur ini sudah bisa dipakai.
function testAmbilLiburNasional() {
  // Sengaja TANPA try-catch di sini supaya kalau ada error / minta izin,
  // pesannya tampil apa adanya di Execution log (tidak disembunyikan).
  var kalender = CalendarApp.getCalendarById('en.indonesian#holiday@group.v.calendar.google.com');
  Logger.log('Kalender ditemukan: ' + (kalender ? kalender.getName() : 'TIDAK DITEMUKAN (null)'));

  var tahun = new Date().getFullYear();
  var events = kalender.getEvents(new Date(tahun, 0, 1), new Date(tahun, 11, 31, 23, 59, 59));
  Logger.log('Jumlah event ditemukan: ' + events.length);
  if (events.length > 0) {
    Logger.log('Contoh: ' + events[0].getTitle() + ' - ' + events[0].getStartTime());
  }
}
// Jalankan fungsi ini SEKALI SAJA lewat tombol "Run" di Apps Script
// (pilih fungsi ini dulu di dropdown sebelah tombol Run) untuk merapikan
// data tanggal lama yang mungkin sudah kadung berubah jadi tipe Date,
// termasuk baris yang sempat diketik manual langsung di Sheets.
function perbaikiFormatTanggalLama() {
  [ [SHEET_ABSENSI, 1], [SHEET_KEGIATAN, 2] ].forEach(function (cfg) {
    var sheet = getSheet(cfg[0]);
    var col = cfg[1];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var range = sheet.getRange(2, col, lastRow - 1, 1);
    var values = range.getValues();
    var fixed = values.map(function (r) {
      var v = r[0];
      if (v instanceof Date) {
        return [Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd')];
      }
      return [v];
    });
    range.setNumberFormat('@').setValues(fixed);
  });
}

// Menyimpan data Apel Pagi & Apel Siang untuk 1 tanggal sekaligus.
// Caranya: hapus dulu semua catatan lama di tanggal itu, lalu tulis ulang
// dari daftar nama yang baru dicentang admin. Ini paling aman karena admin
// selalu mengirim daftar LENGKAP siapa saja yang tidak ikut hari itu
// (bukan menambah satu-satu), jadi tidak perlu melacak baris mana yang
// berubah - cukup ganti semua data hari itu dengan versi terbaru.
function syncApelHari(d) {
  var sheet = getOrCreateApelSheet();
  var existing = sheetToObjects(sheet);

  // Baris untuk tanggal LAIN tetap dipertahankan apa adanya.
  var rows = existing
    .filter(function (r) { return r.Tanggal !== d.Tanggal; })
    .map(function (r) { return [r.Tanggal, r.Nama, r.Sesi, r.Keterangan || '']; });

  // Baris untuk tanggal ini ditulis ulang dari daftar terbaru yang dikirim admin.
  (d.PagiList || []).forEach(function (nama) { rows.push([d.Tanggal, nama, 'Pagi', '']); });
  (d.SiangList || []).forEach(function (nama) { rows.push([d.Tanggal, nama, 'Siang', '']); });

  // Urutkan berdasarkan Tanggal sebelum ditulis ulang - sheet Apel harus
  // selalu terurut menaik (sama seperti Absensi & KegiatanLuar) supaya
  // pembacaan data per-bulan (filterByTanggalOptimized) tetap valid.
  rows.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });

  // Kosongkan dulu SELURUH isi data lama (bukan hapus baris satu-satu -
  // clearContent 1x jauh lebih cepat daripada deleteRow berkali-kali,
  // dan kecepatannya tidak akan menurun walau datanya sudah bertahun-tahun).
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 1).setNumberFormat('@'); // kolom Tanggal sebagai teks
    sheet.getRange(2, 1, rows.length, 4).setValues(rows); // satu kali tulis untuk semua baris
  }

  // Kembalikan seluruh data Apel terbaru (dataset ini biasanya kecil,
  // jadi aman dan lebih simpel daripada melacak nomor baris satu-satu).
  return sheetToObjects(sheet);
}

// PENTING - jalankan fungsi ini SEKALI SAJA lewat tombol "Run" di Apps Script
// (pilih fungsi ini dulu di dropdown sebelah tombol Run) SEBELUM men-deploy
// versi kode ini. Ini mengurutkan data yang SUDAH ADA sekarang berdasarkan
// tanggal - wajib dilakukan sekali di awal, karena pembacaan data yang lebih
// cepat (filterByTanggalOptimized) di kode ini mengasumsikan data sudah urut.
// Setelah ini dijalankan sekali, sheet akan otomatis tetap terurut dengan
// sendirinya setiap kali ada data baru disimpan lewat dashboard.
// PENTING - jalankan fungsi ini SEKALI SAJA lewat tombol "Run" di Apps Script
// SEBELUM men-deploy versi kode ini (boleh sekaligus dengan urutkanUlangSemuaDataLama).
// Ini menyiapkan kolom F "WaktuInput" di sheet KegiatanLuar - dipakai untuk
// mencatat kapan setiap kegiatan diinput, supaya penomoran surat tugas
// otomatis (beriNomorSuratTugas) bisa tahu urutan mana yang lebih dulu
// diinput kalau ada beberapa kegiatan di tanggal yang sama.
function siapkanKolomWaktuInput() {
  var sheet = getSheet(SHEET_KEGIATAN);
  var headerCell = sheet.getRange(1, 6);
  if (!headerCell.getValue()) {
    headerCell.setValue('WaktuInput');
  }
  Logger.log('Kolom F (WaktuInput) sudah disiapkan di sheet KegiatanLuar.');
}

function urutkanUlangSemuaDataLama() {
  sortSheetByDate(getSheet(SHEET_ABSENSI), 1);
  sortSheetByDate(getSheet(SHEET_KEGIATAN), 2);
  sortSheetByDate(getOrCreateApelSheet(), 1);
  Logger.log('Selesai - sheet Absensi, KegiatanLuar, dan Apel sudah diurutkan berdasarkan tanggal.');
}

function deleteRow(sheetName, rowNumber) {
  getSheet(sheetName).deleteRow(rowNumber);
  return true;
}

// ============================================================
// PENOMORAN SURAT TUGAS OTOMATIS (BATCH)
// ============================================================
// Aturan (sudah disepakati dengan pengguna dashboard):
// - Nomor polos berurut ("094", "095", ...) - BUKAN per baris pegawai,
//   tapi per KELOMPOK kegiatan (Tanggal+NamaKegiatan+Lokasi yang sama =
//   1 surat tugas yang sama, walau diikuti beberapa pegawai/baris).
// - Diurutkan berdasarkan TANGGAL KEGIATAN (bukan tanggal input). Kalau
//   tanggalnya sama, yang paling dulu diinput ke sistem (WaktuInput) duluan
//   dapat nomor.
// - Nomor di-reset ke 1 lagi tiap tahun baru, berdasarkan tahun Tanggal
//   Kegiatan (bukan tahun saat tombol "Beri Nomor" ditekan).
// - Kegiatan susulan yang tanggalnya lebih awal dari kegiatan yang sudah
//   diberi nomor sebelumnya (tanggal itu sudah "closed") tidak menggeser
//   nomor yang sudah terpakai - dapat nomor SISIPAN yang menempel di nomor
//   TERAKHIR yang sudah terpakai tahun itu (nomor terakhir 442 -> sisipan
//   "442.a", sisipan berikutnya di tahun yang sama "442.b", dst).
// - Dipanggil per-tanggal dari tombol "Beri Nomor" di pop-up detail tanggal
//   (bukan tombol global) - tanggalTarget WAJIB diisi, cuma kegiatan di
//   tanggal itu yang diproses. Kegiatan menunggu nomor di tanggal LAIN
//   (walau sudah lama diinput) TIDAK ikut kena nomor sampai tombol di
//   tanggal itu sendiri yang ditekan.
function beriNomorSuratTugas(tanggalTarget) {
  var sheet = getSheet(SHEET_KEGIATAN);
  var semua = sheetToObjects(sheet);

  // Kelompokkan baris-baris jadi 1 "surat tugas" per Tanggal+NamaKegiatan+Lokasi.
  var groupsMap = {};
  semua.forEach(function (r) {
    var key = r.Tanggal + '|' + (r.NamaKegiatan || '') + '|' + (r.Lokasi || '');
    if (!groupsMap[key]) {
      groupsMap[key] = {
        Tanggal: r.Tanggal, NamaKegiatan: r.NamaKegiatan, Lokasi: r.Lokasi,
        NoST: r.NoST || '', waktuInputMin: r.WaktuInput || '', rows: []
      };
    }
    groupsMap[key].rows.push(r);
    // Ambil waktu input paling awal di antara baris-baris kelompok ini (untuk tie-break).
    if (r.WaktuInput && (!groupsMap[key].waktuInputMin || r.WaktuInput < groupsMap[key].waktuInputMin)) {
      groupsMap[key].waktuInputMin = r.WaktuInput;
    }
  });
  var allGroups = Object.keys(groupsMap).map(function (k) { return groupsMap[k]; });

  // Hanya kegiatan di TANGGAL TARGET yang diproses - kegiatan menunggu nomor
  // di tanggal lain dibiarkan (baru diproses saat tombol di tanggal itu ditekan).
  var pendingGroups = allGroups.filter(function (g) { return !g.NoST && g.Tanggal === tanggalTarget; });
  if (pendingGroups.length === 0) {
    return { jumlahDiberiNomor: 0, detail: [] };
  }
  var numberedGroups = allGroups.filter(function (g) { return !!g.NoST; });

  // Kelompokkan pending per TAHUN (dari Tanggal Kegiatan) - nomor reset tiap tahun.
  var pendingByYear = {};
  pendingGroups.forEach(function (g) {
    var tahun = g.Tanggal.substring(0, 4);
    if (!pendingByYear[tahun]) pendingByYear[tahun] = [];
    pendingByYear[tahun].push(g);
  });

  var hasilDetail = [];
  var perubahan = []; // {row, value} - dikumpulkan dulu, ditulis sekaligus di akhir

  var urutkan = function (a, b) {
    if (a.Tanggal !== b.Tanggal) return a.Tanggal < b.Tanggal ? -1 : 1;
    var wa = a.waktuInputMin || '', wb = b.waktuInputMin || '';
    if (wa !== wb) return wa < wb ? -1 : 1;
    return 0;
  };

  Object.keys(pendingByYear).sort().forEach(function (tahun) {
    // Cari nomor TERAKHIR yang sudah terpakai tahun ini (hanya nomor polos,
    // sisipan tidak dihitung) dan tanggal kegiatan paling akhir yang sudah
    // bernomor tahun ini (jadi batas "closed" - lebih awal dari ini = susulan).
    var lastNumber = 0;
    var watermarkDate = '';
    numberedGroups.forEach(function (g) {
      if (g.Tanggal.substring(0, 4) !== tahun) return;
      if (/^\d+$/.test(g.NoST)) {
        var n = parseInt(g.NoST, 10);
        if (n > lastNumber) lastNumber = n;
        if (g.Tanggal > watermarkDate) watermarkDate = g.Tanggal;
      }
    });

    var groupsTahunIni = pendingByYear[tahun];
    var normal = groupsTahunIni.filter(function (g) { return !watermarkDate || g.Tanggal > watermarkDate; });
    var susulan = groupsTahunIni.filter(function (g) { return watermarkDate && g.Tanggal <= watermarkDate; });
    normal.sort(urutkan);
    susulan.sort(urutkan);

    // 1) Kegiatan MAJU (tanggal lebih baru dari yang sudah closed) - nomor urut biasa.
    normal.forEach(function (g) {
      lastNumber += 1;
      var nomor = padNomor(lastNumber);
      g.rows.forEach(function (r) { perubahan.push({ row: r._row, value: nomor }); });
      hasilDetail.push({ Tanggal: g.Tanggal, NamaKegiatan: g.NamaKegiatan, Lokasi: g.Lokasi, NoST: nomor });
    });

    // 2) Kegiatan SUSULAN - nomor sisipan, menempel di nomor TERAKHIR yang
    //    sudah terpakai tahun ini (termasuk hasil poin 1 di atas kalau ada).
    if (susulan.length > 0) {
      var hurufTerpakai = {}; // basis (misal "445") -> huruf terakhir yang sudah dipakai
      numberedGroups.forEach(function (g) {
        if (g.Tanggal.substring(0, 4) !== tahun) return;
        var m = /^(\d+)\.([a-zA-Z])$/.exec(g.NoST);
        if (m) {
          var basis = m[1];
          var huruf = m[2].toLowerCase();
          if (!hurufTerpakai[basis] || huruf > hurufTerpakai[basis]) hurufTerpakai[basis] = huruf;
        }
      });
      var basisTerakhir = padNomor(lastNumber);
      susulan.forEach(function (g) {
        var hurufSebelumnya = hurufTerpakai[basisTerakhir];
        var hurufBaru = hurufSebelumnya ? String.fromCharCode(hurufSebelumnya.charCodeAt(0) + 1) : 'a';
        if (hurufBaru > 'z') throw new Error('Nomor sisipan untuk ' + basisTerakhir + ' sudah penuh (lebih dari 26) - perlu penanganan manual.');
        hurufTerpakai[basisTerakhir] = hurufBaru;
        var nomor = basisTerakhir + '.' + hurufBaru;
        g.rows.forEach(function (r) { perubahan.push({ row: r._row, value: nomor }); });
        hasilDetail.push({ Tanggal: g.Tanggal, NamaKegiatan: g.NamaKegiatan, Lokasi: g.Lokasi, NoST: nomor });
      });
    }
  });

  // Tulis semua nomor baru sekaligus ke sheet (tidak mengganggu urutan tanggal,
  // karena hanya kolom NoST/kolom 1 yang ditulis - tidak perlu sortSheetByDate lagi).
  perubahan.forEach(function (item) {
    sheet.getRange(item.row, 1).setValue(item.value);
  });

  hasilDetail.sort(function (a, b) { return a.Tanggal < b.Tanggal ? -1 : (a.Tanggal > b.Tanggal ? 1 : 0); });
  return { jumlahDiberiNomor: hasilDetail.length, detail: hasilDetail };
}

// Angka -> teks 3 digit ("94" -> "094"). Kalau lebih dari 999, tetap aman
// (tidak terpotong), cuma jadi 4 digit ("1000") - bukan perilaku salah.
function padNomor(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return s;
}
