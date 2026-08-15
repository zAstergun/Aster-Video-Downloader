# Aster Video Downloader — Plano de Modificações

Este documento lista as mudanças planejadas para o projeto, organizadas por categoria e prioridade. Cada item referencia os arquivos e funções envolvidos para facilitar a implementação.

---

## 0. Mudança arquitetural — Download passar pelo Chrome (`saveAs`)

**Prioridade: Alta (impacta vários outros itens abaixo)**

### Problema

Downloads simples (MP4 direto) usam `chrome.downloads.download({ saveAs: true })` e abrem o diálogo nativo de "Salvar como". Downloads processados pelo companion app (YouTube, Twitter/X, Instagram, Facebook, Reddit, HLS, conversão HTML5) são salvos diretamente em disco via `fs` dentro do Node (`companion-app/src/downloader.js`), sem passar pelo Chrome — não abrem o diálogo de salvar, não aparecem na barra de downloads nem no histórico nativo do navegador.

### Mudança proposta

1. `companion-app/src/downloader.js`: todas as funções de download (`downloadYoutube`, `downloadHLS`, `downloadHTML5Converted`) passam a escrever o resultado em uma pasta **temporária** (`os.tmpdir()`), não mais direto na pasta final de destino.
2. Adicionar um servidor HTTP local no companion app (ex: `http.createServer` em `companion-app/src/main.js` ou novo módulo `companion-app/src/local-server.js`), escutando em `127.0.0.1` numa porta livre, servindo apenas o arquivo processado.
   - Gerar um token por sessão de download e exigi-lo como query param ou header, para evitar que outro processo local acesse o servidor.
   - Servidor deve ser efêmero: subir só quando necessário, encerrar após a entrega ou timeout.
3. Quando o processamento terminar, o companion app envia `status: 'ready_to_download'` com a URL local (`http://127.0.0.1:PORTA/arquivo.ext?token=...`) em vez de `status: 'success'` com `filePath`.
4. `background/service-worker.js`: ao receber `ready_to_download`, chamar `chrome.downloads.download({ url: localUrl, filename: sugestão, saveAs: true })`.
5. Após o Chrome confirmar o download (`chrome.downloads.onChanged`, estado `complete`), enviar mensagem ao companion app para apagar o arquivo temporário e derrubar o servidor local.
6. Tratar falha do usuário cancelar o diálogo de salvar (`chrome.downloads.onChanged` com `state: 'interrupted'`) — limpar temporário também nesse caso.
7. Remover a necessidade de "pasta de destino" fixa na aba Settings do painel (`sidepanel/sidepanel.html` + `sidepanel.js`, bloco `customFolderInput`/`aster_settings`) já que cada download passa a perguntar onde salvar — **ou manter como "pasta sugerida padrão" opcional, a definir**.

### Trade-offs a documentar no código (comentário)

- Escrita dupla (companion app escreve temp, Chrome lê via localhost) — aceitável, localhost é rápido, mas gera I/O extra em disco.
- Necessário tratar porta ocupada (`EADDRINUSE`) com retry em outra porta.

---

## 1. Bugs críticos

### 1.1 Remover `debug_formats.json` hardcoded

**Arquivo:** `companion-app/src/downloader.js`, função `getYouTubeFormats` (~linha 260)
Remove a linha que escreve `fs.writeFileSync(path.join(os.homedir(), 'Desktop', 'Aster - Video Downloader', 'debug_formats.json'), ...)`. Essa pasta não existe por padrão em outras máquinas, o que faz a função falhar (cair no `catch` e devolver `[]` silenciosamente) toda vez que é chamada.

### 1.2 Enviar cookies no fluxo HLS

**Arquivo:** `companion-app/src/downloader.js`, funções `fetchHLS`, `downloadHLSSegment`, `downloadHLS`, `getHLSFormats`
Hoje nenhuma dessas funções aceita ou envia cookies. Isso quebra download de HLS autenticado (ex: aulas em plataformas de curso como Kiwify). Adicionar parâmetro `cookies` propagado desde `handleMessage` (`main.js`) até as requisições HTTP (`https.get`/`http.get` com header `Cookie`).

### 1.3 Usar `sanitizeFilename`

**Arquivo:** `companion-app/src/downloader.js`
A função `sanitizeFilename` existe mas nunca é chamada. Aplicar no template de output (`outputTemplate` em `downloadYoutube`, e nos nomes gerados em `downloadHLS`/`downloadHTML5Converted`) para evitar caracteres inválidos de título quebrando o yt-dlp/FFmpeg no Windows.

### 1.4 Remover dependência morta

**Arquivo:** `companion-app/package.json`, `companion-app/src/downloader.js`
Remover `@distube/ytdl-core` do `package.json` e do `require` no topo de `downloader.js` — não é mais usado (download do YouTube migrou para `yt-dlp.exe` via `spawn`).

---

## 2. Robustez

### 2.1 Feedback quando companion app não está instalado/conectado

