package com.example.gpstracker

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var editIp1: EditText
    private lateinit var editIp2: EditText
    private lateinit var editIp3: EditText
    private lateinit var txtResultado: TextView

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permisos ->
        val ubicacionOk = permisos[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        if (ubicacionOk) pedirPermisoSegundoPlano() else txtResultado.setText(R.string.permissions_required)
    }

    private val backgroundPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { iniciarServicio() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        editIp1 = findViewById(R.id.editIp1)
        editIp2 = findViewById(R.id.editIp2)
        editIp3 = findViewById(R.id.editIp3)
        txtResultado = findViewById(R.id.txtResultado)

        cargarIpsGuardadas()
        configurarGuardadoAutomatico()
        pedirPermisos()
    }

    private fun cargarIpsGuardadas() {
        val prefs = getSharedPreferences("gps_tracker_prefs", MODE_PRIVATE)
        editIp1.setText(prefs.getString("ip1", ""))
        editIp2.setText(prefs.getString("ip2", ""))
        editIp3.setText(prefs.getString("ip3", ""))
    }

    private fun configurarGuardadoAutomatico() {
        val watcher = object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = guardarIps()
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        }
        editIp1.addTextChangedListener(watcher)
        editIp2.addTextChangedListener(watcher)
        editIp3.addTextChangedListener(watcher)
    }

    private fun guardarIps() {
        getSharedPreferences("gps_tracker_prefs", MODE_PRIVATE).edit()
            .putString("ip1", editIp1.text.toString().trim())
            .putString("ip2", editIp2.text.toString().trim())
            .putString("ip3", editIp3.text.toString().trim())
            .apply()
    }

    private fun pedirPermisos() {
        permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION))
    }

    private fun pedirPermisoSegundoPlano() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            backgroundPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else {
            iniciarServicio()
        }
    }

    private fun iniciarServicio() {
        val intent = Intent(this, UbicacionService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
        txtResultado.text = getString(R.string.servicio_activo)
    }
}