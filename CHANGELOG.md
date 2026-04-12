# TNO Quality Companion - Refactor & Mejoras

## Problemas Resueltos

### 1. Credenciales expuestas en el frontend
**Problema:** El usuario y contrasena (`jcarrasco` / `Telecom123!`) estaban en texto plano dentro de `index.html`. Cualquier persona podia verlos abriendo DevTools o descomprimiendo el `.asar` de Electron.

**Solucion:** Se movio la validacion al proceso principal de Electron (`main.js`). El frontend ahora llama a `window.electronAPI.login(user, pass)` via IPC. Las credenciales nunca llegan al renderer.

**Por que era necesario:** Seguridad basica. En una app de escritorio distribuida, el codigo del frontend es accesible.

---

### 2. Clientes de Supabase y Gemini recreados en cada peticion
**Problema:** Cada vez que un agente hacia una pregunta al copilot, se creaban nuevas instancias de `GoogleGenerativeAI` y `createClient` de Supabase. En 30 preguntas por hora, eran 60 objetos innecesarios.

**Solucion:** Se crean una sola vez al arrancar la app (singleton) y se reutilizan en todas las peticiones.

**Por que era necesario:** Buena practica. Reduce inicializaciones repetidas y consumo de memoria.

---

### 3. Archivo monolitico de 1960 lineas
**Problema:** `index.html` contenia todo: CSS (~400 lineas), HTML (~500 lineas), JavaScript (~560 lineas) y una base de datos de 194 denial codes (~300 lineas). Imposible de mantener o debuggear eficientemente.

**Solucion:** Se separo en 5 archivos:
- `index.html` - Solo HTML (estructura)
- `styles.css` - Todos los estilos
- `app.js` - Logica de la app, copilot, voice, accordions
- `login.js` - Logica de login
- `denial_codes.json` - 194 denial codes como JSON puro

**Por que era necesario:** Mantenibilidad. Ahora puedes editar estilos sin tocar logica, actualizar denial codes sin tocar HTML, y debuggear JS en archivos enfocados.

---

### 4. Denial codes hardcodeados en el HTML
**Problema:** Los 194 codigos de negacion estaban como un objeto JavaScript dentro del HTML. Para actualizar un codigo habia que editar el HTML completo y redesplegar.

**Solucion:** Se extrajeron a `denial_codes.json`. Se cargan via `fetch()` al arrancar la app.

**Por que era necesario:** Los denial codes cambian. Ahora solo se edita un archivo JSON sin tocar codigo.

---

### 5. Dependencias innecesarias en el build de produccion
**Problema:** `mammoth`, `pdf-parse-new`, `xlsx`, `openai` y `voyageai` estaban en `dependencies`. Se empaquetaban en el ejecutable de Electron aunque la app nunca las usa (solo las usan scripts utilitarios).

**Solucion:** `openai` y `voyageai` se eliminaron (no se usaban en ningun archivo). `mammoth`, `pdf-parse-new` y `xlsx` se movieron a `devDependencies`.

**Por que era necesario:** Reduce el tamano del build final. Las librerias de ingestion siguen disponibles con `npm install` para correr `ingest_data.js`.

---

### 6. Sin paginacion en el historial de llamadas
**Problema:** `get-history` leia TODOS los archivos JSON de logs y los cargaba en memoria de golpe. Con el tiempo esto iba a ser cada vez mas lento.

**Solucion:** Se implemento paginacion. Acepta `{ page, limit }` y deja de leer archivos cuando tiene suficientes registros. Devuelve `{ calls, total, page, limit }`.

**Por que era necesario:** Escalabilidad. Despues de meses de uso con decenas de llamadas diarias, cargar todo en memoria no es viable.

---

### 7. Sin rate limiting en el copilot
**Problema:** Un agente podia hacer click multiples veces en "enviar" y disparar muchas llamadas simultaneas a la API de Gemini.

**Solucion:** Se agrego un flag `isSending` que bloquea el boton de enviar y ignora clicks/Enter mientras hay una peticion en curso. Se desbloquea automaticamente al recibir respuesta o error.

**Por que era necesario:** Proteccion de API. Evita llamadas duplicadas y consumo innecesario de cuota.

---

