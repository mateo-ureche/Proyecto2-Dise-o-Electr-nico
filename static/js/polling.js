let lineaEnCalle = [];
let ultimoEnCalle = null;
let pegando = false;

function pegarRutaEnVivo(ruta) {
    if (pegando || ruta.length < 2) return;
    const desde = ultimoEnCalle
        ? ruta.findLastIndex(p => p[0] === ultimoEnCalle[0] && p[1] === ultimoEnCalle[1])
        : -1;
    if (desde === -1) lineaEnCalle = [];
    const nuevos = ruta.slice(Math.max(desde, 0));
    if (nuevos.length < 2) return;

    pegando = true;
    pegarACalles(nuevos).then(parte => {
        lineaEnCalle = lineaEnCalle.concat(parte);
        ultimoEnCalle = ruta[ruta.length - 1];
        pegando = false;
        if (!modoHistorico) lineaRecorrido.setLatLngs(lineaEnCalle);
    });
}

function dibujarRuta(ruta) {
    if (lineaEnCalle.length === 0) lineaRecorrido.setLatLngs(ruta);
    pegarRutaEnVivo(ruta);
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
            const ruta = construirRutaFiltrada(puntosCrudos);
            dibujarRuta(ruta);

            const n = puntosCrudos.length;
            if (n > 0) {
                const ultimo = puntosCrudos[n - 1];
                const velocidad = n >= 2 ? velocidadKmh(puntosCrudos[n - 2], ultimo) : null;
                const segundosSinSenal = (Date.now() - aFecha(ultimo)) / 1000;
                mostrarPanel(velocidad, estadoVehiculo(velocidad, segundosSinSenal), distanciaKm(ruta),
                             "Última señal", textoHace(segundosSinSenal));
                mostrarResumen("Resumen de hoy", resumenRecorrido(puntosCrudos), puntosCrudos[0].hora.slice(0, 5));
            }

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
                if (!window.modoLugar && !window.popupAbierto) mapa.setView(nuevaPos);
            }
        })
        .catch(error => console.error("Error:", error));
}

actualizarUbicacion();
actualizarRecorrido();
setInterval(actualizarUbicacion, 10000);
setInterval(actualizarRecorrido, 10000);