package com.example.gpstracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class UbicacionService : Service() {

    companion object {
        private const val CHANNEL_ID = "gps_tracker_channel"
        private const val NOTIF_ID = 1
        private const val UDP_PORT = 5000
        private const val INTERVALO_MS = 10_000L
    }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val handler = Handler(Looper.getMainLooper())
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    private val envioAutomatico = object : Runnable {
        override fun run() {
            intentarEnviar()
            handler.postDelayed(this, INTERVALO_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        crearCanalNotificacion()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, construirNotificacion())
        handler.post(envioAutomatico)
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(envioAutomatico)
        job.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canal = NotificationChannel(
                CHANNEL_ID, "GPS Tracker", NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
        }
    }

    private fun construirNotificacion(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GPS Tracker activo")
            .setContentText("Enviando ubicación cada 10 segundos")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
    }

    private fun intentarEnviar() {
        val prefs = getSharedPreferences("gps_tracker_prefs", MODE_PRIVATE)
        val ips = listOf(
            prefs.getString("ip1", "") ?: "",
            prefs.getString("ip2", "") ?: "",
            prefs.getString("ip3", "") ?: ""
        ).filter { it.isNotEmpty() }

        if (ips.isEmpty()) return
        if (ActivityCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return

        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
            if (location != null) {
                val fechaHora = formatearFecha(location.time)
                val mensaje = "UBICACION;$fechaHora;${location.latitude};${location.longitude}"
                scope.launch {
                    for (ip in ips) enviarUDP(ip, UDP_PORT, mensaje)
                }
            }
        }
    }

    private fun formatearFecha(timestamp: Long): String {
        val formato = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault())
        return formato.format(Date(timestamp))
    }

    private fun enviarUDP(ip: String, puerto: Int, mensaje: String) {
        try {
            val socket = DatagramSocket()
            socket.soTimeout = 3000
            val direccion = InetAddress.getByName(ip)
            val datos = mensaje.toByteArray()
            socket.send(DatagramPacket(datos, datos.size, direccion, puerto))
            socket.close()
        } catch (e: Exception) {
            // El servicio no tiene pantalla propia para mostrar errores
        }
    }
}