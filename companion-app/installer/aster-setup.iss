[Setup]
AppId={{A5E4C9F0-3B1D-4E2A-9C7F-8D6B2A1E5F30}}
AppName=Aster Video Downloader Companion
AppVersion=1.0.0
AppVerName=Aster Companion 1.0.0
AppPublisher=Aster
DefaultDirName={localappdata}\AsterCompanion
DefaultGroupName=Aster Video Downloader
DisableProgramGroupPage=yes
DisableWelcomePage=no
SetupIconFile=..\..\assets\icon.ico
UninstallDisplayIcon={app}\aster-companion-app-win.exe
OutputDir=..\..\
OutputBaseFilename=Aster Companion Setup
WizardImageFile=..\..\assets\wizard-large.bmp
WizardSmallImageFile=..\..\assets\wizard-small.bmp
WizardStyle=modern dark includetitlebar
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "dutch"; MessagesFile: "compiler:Languages\Dutch.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
; Nota: Os idiomas abaixo exigem que você baixe os arquivos .isl não-oficiais do repositório Inno Setup e coloque na pasta Languages:
; Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
; Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
; Name: "indonesian"; MessagesFile: "compiler:Languages\Indonesian.isl"
; Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
; Name: "vietnamese"; MessagesFile: "compiler:Languages\Vietnamese.isl"

[CustomMessages]
brazilianportuguese.MadeBy=Feito por Aster
english.MadeBy=Made by Aster
portuguese.MadeBy=Feito por Aster
spanish.MadeBy=Hecho por Aster
french.MadeBy=Fait par Aster
german.MadeBy=Gemacht von Aster
italian.MadeBy=Fatto da Aster
japanese.MadeBy=Aster 作
dutch.MadeBy=Gemaakt door Aster
russian.MadeBy=Сделано Aster

[Messages]
brazilianportuguese.WelcomeLabel2=Isto instalará o [name/ver] no seu computador.%n%nO Companion é estritamente necessário porque os navegadores impõem limites para baixar vídeos muito complexos (como streams HLS) ou que precisam juntar imagem e áudio em alta resolução (como no YouTube). Ele funciona como um motor invisível no seu PC, fazendo todo o trabalho pesado para a extensão com velocidade máxima.%n%nCaso tenha qualquer dúvida ou encontre algum problema, clique no botão do Discord aqui embaixo!
brazilianportuguese.FinishedLabel=Tudo pronto! 🚀%n%nO Aster Companion foi instalado e configurado com sucesso no seu computador.%n%nO que acontece agora?%nVocê não precisa abrir nenhum aplicativo separadamente. O Companion roda de forma invisível e silenciosa em segundo plano, sendo acionado apenas quando a sua extensão pede para baixar um vídeo.%n%nPode clicar em Concluir e aproveitar seus downloads pelo navegador!

english.WelcomeLabel2=This will install [name/ver] on your computer.%n%nThe Companion is strictly necessary because browsers impose limits for downloading very complex videos (like HLS streams) or joining high resolution video and audio (like YouTube). It works as an invisible engine on your PC, doing all the heavy lifting for the extension at maximum speed.%n%nIf you have any questions or encounter any issues, click the Discord button below!
english.FinishedLabel=All set! 🚀%n%nAster Companion was successfully installed and configured on your computer.%n%nWhat happens now?%nYou don't need to open any separate app. The Companion runs invisibly and silently in the background, only being triggered when your extension asks to download a video.%n%nYou can click Finish and enjoy your downloads from the browser!

portuguese.WelcomeLabel2=Isto irá instalar o [name/ver] no seu computador.%n%nO Companion é estritamente necessário porque os navegadores impõem limites para transferir vídeos muito complexos (como streams HLS) ou que precisam de juntar imagem e áudio em alta resolução (como no YouTube). Funciona como um motor invisível no seu PC, fazendo todo o trabalho pesado para a extensão com velocidade máxima.%n%nCaso tenha qualquer dúvida ou encontre algum problema, clique no botão do Discord aqui em baixo!
portuguese.FinishedLabel=Tudo pronto! 🚀%n%nO Aster Companion foi instalado e configurado com sucesso no seu computador.%n%nO que acontece agora?%nNão precisa de abrir nenhuma aplicação separadamente. O Companion roda de forma invisível e silenciosa em segundo plano, sendo acionado apenas quando a sua extensão pede para transferir um vídeo.%n%nPode clicar em Concluir e aproveitar as suas transferências pelo navegador!

spanish.WelcomeLabel2=Esto instalará [name/ver] en su computadora.%n%nEl Companion es estrictamente necesario porque los navegadores imponen límites para descargar videos muy complejos (como streams HLS) o que necesitan unir video y audio en alta resolución (como YouTube). Funciona como un motor invisible en su PC, haciendo todo el trabajo pesado para la extensión a máxima velocidad.%n%nSi tiene alguna duda o encuentra algún problema, ¡haga clic en el botón de Discord abajo!
spanish.FinishedLabel=¡Todo listo! 🚀%n%nAster Companion ha sido instalado y configurado con éxito en su computadora.%n%n¿Qué sucede ahora?%nNo necesita abrir ninguna aplicación por separado. El Companion se ejecuta de forma invisible y silenciosa en segundo plano, activándose solo cuando su extensión solicita descargar un video.%n%n¡Puede hacer clic en Finalizar y disfrutar de sus descargas desde el navegador!

