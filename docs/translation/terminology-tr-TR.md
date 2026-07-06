# tr-TR Terminoloji ve Arayüz Metni Kılavuzu

Bu belge, ScriptCat'in Türkçe (`tr-TR`) arayüzü ve belgeleri için terminoloji kurallarını tanımlar. Amaç, ürün kavramlarını tutarlı biçimde adlandırmak, doğal Türkçe arayüz metinleri yazmak ve teknik tanımlayıcıları korumaktır.

İncelenen kullanım kaynakları: `src/locales/tr-TR/*.json`, `docs/architecture/README.md`

## İlkeler

1. Eylemi veya durumu doğrudan anlatan, kısa ve doğal Türkçe arayüz metinleri kullanın.
2. `Kullanıcı Betiği`, `Normal Betik`, `Sayfa Betiği`, `Arka Plan Betiği` ve `Zamanlanmış Betik` kavramlarını birbirinden ayırın.
3. Sözcükleri yalnızca yazılışlarına bakarak topluca değiştirmeyin; özelliği, arayüz konumunu ve cümle bağlamını kontrol edin.
4. `Regex`, `cron ifadesi`, `ESLint`, `VSCode`, `GM API`, `@match`, `@exclude`, `@grant`, `@connect`, `@resource` ve `@require` gibi teknik terimleri ve tanımlayıcıları koruyun.
5. Dil düzenlemesi sırasında placeholder'ları, HTML/React etiketlerini, i18next interpolasyonunu, URL'leri veya metadata tanımlayıcılarını değiştirmeyin.
6. Aşağıdaki key'ler güncel kullanımı veya doğrulanmış inceleme noktalarını gösterir; aynı anlamdaki yeni metinlerde de aynı kurallar geçerlidir.

## Kategoriler

| Kategori | Kullanım |
| --- | --- |
| **A. Ürün ve özellik terimleri** | ScriptCat özelliklerinin ve betik türlerinin adları. |
| **B. Arayüz eylemleri ve durumları** | Kontroller, etiketler ve durum mesajları için tercih edilen ifadeler. |
| **C. Bağlama bağlı terimler** | Doğru karşılığı özelliğe veya arayüz yüzeyine göre değişen terimler. |
| **D. Korunacak teknik terimler** | Teknik anlamı ve yazımı korunması gereken terimler ve tanımlayıcılar. |
| **E. Sonraki inceleme noktaları** | Mevcut metinlerde ayrı ve doğrulanmış bir düzenleme gerektiren tutarsızlıklar. |

## A. Ürün ve Özellik Terimleri

| Kavram | Tercih edilen ifade | Güncel örnek key'ler | Notlar |
| --- | --- | --- | --- |
| ScriptCat browser extension | `ScriptCat uzantısı` | `welcome_title`, `ext_update_notification` | Ürün adını her zaman `ScriptCat` olarak yazın. |
| generic userscript | `kullanıcı betiği` | `create_user_script`, `script_list_content` | Userscript kavramının genel adıdır. |
| normal userscript type | `Normal Betik` | `create_user_script`, `script_list.sidebar.normal_script` | Arka plan ve zamanlanmış betik türleriyle birleştirmeyin. |
| Tampermonkey compatibility | `Tampermonkey uyumlu kullanıcı betiği` / `Tampermonkey betiği` | `docs/architecture/README.md` | Yalnızca uyumluluk vurgulanırken kullanın; genel userscript veya kategori adının yerine geçirmeyin. |
| page script | `Sayfa Betiği` | `script_list_enable_content` | Arayüz metnindeki sayfada çalışan betik kavramıdır; `Normal Betik` kategori etiketinin yerine denetimsiz kullanmayın. |
| background script | `Arka Plan Betiği` | `create_background_script`, `background_script` | Arka planda çalışan ScriptCat betik türüdür. |
| scheduled script | `Zamanlanmış Betik` | `create_scheduled_script`, `scheduled_script` | Tür adı olarak `crontab betiği` kullanmayın; `cron` yalnızca zamanlama ifadesini anlatır. |
| script synchronization | `Betik Senkronizasyonu` | `script_sync`, `sync_status`, `setting_sync_title` | Silme davranışında neyin senkronize edildiğini açıklama metninde belirtin. |
| subscription | `Abonelik` | `subscribe`, `subscribe_url`, `importpage.count_subscribes` | Nesne adı olarak `Abonelik`, eylem olarak `Abone ol` kullanın. |
| script gallery / market | `Betik Galerisi` / `Betik Pazarı` | `script_gallery`, `script_list_title` | Bağlantının götürdüğü ürün alanının mevcut adını kullanın. |

