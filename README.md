# SimpleChat (Local Demo)

একটি ব্যক্তিগত ১-টু-১ **টেক্সট-অনলি** চ্যাট ডেমো। HTML5, CSS3, Vanilla JavaScript, IndexedDB।

## এটি কী নয়

- সত্যিকারের অনলাইন মেসেজিং অ্যাপ নয়। সব ডেটা শুধু এই ডিভাইসে থাকে, কোনো সার্ভার নেই।
- ইমেইল/ফোন লগইন শুধু ডেমো। কিছুই যাচাই হয় না, পাসওয়ার্ড বা OTP সংরক্ষিত হয় না।
- ডেলিভার্ড/পঠিত অবস্থা ও টাইপিং সিমুলেটেড; কোনো অনলাইন উপস্থিতি দেখানো হয় না।
- ব্লক ও রিপোর্ট শুধু লোকাল রেকর্ড; কোনো সার্ভারে কার্যকর হয় না।
- এন্ড-টু-এন্ড এনক্রিপ্টেড নয়। লোকাল ডেটা এনক্রিপ্ট করা থাকে না।
- রিমোট পুশ নোটিফিকেশন নেই, শুধু ইন-অ্যাপ তালিকা।
- ছবি, অডিও, ভিডিও, ফাইল শেয়ার, গ্রুপ চ্যাট, কল: এই সংস্করণে নেই।

## ফোনে চালানো (Termux)

```bash
pkg install python
cd ~/simplechat          # প্রজেক্ট ফোল্ডারে যান
python -m http.server 8080
```

ব্রাউজারে খুলুন: `http://localhost:8080`

> `file://` দিয়ে খুললে চলবে না, কারণ ES modules লাগে। সার্ভার চালু রাখতে হবে।

## Test চালানো

সার্ভার চালু রেখে খুলুন: `http://localhost:8080/tests/index.html`

- শুধু কিছু test: `…/tests/index.html?grep=block`
- Test আলাদা ডেটাবেস (`simplechat-test-db`) ও আলাদা LocalStorage prefix ব্যবহার করে, তাই আসল চ্যাট ডেটা ছোঁয়া হয় না।
- পাতার ওপরে সারাংশ দেখাবে (যেমন `80/84 সফল, 4 ব্যর্থ`)। ব্যর্থ test লাল, নিচে কারণসহ।
- `?grep=` ছাড়া সব test চলে।

**Test যা যা ঢাকে:** ডেমো লগইন যাচাই, ডুপ্লিকেট চ্যাট প্রতিরোধ, বার্তা পাঠানো, নিজের বার্তা এডিট/ডিলিট (অন্যেরটা নয়), ব্লক/আনব্লক, সার্চ, read-status সিমুলেশন, থিম সংরক্ষণ, ডেটাবেস শুরু ও migration, এক্সপোর্ট/ইমপোর্ট ও ভুল ডেটা, খালি ও অতি-বড় বার্তা, বাংলা ও ইমোজি, রিস্টার্টের পর ডেটা, এবং ভার্সন ১-এ কোনো media/attachment নিয়ন্ত্রণ না থাকা।

**সীমা:** এই test শুধু browser-এ logic ও DOM যাচাই করে। পর্দায় চেহারা, কীবোর্ড আচরণ ও Android WebView এতে যাচাই হয় না।

## হাতে পরীক্ষা (দুই Demo প্রোফাইল)

1. Welcome → "নমুনা প্রোফাইল যোগ করুন" → রাহিম হিসেবে ঢুকুন।
2. নতুন চ্যাট → সুমি → বার্তা পাঠান। প্রায় ১ সেকেন্ড পর "ডেলিভার্ড (ডেমো)" দেখাবে।
3. ওপরের অ্যাভাটার থেকে সুমিতে বদলান। অপঠিত ব্যাজ ও "অপঠিত বার্তা" বিভাজক দেখাবে।
4. রাহিমে ফিরলে বার্তাটি "পঠিত (ডেমো)" দেখাবে।
5. বার্তায় ট্যাপ করে উত্তর, কপি, এডিট, ডিলিট পরীক্ষা করুন।
6. সেটিংস থেকে থিম, ব্যাকআপ এক্সপোর্ট/ইমপোর্ট, ব্লক ও সব ডেটা মোছা পরীক্ষা করুন।

## প্রজেক্ট কাঠামো

