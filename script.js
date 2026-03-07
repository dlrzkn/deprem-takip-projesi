mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], zoom: 2.2, projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// --- AKILLI DÜNYA DÖNÜŞÜ ---
function rotateGlobe() {
    if (!isRotating) return;
    const center = map.getCenter();
    center.lng += 0.15;
    map.easeTo({ center, duration: 1000, easing: n => n });
}

// Kullanıcı haritaya dokunduğunda dönüşü geçici olarak askıya almaz, 
// sadece kendi kendine akışı durdurup etkileşime izin verir.
map.on('moveend', () => { if(isRotating) rotateGlobe(); });

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    if(isRotating) rotateGlobe();
}

// --- VERİ ÇEKME (ZAMAN ARALIKLI) ---
async function fetchData() {
    const loader = document.getElementById('loader');
    loader.style.display = 'flex';
    try {
        const res = await fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`);
        const json = await res.json();
        allData = json.features;
        renderMarkers();
        document.getElementById('last-update').innerText = "Son: " + new Date().toLocaleTimeString();
    } catch (e) { console.error("USGS Veri Hatası:", e); }
    loader.style.display = 'none';
}

function renderMarkers() {
    markers.forEach(m => m.remove());
    markers = allData
        .filter(f => f.properties.mag >= currentMag)
        .map(f => {
            const mag = f.properties.mag;
            const url = f.properties.url; // USGS Detay Linki
            
           // Renk atamasını USGS bilimsel skalasına göre güncelle
const color = mag >= 8.0 ? '#8e44ad' : 
              mag >= 7.0 ? '#c0392b' : 
              mag >= 6.0 ? '#e74c3c' : 
              mag >= 5.0 ? '#e67e22' : 
              mag >= 3.0 ? '#f1c40f' : '#2ecc71';

            
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            el.style.cssText = `background:${color}; width:${mag*3+6}px; height:${mag*3+6}px;`;

            const m = new mapboxgl.Marker(el)
                .setLngLat(f.geometry.coordinates)
                .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div class="pro-popup">
                        <strong style="color:${color}">${f.properties.place}</strong><br>
                        <b>Büyüklük:</b> ${mag} Mw<br>
                        <b>Zaman:</b> ${new Date(f.properties.time).toLocaleString()}<br>
                        <a href="${url}" target="_blank" class="usgs-link">USGS Detayları ↗</a>
                    </div>
                `))
                .addTo(map);
            return m;
        });
}

// Filtre ve Tema Fonksiyonları
function changeTime(r) { currentRange = r; fetchData(); updateBtn('.time-btn', event.target); }
function changeMag(m) { currentMag = m; renderMarkers(); updateBtn('.mag-btn', event.target); }
function updateBtn(cls, target) { document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active')); target.classList.add('btn-active'); }
function toggleTheme() {
    const isDark = map.getStyle().name.includes('Dark');
    map.setStyle(isDark ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/dark-v11');
}
function toggleLegend() { 
    const l = document.getElementById('legend');
    l.style.display = (l.style.display === 'block') ? 'none' : 'block';
}

map.on('style.load', () => { map.setFog({}); rotateGlobe(); fetchData(); });
