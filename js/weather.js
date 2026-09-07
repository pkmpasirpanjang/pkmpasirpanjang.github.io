// ============================================================
// CUACA 5 KELURAHAN — kartu depan (di bawah ticker) + popup lengkap
// ============================================================
// Pakai Open-Meteo (https://open-meteo.com) - API cuaca gratis, tidak
// perlu API key/signup. Endpoint /v1/forecast dipanggil langsung dari
// browser (CORS diizinkan Open-Meteo untuk request dari mana saja).

// Koordinat kelurahan. Pasir Panjang & yang berlabel "approx" dari
// pengguna dipakai apa adanya; koordinat lain diambil dari data lokasi
// publik. Kalau ternyata kurang presisi, tinggal ganti angka lat/lon di
// sini - tidak ada tempat lain yang perlu diubah.
const KELURAHAN_LIST = [
  { nama: "Nefonaek", lat: -10.15396, lon: 123.60400 },
  { nama: "Pasir Panjang", lat: -10.151814, lon: 123.602248 },
  { nama: "Fatubesi", lat: -10.15405, lon: 123.59392 },
  { nama: "Oeba", lat: -10.160231, lon: 123.593793 },
  { nama: "Tode Kisar", lat: -10.158263, lon: 123.584698 }
];
const KELURAHAN_PUSKESMAS_IDX = 0; // "Nefonaek" - lokasi UPTD Puskesmas

// Kode cuaca WMO (dipakai Open-Meteo) -> ikon & label singkat Indonesia.
const WEATHER_CODE_INFO = {
  0: { icon: "☀️", label: "Cerah" },
  1: { icon: "🌤️", label: "Cerah Berawan" },
  2: { icon: "⛅", label: "Berawan Sebagian" },
  3: { icon: "☁️", label: "Mendung" },
  45: { icon: "🌫️", label: "Berkabut" },
  48: { icon: "🌫️", label: "Berkabut" },
  51: { icon: "🌦️", label: "Gerimis Ringan" },
  53: { icon: "🌦️", label: "Gerimis" },
  55: { icon: "🌦️", label: "Gerimis Lebat" },
  56: { icon: "🌦️", label: "Gerimis Beku" },
  57: { icon: "🌦️", label: "Gerimis Beku Lebat" },
  61: { icon: "🌧️", label: "Hujan Ringan" },
  63: { icon: "🌧️", label: "Hujan" },
  65: { icon: "🌧️", label: "Hujan Lebat" },
  66: { icon: "🌧️", label: "Hujan Beku" },
  67: { icon: "🌧️", label: "Hujan Beku Lebat" },
  71: { icon: "🌨️", label: "Salju Ringan" },
  73: { icon: "🌨️", label: "Salju" },
  75: { icon: "🌨️", label: "Salju Lebat" },
  77: { icon: "🌨️", label: "Butir Salju" },
  80: { icon: "🌧️", label: "Hujan Deras Sesaat" },
  81: { icon: "🌧️", label: "Hujan Deras" },
  82: { icon: "⛈️", label: "Hujan Sangat Deras" },
  85: { icon: "🌨️", label: "Hujan Salju Ringan" },
  86: { icon: "🌨️", label: "Hujan Salju Lebat" },
  95: { icon: "⛈️", label: "Badai Petir" },
  96: { icon: "⛈️", label: "Badai Petir + Es" },
  99: { icon: "⛈️", label: "Badai Petir Lebat + Es" }
};
function weatherCodeInfo(code) {
  return WEATHER_CODE_INFO[code] || { icon: "🌡️", label: "Tidak diketahui" };
}

// Kamus kata sifat untuk ticker lucu di dalam popup - urutan prioritas
// kalau beberapa kondisi terpenuhi sekaligus: hujan > angin kencang >
// panas terik > mendung > cerah normal (default). Angka batas (32°C,
// 25km/jam) bisa disesuaikan lagi kalau setelah dicoba kurang pas.
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const CLOUDY_CODES = new Set([2, 3, 45, 48]);
function getKataSifatCuaca(code, tempMax, windMax) {
  if (RAIN_CODES.has(code)) return "kehujanan";
  if (windMax >= 25) return "diterpa angin sepoi-sepoi";
  if ((code === 0 || code === 1) && tempMax >= 32) return "kepanasan";
  if (CLOUDY_CODES.has(code)) return "menikmati adem mendung";
  return "menikmati cuaca cerah";
}

const weatherState = {
  activeKelurahanIdx: KELURAHAN_PUSKESMAS_IDX,
  activeDateOffset: 0, // 0 = hari ini
  cache: {}            // idx kelurahan -> data forecast 16 hari (sekali fetch per sesi)
};

