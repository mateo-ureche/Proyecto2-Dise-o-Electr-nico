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
    html: '<div style="font-size:30px;">📍</div>',
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
});
let marcadorLugar = L.marker([0, 0], { icon: iconoLugar, draggable: true, zIndexOffset: 1000 });
// El GPS nunca cae exactamente en el mismo punto: se cuenta como "pasó por aquí" si estuvo a menos de esta distancia
const TOLERANCIA_METROS = 30;
// Si el punto tocado está a más de esta distancia de una calle, no se pone el marcador
const MAXIMO_FUERA_DE_CALLE = 60;
let modoLugar = false;
 
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

function htmlVeces(pasadas) {
    const n = pasadas.length;
    if (n === 0) return "No ha pasado por aquí";
    let html = "Pasó " + (n === 1 ? "1 vez" : n + " veces") + " por aquí";
    html += '<details class="veces-popup"><summary>Ver cuándo</summary><ul>';
    pasadas.forEach(p => {
        html += "<li>" + escaparHtml(textoPasada(p)) + "</li>";
    });
    return html + "</ul></details>";
}

// ---------- Marcador en una calle ----------

function activarModoLugar() {
    if (modoLugar) {
        terminarModoLugar();
        return;
    }
    modoLugar = true;
    document.getElementById("btnCuandoPaso").textContent = "✖ Terminar";
    document.getElementById("avisoLugar").style.display = "block";
    document.getElementById("mapa").classList.add("modo-lugar");
    const sidebar = document.getElementById("sidebar");
    if (sidebar.classList.contains("abierta")) toggleSidebar();
}

function terminarModoLugar() {
    modoLugar = false;
    mapa.removeLayer(marcadorLugar);
    mapa.closePopup();
    document.getElementById("btnCuandoPaso").textContent = "📍 Marcar en el mapa";
    document.getElementById("avisoLugar").style.display = "none";
    document.getElementById("mapa").classList.remove("modo-lugar");
    document.getElementById("resultadosDireccion").innerHTML = "";
}

// Usa OSRM (OpenStreetMap) para mover el punto tocado a la calle más cercana
function ajustarACalle(latlng) {
    const url = "https://router.project-osrm.org/nearest/v1/driving/" +
        latlng.lng.toFixed(6) + "," + latlng.lat.toFixed(6) + "?number=1";
    return fetch(url)
        .then(r => r.json())
        .then(datos => {
            if (datos.code !== "Ok" || datos.waypoints.length === 0) return null;
            const w = datos.waypoints[0];
            return { latlng: L.latLng(w.location[1], w.location[0]), distancia: w.distance, calle: w.name };
        })
        // Si el servicio no responde, se usa el punto tal cual se tocó
        .catch(() => ({ latlng: latlng, distancia: 0, calle: "" }));
}

function marcarLugar(latlng, centrar, nombre) {
    if (!modoLugar) activarModoLugar();
    ajustarACalle(latlng).then(calle => {
        if (!calle || calle.distancia > MAXIMO_FUERA_DE_CALLE) {
            L.popup().setLatLng(latlng).setContent("Toca sobre una calle").openOn(mapa);
            return;
        }
        marcadorLugar.setLatLng(calle.latlng).addTo(mapa);
        if (centrar) mapa.setView(calle.latlng, Math.max(mapa.getZoom(), 17));

        const titulo = "<b>📍 " + escaparHtml(nombre || calle.calle || "Este punto") + "</b><br>";
        marcadorLugar.unbindPopup();
        marcadorLugar.bindPopup(titulo + "…", { minWidth: 200 }).openPopup();

        const p = calle.latlng;
        fetch(urlPasadas(p.lat.toFixed(6), p.lng.toFixed(6), TOLERANCIA_METROS))
            .then(r => r.json())
            .then(datos => {
                const texto = datos.error ? escaparHtml(datos.error) : htmlVeces(datos.pasadas);
                marcadorLugar.setPopupContent(titulo + texto);
            })
            .catch(() => marcadorLugar.setPopupContent(titulo + "Error del servidor"));
    });
}

mapa.on("click", e => {
    if (modoLugar) marcarLugar(e.latlng, false);
});
marcadorLugar.on("dragend", () => marcarLugar(marcadorLugar.getLatLng(), false));

