mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

map.on('load', () => {
    // Atmosfer ve Sis Ayarı
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.15
    });

    // Otomatik Dönüş Ayarı
    function rotateGlobe() {
        const center = map.getCenter();
        center.lng -= 0.1; // Dönüş hızı
        map.easeTo({ center, duration: 10, easing: (n) => n });
    }

    map.on('moveend', () => {
        rotateGlobe();
    });

    rotateGlobe(); // İlk dönüşü başlat

    // Veri Kaynağı
    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    // Isı Haritası Katmanı
    map.addLayer({
        'id': 'quakes-heat',
        'type': 'heatmap',
        'source': 'quakes',
        'maxzoom': 9,
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(33,102,172,0)',
                0.2, 'rgb(103,169,207)',
                0.4, 'rgb(209,229,240)',
                0.6, '#f1c40f',
                0.8, '#e67e22',
                1, '#e74c3c'
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
            'heatmap-opacity': 0.8
        }
    });

    // Nokta Katmanı
    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'minzoom': 3,
        'paint': {
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 8, 25],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 3.0, '#f1c40f', 4.0, '#e67e22', 5.0, '#e74c3c', 6.0, '#c0392b', 7.0, '#96281b', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1
        }
    });

    // Popup (Bilgi Penceresi) Fonksiyonu
    map.on('click', 'quakes-point', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const mag = e.features[0].properties.mag;
        const place = e.features[0].properties.place;
        const time = new Date(e.features[0].properties.time).toLocaleString('tr-TR');

        new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(`
                <div style="color: #333; font-family: sans-serif; padding: 5px;">
                    <strong style="font-size: 1.2em;">M ${mag}</strong><br>
                    <span>${place}</span><br>
                    <small style="color: #666;">${time}</small>
                </div>
            `)
            .addTo(map);
    });

    // Fare imlecini nokta üzerine gelince değiştir
    map.on('mouseenter', 'quakes-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'quakes-point', () => { map.getCanvas().style.cursor = ''; });
});
