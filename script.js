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
                    'circle-radius': [
                        'interpolate', ['linear'], ['get', 'mag'],
                        0, 1.5, 2.5, 3, 4.5, 7, 6.0, 15, 8.0, 30, 10, 50
                    ],
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
    } catch (e) { console.error("Veri güncelleme hatası:", e); }
}

// --- POP-UP SİSTEMİ (updateQuakes dışına, harita yüklendiğinde bir kez çalışacak şekilde) ---
map.on('click', 'usgs-viz', (e) => {
    const props = e.features[0].properties;
    const coords = e.features[0].geometry.coordinates;
    const date = new Date(props.time).toLocaleString('tr-TR');
    const depth = coords[2]; // Derinlik verisi

    new mapboxgl.Popup({ offset: 10, closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(`
            <div style="font-family: sans-serif; padding: 5px; min-width: 200px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="background: #e67e22; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;">
                        M ${props.mag.toFixed(1)}
                    </span>
                    <span style="color: #666; font-size: 11px;">${date}</span>
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #2c3e50; margin-bottom: 10px; line-height: 1.3;">
                    ${props.place}
                </div>
                <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                        <span style="color: #7f8c8d;">Derinlik:</span>
                        <span style="font-weight: bold; color: #2c3e50;">${depth.toFixed(1)} km</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px;">
                        <span style="color: #7f8c8d;">Tür:</span>
                        <span style="font-weight: bold; color: #2c3e50;">${props.type.toUpperCase()}</span>
                    </div>
                </div>
                <a href="${props.url}" target="_blank" style="display: block; text-align: center; background: #34495e; color: white; text-decoration: none; padding: 6px; border-radius: 4px; font-size: 12px;">
                    Detaylı İncele (USGS) →
                </a>
            </div>
        `)
        .addTo(map);
});

map.on('mouseenter', 'usgs-viz', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'usgs-viz', () => map.getCanvas().style.cursor = '');

// --- DÖNÜŞ VE KONTROL SİSTEMİ ---
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