french.WelcomeLabel2=Ceci installera [name/ver] sur votre ordinateur.%n%nLe Companion est strictement nécessaire car les navigateurs imposent des limites pour le téléchargement de vidéos très complexes (comme les flux HLS) ou pour joindre la vidéo et l'audio en haute résolution (comme YouTube). Il fonctionne comme un moteur invisible sur votre PC, faisant tout le travail lourd pour l'extension à vitesse maximale.%n%nSi vous avez des questions ou rencontrez des problèmes, cliquez sur le bouton Discord ci-dessous !
french.FinishedLabel=Tout est prêt ! 🚀%n%nAster Companion a été installé et configuré avec succès sur votre ordinateur.%n%nQue se passe-t-il maintenant ?%nVous n'avez besoin d'ouvrir aucune application séparément. Le Companion s'exécute de manière invisible et silencieuse en arrière-plan, et ne se déclenche que lorsque votre extension demande de télécharger une vidéo.%n%nVous pouvez cliquer sur Terminer et profiter de vos téléchargements depuis le navigateur !

german.WelcomeLabel2=Dies wird [name/ver] auf Ihrem Computer installieren.%n%nDer Companion ist zwingend erforderlich, da Browser Beschränkungen für das Herunterladen sehr komplexer Videos (wie HLS-Streams) oder das Zusammenfügen von hochauflösendem Video und Audio (wie bei YouTube) auferlegen. Er arbeitet als unsichtbare Engine auf Ihrem PC und erledigt die gesamte Schwerstarbeit für die Erweiterung mit maximaler Geschwindigkeit.%n%nWenn Sie Fragen haben oder auf Probleme stoßen, klicken Sie auf die Discord-Schaltfläche unten!
german.FinishedLabel=Alles bereit! 🚀%n%nAster Companion wurde erfolgreich auf Ihrem Computer installiert und konfiguriert.%n%nWas passiert jetzt?%nSie müssen keine separate App öffnen. Der Companion läuft unsichtbar und geräuschlos im Hintergrund und wird nur aktiviert, wenn Ihre Erweiterung ein Video herunterladen möchte.%n%nSie können auf Fertigstellen klicken und Ihre Downloads über den Browser genießen!

italian.WelcomeLabel2=Questo installerà [name/ver] sul tuo computer.%n%nIl Companion è strettamente necessario perché i browser impongono limiti per il download di video molto complessi (come gli stream HLS) o per unire video e audio ad alta risoluzione (come YouTube). Funziona come un motore invisibile sul tuo PC, facendo tutto il lavoro pesante per l'estensione alla massima velocità.%n%nSe hai domande o incontri problemi, fai clic sul pulsante Discord qui sotto!
italian.FinishedLabel=Tutto pronto! 🚀%n%nAster Companion è stato installato e configurato con successo sul tuo computer.%n%nCosa succede ora?%nNon è necessario aprire alcuna app separatamente. Il Companion viene eseguito in modo invisibile e silenzioso in background, venendo attivato solo quando la tua estensione chiede di scaricare un video.%n%nPuoi fare clic su Fine e goderti i tuoi download dal browser!

japanese.WelcomeLabel2=これにより、[name/ver] がコンピューターにインストールされます。%n%nブラウザは非常に複雑な動画 (HLS ストリームなど) のダウンロードや、高解像度の動画と音声の結合 (YouTube など) に制限を課しているため、Companion は絶対に必要です。 これは PC 上の目に見えないエンジンとして機能し、拡張機能のすべての重い作業を最高速度で実行します。%n%nご質問がある場合や問題が発生した場合は、下の Discord ボタンをクリックしてください！
japanese.FinishedLabel=準備完了！ 🚀%n%nAster Companion がコンピューターに正常にインストールされ、構成されました。%n%nこれからどうなるの？%n別のアプリを開く必要はありません。 Companion はバックグラウンドで目に見えず静かに実行され、拡張機能が動画のダウンロードを要求したときにのみトリガーされます。%n%n[完了] をクリックして、ブラウザからダウンロードをお楽しみください！

dutch.WelcomeLabel2=Dit zal [name/ver] op uw computer installeren.%n%nDe Companion is strikt noodzakelijk omdat browsers limieten opleggen voor het downloaden van zeer complexe video's (zoals HLS-streams) of het samenvoegen van hoge resolutie video en audio (zoals YouTube). Het werkt als een onzichtbare engine op uw pc en doet al het zware werk voor de extensie op maximale snelheid.%n%nAls u vragen heeft of problemen ondervindt, klik dan op de Discord-knop hieronder!
dutch.FinishedLabel=Helemaal klaar! 🚀%n%nAster Companion is succesvol geïnstalleerd en geconfigureerd op uw computer.%n%nWat gebeurt er nu?%nU hoeft geen afzonderlijke app te openen. De Companion draait onzichtbaar en stil op de achtergrond en wordt alleen geactiveerd wanneer uw extensie vraagt om een video te downloaden.%n%nU kunt op Voltooien klikken en genieten van uw downloads vanuit de browser!

