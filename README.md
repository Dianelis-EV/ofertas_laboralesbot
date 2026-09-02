# Bot de Telegram: ofertas de trabajo automáticas (NestJS)

Busca ofertas cada 30 minutos en Computrabajo, InfoJobs, RemoteOK, We Work Remotely
(y opcionalmente Indeed/LinkedIn, "mejor esfuerzo") y te las envía por Telegram.
100% gratis.

## Diferencia clave frente a la versión en Python/GitHub Actions

Esa versión corría como un script que se ejecutaba y terminaba cada 30 min.
Esta versión NestJS es un **servidor que queda corriendo** con un cron interno
(`@nestjs/schedule`), como harías con una API normal. Eso significa que
necesita un hosting que lo mantenga vivo, no solo un cron job.

## 1. Crear el bot de Telegram

1. Abre Telegram, busca **@BotFather**, envía `/newbot`, sigue los pasos.
2. Guarda el **token** que te da.
3. Mándale un mensaje a tu bot y abre en el navegador (reemplaza TU_TOKEN):
   `https://api.telegram.org/botTU_TOKEN/getUpdates`
4. Copia el `"chat":{"id": ...}` → ese es tu `TELEGRAM_CHAT_ID`.

## 2. Correrlo en tu máquina (para probar)

```bash
npm install
cp .env.example .env
# edita .env con tu token y chat_id
npm run start:dev
```

Prueba el endpoint de salud: `GET http://localhost:3000/health`
Dispara una búsqueda manual sin esperar el cron: `POST http://localhost:3000/jobs/run`

## 3. Hosting gratuito recomendado: Render (Web Service free tier)

