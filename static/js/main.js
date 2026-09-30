flatpickr.localize(flatpickr.l10ns.es);
const configPicker = {
    enableTime: true,
    time_24hr: true,
    dateFormat: "Y-m-dTH:i",
    altInput: true,
    altFormat: "d/m/Y H:i",
    maxDate: new Date()
 
};
flatpickr("#fechaInicio", configPicker);
flatpickr("#fechaFin", configPicker);
 
let mapa = L.map('mapa', { zoomControl: false }).setView([10.9878, -74.7889], 15);
 
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);
 
L.control.zoom({ position: 'topright' }).addTo(mapa);
 
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
let lineaHistorica = L.polyline([], { color: '#7c3aed', weight: 4, dashArray: '8, 6' });
let marcadorInicioHoy = L.marker([0, 0], { icon: iconoInicio });
let marcadorInicioHist = L.marker([0, 0], { icon: iconoInicio });
let marcadorFinHist = L.marker([0, 0], { icon: iconoFin });
let primeraCarga = true;
let modoHistorico = false;
let recorridosHistoricos = [];
let recorridoActivo = -1;

// Línea invisible y más gruesa encima de la histórica para que sea fácil tocarla en el celular
let lineaHistoricaToque = L.polyline([], { color: '#7c3aed', weight: 22, opacity: 0.01 });
let lineaRecorridoToque = L.polyline([], { color: '#2563eb', weight: 22, opacity: 0.01 }).addTo(mapa);
let recorridoHoy = { puntos: [], detalle: [] };
let popupAbierto = false;
mapa.on("popupopen", () => { popupAbierto = true; });
mapa.on("popupclose", () => { popupAbierto = false; });

const iconoLugar = L.divIcon({
    html: '<div style="font-size:30px;">📌</div>',
    className: '',
    iconSize: [30, 30],
    iconAnchor: [8, 28]
});
let marcadorLugar = L.marker([0, 0], { icon: iconoLugar, draggable: true, zIndexOffset: 1000 });
// El GPS nunca cae exactamente en el mismo punto: se cuenta como "pasó por aquí" si estuvo a menos de esta distancia
const TOLERANCIA_METROS = 30;
let capaPasada = L.layerGroup();
let modoLugar = false;
let pasadasEncontradas = [];
 
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const boton = document.getElementById("botonToggle");
    const titulo = document.getElementById("tituloFlotante");
    sidebar.classList.toggle("abierta");
    if (sidebar.classList.contains("abierta")) {
        boton.style.left = "280px";
        boton.textContent = "‹";
        titulo.style.display = "none";
    } else {
        boton.style.left = "0px";
        boton.textContent = "☰";
        titulo.style.display = "flex";
    }
}
 
function formatoLegible(iso) {
    const [fecha, hora] = iso.split("T");
    const [anio, mes, dia] = fecha.split("-");
    return dia + "/" + mes + "/" + anio + " " + hora;
}
 
function distanciaMetrosAprox(p1, p2) {
    const dLat = (p2[0] - p1[0]) * 111000;
    const dLon = (p2[1] - p1[1]) * 111000 * Math.cos(p1[0] * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}
 
function construirRutaFiltrada(puntosCrudos) {
    const ruta = [];
    const detalle = [];
    let rechazosSeguidos = 0;
    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const anterior = ruta[ruta.length - 1];
 
        if (!anterior) {
            ruta.push(nuevoPunto);
            detalle.push(p);
            continue;
        }
 
        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;
 
        const esRazonable = distanciaMetrosAprox(anterior, nuevoPunto) < 500;
        if (esRazonable) {
            ruta.push(nuevoPunto);
            detalle.push(p);
            rechazosSeguidos = 0;
        } else {
            rechazosSeguidos++;
            if (rechazosSeguidos >= 2) {
                ruta.length = 0;
                detalle.length = 0;
                ruta.push(nuevoPunto);
                detalle.push(p);
                rechazosSeguidos = 0;
            }
        }
    }
    return { puntos: ruta, detalle: detalle };
}
 
const MINUTOS_PARA_SEPARAR = 10;
const PUNTOS_MINIMOS = 3;
 
function aFecha(p) {
    const [dia, mes, anio] = p.fecha.split("/");
    return new Date(anio + "-" + mes + "-" + dia + "T" + p.hora);
}
 
