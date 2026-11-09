import socket
import sys
import time
from datetime import datetime

PUERTO = 5000
VEHICULO = "2"
SEGUNDOS_ENTRE_ENVIOS = 5
PASOS_POR_TRAMO = 12

RUTA = [
    (11.01840, -74.85120),
    (11.01550, -74.84650),
    (11.01230, -74.84140),
    (11.00880, -74.83560),
    (11.00520, -74.82990),
    (11.00180, -74.82420),
    (10.99830, -74.81850),
    (10.99490, -74.81300),
]


def puntos_de_la_ruta():
    for (lat1, lon1), (lat2, lon2) in zip(RUTA, RUTA[1:]):
        for paso in range(PASOS_POR_TRAMO):
            t = paso / PASOS_POR_TRAMO
            yield lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t
    yield RUTA[-1]


if len(sys.argv) < 2:
    print("Uso: python3 vehiculo2.py IP_EC2_1 [IP_EC2_2] [IP_EC2_3]")
    sys.exit(1)

ips = sys.argv[1:]
conexion = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

while True:
    for lat, lon in puntos_de_la_ruta():
        fecha_hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        mensaje = f"UBICACION;{fecha_hora};{lat:.6f};{lon:.6f};{VEHICULO}"
        for ip in ips:
            conexion.sendto(mensaje.encode("utf-8"), (ip, PUERTO))
        print("Enviado:", mensaje)
        time.sleep(SEGUNDOS_ENTRE_ENVIOS)
    RUTA.reverse()