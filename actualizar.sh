#!/bin/bash
echo "Reiniciando los servidores web..."
#Reemplaza 'gunicorn' con el nombre exacto de tu servicio si le pusiste otro nombre
sudo systemctl restart gunicorn
sudo systemctl restart nginx
echo "Actualización completada en este servidor!"