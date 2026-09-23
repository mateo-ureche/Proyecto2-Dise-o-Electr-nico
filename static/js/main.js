flatpickr.localize(flatpickr.l10ns.es);

const configPicker = {
    enableTime: true,
    time_24hr: true,
    dateFormat: 'Y-m-dTH:i',
    altInput: true,
    altFormat: 'd/m/Y H:i'
};

flatpickr('#fechaInicio', configPicker);
flatpickr('#fechaFin', configPicker);

let mapa = L.map('mapa').setView([10.9878, -74.7889], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

const iconoInicio = L.divIcon({
    html: '<div style="font-size:22px; transform:translateY(-4px);">🟢</div>',
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});
const iconoFin = L.divIcon({
    html: '<div style="font-size:22px;">🏁</div>',
    className: '',
    iconSize: [24, 24],
    iconAnchor: [4, 20]
});

let marcador = L.marker([10.9878, -74.7889]).addTo(mapa);
let lineaRecorrido = L.polyline([], { color: '#2563eb', weight: 4 }).addTo(mapa);
let lineaHistorica = L.polyline([], { color: '#f59e0b', weight: 4, dashArray: '8, 6' });
let marcadorInicioHoy = L.marker([0, 0], { icon: iconoInicio });
let marcadorInicioHist = L.marker([0, 0], { icon: iconoInicio });
let marcadorFinHist = L.marker([0, 0], { icon: iconoFin });
let primeraCarga = true;
let modoHistorico = false;

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const boton = document.getElementById('botonToggle');
    const titulo = document.getElementById('tituloFlotante');

    sidebar.classList.toggle('abierta');

    if (sidebar.classList.contains('abierta')) {
        boton.style.left = '280px';
        boton.textContent = '‹';
        titulo.style.display = 'none';
    } else {
        boton.style.left = '0px';
        boton.textContent = '☰';
        titulo.style.display = 'flex';
    }
}

function formatoLegible(iso) {
    const [fecha, hora] = iso.split('T');
    const [anio, mes, dia] = fecha.split('-');
    return dia + '/' + mes + '/' + anio + ' ' + hora;
}

function distanciaMetrosAprox(p1, p2) {
    const dLat = (p2[0] - p1[0]) * 111000;
    const dLon = (p2[1] - p1[1]) * 111000 * Math.cos(p1[0] * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

function construirRutaFiltrada(puntosCrudos) {
    const ruta = [];
    let rechazosSeguidos = 0;

    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const anterior = ruta[ruta.length - 1];

        if (!anterior) {
            ruta.push(nuevoPunto);
            continue;
        }

        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;

        const esRazonable = distanciaMetrosAprox(anterior, nuevoPunto) < 500;
        if (esRazonable) {
            ruta.push(nuevoPunto);
            rechazosSeguidos = 0;
        } else {
            rechazosSeguidos++;
            if (rechazosSeguidos >= 2) {
                ruta.length = 0;
                ruta.push(nuevoPunto);
                rechazosSeguidos = 0;
            }
        }
    }

    return ruta;
}

function construirRutaHistorica(puntosCrudos) {
    const puntosUnicos = [];
    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const anterior = puntosUnicos[puntosUnicos.length - 1];

        if (!anterior || anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1]) {
            puntosUnicos.push(nuevoPunto);
        }
    }

    const segmentos = [[]];
    for (const p of puntosUnicos) {
        const segmentoActual = segmentos[segmentos.length - 1];
        const anterior = segmentoActual[segmentoActual.length - 1];

        if (anterior && distanciaMetrosAprox(anterior, p) >= 500) {
            segmentos.push([p]);
        } else {
            segmentoActual.push(p);
        }
    }

    let mejorSegmento = segmentos[0];
    for (const seg of segmentos) {
        if (seg.length > mejorSegmento.length) mejorSegmento = seg;
    }

    return mejorSegmento;
}