function construirRecorridos(puntosCrudos) {
    const recorridos = [];
    let actual = null;
    let rechazosSeguidos = 0;
 
    for (const p of puntosCrudos) {
        const lat = Math.round(p.latitud * 10000) / 10000;
        const lon = Math.round(p.longitud * 10000) / 10000;
        const nuevoPunto = [lat, lon];
        const momento = aFecha(p);
 
        if (actual === null) {
            actual = { puntos: [nuevoPunto], detalle: [p], inicio: p, fin: p, ultimoMovimiento: momento };
            continue;
        }
 
        const anterior = actual.puntos[actual.puntos.length - 1];
        const esDistinto = anterior[0] !== nuevoPunto[0] || anterior[1] !== nuevoPunto[1];
        if (!esDistinto) continue;
 
        const esSalto = distanciaMetrosAprox(anterior, nuevoPunto) >= 500;
        if (esSalto) {
            rechazosSeguidos++;
            if (rechazosSeguidos < 2) continue;
        }
        rechazosSeguidos = 0;
 
        const minutosQuieto = (momento - actual.ultimoMovimiento) / 60000;
        if (esSalto || minutosQuieto > MINUTOS_PARA_SEPARAR) {
            recorridos.push(actual);
            actual = { puntos: [nuevoPunto], detalle: [p], inicio: p, fin: p, ultimoMovimiento: momento };
        } else {
            actual.puntos.push(nuevoPunto);
            actual.detalle.push(p);
            actual.fin = p;
            actual.ultimoMovimiento = momento;
        }
    }
    if (actual !== null) recorridos.push(actual);
 
    return recorridos.filter(r => r.puntos.length >= PUNTOS_MINIMOS);
}
 
function textoRecorrido(r) {
    const horaInicio = r.inicio.hora.slice(0, 5);
    const horaFin = r.fin.hora.slice(0, 5);
    if (r.inicio.fecha === r.fin.fecha) {
        return r.inicio.fecha + "  " + horaInicio + " → " + horaFin;
    }
    return r.inicio.fecha + " " + horaInicio + " → " + r.fin.fecha + " " + horaFin;
}
 
function mostrarListaRecorridos() {
    const lista = document.getElementById("listaRecorridos");
    lista.innerHTML = "";
    if (recorridosHistoricos.length < 2) return;
 
    const titulo = document.createElement("div");
    titulo.className = "lista-titulo";
    titulo.textContent = "Se encontraron " + recorridosHistoricos.length + " recorridos. Elige uno:";
    lista.appendChild(titulo);
 
    recorridosHistoricos.forEach((r, i) => {
        const boton = document.createElement("button");
        boton.className = "item-recorrido";
        boton.textContent = (i + 1) + ". " + textoRecorrido(r);
        boton.onclick = () => dibujarRecorridoHistorico(i);
        lista.appendChild(boton);
    });
}
 
function dibujarRecorridoHistorico(indice) {
    const ruta = recorridosHistoricos[indice].puntos;
 
    recorridoActivo = indice;
    lineaHistorica.setLatLngs(ruta);
    lineaHistorica.addTo(mapa);
    lineaHistoricaToque.setLatLngs(ruta);
    lineaHistoricaToque.addTo(mapa);
 
    marcadorInicioHist.setLatLng(ruta[0]);
    marcadorInicioHist.addTo(mapa);
 
    marcadorFinHist.setLatLng(ruta[ruta.length - 1]);
    marcadorFinHist.addTo(mapa);
 
    mapa.fitBounds(lineaHistorica.getBounds(), { padding: [40, 40] });
 
    document.querySelectorAll(".item-recorrido").forEach((boton, i) => {
        boton.classList.toggle("activo", i === indice);
    });
}
 
function dibujarRuta(ruta) {
    lineaRecorrido.setLatLngs(ruta);
    lineaRecorridoToque.setLatLngs(ruta);
    if (ruta.length > 0) {
        marcadorInicioHoy.setLatLng(ruta[0]);
        if (!mapa.hasLayer(marcadorInicioHoy)) {
            marcadorInicioHoy.addTo(mapa);
        }
    }
}
 
function actualizarRecorrido() {
    if (modoHistorico) return;
    fetch("/api/recorrido")
        .then(r => r.json())
        .then(puntosCrudos => {
            recorridoHoy = construirRutaFiltrada(puntosCrudos);
            const ruta = recorridoHoy.puntos;
            dibujarRuta(ruta);
 
            if (primeraCarga && ruta.length > 0) {
                mapa.setView(ruta[ruta.length - 1]);
                primeraCarga = false;
            }
        })
        .catch(error => console.error("Error cargando recorrido:", error));
}
 
