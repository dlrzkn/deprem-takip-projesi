mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39],
    zoom: 2.5,
    projection: 'globe'
});

map.addControl(new mapboxgl.NavigationControl());

map.on('load', () => {
    map.setFog({
        'range': [1, 10],
        'color': '#000000',
        'high-color': '#000000',
        'space-color': '#000000',
        'star-intensity': 0.2
    });

    let spinEnabled = false; 
    const btn = document.getElementById('spin-btn');

    function rotateGlobe() {
        if (spinEnabled) {
            const center = map.getCenter();
            center.lng -= 1.5;
            map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
    }

    if (btn) {
        btn.onclick = () => {
            spinEnabled = !spinEnabled;
            btn.innerHTML = `Otomatik Dönüş: ${spinEnabled ? 'AÇIK' : 'KAPALI'}`;
            btn.style.background = spinEnabled ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)';
            if (spinEnabled) rotateGlobe();
        };
    }

    map.on('movestart', (e) => {
        if (e.originalEvent && spinEnabled) {
            spinEnabled = false;
            if (btn) {
                btn.innerHTML = 'Otomatik Dönüş: KAPALI';
                btn.style.background = 'rgba(231, 76, 60, 0.8)';
            }
        }
    });

    map.on('moveend', () => { if (spinEnabled) rotateGlobe(); });

    map.addSource('quakes', {
        'type': 'geojson',
        'data': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    });

    map.addLayer({
        'id': 'quakes-point',
        'type': 'circle',
        'source': 'quakes',
        'paint': {
            'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 3, 4, 5, 8, 7, 15, 9, 30],
            'circle-color': [
                'step', ['get', 'mag'],
                '#2ecc71', 2.5, '#f1c40f', 4.5, '#e67e22', 6.0, '#e74c3c', 8.0, '#8e44ad'
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
        }
    });

    // Pop-up Sistemi
    map.on('click', 'quakes-point', (e) => {
        const props = e.features[0].properties;
        const date = new Date(props.time).toLocaleString('tr-TR');
        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>M ${props.mag}</strong><br>${props.place}<br><small>${date}</small>`)
            .addTo(map);
    });

    map.on('mouseenter', 'quakes-point', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'quakes-point', () => map.getCanvas().style.cursor = '');
});
