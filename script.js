/**
 * PROFESYONEL DERİNLİK ANALİZİ GÖRSELLEŞTİRME
 */
SeismoEngine.renderDepthChart = function() {
    const container = document.getElementById('depth-analysis');
    if (!container) return;

    // Sismolojik katmanlara göre filtreleme
    const shallow = this.state.filteredEvents.filter(ev => ev.depth < 70).length;
    const deep = this.state.filteredEvents.filter(ev => ev.depth >= 70).length;
    const total = this.state.filteredEvents.length || 1;

    const shallowPerc = ((shallow / total) * 100).toFixed(1);
    const deepPerc = ((deep / total) * 100).toFixed(1);

    container.innerHTML = `
        <div class="analysis-item">
            <div class="analysis-label">Sığ Odaklı (0-70 km) <span>%${shallowPerc}</span></div>
            <div class="analysis-bar-bg">
                <div class="analysis-bar-fill shallow" style="width: ${shallowPerc}%"></div>
            </div>
        </div>
        <div class="analysis-item" style="margin-top: 15px;">
            <div class="analysis-label">Derin Odaklı (>70 km) <span>%${deepPerc}</span></div>
            <div class="analysis-bar-bg">
                <div class="analysis-bar-fill deep" style="width: ${deepPerc}%"></div>
            </div>
        </div>
        <div class="analysis-footer">
            Toplam ${total} sismik olay analiz edildi.
        </div>
    `;
};



/**
 * UI ETKİLEŞİM YÖNETİMİ
 */
SeismoEngine.attachUIListeners = function() {
    // 1. Sıralama Döngüsü (Zaman -> Büyükten Küçüğe -> Küçükten Büyüğe)
    const sortBtn = document.getElementById('sort-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            this.state.sortMode = (this.state.sortMode + 1) % 3;
            const labels = ["🕒 En Güncel", "📉 Büyükten Küçüğe", "📈 Küçükten Büyüğe"];
            // HTML içindeki .btn-text'i bulup değiştiriyoruz
            const btnText = sortBtn.querySelector('.btn-text');
            if (btnText) btnText.innerText = labels[this.state.sortMode];
            this.updateUI();
        });
    }

    // 2. Minimum Büyüklük Slider (HTML'deki id="mag-slider" ile uyumlu)
    const slider = document.getElementById('mag-slider');
    if (slider) {
        slider.addEventListener('input', (e) => {
            this.state.minMag = parseFloat(e.target.value);
            const valDisplay = document.getElementById('mag-value');
            if (valDisplay) valDisplay.innerText = this.state.minMag.toFixed(1) + '+';
            this.updateUI();
        });
    }

    // 3. Zaman Aralığı Seçimi (Active class yönetimi eklendi)
    document.querySelectorAll('[data-time]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.state.timeRange = e.currentTarget.dataset.time;
            this.fetchSeismicData();
        });
    });

    // 4. Derinlik Filtresi
    document.querySelectorAll('[data-depth]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-depth]').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this.state.depthFilter = e.currentTarget.dataset.depth;
            this.updateUI();
        });
    });

    // 5. Rotasyon Toggle
    const rotBtn = document.getElementById('rotation-toggle');
    if (rotBtn) {
        rotBtn.addEventListener('click', () => {
            this.state.isRotating = !this.state.isRotating;
            rotBtn.classList.toggle('active');
            rotBtn.innerText = this.state.isRotating ? "🔄 Rotasyon: AÇIK" : "📍 Rotasyon: KAPALI";
        });
    }
};



/**
 * VERİ NORMALİZASYONU & KAYNAK YÖNETİMİ
 */
SeismoEngine.normalizeData = function(data, source) {
    return data.map(item => {
        const props = item.properties || item;
        const coords = item.geometry ? item.geometry.coordinates : [item.longitude, item.latitude];
        
        // Bölge isimlendirme kontrolü
        let placeName = props.place || props.region || props.flynn_region || "Tanımlanamayan Bölge";
        
        // Dinamik Kaynak Linki Oluşturma
        let externalUrl = "#";
        if (source === 'USGS') {
            externalUrl = `https://earthquake.usgs.gov/earthquakes/eventpage/${props.code || props.id}`;
        } else if (source === 'EMSC') {
            externalUrl = `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${props.unid || props.id}`;
        }

        return {
            id: props.unid || props.id || Math.random(),
            mag: parseFloat(props.mag || props.magnitude || 0),
            depth: parseFloat(props.depth || props.depth_mag || 0),
            place: placeName,
            time: new Date(props.time || props.m_time).getTime(),
            source: source, // USGS, EMSC veya GFZ
            url: externalUrl,
            coordinates: [parseFloat(coords[0]), parseFloat(coords[1])]
        };
    });
};



