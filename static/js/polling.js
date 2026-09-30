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
    fetch("/api/recorrido")
        .then(r => r.json())
        .then(puntosCrudos => {
            const ruta = construirRutaFiltrada(puntosCrudos);
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
                if (!window.modoLugar && !window.popupAbierto) mapa.setView(nuevaPos);
            }
        })
        .catch(error => console.error("Error:", error));
}

actualizarUbicacion();
actualizarRecorrido();
setInterval(actualizarUbicacion, 10000);
setInterval(actualizarRecorrido, 10000);
