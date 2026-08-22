"use strict";exports.id=9983,exports.ids=[9983],exports.modules={59983:(a,b,c)=>{c.r(b),c.d(b,{DiditSdk:()=>m,SDK_VERSION:()=>f,default:()=>m});let d={zIndex:9999,showCloseButton:!0,showExitConfirmation:!0,loggingEnabled:!1},e={overlay:"didit-modal-overlay",container:"didit-modal-container",iframe:"didit-verification-iframe",closeButton:"didit-close-button",loading:"didit-loading",confirmOverlay:"didit-confirm-overlay",confirmBox:"didit-confirm-box",embedded:"didit-embedded"},f="0.1.8",g=["ar","bg","bn","ca","cnr","cs","da","de","el","en","es","et","fa","fi","fr","he","hi","hr","hu","hy","id","it","ja","ka","ko","lt","lv","mk","ms","nl","no","pl","pt-BR","pt","ro","ru","sk","sl","so","sr","sv","th","tr","uk","uz","vi","zh-CN","zh-TW","zh"];class h{static get isEnabled(){return this._enabled}static set isEnabled(a){this._enabled=a}static log(...a){this._enabled&&console.log("[DiditSDK]",...a)}static warn(...a){this._enabled&&console.warn("[DiditSDK]",...a)}static error(...a){this._enabled&&console.error("[DiditSDK]",...a)}}function i(a,b){return{type:a,message:b||({sessionExpired:"Your verification session has expired.",networkError:"A network error occurred. Please try again.",cameraAccessDenied:"Camera access is required for verification.",unknown:b||"An unknown error occurred."})[a]}}h._enabled=!1;let j={exitTitle:"Exit verification?",exitMessage:"Exiting will end your verification process. Are you sure?",continueButton:"Continue",exitButton:"Exit",ariaLabelModal:"Didit Verification",ariaLabelClose:"Close verification"},k={ar:{exitTitle:"الخروج من التحقق؟",exitMessage:"سيؤدي الخروج إلى إنهاء عملية التحقق الخاصة بك. هل أنت متأكد؟",continueButton:"متابعة",exitButton:"خروج",ariaLabelModal:"التحقق من Didit",ariaLabelClose:"إغلاق التحقق"},bg:{exitTitle:"Излизане от верификацията?",exitMessage:"Излизането ще прекрати процеса на верификация. Сигурни ли сте?",continueButton:"Продължи",exitButton:"Изход",ariaLabelModal:"Верификация Didit",ariaLabelClose:"Затваряне на верификацията"},bn:{exitTitle:"যাচাইকরণ থেকে বের হবেন?",exitMessage:"বের হলে আপনার যাচাইকরণ প্রক্রিয়া শেষ হয়ে যাবে। আপনি কি নিশ্চিত?",continueButton:"চালিয়ে যান",exitButton:"বের হন",ariaLabelModal:"Didit যাচাইকরণ",ariaLabelClose:"যাচাইকরণ বন্ধ করুন"},ca:{exitTitle:"Sortir de la verificaci\xf3?",exitMessage:"Sortir finalitzar\xe0 el proc\xe9s de verificaci\xf3. N'esteu segur?",continueButton:"Continua",exitButton:"Sortir",ariaLabelModal:"Verificaci\xf3 Didit",ariaLabelClose:"Tancar verificaci\xf3"},cnr:{exitTitle:"Izaći iz verifikacije?",exitMessage:"Izlaskom ćete prekinuti proces verifikacije. Jeste li sigurni?",continueButton:"Nastavi",exitButton:"Izađi",ariaLabelModal:"Didit verifikacija",ariaLabelClose:"Zatvori verifikaciju"},cs:{exitTitle:"Opustit ověřen\xed?",exitMessage:"Odchodem ukonč\xedte proces ověřen\xed. Jste si jisti?",continueButton:"Pokračovat",exitButton:"Odej\xedt",ariaLabelModal:"Ověřen\xed Didit",ariaLabelClose:"Zavř\xedt ověřen\xed"},da:{exitTitle:"Forlad verifikation?",exitMessage:"Hvis du forlader, afsluttes din verifikationsproces. Er du sikker?",continueButton:"Forts\xe6t",exitButton:"Forlad",ariaLabelModal:"Didit-verifikation",ariaLabelClose:"Luk verifikation"},de:{exitTitle:"Verifizierung verlassen?",exitMessage:"Das Verlassen beendet Ihren Verifizierungsprozess. Sind Sie sicher?",continueButton:"Fortfahren",exitButton:"Verlassen",ariaLabelModal:"Didit-Verifizierung",ariaLabelClose:"Verifizierung schlie\xdfen"},el:{exitTitle:"Έξοδος από την επαλήθευση;",exitMessage:"Η έξοδος θα τερματίσει τη διαδικασία επαλήθευσης. Είστε σίγουροι;",continueButton:"Συνέχεια",exitButton:"Έξοδος",ariaLabelModal:"Επαλήθευση Didit",ariaLabelClose:"Κλείσιμο επαλήθευσης"},en:j,es:{exitTitle:"\xbfSalir de la verificaci\xf3n?",exitMessage:"Salir terminar\xe1 tu proceso de verificaci\xf3n. \xbfEst\xe1s seguro?",continueButton:"Continuar",exitButton:"Salir",ariaLabelModal:"Verificaci\xf3n Didit",ariaLabelClose:"Cerrar verificaci\xf3n"},et:{exitTitle:"Lahkuda kinnitamisest?",exitMessage:"Lahkumine l\xf5petab teie kinnitamisprotsessi. Kas olete kindel?",continueButton:"J\xe4tka",exitButton:"Lahku",ariaLabelModal:"Didit kinnitus",ariaLabelClose:"Sulge kinnitus"},fa:{exitTitle:"خروج از تأیید هویت؟",exitMessage:"خروج باعث پایان فرآیند تأیید هویت شما می‌شود. آیا مطمئن هستید؟",continueButton:"ادامه",exitButton:"خروج",ariaLabelModal:"تأیید هویت Didit",ariaLabelClose:"بستن تأیید هویت"},fi:{exitTitle:"Poistu vahvistuksesta?",exitMessage:"Poistuminen p\xe4\xe4tt\xe4\xe4 vahvistusprosessisi. Oletko varma?",continueButton:"Jatka",exitButton:"Poistu",ariaLabelModal:"Didit-vahvistus",ariaLabelClose:"Sulje vahvistus"},fr:{exitTitle:"Quitter la v\xe9rification ?",exitMessage:"Quitter mettra fin \xe0 votre processus de v\xe9rification. \xcates-vous s\xfbr ?",continueButton:"Continuer",exitButton:"Quitter",ariaLabelModal:"V\xe9rification Didit",ariaLabelClose:"Fermer la v\xe9rification"},he:{exitTitle:"לצאת מהאימות?",exitMessage:"יציאה תסיים את תהליך האימות שלך. האם אתה בטוח?",continueButton:"המשך",exitButton:"יציאה",ariaLabelModal:"אימות Didit",ariaLabelClose:"סגירת אימות"},hi:{exitTitle:"सत्यापन से बाहर निकलें?",exitMessage:"बाहर निकलने से आपकी सत्यापन प्रक्रिया समाप्त हो जाएगी। क्या आप सुनिश्चित हैं?",continueButton:"जारी रखें",exitButton:"बाहर निकलें",ariaLabelModal:"Didit सत्यापन",ariaLabelClose:"सत्यापन बंद करें"},hr:{exitTitle:"Izaći iz verifikacije?",exitMessage:"Izlaskom ćete prekinuti proces verifikacije. Jeste li sigurni?",continueButton:"Nastavi",exitButton:"Izađi",ariaLabelModal:"Didit verifikacija",ariaLabelClose:"Zatvori verifikaciju"},hu:{exitTitle:"Kil\xe9p\xe9s az ellenőrz\xe9sből?",exitMessage:"A kil\xe9p\xe9s befejezi az ellenőrz\xe9si folyamatot. Biztos benne?",continueButton:"Folytat\xe1s",exitButton:"Kil\xe9p\xe9s",ariaLabelModal:"Didit ellenőrz\xe9s",ariaLabelClose:"Ellenőrz\xe9s bez\xe1r\xe1sa"},hy:{exitTitle:"Դուրս գա՞լ ստուգումից",exitMessage:"Դուրս գալը կավարտի ձեր ստուգման գործընթացը։ Համոզված ե՞ք?",continueButton:"Շարունակել",exitButton:"Դուրս գալ",ariaLabelModal:"Didit ստուգում",ariaLabelClose:"Փակել ստուգումը"},id:{exitTitle:"Keluar dari verifikasi?",exitMessage:"Keluar akan mengakhiri proses verifikasi Anda. Apakah Anda yakin?",continueButton:"Lanjutkan",exitButton:"Keluar",ariaLabelModal:"Verifikasi Didit",ariaLabelClose:"Tutup verifikasi"},it:{exitTitle:"Uscire dalla verifica?",exitMessage:"L'uscita terminer\xe0 il processo di verifica. Sei sicuro?",continueButton:"Continua",exitButton:"Esci",ariaLabelModal:"Verifica Didit",ariaLabelClose:"Chiudi verifica"},ja:{exitTitle:"認証を終了しますか？",exitMessage:"終了すると認証プロセスが中断されます。よろしいですか？",continueButton:"続ける",exitButton:"終了",ariaLabelModal:"Didit 認証",ariaLabelClose:"認証を閉じる"},ka:{exitTitle:"გამოსვლა შემოწმებიდან?",exitMessage:"გამოსვლა დაასრულებს თქვენს შემოწმების პროცესს. დარწმუნებული ხართ?",continueButton:"გაგრძელება",exitButton:"გამოსვლა",ariaLabelModal:"Didit შემოწმება",ariaLabelClose:"შემოწმების დახურვა"},ko:{exitTitle:"인증을 종료하시겠습니까?",exitMessage:"종료하면 인증 절차가 중단됩니다. 확실하십니까?",continueButton:"계속",exitButton:"종료",ariaLabelModal:"Didit 인증",ariaLabelClose:"인증 닫기"},lt:{exitTitle:"Išeiti iš patvirtinimo?",exitMessage:"Išėjimas nutrauks jūsų patvirtinimo procesą. Ar esate tikri?",continueButton:"Tęsti",exitButton:"Išeiti",ariaLabelModal:"Didit patvirtinimas",ariaLabelClose:"Uždaryti patvirtinimą"},lv:{exitTitle:"Iziet no verifikācijas?",exitMessage:"Iziešana pārtrauks jūsu verifikācijas procesu. Vai esat pārliecināts?",continueButton:"Turpināt",exitButton:"Iziet",ariaLabelModal:"Didit verifikācija",ariaLabelClose:"Aizvērt verifikāciju"},mk:{exitTitle:"Излези од верификацијата?",exitMessage:"Излегувањето ќе го прекине процесот на верификација. Дали сте сигурни?",continueButton:"Продолжи",exitButton:"Излези",ariaLabelModal:"Верификација Didit",ariaLabelClose:"Затвори верификација"},ms:{exitTitle:"Keluar dari pengesahan?",exitMessage:"Keluar akan menamatkan proses pengesahan anda. Adakah anda pasti?",continueButton:"Teruskan",exitButton:"Keluar",ariaLabelModal:"Pengesahan Didit",ariaLabelClose:"Tutup pengesahan"},nl:{exitTitle:"Verificatie verlaten?",exitMessage:"Verlaten be\xebindigt uw verificatieproces. Weet u het zeker?",continueButton:"Doorgaan",exitButton:"Verlaten",ariaLabelModal:"Didit-verificatie",ariaLabelClose:"Verificatie sluiten"},no:{exitTitle:"Forlat verifisering?",exitMessage:"\xc5 forlate vil avslutte verifiseringsprosessen. Er du sikker?",continueButton:"Fortsett",exitButton:"Forlat",ariaLabelModal:"Didit-verifisering",ariaLabelClose:"Lukk verifisering"},pl:{exitTitle:"Czy wyjść z weryfikacji?",exitMessage:"Wyjście zakończy proces weryfikacji. Czy na pewno?",continueButton:"Kontynuuj",exitButton:"Wyjdź",ariaLabelModal:"Weryfikacja Didit",ariaLabelClose:"Zamknij weryfikację"},"pt-BR":{exitTitle:"Sair da verifica\xe7\xe3o?",exitMessage:"Sair encerrar\xe1 seu processo de verifica\xe7\xe3o. Tem certeza?",continueButton:"Continuar",exitButton:"Sair",ariaLabelModal:"Verifica\xe7\xe3o Didit",ariaLabelClose:"Fechar verifica\xe7\xe3o"},pt:{exitTitle:"Sair da verifica\xe7\xe3o?",exitMessage:"Sair terminar\xe1 o seu processo de verifica\xe7\xe3o. Tem a certeza?",continueButton:"Continuar",exitButton:"Sair",ariaLabelModal:"Verifica\xe7\xe3o Didit",ariaLabelClose:"Fechar verifica\xe7\xe3o"},ro:{exitTitle:"Ieși din verificare?",exitMessage:"Ieșirea va \xeencheia procesul de verificare. Ești sigur?",continueButton:"Continuă",exitButton:"Ieși",ariaLabelModal:"Verificare Didit",ariaLabelClose:"\xcenchide verificarea"},ru:{exitTitle:"Выйти из верификации?",exitMessage:"Выход завершит процесс верификации. Вы уверены?",continueButton:"Продолжить",exitButton:"Выйти",ariaLabelModal:"Верификация Didit",ariaLabelClose:"Закрыть верификацию"},sk:{exitTitle:"Opustiť overenie?",exitMessage:"Odchodom ukonč\xedte proces overenia. Ste si ist\xed?",continueButton:"Pokračovať",exitButton:"Od\xedsť",ariaLabelModal:"Overenie Didit",ariaLabelClose:"Zavrieť overenie"},sl:{exitTitle:"Zapustiti preverjanje?",exitMessage:"Izhod bo prekinil postopek preverjanja. Ali ste prepričani?",continueButton:"Nadaljuj",exitButton:"Izhod",ariaLabelModal:"Preverjanje Didit",ariaLabelClose:"Zapri preverjanje"},so:{exitTitle:"Ka baxdo xaqiijinta?",exitMessage:"Ka bixitaanku wuxuu dhammayn doonaa habka xaqiijintaada. Ma hubtaa?",continueButton:"Sii wad",exitButton:"Ka bax",ariaLabelModal:"Xaqiijinta Didit",ariaLabelClose:"Xir xaqiijinta"},sr:{exitTitle:"Изаћи из верификације?",exitMessage:"Изласком ћете прекинути процес верификације. Да ли сте сигурни?",continueButton:"Настави",exitButton:"Изађи",ariaLabelModal:"Верификација Didit",ariaLabelClose:"Затвори верификацију"},sv:{exitTitle:"L\xe4mna verifiering?",exitMessage:"Att l\xe4mna avslutar din verifieringsprocess. \xc4r du s\xe4ker?",continueButton:"Forts\xe4tt",exitButton:"L\xe4mna",ariaLabelModal:"Didit-verifiering",ariaLabelClose:"St\xe4ng verifiering"},th:{exitTitle:"ออกจากการยืนยันตัวตน?",exitMessage:"การออกจะสิ้นสุดกระบวนการยืนยันตัวตนของคุณ คุณแน่ใจหรือไม่?",continueButton:"ดำเนินการต่อ",exitButton:"ออก",ariaLabelModal:"การยืนยันตัวตน Didit",ariaLabelClose:"ปิดการยืนยันตัวตน"},tr:{exitTitle:"Doğrulamadan \xe7ıkmak istiyor musunuz?",exitMessage:"\xc7ıkış, doğrulama s\xfcrecinizi sonlandıracak. Emin misiniz?",continueButton:"Devam et",exitButton:"\xc7ıkış",ariaLabelModal:"Didit doğrulama",ariaLabelClose:"Doğrulamayı kapat"},uk:{exitTitle:"Вийти з верифікації?",exitMessage:"Вихід завершить процес верифікації. Ви впевнені?",continueButton:"Продовжити",exitButton:"Вийти",ariaLabelModal:"Верифікація Didit",ariaLabelClose:"Закрити верифікацію"},uz:{exitTitle:"Tekshiruvdan chiqasizmi?",exitMessage:"Chiqish tekshiruv jarayonini tugatadi. Ishonchingiz komilmi?",continueButton:"Davom etish",exitButton:"Chiqish",ariaLabelModal:"Didit tekshiruvi",ariaLabelClose:"Tekshiruvni yopish"},vi:{exitTitle:"Tho\xe1t khỏi x\xe1c minh?",exitMessage:"Tho\xe1t sẽ kết th\xfac qu\xe1 tr\xecnh x\xe1c minh của bạn. Bạn c\xf3 chắc kh\xf4ng?",continueButton:"Tiếp tục",exitButton:"Tho\xe1t",ariaLabelModal:"X\xe1c minh Didit",ariaLabelClose:"Đ\xf3ng x\xe1c minh"},"zh-CN":{exitTitle:"退出验证？",exitMessage:"退出将结束您的验证流程。确定要退出吗？",continueButton:"继续",exitButton:"退出",ariaLabelModal:"Didit 验证",ariaLabelClose:"关闭验证"},"zh-TW":{exitTitle:"退出驗證？",exitMessage:"退出將結束您的驗證流程。確定要退出嗎？",continueButton:"繼續",exitButton:"退出",ariaLabelModal:"Didit 驗證",ariaLabelClose:"關閉驗證"},zh:{exitTitle:"退出验证？",exitMessage:"退出将结束您的验证流程。确定要退出吗？",continueButton:"继续",exitButton:"退出",ariaLabelModal:"Didit 验证",ariaLabelClose:"关闭验证"}};class l{constructor(a,b){this.state={isOpen:!1,isLoading:!0,showConfirmation:!1},this.overlay=null,this.container=null,this.iframe=null,this.loadingEl=null,this.confirmOverlay=null,this.boundHandleMessage=null,this.boundHandleKeydown=null,this.embedded=!1,this.embeddedContainer=null,this.language="en",this.modalId=`didit-modal-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,this.config={zIndex:a?.zIndex??d.zIndex,showCloseButton:a?.showCloseButton??d.showCloseButton,showExitConfirmation:a?.showExitConfirmation??d.showExitConfirmation},this.callbacks=b,this.containerElement=a?.containerElement??document.body,this.embedded=a?.embedded??!1,this.embedded&&a?.embeddedContainerId&&(this.embeddedContainer=document.getElementById(a.embeddedContainerId))}injectStyles(){let a="didit-sdk-styles";if(document.getElementById(a))return;let b=document.createElement("style");b.id=a,b.textContent=`
      .${e.overlay} {
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

      .${e.overlay}.active {
        display: flex;
        opacity: 1;
      }

      .${e.container} {
        position: relative;
        width: 100%;
        max-width: 500px;
        max-height: 90dvh;
        border-radius: 16px;
        overflow: hidden;
        background: transparent;
      }

      .${e.overlay}.active .${e.container} {
        transform: scale(1);
      }

      .${e.iframe} {
        width: 100%;
        height: 700px;
        border: none;
        display: block;
      }

      .${e.closeButton} {
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

      .${e.closeButton}:hover,
      .${e.closeButton}:focus {
        background: transparent;
        opacity: 0.5;
      }

      .${e.closeButton} svg {
        stroke: #666;
        stroke-width: 2;
        stroke-linecap: round;
      }

      .${e.loading} {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fafafa;
        z-index: 5;
      }

      .${e.loading}.hidden {
        display: none;
      }

      .${e.loading} svg {
        width: 4rem;
        height: 4rem;
        animation: didit-spin 1s linear infinite;
      }

      .${e.loading} circle {
        stroke: #e5e5e5;
        stroke-width: 2.5;
        fill: none;
      }

      .${e.loading} path {
        stroke: #525252;
        stroke-width: 2.5;
        stroke-linecap: round;
        fill: none;
      }

      @keyframes didit-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .${e.confirmOverlay} {
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

      .${e.confirmOverlay}.active {
        display: flex;
        opacity: 1;
      }

      .${e.confirmBox} {
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

      .${e.confirmOverlay}.active .${e.confirmBox} {
        transform: scale(1);
      }

      .${e.confirmBox} h3 {
        color: #1a1a2e;
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        font-weight: 600;
      }

      .${e.confirmBox} p {
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
        .${e.overlay} {
          padding: 0;
        }

        .${e.container} {
          max-width: 100%;
          max-height: 100dvh;
          border-radius: 0;
        }

        .${e.iframe} {
          height: 100dvh;
        }
      }

      .${e.embedded} {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .${e.embedded} .${e.iframe} {
        width: 100%;
        height: 100%;
      }

      .${e.embedded} .${e.loading} {
        border-radius: 0;
      }
    `,document.head.appendChild(b)}createDOM(){if(this.injectStyles(),this.embedded&&this.embeddedContainer)return void this.createEmbeddedDOM();let a=k[this.language]??j;if(this.overlay=document.createElement("div"),this.overlay.id=this.modalId,this.overlay.className=e.overlay,this.overlay.setAttribute("role","dialog"),this.overlay.setAttribute("aria-modal","true"),this.overlay.setAttribute("aria-label",a.ariaLabelModal),this.container=document.createElement("div"),this.container.className=e.container,this.loadingEl=document.createElement("div"),this.loadingEl.className=e.loading,this.loadingEl.innerHTML=`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    `,this.config.showCloseButton){let b=document.createElement("button");b.className=e.closeButton,b.setAttribute("aria-label",a.ariaLabelClose),b.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 14 14">
          <line x1="1" y1="1" x2="13" y2="13" />
          <line x1="13" y1="1" x2="1" y2="13" />
        </svg>
      `,b.addEventListener("click",()=>this.handleCloseRequest()),this.container.appendChild(b)}this.iframe=document.createElement("iframe"),this.iframe.className=e.iframe,this.iframe.setAttribute("allow","camera; microphone; fullscreen; autoplay; encrypted-media; geolocation"),this.iframe.setAttribute("title",a.ariaLabelModal),this.iframe.addEventListener("load",()=>this.handleIframeLoad()),this.confirmOverlay=document.createElement("div"),this.confirmOverlay.className=e.confirmOverlay,this.confirmOverlay.innerHTML=`
      <div class="${e.confirmBox}">
        <h3>${a.exitTitle}</h3>
        <p>${a.exitMessage}</p>
        <div class="didit-confirm-actions">
          <button type="button" data-action="continue">${a.continueButton}</button>
          <span data-action="exit">${a.exitButton}</span>
        </div>
      </div>
    `,this.confirmOverlay.querySelector('[data-action="continue"]')?.addEventListener("click",()=>{this.hideConfirmation()}),this.confirmOverlay.querySelector('[data-action="exit"]')?.addEventListener("click",()=>{this.confirmExit()}),this.container.appendChild(this.loadingEl),this.container.appendChild(this.iframe),this.container.appendChild(this.confirmOverlay),this.overlay.appendChild(this.container),this.overlay.addEventListener("click",a=>{a.target===this.overlay&&this.handleCloseRequest()}),this.containerElement.appendChild(this.overlay)}createEmbeddedDOM(){this.embeddedContainer&&(this.container=document.createElement("div"),this.container.id=this.modalId,this.container.className=e.embedded,this.loadingEl=document.createElement("div"),this.loadingEl.className=e.loading,this.loadingEl.innerHTML=`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    `,this.iframe=document.createElement("iframe"),this.iframe.className=e.iframe,this.iframe.setAttribute("allow","camera; microphone; fullscreen; autoplay; encrypted-media; geolocation"),this.iframe.setAttribute("title",(k[this.language]??j).ariaLabelModal),this.iframe.addEventListener("load",()=>this.handleIframeLoad()),this.container.appendChild(this.loadingEl),this.container.appendChild(this.iframe),this.embeddedContainer.appendChild(this.container))}setupEventListeners(){this.boundHandleMessage=this.handleMessage.bind(this),window.addEventListener("message",this.boundHandleMessage),this.boundHandleKeydown=this.handleKeydown.bind(this),document.addEventListener("keydown",this.boundHandleKeydown)}removeEventListeners(){this.boundHandleMessage&&(window.removeEventListener("message",this.boundHandleMessage),this.boundHandleMessage=null),this.boundHandleKeydown&&(document.removeEventListener("keydown",this.boundHandleKeydown),this.boundHandleKeydown=null)}handleMessage(a){let b;if(function(a){try{return new URL(a).hostname.endsWith(".didit.me")}catch{return!1}}(a.origin)){h.log("Received postMessage:",a.data);try{b="string"==typeof a.data?JSON.parse(a.data):a.data}catch{h.warn("Failed to parse postMessage:",a.data);return}if("didit:close_request"===b.type)return void this.handleCloseRequest();this.callbacks.onMessage(b)}}handleKeydown(a){this.state.isOpen&&"Escape"===a.key&&(a.preventDefault(),this.state.showConfirmation?this.hideConfirmation():this.handleCloseRequest())}handleIframeLoad(){this.iframe?.src&&"about:blank"!==this.iframe.src&&(this.state.isLoading=!1,this.loadingEl?.classList.add("hidden"),this.callbacks.onIframeLoad())}handleCloseRequest(){this.config.showExitConfirmation?this.showConfirmation():this.callbacks.onCloseConfirmed()}showConfirmation(){this.state.showConfirmation=!0,this.confirmOverlay?.classList.add("active"),this.callbacks.onClose()}hideConfirmation(){this.state.showConfirmation=!1,this.confirmOverlay?.classList.remove("active")}confirmExit(){this.hideConfirmation(),this.callbacks.onCloseConfirmed()}open(a){this.language=function(a){try{let{pathname:b}=new URL(a),c=b.split("/").filter(Boolean)[0];if(c&&g.includes(c))return c}catch{}let b=navigator.language;if(g.includes(b))return b;let c=b.split("-")[0];return g.includes(c)?c:"en"}(a),this.overlay||this.container||(this.createDOM(),this.setupEventListeners()),h.log("Opening with URL:",a),this.state.isLoading=!0,this.state.showConfirmation=!1,this.loadingEl?.classList.remove("hidden"),this.confirmOverlay?.classList.remove("active"),this.iframe&&(this.iframe.src=a),this.state.isOpen=!0,this.embedded||(this.overlay?.classList.add("active"),document.body.style.overflow="hidden")}close(){h.log("Closing"),this.state.isOpen=!1,this.state.isLoading=!0,this.state.showConfirmation=!1,this.iframe&&(this.iframe.src="about:blank"),this.embedded||(this.overlay?.classList.remove("active"),document.body.style.overflow="")}destroy(){h.log("Destroying"),this.close(),this.removeEventListeners(),this.embedded&&this.container&&this.container.parentNode?this.container.parentNode.removeChild(this.container):this.overlay&&this.overlay.parentNode&&this.overlay.parentNode.removeChild(this.overlay),this.overlay=null,this.container=null,this.iframe=null,this.loadingEl=null,this.confirmOverlay=null}isOpen(){return this.state.isOpen}isLoading(){return this.state.isLoading}}class m{static get shared(){return m._instance||(m._instance=new m),m._instance}static reset(){m._instance&&(m._instance.destroy(),m._instance=null)}get state(){return this._state}get configuration(){return this._configuration}get isPresented(){return this._modal?.isOpen()??!1}get errorMessage(){return this._errorMessage}constructor(){this._state="idle",this._modal=null,h.log("DiditSdk initialized")}async startVerification(a){let b=a.configuration;this._configuration=b,h.isEnabled=b?.loggingEnabled??d.loggingEnabled,h.log("Starting verification with options:",a),this._modal&&(this._modal.destroy(),this._modal=null),this._modal=new l(b,{onClose:()=>this.handleModalClose(),onCloseConfirmed:()=>this.handleModalCloseConfirmed(),onMessage:a=>this.handleVerificationEvent(a),onIframeLoad:()=>this.handleIframeLoad()});try{let{url:b}=a;if(!b||"string"!=typeof b)throw Error("Invalid options: url is required");this._url=b,this.setState("loading"),this.emitInternalEvent("didit:started",{}),this._modal?.open(this._url)}catch(a){this.handleError(a)}}close(){h.log("Closing verification programmatically"),this.handleModalCloseConfirmed()}destroy(){h.log("Destroying SDK instance"),this._modal?.destroy(),this._modal=null,this.reset()}handleModalClose(){h.log("Modal close requested")}handleModalCloseConfirmed(){h.log("Modal close confirmed");let a=this.buildSessionData();this._modal?.close(),this.reset(),this.onComplete?.({type:"cancelled",session:a})}handleIframeLoad(){h.log("Iframe loaded")}emitInternalEvent(a,b){let c={type:a,data:b,timestamp:Date.now()};h.log("Emitting internal event:",c),this.onEvent?.(c)}handleVerificationEvent(a){switch(h.log("Verification event:",a),this.onEvent?.(a),a.type){case"didit:ready":h.log("Verification iframe ready");break;case"didit:started":h.log("User started verification");break;case"didit:step_started":h.log("Step started:",a.data?.step);break;case"didit:step_completed":h.log("Step completed:",a.data?.step,"-> next:",a.data?.nextStep);break;case"didit:media_started":h.log("Media started:",a.data?.mediaType,"for step:",a.data?.step);break;case"didit:media_captured":h.log("Media captured for step:",a.data?.step,"isAuto:",a.data?.isAuto);break;case"didit:document_selected":h.log("Document selected:",a.data?.documentType,"country:",a.data?.country);break;case"didit:verification_submitted":h.log("Verification submitted for step:",a.data?.step);break;case"didit:code_sent":h.log("Code sent via:",a.data?.channel,"codeSize:",a.data?.codeSize);break;case"didit:code_verified":h.log("Code verified via:",a.data?.channel);break;case"didit:status_updated":h.log("Status updated:",a.data?.status,"step:",a.data?.step);break;case"didit:completed":this.handleVerificationCompleted(a);break;case"didit:cancelled":this.handleVerificationCancelled(a);break;case"didit:error":this.handleVerificationError(a);break;case"didit:step_changed":h.log("Step changed:",a.data?.step)}}handleVerificationCompleted(a){h.log("Verification completed:",a.data);let b=this.buildSessionData(a.data);this._configuration?.closeModalOnComplete&&(this._modal?.close(),this.reset()),this.onComplete?.({type:"completed",session:b})}handleVerificationCancelled(a){h.log("Verification cancelled:",a.data);let b=this.buildSessionData(a.data);this._modal?.close(),this.reset(),this.onComplete?.({type:"cancelled",session:b})}handleVerificationError(a){h.log("Verification error:",a.data)}handleError(a){let b;h.error("SDK error:",a),b=a instanceof Error?i("unknown",a.message):i("unknown","An unknown error occurred"),this._errorMessage=b.message,this.setState("error"),this._modal?.close(),this.reset();this.onComplete?.({type:"failed",error:b})}setState(a){let b=this._state;this._state=a,b!==a&&(h.log("State changed:",b,"->",a),this.onStateChange?.(a,this._errorMessage))}reset(){this._state="idle",this._sessionId=void 0,this._url=void 0,this._errorMessage=void 0,this._configuration=void 0}buildSessionData(a){let b=a?.sessionId||this._sessionId;if(b)return{sessionId:b,status:a?.status||"Pending"}}}m._instance=null}};