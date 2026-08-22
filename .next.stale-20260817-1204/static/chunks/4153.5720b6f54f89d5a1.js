"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[4153],{74153:(e,i,t)=>{t.r(i),t.d(i,{DiditSdk:()=>h,SDK_VERSION:()=>o,default:()=>h});let a={zIndex:9999,showCloseButton:!0,showExitConfirmation:!0,loggingEnabled:!1},n={overlay:"didit-modal-overlay",container:"didit-modal-container",iframe:"didit-verification-iframe",closeButton:"didit-close-button",loading:"didit-loading",confirmOverlay:"didit-confirm-overlay",confirmBox:"didit-confirm-box",embedded:"didit-embedded"},o="0.1.8",s=["ar","bg","bn","ca","cnr","cs","da","de","el","en","es","et","fa","fi","fr","he","hi","hr","hu","hy","id","it","ja","ka","ko","lt","lv","mk","ms","nl","no","pl","pt-BR","pt","ro","ru","sk","sl","so","sr","sv","th","tr","uk","uz","vi","zh-CN","zh-TW","zh"];class r{static get isEnabled(){return this._enabled}static set isEnabled(e){this._enabled=e}static log(...e){this._enabled&&console.log("[DiditSDK]",...e)}static warn(...e){this._enabled&&console.warn("[DiditSDK]",...e)}static error(...e){this._enabled&&console.error("[DiditSDK]",...e)}}function l(e,i){return{type:e,message:i||({sessionExpired:"Your verification session has expired.",networkError:"A network error occurred. Please try again.",cameraAccessDenied:"Camera access is required for verification.",unknown:i||"An unknown error occurred."})[e]}}r._enabled=!1;let d={exitTitle:"Exit verification?",exitMessage:"Exiting will end your verification process. Are you sure?",continueButton:"Continue",exitButton:"Exit",ariaLabelModal:"Didit Verification",ariaLabelClose:"Close verification"},c={ar:{exitTitle:"الخروج من التحقق؟",exitMessage:"سيؤدي الخروج إلى إنهاء عملية التحقق الخاصة بك. هل أنت متأكد؟",continueButton:"متابعة",exitButton:"خروج",ariaLabelModal:"التحقق من Didit",ariaLabelClose:"إغلاق التحقق"},bg:{exitTitle:"Излизане от верификацията?",exitMessage:"Излизането ще прекрати процеса на верификация. Сигурни ли сте?",continueButton:"Продължи",exitButton:"Изход",ariaLabelModal:"Верификация Didit",ariaLabelClose:"Затваряне на верификацията"},bn:{exitTitle:"যাচাইকরণ থেকে বের হবেন?",exitMessage:"বের হলে আপনার যাচাইকরণ প্রক্রিয়া শেষ হয়ে যাবে। আপনি কি নিশ্চিত?",continueButton:"চালিয়ে যান",exitButton:"বের হন",ariaLabelModal:"Didit যাচাইকরণ",ariaLabelClose:"যাচাইকরণ বন্ধ করুন"},ca:{exitTitle:"Sortir de la verificaci\xf3?",exitMessage:"Sortir finalitzar\xe0 el proc\xe9s de verificaci\xf3. N'esteu segur?",continueButton:"Continua",exitButton:"Sortir",ariaLabelModal:"Verificaci\xf3 Didit",ariaLabelClose:"Tancar verificaci\xf3"},cnr:{exitTitle:"Izaći iz verifikacije?",exitMessage:"Izlaskom ćete prekinuti proces verifikacije. Jeste li sigurni?",continueButton:"Nastavi",exitButton:"Izađi",ariaLabelModal:"Didit verifikacija",ariaLabelClose:"Zatvori verifikaciju"},cs:{exitTitle:"Opustit ověřen\xed?",exitMessage:"Odchodem ukonč\xedte proces ověřen\xed. Jste si jisti?",continueButton:"Pokračovat",exitButton:"Odej\xedt",ariaLabelModal:"Ověřen\xed Didit",ariaLabelClose:"Zavř\xedt ověřen\xed"},da:{exitTitle:"Forlad verifikation?",exitMessage:"Hvis du forlader, afsluttes din verifikationsproces. Er du sikker?",continueButton:"Forts\xe6t",exitButton:"Forlad",ariaLabelModal:"Didit-verifikation",ariaLabelClose:"Luk verifikation"},de:{exitTitle:"Verifizierung verlassen?",exitMessage:"Das Verlassen beendet Ihren Verifizierungsprozess. Sind Sie sicher?",continueButton:"Fortfahren",exitButton:"Verlassen",ariaLabelModal:"Didit-Verifizierung",ariaLabelClose:"Verifizierung schlie\xdfen"},el:{exitTitle:"Έξοδος από την επαλήθευση;",exitMessage:"Η έξοδος θα τερματίσει τη διαδικασία επαλήθευσης. Είστε σίγουροι;",continueButton:"Συνέχεια",exitButton:"Έξοδος",ariaLabelModal:"Επαλήθευση Didit",ariaLabelClose:"Κλείσιμο επαλήθευσης"},en:d,es:{exitTitle:"\xbfSalir de la verificaci\xf3n?",exitMessage:"Salir terminar\xe1 tu proceso de verificaci\xf3n. \xbfEst\xe1s seguro?",continueButton:"Continuar",exitButton:"Salir",ariaLabelModal:"Verificaci\xf3n Didit",ariaLabelClose:"Cerrar verificaci\xf3n"},et:{exitTitle:"Lahkuda kinnitamisest?",exitMessage:"Lahkumine l\xf5petab teie kinnitamisprotsessi. Kas olete kindel?",continueButton:"J\xe4tka",exitButton:"Lahku",ariaLabelModal:"Didit kinnitus",ariaLabelClose:"Sulge kinnitus"},fa:{exitTitle:"خروج از تأیید هویت؟",exitMessage:"خروج باعث پایان فرآیند تأیید هویت شما می‌شود. آیا مطمئن هستید؟",continueButton:"ادامه",exitButton:"خروج",ariaLabelModal:"تأیید هویت Didit",ariaLabelClose:"بستن تأیید هویت"},fi:{exitTitle:"Poistu vahvistuksesta?",exitMessage:"Poistuminen p\xe4\xe4tt\xe4\xe4 vahvistusprosessisi. Oletko varma?",continueButton:"Jatka",exitButton:"Poistu",ariaLabelModal:"Didit-vahvistus",ariaLabelClose:"Sulje vahvistus"},fr:{exitTitle:"Quitter la v\xe9rification ?",exitMessage:"Quitter mettra fin \xe0 votre processus de v\xe9rification. \xcates-vous s\xfbr ?",continueButton:"Continuer",exitButton:"Quitter",ariaLabelModal:"V\xe9rification Didit",ariaLabelClose:"Fermer la v\xe9rification"},he:{exitTitle:"לצאת מהאימות?",exitMessage:"יציאה תסיים את תהליך האימות שלך. האם אתה בטוח?",continueButton:"המשך",exitButton:"יציאה",ariaLabelModal:"אימות Didit",ariaLabelClose:"סגירת אימות"},hi:{exitTitle:"सत्यापन से बाहर निकलें?",exitMessage:"बाहर निकलने से आपकी सत्यापन प्रक्रिया समाप्त हो जाएगी। क्या आप सुनिश्चित हैं?",continueButton:"जारी रखें",exitButton:"बाहर निकलें",ariaLabelModal:"Didit सत्यापन",ariaLabelClose:"सत्यापन बंद करें"},hr:{exitTitle:"Izaći iz verifikacije?",exitMessage:"Izlaskom ćete prekinuti proces verifikacije. Jeste li sigurni?",continueButton:"Nastavi",exitButton:"Izađi",ariaLabelModal:"Didit verifikacija",ariaLabelClose:"Zatvori verifikaciju"},hu:{exitTitle:"Kil\xe9p\xe9s az ellenőrz\xe9sből?",exitMessage:"A kil\xe9p\xe9s befejezi az ellenőrz\xe9si folyamatot. Biztos benne?",continueButton:"Folytat\xe1s",exitButton:"Kil\xe9p\xe9s",ariaLabelModal:"Didit ellenőrz\xe9s",ariaLabelClose:"Ellenőrz\xe9s bez\xe1r\xe1sa"},hy:{exitTitle:"Դուրս գա՞լ ստուգումից",exitMessage:"Դուրս գալը կավարտի ձեր ստուգման գործընթացը։ Համոզված ե՞ք?",continueButton:"Շարունակել",exitButton:"Դուրս գալ",ariaLabelModal:"Didit ստուգում",ariaLabelClose:"Փակել ստուգումը"},id:{exitTitle:"Keluar dari verifikasi?",exitMessage:"Keluar akan mengakhiri proses verifikasi Anda. Apakah Anda yakin?",continueButton:"Lanjutkan",exitButton:"Keluar",ariaLabelModal:"Verifikasi Didit",ariaLabelClose:"Tutup verifikasi"},it:{exitTitle:"Uscire dalla verifica?",exitMessage:"L'uscita terminer\xe0 il processo di verifica. Sei sicuro?",continueButton:"Continua",exitButton:"Esci",ariaLabelModal:"Verifica Didit",ariaLabelClose:"Chiudi verifica"},ja:{exitTitle:"認証を終了しますか？",exitMessage:"終了すると認証プロセスが中断されます。よろしいですか？",continueButton:"続ける",exitButton:"終了",ariaLabelModal:"Didit 認証",ariaLabelClose:"認証を閉じる"},ka:{exitTitle:"გამოსვლა შემოწმებიდან?",exitMessage:"გამოსვლა დაასრულებს თქვენს შემოწმების პროცესს. დარწმუნებული ხართ?",continueButton:"გაგრძელება",exitButton:"გამოსვლა",ariaLabelModal:"Didit შემოწმება",ariaLabelClose:"შემოწმების დახურვა"},ko:{exitTitle:"인증을 종료하시겠습니까?",exitMessage:"종료하면 인증 절차가 중단됩니다. 확실하십니까?",continueButton:"계속",exitButton:"종료",ariaLabelModal:"Didit 인증",ariaLabelClose:"인증 닫기"},lt:{exitTitle:"Išeiti iš patvirtinimo?",exitMessage:"Išėjimas nutrauks jūsų patvirtinimo procesą. Ar esate tikri?",continueButton:"Tęsti",exitButton:"Išeiti",ariaLabelModal:"Didit patvirtinimas",ariaLabelClose:"Uždaryti patvirtinimą"},lv:{exitTitle:"Iziet no verifikācijas?",exitMessage:"Iziešana pārtrauks jūsu verifikācijas procesu. Vai esat pārliecināts?",continueButton:"Turpināt",exitButton:"Iziet",ariaLabelModal:"Didit verifikācija",ariaLabelClose:"Aizvērt verifikāciju"},mk:{exitTitle:"Излези од верификацијата?",exitMessage:"Излегувањето ќе го прекине процесот на верификација. Дали сте сигурни?",continueButton:"Продолжи",exitButton:"Излези",ariaLabelModal:"Верификација Didit",ariaLabelClose:"Затвори верификација"},ms:{exitTitle:"Keluar dari pengesahan?",exitMessage:"Keluar akan menamatkan proses pengesahan anda. Adakah anda pasti?",continueButton:"Teruskan",exitButton:"Keluar",ariaLabelModal:"Pengesahan Didit",ariaLabelClose:"Tutup pengesahan"},nl:{exitTitle:"Verificatie verlaten?",exitMessage:"Verlaten be\xebindigt uw verificatieproces. Weet u het zeker?",continueButton:"Doorgaan",exitButton:"Verlaten",ariaLabelModal:"Didit-verificatie",ariaLabelClose:"Verificatie sluiten"},no:{exitTitle:"Forlat verifisering?",exitMessage:"\xc5 forlate vil avslutte verifiseringsprosessen. Er du sikker?",continueButton:"Fortsett",exitButton:"Forlat",ariaLabelModal:"Didit-verifisering",ariaLabelClose:"Lukk verifisering"},pl:{exitTitle:"Czy wyjść z weryfikacji?",exitMessage:"Wyjście zakończy proces weryfikacji. Czy na pewno?",continueButton:"Kontynuuj",exitButton:"Wyjdź",ariaLabelModal:"Weryfikacja Didit",ariaLabelClose:"Zamknij weryfikację"},"pt-BR":{exitTitle:"Sair da verifica\xe7\xe3o?",exitMessage:"Sair encerrar\xe1 seu processo de verifica\xe7\xe3o. Tem certeza?",continueButton:"Continuar",exitButton:"Sair",ariaLabelModal:"Verifica\xe7\xe3o Didit",ariaLabelClose:"Fechar verifica\xe7\xe3o"},pt:{exitTitle:"Sair da verifica\xe7\xe3o?",exitMessage:"Sair terminar\xe1 o seu processo de verifica\xe7\xe3o. Tem a certeza?",continueButton:"Continuar",exitButton:"Sair",ariaLabelModal:"Verifica\xe7\xe3o Didit",ariaLabelClose:"Fechar verifica\xe7\xe3o"},ro:{exitTitle:"Ieși din verificare?",exitMessage:"Ieșirea va \xeencheia procesul de verificare. Ești sigur?",continueButton:"Continuă",exitButton:"Ieși",ariaLabelModal:"Verificare Didit",ariaLabelClose:"\xcenchide verificarea"},ru:{exitTitle:"Выйти из верификации?",exitMessage:"Выход завершит процесс верификации. Вы уверены?",continueButton:"Продолжить",exitButton:"Выйти",ariaLabelModal:"Верификация Didit",ariaLabelClose:"Закрыть верификацию"},sk:{exitTitle:"Opustiť overenie?",exitMessage:"Odchodom ukonč\xedte proces overenia. Ste si ist\xed?",continueButton:"Pokračovať",exitButton:"Od\xedsť",ariaLabelModal:"Overenie Didit",ariaLabelClose:"Zavrieť overenie"},sl:{exitTitle:"Zapustiti preverjanje?",exitMessage:"Izhod bo prekinil postopek preverjanja. Ali ste prepričani?",continueButton:"Nadaljuj",exitButton:"Izhod",ariaLabelModal:"Preverjanje Didit",ariaLabelClose:"Zapri preverjanje"},so:{exitTitle:"Ka baxdo xaqiijinta?",exitMessage:"Ka bixitaanku wuxuu dhammayn doonaa habka xaqiijintaada. Ma hubtaa?",continueButton:"Sii wad",exitButton:"Ka bax",ariaLabelModal:"Xaqiijinta Didit",ariaLabelClose:"Xir xaqiijinta"},sr:{exitTitle:"Изаћи из верификације?",exitMessage:"Изласком ћете прекинути процес верификације. Да ли сте сигурни?",continueButton:"Настави",exitButton:"Изађи",ariaLabelModal:"Верификација Didit",ariaLabelClose:"Затвори верификацију"},sv:{exitTitle:"L\xe4mna verifiering?",exitMessage:"Att l\xe4mna avslutar din verifieringsprocess. \xc4r du s\xe4ker?",continueButton:"Forts\xe4tt",exitButton:"L\xe4mna",ariaLabelModal:"Didit-verifiering",ariaLabelClose:"St\xe4ng verifiering"},th:{exitTitle:"ออกจากการยืนยันตัวตน?",exitMessage:"การออกจะสิ้นสุดกระบวนการยืนยันตัวตนของคุณ คุณแน่ใจหรือไม่?",continueButton:"ดำเนินการต่อ",exitButton:"ออก",ariaLabelModal:"การยืนยันตัวตน Didit",ariaLabelClose:"ปิดการยืนยันตัวตน"},tr:{exitTitle:"Doğrulamadan \xe7ıkmak istiyor musunuz?",exitMessage:"\xc7ıkış, doğrulama s\xfcrecinizi sonlandıracak. Emin misiniz?",continueButton:"Devam et",exitButton:"\xc7ıkış",ariaLabelModal:"Didit doğrulama",ariaLabelClose:"Doğrulamayı kapat"},uk:{exitTitle:"Вийти з верифікації?",exitMessage:"Вихід завершить процес верифікації. Ви впевнені?",continueButton:"Продовжити",exitButton:"Вийти",ariaLabelModal:"Верифікація Didit",ariaLabelClose:"Закрити верифікацію"},uz:{exitTitle:"Tekshiruvdan chiqasizmi?",exitMessage:"Chiqish tekshiruv jarayonini tugatadi. Ishonchingiz komilmi?",continueButton:"Davom etish",exitButton:"Chiqish",ariaLabelModal:"Didit tekshiruvi",ariaLabelClose:"Tekshiruvni yopish"},vi:{exitTitle:"Tho\xe1t khỏi x\xe1c minh?",exitMessage:"Tho\xe1t sẽ kết th\xfac qu\xe1 tr\xecnh x\xe1c minh của bạn. Bạn c\xf3 chắc kh\xf4ng?",continueButton:"Tiếp tục",exitButton:"Tho\xe1t",ariaLabelModal:"X\xe1c minh Didit",ariaLabelClose:"Đ\xf3ng x\xe1c minh"},"zh-CN":{exitTitle:"退出验证？",exitMessage:"退出将结束您的验证流程。确定要退出吗？",continueButton:"继续",exitButton:"退出",ariaLabelModal:"Didit 验证",ariaLabelClose:"关闭验证"},"zh-TW":{exitTitle:"退出驗證？",exitMessage:"退出將結束您的驗證流程。確定要退出嗎？",continueButton:"繼續",exitButton:"退出",ariaLabelModal:"Didit 驗證",ariaLabelClose:"關閉驗證"},zh:{exitTitle:"退出验证？",exitMessage:"退出将结束您的验证流程。确定要退出吗？",continueButton:"继续",exitButton:"退出",ariaLabelModal:"Didit 验证",ariaLabelClose:"关闭验证"}};class u{constructor(e,i){this.state={isOpen:!1,isLoading:!0,showConfirmation:!1},this.overlay=null,this.container=null,this.iframe=null,this.loadingEl=null,this.confirmOverlay=null,this.boundHandleMessage=null,this.boundHandleKeydown=null,this.embedded=!1,this.embeddedContainer=null,this.language="en",this.modalId=`didit-modal-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,this.config={zIndex:e?.zIndex??a.zIndex,showCloseButton:e?.showCloseButton??a.showCloseButton,showExitConfirmation:e?.showExitConfirmation??a.showExitConfirmation},this.callbacks=i,this.containerElement=e?.containerElement??document.body,this.embedded=e?.embedded??!1,this.embedded&&e?.embeddedContainerId&&(this.embeddedContainer=document.getElementById(e.embeddedContainerId))}injectStyles(){let e="didit-sdk-styles";if(document.getElementById(e))return;let i=document.createElement("style");i.id=e,i.textContent=`
      .${n.overlay} {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: ${this.config.zIndex};
        justify-content: center;
        align-items: center;
        padding: 1rem;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }

      .${n.overlay}.active {
        display: flex;
        opacity: 1;
      }

      .${n.container} {
        position: relative;
        width: 100%;
        max-width: 500px;
        max-height: 90dvh;
        border-radius: 16px;
        overflow: hidden;
        background: transparent;
      }

      .${n.overlay}.active .${n.container} {
        transform: scale(1);
      }

      .${n.iframe} {
        width: 100%;
        height: 700px;
        border: none;
        display: block;
      }

      .${n.closeButton} {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 24px;
        height: 24px;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        z-index: 10;
        outline: none;
      }

      .${n.closeButton}:hover,
      .${n.closeButton}:focus {
        background: transparent;
        opacity: 0.5;
      }

      .${n.closeButton} svg {
        stroke: #666;
        stroke-width: 2;
        stroke-linecap: round;
      }

      .${n.loading} {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fafafa;
        z-index: 5;
      }

      .${n.loading}.hidden {
        display: none;
      }

      .${n.loading} svg {
        width: 4rem;
        height: 4rem;
        animation: didit-spin 1s linear infinite;
      }

      .${n.loading} circle {
        stroke: #e5e5e5;
        stroke-width: 2.5;
        fill: none;
      }

      .${n.loading} path {
        stroke: #525252;
        stroke-width: 2.5;
        stroke-linecap: round;
        fill: none;
      }

      @keyframes didit-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .${n.confirmOverlay} {
        display: none;
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 20;
        justify-content: center;
        align-items: center;
        opacity: 0;
        transition: opacity 0.15s ease-out;
      }

      .${n.confirmOverlay}.active {
        display: flex;
        opacity: 1;
      }

      .${n.confirmBox} {
        background: #fff;
        border-radius: 12px;
        padding: 1.5rem;
        text-align: center;
        max-width: 300px;
        margin: 1rem;
        transform: scale(0.95);
        transition: transform 0.15s ease-out;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      }

      .${n.confirmOverlay}.active .${n.confirmBox} {
        transform: scale(1);
      }

      .${n.confirmBox} h3 {
        color: #1a1a2e;
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        font-weight: 600;
      }

      .${n.confirmBox} p {
        color: #666;
        font-size: 0.875rem;
        margin: 0 0 1.25rem 0;
        line-height: 1.5;
      }

      .didit-confirm-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
      }

      .didit-confirm-actions button {
        background: #2563eb;
        color: #fff;
        border: none;
        padding: 0.625rem 1.25rem;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .didit-confirm-actions button:hover {
        background: #1d4ed8;
      }

      .didit-confirm-actions span {
        color: #666;
        font-size: 0.875rem;
        cursor: pointer;
        padding: 0.625rem;
        transition: color 0.15s ease;
      }

      .didit-confirm-actions span:hover {
        color: #1a1a2e;
      }

      @media (max-width: 540px) {
        .${n.overlay} {
          padding: 0;
        }

        .${n.container} {
          max-width: 100%;
          max-height: 100dvh;
          border-radius: 0;
        }

        .${n.iframe} {
          height: 100dvh;
        }
      }

      .${n.embedded} {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .${n.embedded} .${n.iframe} {
        width: 100%;
        height: 100%;
      }

      .${n.embedded} .${n.loading} {
        border-radius: 0;
      }
    `,document.head.appendChild(i)}createDOM(){if(this.injectStyles(),this.embedded&&this.embeddedContainer)return void this.createEmbeddedDOM();let e=c[this.language]??d;if(this.overlay=document.createElement("div"),this.overlay.id=this.modalId,this.overlay.className=n.overlay,this.overlay.setAttribute("role","dialog"),this.overlay.setAttribute("aria-modal","true"),this.overlay.setAttribute("aria-label",e.ariaLabelModal),this.container=document.createElement("div"),this.container.className=n.container,this.loadingEl=document.createElement("div"),this.loadingEl.className=n.loading,this.loadingEl.innerHTML=`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    `,this.config.showCloseButton){let i=document.createElement("button");i.className=n.closeButton,i.setAttribute("aria-label",e.ariaLabelClose),i.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 14 14">
          <line x1="1" y1="1" x2="13" y2="13" />
          <line x1="13" y1="1" x2="1" y2="13" />
        </svg>
      `,i.addEventListener("click",()=>this.handleCloseRequest()),this.container.appendChild(i)}this.iframe=document.createElement("iframe"),this.iframe.className=n.iframe,this.iframe.setAttribute("allow","camera; microphone; fullscreen; autoplay; encrypted-media; geolocation"),this.iframe.setAttribute("title",e.ariaLabelModal),this.iframe.addEventListener("load",()=>this.handleIframeLoad()),this.confirmOverlay=document.createElement("div"),this.confirmOverlay.className=n.confirmOverlay,this.confirmOverlay.innerHTML=`
      <div class="${n.confirmBox}">
        <h3>${e.exitTitle}</h3>
        <p>${e.exitMessage}</p>
        <div class="didit-confirm-actions">
          <button type="button" data-action="continue">${e.continueButton}</button>
          <span data-action="exit">${e.exitButton}</span>
        </div>
      </div>
    `,this.confirmOverlay.querySelector('[data-action="continue"]')?.addEventListener("click",()=>{this.hideConfirmation()}),this.confirmOverlay.querySelector('[data-action="exit"]')?.addEventListener("click",()=>{this.confirmExit()}),this.container.appendChild(this.loadingEl),this.container.appendChild(this.iframe),this.container.appendChild(this.confirmOverlay),this.overlay.appendChild(this.container),this.overlay.addEventListener("click",e=>{e.target===this.overlay&&this.handleCloseRequest()}),this.containerElement.appendChild(this.overlay)}createEmbeddedDOM(){this.embeddedContainer&&(this.container=document.createElement("div"),this.container.id=this.modalId,this.container.className=n.embedded,this.loadingEl=document.createElement("div"),this.loadingEl.className=n.loading,this.loadingEl.innerHTML=`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    `,this.iframe=document.createElement("iframe"),this.iframe.className=n.iframe,this.iframe.setAttribute("allow","camera; microphone; fullscreen; autoplay; encrypted-media; geolocation"),this.iframe.setAttribute("title",(c[this.language]??d).ariaLabelModal),this.iframe.addEventListener("load",()=>this.handleIframeLoad()),this.container.appendChild(this.loadingEl),this.container.appendChild(this.iframe),this.embeddedContainer.appendChild(this.container))}setupEventListeners(){this.boundHandleMessage=this.handleMessage.bind(this),window.addEventListener("message",this.boundHandleMessage),this.boundHandleKeydown=this.handleKeydown.bind(this),document.addEventListener("keydown",this.boundHandleKeydown)}removeEventListeners(){this.boundHandleMessage&&(window.removeEventListener("message",this.boundHandleMessage),this.boundHandleMessage=null),this.boundHandleKeydown&&(document.removeEventListener("keydown",this.boundHandleKeydown),this.boundHandleKeydown=null)}handleMessage(e){let i;if(function(e){try{return new URL(e).hostname.endsWith(".didit.me")}catch{return!1}}(e.origin)){r.log("Received postMessage:",e.data);try{i="string"==typeof e.data?JSON.parse(e.data):e.data}catch{r.warn("Failed to parse postMessage:",e.data);return}if("didit:close_request"===i.type)return void this.handleCloseRequest();this.callbacks.onMessage(i)}}handleKeydown(e){this.state.isOpen&&"Escape"===e.key&&(e.preventDefault(),this.state.showConfirmation?this.hideConfirmation():this.handleCloseRequest())}handleIframeLoad(){this.iframe?.src&&"about:blank"!==this.iframe.src&&(this.state.isLoading=!1,this.loadingEl?.classList.add("hidden"),this.callbacks.onIframeLoad())}handleCloseRequest(){this.config.showExitConfirmation?this.showConfirmation():this.callbacks.onCloseConfirmed()}showConfirmation(){this.state.showConfirmation=!0,this.confirmOverlay?.classList.add("active"),this.callbacks.onClose()}hideConfirmation(){this.state.showConfirmation=!1,this.confirmOverlay?.classList.remove("active")}confirmExit(){this.hideConfirmation(),this.callbacks.onCloseConfirmed()}open(e){this.language=function(e){try{let{pathname:i}=new URL(e),t=i.split("/").filter(Boolean)[0];if(t&&s.includes(t))return t}catch{}let i=navigator.language;if(s.includes(i))return i;let t=i.split("-")[0];return s.includes(t)?t:"en"}(e),this.overlay||this.container||(this.createDOM(),this.setupEventListeners()),r.log("Opening with URL:",e),this.state.isLoading=!0,this.state.showConfirmation=!1,this.loadingEl?.classList.remove("hidden"),this.confirmOverlay?.classList.remove("active"),this.iframe&&(this.iframe.src=e),this.state.isOpen=!0,this.embedded||(this.overlay?.classList.add("active"),document.body.style.overflow="hidden")}close(){r.log("Closing"),this.state.isOpen=!1,this.state.isLoading=!0,this.state.showConfirmation=!1,this.iframe&&(this.iframe.src="about:blank"),this.embedded||(this.overlay?.classList.remove("active"),document.body.style.overflow="")}destroy(){r.log("Destroying"),this.close(),this.removeEventListeners(),this.embedded&&this.container&&this.container.parentNode?this.container.parentNode.removeChild(this.container):this.overlay&&this.overlay.parentNode&&this.overlay.parentNode.removeChild(this.overlay),this.overlay=null,this.container=null,this.iframe=null,this.loadingEl=null,this.confirmOverlay=null}isOpen(){return this.state.isOpen}isLoading(){return this.state.isLoading}}class h{static get shared(){return h._instance||(h._instance=new h),h._instance}static reset(){h._instance&&(h._instance.destroy(),h._instance=null)}get state(){return this._state}get configuration(){return this._configuration}get isPresented(){return this._modal?.isOpen()??!1}get errorMessage(){return this._errorMessage}constructor(){this._state="idle",this._modal=null,r.log("DiditSdk initialized")}async startVerification(e){let i=e.configuration;this._configuration=i,r.isEnabled=i?.loggingEnabled??a.loggingEnabled,r.log("Starting verification with options:",e),this._modal&&(this._modal.destroy(),this._modal=null),this._modal=new u(i,{onClose:()=>this.handleModalClose(),onCloseConfirmed:()=>this.handleModalCloseConfirmed(),onMessage:e=>this.handleVerificationEvent(e),onIframeLoad:()=>this.handleIframeLoad()});try{let{url:i}=e;if(!i||"string"!=typeof i)throw Error("Invalid options: url is required");this._url=i,this.setState("loading"),this.emitInternalEvent("didit:started",{}),this._modal?.open(this._url)}catch(e){this.handleError(e)}}close(){r.log("Closing verification programmatically"),this.handleModalCloseConfirmed()}destroy(){r.log("Destroying SDK instance"),this._modal?.destroy(),this._modal=null,this.reset()}handleModalClose(){r.log("Modal close requested")}handleModalCloseConfirmed(){r.log("Modal close confirmed");let e=this.buildSessionData();this._modal?.close(),this.reset(),this.onComplete?.({type:"cancelled",session:e})}handleIframeLoad(){r.log("Iframe loaded")}emitInternalEvent(e,i){let t={type:e,data:i,timestamp:Date.now()};r.log("Emitting internal event:",t),this.onEvent?.(t)}handleVerificationEvent(e){switch(r.log("Verification event:",e),this.onEvent?.(e),e.type){case"didit:ready":r.log("Verification iframe ready");break;case"didit:started":r.log("User started verification");break;case"didit:step_started":r.log("Step started:",e.data?.step);break;case"didit:step_completed":r.log("Step completed:",e.data?.step,"-> next:",e.data?.nextStep);break;case"didit:media_started":r.log("Media started:",e.data?.mediaType,"for step:",e.data?.step);break;case"didit:media_captured":r.log("Media captured for step:",e.data?.step,"isAuto:",e.data?.isAuto);break;case"didit:document_selected":r.log("Document selected:",e.data?.documentType,"country:",e.data?.country);break;case"didit:verification_submitted":r.log("Verification submitted for step:",e.data?.step);break;case"didit:code_sent":r.log("Code sent via:",e.data?.channel,"codeSize:",e.data?.codeSize);break;case"didit:code_verified":r.log("Code verified via:",e.data?.channel);break;case"didit:status_updated":r.log("Status updated:",e.data?.status,"step:",e.data?.step);break;case"didit:completed":this.handleVerificationCompleted(e);break;case"didit:cancelled":this.handleVerificationCancelled(e);break;case"didit:error":this.handleVerificationError(e);break;case"didit:step_changed":r.log("Step changed:",e.data?.step)}}handleVerificationCompleted(e){r.log("Verification completed:",e.data);let i=this.buildSessionData(e.data);this._configuration?.closeModalOnComplete&&(this._modal?.close(),this.reset()),this.onComplete?.({type:"completed",session:i})}handleVerificationCancelled(e){r.log("Verification cancelled:",e.data);let i=this.buildSessionData(e.data);this._modal?.close(),this.reset(),this.onComplete?.({type:"cancelled",session:i})}handleVerificationError(e){r.log("Verification error:",e.data)}handleError(e){let i;r.error("SDK error:",e),i=e instanceof Error?l("unknown",e.message):l("unknown","An unknown error occurred"),this._errorMessage=i.message,this.setState("error"),this._modal?.close(),this.reset();this.onComplete?.({type:"failed",error:i})}setState(e){let i=this._state;this._state=e,i!==e&&(r.log("State changed:",i,"->",e),this.onStateChange?.(e,this._errorMessage))}reset(){this._state="idle",this._sessionId=void 0,this._url=void 0,this._errorMessage=void 0,this._configuration=void 0}buildSessionData(e){let i=e?.sessionId||this._sessionId;if(i)return{sessionId:i,status:e?.status||"Pending"}}}h._instance=null}}]);