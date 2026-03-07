/* ==========================================================
   1. HARİTA AYARLARI
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtN2R2YXoybjAybG8ycXF6Mzh3dzBqZ3cifQ.x-G8m_H0o90S1u7T-7G9Yg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35.2433, 38.9637],
    zoom: 4, // Tablet için biraz daha geniş bir bakış
    projection: 'mercator', // Tablet işlemcilerini yormamak için 'globe' yerine klasik 'mercator'
    preserveDrawingBuffer: true,
    antialias: true
});

let allQuakes = [];
let markers = [];

/* ==========================================================
   2. LOADER TEMİZLEME (KRİTİK DOKUNUŞ)
   ========================================================== */
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
}

/* ==========================================================
   3. VERİ ÇEKME
   ========================================================== */
async function fetchUSGSData() {
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
        hideLoader(); // Veri geldiğinde gizle
        
    } catch (error) {
        console.error("Veri hatası:", error);
        hideLoader(); // Hata olsa bile siyah ekranı kaldır ki haritayı görebil
    }
}

/* ==========================================================
   4. MARKER VE UI
   ========================================================== */
function renderMarkers(quakes) {
    markers.forEach(m => m.remove());
    markers = [];

    quakes.forEach(quake => {
        let color = '#2ecc71';
        if (quake.mag >= 5.0) color = '#e67e22';
        if (quake.mag >= 6.5) color = '#e74c3c';

        const marker = new mapboxgl.Marker({ color: color })
            .setLngLat(quake.coords)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div style="color:black; font-family:sans-serif;">
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
    const lastUpdate = document.getElementById('last-update');
    if(lastUpdate) {
        lastUpdate.innerText = "Güncellendi: " + now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    }
}

// Lejant kontrolü
function toggleLegend() {
    const panel = document.getElementById('legend-panel');
    if (panel) {
        panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
    }
}

/* ==========================================================
   5. BAŞLATICI
   ========================================================== */
map.on('load', () => {
    fetchUSGSData();
});

// Eğer 5 saniye içinde harita yüklenmezse zorla siyah ekranı kaldır
setTimeout(hideLoader, 5000);