## B. Arayüz Eylemleri ve Durumları

| Kavram | Tercih edilen ifade | Güncel örnek key'ler | Notlar |
| --- | --- | --- | --- |
| create | `Oluştur` | `create_script`, `create_background_script` | Gerekirse nesne adını ekleyin. |
| save / save as | `Kaydet` / `Farklı Kaydet` | `save`, `save_as` | Dosya ve ayar eylemleri için kullanın. |
| import / export | `İçe Aktar` / `Dışa Aktar` | `import`, `export`, `import_file`, `export_file` | Eylem etiketlerinde fiil biçimini kullanın. |
| install / update | `Yükle` / `Güncelle` | `script`, `update_script`, `update_subscribe` | Betik veya abonelik nesnesini gerektiğinde belirtin. |
| run / runtime | `Çalıştır` / `Çalışma Zamanı` | `run`, `running`, `runtime` | Betik çalıştırma ile çalışma zamanı bilgisini ayırın. |
| enable / disable | `Etkinleştir` / `Devre Dışı Bırak`; durumlarda `Etkin` / `Devre Dışı` | `enable`, `disable`, `enabled_label`, `updatepage.disabled` | Özelliği açma-kapama ile pencere açma-kapamayı karıştırmayın. |
| settings | `Ayarlar` | `settings`, `script_setting`, `editor_config` | Kullanıcı tarafından değiştirilebilen ürün seçenekleri için kullanın. |
| permission | `İzin` | `permission`, `request_permission`, `permission_management` | Erişim yetkileri ve izin istekleri için kullanın. |
| connect / sync | `Bağlan` / `Senkronize Et` | `connect`, `connection_success`, `script_sync` | Bağlantı durumu ile veri senkronizasyonunu ayırın. |
| directory | `Dizin` | `open_directory`, `open_backup_dir` | Dosya sistemi araçlarında mevcut teknik terimi koruyun. |
| browser tab | `Sekme` | `close_current_tab`, `script_run_env.normal-tabs` | Tarayıcı sekmelerini `etiket` olarak adlandırmayın. |

## C. Bağlama Bağlı Terimler

| Kavram | Kullanılabilecek ifade | Karar kuralı | Güncel örnek key'ler |
| --- | --- | --- | --- |
| local / cloud | `Yerel` / `Bulut` | Veri kaynağı, depolama konumu veya senkronizasyon hedefi için kullanın; belirsizse nesneyi ekleyin. | `local`, `cloud`, `source_local_script`, `tools_backup_content` |
| panel / console | `panel` / `konsol` | ScriptCat kontrol yüzeyi için `panel`, geliştirici çıktısı için `konsol` kullanın. | `scheduled_script_description_title`, `build_success_message` |
| source | `Kaynak`, `Yükleme Kaynağı`, `Abonelik Kaynağı` | Kaynağın ne sağladığını açıkça adlandırın. | `source`, `importpage.col_source`, `source_subscribe_link` |
| storage | `depolama`, `depolama alanı`, `Depolama API'si` | Veri saklama, ayrılmış alan ve API kavramlarını bağlama göre ayırın. | `script_storage`, `script_operation_title`, `storage_api` |
| sync deletion | `Silme Senkronizasyonu` / `Betik Silme Senkronizasyonu` | Ayar etiketi ile açıklama metninin ayrıntı düzeyini ayrı değerlendirin. | `sync_delete`, `notification.script_sync_delete`, `sync_delete_desc` |

