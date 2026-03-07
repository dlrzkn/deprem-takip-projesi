mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

let spinEnabled = true;
let userInteracting = false;
let currentRange = 'day';

const timeURLs = {
    'hour': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
    'day': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    'week': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson'
};

map.on('style.load', () => {
    map.setFog({
        'color': 'rgb(15, 20, 30)',
        'high-color': 'rgb(30, 60, 150)',
        'star-intensity': 0.4
    });
});

async function updateQuakes() {
    try {
        const response = await fetch(timeURLs[currentRange]);
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
                        1, 2, 3, 4, 5, 8, 7, 16, 9, 35
                    ],
                    'circle-color': [
                        'step', ['get', 'mag'],
                        '#2ecc71', 3.0, '#f1c40f', 5.0, '#e67e22', 6.0, '#d35400', 7.0, '#e74c3c', 8.0, '#8e44ad'
                    ],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });
        }
    } catch (e) { console.error("Hata:", e); }
}




map.on('click', 'usgs-viz', (e) => {
    const feature = e.features[0]; 
    const props = feature.properties;
    const coords = feature.geometry.coordinates;
    const date = new Date(props.time).toLocaleString('tr-TR');
    const depth = coords[2] !== undefined ? coords[2] : 0;

    new mapboxgl.Popup({ offset: 15, closeButton: true })
        .setLngLat([coords[0], coords[1]])
        .setHTML(`
            <div style="font-family: sans-serif; min-width: 200px; padding: 5px; color: #000;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="background: #e67e22; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">M ${props.mag.toFixed(1)}</span>
                    <span style="color: #666; font-size: 11px;">${date}</span>
                </div>
                <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">${props.place}</div>
                <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; border: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px;">
                        <span style="color: #7f8c8d;">Derinlik:</span>
                        <span style="font-weight: bold;">${depth.toFixed(1)} km</span>
                    </div>
                </div>
                <a href="${props.url}" target="_blank" style="display: block; text-align: center; background: #34495e; color: white; text-decoration: none; padding: 8px; border-radius: 4px; font-size: 11px; margin-top: 10px;">Detay →</a>
            </div>
        `).addTo(map);
});

map.on('mousemove', 'usgs-viz', () => { map.getCanvas().style.cursor = 'pointer'; });
map.on('mouseleave', 'usgs-viz', () => { map.getCanvas().style.cursor = ''; });

window.changeTimeRange = function(range, btnElement) {
    currentRange = range;
    updateQuakes();
    btnElement.parentElement.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('btn-active'));
    btnElement.classList.add('btn-active');
};

window.filterMag = function(minMag, btnElement) {
    if (map.getLayer('usgs-viz')) {
        map.setFilter('usgs-viz', ['>=', ['get', 'mag'], minMag]);
        btnElement.parentElement.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('btn-active'));
        btnElement.classList.add('btn-active');
    }
};

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

map.on('load', () => {
    updateQuakes();
    rotateGlobe();
    setInterval(updateQuakes, 60000);
});

document.getElementById('spin-btn').onclick = function() {
    spinEnabled = !spinEnabled;
    this.textContent = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
    this.classList.toggle('btn-active', spinEnabled);
};