1. Sube el proyecto a un repo de GitHub.
2. En [render.com](https://render.com) → **New → Web Service** → conecta el repo.
3. Build command: `npm install && npm run build`
   Start command: `npm run start:prod`
4. En **Environment**, agrega las variables de `.env.example` (con tus valores reales).
5. Deploy.

### ⚠️ El plan free de Render "duerme" el servicio tras 15 min sin tráfico

Si se duerme, el cron interno también se detiene. Solución gratuita: usa
[cron-job.org](https://cron-job.org) (gratis) para que haga un `GET` a
`https://tu-app.onrender.com/health` cada 10 minutos. Eso mantiene el servicio
despierto 24/7 sin pagar nada.

**Alternativas** igual de válidas y gratis: Railway (con su plan trial/hobby),
Fly.io (free allowance), o correrlo tú mismo en una Raspberry Pi / PC encendida.

## 4. Personalizar la búsqueda

Todo se controla por variables de entorno (`.env` en local, "Environment" en Render):

- `KEYWORDS`: palabras separadas por coma que deben aparecer en el título.
- `COUNTRY`: país para Computrabajo/Indeed.
- `ENABLED_SOURCES`: qué portales están activos, separados por coma
  (`remoteok,weworkremotely,computrabajo,infojobs,indeed,linkedin,getonboard`).
- `MAX_JOB_AGE_HOURS`: antigüedad máxima (en horas) de una oferta para
  avisar por Telegram. Por defecto `24`. Cada portal muestra la fecha de
  publicación distinto (texto relativo tipo "Hace 2 horas" o fecha ISO), así
  que el bot la interpreta con "mejor esfuerzo"; si un portal cambia su HTML
  y ya no se puede leer esa fecha, esa oferta se descarta (mejor omitir que
  avisar de algo que podría ser viejo).

## 5. Subir tu CV y elegir nivel (nuevo)

Inspirado en cómo describes tu búsqueda ("remoto, fullstack/backend, LATAM o
sin restricción de ubicación, avisar solo si es relevante"), el bot ahora
también usa tu CV como criterio, sin depender de ningún servicio de pago:

1. Abre el chat con tu bot en Telegram y **mándale tu CV en PDF** como
   documento (el clip 📎 → Archivo).
2. El bot extrae texto del PDF y detecta qué tecnologías de tu CV coinciden
   con una lista conocida (`src/cv/tech-keywords.ts` — agrégale lo que
   falte si usas algo muy nicho).
3. Te pregunta con botones: **Junior / Semi Senior / Senior**. Puedes tocar
   1, 2 o 3 (se marcan con ✅) y luego **Confirmar**.
4. Desde ahí, cada búsqueda automática filtra así:
   - **Remoto**: descarta cualquier oferta que no parezca remota (RemoteOK,
     WWR y GetOnBoard son remoto por naturaleza; para el resto se busca
     "remote"/"remoto"/"home office"/"LATAM" en título o ubicación).
   - **Nivel**: si el título dice explícitamente "Senior" pero tú solo
     elegiste Junior, se descarta. Si el título no menciona nivel, se
     incluye igual (para no perder ofertas ambiguas).
   - **Relevancia**: coincide con las palabras de `KEYWORDS` **o** con
     alguna tecnología de tu CV — no hace falta que coincidan ambas, basta
     una señal clara.

Comandos útiles dentro del chat:
- `/cv` → te recuerda qué CV y niveles tiene guardados.
- `/niveles` → vuelve a mostrar los botones para cambiar tu selección sin
  tener que resubir el CV.

**Seguridad**: el bot solo responde al chat de `TELEGRAM_CHAT_ID`. Si alguien
más le escribe (por ejemplo, si comparten el link del bot sin querer), se le
avisa que es privado y se ignora — así nadie más puede leer tus resultados
ni gastar tu cuota de hosting gratis.

## Sobre Indeed y LinkedIn

Ambos bloquean scraping sin login de forma agresiva. Los scrapers son
"mejor esfuerzo": funcionan hoy, pero pueden romperse si cambian su HTML o
bloquean la IP del hosting. Si ves muchos warnings en los logs para esas dos
fuentes, quítalas de `ENABLED_SOURCES` y quédate con las cuatro estables.

## Estructura del proyecto

```
nest-job-bot/
├── src/
│   ├── main.ts                     # bootstrap
│   ├── app.module.ts                # módulo raíz (ConfigModule + ScheduleModule)
│   ├── common/
│   │   ├── job.interface.ts
│   │   └── seen-jobs.store.ts       # persistencia de ofertas ya enviadas
│   ├── telegram/
│   │   ├── telegram.service.ts
│   │   └── telegram.module.ts
│   ├── scrapers/
│   │   ├── remoteok.scraper.ts
│   │   ├── weworkremotely.scraper.ts
│   │   ├── computrabajo.scraper.ts
│   │   ├── infojobs.scraper.ts
│   │   ├── indeed.scraper.ts
│   │   ├── linkedin.scraper.ts
│   │   ├── getonboard.scraper.ts    # LATAM remoto
│   │   └── scrapers.module.ts
│   ├── cv/
│   │   ├── cv.service.ts            # recibe el PDF, detecta skills, botones de nivel
│   │   ├── tech-keywords.ts         # diccionario de tecnologías a detectar
│   │   └── cv.module.ts
│   └── jobs/
│       ├── jobs.service.ts          # @Cron cada 30 min + filtros (remoto/nivel/CV)
│       ├── jobs.controller.ts       # /health y /jobs/run
│       └── jobs.module.ts
├── .env.example
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Nota sobre persistencia

Los IDs de ofertas ya notificadas se guardan en `data/seen_jobs.json`, y tu
CV/niveles en `data/cv.json`, ambos en disco.
En Render free tier el disco es efímero (se borra en cada redeploy, pero
sobrevive mientras el servicio siga corriendo), así que evitarás duplicados
en el día a día. Si quieres persistencia real entre redeploys, la opción
gratuita más simple es una base de datos gratuita como Supabase o MongoDB Atlas
free tier — pero para empezar, el archivo en disco es suficiente.