```
simplechat/
├── index.html
├── css/        base, themes, layout, components
├── js/
│   ├── app.js, router.js, state.js
│   ├── components/   avatar, app-bar, form-field, dialog, states, tab-bar, message-bubble, demo-note
│   ├── screens/      welcome, login, register, chats, new-chat, chat-room, profile,
│   │                 blocked, search, notifications, settings, backup, clear-data
│   ├── services/     auth, chat, message, search, notification, privacy, data, settings
│   ├── storage/      database (IndexedDB), local-adapter (LocalStorage), repository
│   └── utils/        ids, time, dom, validators, emitter, files, theme-boot
├── tests/
└── README.md
```

**স্তর:** Screens → Services → Repository → IndexedDB/LocalStorage। ভবিষ্যতে Firebase যোগ করতে `AuthService`-এ `useAuthProvider(...)` দিয়ে provider বদলানো যায়; `NotificationService.setNativeNotifier(...)` native/FCM adapter-এর জায়গা।

## নিরাপত্তা নোট

- সব ব্যবহারকারীর টেক্সট `textContent` বা text node দিয়ে দেখানো হয়, `innerHTML` দিয়ে নয় (test এটি যাচাই করে)।
- CSP: `script-src 'self'`, `style-src 'self'`, কোনো বাইরের রিসোর্স নেই।
- ইমপোর্ট করা JSON প্রতিটি রেকর্ডে যাচাই হয়, অজানা ফিল্ড ফেলে দেওয়া হয়, আর একটি transaction-এ লেখা হয় (ব্যর্থ হলে পুরোনো ডেটা অক্ষত)।
- ব্যাকআপ ফাইলে বার্তা সাধারণ টেক্সটে থাকে, ফাইলটি নিরাপদে রাখুন।

## সীমাবদ্ধতা (Phase 2-এর আগে সমাধান বাকি)

- Android WebView-তে ফাইল ডাউনলোড ও ফাইল বাছাই native কোড ছাড়া কাজ নাও করতে পারে। ততদিন ব্যাকআপে "টেক্সট কপি করুন" ও "পেস্ট করুন" ব্যবহার করুন।
- `assets/` ফোল্ডারে ওয়েব-আইকন নেই। অ্যাপের লঞ্চার আইকন Android প্রজেক্টেই আছে।

## কোন ফাইলগুলো commit করবেন

`simplechat/` ফোল্ডারের সব ফাইল। `node_modules`, keystore, পাসওয়ার্ড বা কোনো secret কখনো নয়।

## অবস্থা

- **Phase 1 (Web):** কোড লেখা সম্পূর্ণ। "Test চালানো" অংশ অনুযায়ী ফোনে চালিয়ে ফল যাচাই করা বাকি।
- **Phase 2 (Android APK):** কোড লেখা সম্পূর্ণ (`android/`, `.github/workflows/android-build.yml`)। কোনো বিল্ড এখনও চালানো হয়নি।

---

# Android APK (Phase 2)

## কীভাবে কাজ করে

- `android/` একটি WebView র‍্যাপার। বিল্ডের সময় Gradle রুটের `index.html`, `css/`, `js/`, `assets/` APK-র ভেতরে কপি করে (`tests/` নয়)। ইন্টারনেটে থাকা কোনো সাইট লাগে না।
- অ্যাপ লোড হয় `https://appassets.androidplatform.net/assets/www/index.html` থেকে (`WebViewAssetLoader`)। ES modules চালাতে `file://` কাজ করত না, তাই এই পদ্ধতি।
- **কোনো permission নেই:** ইন্টারনেট, স্টোরেজ, ক্যামেরা, মাইক, কন্টাক্ট বা লোকেশন কিছুই চায় না।
- WebView-তে file/content access বন্ধ, `addJavascriptInterface` নেই, বাইরের লিংক ও অন্য সব নেটওয়ার্ক রিকোয়েস্ট ব্লক।
- Back বোতাম: খোলা ডায়ালগ আগে বন্ধ হয়, তারপর পেছনের পেজ, শেষে অ্যাপ থেকে বের হয়।
- ব্যাকআপ এক্সপোর্ট: সিস্টেমের "Save as" স্ক্রিন খোলে। ইমপোর্টে সিস্টেম ফাইল-বাছাই খোলে। কোনো স্টোরেজ permission লাগে না।
- Application ID: `io.github.mohiuddinramzan.simplechat` (বদলাতে চাইলে `android/app/build.gradle`-এ `namespace` ও `applicationId`, আর `MainActivity.java`-র `package` লাইন ও ফোল্ডারের নাম একসঙ্গে বদলাতে হবে)।