### 8. Datos minimos guardados al terminar llamada
**Problema:** `endCall()` solo guardaba fecha y escenario. Toda la informacion que el agente llenaba durante la llamada (caller type, HIPAA, denial codes, QA score) se perdia.

**Solucion:** Ahora guarda: `date`, `scenario`, `callerType`, `hipaaStatus`, `escalationReason`, `denialCode`, `qaScore`, `completedSteps`, `totalSteps`.

**Por que era necesario:** Valor de QA. Con estos datos se puede analizar: frecuencia de escalaciones, denial codes mas comunes, QA promedio por agente, tipos de llamadas mas frecuentes.

---

### 9. Sin atajo del copilot desde denial codes
**Problema:** Cuando el agente buscaba un denial code, veia la accion recomendada pero si necesitaba mas detalle tenia que abrir el copilot manualmente y escribir la pregunta.

**Solucion:** Se agrego un boton "Ask Copilot about this" debajo de cada resultado de denial code. Al hacer click, abre el chat y automaticamente pregunta al AI con el codigo y descripcion para obtener instrucciones detalladas.

**Por que era necesario:** Flujo de trabajo. El agente obtiene ayuda contextual en un click en vez de cambiar de contexto.

---

### 10. Script de cierre generico e interactivo
**Problema:** El texto de cierre era siempre el mismo sin importar que paso durante la llamada. No le daba al agente un guion contextual para despedirse.

**Solucion:** El closing script ahora cambia dinamicamente segun el escenario Y el estado de los formularios:
- Check payment con fecha de 10 dias: *"It's been 10 days. Please allow 11 more business days."*
- Payment plan con $500: *"Your plan is set: $83.33/month for 6 months."*
- Claim denied con CO45: *"Denial code CO45 has been noted. This will be reviewed by our AR team."*
- Self-pay con 20% de $1000: *"With your 20% discount, the total is $800.00."*
- Escalation invalida: *"This request does not require escalation."*

Se actualiza en tiempo real cuando el agente interactua con cualquier sub-formulario.

**Por que era necesario:** El agente no tiene que improvisar el cierre. Tiene un guion preciso que refleja exactamente lo que se discutio en la llamada.

---

## Sugerencias Pendientes

Las siguientes mejoras aportarian valor significativo y no requieren integraciones externas:

### Alta prioridad

**1. Campo de notas por llamada**
Un campo de texto libre antes del boton "END CALL" para que el agente documente lo que paso. Se guardaria en el log. El supervisor puede leer las notas despues sin tener que llamar al paciente.

**2. Disposicion de llamada (call outcome)**
Un dropdown al terminar la llamada: "Pago recibido", "Payment plan acordado", "Escalado", "Callback necesario", "Solo informacion". Se guarda en el log para saber como termino cada llamada.

**3. Campo de Account Number / Patient Name**
Un campo arriba del formulario para documentar el numero de cuenta o nombre del paciente. No necesita buscar en ninguna base de datos, es solo para que quede registrado en el log.

### Media prioridad

**4. Timer de llamada**
Un cronometro visible que empiece cuando el agente marca el primer checkbox. Con una alerta suave al pasar 10-15 minutos. Ayuda al agente a gestionar su tiempo.

**5. Resumen antes de terminar la llamada**
Antes de hacer reset, mostrar un resumen: "Caller: Patient | Scenario: Payment Plan | QA: 100%". Que el agente confirme antes de borrar todo. Ahora se limpia instantaneamente sin confirmacion.

**6. Boton de copiar en scripts de greeting**
Los scripts de saludo estan en accordions pero el agente no puede copiarlos. Un boton "Copy" al lado para pegarlo donde lo necesite.

**7. Historial del dia accesible desde la app**
Los datos se guardan pero el agente no puede verlos. Un panel que muestre "Calls today: 12 | Avg QA: 95%". Motivacion y tracking.

### Baja prioridad

**8. Sonido en alertas criticas**
Cuando aparece "PLEASE MASK THE CALL" (pagos) o "DO NOT ESCALATE", un beep sutil para que el agente lo note si esta mirando otra pantalla.

**9. Closing script con boton de copiar**
Un boton al lado del script de cierre para copiarlo al portapapeles y pegarlo en notas.
