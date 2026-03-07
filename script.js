/* ==========================================================
   1. HARİTA AYARLARI (KÜRE MODU YENİDEN AKTİF)
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35.24, 38.96],
    zoom: 1.5, // Küre etkisini görmek için biraz uzaktan başla
    projection: 'globe' // İşte o sevdiğin küre modu!
});

let allQuakes = [];
let markers = [];

/* ==========================================================
   2. LOADER VE VERİ YÖNETİMİ (BEKLEME YOK)
   ========================================================== */
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 300);
    }
}

async function fetchUSGS() {
    try {
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const data = await response.json();
        
        allQuakes = data.features.map(f => ({
            title: f.properties.place,
            mag: f.properties.mag,
            date: new Date(f.properties.time).toLocaleTimeString('tr-TR'),
            coords: [f.geometry.coordinates[0], f.geometry.coordinates[1]]
        }));

        renderMarkers(allQuakes);
        updateTime();
        hideLoader(); // Veri geldiği an loader'ı kapat

    } catch (error) {
        console.error("USGS Hatası:", error);
        hideLoader(); // Hata olsa da ekranı aç
    }
}

/* ==========================================================
   3. DEPREM NOKTALARI
   ========================================================== */
function renderMarkers(quakes) {
    markers.forEach(m => m.remove());
    markers = [];

    quakes.forEach(quake => {
        let color = '#2ecc71'; // Küçük depremler yeşil
        if (quake.mag >= 6.0) color = '#e74c3c'; // Büyükler kırmızı
        else if (quake.mag >= 4.0) color = '#f1c40f'; // Orta turuncu

        const marker = new mapboxgl.Marker({ color: color })
            .setLngLat(quake.coords)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div style="color:#000; font-family:Inter, sans-serif; padding:5px;">
                    <strong style="display:block; margin-bottom:4px;">${quake.title}</strong>
                    Büyüklük: ${quake.mag} Mw<br>
                    Zaman: ${quake.date}
                </div>
            `))
            .addTo(map);
        markers.push(marker);
    });
}

function updateTime() {
    const now = new Date();
    const t = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    const el = document.getElementById('last-update');
    if (el) el.innerText = "Son Güncelleme: " + t;
}

// Filtreler ve Lejant
function filterMag(minMag) {
    const filtered = allQuakes.filter(q => q.mag >= minMag);
    renderMarkers(filtered);
}

function toggleLegend() {
    const p = document.getElementById('legend-panel');
    if(p) p.style.display = (p.style.display === 'block') ? 'none' : 'block';
}

/* ==========================================================
   4. BAŞLATICI
   ========================================================== */
map.on('style.load', () => {
    map.setFog({}); // Küre atmosfer derinliği
    fetchUSGS();
});

// Sigorta: 3 saniye sonra ekranı her türlü aç
setTimeout(hideLoader, 3000);
