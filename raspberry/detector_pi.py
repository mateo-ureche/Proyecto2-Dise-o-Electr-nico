import math
import os
import socket
import sys
import threading
import time
import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

try:
    from ai_edge_litert.interpreter import Interpreter
except ImportError:
    from tflite_runtime.interpreter import Interpreter

CAMARA = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/video"
ENVIAR_A_LA_PAGINA = True
SERVIDORES = ["gpstrackerdt.duckdns.org", "gpstrackerna.duckdns.org", "mateo-gps.duckdns.org"]
PUERTO_EVENTOS = 5001
URL_UBICACION = "https://gpstrackerdt.duckdns.org/api/ubicacion"
UBICACION_FIJA = (11.0190, -74.8511)

UMBRAL_OJOS = 0.5
SEGUNDOS_SUENO = 2.0
UMBRAL_BOCA = 0.6
SEGUNDOS_BOSTEZO = 1.5
GRADOS_GIRO = 30
GRADOS_ARRIBA_ABAJO = 20
SEGUNDOS_DISTRACCION = 2.0
CUADROS_CALIBRACION = 30
ANCHO = 640

MODELO_CINTURON = "modelo_cinturon.tflite"
UMBRAL_CINTURON = 0.7
SUAVIZADO_CINTURON = 0.3
SEGUNDOS_CINTURON_CADA = 0.5
SEGUNDOS_SIN_CINTURON = 5.0

MODELO = "face_landmarker.task"
URL_MODELO = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
CARPETA_FOTOS = "eventos"


class Camara:
    def __init__(self, direccion):
        self.video = cv2.VideoCapture(direccion)
        self.cuadro = None
        self.nuevo = False
        self.corriendo = True
        self.candado = threading.Lock()
        threading.Thread(target=self.leer, daemon=True).start()

    def leer(self):
        while self.corriendo:
            ok, cuadro = self.video.read()
            if not ok:
                time.sleep(0.05)
                continue
            with self.candado:
                self.cuadro = cuadro
                self.nuevo = True

    def ultimo(self):
        with self.candado:
            if not self.nuevo:
                return None
            self.nuevo = False
            return self.cuadro

    def cerrar(self):
        self.corriendo = False
        self.video.release()


class Alerta:
    def __init__(self, tipo, segundos):
        self.tipo = tipo
        self.segundos = segundos
        self.inicio = None
        self.reportado = False

    def actualizar(self, activa, ahora):
        if not activa:
            self.inicio = None
            self.reportado = False
            return 0.0, False
        if self.inicio is None:
            self.inicio = ahora
        duracion = ahora - self.inicio
        if duracion >= self.segundos and not self.reportado:
            self.reportado = True
            return duracion, True
        return duracion, False


class Cinturon:
    def __init__(self, archivo):
        self.modelo = Interpreter(model_path=archivo)
        self.modelo.allocate_tensors()
        self.entrada = self.modelo.get_input_details()[0]
        self.salida = self.modelo.get_output_details()[0]
        self.promedio = 1.0
        self.ultima_vez = 0

    def revisar(self, cuadro, ahora):
        if ahora - self.ultima_vez >= SEGUNDOS_CINTURON_CADA:
            self.ultima_vez = ahora
            img = cv2.cvtColor(cv2.resize(cuadro, (224, 224)), cv2.COLOR_BGR2RGB)
            self.modelo.set_tensor(self.entrada["index"], img[None].astype(np.float32))
            self.modelo.invoke()
            prob = float(self.modelo.get_tensor(self.salida["index"])[0][0])
            self.promedio = SUAVIZADO_CINTURON * prob + (1 - SUAVIZADO_CINTURON) * self.promedio
        return self.promedio


def descargar_modelo():
    if not os.path.exists(MODELO):
        print("Descargando el modelo de la cara...")
        urllib.request.urlretrieve(URL_MODELO, MODELO)


def crear_detector():
    opciones = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODELO),
        running_mode=vision.RunningMode.VIDEO,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
        num_faces=1,
    )
    return vision.FaceLandmarker.create_from_options(opciones)


def medir_cara(resultado):
    if not resultado.face_blendshapes:
        return None
    valores = {b.category_name: b.score for b in resultado.face_blendshapes[0]}
    ojos = (valores["eyeBlinkLeft"] + valores["eyeBlinkRight"]) / 2
    boca = valores["jawOpen"]
    rotacion = np.array(resultado.facial_transformation_matrixes[0])[:3, :3]
    giro = math.degrees(math.atan2(-rotacion[2, 0], math.hypot(rotacion[2, 1], rotacion[2, 2])))
    arriba_abajo = math.degrees(math.atan2(rotacion[2, 1], rotacion[2, 2]))
    return ojos, boca, giro, arriba_abajo


def ubicacion_actual():
    try:
        with urllib.request.urlopen(URL_UBICACION, timeout=5) as respuesta:
            datos = json.load(respuesta)
        if datos.get("latitud") is not None:
            return float(datos["latitud"]), float(datos["longitud"])
    except (OSError, ValueError) as error:
        print(f"  No se pudo leer la ubicación: {error}")
    return UBICACION_FIJA


