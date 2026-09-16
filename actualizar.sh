#!/bin/bash
echo "Descargando cambios desde GitHub..."
git pull origin main

echo "Reiniciando los servidores web..."
# Como tu servicio se llama flaskapp.service, usa el nombre exacto:
sudo systemctl restart flaskapp.service
sudo systemctl restart nginx

echo "Actualización completada en este servidor!"