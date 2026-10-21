function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const boton = document.getElementById("botonToggle");
    const titulo = document.getElementById("tituloFlotante");
    sidebar.classList.toggle("abierta");
    if (sidebar.classList.contains("abierta")) {
        boton.style.left = "280px";
        boton.textContent = "‹";
        titulo.style.display = "none";
        document.getElementById("panelDatos").style.display = "none";
    } else {
        boton.style.left = "0px";
        boton.textContent = "☰";
        titulo.style.display = "flex";
        document.getElementById("panelDatos").style.display = "grid";
    }
}

function mostrarPanel(velocidad, estado, distancia, etiquetaExtra, extra) {
    document.getElementById("panelVelocidad").textContent = (velocidad ?? "--") + " km/h";
    document.getElementById("panelEstado").textContent = estado;
    document.getElementById("panelDistancia").textContent = (distancia ?? "--") + " km";
    document.getElementById("panelExtraEtiqueta").textContent = etiquetaExtra;
    document.getElementById("panelExtra").textContent = extra;
}

function mostrarResumen(titulo, resumen, inicio) {
    document.getElementById("tituloResumen").textContent = titulo;
    document.getElementById("resMaxima").textContent = resumen.maxima + " km/h";
    document.getElementById("resPromedio").textContent = resumen.promedio + " km/h";
    document.getElementById("resMovimiento").textContent = textoDuracion(resumen.segMovimiento);
    document.getElementById("resDetenido").textContent = textoDuracion(resumen.segDetenido);
    document.getElementById("resParadas").textContent = resumen.paradas;
    document.getElementById("resInicio").textContent = inicio;
}

window.addEventListener("scroll", () => window.scrollTo(0, 0));