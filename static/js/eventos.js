const TIPOS_EVENTO = {
    sueno: { nombre: "Sueño", color: "#dc2626", resta: 15,
        dibujo: '<path d="M6 11 Q12 17 18 11" /><line x1="8" y1="14" x2="7" y2="17" /><line x1="12" y1="15" x2="12" y2="18" /><line x1="16" y1="14" x2="17" y2="17" />' },
    distraccion: { nombre: "Distracción", color: "#ea580c", resta: 8,
        dibujo: '<path d="M4 12 Q12 5 20 12 Q12 19 4 12 Z" /><circle cx="15" cy="12" r="2.2" fill="#ffffff" />' },
    bostezo: { nombre: "Bostezo", color: "#ca8a04", resta: 4,
        dibujo: '<ellipse cx="12" cy="13" rx="4" ry="5" />' }
};
const OTRO_EVENTO = { nombre: "Evento", color: "#64748b", resta: 0,
    dibujo: '<line x1="12" y1="6" x2="12" y2="14" /><circle cx="12" cy="18" r="1" fill="#ffffff" />' };

let capaEventos = L.layerGroup().addTo(mapa);
let marcadoresEventos = {};
let ultimaRespuestaEventos = "";
let idsConocidos = null;
let ultimoEvento = null;
let eventosRecorridoActual = [];
let gruposAbiertos = {};

function datosTipo(tipo) {
    return TIPOS_EVENTO[tipo] || OTRO_EVENTO;
}

function puntoColor(tipo) {
    return '<span class="punto-tipo" style="background:' + datosTipo(tipo).color + '"></span>';
}

function iconoEvento(tipo) {
    const datos = datosTipo(tipo);
    return L.divIcon({
        html: '<div class="icono-evento" style="background:' + datos.color + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round">' +
            datos.dibujo + "</svg></div>",
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -14]
    });
}

function textoPopupEvento(e) {
    const datos = datosTipo(e.tipo);
    return '<div class="popup-evento">' +
        '<div class="popup-evento-titulo" style="color:' + datos.color + '">' + datos.nombre + '</div>' +
        '<div class="popup-evento-hora">' + e.fecha + " · " + e.hora + " · " + Number(e.duracion).toFixed(1) + " s</div>" +
        '<a href="' + e.imagen + '" target="_blank"><img src="' + e.imagen + '" alt="Foto del evento"></a>' +
        "</div>";
}

function tieneUbicacion(e) {
    return e.latitud !== null && e.longitud !== null && !(e.latitud === 0 && e.longitud === 0);
}

function calcularPuntaje(eventos) {
    let puntaje = 100;
    eventos.forEach(e => { puntaje -= datosTipo(e.tipo).resta; });
    return Math.max(0, puntaje);
}

function nivelPuntaje(puntaje) {
    if (puntaje >= 80) return { texto: "Atento", clase: "nivel-bueno" };
    if (puntaje >= 50) return { texto: "En riesgo", clase: "nivel-medio" };
    return { texto: "Peligro", clase: "nivel-malo" };
}

function mostrarUltimoEvento() {
    const valor = document.getElementById("panelUltimoEvento");
    if (!ultimoEvento) {
        valor.textContent = "Ninguno";
        valor.style.color = "";
        return;
    }
    const cuando = modoHistorico
        ? ultimoEvento.hora.slice(0, 5)
        : textoHace((Date.now() - aFecha(ultimoEvento)) / 1000);
    valor.textContent = datosTipo(ultimoEvento.tipo).nombre + " · " + cuando;
    valor.style.color = datosTipo(ultimoEvento.tipo).color;
}

function renderizarGruposEventos(eventos) {
    const lista = document.getElementById("listaEventos");
    lista.innerHTML = "";
    if (eventos.length === 0) {
        lista.innerHTML = '<div class="sin-eventos">Sin eventos</div>';
        actualizarFlecha();
        return;
    }

    const variosDias = eventos[0].fecha !== eventos[eventos.length - 1].fecha;
    const categorias = ["sueno", "distraccion", "bostezo"];

    categorias.forEach(tipo => {
        const delTipo = eventos.filter(e => e.tipo === tipo);
        if (delTipo.length === 0) return;

        const datos = datosTipo(tipo);
        const grupo = document.createElement("details");
        grupo.className = "grupo-evento";
        if (gruposAbiertos[tipo]) grupo.open = true;
        grupo.ontoggle = () => { gruposAbiertos[tipo] = grupo.open; };

        const resumen = document.createElement("summary");
        resumen.className = "grupo-evento-titulo";
        resumen.innerHTML =
            '<span>' + puntoColor(tipo) + datos.nombre + '</span>' +
            '<span class="grupo-evento-badge">' + delTipo.length + '</span>';
        grupo.appendChild(resumen);

        const contenedorItems = document.createElement("div");
        contenedorItems.className = "grupo-evento-lista";

        delTipo.forEach(e => {
            const boton = document.createElement("button");
            boton.className = "item-evento";
            boton.innerHTML = e.hora + (variosDias ? " · " + e.fecha.slice(0, 5) : "") +
                ' <span style="opacity:0.75;">(' + Number(e.duracion).toFixed(1) + 's)</span>';
            boton.onclick = () => abrirEvento(e.id);
            contenedorItems.appendChild(boton);
        });

        grupo.appendChild(contenedorItems);
        lista.appendChild(grupo);
    });

    actualizarFlecha();
}