function actualizarUbicacion() {
    if (modoHistorico) return;
    fetch("/api/ubicacion")
        .then(respuesta => respuesta.json())
        .then(datos => {
            document.getElementById("latitud").textContent = datos.latitud ?? "---";
            document.getElementById("longitud").textContent = datos.longitud ?? "---";
            document.getElementById("fecha").textContent = datos.fecha ?? "---";
            document.getElementById("hora").textContent = datos.hora ?? "---";
            document.getElementById("horaFlotante").textContent =
                (datos.fecha ?? "---") + " · " + (datos.hora ?? "---");
 
            if (datos.latitud && datos.longitud) {
                const nuevaPos = [datos.latitud, datos.longitud];
                marcador.setLatLng(nuevaPos);
                if (!modoLugar && !popupAbierto) mapa.setView(nuevaPos);
            }
        })
        .catch(error => console.error("Error:", error));
}
 
function verHistorico() {
    const inicio = document.getElementById("fechaInicio").value;
    const fin = document.getElementById("fechaFin").value;
 
    if (!inicio || !fin) {
        alert("Selecciona una fecha de inicio y una de fin.");
        return;
    }
 
    fetch("/api/historico?inicio=" + encodeURIComponent(inicio) + "&fin=" + encodeURIComponent(fin))
        .then(r => r.json())
        .then(puntosCrudos => {
            if (puntosCrudos.error) {
                alert(puntosCrudos.error);
                return;
            }
 
            recorridosHistoricos = construirRecorridos(puntosCrudos);
 
            if (recorridosHistoricos.length === 0) {
                alert("No hay datos guardados en ese rango de fechas.");
                return;
            }
 
            modoHistorico = true;
            mapa.removeLayer(lineaRecorrido);
            mapa.removeLayer(lineaRecorridoToque);
            mapa.removeLayer(marcador);
            mapa.removeLayer(marcadorInicioHoy);
 
            mostrarListaRecorridos();
            dibujarRecorridoHistorico(0);
 
            document.getElementById("btnTiempoReal").style.display = "block";
 
            document.getElementById("tituloFlotante").classList.add("modo-historico");
            document.getElementById("horaFlotante").textContent =
                "📊 Histórico: " + formatoLegible(inicio) + " → " + formatoLegible(fin);
        })
        .catch(error => console.error("Error cargando historico:", error));
}
 
function volverTiempoReal() {
    modoHistorico = false;
    mapa.removeLayer(lineaHistorica);
    mapa.removeLayer(lineaHistoricaToque);
    mapa.closePopup();
    recorridoActivo = -1;
    mapa.removeLayer(marcadorInicioHist);
    mapa.removeLayer(marcadorFinHist);
    lineaRecorrido.addTo(mapa);
    lineaRecorridoToque.addTo(mapa);
    marcador.addTo(mapa);
    document.getElementById("btnTiempoReal").style.display = "none";
    recorridosHistoricos = [];
    document.getElementById("listaRecorridos").innerHTML = "";
 
    document.getElementById("tituloFlotante").classList.remove("modo-historico");
    actualizarUbicacion();
    actualizarRecorrido();
}
 
// ================================================================
// ¿Cuándo pasó el vehículo por determinado lugar?
// ================================================================

function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = texto ?? "";
    return div.innerHTML;
}

function rangoSeleccionado() {
    const inicio = document.getElementById("fechaInicio").value;
    const fin = document.getElementById("fechaFin").value;
    if (inicio && fin) return { inicio, fin };
    return null;
}

function urlPasadas(lat, lon, radio, usarRango = true) {
    let url = "/api/pasadas?lat=" + lat + "&lon=" + lon + "&radio=" + radio;
    const rango = usarRango ? rangoSeleccionado() : null;
    if (rango) {
        url += "&inicio=" + encodeURIComponent(rango.inicio) + "&fin=" + encodeURIComponent(rango.fin);
    }
    return url;
}

function fechaCorta(fecha) {
    return fecha.slice(0, 5);
}

function textoPasada(p) {
    const entrada = p.entrada.hora.slice(0, 5);
    const salida = p.salida.hora.slice(0, 5);
    const duracion = p.minutos < 1 ? "<1 min" : Math.round(p.minutos) + " min";
    const dia = fechaCorta(p.entrada.fecha);
    if (p.entrada.fecha === p.salida.fecha) {
        return dia + " · " + entrada + "–" + salida + " · " + duracion;
    }
    return dia + " " + entrada + " – " + fechaCorta(p.salida.fecha) + " " + salida;
}

