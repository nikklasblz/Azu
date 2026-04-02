# SignPath Code Signing — Windows Only

## Problema

Azu no está firmado digitalmente. En Windows:
- **SmartScreen** muestra aviso de seguridad al ejecutar el instalador
- **Windows Defender** puede poner en cuarentena o eliminar el .exe (parece que "se desinstaló solo")

## Solución

**SignPath Foundation** — certificado EV gratuito para proyectos open source. Firma los artefactos Windows (.msi, .nsis) en CI vía GitHub Actions.

## Requisitos previos

1. Archivo `LICENSE` (MIT) en la raíz del repo — ya dice `"license": "MIT"` en package.json pero falta el archivo
2. Repo público en GitHub — ya lo está (`nikklasblz/Azu`)
3. Aplicar en https://signpath.org/apply — lo hace el usuario con su cuenta GitHub

## Arquitectura del flujo

```
git push tag v* 
  → GitHub Actions build (Windows)
    → npm ci + cargo build + tauri build
    → upload-artifact (unsigned .msi + .nsis)
    → SignPath action: submit signing request
    → SignPath HSM firma con certificado EV
    → download signed artifact
    → upload to GitHub Release
```

## Cambios necesarios

### 1. Archivo LICENSE (MIT)

Crear `LICENSE` en la raíz con licencia MIT, copyright Nico Arriola.

### 2. Workflow `release.yml` modificado

El workflow actual en `.github/workflows/release.yml`:
- Builda en 4 plataformas (ubuntu, macOS x2, windows)
- Publica directo a GitHub Releases via `tauri-apps/tauri-action`

El workflow nuevo:
- **Job 1 `build`**: Builda en las 4 plataformas, sube artefactos
- **Job 2 `sign-windows`**: Toma el artefacto Windows, lo envía a SignPath, recibe firmado
- **Job 3 `release`**: Crea el GitHub Release con artefactos firmados (Windows) y sin firmar (Linux/macOS)

Parámetros de la acción SignPath:
```yaml
- uses: signpath/github-action-submit-signing-request@v2
  with:
    api-token: '${{ secrets.SIGNPATH_API_TOKEN }}'
    organization-id: '<from SignPath dashboard>'
    project-slug: 'azu'
    signing-policy-slug: 'release-signing'
    github-artifact-id: '${{ steps.upload-unsigned.outputs.artifact-id }}'
    wait-for-completion: true
    output-artifact-directory: 'signed/'
```

### 3. Secrets en GitHub repo

| Secret | Valor | Origen |
|--------|-------|--------|
| `SIGNPATH_API_TOKEN` | API token del usuario | SignPath dashboard > API Tokens |
| `SIGNPATH_ORGANIZATION_ID` | ID de la organización | SignPath dashboard > Organization |

### 4. Configuración en SignPath dashboard (manual)

Después de ser aprobado en el programa Foundation:

1. **Crear proyecto** "Azu" con slug `azu`
2. **Artifact configuration**: tipo "Windows Installer" — soporta .msi y .exe (NSIS)
3. **Signing policy**: `release-signing` con certificado EV provisto por Foundation
4. **Trusted build system**: vincular el repo `nikklasblz/Azu` en GitHub

### 5. Workflow `build.yml` — sin cambios

El workflow de CI (push/PR) no necesita signing — solo testea y builda.

## Qué NO cambia

- `tauri.conf.json` — no necesita `signCommand` ni `certificateThumbprint` porque la firma ocurre post-build en SignPath, no durante el build
- `Cargo.toml` — sin cambios
- macOS — no se firma (requeriría Apple Developer $99/año)
- Linux — no necesita firma

## Resultado esperado

- El instalador .msi/.exe de Windows llega firmado con certificado EV
- SmartScreen no muestra aviso
- Windows Defender no lo elimina
- El usuario descarga de GitHub Releases y lo instala sin problemas

## Pasos del usuario (post-implementación)

1. Aplicar en https://signpath.org/apply con la cuenta GitHub que tiene el repo
2. Esperar aprobación (1-2 semanas según reportes)
3. Configurar proyecto en SignPath dashboard (proyecto, artifact config, signing policy)
4. Copiar API token + org ID a GitHub Secrets
5. Crear un tag `v0.1.1` para triggerar el primer release firmado