// ---------- B. Buscar una dirección (Nominatim / OpenStreetMap) ----------

// Entiende direcciones colombianas: "Calle 79B #42-83", "Cra 43 # 80-15", "Cl 72 No. 50 - 20"
const TIPOS_VIA = {
    calle: "Calle", cl: "Calle", cll: "Calle", clle: "Calle",
    carrera: "Carrera", cra: "Carrera", cr: "Carrera", kr: "Carrera", kra: "Carrera", carr: "Carrera"
};

function leerDireccion(texto) {
    // "Calle 50 N 42-83": la N suelta es "número", no una letra
    texto = texto.replace(/\s+n[.°º]?\s+(?=\d)/i, " # ");
    const m = texto.trim().match(
        /^(calle|clle|cll|cl|carrera|carr|kra|cra|kr|cr)\.?\s*(\d+)\s*([a-z])?\s*(?:bis\s*)?(?:#|no\.?|n°|nº|numero|número|n\.?)?\s*(\d+)\s*([a-z])?\s*-\s*(\d+)/i
    );
    if (!m) return null;
    const via = TIPOS_VIA[m[1].toLowerCase()];
    const cruce = via === "Calle" ? "Carrera" : "Calle";
    const letraVia = (m[3] || "").toUpperCase();
    const letraCruce = (m[5] || "").toUpperCase();
    return {
        via: via, numVia: m[2], letraVia: letraVia,
        cruce: cruce, numCruce: m[4], letraCruce: letraCruce,
        metros: Number(m[6]),
        texto: via + " " + m[2] + letraVia + " #" + m[4] + letraCruce + "-" + m[6]
    };
}

function regexNombre(tipo, numero, letra) {
    return "^" + tipo + " " + numero + (letra ? " ?" + letra : "") + "$";
}

// Busca en OpenStreetMap (Overpass) el cruce entre dos calles
function buscarCruce(via, cruce, caja) {
    const consulta = '[out:json][timeout:15];' +
        'way["highway"]["name"~"' + via + '",i](' + caja + ')->.a;' +
        'way["highway"]["name"~"' + cruce + '",i](' + caja + ')->.b;' +
        'node(w.a)(w.b);out;';
    const pedir = servidor => fetch(servidor + "?data=" + encodeURIComponent(consulta))
        .then(r => {
            if (!r.ok) throw new Error("Overpass " + r.status);
            return r.json();
        });
    return pedir("https://overpass-api.de/api/interpreter")
        .catch(() => pedir("https://overpass.kumi.systems/api/interpreter"))
        .then(datos => {
            return (datos.elements || []).map(n => L.latLng(n.lat, n.lon));
        })
        .catch(() => []);
}

// Puede haber el mismo cruce en otro municipio (Soledad, Malambo...): se toma el más cercano a "referencia"
// y se promedian los nodos de ese mismo cruce (las avenidas de doble calzada tienen varios)
function cruceMasCercano(nodos, referencia) {
    if (nodos.length === 0) return null;
    const cercano = nodos.reduce((a, b) => a.distanceTo(referencia) <= b.distanceTo(referencia) ? a : b);
    const grupo = nodos.filter(n => n.distanceTo(cercano) < 80);
    return L.latLng(
        grupo.reduce((t, n) => t + n.lat, 0) / grupo.length,
        grupo.reduce((t, n) => t + n.lng, 0) / grupo.length
    );
}

// "Calle 79B #42-83" = sobre la Calle 79B, a 83 m de la Carrera 42 en dirección a la Carrera 43
function ubicarDireccion(d) {
    const c = mapa.getCenter();
    const caja = [c.lat - 0.15, c.lng - 0.15, c.lat + 0.15, c.lng + 0.15].map(v => v.toFixed(4)).join(",");
    const via = regexNombre(d.via, d.numVia, d.letraVia);
    const cruce1 = regexNombre(d.cruce, d.numCruce, d.letraCruce);
    const cruce2 = regexNombre(d.cruce, Number(d.numCruce) + 1, "");
    return Promise.all([buscarCruce(via, cruce1, caja), buscarCruce(via, cruce2, caja)])
        .then(([nodos1, nodos2]) => {
            const esquina = cruceMasCercano(nodos1, c);
            if (!esquina) return null;
            const siguiente = cruceMasCercano(nodos2, esquina);
            if (!siguiente || esquina.distanceTo(siguiente) > 400) return esquina;
            const cuadra = esquina.distanceTo(siguiente);
            const f = Math.min(d.metros / cuadra, 1);
            return L.latLng(
                esquina.lat + (siguiente.lat - esquina.lat) * f,
                esquina.lng + (siguiente.lng - esquina.lng) * f
            );
        });
}

function buscarDireccion() {
    const texto = document.getElementById("textoDireccion").value.trim();
    const resultados = document.getElementById("resultadosDireccion");
    if (!texto) {
        alert("Escribe una dirección.");
        return;
    }
    resultados.innerHTML = '<div class="lista-titulo">…</div>';

    const direccion = leerDireccion(texto);
    if (direccion) {
        ubicarDireccion(direccion).then(punto => {
            if (punto) {
                resultados.innerHTML = "";
                marcarLugar(punto, true, direccion.texto);
            } else {
                // No se encontró el cruce: se busca la calle y se muestra igual la dirección completa
                buscarEnNominatim(direccion.via + " " + direccion.numVia + direccion.letraVia, direccion.texto);
            }
        });
        return;
    }
    buscarEnNominatim(texto);
}

// Para nombres de lugares ("Universidad del Norte", "Parque Venezuela")
function buscarEnNominatim(texto, titulo) {
    const resultados = document.getElementById("resultadosDireccion");
    const centro = mapa.getCenter();
    const caja = [centro.lng - 0.3, centro.lat + 0.3, centro.lng + 0.3, centro.lat - 0.3].join(",");
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=co" +
        "&accept-language=es&bounded=1&viewbox=" + caja + "&q=" + encodeURIComponent(texto);

    fetch(url)
        .then(r => r.json())
        .then(lugares => {
            resultados.innerHTML = "";
            if (lugares.length === 0) {
                resultados.innerHTML = '<div class="lista-titulo">No encontrada</div>';
                return;
            }
            const nombre = lugar => titulo || lugar.display_name.replace(/, Colombia$/, "");
            if (lugares.length === 1 || titulo) {
                marcarLugar(L.latLng(lugares[0].lat, lugares[0].lon), true, nombre(lugares[0]));
                return;
            }
            lugares.forEach(lugar => {
                const boton = document.createElement("button");
                boton.className = "item-recorrido";
                boton.textContent = nombre(lugar);
                boton.onclick = () => {
                    resultados.innerHTML = "";
                    marcarLugar(L.latLng(lugar.lat, lugar.lon), true, nombre(lugar));
                };
                resultados.appendChild(boton);
            });
        })
        .catch(error => {
            console.error("Error buscando dirección:", error);
            resultados.innerHTML = '<div class="lista-titulo">Buscador no disponible</div>';
        });
}

// ---------- D. Tocar la ruta ----------

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
            popup.setContent(encabezado + "<br>" + htmlVeces(datos.pasadas));
        })
        .catch(error => console.error("Error buscando otras pasadas:", error));
}

// Línea morada (modo histórico): las otras veces se buscan dentro del rango Desde/Hasta
lineaHistoricaToque.on("click", e => {
    L.DomEvent.stopPropagation(e);
    if (modoLugar) return marcarLugar(e.latlng, false);
    if (recorridoActivo < 0) return;
    mostrarPopupDeRuta(recorridosHistoricos[recorridoActivo], e.latlng, true);
});

// Línea azul (en vivo): las otras veces se buscan en todo el historial
lineaRecorridoToque.on("click", e => {
    L.DomEvent.stopPropagation(e);
    if (modoLugar) return marcarLugar(e.latlng, false);
    mostrarPopupDeRuta(recorridoHoy, e.latlng, false);
});

// La página nunca debe desplazarse (evita que el título y los botones queden cortados arriba)
window.addEventListener("scroll", () => window.scrollTo(0, 0));

actualizarUbicacion();
actualizarRecorrido();
setInterval(actualizarUbicacion, 10000);
setInterval(actualizarRecorrido, 10000);