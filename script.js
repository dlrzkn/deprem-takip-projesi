mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

// Kontrolleri ekleyelim
map.addControl(new mapboxgl.NavigationControl());

map.on('load', () => {
    // Atmosfer Ayarı
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.15
    });

    // --- Akıllı Dönüş Sistemi ---
    let userInteracting = false;
    let spinEnabled = true;

    function rotateGlobe() {
        if (spinEnabled && !userInteracting) {
            const center = map.getCenter();
            center.lng -= 0.5; // Dönüş hızı
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
    }

    // Etkileşim olduğunda dönüşü durdurur (Zoom ve Drag için)
    map.on('movestart', (e) => {
        if (e.originalEvent) userInteracting = true;
    });

    map.on('moveend', () => {
        rotateGlobe();
    });

    // Haritaya dokunulduğunda veya tıklandığında kontrolü kullanıcıya bırak
    map.on('mousedown', () => { userInteracting = true; });
    map.on('touchstart', () => { userInteracting = true; });

    rotateGlobe();

    // Veri Kaynağı
    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    // Isı Haritası (Heatmap)
    map.addLayer({
        'id': 'quakes-heat',
        'type': 'heatmap',
        'source': 'quakes',
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
            'heatmap-opacity': 0.3
        }
    });

    // Nokta Katmanı (Yeni Lejand Renkleriyle Tam Uyumlu)
    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': [
                'interpolate', ['linear'], ['get', 'mag'],
                1, 2,
                3, 4,
                5, 8,
                7, 15,
                9, 25
            ],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
        }
    });

    // Popup Sistemi
    map.on('click', 'quakes-point', (e) => {
        userInteracting = true; // Popup açılınca dünyayı durdur
        const coordinates = e.features[0].geometry.coordinates.slice();
        const { mag, place, time } = e.features[0].properties;

        new mapboxgl.Popup({ offset: 10 })
            .setLngLat(coordinates)
            .setHTML(`
                <div style="color:#333; font-family:sans-serif; padding:5px;">
                    <b style="font-size:1.2em; color:#e74c3c;">M ${mag.toFixed(1)}</b><br>
                    <span>${place}</span>
                </div>
            `)
            .addTo(map);
    });
});
