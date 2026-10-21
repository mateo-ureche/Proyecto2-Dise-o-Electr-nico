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
 
function mostrarDatos(velocidad, distancia) {
    document.getElementById("velocidadFlotante").textContent = "🚗 " + (velocidad ?? "--") + " km/h";
    document.getElementById("distanciaFlotante").textContent = "📏 " + (distancia ?? "--") + " km";
}
 
window.addEventListener("scroll", () => window.scrollTo(0, 0));
 