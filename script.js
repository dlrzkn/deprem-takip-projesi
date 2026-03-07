mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], zoom: 2.2, projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

// API URL'leri ve Hiyerarşi Tanımı
const API_SOURCES = [
    { name: 'EMSC', url: 'https://www.emsc-csem.org/fdsnws/event/1/query?format=json&limit=200', priority: 1 },
    { name: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`, priority: 2 },
    { name: 'GEOFON', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=200', priority: 3 }
];

async function fetchData() {
    document.getElementById('loader').style.display = 'flex';
    try {
        // Üç kaynaktan eşzamanlı veri çekme
        const responses = await Promise.all(
            API_SOURCES.map(source => 
                fetch(source.name === 'USGS' ? `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson` : source.url)
                .then(res => res.json())
                .catch(err => ({ features: [] })) // Hata alan kaynağı boş dön
            )
        );

        let mergedFeatures = [];
        responses.forEach((json, index) => {
            const sourceName = API_SOURCES[index].name;
            const priority = API_SOURCES[index].priority;
            
            // Verileri ortak bir formata standardize etme
            const standardized = json.features.map(f => ({
                ...f,
                source: sourceName,
                priority: priority,
                // GEOFON veya EMSC koordinat yapısı farklılık gösterebilir, USGS standardına çekiyoruz
                properties: {
                    ...f.properties,
                    mag: f.properties.mag || f.properties.magnitude, // Bazı API'ler magnitude der
                    place: f.properties.place || f.properties.region || "Bilinmeyen Bölge",
                    time: new Date(f.properties.time).getTime()
                }
            }));
            mergedFeatures = [...mergedFeatures, ...standardized];
        });

        // Akıllı Tekilleştirme (Deduplication)
        allData = deduplicateEarthquakes(mergedFeatures);
        
        render();
        document.getElementById('last-update').innerText = "Son: " + new Date().toLocaleTimeString();
    } catch (e) { console.error("Veri çekme hatası:", e); }
    document.getElementById('loader').style.display = 'none';
}

function deduplicateEarthquakes(features) {
    const finalData = [];
    const TIME_THRESHOLD = 60000; // 60 saniye (ms)
    const DISTANCE_THRESHOLD = 0.5; // Yaklaşık 50km (derece cinsinden kaba hesap)

    // Önce hiyerarşiye (priority) göre sırala (1 en yüksek)
    features.sort((a, b) => a.priority - b.priority);

    features.forEach(current => {
        // Mevcut listede bu depreme çok yakın (zaman ve mekan olarak) başka biri var mı?
        const isDuplicate = finalData.some(existing => {
            const timeDiff = Math.abs(current.properties.time - existing.properties.time);
            const distDiff = Math.sqrt(
                Math.pow(current.geometry.coordinates[0] - existing.geometry.coordinates[0], 2) +
                Math.pow(current.geometry.coordinates[1] - existing.geometry.coordinates[1], 2)
            );
            return timeDiff < TIME_THRESHOLD && distDiff < DISTANCE_THRESHOLD;
        });

        if (!isDuplicate) {
            finalData.push(current);
        }
    });
    return finalData;
}

function render() {
    markers.forEach(m => m.remove());
    markers = allData
        .filter(f => f.properties.mag >= currentMag)
        .map(f => {
            const mag = f.properties.mag;
            const source = f.source;
            const color = mag >= 7 ? '#c0392b' : mag >= 6 ? '#e74c3c' : mag >= 5 ? '#e67e22' : mag >= 3 ? '#f1c40f' : '#2ecc71';
            
            const el = document.createElement('div');
            el.className = 'sismic-marker';
            // Kaynağa göre marker stili (Opsiyonel: EMSC olanlara farklı kenarlık eklenebilir)
            el.style.cssText = `background:${color}; width:${mag*3+6}px; height:${mag*3+6}px; border: 1px solid rgba(255,255,255,0.5);`;

            return new mapboxgl.Marker(el)
                .setLngLat(f.geometry.coordinates)
                .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(`
                    <div style="color:#000; padding:5px; font-family: sans-serif;">
                        <strong style="color:${color}">${f.properties.place}</strong><br>
                        <b>Büyüklük:</b> ${mag.toFixed(1)} Mw<br>
                        <b>Kaynak:</b> <span style="color:blue">${source}</span><br>
                        <small>${new Date(f.properties.time).toLocaleString('tr-TR')}</small>
                    </div>
                `))
                .addTo(map);
        });
}

// Mevcut rotate, toggle ve change fonksiyonlarınızı burada muhafaza edin...