// ---------- E. Pin arrastrable ----------

function colocarLugar(latlng, zoom) {
    modoLugar = true;
    marcadorLugar.setLatLng(latlng).addTo(mapa);
    document.getElementById("controlesLugar").style.display = "block";
    if (zoom) {
        mapa.setView(latlng, Math.max(mapa.getZoom(), 16));
    }
    buscarPasadas();
}

function ponerPinEnCentro() {
    colocarLugar(mapa.getCenter(), false);
}

function quitarLugar() {
    modoLugar = false;
    mapa.removeLayer(marcadorLugar);
    capaPasada.clearLayers();
    mapa.removeLayer(capaPasada);
    pasadasEncontradas = [];
    document.getElementById("controlesLugar").style.display = "none";
    document.getElementById("listaPasadas").innerHTML = "";
    document.getElementById("resultadosDireccion").innerHTML = "";
}

marcadorLugar.on("dragend", () => buscarPasadas());

mapa.on("click", e => {
    if (!modoLugar) return;
    marcadorLugar.setLatLng(e.latlng);
    buscarPasadas();
});

function buscarPasadas() {
    const centro = marcadorLugar.getLatLng();
    const lista = document.getElementById("listaPasadas");
    lista.innerHTML = '<div class="lista-titulo">…</div>';
    capaPasada.clearLayers();

    fetch(urlPasadas(centro.lat.toFixed(6), centro.lng.toFixed(6), TOLERANCIA_METROS))
        .then(r => r.json())
        .then(datos => {
            if (datos.error) {
                lista.innerHTML = '<div class="lista-titulo">' + escaparHtml(datos.error) + '</div>';
                return;
            }
            pasadasEncontradas = datos.pasadas;
            mostrarListaPasadas();
        })
        .catch(error => {
            console.error("Error buscando pasadas:", error);
            lista.innerHTML = '<div class="lista-titulo">Error del servidor</div>';
        });
}

function mostrarListaPasadas() {
    const lista = document.getElementById("listaPasadas");
    lista.innerHTML = "";

    const titulo = document.createElement("div");
    titulo.className = "lista-titulo";
    const n = pasadasEncontradas.length;
    titulo.textContent = n === 0 ? "No ha pasado por aquí" : n === 1 ? "Pasó 1 vez por aquí" : "Pasó " + n + " veces por aquí";
    lista.appendChild(titulo);
    if (n === 0) return;

    // Las veces quedan ocultas hasta que el usuario pida verlas
    const veces = document.createElement("div");
    veces.style.display = "none";
    pasadasEncontradas.forEach((p, i) => {
        const boton = document.createElement("button");
        boton.className = "item-recorrido item-pasada";
        boton.textContent = textoPasada(p);
        boton.onclick = () => mostrarPasada(i);
        veces.appendChild(boton);
    });

    const botonVer = document.createElement("button");
    botonVer.className = "btn btn-ver-cuando";
    botonVer.textContent = "Ver cuándo ▾";
    botonVer.onclick = () => {
        const oculto = veces.style.display === "none";
        veces.style.display = oculto ? "block" : "none";
        botonVer.textContent = oculto ? "Ocultar ▴" : "Ver cuándo ▾";
    };
    lista.appendChild(botonVer);
    lista.appendChild(veces);
}

function mostrarPasada(indice) {
    const p = pasadasEncontradas[indice];
    capaPasada.clearLayers();
    p.puntos.forEach(punto => {
        L.circleMarker([punto.latitud, punto.longitud], {
            radius: 5, color: '#ffffff', weight: 1, fillColor: '#AF043C', fillOpacity: 0.9
        })
            .bindTooltip(punto.fecha + " " + punto.hora)
            .addTo(capaPasada);
    });
    capaPasada.addTo(mapa);

    L.popup()
        .setLatLng([p.puntos[0].latitud, p.puntos[0].longitud])
        .setContent("<b>" + escaparHtml(textoPasada(p)) + "</b>")
        .openOn(mapa);

    document.querySelectorAll(".item-pasada").forEach((boton, i) => {
        boton.classList.toggle("activo", i === indice);
    });
}

// ---------- B. Buscar una dirección (Nominatim / OpenStreetMap) ----------