def guardar_y_enviar(tipo, duracion, foto, segundo_video):
    ahora = datetime.now(ZoneInfo("America/Bogota"))
    nombre = f"{CARPETA_FOTOS}/{tipo}_{ahora.strftime('%H%M%S')}.jpg"
    cv2.imwrite(nombre, foto)
    print(f"  Foto guardada: {nombre}")
    if not ENVIAR_A_LA_PAGINA:
        return
    latitud, longitud = ubicacion_actual()
    fecha_hora = ahora.strftime("%d/%m/%Y %H:%M:%S")
    imagen = cv2.imencode(".jpg", foto, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
    encabezado = f"EVENTO;{tipo};{duracion:.1f};{fecha_hora};{latitud};{longitud};{len(imagen)}\n".encode()
    for servidor in SERVIDORES:
        try:
            with socket.create_connection((servidor, PUERTO_EVENTOS), timeout=10) as conexion:
                conexion.sendall(encabezado + imagen)
                respuesta = conexion.makefile("rb").readline().decode().strip()
            print(f"  Enviado a {servidor}: {respuesta}")
        except OSError as error:
            print(f"  No se pudo enviar a {servidor}: {error}")


def main():
    descargar_modelo()
    os.makedirs(CARPETA_FOTOS, exist_ok=True)
    detector = crear_detector()
    cinturon = Cinturon(MODELO_CINTURON)
    print(f"Conectando a la cámara: {CAMARA}")
    camara = Camara(CAMARA)
    if not camara.video.isOpened():
        print("No se pudo abrir la cámara. Revisa que camara_pi.py esté corriendo.")
        camara.cerrar()
        return
    print("Cámara lista. Mira al frente para calibrar. Ctrl+C para salir.")

    sueno = Alerta("sueno", SEGUNDOS_SUENO)
    bostezo = Alerta("bostezo", SEGUNDOS_BOSTEZO)
    distraccion = Alerta("distraccion", SEGUNDOS_DISTRACCION)
    sin_cinturon = Alerta("sin_cinturon", SEGUNDOS_SIN_CINTURON)
    alertas = (sueno, bostezo, distraccion)
    calibracion = []
    referencia = None
    eventos = []
    numero = 0
    inicio = time.time()
    ultimo_print = 0
    ultimo_tiempo = 0

    try:
        while True:
            cuadro = camara.ultimo()
            if cuadro is None:
                time.sleep(0.01)
                continue
            segundo = time.time() - inicio
            numero += 1
            if cuadro.shape[1] > ANCHO:
                alto = int(cuadro.shape[0] * ANCHO / cuadro.shape[1])
                cuadro = cv2.resize(cuadro, (ANCHO, alto))

            rgb = cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB)
            imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            tiempo_ms = max(int(segundo * 1000), ultimo_tiempo + 1)
            ultimo_tiempo = tiempo_ms
            resultado = detector.detect_for_video(imagen, tiempo_ms)
            medidas = medir_cara(resultado)

            con_cinturon = cinturon.revisar(cuadro, segundo)
            duracion, disparar = sin_cinturon.actualizar(con_cinturon < UMBRAL_CINTURON, segundo)
            if disparar:
                print(f"¡Evento SIN CINTURÓN! ({duracion:.1f} s)")
                eventos.append((datetime.now().strftime("%H:%M:%S"), "sin_cinturon"))
                threading.Thread(target=guardar_y_enviar, args=("sin_cinturon", duracion, cuadro.copy(), segundo)).start()

            if medidas is None:
                for alerta in alertas:
                    alerta.actualizar(False, segundo)
                estado = "Sin cara"
            elif referencia is None:
                calibracion.append(medidas[2:])
                if len(calibracion) >= CUADROS_CALIBRACION:
                    referencia = np.mean(calibracion, axis=0)
                    print("Calibración lista.")
                estado = f"Calibrando {len(calibracion)}/{CUADROS_CALIBRACION}"
            else:
                ojos, boca, giro, arriba_abajo = medidas
                giro -= referencia[0]
                arriba_abajo -= referencia[1]
                bostezando = boca > UMBRAL_BOCA
                distraido = abs(giro) > GRADOS_GIRO or abs(arriba_abajo) > GRADOS_ARRIBA_ABAJO
                ojos_cerrados = ojos > UMBRAL_OJOS and not bostezando and not distraido
                for alerta, activa in ((sueno, ojos_cerrados), (bostezo, bostezando), (distraccion, distraido)):
                    duracion, disparar = alerta.actualizar(activa, segundo)
                    if disparar:
                        print(f"¡Evento {alerta.tipo.upper()}! ({duracion:.1f} s)")
                        eventos.append((datetime.now().strftime("%H:%M:%S"), alerta.tipo))
                        threading.Thread(target=guardar_y_enviar, args=(alerta.tipo, duracion, cuadro.copy(), segundo)).start()
                estado = f"Ojos {ojos:.2f}  Boca {boca:.2f}  Giro {giro:.0f}  Arriba/abajo {arriba_abajo:.0f}"

            if time.time() - ultimo_print >= 1:
                ultimo_print = time.time()
                velocidad = numero / (time.time() - inicio)
                print(f"{estado}  Cinturón {con_cinturon:.2f}  ({velocidad:.1f} cuadros/s)")
    except KeyboardInterrupt:
        pass

    tiempo = time.time() - inicio
    camara.cerrar()
    detector.close()
    print()
    print(f"Listo: {numero} cuadros en {tiempo:.1f} s = {numero / max(tiempo, 0.1):.1f} cuadros/s")
    print(f"Eventos detectados: {len(eventos)}")
    for hora, tipo in eventos:
        print(f"  {hora}  {tipo}")


if __name__ == "__main__":
    main()
