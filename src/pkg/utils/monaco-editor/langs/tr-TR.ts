const grantValuePrompts = {
  none: "Özel GM API izinleri istemez; betik normal bir sayfa betiğine yakın şekilde çalışır.",
  unsafeWindow: "Sayfanın kendi window nesnesine erişerek sayfanın yerel betikleriyle etkileşim kurar.",
  GM_getValue: "Betiğin kalıcı depolama alanından tek bir değeri okur.",
  GM_getValues: "Betiğin kalıcı depolama alanından birden fazla değeri okur.",
  GM_setValue: "Betiğin kalıcı depolama alanına tek bir değer yazar.",
  GM_setValues: "Betiğin kalıcı depolama alanına birden fazla değer yazar.",
  GM_deleteValue: "Betiğin kalıcı depolama alanından tek bir değeri siler.",
  GM_deleteValues: "Betiğin kalıcı depolama alanından birden fazla değeri siler.",
  GM_listValues: "Betiğin kalıcı depolama alanındaki tüm anahtarları listeler.",
  GM_addValueChangeListener: "Betik depolama değerlerindeki değişiklikleri izler.",
  GM_removeValueChangeListener: "Betik depolama değeri değişiklik dinleyicisini kaldırır.",
  GM_xmlhttpRequest:
    "Çapraz kökenli ağ istekleri yapar; hedef ana bilgisayarların genellikle @connect ile izinli olması gerekir.",
  GM_download:
    "Dosya indirir. URL ve dosya adı ya da url, name, headers, saveAs gibi alanlar içeren bir ayrıntı nesnesi alır ve abort edilebilir bir tanıtıcı döndürür.",
  GM_openInTab: "Ön planda veya arka planda açma gibi seçeneklerle yeni bir sekme açar.",
  GM_closeInTab: "Betiğin açtığı veya yönettiği bir sekmeyi kapatır.",
  GM_getTab: "Geçerli sekmeyle ilişkili geçici verileri okur.",
  GM_saveTab: "Geçerli sekmeyle ilişkili geçici verileri kaydeder.",
  GM_getTabs: "Betiğin kaydettiği tüm geçici sekme verilerini okur.",
  GM_notification: "Tarayıcı bildirimi gösterir ve tıklama veya kapatma gibi olayları işler.",
  GM_closeNotification: "Belirli bir betik bildirimini kapatır.",
  GM_updateNotification: "Belirli bir betik bildirimini günceller.",
  GM_setClipboard: "Sistem panosuna yazar.",
  GM_registerMenuCommand: "Bir betik menü komutu kaydeder.",
  GM_unregisterMenuCommand: "Bir betik menü komutunun kaydını kaldırır.",
  CAT_registerMenuInput: "ScriptCat API'si: giriş alanı olan bir betik menü komutu kaydeder.",
  CAT_unregisterMenuInput: "ScriptCat API'si: giriş alanı olan bir betik menü komutunun kaydını kaldırır.",
  GM_addStyle: "Sayfaya CSS enjekte eder.",
  GM_addElement: "Sayfada bir öğe oluşturup ekler.",
  GM_getResourceText: "@resource ile bildirilen bir kaynağın metin içeriğini okur.",
  GM_getResourceURL: "@resource ile bildirilen bir kaynağın URL'sini alır.",
  GM_cookie: "Çerezleri okumak, yazmak veya silmek için Cookie API'sine erişir.",
  CAT_fetchBlob: "ScriptCat iç API'si: uzantı tarafından erişilebilen bir kaynağı okur ve Blob döndürür.",
  CAT_fileStorage: "ScriptCat API'si: betiğin dosya depolama alanına erişir.",
  CAT_userConfig: "ScriptCat API'si: betiğin kullanıcı yapılandırmasına erişir.",
  CAT_scriptLoaded: "ScriptCat API'si: @early-start senaryolarında betiğin tamamen yüklenmesini bekler.",
  "window.close": "Betiğin window.close() çağırmasına izin verir.",
  "window.focus": "Betiğin window.focus() çağırmasına izin verir.",
  "window.onurlchange": "Betiğin URL değişikliği olaylarını dinlemesine izin verir.",
} as const;