async function fetchWeatherKelurahan(idx) {
  if (weatherState.cache[idx]) return weatherState.cache[idx];
  const k = KELURAHAN_LIST[idx];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${k.lat}&longitude=${k.lon}` +
    `&current=weather_code,temperature_2m,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
    `&timezone=Asia%2FMakassar&forecast_days=16`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gagal memuat cuaca");
  const json = await res.json();
  const data = {
    dates: json.daily.time,
    code: json.daily.weather_code,
    tempMax: json.daily.temperature_2m_max,
    tempMin: json.daily.temperature_2m_min,
    windMax: json.daily.wind_speed_10m_max,
    // Kondisi SAAT INI (bukan ringkasan sepanjang hari) - dipakai khusus
    // untuk "Hari Ini", supaya tidak menyesatkan. Kode cuaca harian dari
    // Open-Meteo itu merangkum kejadian PALING SIGNIFIKAN sepanjang hari -
    // jadi kalau nanti sore diprediksi gerimis sebentar, kode harian bisa
    // tertulis "Gerimis" walau sekarang ini sedang terik/cerah sekali.
    current: json.current ? {
      code: json.current.weather_code,
      temp: json.current.temperature_2m,
      wind: json.current.wind_speed_10m
    } : null
  };
  weatherState.cache[idx] = data;
  return data;
}

// ============================================================
// KARTU DEPAN (di bawah ticker)
// ============================================================
async function loadFrontWeatherCard() {
  try {
    const data = await fetchWeatherKelurahan(KELURAHAN_PUSKESMAS_IDX);
    const info = weatherCodeInfo(data.current ? data.current.code : data.code[0]);
    document.getElementById("weatherCardIcon").textContent = info.icon;
    document.getElementById("weatherCardDesc").textContent = info.label;
    document.getElementById("weatherCardTemp").textContent = `${Math.round(data.tempMax[0])}°/${Math.round(data.tempMin[0])}°`;
  } catch (err) {
    document.getElementById("weatherCardDesc").textContent = "Cuaca tidak tersedia";
  }
}

// ============================================================
// POPUP CUACA (5 tab kelurahan + navigasi tanggal)
// ============================================================
function setupWeatherModal() {
  const tabsEl = document.getElementById("weatherKelurahanTabs");
  tabsEl.innerHTML = KELURAHAN_LIST.map((k, i) =>
    `<button type="button" class="weather-tab" data-idx="${i}">${k.nama}</button>`
  ).join("");
  tabsEl.querySelectorAll(".weather-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      weatherState.activeKelurahanIdx = Number(btn.dataset.idx);
      renderWeatherPopup();
    });
  });

  document.getElementById("weatherPrevDate").addEventListener("click", () => {
    if (weatherState.activeDateOffset > 0) {
      weatherState.activeDateOffset--;
      renderWeatherPopup();
    }
  });
  document.getElementById("weatherNextDate").addEventListener("click", () => {
    weatherState.activeDateOffset++;
    renderWeatherPopup();
  });

  document.getElementById("weatherCard").addEventListener("click", () => {
    weatherState.activeKelurahanIdx = KELURAHAN_PUSKESMAS_IDX;
    weatherState.activeDateOffset = 0;
    showModal("weatherModal");
    renderWeatherPopup();
  });

  // Ticker lucu tidak perlu terus jalan di belakang layar setelah popup ditutup.
  const weatherModalEl = document.getElementById("weatherModal");
  weatherModalEl.querySelector(".js-close-form").addEventListener("click", stopWeatherFunTicker);
  weatherModalEl.addEventListener("click", (e) => {
    if (e.target === weatherModalEl) stopWeatherFunTicker();
  });
}

