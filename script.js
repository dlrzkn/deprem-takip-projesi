mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2,
    projection: 'globe'
});

let spinEnabled = true;
let userInteracting = false;

map.on('style.load', () => {
    map.setFog({ 'color': 'rgb(15, 20, 30)', 'high-color': 'rgb(30, 60, 150)', 'star-intensity': 0.4 });
});

// Otomatik Dönüş
function rotateGlobe() {
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= 1.2;
        map.easeTo({ center, duration: 1000, easing: (t) => t });
    }
}

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

map.on('mousedown', () => { userInteracting = true; });
map.on('touchstart', () => { userInteracting = true; });
map.on('mouseup', () => { userInteracting = false; rotateGlobe(); });
map.on('touchend', () => { userInteracting = false; rotateGlobe(); });
map.on('moveend', () => { rotateGlobe(); });

async function updateQuakes() {
    try {
        const [kRes, uRes] = await Promise.all([
            fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live').then(r => r.json()),
            fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson').then(r => r.json())
        ]);
        
        const kGeojson = {
            type: 'FeatureCollection',
            features: kRes.result.map(d => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [parseFloat(d.lng), parseFloat(d.lat)] },
                properties: { mag: d.mag, place: d.title, date: d.date, source: 'Kandilli' }
            }))
        };

        if (map.getSource('kandilli')) {
            map.getSource('kandilli').setData(kGeojson);
            map.getSource('usgs').setData(uRes);
        } else {
            map.addSource('usgs', { type: 'geojson', data: uRes });
            map.addLayer({
                id: 'usgs-viz', type: 'circle', source: 'usgs',
                paint: { 'circle-radius': ['*', ['get', 'mag'], 2], 'circle-color': '#ffff00', 'circle-opacity': 0.5 }
            });

            map.addSource('kandilli', { type: 'geojson', data: kGeojson });
            map.addLayer({
                id: 'kandilli-viz', type: 'circle', source: 'kandilli',
                paint: { 'circle-radius': ['*', ['get', 'mag'], 3.5], 'circle-color': '#ff4d4d', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }
            });
        }
    } catch (e) { console.error(e); }
}

map.on('load', () => { 
    updateQuakes(); 
    rotateGlobe(); 
    setInterval(updateQuakes, 60000); 
});
