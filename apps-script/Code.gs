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
 * ============================================================
 */

// Ganti PIN ini kapan saja sesuai kebutuhan Anda
const ADMIN_PIN = '4dministrasi';

const SHEET_PEGAWAI = 'Pegawai';
const SHEET_ABSENSI = 'Absensi';
const SHEET_KEGIATAN = 'KegiatanLuar';
const SHEET_LIBUR = 'Libur';

// Dipakai tetap (Kupang = WITA) supaya tanggal tidak pernah geser
// akibat perbedaan zona waktu antara Sheets dan project Apps Script.
const TIMEZONE = 'Asia/Makassar';

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || 'data';
    if (action === 'data') {
      return jsonResponse(getAllData());
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

    var result;
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
      default:
        return jsonResponse({ success: false, error: 'Aksi tidak dikenal: ' + action });
    }
    return jsonResponse({ success: true, result: result, data: getAllData() });
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

function getAllData() {
  return {
    pegawai: sheetToObjects(getSheet(SHEET_PEGAWAI)),
    absensi: sheetToObjects(getSheet(SHEET_ABSENSI)),
    kegiatanLuar: sheetToObjects(getSheet(SHEET_KEGIATAN)),
    libur: getGabunganLibur()
  };
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
  return true;
}

function addAbsensi(d) {
  var sheet = getSheet(SHEET_ABSENSI);
  var row = sheet.getLastRow() + 1;
  writeTanggalAsText(sheet, row, 1, d.Tanggal);
  sheet.getRange(row, 2, 1, 3).setValues([[d.Nama, d.Status, d.Keterangan || '']]);
  return true;
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
  return { jumlahHari: rows.length };
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
  return true;
}

function addKegiatan(d) {
  var sheet = getSheet(SHEET_KEGIATAN);
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setValue(d.NoST || '');
  writeTanggalAsText(sheet, row, 2, d.Tanggal);
  sheet.getRange(row, 3, 1, 3).setValues([[d.NamaKegiatan, d.Lokasi, d.Nama]]);
  return true;
}

// Menambahkan 1 kegiatan yang sama untuk beberapa pegawai sekaligus.
// Setiap pegawai jadi 1 baris terpisah di sheet KegiatanLuar.
function addKegiatanMulti(d) {
  var sheet = getSheet(SHEET_KEGIATAN);
  var namaList = d.NamaList || [];
  namaList.forEach(function (nama) {
    var row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1).setValue(d.NoST || '');
    writeTanggalAsText(sheet, row, 2, d.Tanggal);
    sheet.getRange(row, 3, 1, 3).setValues([[d.NamaKegiatan, d.Lokasi, nama]]);
  });
  return true;
}

function updateKegiatan(d) {
  var sheet = getSheet(SHEET_KEGIATAN);
  sheet.getRange(d._row, 1).setValue(d.NoST || '');
  writeTanggalAsText(sheet, d._row, 2, d.Tanggal);
  sheet.getRange(d._row, 3, 1, 3).setValues([[d.NamaKegiatan, d.Lokasi, d.Nama]]);
  return true;
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

function deleteRow(sheetName, rowNumber) {
  getSheet(sheetName).deleteRow(rowNumber);
  return true;
}
