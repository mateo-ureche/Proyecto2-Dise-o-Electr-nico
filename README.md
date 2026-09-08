# Proyecto 2 - Sistema de Rastreo GPS (P2-S2)

Sistema completo de monitoreo de ubicación en tiempo real utilizando una arquitectura en la nube con AWS, base de datos relacional y visualización web interactiva.

## 🚀 Arquitectura y Tecnologías
- **Infraestructura:** AWS EC2 (Ubuntu) y AWS RDS (PostgreSQL).
- **Backend:** Python con Flask (ejecutándose mediante Gunicorn y Systemd) y script de escucha UDP.
- **Frontend / Red:** Nginx como proxy inverso y dominio personalizado con DuckDNS (`mateo-gps.duckdns.org`).
- **Seguridad:** Certificado SSL/HTTPS configurado mediante Let's Encrypt (Certbot).

## 📂 Estructura del Repositorio
- `app.py`: Servidor web Flask encargado de consultar la base de datos y servir la API para la interfaz.
- `udp_listener.py`: Script persistente que escucha las tramas UDP enviadas por los dispositivos GPS.
- `crear_bd_postgres.py`: Script de inicialización y conexión con la base de datos PostgreSQL en RDS.
- `web/`: Carpeta que contiene la interfaz gráfica y el mapa en tiempo real con Leaflet.
