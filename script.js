mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

// 1. NAVİGASYON KONTROLLERİ (Pusula ve Zoom Okları)
map.addControl(new mapboxgl.NavigationControl(), 'top-right');

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

            map.addLayer({
                id: 'usgs-viz',
                type: 'circle',
                source: 'usgs',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 3, 5, 5, 12, 7, 25, 9, 45],
                    'circle-color': [
                        'step', ['get', 'mag'],
                        '#2ecc71', 3.0,
                        '#f1c40f', 5.0,
                        '#e67e22', 6.0,
                        '#d35400', 7.0,
                        '#e74c3c', 8.0,
                        '#8e44ad'
                    ],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });
        }
    } catch (e) { console.error("Hata:", e); }
}

// 2. GARANTİLENMİŞ POP-UP SİSTEMİ (Harita üzerine tıklandığında)
map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['usgs-viz'] });
    
    if (!features.length) return;

    const feature = features[0];
    const props = feature.properties;
    const date = new Date(props.time).toLocaleString('tr-TR');
    const depth = feature.geometry.coordinates[2];

    new mapboxgl.Popup({ offset: 15, closeButton: true })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(`
            <div style="font-family: sans-serif; min-width: 200px; color: #333; padding: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="background: #e67e22; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
                        M ${props.mag.toFixed(1)}
                    </span>
                    <span style="color: #666; font-size: 11px;">${date}</span>
                </div>
                <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #2c3e50;">${props.place}</div>
                <div style="background: #f8f9fa; padding: 8px; border-radius: 5px; font-size: 12px; margin-bottom: 10px; border: 1px solid #eee;">
                    <b>Derinlik:</b> ${depth.toFixed(1)} km <br>
                    <b>Tür:</b> ${props.type.toUpperCase()}
                </div>
                <a href="${props.url}" target="_blank" style="display: block; text-align: center; background: #34495e; color: white; text-decoration: none; padding: 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                    Detaylı İncele (USGS) →
                </a>
            </div>
        `)
        .addTo(map);
});

// Fare imlecini değiştirme
map.on('mousemove', 'usgs-viz', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'usgs-viz', () => { map.getCanvas().style.cursor = ''; });

// 3. AKICI DÖNÜŞ VE ETKİLEŞİM
function rotateGlobe() {
    if (spinEnabled && !userInteracting && map.getZoom() < 5) {
        const center = map.getCenter();
        center.lng -= 0.5;
        map.easeTo({ center, duration: 1000, easing: (t) => t, essential: true });
    }
}

map.on('moveend', () => { if (!userInteracting && spinEnabled) rotateGlobe(); });
map.on('mousedown', () => { userInteracting = true; });
map.on('mouseup', () => { userInteracting = false; rotateGlobe(); });
map.on('zoomstart', () => { userInteracting = true; });
map.on('zoomend', () => { userInteracting = false; rotateGlobe(); });

map.on('load', () => {
    updateQuakes();
    rotateGlobe();
    setInterval(updateQuakes, 60000);
});

// 4. FİLTRELEME
window.filterMag = function(minMag) {
    if (map.getLayer('usgs-viz')) {
        map.setFilter('usgs-viz', ['>=', ['get', 'mag'], minMag]);
    }
};

const spinBtn = document.getElementById('spin-btn');
if (spinBtn) {
    spinBtn.onclick = () => {
        spinEnabled = !spinEnabled;
        spinBtn.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
        if (spinEnabled) rotateGlobe();
    };
}

