mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

// Yakınlaştırma butonlarını ekle
map.addControl(new mapboxgl.NavigationControl());

map.on('load', () => {
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.15
    });

    // --- Akıllı Dönüş Sistemi (Zoom ve Mouse Dostu) ---
    let spinEnabled = true;
    const rotationSpeed = 0.5; // Hızı biraz düşürdük ki daha akıcı olsun

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= rotationSpeed;
            // duration ve easing ayarları zoom yapmana izin verecek şekilde yumuşatıldı
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
    }

    // Mouse ile etkileşime girdiğinde dönüşü tamamen durdurur (Zoom yapmanı sağlar)
    map.on('movestart', (e) => {
        if (e.originalEvent) spinEnabled = false;
    });

    // Boş bir yere tıkladığında dönüşü tekrar başlatmak istersen:
    map.on('click', (e) => {
        if (e.target === map) spinEnabled = true;
    });

    map.on('moveend', () => {
        rotateGlobe();
    });

    rotateGlobe();

    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    // Isı Haritası
    map.addLayer({
        'id': 'quakes-heat',
        'type': 'heatmap',
        'source': 'quakes',
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
            'heatmap-opacity': 0.3
        }
    });

    // Nokta Katmanı (Kibarlaştırılmış Boyutlar)
    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': [
                'interpolate', ['linear'], ['get', 'mag'],
                1, 2,   // Küçük depremler minik
                5, 6,   // Orta depremler ideal
                8, 15   // Dev depremler bile ekranı kaplamaz
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
        spinEnabled = false; // Detay bakarken dünya dönmesin
        const coordinates = e.features[0].geometry.coordinates.slice();
        const { mag, place, time } = e.features[0].properties;

        new mapboxgl.Popup({ offset: 10 })
            .setLngLat(coordinates)
            .setHTML(`<div style="color:#222; padding:5px;"><b>M ${mag.toFixed(1)}</b><br>${place}</div>`)
            .addTo(map);
    });
});
