

# PAI-OpenCode Adapter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.11.0-blue.svg)](https://github.com/anditurdiu/pai-opencode-adapter)
[![Test Status](https://img.shields.io/badge/tests-777%20pass-green.svg)](https://github.com/anditurdiu/pai-opencode-adapter)

**Ejecuta [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure) sin una suscripción a Anthropic.** Usa cualquier proveedor de LLM: OpenAI, Google, Ollama o Anthropic, a través de [OpenCode](https://opencode.ai), el asistente de código con IA de código abierto.

> **Antecedentes:** PAI (Personal AI Infrastructure) es un potente sistema de IA personal creado por Daniel Miessler, pero actualmente requiere Claude Code y una suscripción Anthropic Max. Este adaptador elimina esa dependencia traduciendo el sistema de ganchos (hooks) de PAI a la API de complementos de OpenCode. Nació a partir de una [solicitud de la comunidad (issue #98)](https://github.com/danielmiessler/Personal_AI_Infrastructure/issues/98).

## ¿Por qué este adaptador?

PAI te ofrece flujos de trabajo de IA estructurados (el Algoritmo), más de 63 habilidades, 14 agentes, sistemas de memoria y un sistema operativo para la vida (TELOS). Pero hoy solo funciona en Claude Code, lo que requiere una suscripción Anthropic Max ($100-200/mes).

Este adaptador te permite ejecutar la **experiencia completa de PAI** en OpenCode con **cualquier proveedor de LLM**:

| Proveedor | Modelos | Costo |
|----------|--------|------|
| **Anthropic** | Claude Sonnet/Opus | API pago por uso (no se necesita suscripción Max) |
| **OpenAI** | GPT-4o, o1 | API pago por uso |
| **Google** | Gemini Pro/Flash | Nivel gratuito disponible |
| **Ollama** | Llama 3, Mistral | Gratuito (ejecución local) |
| **Cualquier proveedor compatible con OpenCode** | Varios | Varía |

## Descripción general

El Adaptador PAI-OpenCode es una **capa de adaptación de complementos**, no un fork. Se sitúa entre el contenido de PAI (ganchos, configuraciones, agentes) y la API de complementos de OpenCode, traduciendo eventos y configuraciones para que tus flujos de trabajo de PAI se ejecuten sin cambios en OpenCode.

**Qué hace:** Traducción de eventos (20 ganchos de PAI → 8 ganchos de OpenCode), traducción de configuraciones, gestión del estado de la sesión, validación de seguridad, eliminación de secretos, manejo de compactación, notificaciones por voz y fiabilidad de subagentes (detección de errores, conmutación por error de modelos, detección de inactividad, detección de bucles de razonamiento).

**Qué no hace:** Modificar archivos fuente de PAI, agregar dependencias npm más allá de TypeScript o fusionar actualizaciones automáticamente.

> 📖 **Documentación detallada:** [Architecture](docs/architecture.md) · [Agents](docs/agents.md) · [Features](docs/features.md) · [Configuration](docs/configuration.md) · [Self-Updater](docs/self-updater.md) · [Troubleshooting](docs/troubleshooting.md)

---

## Inicio rápido

### Paso 1: Clona el repositorio

```bash
cd ~/projects
git clone https://github.com/anditurdiu/pai-opencode-adapter.git
cd pai-opencode-adapter
```

### Paso 2: Instala las dependencias

```bash
bun install
```

### Paso 3: Compila el complemento

```bash
bun build src/plugin/pai-unified.ts --target=bun --outdir=dist --external opencode
```

### Paso 4: Configura OpenCode

Agrega el complemento a tu `~/.config/opencode/opencode.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "plugin": [
    "file:///absolute/path/to/pai-opencode-adapter/src/plugin/pai-unified.ts"
  ]
}
```

**Importante:** La ruta del `plugin` **debe** usar un prefijo `file://` para complementos locales. La configuración específica del adaptador PAI (identidad, voz, notificaciones) se coloca en un archivo separado `~/.config/opencode/pai-adapter.json` — consulta [Configuration](docs/configuration.md).

### Paso 5: Ejecuta OpenCode

```bash
opencode
# O con tmux para compatibilidad con StatusLine:
tmux new-session -s pai opencode
```

**Verifica** que el complemento se cargó:

```bash
tail -f /tmp/pai-opencode-debug.log
# Debería mostrar: [pai-unified] plugin initialized
```

> 📖 **Guía completa de configuración:** [Getting Started](GETTING_STARTED.md)

---

## Experiencia nativa de PAI

El adaptador despliega agentes, temas y comandos nativos de PAI dentro de OpenCode.

### Agentes

| Agente | Tipo | Modelo | Propósito |
|-------|------|-------|---------|
| **Algorithm** | Principal (Tab) | Claude Sonnet 4.6 | Algoritmo PAI completo v3.5.0 — flujo de trabajo estructurado en 7 fases |
| **Native** | Principal (Tab) | Claude Sonnet 4.6 | Ejecución de tareas rápida y directa sin la sobrecarga del Algoritmo |
| **Architect** | Subagente (@) | Claude Opus 4.6 | Diseño de sistemas, revisión de arquitectura, especificaciones de implementación |
| **Engineer** | Subagente (@) | Claude Sonnet 4.6 | Implementación, corrección de errores, refactorización — acceso completo a archivos |
| **Thinker** | Subagente (@) | Claude Sonnet 4.6 | Razonamiento profundo, análisis de primeros principios, evaluación de compensaciones |
| **Research** | Subagente (@) | GLM-4.7 | Investigación web, recuperación de documentación, extracción de contenido |
| **Explorer** | Subagente (@) | GLM-4.7 | Exploración rápida de código base solo lectura, búsqueda de patrones |
| **Intern** | Subagente (@) | GLM-4.7 | Tareas ligeras — transformación de datos, plantillas, código básico |

Alterna entre Algorithm y Native con **Tab**. Invoca subagentes con **@architect**, **@engineer**, **@thinker**, **@research**, **@explorer** o **@intern**.

> 📖 **Referencia completa de agentes:** [docs/agents.md](docs/agents.md)

### Comandos

| Comando | Descripción |
|---------|-------------|
| `/pai-setup` | Asistente interactivo de incorporación — configura identidad, voz, preferencias |
| `/algorithm [task]` | Inicia una tarea usando el flujo de trabajo completo del Algoritmo PAI |
| `/native [task]` | Ejecución rápida de tareas en modo Native |
| `/telos [action]` | Revisa y actualiza tus objetivos de vida TELOS |

### Tema

El tema de PAI (`pai.json`) proporciona un esquema de colores azul oscuro/pizarra. Se aplica automáticamente durante la instalación; cámbialo con `/theme` en la TUI.

---

## Requisitos previos

| Herramienta | Versión | Propósito | Instalación |
|------|---------|---------|---------|
| [OpenCode](https://opencode.ai) | ≥1.0 | CLI host para el complemento | `curl -fsSL https://opencode.ai/install \| bash` |
| [PAI v4.0.3](https://github.com/danielmiessler/Personal_AI_Infrastructure) | 4.0.3 | Fuente de ganchos, agentes y habilidades | `git clone` (ver [Getting Started](GETTING_STARTED.md)) |
| [Bun](https://bun.sh) | ≥1.0 | Runtime y herramienta de compilación | `curl -fsSL https://bun.sh/install \| bash` |

**Opcional:** tmux (StatusLine), jq (JSON de StatusLine), CLI de gh (PRs de auto-actualización), clave API de ElevenLabs (TTS de voz).

---

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para la configuración, pruebas y directrices de PR.

**¿Añadiendo un nuevo controlador?** Crea un controlador en `src/handlers/`, regístralo en `src/plugin/pai-unified.ts`, escribe pruebas en `src/__tests__/` y luego ejecuta `bun test` para verificar que pasen las 765 pruebas.

**Estilo de código:** TypeScript estricto, solo `fileLog()` (nunca `console.log`), estado con alcance de sesión, patrón adaptador (nunca modificar `~/.claude/`).

---

## Licencia

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Licencia MIT** — Consulta [LICENSE](LICENSE) para el texto completo.

Tanto [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure) como [OpenCode](https://opencode.ai) también tienen licencia MIT.

---

## Proyectos relacionados

- **[Personal AI Infrastructure (PAI)](https://github.com/danielmiessler/Personal_AI_Infrastructure)** — PAI v4.0.3 original para Claude Code (licencia MIT)
- **[OpenCode](https://opencode.ai)** — Asistente de código con IA de código abierto (licencia MIT)
- **[PAI Issue #98](https://github.com/danielmiessler/Personal_AI_Infrastructure/issues/98)** — La solicitud de la comunidad que motivó este adaptador

---

## Registro de cambios

### v0.11.0 (2026-04-04)

**Endurecimiento de seguridad:**

- Eliminador de secretos (secret scrubber) — nuevo gancho `experimental.chat.messages.transform`; redacta secretos de entorno y patrones de claves API (Anthropic, OpenAI, GitHub, AWS, Slack, Google) de los mensajes de entrada del LLM antes de que lleguen al proveedor
- Bloqueo de archivos `.env` endurecido — todos los agentes ahora usan permisos explícitos `read: { "*.env": "deny" }` en lugar de `read: "allow"` general, cerrando la brecha donde los permisos del agente podrían anular las reglas de denegación predeterminadas de `.env` de OpenCode
- Corrección de falsos positivos de Base64 — `sanitizeInput` ahora solo decodifica blobs base64 que contienen `+` o `/`, evitando que identificadores alfanuméricos simples (nombres de funciones, etc.) sean identificados erróneamente como inyecciones
- Código muerto eliminado — se eliminaron `permissionGateHandler`, `PROTECTED_PATHS`, `DANGEROUS_COMMANDS`, `SAFE_TOOLS`; gancho `chat.params` documentado y pospuesto
- 777 pruebas, 0 fallos (neto +6)

### v0.9.1 (2026-03-31)

**Suite de fiabilidad de subagentes:**

- Detección de errores mejorada — verifica campos de error de nivel superior Y el cuerpo completo de salida de Task para errores del proveedor
- Guía de conmutación por error de modelos aplicable — inyecta sugerencias alternativas de `subagent_type` en caso de fallos del proveedor
- Detección de inactividad — monitor de latido de inactividad de 3 minutos por subagente, advierte al agente principal
- Detección de bucles de razonamiento — genera hash del texto de razonamiento en una ventana deslizante, detecta patrones de pensamiento repetitivos
- Cargador de entorno — carga automáticamente claves API desde `~/.config/PAI/.env`
- Cargador de habilidades — soporte nativo para la herramienta de habilidades de OpenCode
- Sincronización de modelo de agente — campo `model:` en archivos `.md` de agentes, sincronizado desde `pai-adapter.json` al inicio
- Regla de protección PAI — evita la modificación accidental de archivos PAI upstream
- 8 agentes (se agregaron Architect, Engineer, Intern)
- 765 pruebas, 0 fallos

### v0.7.0 (2026-03-31)

**Aislamiento de contexto de subagentes:**

- La inyección del prefacio del subagente evita la creación recursiva de agentes
- Bloqueo de la herramienta Task para sesiones de subagentes (defensa en profundidad)
- La herramienta Skill permanece disponible para subagentes para cargar flujos de trabajo

### v0.1.0 (2026-03-21)

**Lanzamiento inicial:**

- Traducción de eventos para 20 ganchos de PAI a través de 8 ganchos de complementos de OpenCode
- Traducción de configuración con semántica de fusión
- Gestión de estado con alcance de sesión
- Validador de seguridad con control de acceso a herramientas
- Estrategia de compactación dual (proactiva + reactiva)
- Notificaciones por voz (ElevenLabs, ntfy, Discord)
- Integración de StatusLine con tmux
- Auto-actualizador con creación de PR de borrador
- Registros basados en archivos (nunca console.log)
- 546 pruebas, 0 fallos

---

<div align="center">

**Adaptador PAI-OpenCode** — Ejecuta PAI en OpenCode, no en Claude Code.

[Reportar problema](https://github.com/anditurdiu/pai-opencode-adapter/issues) · [Solicitar función](https://github.com/anditurdiu/pai-opencode-adapter/discussions)

</div>
