mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [0, 0],
    zoom: 1.5,
    projection: 'globe'
});

let spinEnabled = true;
let userInteracting = false;

map.on('style.load', () => {
    map.setFog({
        'color': 'rgb(15, 20, 30)',
        'high-color': 'rgb(30, 60, 150)',
        'star-intensity': 0.4
    });
});

async function updateQuakes() {
    try {
        const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const data = await response.json();

        if (map.getSource('usgs')) {
            map.getSource('usgs').setData(data);
        } else {
            map.addSource('usgs', { type: 'geojson', data: data });

            // Ana Görsel Katman
            map.addLayer({
                id: 'usgs-viz',
                type: 'circle',
                source: 'usgs',
                paint: {
                    'circle-radius': [
                        'interpolate', ['linear'], ['get', 'mag'],
                        0, 1.5, 2.5, 3, 4.5, 7, 6.0, 15, 8.0, 30, 10, 50
                    ],
              'circle-color': [
    'step', ['get', 'mag'],
    '#2ecc71', 3.0,  // 3.0 altı yeşil
    '#f1c40f', 5.0,  // 3.0 - 5.0 sarı
    '#e67e22', 6.0,  // 5.0 - 6.0 turuncu
    '#d35400', 7.0,  // 6.0 - 7.0 koyu turuncu
    '#e74c3c', 8.0,  // 7.0 - 8.0 kırmızı
    '#8e44ad'        // 8.0+ mor
],

            });

            // --- POP-UP SİSTEMİ (GERİ GELDİ) ---
            map.on('click', 'usgs-viz', (e) => {
                const props = e.features[0].properties;
                const date = new Date(props.time).toLocaleString('tr-TR');
                
                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="color:#333; padding:10px; font-family:sans-serif; min-width:150px;">
                            <strong style="font-size:16px; color:#e67e22;">M ${props.mag}</strong><br>
                            <b style="display:block; margin:5px 0;">${props.place}</b>
                            <hr style="border:0; border-top:1px solid #eee;">
                            <small style="color:#666;">Tarih: ${date}</small><br>
                            <a href="${props.url}" target="_blank" style="color:#3498db; font-size:11px; text-decoration:none;">USGS Detayı →</a>
                        </div>
                    `)
                    .addTo(map);
            });

            map.on('mouseenter', 'usgs-viz', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'usgs-viz', () => map.getCanvas().style.cursor = '');
        }
    } catch (e) { console.error("Veri hatası:", e); }
}

// --- FİLTRELEME SİSTEMİ (AÇILIR KAPANIR) ---
function filterMag(minMag) {
    if (map.getLayer('usgs-viz')) {
        map.setFilter('usgs-viz', ['>=', ['get', 'mag'], minMag]);
    }
}

// --- OTOMATİK DÖNÜŞ VE PERFORMANS SİSTEMİ ---
function rotateGlobe() {
    // Sadece dönüş açıksa, kullanıcı dokunmuyorsa ve zoom seviyesi düşükse dön
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= 0.5;
        map.easeTo({ 
            center, 
            duration: 1000, 
            easing: (t) => t, 
            essential: true 
        });
    }
}

// Hareket bittiğinde (kodla veya elle) kontrol et
map.on('moveend', () => {
    if (!userInteracting && spinEnabled) {
        rotateGlobe();
    }
});

// Kasmayı önleyen etkileşim dinleyicileri
map.on('mousedown', () => { userInteracting = true; });
map.on('mouseup', () => { userInteracting = false; rotateGlobe(); });
map.on('touchstart', () => { userInteracting = true; });
map.on('touchend', () => { userInteracting = false; rotateGlobe(); });

// Zoom sırasında kasmayı bitiren kritik blok
map.on('zoomstart', () => { userInteracting = true; });
map.on('zoomend', () => { 
    userInteracting = false; 
    // Zoom seviyesi çok yüksekse dönüşü tamamen bırak (detaylı inceleme modu)
    if (map.getZoom() < 5) rotateGlobe(); 
});

map.on('load', () => {
    updateQuakes();
    rotateGlobe(); // İlk başlatma
    setInterval(updateQuakes, 60000);
});

// Buton Kontrolü
const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        spinBtn.classList.toggle('btn-active');
        if (spinEnabled) rotateGlobe();
    };
}