## GitHub-এ push (Termux)

```bash
cd ~/simplechat
chmod +x android/gradlew
git add .
git update-index --chmod=+x android/gradlew
git commit -m "Phase 2: Android WebView wrapper and APK workflow"
git push
```

## APK বানানো ও নামানো

1. GitHub-এ repository খুলুন → **Actions** ট্যাব → **Android Build**।
2. `main`-এ push করলে নিজে থেকে চলে। হাতে চালাতে **Run workflow** চাপুন।
3. সবুজ টিক এলে ওই run খুলুন। নিচে **Artifacts** অংশে `SimpleChat-debug-apk` আছে, সেটি চাপলে ZIP নামে (১৪ দিন থাকে)।
4. ফোনের ফাইল ম্যানেজারে ZIP খুলে `app-debug.apk` বের করুন।
5. APK ট্যাপ করুন। বলা হলে ওই অ্যাপের (ব্রাউজার বা ফাইল ম্যানেজার) জন্য **"Install unknown apps"** চালু করুন।

এটি **debug** APK, Play Store-এর জন্য নয়। কোনো keystore বা secret প্রয়োজন হয় না, আর কখনো commit করবেন না।

## Gradle Wrapper

- `android/gradle/wrapper/gradle-wrapper.properties` (Gradle 8.7) আর একটি সরল `android/gradlew` আছে। `gradle-wrapper.jar` (বাইনারি) এই প্রজেক্টে নেই।
- **কিছু না করলেও চলবে:** jar না থাকলে workflow `gradle wrapper` চালিয়ে অফিসিয়াল wrapper তৈরি করে নেয়।
- **ঐচ্ছিক (repository-তেই jar রাখতে):** Termux-এ
  ```bash
  cd ~/simplechat/android
  curl -fL -o gradle/wrapper/gradle-wrapper.jar https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradle/wrapper/gradle-wrapper.jar
  unzip -t gradle/wrapper/gradle-wrapper.jar | tail -1
  ```
  শেষ লাইনে `No errors detected` আসতে হবে, নইলে ফাইলটি মুছে ফেলুন। এরপর `git add` করে push করুন।

## সমস্যা হলে

| লক্ষণ | সম্ভাব্য কারণ ও করণীয় |
|---|---|
| Actions-এ লাল ❌ | Run খুলে লাল ধাপ ও তার নিচের লাল লাইনগুলো কপি করে পাঠান |
| `Verify APK output path` ব্যর্থ | বিল্ড হয়েছে কিন্তু APK অন্য নামে/জায়গায়। ধাপটির লগে খুঁজে পাওয়া সব `.apk`-র তালিকা দেখাবে |
| `Could not find ... androidx...` | সাময়িক নেটওয়ার্ক সমস্যা, **Re-run jobs** দিন |
| `SDK location not found` / `platform not found` | `Set up Android SDK` ধাপের লগ পাঠান |
| ইনস্টলে "App not installed" | আগের কোনো সংস্করণ অন্য সই দিয়ে ইনস্টল আছে। সেটি আনইনস্টল করে আবার চেষ্টা করুন |
| অ্যাপ খুলে সাদা পর্দা | অ্যাপ বন্ধ করে আবার খুলুন। না হলে "অ্যাপ লোড করা যায়নি" পাতা আসার কথা, আসলে তা জানান |
| ব্যাকআপ "Save as" না আসা | বিষয়টি জানান, সঙ্গে "টেক্সট কপি করুন" বিকল্প ব্যবহার করুন |
| Workflow-ই দেখা যাচ্ছে না | `.github/workflows/android-build.yml` repository-র রুটে আছে কিনা এবং `main` branch-এ push হয়েছে কিনা দেখুন |

## যা এখনও যাচাই হয়নি

- কোনো Android বিল্ড চালানো হয়নি (এখানে Gradle ও Android SDK ছিল না), তাই APK আদৌ তৈরি হবে কিনা নিশ্চিত নয়।
- ফোনে WebView, Back বোতাম, কীবোর্ড, ডার্ক মোড ও ব্যাকআপ সেভ/ইমপোর্ট আসল ডিভাইসে পরীক্ষা হয়নি।
