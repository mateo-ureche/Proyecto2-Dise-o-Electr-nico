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
    actualizarFlecha();
}

function actualizarFlecha() {
    const lista = document.getElementById("listaRecorridos");
    const abierta = document.getElementById("sidebar").classList.contains("abierta");
    const faltaVer = lista.children.length > 0 && lista.getBoundingClientRect().bottom > window.innerHeight;
    document.getElementById("flechaBajar").classList.toggle("visible", abierta && faltaVer);
}

function bajarARecorridos() {
    const sidebar = document.getElementById("sidebar");
    const lista = document.getElementById("listaRecorridos");
    if (lista.getBoundingClientRect().top > window.innerHeight * 0.6) {
        lista.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
        sidebar.scrollBy({ top: window.innerHeight * 0.6, behavior: "smooth" });
    }
}

document.getElementById("sidebar").addEventListener("scroll", actualizarFlecha);
window.addEventListener("resize", actualizarFlecha);

function mostrarEstado(estado) {
    const valor = document.getElementById("panelEstado");
    valor.textContent = estado.texto;
    valor.className = "valor-panel " + estado.clase;
}

window.addEventListener("scroll", () => window.scrollTo(0, 0));