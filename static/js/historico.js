const MARGEN_VISIBLE = { paddingTopLeft: [40, 90], paddingBottomRight: [40, 200] };
let recorridoVisible = null;
 
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
    const recorrido = recorridosHistoricos[indice];
    const ruta = recorrido.puntos;
    recorridoVisible = recorrido;
 
    lineaHistorica.setLatLngs(recorrido.enCalle || ruta);
    lineaHistorica.addTo(mapa);
    if (!recorrido.enCalle) {
        pegarACalles(ruta).then(linea => {
            recorrido.enCalle = linea;
            if (modoHistorico && recorridoVisible === recorrido) lineaHistorica.setLatLngs(linea);
        });
    }
 
    marcadorInicioHist.setLatLng(ruta[0]);
    marcadorInicioHist.addTo(mapa);
 
    marcadorFinHist.setLatLng(ruta[ruta.length - 1]);
    marcadorFinHist.addTo(mapa);
 
    mapa.fitBounds(lineaHistorica.getBounds(), MARGEN_VISIBLE);
 
    document.querySelectorAll(".item-recorrido").forEach((boton, i) => {
        boton.classList.toggle("activo", i === indice);
    });
 
    prepararBarraTiempo(indice);
}
 
function prepararBarraTiempo(indice) {
    const slider = document.getElementById("sliderTiempo");
    slider.max = recorridosHistoricos[indice].puntos.length - 1;
    slider.value = 0;
    slider.oninput = () => moverPorTiempo(indice, Number(slider.value));
    document.getElementById("barraTiempo").style.display = "block";
    marcadorTiempo.addTo(mapa);
    moverPorTiempo(indice, 0);
}
 
function moverPorTiempo(indice, posicion) {
    const recorrido = recorridosHistoricos[indice];
    const registro = recorrido.registros[posicion];
    marcadorTiempo.setLatLng(recorrido.puntos[posicion]);
    marcadorTiempo.bringToFront();
    mapa.panInside(recorrido.puntos[posicion], MARGEN_VISIBLE);
    const vecino = recorrido.registros[posicion === 0 ? 1 : posicion - 1];
    const velocidad = velocidadKmh(vecino, registro);
    document.getElementById("textoTiempo").textContent =
        registro.fecha + " · " + registro.hora + " · " + (velocidad ?? "--") + " km/h";
    mostrarDatos(velocidad, distanciaKm(recorrido.puntos));
}
 
function verHistorico() {
    const inicio = document.getElementById("fechaInicio").value;
    const fin = document.getElementById("fechaFin").value;
 
    if (!inicio || !fin) {
        alert("Selecciona una fecha de inicio y una de fin.");
        return;
    }
 
    if (fin <= inicio) {
        alert("La fecha final debe ser después de la inicial.");
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
    if (modoLugar) terminarModoLugar();
    modoHistorico = false;
    mapa.removeLayer(lineaHistorica);
    mapa.removeLayer(marcadorInicioHist);
    mapa.removeLayer(marcadorFinHist);
    mapa.removeLayer(marcadorTiempo);
    document.getElementById("barraTiempo").style.display = "none";
    lineaRecorrido.addTo(mapa);
    marcador.addTo(mapa);
    document.getElementById("btnTiempoReal").style.display = "none";
    recorridosHistoricos = [];
    document.getElementById("listaRecorridos").innerHTML = "";
 
    document.getElementById("tituloFlotante").classList.remove("modo-historico");
    actualizarUbicacion();
    actualizarRecorrido();
}
 