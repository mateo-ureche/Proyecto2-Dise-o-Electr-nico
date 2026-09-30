function formatoLegible(iso) {
    const [fecha, hora] = iso.split("T");
    const [anio, mes, dia] = fecha.split("-");
    return dia + "/" + mes + "/" + anio + " " + hora;
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

    lineaHistorica.setLatLngs(ruta);
    lineaHistorica.addTo(mapa);

    marcadorInicioHist.setLatLng(ruta[0]);
    marcadorInicioHist.addTo(mapa);

    marcadorFinHist.setLatLng(ruta[ruta.length - 1]);
    marcadorFinHist.addTo(mapa);

    mapa.fitBounds(lineaHistorica.getBounds(), { padding: [40, 40] });

    document.querySelectorAll(".item-recorrido").forEach((boton, i) => {
        boton.classList.toggle("activo", i === indice);
    });
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
    mapa.removeLayer(marcadorInicioHist);
    mapa.removeLayer(marcadorFinHist);
    lineaRecorrido.addTo(mapa);
    marcador.addTo(mapa);
    document.getElementById("btnTiempoReal").style.display = "none";
    recorridosHistoricos = [];
    document.getElementById("listaRecorridos").innerHTML = "";

    document.getElementById("tituloFlotante").classList.remove("modo-historico");
    actualizarUbicacion();
    actualizarRecorrido();
}
