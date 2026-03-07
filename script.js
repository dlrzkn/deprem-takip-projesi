/* ==========================================================
   1. HARİTA AYARLARI (KÜRE MODU AKTİF)
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtN2R2YXoybjAybG8ycXF6Mzh3dzBqZ3cifQ.x-G8m_H0o90S1u7T-7G9Yg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35.2433, 38.9637],
    zoom: 2, // Küre halini daha iyi görmek için biraz uzaklaştırdık
    projection: 'globe' // İstediğin küre modu burada!
});

let allQuakes = [];
let markers = [];

/* ==========================================================
   2. YÜKLEME EKRANI KONTROLÜ (ANLIK KAPATMA)
   ========================================================== */
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 500);
    }
}

/* ==========================================================
   3. VERİ ÇEKME (USGS - ANLIK)
   ========================================================== */
async function fetchDepremler() {
    try {
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const data = await response.json();
        
        allQuakes = data.features.map(f => ({
            title: f.properties.place,
            mag: f.properties.mag,
            depth: f.geometry.coordinates[2],
            date: new Date(f.properties.time).toLocaleString('tr-TR'),
            coords: [f.geometry.coordinates[0], f.geometry.coordinates[1]]
        }));

        renderMarkers(allQuakes);
        updateUI();
        
        // VERİ GELDİĞİ AN LOADER'I KAPAT (Beklemek yok!)
        hideLoader();

    } catch (error) {
        console.error("Veri hatası:", error);
        hideLoader(); // Hata olsa bile ekranı aç ki haritayı gör
    }
}

/* ==========================================================
   4. GÖRSELLEŞTİRME VE FİLTRE
   ========================================================== */
function renderMarkers(quakes) {
    markers.forEach(m => m.remove());
    markers = [];

    quakes.forEach(quake => {
        let color = '#2ecc71';
        if (quake.mag >= 6.0) color = '#e74c3c';
        else if (quake.mag >= 4.0) color = '#f1c40f';

        const marker = new mapboxgl.Marker({ color: color })
            .setLngLat(quake.coords)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div style="color:black; font-family:sans-serif; padding:5px;">
                    <strong>${quake.title}</strong><br>
                    Büyüklük: ${quake.mag} Mw
                </div>
            `))
            .addTo(map);
        
        markers.push(marker);
    });
}

function updateUI() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    const updateEl = document.getElementById('last-update');
    if(updateEl) updateEl.innerText = "Son Güncelleme: " + timeStr;
}

// Filtre butonu fonksiyonu
function filterMag(minMag) {
    const filtered = allQuakes.filter(q => q.mag >= minMag);
    renderMarkers(filtered);
}

// Lejant aç/kapat
function toggleLegend() {
    const panel = document.getElementById('legend-panel');
    if(panel) panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}

/* ==========================================================
   5. BAŞLATICI
   ========================================================== */
map.on('style.load', () => {
    map.setFog({}); // Küre modu için atmosfer efekti
    fetchDepremler();
});
