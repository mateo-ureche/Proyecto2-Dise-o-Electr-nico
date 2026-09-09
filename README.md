# 🛰️ GPS Tracker en la Nube (Proyecto 2 - Ingeniería Electrónica Uninorte)

Sistema completo de rastreo GPS en tiempo real desplegado en la nube, diseñado para la recepción de tramas de ubicación mediante sockets UDP, almacenamiento relacional optimizado y visualización web interactiva con mapas dinámicos.

---

## 🏗️ Arquitectura del Sistema

El proyecto implementa una arquitectura cliente-servidor distribuida en la nube de AWS:

1. **Servidor de Aplicación (AWS EC2 - Ubuntu / Ohio):**
   * Aloja el backend en **Python (Flask)** y el motor WSGI (**Gunicorn**).
   * Ejecuta un servicio de escucha UDP permanente.
   * Utiliza **Nginx** como proxy inverso y gestor de tráfico seguro con **HTTPS** (vía DuckDNS y Certbot).
2. **Base de Datos Centralizada (AWS RDS - PostgreSQL):**
   * Instancia de base de datos compartida optimizada para el equipo de trabajo.
   * Conectividad cruzada entre regiones de AWS mediante Acceso Público y restricciones estrictas por **Security Groups** (permitiendo únicamente la IP elástica del servidor EC2).
3. **Persistencia del Sistema (Systemd):**
   * Configuración de servicios nativos de Linux (`flaskapp.service` y `udplistener.service`) para garantizar la ejecución en segundo plano 24/7 sin dependencia de sesiones SSH activas.

---

## ⚙️ Componentes Principales

* **`udp_listener.py`:** Script en Python basado en sockets (`SOCK_DGRAM`) que escucha permanentemente el **puerto 5000**, intercepta las tramas UDP enviadas por el dispositivo móvil o rastreador, y realiza la inserción automática en la base de datos aplicando la etiqueta de aislamiento por propietario (`propietario = 'Mateo'`).
* **`app.py` & Flask:** Servidor web que maneja las peticiones HTTP, consulta la base de datos filtrando únicamente los registros correspondientes al usuario (`WHERE propietario = 'Mateo'`) para mantener la independencia en la BD compartida.
* **Jinja2 & Dinamismo (`templates/index.html`):** Motor de plantillas que inyecta en tiempo de ejecución la variable de entorno `DOMINIO` (configurada en el archivo `.env`), personalizando de manera dinámica el título y subtítulo de la interfaz gráfica manteniendo un código base unificado.

---

## 🚀 Despliegue y Configuración

### 1. Variables de Entorno (`.env`)
El proyecto requiere un archivo `.env` en la raíz con la siguiente estructura (credenciales privadas omitidas por seguridad):
```env
DB_HOST=<endpoint-rds-postgresql>
DB_PORT=5432
DB_NAME=<nombre_base_datos>
DB_USER=<usuario>
DB_PASSWORD=<contraseña>
DOMINIO=Mateo
