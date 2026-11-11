import json
import math
import socket
import sys
import time
import urllib.request
from datetime import datetime
 
PUERTO = 5000
VEHICULO = "2"
SEGUNDOS_ENTRE_ENVIOS = 5
VELOCIDAD_KMH = 35
 
PARADAS = [
    (11.01840, -74.85120),
    (11.00880, -74.83560),
    (10.99490, -74.81300),
]
 
 
def pedir_ruta(paradas):
    coordenadas = ";".join(f"{lon},{lat}" for lat, lon in paradas)
    url = f"https://router.project-osrm.org/route/v1/driving/{coordenadas}?overview=full&geometries=geojson"
    peticion = urllib.request.Request(url, headers={"User-Agent": "simulador-vehiculo2"})
    with urllib.request.urlopen(peticion, timeout=15) as respuesta:
        datos = json.load(respuesta)
    return [(lat, lon) for lon, lat in datos["routes"][0]["geometry"]["coordinates"]]
 
 
def distancia_m(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    x = (lon2 - lon1) * math.cos((lat1 + lat2) / 2)
    y = lat2 - lat1
    return math.hypot(x, y) * 6371000
 
 
def puntos_cada(ruta, metros):
    puntos = [ruta[0]]
    sobra = 0.0
    for a, b in zip(ruta, ruta[1:]):
        tramo = distancia_m(a, b)
        if tramo == 0:
            continue
        recorrido = metros - sobra
        while recorrido <= tramo:
            t = recorrido / tramo
            puntos.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            recorrido += metros
        sobra = tramo - (recorrido - metros)
    puntos.append(ruta[-1])
    return puntos
 
 
if len(sys.argv) < 2:
    print("Uso: python3 vehiculo2.py IP_EC2_1 [IP_EC2_2] [IP_EC2_3]")
    sys.exit(1)
 
try:
    ruta = pedir_ruta(PARADAS)
    print(f"Ruta por calles lista: {len(ruta)} puntos")
except Exception as error:
    print("No se pudo pedir la ruta por calles, revisa el internet:", error)
    sys.exit(1)
 
metros_por_envio = VELOCIDAD_KMH / 3.6 * SEGUNDOS_ENTRE_ENVIOS
puntos = puntos_cada(ruta, metros_por_envio)
ips = sys.argv[1:]
conexion = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
 
while True:
    for lat, lon in puntos:
        fecha_hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        mensaje = f"UBICACION;{fecha_hora};{lat:.6f};{lon:.6f};{VEHICULO}"
        for ip in ips:
            conexion.sendto(mensaje.encode("utf-8"), (ip, PUERTO))
        print("Enviado:", mensaje)
        time.sleep(SEGUNDOS_ENTRE_ENVIOS)
    puntos.reverse()
 