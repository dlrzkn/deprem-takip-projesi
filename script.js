mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], zoom: 2, projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// Akıllı Dünya Dönüşü
function rotate() {
    if (!isRotating || map.getZoom() > 5) return;
    const center = map.getCenter();
    center.lng += 0.15;
    map.easeTo({ center, duration: 1000, easing: n => n });
}
map.on('moveend', rotate);

function toggleRotation() {
    isRotating = !isRotating;
    document.getElementById('rotation-btn').innerText = isRotating ? '🌎 Durdur' : '🔄 Döndür';
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
            let mag = f.properties.mag;
            let color = mag > 7 ? '#8e44ad' : mag > 5.5 ? '#e74c3c' : mag > 3 ? '#f1c40f' : '#2ecc71';
            
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            el.style.cssText = `background:${color}; width:${mag*3+5}px; height:${mag*3+5}px;`;

            const m = new mapboxgl.Marker(el)
                .setLngLat(f.geometry.coordinates)
                .setPopup(new mapboxgl.Popup({ offset: 10 }).setHTML(`
                    <div style="padding:5px">
                        <strong style="color:#ff9900">${f.properties.place}</strong><br>
                        <span>Büyüklük: ${mag} Mw</span><br>
                        <small>${new Date(f.properties.time).toLocaleString()}</small>
                    </div>
                `))
                .addTo(map);
            return m;
        });
}

// Filtre Kontrolleri
function changeTime(r) {
    currentRange = r;
    updateBtnStyle('.time-btn', event.target);
    fetchData();
}

function changeMag(m) {
    currentMag = m;
    updateBtnStyle('.mag-btn', event.target);
    render();
}

function updateBtnStyle(cls, target) {
    document.querySelectorAll(cls).forEach(b => b.classList.remove('btn-active'));
    target.classList.add('btn-active');
}

function toggleTheme() {
    const style = map.getStyle().mapId === 'mapbox/dark-v11' ? 'mapbox/streets-v12' : 'mapbox/dark-v11';
    map.setStyle('mapbox://styles/' + style);
}

map.on('style.load', () => { map.setFog({}); rotate(); fetchData(); });