function buscarDireccion() {
    const texto = document.getElementById("textoDireccion").value.trim();
    const resultados = document.getElementById("resultadosDireccion");
    if (!texto) {
        alert("Escribe una dirección.");
        return;
    }
    resultados.innerHTML = '<div class="lista-titulo">…</div>';

    const centro = mapa.getCenter();
    const caja = [centro.lng - 0.3, centro.lat + 0.3, centro.lng + 0.3, centro.lat - 0.3].join(",");
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=co" +
        "&accept-language=es&viewbox=" + caja + "&q=" + encodeURIComponent(texto);

    fetch(url)
        .then(r => r.json())
        .then(lugares => {
            resultados.innerHTML = "";
            if (lugares.length === 0) {
                resultados.innerHTML = '<div class="lista-titulo">No encontrada</div>';
                return;
            }
            if (lugares.length === 1) {
                colocarLugar(L.latLng(lugares[0].lat, lugares[0].lon), true);
                return;
            }
            lugares.forEach(lugar => {
                const boton = document.createElement("button");
                boton.className = "item-recorrido";
                boton.textContent = lugar.display_name.split(",").slice(0, 2).join(",");
                boton.onclick = () => {
                    resultados.innerHTML = "";
                    colocarLugar(L.latLng(lugar.lat, lugar.lon), true);
                };
                resultados.appendChild(boton);
            });
        })
        .catch(error => {
            console.error("Error buscando dirección:", error);
            resultados.innerHTML = '<div class="lista-titulo">Buscador no disponible</div>';
        });
}

// ---------- D. Tocar la ruta histórica ----------

function puntoMasCercano(recorrido, latlng) {
    let mejor = 0;
    let mejorDistancia = Infinity;
    recorrido.puntos.forEach((punto, i) => {
        const d = distanciaMetrosAprox(punto, [latlng.lat, latlng.lng]);
        if (d < mejorDistancia) {
            mejorDistancia = d;
            mejor = i;
        }
    });
    return mejor;
}

function analizarPuntoDeRuta(lat, lon) {
    mapa.closePopup();
    colocarLugar(L.latLng(lat, lon), false);
    const sidebar = document.getElementById("sidebar");
    if (!sidebar.classList.contains("abierta")) toggleSidebar();
}

function mostrarPopupDeRuta(recorrido, latlng, usarRango) {
    if (!recorrido || recorrido.puntos.length === 0) return;
    const i = puntoMasCercano(recorrido, latlng);
    const [lat, lon] = recorrido.puntos[i];
    const crudo = recorrido.detalle[i];

    const encabezado = "<b>" + escaparHtml(fechaCorta(crudo.fecha) + " · " + crudo.hora.slice(0, 5)) + "</b>";
    const popup = L.popup({ minWidth: 200 })
        .setLatLng([lat, lon])
        .setContent(encabezado)
        .openOn(mapa);

    fetch(urlPasadas(lat, lon, TOLERANCIA_METROS, usarRango))
        .then(r => r.json())
        .then(datos => {
            if (!mapa.hasLayer(popup) || datos.error) return;
            const n = datos.pasadas.length;
            let html = encabezado;
            html += "<br>Pasó " + (n === 1 ? "1 vez" : n + " veces") + " por aquí";
            html += '<details class="veces-popup"><summary>Ver cuándo</summary><ul>';
            datos.pasadas.forEach(p => {
                html += "<li>" + escaparHtml(textoPasada(p)) + "</li>";
            });
            html += "</ul></details>";
            html += '<button class="btn-popup" onclick="analizarPuntoDeRuta(' + lat + ',' + lon + ')">📌 Ver lugar</button>';
            popup.setContent(html);
        })
        .catch(error => console.error("Error buscando otras pasadas:", error));
}

// Línea morada (modo histórico): las otras veces se buscan dentro del rango Desde/Hasta
lineaHistoricaToque.on("click", e => {
    L.DomEvent.stopPropagation(e);
    if (recorridoActivo < 0) return;
    mostrarPopupDeRuta(recorridosHistoricos[recorridoActivo], e.latlng, true);
});

// Línea azul (en vivo): las otras veces se buscan en todo el historial
lineaRecorridoToque.on("click", e => {
    L.DomEvent.stopPropagation(e);
    mostrarPopupDeRuta(recorridoHoy, e.latlng, false);
});

actualizarUbicacion();
actualizarRecorrido();
setInterval(actualizarUbicacion, 10000);
setInterval(actualizarRecorrido, 10000);