russian.WelcomeLabel2=Это установит [name/ver] на ваш компьютер.%n%nCompanion строго необходим, потому что браузеры накладывают ограничения на загрузку очень сложных видео (например, потоков HLS) или объединение видео и аудио в высоком разрешении (например, YouTube). Он работает как невидимый движок на вашем ПК, выполняя всю тяжелую работу для расширения с максимальной скоростью.%n%nЕсли у вас есть какие-либо вопросы или вы столкнулись с проблемами, нажмите кнопку Discord ниже!
russian.FinishedLabel=Все готово! 🚀%n%nAster Companion успешно установлен и настроен на вашем компьютере.%n%nЧто теперь?%nВам не нужно открывать какое-либо отдельное приложение. Companion работает незаметно и тихо в фоновом режиме, запускаясь только тогда, когда ваше расширение просит загрузить видео.%n%nВы можете нажать «Готово» и наслаждаться загрузками из браузера!

[Files]
Source: "..\dist\aster-companion-app-win.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\assets\icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\com.aster.downloader"; \
  ValueType: string; ValueData: "{app}\host-manifest.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\com.aster.downloader"; \
  ValueType: string; ValueData: "{app}\host-manifest.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.aster.downloader"; \
  ValueType: string; ValueData: "{app}\host-manifest.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Chromium\NativeMessagingHosts\com.aster.downloader"; \
  ValueType: string; ValueData: "{app}\host-manifest.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Opera Software\NativeMessagingHosts\com.aster.downloader"; \
  ValueType: string; ValueData: "{app}\host-manifest.json"; Flags: uninsdeletekey

[Icons]
Name: "{group}\Aster Companion"; Filename: "{app}\aster-companion-app-win.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\Desinstalar Aster Companion"; Filename: "{uninstallexe}"


[Code]
procedure OpenBrowser(Url: string);
var
  ErrorCode: Integer;
begin
  ShellExec('open', Url, '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

procedure DiscordClick(Sender: TObject);
begin
  OpenBrowser('https://discord.gg/EDzYV5JvMk');
end;

procedure GithubClick(Sender: TObject);
begin
  OpenBrowser('https://github.com/zAstergun');
end;

procedure GenerateHostManifest();
var
  ManifestPath, ExePath, Content: string;
begin
  ManifestPath := ExpandConstant('{app}\host-manifest.json');
  ExePath := ExpandConstant('{app}\aster-companion-app-win.exe');
  // Escapar barras invertidas para JSON válido
  StringChangeEx(ExePath, '\', '\\', True);
  
  Content := '{' + #13#10;
  Content := Content + '  "name": "com.aster.downloader",' + #13#10;
  Content := Content + '  "description": "Aster Video Downloader Companion App",' + #13#10;
  Content := Content + '  "path": "' + ExePath + '",' + #13#10;
  Content := Content + '  "type": "stdio",' + #13#10;
  Content := Content + '  "allowed_origins": [' + #13#10;
  Content := Content + '    "chrome-extension://ebdnanhfcfokkbblcjlckhgihjpkkece/"' + #13#10;
  Content := Content + '  ]' + #13#10;
  Content := Content + '}';
  
  SaveStringToFile(ManifestPath, Content, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    GenerateHostManifest();
  end;
end;

procedure InitializeWizard;
var
  DiscordBtn: TNewButton;
  GithubBtn: TNewButton;
  MadeByLabel: TNewStaticText;
begin
  DiscordBtn := TNewButton.Create(WizardForm);
  DiscordBtn.Parent := WizardForm;
  DiscordBtn.Left := 15;
  DiscordBtn.Top := WizardForm.CancelButton.Top;
  DiscordBtn.Width := 80;
  DiscordBtn.Height := WizardForm.CancelButton.Height;
  DiscordBtn.Caption := 'Discord';
  DiscordBtn.OnClick := @DiscordClick;

  GithubBtn := TNewButton.Create(WizardForm);
  GithubBtn.Parent := WizardForm;
  GithubBtn.Left := DiscordBtn.Left + DiscordBtn.Width + 10;
  GithubBtn.Top := WizardForm.CancelButton.Top;
  GithubBtn.Width := 80;
  GithubBtn.Height := WizardForm.CancelButton.Height;
  GithubBtn.Caption := 'GitHub';
  GithubBtn.OnClick := @GithubClick;

  MadeByLabel := TNewStaticText.Create(WizardForm);
  MadeByLabel.Parent := WizardForm;
  MadeByLabel.Top := WizardForm.CancelButton.Top + 6;
  MadeByLabel.Left := GithubBtn.Left + GithubBtn.Width + 15;
  MadeByLabel.Caption := CustomMessage('MadeBy');
end;
