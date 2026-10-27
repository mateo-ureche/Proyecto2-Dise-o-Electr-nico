import math
import os
import socket
import threading
import time
import urllib.request
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

CELULAR_IP = "192.168.43.1"
CELULAR_PUERTO = 6000
CAMARA = 1

UMBRAL_OJOS = 0.5
SEGUNDOS_SUENO = 2.0
UMBRAL_BOCA = 0.6
SEGUNDOS_BOSTEZO = 1.5
GRADOS_GIRO = 30
GRADOS_ARRIBA_ABAJO = 20
SEGUNDOS_DISTRACCION = 2.0
CUADROS_CALIBRACION = 30

MODELO = "face_landmarker.task"
URL_MODELO = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

VERDE = (0, 200, 0)
NARANJA = (0, 165, 255)
ROJO = (0, 0, 255)
GRIS = (128, 128, 128)
AMARILLO = (0, 220, 255)


class Alerta:
    def __init__(self, tipo, segundos):
        self.tipo = tipo
        self.segundos = segundos
        self.inicio = None
        self.reportado = False

    def actualizar(self, activa):
        if not activa:
            self.inicio = None
            self.reportado = False
            return 0.0, False
        self.inicio = self.inicio or time.time()
        duracion = time.time() - self.inicio
        if duracion >= self.segundos and not self.reportado:
            self.reportado = True
            return duracion, True
        return duracion, False

    def disparada(self):
        return self.reportado


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


def enviar_evento(tipo, duracion, foto):
    fecha_hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    imagen = cv2.imencode(".jpg", foto, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
    encabezado = f"EVENTO;{tipo};{duracion:.1f};{fecha_hora};{len(imagen)}\n".encode()
    try:
        with socket.create_connection((CELULAR_IP, CELULAR_PUERTO), timeout=10) as conexion:
            conexion.sendall(encabezado + imagen)
            respuesta = conexion.makefile("rb").readline().decode().strip()
        print(f"Evento {tipo} enviado al celular ({len(imagen)} bytes): {respuesta}")
    except OSError as error:
        print(f"No se pudo enviar al celular: {error}")


def escribir(cuadro, texto, fila, color, tamano=0.8):
    cv2.putText(cuadro, texto, (20, 40 + fila * 35), cv2.FONT_HERSHEY_SIMPLEX, tamano, color, 2)


def main():
    descargar_modelo()
    detector = crear_detector()
    camara = cv2.VideoCapture(CAMARA)

    sueno = Alerta("sueno", SEGUNDOS_SUENO)
    bostezo = Alerta("bostezo", SEGUNDOS_BOSTEZO)
    distraccion = Alerta("distraccion", SEGUNDOS_DISTRACCION)
    calibracion = []
    referencia = None
    fallos = 0

    while True:
        ok, cuadro = camara.read()
        if not ok:
            fallos += 1
            if fallos > 100:
                print("No se pudo leer la cámara")
                break
            time.sleep(0.05)
            continue
        fallos = 0

        rgb = cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB)
        imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        resultado = detector.detect_for_video(imagen, int(time.time() * 1000))
        medidas = medir_cara(resultado)
        foto = cuadro.copy()

        if medidas is None:
            for alerta in (sueno, bostezo, distraccion):
                alerta.actualizar(False)
            escribir(cuadro, "Sin cara", 0, GRIS, 1)
        elif referencia is None:
            calibracion.append(medidas[2:])
            if len(calibracion) >= CUADROS_CALIBRACION:
                referencia = np.mean(calibracion, axis=0)
                print("Calibración lista.")
            escribir(cuadro, f"Calibrando: mira al frente {len(calibracion)}/{CUADROS_CALIBRACION}", 0, AMARILLO)
        else:
            ojos, boca, giro, arriba_abajo = medidas
            giro -= referencia[0]
            arriba_abajo -= referencia[1]

            bostezando = boca > UMBRAL_BOCA
            distraido = abs(giro) > GRADOS_GIRO or abs(arriba_abajo) > GRADOS_ARRIBA_ABAJO
            ojos_cerrados = ojos > UMBRAL_OJOS and not bostezando and not distraido

            avisos = []
            for alerta, activa, nombre in (
                (sueno, ojos_cerrados, "Ojos cerrados"),
                (bostezo, bostezando, "Boca abierta"),
                (distraccion, distraido, "Mirando a otro lado"),
            ):
                duracion, disparar = alerta.actualizar(activa)
                if disparar:
                    print(f"\a¡Evento {alerta.tipo} detectado!")
                    threading.Thread(target=enviar_evento, args=(alerta.tipo, duracion, foto)).start()
                if alerta.disparada():
                    avisos.append((alerta.tipo.upper(), ROJO))
                elif activa:
                    avisos.append((f"{nombre} {duracion:.1f} s", NARANJA))

            if not avisos:
                avisos.append(("Atento", VERDE))
            for fila, (texto, color) in enumerate(avisos):
                escribir(cuadro, texto, fila, color, 1)

            datos = f"Ojos {ojos:.2f}  Boca {boca:.2f}  Giro {giro:.0f}  Arriba/abajo {arriba_abajo:.0f}"
            cv2.putText(cuadro, datos, (20, cuadro.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.imshow("Detector del conductor (c calibrar, q salir)", cuadro)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("c"):
            calibracion = []
            referencia = None

    camara.release()
    detector.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()