/**
 * VERİ GÖRSELLEŞTİRME VE HARİTA TETİKLEYİCİLERİ
 */

// Global UI Güncelleyici: Filtreleme ve Sıralamayı Yönetir
SeismoEngine.updateUI = function() {
    // 1. Filtreleme Uygula
    this.state.filteredEvents = this.state.rawEvents.filter(ev => {
        const mMatch = ev.mag >= this.state.minMag;
        const dMatch = this.state.depthFilter === 'all' || 
            (this.state.depthFilter === 'shallow' ? ev.depth < 70 : ev.depth >= 70);
        return mMatch && dMatch;
    });

    // 2. Sıralama Uygula (Sort Mode: 0: Zaman, 1: Azalan, 2: Artan)
    const mode = this.state.sortMode;
    this.state.filteredEvents.sort((a, b) => {
        if (mode === 0) return b.time - a.time; 
        if (mode === 1) return b.mag - a.mag;   
        if (mode === 2) return a.mag - b.mag;   
        return 0;
    });

    // 3. Alt Bileşenleri Güncelle
    this.renderList();          // Sağ Panel
    this.renderDepthChart();    // Sol Panel Analiz (Bölüm 1'deki kod)
    this.processAnalytics();    // Üst Bar Enerji (TJ)
    this.updateMapSource();     // Harita Noktaları
};

// Sağ Panele Deprem Kartlarını Basar
SeismoEngine.renderList = function() {
    const container = document.getElementById('earthquake-feed');
    const countLabel = document.getElementById('event-count');
    if (!container) return;
    
    container.innerHTML = '';
    if (countLabel) countLabel.innerText = `${this.state.filteredEvents.length} Olay Listeleniyor`;

    this.state.filteredEvents.forEach(ev => {
        const node = document.createElement('div');
        node.className = 'earthquake-node';
        node.innerHTML = `
            <div class="mag-circle" style="border-color: ${this.getMagColor(ev.mag)}; color: ${this.getMagColor(ev.mag)}">
                ${ev.mag.toFixed(1)}
            </div>
            <div class="node-details">
                <div class="node-title">${ev.place}</div>
                <div class="node-meta">
                    ${ev.depth > 0 ? ev.depth + ' km' : 'Sığ'} • ${new Date(ev.time).toLocaleTimeString('tr-TR')}
                    <span class="node-src-tag">${ev.source}</span>
                </div>
            </div>`;
        
        node.onclick = () => { 
            this.state.userInteracting = true; 
            this.state.map.flyTo({ center: ev.coordinates, zoom: 8, essential: true }); 
        };
        container.appendChild(node);
    });
};

// Haritadaki Tıklama Olaylarını Yönetir (Gelişmiş Pop-up)
SeismoEngine.attachEventHandlers = function() {
    const map = this.state.map;

    map.on('click', 'unclustered-point', (e) => {
        const p = e.features[0].properties;
        this.state.userInteracting = true;

        const popupHTML = `
            <div class="popup-card">
                <div class="popup-header" style="background:${this.getMagColor(p.mag)}">
                    <strong>M<sub>w</sub> ${parseFloat(p.mag).toFixed(1)}</strong>
                    <span>${p.source}</span>
                </div>
                <div class="popup-body">
                    <p><strong>Bölge:</strong> ${p.place}</p>
                    <p><strong>Derinlik:</strong> ${p.depth > 0 ? p.depth + ' km' : 'Sığ Focus'}</p>
                    <p><strong>Zaman:</strong> ${new Date(p.time).toLocaleString('tr-TR')}</p>
                    <hr>
                    <div class="popup-footer">
                        <a href="${p.url}" target="_blank" class="popup-link">
                            ${p.source === 'USGS' ? 'USGS Event Page' : 'Bilimsel Detaylar'} ↗
                        </a>
                    </div>
                </div>
            </div>`;

        new mapboxgl.Popup({ offset: 15, closeButton: true })
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(popupHTML)
            .addTo(map);
    });

    map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor = '');
};

