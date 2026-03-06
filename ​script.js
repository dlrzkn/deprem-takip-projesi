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
    map.setFog({ 'color': 'rgb(15, 20, 30)', 'high-color': 'rgb(30, 60, 150)', 'star-intensity': 0.4 });
});

async function updateQuakes() {
    try {
        const [kRes, uRes] = await Promise.all([
            fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live'),
            fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson')
        ]);
        
        const kData = await kRes.json();
        const uGeojson = await uRes.json();

        const kGeojson = {
            type: 'FeatureCollection',
            features: kData.result.map(d => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [parseFloat(d.lng), parseFloat(d.lat)] },
                properties: { mag: d.mag, place: d.title, date: d.date, source: 'Kandilli' }
            }))
        };

        if (map.getSource('usgs')) {
            map.getSource('usgs').setData(uGeojson);
            map.getSource('kandilli').setData(kGeojson);
        } else {
            // Önce USGS (Alt Katman)
            map.addSource('usgs', { type: 'geojson', data: uGeojson });
            map.addLayer({
                id: 'usgs-viz', type: 'circle', source: 'usgs',
                paint: { 'circle-radius': ['*', ['get', 'mag'], 2], 'circle-color': '#ffff00', 'circle-opacity': 0.4 }
            });

            // Sonra Kandilli (Üst Katman - Daha Belirgin)
            map.addSource('kandilli', { type: 'geojson', data: kGeojson });
            map.addLayer({
                id: 'kandilli-viz', type: 'circle', source: 'kandilli',
                paint: { 
                    'circle-radius': ['*', ['get', 'mag'], 3], 
                    'circle-color': '#ff4d4d', 
                    'circle-stroke-width': 1, 
                    'circle-stroke-color': '#fff' 
                }
            });
        }
    } catch (e) { console.error("Veri hatası:", e); }
}

// ... (Dönüş ve etkileşim kodları buraya gelecek)
map.on('load', () => { updateQuakes(); setInterval(updateQuakes, 60000); });