function mostrarAtencion(eventosPuntaje, titulo, eventosLista) {
    const listaParaMostrar = eventosLista || eventosPuntaje;
    const puntaje = calcularPuntaje(eventosPuntaje);
    const nivel = nivelPuntaje(puntaje);
    document.getElementById("tituloAtencion").textContent = titulo;
    document.getElementById("puntajeAtencion").className = "puntaje-atencion " + nivel.clase;
    document.getElementById("valorPuntaje").textContent = puntaje;
    document.getElementById("nivelPuntaje").textContent = nivel.texto;

    const panel = document.getElementById("panelAtencion");
    panel.textContent = puntaje + " · " + nivel.texto;
    panel.className = "valor-panel " + nivel.clase;
    document.getElementById("panelEventosEtiqueta").textContent = modoHistorico ? "Eventos ruta" : "Eventos hoy";
    document.getElementById("panelEventos").textContent = listaParaMostrar.length;
    ultimoEvento = eventosPuntaje.length > 0 ? eventosPuntaje[eventosPuntaje.length - 1] : null;
    mostrarUltimoEvento();

    const contar = tipo => listaParaMostrar.filter(e => e.tipo === tipo).length;
    document.getElementById("cuentaSueno").textContent = contar("sueno");
    document.getElementById("cuentaDistraccion").textContent = contar("distraccion");
    document.getElementById("cuentaBostezo").textContent = contar("bostezo");

    renderizarGruposEventos(listaParaMostrar);
}

function seleccionarEventoEnHistorico(evento) {
    if (!modoHistorico || !recorridoVisible || !evento) return;
    const targetMs = aFecha(evento).getTime();
    let mejorPos = 0;
    let menorDiff = Infinity;

    recorridoVisible.registros.forEach((reg, idx) => {
        const diff = Math.abs(aFecha(reg).getTime() - targetMs);
        if (diff < menorDiff) {
            menorDiff = diff;
            mejorPos = idx;
        }
    });

    const slider = document.getElementById("sliderTiempo");
    const indiceRec = recorridosHistoricos.indexOf(recorridoVisible);
    if (slider && indiceRec !== -1) {
        slider.value = mejorPos;
        moverPorTiempo(indiceRec, mejorPos, false);
    }
}

function abrirEvento(id) {
    const evento = eventosRecorridoActual.find(e => e.id === id);
    if (evento && modoHistorico) {
        seleccionarEventoEnHistorico(evento);
    }

    const marcadorEvento = marcadoresEventos[id];
    if (!marcadorEvento) {
        alert("Este evento no tiene ubicación GPS.");
        return;
    }
    if (window.innerWidth <= 600 && document.getElementById("sidebar").classList.contains("abierta")) {
        toggleSidebar();
    }
    mapa.setView(marcadorEvento.getLatLng(), 17);
    marcadorEvento.openPopup();
}

function dibujarEventos(eventos) {
    const abierto = Object.keys(marcadoresEventos).find(id => marcadoresEventos[id].isPopupOpen());
    capaEventos.clearLayers();
    marcadoresEventos = {};
    eventos.filter(tieneUbicacion).forEach(e => {
        const marcadorEvento = L.marker([e.latitud, e.longitud], { icon: iconoEvento(e.tipo), zIndexOffset: 500 })
            .bindPopup(textoPopupEvento(e), { maxWidth: 260 })
            .on("click", () => {
                if (modoHistorico) seleccionarEventoEnHistorico(e);
            })
            .on("popupopen", () => { window.popupAbierto = true; })
            .on("popupclose", () => { window.popupAbierto = false; });
        marcadorEvento.addTo(capaEventos);
        marcadoresEventos[e.id] = marcadorEvento;
    });
    if (abierto && marcadoresEventos[abierto]) marcadoresEventos[abierto].openPopup();
}

