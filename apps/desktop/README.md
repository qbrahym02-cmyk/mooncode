# Moon Code Desktop

Electron shell around the same local server and Web client used by Moon Code Web.

```bash
npm install
npm run desktop
```

The desktop process binds the local service to `127.0.0.1` and keeps Node APIs
out of the renderer (`contextIsolation`, sandbox, no Node integration).
Packaging targets are DMG, NSIS, AppImage and DEB. Signing/notarization still
requires the owner's platform certificates.
