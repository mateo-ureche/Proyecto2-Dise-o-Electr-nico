#!/bin/bash
echo "Descargando cambios desde GitHub..."
git fetch origin
git reset --hard origin/main

echo "Reiniciando los servicios..."
sudo systemctl restart flaskapp.service
sudo systemctl restart udplistener.service

echo "Actualización completada en este servidor!"