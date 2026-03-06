mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

let spinEnabled = true;
let userInteracting = false;
const rotationSpeed = 1.2;

map.on('style.load', () => {
    map.setFog({
        'color': 'rgb(15, 20, 30)',
        'high-color': 'rgb(30, 60, 150)',
        'space-color': 'rgb(0, 0, 0)',
        'star-intensity': 0.4
    });
});

// Otomatik Dönüş Fonksiyonu
function rotateGlobe() {
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= rotationSpeed;
        map.easeTo({ center, duration: 1000, easing: (t) => t });
    }
}

// Buton Kontrolü (HTML'deki ID ile eşleşmeli)
const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        spinBtn.classList.toggle('btn-active');
        if (spinEnabled) rotateGlobe();
    };
}

// Etkileşim Yönetimi
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
        
        // Kandilli verilerini GeoJSON'a güvenli çevirme
        const kGeojson = {
            type: 'FeatureCollection',
            features: kRes.result.map(d => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [parseFloat(d.lng), parseFloat(d.lat)] },
                properties: { 
                    mag: d.mag, 
                    place: d.title, 
                    date: d.date, 
                    source: 'Kandilli' 
                }
            }))
        };

        // USGS verilerine kaynak ekleme
        uRes.features.forEach(f => f.properties.source = 'USGS');

        if (map.getSource('usgs')) {
            map.getSource('usgs').setData(uRes);
            map.getSource('kandilli').setData(kGeojson);
        } else {
            // Katmanlar: Önce USGS (alt), sonra Kandilli (üst)
            map.addSource('usgs', { type: 'geojson', data: uRes });
            map.addLayer({
                id: 'usgs-viz', type: 'circle', source: 'usgs',
                paint: { 
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2, 3, 7, 20], 
                    'circle-color': '#ffff00', 
                    'circle-opacity': 0.5 
                }
            });

            map.addSource('kandilli', { type: 'geojson', data: kGeojson });
            map.addLayer({
                id: 'kandilli-viz', type: 'circle', source: 'kandilli',
                paint: { 
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2, 5, 7, 25], 
                    'circle-color': '#ff4d4d', 
                    'circle-stroke-width': 1, 
                    'circle-stroke-color': '#fff' 
                }
            });
        }
    } catch (e) { console.error("Veri çekme hatası:", e); }
}

// Tıklama Olayları (Popup)
const addPopup = (layerId) => {
    map.on('click', layerId, (e) => {
        const p = e.features[0].properties;
        const timeStr = p.source === 'USGS' ? new Date(p.time).toLocaleString('tr-TR') : p.date;
        
        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
                <div style="color:#222; font-family:sans-serif;">
                    <strong>${p.mag} Büyüklüğünde</strong><br>
                    <span>${p.place}</span><br>
                    <small>${timeStr}</small><br>
                    <b style="color:#ff4d4d;">Kaynak: ${p.source}</b>
                </div>
            `)
            .addTo(map);
    });
    map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
};

map.on('load', () => { 
    updateQuakes(); 
    addPopup('usgs-viz');
    addPopup('kandilli-viz');
    rotateGlobe(); 
    setInterval(updateQuakes, 60000); 
});
