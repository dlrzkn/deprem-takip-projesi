/* ==========================================================
   1. HARİTA AYARLARI
   ========================================================== */
// Lütfen bu satırın başında veya sonunda boşluk olmadığından emin ol
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtN2R2YXoybjAybG8ycXF6Mzh3dzBqZ3cifQ.x-G8m_H0o90S1u7T-7G9Yg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35.2433, 38.9637],
    zoom: 5,
    projection: 'globe' // Dünyayı küre şeklinde görmek için (Süper dokunuş!)
});

let allQuakes = [];
let markers = [];

/* ==========================================================
   2. USGS VERİSİ (DOĞRUDAN KAYNAKTAN)
   ========================================================== */
async function fetchUSGSData() {
    try {
        // Son 24 saatteki tüm depremler (En güvenilir kaynak)
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
        
    } catch (error) {
        console.error("Veri çekme hatası:", error);
        document.getElementById('last-update').innerText = "Veri Alınamadı!";
    }
}

/* ==========================================================
   3. HARİTAYA İŞLEME
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
                <div style="color:black;">
                    <strong>${quake.title}</strong><br>
                    Büyüklük: ${quake.mag} Mw<br>
                    Zaman: ${quake.date}
                </div>
            `))
            .addTo(map);
        
        markers.push(marker);
    });
}

function updateUI() {
    // Yükleme ekranını kaldır
    const loader = document.getElementById('loader');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
    
    // Son güncelleme zamanı
    const now = new Date();
    document.getElementById('last-update').innerText = "Güncellendi: " + now.getHours() + ":" + now.getMinutes();
}

// Filtre ve Lejant fonksiyonlarını buraya eklemeyi unutma (Önceki JS'deki gibi)
function toggleLegend() {
    const p = document.getElementById('legend-panel');
    p.style.display = (p.style.display === 'block') ? 'none' : 'block';
}

map.on('style.load', () => {
    map.setFog({}); // Atmosfer efekti
    fetchUSGSData();
});

// Harita yüklenmezse hata ver
map.on('error', (e) => {
    console.error('Mapbox Hatası:', e);
});
