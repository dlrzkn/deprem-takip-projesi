// Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxyemtuIiwiYSI6ImNtbWY2ZG5pNDA0cmwycnNodm1jdTN3cmQifQ.Sf5rAPwn1JZfwpDF_blj8Q';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [35, 39], zoom: 2.2, projection: 'globe'
});

let allData = [], markers = [], isRotating = true, currentMag = 0, currentRange = 'day';

async function fetchData() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    const sources = [
        { id: 'EMSC', url: 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=150', priority: 0 },
        { id: 'USGS', url: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${currentRange}.geojson`, priority: 1 },
        { id: 'GFZ', url: 'https://geofon.gfz.de/fdsnws/event/1/query?format=json&limit=50', priority: 2 }
    ];

    try {
        const results = await Promise.allSettled(sources.map(s => fetch(s.url).then(r => r.json())));
        let mergedFeatures = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const sInfo = sources[index];
                const rawData = result.value.features || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties ? f.properties : f;
                    const coords = f.geometry ? f.geometry.coordinates : [f.longitude, f.latitude];
                    const eventId = props.unid || f.id;
                    
                    let customUrl = props.url;
                    if (sInfo.id === 'EMSC' && eventId) customUrl = `https://www.emsc-csem.org/event/${eventId}`;
                    else if (sInfo.id === 'GFZ' && eventId) customUrl = `https://geofon.gfz.de/event/gfz${eventId}`;

                    return {
                        sourceId: sInfo.id,
                        priority: sInfo.priority,
                        geometry: { type: 'Point', coordinates: [parseFloat(coords[0]), parseFloat(coords[1])] },
                        properties: {
                            mag: parseFloat(props.mag || props.magnitude || 0),
                            // Bölge ismi hatasını burada çözüyoruz:
                            place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
                            time: new Date(props.time || props.m_time).getTime(),
                            url: customUrl || "#"
                        }
                    };
                });
                mergedFeatures = [...mergedFeatures, ...standardized];
            }
        });

        allData = smartDeduplicate(mergedFeatures);
        render();
        
        // Üst bar istatistik güncelleme
        const stats = allData.reduce((acc, curr) => { acc[curr.sourceId] = (acc[curr.sourceId] || 0) + 1; return acc; }, {});
        const updateEl = document.getElementById('last-update');
        if(updateEl) updateEl.innerText = `E:${stats.EMSC || 0} U:${stats.USGS || 0} G:${stats.GFZ || 0} | ${new Date().toLocaleTimeString('tr-TR')}`;
    } catch (e) { console.error("Veri hatası:", e); }
    finally { if(loader) loader.style.display = 'none'; }
}
