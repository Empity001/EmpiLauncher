# MotionCheck

Comprueba con el reloj real que las animaciones del launcher nativo se mueven como se diseñaron: que un botón empieza a moverse a los
50 ms (no salta), que cambiar de idea a mitad continúa desde donde estaba, que un interruptor creado encendido no se desliza al abrirse,
que un elemento que espera su turno no parpadea antes de tiempo y que las curvas son las de CSS.

```
dotnet run -c Release --project native/tools/MotionCheck
```

Abre una ventana fuera de la pantalla, usa las plantillas reales de `Themes/Controls.xaml` y `Motion.cs`, y escribe PASS/FAIL. No toca datos del usuario.