## D. Korunacak Teknik Terimler

| Kavram | Kullanım | Güncel örnek key'ler | Gerekçe |
| --- | --- | --- | --- |
| regular expression | `Regex` / `düzenli ifade` | `search_regex` | Yerleşik geliştirici terminolojisidir. |
| cron expression | `cron ifadesi` | `cron_invalid_expr`, `error_cron_invalid` | Kabul edilen zamanlama sözdizimini açıkça belirtir. |
| expression | `ifade` | `value_export_expression`, `expression_format_error` | Girilen veya değerlendirilen teknik ifadeyi belirtir. |
| watch file changes | `Dosyayı İzle` / `İzlemeyi Durdur` | `watch_file`, `stop_watch_file` | Sürekli dosya değişikliği takibini anlatır. |
| metadata declaration | `bildirim` | `error_metadata_line_duplicated` | Userscript metadata sözdizimindeki declaration kavramıdır. |
| product/API identifiers | `ESLint`, `VSCode`, `Cookie`, `GM API`, `@match`, `@exclude`, `@grant`, `@connect`, `@resource`, `@require` ifadelerini koruyun | `enable_eslint`, `vscode_url`, `confirm_operation_description`, `script_resource_tooltip` | Ürün adları ve kod tanımlayıcıları tanınabilir kalmalıdır. |

## E. Sonraki İnceleme Noktaları

Aşağıdaki maddeler mevcut çevirilerde doğrulanmış tutarsızlıkları kaydeder. Bu kılavuz çalışma zamanı metinlerini değiştirmez; düzeltmeler ayrı bir Türkçe arayüz incelemesi ve UI kontrolüyle yapılmalıdır.

| Konu | Güncel durum | Tercih edilen yön | Güncel örnek key'ler |
| --- | --- | --- | --- |
| scheduled script naming | Ürün adı `Zamanlanmış Betik` iken bir hata metninde `crontab betikleri` kullanılıyor. | Aynı betik türü için `zamanlanmış betik`; yalnızca zamanlama sözdizimi için `cron` kullanın. | `scheduled_script`, `only_background_scheduled_can_run`, `cron_invalid_expr` |
| documentation link locale | Bazı Türkçe metinler `/en/` dokümantasyonuna veya İngilizce pazar sayfasına bağlanıyor. | Yalnızca karşılık gelen Türkçe hedef doğrulandıktan sonra bağlantıyı değiştirin. | `script_list_content`, `develop_mode_guide` |
| desktop interaction wording | Geliştirici modu bağlantısı masaüstü arayüzünde `dokunun` diyor. | Kontrol masaüstünde tıklanıyorsa `tıklayın` kullanın. | `develop_mode_guide`, `allow_user_script_guide` |

## AI ve Katkıda Bulunanlar İçin Kontrol Listesi

Türkçe içerik eklerken veya düzenlerken:

1. Hedef locale'in `tr-TR` olduğunu doğrulayın ve bu kılavuzla birlikte komşu mevcut metinleri okuyun.
2. Aynı ScriptCat kavramı için aynı ürün terimini kullanın; betik türlerini benzer ifadeler nedeniyle birleştirmeyin.
3. Bağlama bağlı terimlerde değişiklik yapmadan önce gerçek davranışı ve arayüz konumunu kontrol edin.
4. Teknik terimleri, placeholder'ları, etiketleri, interpolasyonu, URL'leri ve metadata tanımlayıcılarını koruyun.
5. İnceleme noktalarını doğrulanmamış toplu değiştirme talimatları olarak yorumlamayın.
6. Teslimden önce yeni veya değiştirilen metinlerde betik türlerini, `Abonelik` nesne adını, sekme terimini ve teknik tanımlayıcıları yeniden kontrol edin.