**Arquivos:** `background/service-worker.js` (`port.onDisconnect`), `sidepanel/sidepanel.js`
Hoje só há `console.warn`. Propagar uma mensagem `companion_missing` para o Side Panel e mostrar um aviso visível (banner ou estado no `statusBadge`) com link/instrução para rodar `install.bat`.

### 2.2 Fila de downloads

**Arquivos:** `background/service-worker.js`, `sidepanel/sidepanel.js`
Implementar uma fila simples (array de jobs pendentes) no service worker para evitar que dois `startCompanionDownload` concorrentes usem a mesma conexão nativa/processo `spawn` de forma conflitante. Processar um job por vez (ou N configurável).

### 2.3 Retry/reconexão da porta nativa

**Arquivo:** `background/service-worker.js`, função `startCompanionDownload`
Se `port.onDisconnect` disparar no meio de um download longo (aula extensa), tentar reconectar automaticamente (com backoff) antes de marcar como erro definitivo.

### 2.4 Cancelar download em andamento

**Arquivos:** `companion-app/src/main.js`, `companion-app/src/downloader.js`, `background/service-worker.js`, `sidepanel/sidepanel.js`
Adicionar ação `cancel_download` que mata o processo `spawn` (yt-dlp/ffmpeg) em andamento e limpa temporários. Expor botão de cancelar na UI do card de vídeo enquanto o download está em progresso.

### 2.5 Atualização do yt-dlp/ffmpeg

**Arquivo:** `companion-app/src/downloader.js`, novo módulo de update (ex: `companion-app/src/updater.js`)
Adicionar checagem periódica (ou botão manual em Settings) que baixa a versão mais recente do `yt-dlp.exe` e substitui o binário em `bin/`, já que o YouTube muda frequentemente e quebra versões antigas.

### 2.6 Melhorar dedup de streams HLS

**Arquivo:** `background/service-worker.js`, listener `onBeforeRequest`
A heurística atual (comparar prefixo de pasta) pode gerar falso positivo/negativo em CDNs com estrutura diferente. Avaliar comparar por `master playlist` real (fazer parse leve) em vez de só string matching de path.

---

## 3. Qualidade de código

### 3.1 Remover/isolar logs de debug

**Arquivos:** `background/service-worker.js`, `content-scripts/detector.js`
Envolver todos os `console.log` em uma flag de debug (ex: `const DEBUG = false;`) ou removê-los antes de builds de produção.

### 3.2 Documentar README

**Arquivo:** `README.md` (hoje praticamente vazio)
Incluir: o que é o projeto, arquitetura (extensão + companion app), como instalar o companion app (`install.bat`), permissões necessárias e por quê, sites suportados, limitações conhecidas (Windows-only por enquanto).

### 3.3 Documentar ID fixo no host-manifest

**Arquivo:** `companion-app/host-manifest.json`, `README.md`
Adicionar comentário/nota no README explicando que `allowed_origins` tem o ID da extensão publicada fixo, e que quem carregar a extensão "unpacked" para desenvolvimento vai ter um ID diferente — precisa atualizar esse campo localmente para o Native Messaging funcionar.

---

## 4. Novas features

### 4.1 Barra de progresso real

**Arquivo:** `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`
O cálculo de `percent` já existe em `downloadHLS` (companion-app). Usar esse valor (e equivalente para yt-dlp, que também expõe progresso no stdout) para preencher uma barra visual no card do vídeo, em vez de só texto no `statusBadge`.

### 4.2 Notificação nativa do Chrome

**Arquivo:** `manifest.json` (adicionar permissão `notifications`), `background/service-worker.js`
Disparar `chrome.notifications.create(...)` quando um download completar ou falhar, para avisar mesmo com o painel fechado.

### 4.3 Atalho "baixar só áudio"

**Arquivo:** `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`
Botão direto no card do vídeo para baixar áudio (MP3) sem precisar abrir o dropdown de qualidade e selecionar manualmente.

### 4.4 Suporte a legendas/subtítulos

**Arquivo:** `companion-app/src/downloader.js`, função `downloadYoutube`
Adicionar flags do yt-dlp (`--write-subs`, `--sub-langs`) como opção configurável na UI.

### 4.5 Suporte multiplataforma no companion app

**Arquivos:** `companion-app/install.bat`, `companion-app/run.bat`, `companion-app/host-manifest.json`
Hoje só Windows (`.bat`, `.exe`). Avaliar scripts equivalentes para macOS/Linux (`.sh`) e detectar o binário correto do yt-dlp/ffmpeg por plataforma.

---

## Ordem sugerida de implementação

1. Item 0 (mudança arquitetural de download) — é a base que afeta progresso, cancelamento e feedback de erro.
2. Bugs críticos (1.1–1.4) — correções pequenas e isoladas, sem dependência da mudança arquitetural.
3. Robustez (2.1–2.6) — vários dependem do item 0 estar pronto (fila, retry e cancelamento fazem mais sentido já usando o servidor local).
4. Qualidade de código (3.1–3.3) — podem ser feitas em paralelo, baixo risco.
5. Novas features (4.1–4.5) — depois da base estar estável.
