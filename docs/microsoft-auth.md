# Registro de Microsoft

EmpiLauncher usa OAuth 2.0 con PKCE como aplicacion publica de escritorio. El
identificador de cliente es publico; no se debe crear ni incluir un client
secret en el launcher.

## Configuracion

1. Abre el centro de administracion de Microsoft Entra.
2. Ve a `Identity > Applications > App registrations`.
3. Crea un registro llamado `EmpiLauncher`.
4. En cuentas compatibles, selecciona `Personal Microsoft accounts only`.
5. En `Authentication`, agrega la plataforma `Mobile and desktop applications`.
6. Registra `http://localhost` como URI de redireccion.
7. Activa `Allow public client flows`.
8. Copia `Application (client) ID` en `launcher.config.json`.

No agregues secretos al repositorio. El launcher abre el navegador del sistema,
comprueba el parametro `state`, usa PKCE y recibe el codigo en un puerto local
temporal.

## Prueba

```bash
npm run dev
```

Microsoft puede exigir que un registro nuevo sea aprobado para acceder a Xbox
Live. Si aparece `Invalid app registration`, la autenticacion esta bien
implementada, pero el identificador aun no tiene acceso a Xbox.
