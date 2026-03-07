async function fetchData() {
    // ... loader işlemleri ...

    try {
        const results = await Promise.allSettled(sources.map(s => fetch(s.url).then(r => r.json())));
        let mergedFeatures = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const sInfo = sources[index];
                // Kaynak bazlı veri dizisi seçimi
                const rawData = result.value.features || result.value.events || (Array.isArray(result.value) ? result.value : []);
                
                const standardized = rawData.map(f => {
                    const props = f.properties || f;
                    // Koordinat güvenliği
                    let ln = 0, lt = 0;
                    if (f.geometry && f.geometry.coordinates) {
                        [ln, lt] = f.geometry.coordinates;
                    } else {
                        ln = f.longitude || props.lon || 0;
                        lt = f.latitude || props.lat || 0;
                    }

                    // Zaman damgası güvenliği
                    const rawTime = props.time || props.m_time || props.datetime;
                    const parsedTime = new Date(rawTime).getTime();

                    return {
                        sourceId: sInfo.id,
                        priority: sInfo.priority,
                        geometry: { type: 'Point', coordinates: [parseFloat(ln), parseFloat(lt)] },
                        properties: {
                            mag: parseFloat(props.mag || props.magnitude || 0),
                            place: props.place || props.region || props.flynn_region || "Bilinmeyen Bölge",
                            time: parsedTime,
                            url: props.url || (sInfo.id === 'EMSC' ? `https://www.emsc-csem.org/event/${props.unid || f.id}` : "#")
                        }
                    };
                });
                mergedFeatures = [...mergedFeatures, ...standardized];
            }
        });

        // Temizlik ve Render
        allData = typeof smartDeduplicate === 'function' ? smartDeduplicate(mergedFeatures) : mergedFeatures;
        
        // Önemli: Render öncesi eski markerları temizlediğinizden emin olun
        markers.forEach(m => m.remove());
        markers = []; 
        
        render();
        // ... istatistik güncelleme ...
    } catch (e) { 
        console.error("Veri işleme hatası:", e); 
    }
}