function textoParaApi(momento) {
    const dos = n => String(n).padStart(2, "0");
    return momento.getFullYear() + "-" + dos(momento.getMonth() + 1) + "-" + dos(momento.getDate()) +
        "T" + dos(momento.getHours()) + ":" + dos(momento.getMinutes());
}

function rutaEventos() {
    if (!modoHistorico || !recorridoVisible) return "/api/eventos";
    const inicio = new Date(aFecha(recorridoVisible.inicio).getTime() - 60000);
    const fin = new Date(aFecha(recorridoVisible.fin).getTime() + 60000);
    return "/api/eventos?inicio=" + encodeURIComponent(textoParaApi(inicio)) +
        "&fin=" + encodeURIComponent(textoParaApi(fin));
}

function limpiarEventos() {
    capaEventos.clearLayers();
    marcadoresEventos = {};
    ultimaRespuestaEventos = "";
    eventosRecorridoActual = [];
}

function actualizarAtencionHasta(registro) {
    if (!modoHistorico || vehiculoHistorico !== "1") return;
    const limiteMs = aFecha(registro).getTime();
    const ocurridosHastaAhora = eventosRecorridoActual.filter(e => aFecha(e).getTime() <= limiteMs);

    // Mantiene TODOS los eventos visibles en el mapa y lista, pero actualiza el puntaje al instante del slider
    mostrarAtencion(ocurridosHastaAhora, "Atención en este momento", eventosRecorridoActual);

    const puntaje = calcularPuntaje(ocurridosHastaAhora);
    const nivel = nivelPuntaje(puntaje);
    const badgeTiempo = document.getElementById("puntajeTiempo");
    if (badgeTiempo) {
        badgeTiempo.textContent = puntaje + "/100 · " + nivel.texto;
        badgeTiempo.className = "puntaje-tiempo " + nivel.clase;
    }
}

function actualizarEventos() {
    const sinCamara = modoHistorico && vehiculoHistorico !== "1";
    document.getElementById("puntajeAtencion").style.display = sinCamara ? "none" : "";
    document.querySelector(".conteo-eventos").style.display = sinCamara ? "none" : "";
    if (sinCamara) {
        limpiarEventos();
        mostrarAtencion([], "Vehículo " + vehiculoHistorico + ": sin cámara", []);
        document.getElementById("panelAtencion").textContent = "Sin cámara";
        document.getElementById("panelAtencion").className = "valor-panel";
        document.getElementById("panelEventos").textContent = "--";
        document.getElementById("panelUltimoEvento").textContent = "--";
        document.getElementById("listaEventos").innerHTML = '<div class="sin-eventos">Este vehículo no tiene cámara</div>';
        return;
    }
    const ruta = rutaEventos();
    const historico = modoHistorico;
    fetch(ruta)
        .then(r => r.json())
        .then(eventos => {
            if (eventos.error || historico !== modoHistorico || ruta !== rutaEventos()) return;
            const firma = ruta + JSON.stringify(eventos);
            if (firma === ultimaRespuestaEventos) {
                mostrarUltimoEvento();
                return;
            }
            ultimaRespuestaEventos = firma;
            eventosRecorridoActual = eventos;

            // Siempre dibuja todos los eventos de la ruta en el mapa
            dibujarEventos(eventos);

            if (historico && typeof registroTiempoActual !== "undefined" && registroTiempoActual) {
                actualizarAtencionHasta(registroTiempoActual);
            } else {
                mostrarAtencion(eventos, historico ? "Atención del recorrido" : "Atención de hoy", eventos);
            }

            if (!historico) {
                const nuevos = idsConocidos ? eventos.filter(e => !idsConocidos.has(e.id)) : [];
                idsConocidos = new Set(eventos.map(e => e.id));
                if (nuevos.length > 0) avisarEventoNuevo(nuevos[nuevos.length - 1]);
            }
        })
        .catch(error => console.error("Error cargando eventos:", error));
}

function avisarEventoNuevo(e) {
    const datos = datosTipo(e.tipo);
    const aviso = document.getElementById("avisoEvento");
    aviso.textContent = "Nuevo evento: " + datos.nombre + " · " + e.hora;
    aviso.style.background = datos.color;
    aviso.classList.add("visible");
    aviso.onclick = () => abrirEvento(e.id);
    clearTimeout(aviso.temporizador);
    aviso.temporizador = setTimeout(() => aviso.classList.remove("visible"), 8000);
}

actualizarEventos();
setInterval(actualizarEventos, 5000);