export default {
  title: "Türkçe",
  thisIsAUserScript: "Bir kullanıcı betiği",
  undefinedPrompt: "Tanımlanmamış istem",
  quickfix: "{0} sorununu düzelt",
  addEslintDisableNextLine: "eslint-disable-next-line yorumu ekle",
  addEslintDisable: "eslint-disable yorumu ekle",
  declareGlobal: "'{0}' öğesini global değişken olarak bildir (/* global */)",
  removeConnectWildcard: "@connect joker karakterini kaldır: {0}",
  replaceMatchTldWildcardWithInclude: "@match TLD joker karakterini @include {0} ile değiştir",
  replaceIncludeWithMatch: "@include yerine @match {0} kullan",
  grantConflict: "@grant none, GM API'leriyle birlikte kullanılamaz. none değerini veya tüm GM API'lerini kaldırın.",
  grantValuePrompts,
  prompt: {
    name: "Betik adı",
    namespace: "Betik ad alanı",
    copyright: "Betiğin telif hakkı bilgileri",
    license: "Betiğin açık kaynak lisansı",
    version: "Betik sürümü",
    description: "Betik açıklaması",
    icon: "Betik simgesi",
    iconURL: "Betik simgesi",
    defaulticon: "Betik simgesi",
    icon64: "64x64 boyutunda betik simgesi",
    icon64URL: "64x64 boyutunda betik simgesi",
    grant: "Betik için özel API izinleri ister",
    author: "Betik yazarı",
    "run-at":
      "Betiğin çalışma zamanı<br>`document-start`: URL eşleştikten sonra betiği olabildiğince erken enjekte eder<br>`document-end`: DOM yüklendikten sonra enjekte eder (görseller vb. hâlâ yükleniyor olabilir)<br>`document-idle`: tüm içerik yüklendikten sonra enjekte eder<br>`document-body`: yalnızca sayfada bir body öğesi varsa enjekte eder",
    "run-in": "Betiğin enjekte edildiği ortam",
    homepage: "Betik ana sayfası",
    homepageURL: "Betik ana sayfası",
    website: "Betik ana sayfası",
    background: "Arka Plan Betiği",
    include: "URL'si eşleşen ve betiğin çalıştığı sayfalar",
    match: "URL'si eşleşen ve betiğin çalıştığı sayfalar",
    exclude: "URL'si eşleşen ve betiğin ÇALIŞMADIĞI sayfalar",
    connect: "Betiğin erişebileceği siteler",
    resource: "İçe aktarılan kaynak dosyaları",
    require: "İçe aktarılan harici JS dosyaları",
    "require-css": "İçe aktarılan harici CSS dosyaları",
    noframes: "Betiği `<frame>` içinde çalıştırma",
    compatible: "GreasyFork'ta gösterilen uyumluluk bilgileri",
    "inject-into":
      "Betik enjeksiyon ortamı<br>`content`: betiği content ortamına enjekte eder<br>`page`: betiği sayfa ortamına enjekte eder (varsayılan)<br>Not: SC, ortamı CSP'ye göre seçen `inject-into: auto` tasarımını desteklemez.",
    "early-start":
      "`run-at: document-start` ile birlikte kullanılır. `early-start`, betiğin sayfadan bile daha erken çalışmasını sağlar; ancak performansı etkileyebilir ve GM API'lerini sınırlayabilir. (Yalnızca SC)",
    unwrap:
      "Kullanıcı betiğinin sandbox sarmalamasını atlayarak doğrudan sayfanın yerel global kapsamına enjekte edilip çalıştırılmasını sağlar. <br>Betik, sayfanın gerçek global değişkenlerine doğrudan erişebilir ve bunları değiştirebilir; ancak GM.* gibi ayrıcalıklı kullanıcı betiği API'lerini kullanamaz. <br>Genellikle sayfanın yerel betikleriyle derin etkileşim gerektiren senaryolarda veya normal sayfa betiklerinden geçişte kullanılır.",
    definition: "ScriptCat'e özgü: düzenleyicinin otomatik tamamlaması için kullanılan bir `.d.ts` dosyasının URL'si",
    antifeature: `Betik marketleriyle ilgilidir: istenmeyen özellikler bu açıklama değerini içermelidir
referral-link: Bu betik, yazarın yönlendirme bağlantısını kullanacak şekilde değişiklik veya yönlendirme yapar
ads: Bu betik, ziyaret ettiğiniz sayfalara reklam ekler
payment: Bu betik, düzgün kullanılabilmesi için ödeme gerektirir
miner: Bu betik madencilik faaliyetlerinde bulunur
membership: Bu betik, düzgün kullanılabilmesi için üyelik kaydı gerektirir
tracking: Bu betik, kullanıcı bilgilerinizi izler`.replace(/\n/g, "<br>"),
    updateURL: "Betik güncellemelerini denetlemek için kullanılan URL",
    downloadURL: "Betik güncellemelerini indirmek için kullanılan URL",
    supportURL: "Destek sitesi / hata bildirim sayfası",
    source: "Betik kaynak kodu sayfası",
    scriptUrl: "Abonelik betiğinde başvurulan kullanıcı betiği URL'si",
    storageName: "Birden fazla betiğin aynı depolama alanını paylaşması için kullanılan betik değeri depolama adı",
    tag: "Betik etiketleri; birden fazla etiket virgül veya boşlukla ayrılabilir",
    cloudCat: "Betiğin CloudCat bulut betik paketi olarak dışa aktarılabileceğini belirtir",
    cloudServer: "Betiğin kullandığı CloudCat bulut hizmeti",
    exportValue: "Bulut betiği olarak dışa aktarırken dışa aktarılacak betik depolama değerleri",
    exportCookie: "Bulut betiği olarak dışa aktarırken dışa aktarılacak çerezler",
    crontab: `Zamanlanmış betik crontab örnekleri (bulut betikleri için geçerli değildir)
* * * * * * Her saniye çalışır
* * * * * Her dakika çalışır
0 */6 * * * Her 6 saatte bir, 0. dakikada bir kez çalışır
15 */6 * * * Her 6 saatte bir, 15. dakikada bir kez çalışır
* once * * * Saatte bir kez çalışır
* * once * * Günde bir kez çalışır
* 10 once * * Her gün 10:00-10:59 arasında bir kez çalışır; 10:04'te çalıştıysa o gün 10:05-10:59 arasında tekrar çalışmaz
* 1,3,5 once * * Her gün 1:00, 3:00 veya 5:00'te bir kez çalışır; 1:00'de çalıştıysa o gün 3:00 ve 5:00'te tekrar çalışmaz
* */4 once * * Her 4 saatte bir denetleyip bir kez çalışır; 4:00'te çalıştıysa o gün 8:00, 12:00, 16:00, 20:00, 24:00'te tekrar çalışmaz
* 10-23 once * * Her gün 10:00-23:59 arasında bir kez çalışır; 10:04'te çalıştıysa o gün 10:05-23:59 arasında tekrar çalışmaz
* once 13 * * Her ayın 13. gününde saatte bir kez çalışır
* once(9-17) * * * Her gün 9-17 saatleri arasında saatte bir kez çalışır
0,30 once * * * Saatte bir kez, 0. veya 30. dakikadan hangisi önce gelirse onda çalışır; aynı saat içinde tekrarlanmaz
* * once(9-18) * * Her ayın 9-18. günleri arasında günde bir kez çalışır
* * * * once(1-5) Haftada bir kez, yalnızca Pazartesi-Cuma günleri çalışır`.replace(/\n/g, "<br>"),
  },
} as const;
