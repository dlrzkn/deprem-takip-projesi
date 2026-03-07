/* ==========================================================
   1. HARİTA AYARLARI (YENİ TOKEN)
   ========================================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2,
    projection: 'globe'
});

let allQuakes = [];
let currentMarkers = [];
let isRotating = true;
let currentMinMag = 0;

/* ==========================================================
   2. DÜNYA DÖNÜŞÜ (AKILLI DURDURMA)
   ========================================================== */
function rotateGlobe() {
    if (!isRotating || map.getZoom() >= 5) return;
    const center = map.getCenter();
    center.lng += 0.2;
    map.setCenter(center);
}

map.on('moveend', rotateGlobe);

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    if (isRotating) rotateGlobe();
}

/* ==========================================================
   3. VERİ ÇEKME (BEKLEME SÜRESİ SIFIRLANDI)
   ========================================================== */
async function fetchUSGS(range = 'day') {
    // Loader'ı göster
    const loader = document.getElementById('loader');
    loader.style.display = 'flex';
    loader.style.opacity = '1';

    try {
        const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${range}.geojson`;
        const response = await fetch(url);
        const data = await response.json();
        
        allQuakes = data.features.map(f => ({
            title: f.properties.place,
            mag: f.properties.mag,
            time: new Date(f.properties.time).toLocaleTimeString('tr-TR'),
            coords: [f.geometry.coordinates[0], f.geometry.coordinates[1]]
        }));

        applyFilters();
        hideLoader(); // Veri geldiği milisaniyede kapat

    } catch (e) {
        console.error("Veri hatası:", e);
        hideLoader();
    }
}

/* ==========================================================
   4. FİLTRELEME VE MARKER TASARIMI (PROFESYONEL)
   ========================================================== */
function applyFilters() {
    const filtered = allQuakes.filter(q => q.mag >= currentMinMag);
    renderMarkers(filtered);
}

function filterMag(min) {
    currentMinMag = min;
    applyFilters();
    
    // Buton aktifliğini görselleştir
    document.querySelectorAll('.mag-btn').forEach(btn => {
        btn.classList.remove('btn-active');
        if(parseFloat(btn.innerText) === min || (min === 0 && btn.innerText === 'Hepsi')) {
            btn.classList.add('btn-active');
        }
    });
}

function changeTimeRange(range) {
    fetchUSGS(range);
    
    // Zaman butonu aktifliğini görselleştir
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('btn-active');
        const rangeText = range === 'hour' ? '1 Saat' : (range === 'day' ? '24 Saat' : '7 Gün');
        if(btn.innerText === rangeText) btn.classList.add('btn-active');
    });
}

function renderMarkers(quakes) {
    currentMarkers.forEach(m => m.remove());
    currentMarkers = [];

    quakes.forEach(q => {
        let color = '#2ecc71';
        if (q.mag >= 7.0) color = '#8e44ad';
        else if (q.mag >= 5.5) color = '#e74c3c';
        else if (q.mag >= 4.0) color = '#f1c40f';

        // MARKET İKONU YERİNE PROFESYONEL HALKA
        const el = document.createElement('div');
        el.className = 'sismic-halka';
        el.style.width = `${Math.max(q.mag * 4, 10)}px`;
        el.style.height = `${Math.max(q.mag * 4, 10)}px`;
        el.style.backgroundColor = color;
        el.style.boxShadow = `0 0 15px ${color}`;

        const marker = new mapboxgl.Marker(el)
            .setLngLat(q.coords)
            .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setHTML(`
                <div class="pro-popup">
                    <div class="mag-badge" style="background:${color}">${q.mag}</div>
                    <div class="info">
                        <strong>${q.title}</strong>
                        <p>${q.time}</p>
                    </div>
                </div>
            `))
            .addTo(map);
        currentMarkers.push(marker);
    });
}

function hideLoader() {
    const l = document.getElementById('loader');
    l.style.opacity = '0';
    setTimeout(() => l.style.display = 'none', 300);
    document.getElementById('last-update').innerText = "Son Güncelleme: " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

map.on('style.load', () => {
    map.setFog({ "range": [0.5, 10], "color": "#000000", "high-color": "#242B4B", "space-color": "#000000" });
    fetchUSGS('day');
    rotateGlobe();
});