function dibujarRuta(ruta) {
    lineaRecorrido.setLatLngs(ruta);
    if (ruta.length > 0) {
        marcadorInicioHoy.setLatLng(ruta[0]);
        if (!mapa.hasLayer(marcadorInicioHoy)) {
            marcadorInicioHoy.addTo(mapa);
        }
    }
}

function actualizarRecorrido() {
    if (modoHistorico) return;

    fetch('/api/recorrido')
        .then(r => r.json())
        .then(puntosCrudos => {
            const ruta = construirRutaFiltrada(puntosCrudos);
            dibujarRuta(ruta);

            if (primeraCarga && ruta.length > 0) {
                mapa.setView(ruta[ruta.length - 1]);
                primeraCarga = false;
            }
        })
        .catch(error => console.error('Error cargando recorrido:', error));
}

function actualizarUbicacion() {
    if (modoHistorico) return;

    fetch('/api/ubicacion')
        .then(respuesta => respuesta.json())
        .then(datos => {
            document.getElementById('latitud').textContent = datos.latitud ?? '---';
            document.getElementById('longitud').textContent = datos.longitud ?? '---';
            document.getElementById('fecha').textContent = datos.fecha ?? '---';
            document.getElementById('hora').textContent = datos.hora ?? '---';
            document.getElementById('horaFlotante').textContent =
                (datos.fecha ?? '---') + ' · ' + (datos.hora ?? '---');

            if (datos.latitud && datos.longitud) {
                const nuevaPos = [datos.latitud, datos.longitud];
                marcador.setLatLng(nuevaPos);
                mapa.setView(nuevaPos);
            }
        })
        .catch(error => console.error('Error:', error));
}

function verHistorico() {
    const inicio = document.getElementById('fechaInicio').value;
    const fin = document.getElementById('fechaFin').value;

    if (!inicio || !fin) {
        alert('Selecciona una fecha de inicio y una de fin.');
        return;
    }

    fetch('/api/historico?inicio=' + encodeURIComponent(inicio) + '&fin=' + encodeURIComponent(fin))
        .then(r => r.json())
        .then(puntosCrudos => {
            if (puntosCrudos.error) {
                alert(puntosCrudos.error);
                return;
            }

            const ruta = construirRutaHistorica(puntosCrudos);

            if (ruta.length === 0) {
                alert('No hay datos guardados en ese rango de fechas.');
                return;
            }

            modoHistorico = true;
            mapa.removeLayer(lineaRecorrido);
            mapa.removeLayer(marcador);
            mapa.removeLayer(marcadorInicioHoy);

            lineaHistorica.setLatLngs(ruta);
            lineaHistorica.addTo(mapa);

            marcadorInicioHist.setLatLng(ruta[0]);
            marcadorInicioHist.addTo(mapa);

            marcadorFinHist.setLatLng(ruta[ruta.length - 1]);
            marcadorFinHist.addTo(mapa);

            mapa.fitBounds(lineaHistorica.getBounds(), { padding: [40, 40] });
            document.getElementById('btnTiempoReal').style.display = 'block';

            document.getElementById('tituloFlotante').classList.add('modo-historico');
            document.getElementById('horaFlotante').textContent =
                '📊 Histórico: ' + formatoLegible(inicio) + ' → ' + formatoLegible(fin);
        })
        .catch(error => console.error('Error cargando historico:', error));
}

function volverTiempoReal() {
    modoHistorico = false;
    mapa.removeLayer(lineaHistorica);
    mapa.removeLayer(marcadorInicioHist);
    mapa.removeLayer(marcadorFinHist);
    lineaRecorrido.addTo(mapa);
    marcador.addTo(mapa);
    document.getElementById('btnTiempoReal').style.display = 'none';

    document.getElementById('tituloFlotante').classList.remove('modo-historico');
    actualizarUbicacion();
    actualizarRecorrido();
}

actualizarUbicacion();
actualizarRecorrido();
setInterval(actualizarUbicacion, 10000);
setInterval(actualizarRecorrido, 10000);