async function renderWeatherPopup() {
  const idx = weatherState.activeKelurahanIdx;
  document.querySelectorAll(".weather-tab").forEach(btn =>
    btn.classList.toggle("active", Number(btn.dataset.idx) === idx)
  );
  document.getElementById("weatherPopupDesc").textContent = "Memuat...";
  stopWeatherFunTicker();

  let data;
  try {
    data = await fetchWeatherKelurahan(idx);
  } catch (err) {
    document.getElementById("weatherPopupDesc").textContent = "Gagal memuat data cuaca.";
    return;
  }

  const maxOffset = data.dates.length - 1;
  if (weatherState.activeDateOffset > maxOffset) weatherState.activeDateOffset = maxOffset;
  if (weatherState.activeDateOffset < 0) weatherState.activeDateOffset = 0;
  const offset = weatherState.activeDateOffset;

  document.getElementById("weatherPrevDate").disabled = offset <= 0;
  document.getElementById("weatherNextDate").disabled = offset >= maxOffset;

  const tglKey = data.dates[offset]; // "yyyy-MM-dd" dari Open-Meteo
  const [yy, mm, dd] = tglKey.split("-").map(Number);
  document.getElementById("weatherDateLabel").textContent =
    offset === 0 ? "Hari Ini" : `${dd} ${BULAN_ID[mm - 1]} ${yy}`;

  const code = (offset === 0 && data.current) ? data.current.code : data.code[offset];
  const tMax = data.tempMax[offset];
  const tMin = data.tempMin[offset];
  const wMax = (offset === 0 && data.current) ? data.current.wind : data.windMax[offset];
  const info = weatherCodeInfo(code);

  document.getElementById("weatherPopupIcon").textContent = info.icon;
  document.getElementById("weatherPopupTempMax").textContent = Math.round(tMax);
  document.getElementById("weatherPopupTempMin").textContent = Math.round(tMin);
  document.getElementById("weatherPopupDesc").textContent = info.label;

  // Pastikan data kegiatan luar bulan terkait sudah tersedia (tanggal cuaca
  // bisa sampai 16 hari ke depan, berpotensi masuk bulan berikutnya).
  await ensureMonthsLoaded([tglKey.slice(0, 7)]);

  const kelurahanNama = KELURAHAN_LIST[idx].nama.toLowerCase();
  const kegiatanMatchKelurahan = (state.data.kegiatanLuar || []).filter(k => {
    if (k.Tanggal !== tglKey) return false;
    const lokasi = (k.Lokasi || "").toLowerCase();
    return lokasi.includes(kelurahanNama) || (kelurahanNama.length > 2 && kelurahanNama.includes(lokasi));
  });
  // Ticker lucu TIDAK dibatasi cuma kelurahan yang sedang dilihat - tampil
  // untuk SEMUA kegiatan luar di tanggal ini lintas lokasi, karena tiap
  // baris tickernya sendiri sudah menyebutkan lokasi masing-masing.
  const kegiatanTanggalIni = (state.data.kegiatanLuar || []).filter(k => k.Tanggal === tglKey);

  const badge = document.getElementById("weatherKegiatanBadge");
  const funTicker = document.getElementById("weatherFunTicker");
  const mainDisplay = document.getElementById("weatherMainDisplay");

  // Badge & highlight border - khusus kalau kelurahan yang SEDANG DILIHAT
  // ini kebetulan match dengan lokasi kegiatan ("di sini").
  if (kegiatanMatchKelurahan.length) {
    badge.classList.remove("hidden");
    mainDisplay.classList.add("has-kegiatan");
  } else {
    badge.classList.add("hidden");
    mainDisplay.classList.remove("has-kegiatan");
  }

  // Ticker lucu - selalu tampil kalau ADA kegiatan luar di tanggal ini,
  // di kelurahan manapun.
  if (kegiatanTanggalIni.length) {
    const kataSifat = getKataSifatCuaca(code, tMax, wMax);
    const pesanList = kegiatanTanggalIni.map(k =>
      `${escapeHtml(k.Nama)} sedang ${kataSifat} di ${escapeHtml(k.Lokasi || "-")} sambil melaksanakan ${escapeHtml(k.NamaKegiatan || "kegiatan")}`
    );
    funTicker.classList.remove("hidden");
    startWeatherFunTicker(pesanList);
  } else {
    funTicker.classList.add("hidden");
  }
}

// ============================================================
// TICKER LUCU DI DALAM POPUP (khusus tanggal+kelurahan yang ada kegiatan)
// ============================================================
let weatherFunTickerTimer = null;
let weatherFunTickerItems = [];
let weatherFunTickerIndex = 0;

function startWeatherFunTicker(messages) {
  weatherFunTickerItems = messages;
  weatherFunTickerIndex = 0;
  document.getElementById("weatherFunTickerText").innerHTML = messages[0];
  if (weatherFunTickerTimer) clearInterval(weatherFunTickerTimer);
  if (messages.length > 1) {
    weatherFunTickerTimer = setInterval(() => {
      let next = Math.floor(Math.random() * weatherFunTickerItems.length);
      if (next === weatherFunTickerIndex) next = (next + 1) % weatherFunTickerItems.length;
      weatherFunTickerIndex = next;
      document.getElementById("weatherFunTickerText").innerHTML = weatherFunTickerItems[next];
    }, 3800);
  }
}
function stopWeatherFunTicker() {
  if (weatherFunTickerTimer) { clearInterval(weatherFunTickerTimer); weatherFunTickerTimer = null; }
}

document.addEventListener("DOMContentLoaded", () => {
  setupWeatherModal();
  loadFrontWeatherCard();
});
