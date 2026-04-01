<p align="right">
  <a href="./README_zh-CN.md">中文</a> <a href="./README.md">English</a> <a href="./README_zh-TW.md">繁體中文</a> <a href="./README_ja.md">日本語</a> <a href="./README_RU.md">Русский</a>
</p>
<h1 align="center">
  <img src="./src/assets/logo.png"/><br/>
  ScriptCat
</h1>
<p align="center">ScriptCat — это браузерное расширение, которое выполняет пользовательские скрипты.<br>Всё можно автоматизировать с помощью скриптов, позволяя вашему браузеру делать больше!</p>
<p align="center">
  <a href="https://docs.scriptcat.org/">Документация</a>·
  <a href="https://discord.gg/JF76nHCCM7">Discord</a>·
  <a href="https://scriptcat.org/ru/search">Хранилище скриптов</a>
</p>

![GitHub stars](https://img.shields.io/github/stars/scriptscat/scriptcat.svg)
[![Build Status](https://github.com/scriptscat/scriptcat/actions/workflows/build.yaml/badge.svg?branch=main)](https://github.com/scriptscat/scriptcat)
[![codecov](https://codecov.io/gh/scriptscat/scriptcat/branch/main/graph/badge.svg?token=G1A6ZGDQTY)](https://codecov.io/gh/scriptscat/scriptcat)
![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/scriptscat/scriptcat.svg?label=version)
[![Chrome](https://img.shields.io/badge/chrome-success-brightgreen?logo=google%20chrome)](https://chromewebstore.google.com/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)
[![Edge](https://img.shields.io/badge/edge-success-brightgreen?logo=microsoft%20edge)](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)
[![FireFox](https://img.shields.io/badge/firefox-success-brightgreen?logo=firefox)](https://addons.mozilla.org/firefox/addon/scriptcat/)
[![Crowdin](https://badges.crowdin.net/scriptcat/localized.svg)](https://crowdin.com/project/scriptcat)

## О проекте

ScriptCat — это мощный менеджер пользовательских скриптов, основанный на философии Tampermonkey и полностью совместимый
с его скриптами. Он не только поддерживает традиционные пользовательские скрипты, но и инновационно реализует фреймворк
для выполнения фоновых скриптов, предоставляет богатый API для расширений, позволяя скриптам выполнять более мощные
функции. Встроенный превосходный редактор кода с поддержкой интеллектуального дополнения и проверки синтаксиса делает
разработку скриптов более эффективной и плавной. **Если вам понравилось, пожалуйста, поставьте нам звезду (Star) ⭐ —
это лучшая поддержка для нас!**

## ✨ Ключевые особенности

### 🔄 Облачная синхронизация

- **Синхронизация скриптов через облако**: Синхронизация скриптов между устройствами, лёгкое восстановление после смены
  браузера или переустановки системы.
- **Подписки на скрипты**: Создавайте и управляйте коллекциями скриптов, поддерживается совместная работа в команде и
  комбинированное использование скриптов.

### 🔧 Мощный функционал

- **Полная совместимость с Tampermonkey**: Бесшовная миграция существующих скриптов Tampermonkey, нулевая кривая
  обучения.
- **Фоновые скрипты**: Уникальный механизм фонового выполнения позволяет скриптам работать непрерывно без ограничений со
  стороны страницы.
- **Скрипты по расписанию**: Поддержка выполнения задач по расписанию для реализации автоматического подтверждения
  участия, напоминаний и т.д.
- **Богатый API**: По сравнению с Tampermonkey предоставляет более мощный API, открывая больше возможностей.

### 🛡️ Безопасность и надежность

- **Песочница (Sandbox)**: Скрипты выполняются в изолированной среде, предотвращая влияние вредоносного кода.
- **Управление разрешениями**: Скрипты должны явно запрашивать необходимые разрешения, для чувствительных операций
  требуется дополнительное подтверждение.

### 💻 Опыт разработки

- **Интеллектуальный редактор**: Встроенный редактор кода поддерживает подсветку синтаксиса, интеллектуальное дополнение
  и ESLint.
- **Инструменты отладки**: Полнофункциональные возможности отладки для быстрого выявления и решения проблем.
- **Эстетичный интерфейс**: Современный дизайн UI, простой и интуитивно понятный в использовании.
  > 🚀 Больше функций в разработке...

## 🚀 Быстрое начало

### 📦 Установка расширения

#### Магазины расширений (рекомендуется)

| Браузер | Ссылка на магазин | Статус |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Chrome  | [Стабильная версия](https://chromewebstore.google.com/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf) / [Beta](https://chromewebstore.google.com/detail/scriptcat-beta/jaehimmlecjmebpekkipmpmbpfhdacom) | ✅ Доступно |
| Edge    | [Стабильная версия](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh) / [Beta](https://microsoftedge.microsoft.com/addons/detail/scriptcat-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi) | ✅ Доступно |
| Firefox | [Стабильная версия](https://addons.mozilla.org/firefox/addon/scriptcat/) / [Beta](https://addons.mozilla.org/firefox/addon/scriptcat-pre/) | ✅ MV2 |

#### Ручная установка

Если доступ к магазину расширений невозможен, вы можете скачать ZIP-архив последней версии с
[GitHub Releases](https://github.com/scriptscat/scriptcat/releases) и установить его вручную.

### 📝 Руководство по использованию

#### Установка скриптов

1.  **Получение из хранилища скриптов**: Посетите [Хранилище скриптов ScriptCat](https://scriptcat.org/ru/search) или
    другие маркетплейсы пользовательских скриптов.
2.  **Раздел фоновых скриптов**: Ознакомьтесь с уникальными
    [фоновыми скриптами](https://scriptcat.org/ru/search?script_type=3).
3.  **Совместимость**: Поддерживается подавляющее большинство скриптов для Tampermonkey, их можно устанавливать и
    использовать напрямую. Если вы столкнетесь с несовместимым скриптом, пожалуйста, сообщите нам через
    [issue](https://github.com/scriptscat/scriptcat/issues).

#### Разработка скриптов

Ознакомьтесь с нашей [документацией для разработчиков](https://docs.scriptcat.org/docs/dev/) и
[руководством по разработке](https://learn.scriptcat.org/), чтобы научиться писать скрипты. Документация охватывает всё
от основ до продвинутых тем, помогая вам уверенно писать скрипты. Если вы обнаружите ошибку в документации или хотите
внести свой вклад, вы можете нажать кнопку "Редактировать эту страницу" на странице документации для внесения изменений.

---

## 🤝 Участие в разработке

Мы приветствуем любой вклад! Ознакомьтесь с [руководством по внесению вклада](./docs/CONTRIBUTING_RU.md), чтобы узнать,
как начать.

### 💬 Общение в сообществе

Присоединяйтесь к нашему сообществу для общения с другими пользователями и разработчиками:

- [Telegram](https://t.me/scriptscat)
- [Discord](https://discord.gg/JF76nHCCM7)

### 🙏 Благодарности

Благодарим следующих разработчиков за их вклад в ScriptCat. С вами ScriptCat становится лучше!

[![Contributors](https://contrib.rocks/image?repo=scriptscat/scriptcat&max=1000)](https://github.com/scriptscat/scriptcat/graphs/contributors)

---

## 📄 Лицензия

Этот проект имеет открытый исходный код по лицензии [GPLv3](./LICENSE). Пожалуйста, соблюдайте условия лицензии.

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fscriptscat%2Fscriptcat?ref=badge_large)
