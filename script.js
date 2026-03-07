/* ==========================================================
   1. HARİTA BAŞLATMA (MAPBOX)
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtN2R2YXoybjAybG8ycXF6Mzh3dzBqZ3cifQ.x-G8m_H0o90S1u7T-7G9Yg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35.2433, 38.9637], // Türkiye merkezli
    zoom: 5
});

let allQuakes = [];
let markers = [];

/* ==========================================================
   2. VERİ ÇEKME (USGS API ENTEGRASYONU)
   Doğrudan USGS üzerinden dünya geneli son 24 saat depremleri çekilir.
   ========================================================== */
async function fetchDepremler() {
    try {
        // USGS API: Son 24 saatteki tüm depremler
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const data = await response.json();
        
        // USGS verisini kendi formatımıza basitçe çeviriyoruz
        allQuakes = data.features.map(f => ({
            title: f.properties.place,
            mag: f.properties.mag,
            depth: f.geometry.coordinates[2],
            date: new Date(f.properties.time).toLocaleString('tr-TR'),
            coords: [f.geometry.coordinates[0], f.geometry.coordinates[1]]
        }));

        // Sadece Türkiye ve çevresindeki depremleri göstermek istersen filtreleyebilirsin
        // Ancak USGS dünya genelini verdiği için hepsi kalsın dersen direkt render et:
        renderMarkers(allQuakes);
        updateLastUpdateTime();
        
        // Yükleme ekranını kapat
        document.getElementById('loader').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loader').style.display = 'none';
        }, 500);

    } catch (error) {
        console.error("USGS Veri çekme hatası:", error);
        document.getElementById('last-update').innerText = "Bağlantı Hatası!";
    }
}

/* ==========================================================
   3. NOKTALARI ÇİZME (MARKERS)
   ========================================================== */
function renderMarkers(quakes) {
    markers.forEach(m => m.remove());
    markers = [];

    quakes.forEach(quake => {
        let color = '#2ecc71';
        if (quake.mag >= 7.0) color = '#8e44ad';
        else if (quake.mag >= 6.0) color = '#e74c3c';
        else if (quake.mag >= 5.0) color = '#e67e22';
        else if (quake.mag >= 3.0) color = '#f1c40f';

        const marker = new mapboxgl.Marker({ color: color })
            .setLngLat(quake.coords)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div class="popup-content">
                    <h3 style="margin:0 0 5px 0; color:#ff9900;">${quake.title}</h3>
                    <p><b>Büyüklük:</b> ${quake.mag} Mw</p>
                    <p><b>Derinlik:</b> ${quake.depth.toFixed(1)} km</p>
                    <p><b>Zaman:</b> ${quake.date}</p>
                </div>
            `))
            .addTo(map);
        
        markers.push(marker);
    });
}

/* ==========================================================
   4. ETKİLEŞİM FONKSİYONLARI
   ========================================================== */
function filterMag(minMag) {
    const filtered = allQuakes.filter(q => q.mag >= minMag);
    renderMarkers(filtered);

    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.classList.remove('btn-active');
        if ((minMag === 0 && btn.innerText === 'Hepsi') || 
            (btn.innerText.includes(minMag.toString()) && minMag !== 0)) {
            btn.classList.add('btn-active');
        }
    });
}

function toggleLegend() {
    const panel = document.getElementById('legend-panel');
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + 
                    now.getMinutes().toString().padStart(2, '0');
    document.getElementById('last-update').innerText = "Son Güncelleme: " + timeStr;
}

map.on('load', () => {
    fetchDepremler();
});
