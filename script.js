mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

// Navigasyon kontrollerini hemen ekle
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
                    'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 2, 3, 5, 5, 10, 7, 20, 9, 40],
                    'circle-color': ['step', ['get', 'mag'], '#2ecc71', 3.0, '#f1c40f', 5.0, '#e67e22', 6.0, '#d35400', 7.0, '#e74c3c', 8.0, '#8e44ad'],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // --- POP-UP TETİKLEYİCİSİ (KATMAN OLUŞTUĞUNDA ÇALIŞIR) ---
            map.on('click', 'usgs-viz', (e) => {
                const props = e.features[0].properties;
                const coords = e.features[0].geometry.coordinates;
                const date = new Date(props.time).toLocaleString('tr-TR');
                
                new mapboxgl.Popup({ offset: 15, closeButton: true })
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="font-family: sans-serif; min-width: 200px; color: #333; padding: 5px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="background: #e67e22; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">M ${props.mag.toFixed(1)}</span>
                                <span style="color: #666; font-size: 11px;">${date}</span>
                            </div>
                            <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #2c3e50;">${props.place}</div>
                            <div style="background: #f8f9fa; padding: 8px; border-radius: 5px; font-size: 12px; margin-bottom: 10px; border: 1px solid #eee;">
                                <b>Derinlik:</b> ${coords[2].toFixed(1)} km <br>
                                <b>Tür:</b> ${props.type.toUpperCase()}
                            </div>
                            <a href="${props.url}" target="_blank" style="display: block; text-align: center; background: #34495e; color: white; text-decoration: none; padding: 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">USGS Detay Sayfası →</a>
                        </div>
                    `)
                    .addTo(map);
            });

            map.on('mouseenter', 'usgs-viz', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'usgs-viz', () => map.getCanvas().style.cursor = '');
        }
    } catch (e) { console.error("Veri hatası:", e); }
}

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

