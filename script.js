// Mapbox panelinden aldığın token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], zoom: 2.2, projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// Akıllı Dönüş: Kullanıcı müdahalesine izin verir
function rotate() {
    if (!isRotating || map.getZoom() > 5) return;
    const center = map.getCenter();
    center.lng -= 1.0;
    map.easeTo({ center, duration: 1000, easing: n => n });
}
map.on('moveend', () => { if(isRotating) rotate(); });

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerHTML = isRotating ? '🌎 Durdur' : '🔄 Döndür';
    if(isRotating) rotate();
}

async function fetchData() {
    document.getElementById('loader').style.display = 'flex';
    try {
        const res = await fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`);
        const json = await res.json();
        allData = json.features;
        render();
        document.getElementById('last-update').innerText = "Son: " + new Date().toLocaleTimeString();
    } catch (e) { console.error(e); }
    document.getElementById('loader').style.display = 'none';
}

function render() {
    markers.forEach(m => m.remove());
    markers = allData
        .filter(f => f.properties.mag >= currentMag)
        .map(f => {
            const mag = f.properties.mag;
            const color = mag >= 8 ? '#8e44ad' : mag >= 7 ? '#c0392b' : mag >= 6 ? '#e74c3c' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            el.style.cssText = `background:${color}; width:${mag*3+6}px; height:${mag*3+6}px;`;

            return new mapboxgl.Marker(el)
                .setLngLat(f.geometry.coordinates)
                .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div style="color:#000; padding:5px;">
                        <strong style="color:${color}">${f.properties.place}</strong><br>
                        <b>Büyüklük:</b> ${mag} Mw<br>
                        <a href="${f.properties.url}" target="_blank" style="color:#ff9900; font-size:11px; font-weight:bold; text-decoration:none;">USGS Detayları ↗</a>
                    </div>
                `))
                .addTo(map);
        });
}

function changeTime(r) { currentRange = r; updateBtn('.time-btn', event.target); fetchData(); }
function changeMag(m) { currentMag = m; updateBtn('.mag-btn', event.target); render(); }
function updateBtn(cls, target) { document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active')); target.classList.add('btn-active'); }

function toggleTheme() {
    const isDark = map.getStyle().name.includes('Dark');
    map.setStyle('mapbox://styles/mapbox/' + (isDark ? 'streets-v12' : 'dark-v11'));
}

function toggleLegend() { 
    const l = document.getElementById('legend');
    l.style.display = (l.style.display === 'block') ? 'none' : 'block';
}

map.on('style.load', () => { map.setFog({}); rotate(); fetchData(); });
