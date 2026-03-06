mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

map.on('load', () => {
    // Atmosfer Ayarları
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.15
    });

    // --- Otomatik Dönüş Sistemi (Gelişmiş) ---
    const rotationSpeed = 1.2; // Dönüş hızı
    let userInteracting = false;
    let spinEnabled = true;

    function rotateGlobe() {
        if (spinEnabled && !userInteracting) {
            const distancePerSecond = rotationSpeed;
            const center = map.getCenter();
            center.lng -= distancePerSecond;
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
        requestAnimationFrame(rotateGlobe);
    }

    map.on('mousedown', () => { userInteracting = true; });
    map.on('mouseup', () => { userInteracting = false; });
    map.on('dragstart', () => { userInteracting = true; });
    map.on('canvas', 'touchstart', () => { userInteracting = true; }); // Tablet için dokunma desteği

    rotateGlobe(); // Dönüşü başlat

    // Veri Kaynağı
    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    // Isı Haritası
    map.addLayer({
        'id': 'quakes-heat',
        'type': 'heatmap',
        'source': 'quakes',
        'maxzoom': 9,
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)', 0.6, '#f1c40f', 0.8, '#e67e22', 1, '#e74c3c'],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
            'heatmap-opacity': 0.5
        }
    });

    // Nokta Katmanı (Popup için asıl katman)
    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 4, 8, 30],
            'circle-color': ['step', ['get', 'mag'], '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'],
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.9
        }
    });

    // --- Popup (Bilgi Penceresi) Sistemi ---
    map.on('click', 'quakes-point', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const { mag, place, time } = e.features[0].properties;
        const dateString = new Date(time).toLocaleString('tr-TR');

        // Küre üzerinde popup'ın doğru konumlanması için
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        new mapboxgl.Popup({ offset: 15, closeButton: true })
            .setLngLat(coordinates)
            .setHTML(`
                <div style="color: #333; font-family: sans-serif; padding: 10px; min-width: 150px;">
                    <div style="font-size: 1.5em; font-weight: bold; color: #e74c3c; border-bottom: 1px solid #ddd; margin-bottom: 5px;">M ${mag.toFixed(1)}</div>
                    <div style="font-size: 1em; margin-bottom: 8px;">📍 ${place}</div>
                    <div style="font-size: 0.85em; color: #555;">📅 ${dateString}</div>
                </div>
            `)
            .addTo(map);
    });

    // İmleç değişimi
    map.on('mouseenter', 'quakes-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'quakes-point', () => { map.getCanvas().style.cursor = ''; });
});
