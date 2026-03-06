mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35.2433, 38.9637],
    zoom: 3,
    projection: 'globe'
});

let spinEnabled = false; // Başlangıçta kapalı (isteğe bağlı)
let userInteracting = false;

map.on('style.load', () => {
    map.setFog({ 'color': 'rgb(15, 20, 30)', 'high-color': 'rgb(30, 60, 150)', 'star-intensity': 0.4 });
});

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

        uRes.features.forEach(f => f.properties.source = 'USGS');

        // USGS Kaynağı
        if (!map.getSource('usgs')) {
            map.addSource('usgs', { type: 'geojson', data: uRes });
            map.addLayer({
                id: 'usgs-viz', type: 'circle', source: 'usgs',
                paint: { 
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2, 4, 7, 25],
                    'circle-color': '#ffff00', 
                    'circle-opacity': 0.6,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });
        } else {
            map.getSource('usgs').setData(uRes);
        }

        // Kandilli Kaynağı (Kırmızı ve Parlak)
        if (!map.getSource('kandilli')) {
            map.addSource('kandilli', { type: 'geojson', data: kGeojson });
            map.addLayer({
                id: 'kandilli-viz', type: 'circle', source: 'kandilli',
                paint: { 
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2, 6, 7, 35],
                    'circle-color': '#ff4d4d',
                    'circle-opacity': 0.9,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });
        } else {
            map.getSource('kandilli').setData(kGeojson);
        }
    } catch (e) { console.error("Veri yükleme hatası:", e); }
}

// Pop-up Fonksiyonu (Katmanlar oluştuktan sonra çalışır)
function addPopups() {
    ['kandilli-viz', 'usgs-viz'].forEach(layer => {
        map.on('click', layer, (e) => {
            const p = e.features[0].properties;
            const time = p.source === 'USGS' ? new Date(p.time).toLocaleString('tr-TR') : p.date;
            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`<strong>${p.mag} ML</strong><br>${p.place}<br><small>${time}</small><br><b style="color:red">${p.source}</b>`)
                .addTo(map);
        });
        map.on('mouseenter', layer, () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', layer, () => map.getCanvas().style.cursor = '');
    });
}

map.on('load', () => {
    updateQuakes().then(() => addPopups());
    setInterval(updateQuakes, 60000);
});

// Otomatik Dönüş Kontrolü
const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        if (spinEnabled) rotateGlobe();
    };
}

function rotateGlobe() {
    if (spinEnabled && !userInteracting) {
        const center = map.getCenter();
        center.lng -= 1.5;
        map.easeTo({ center, duration: 1000, easing: (t) => t });
    }
}
map.on('moveend', rotateGlobe);
map.on('mousedown', () => userInteracting = true);
map.on('mouseup', () => userInteracting = false);
