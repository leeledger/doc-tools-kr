# 문서딱 Android 앱 (TWA)

https://docttak.com 을 Google Play 앱으로 내는 Trusted Web Activity 프로젝트. Bubblewrap CLI(`package.json`에 정확한
버전 고정)로 만든 Gradle 프로젝트를 그대로 커밋해 둔다. **원본은 `twa-manifest.json`** 이고, 나머지(app/, gradle 등)는
`bubblewrap update`가 다시 만든다. 손으로 고치지 말 것.

| 항목 | 값 |
|---|---|
| 패키지 이름 | `com.docttak.app` (첫 업로드 뒤 영구, 바꿀 수 없음) |
| 시작 주소 | `https://docttak.com/?utm_source=play&utm_medium=twa` (GA4 소스/매체 `play / twa`) |
| targetSdk / compileSdk | 36 (Bubblewrap 1.27.0 템플릿 값. Play 요구 수준 확인: developer.android.com 「target API level requirements」) |
| 업로드 키 | `C:\Users\force\.docttak-keys\docttak-upload.jks`, 별칭 `upload` (저장소 밖) |
| Digital Asset Links | `../public/.well-known/assetlinks.json` (지문은 `npm run fingerprint`로만 넣음) |
| 등록정보·이미지·답변 | `listing/` |

## 처음 한 번: 준비 (소유자)

PowerShell, 저장소의 `twa` 폴더에서:

```powershell
npm ci
npx bubblewrap doctor          # JDK 17, Android SDK 경로 확인 (~/.bubblewrap/config.json)
```

사이트에 이 브랜치(매니페스트 바로가기, assetlinks.json)가 **배포된 뒤** 프로젝트를 한 번 새로 만든다. 운영 매니페스트를
앱 안 사본(`app/src/main/res/raw/web_app_manifest.json`)으로 다시 받아 오기 위해서다. 바뀐 파일은 커밋한다.

```powershell
npx bubblewrap update --skipVersionUpgrade
```

## 처음 한 번: 업로드 키 만들기 (소유자만)

비밀번호는 **이 터미널의 환경 변수에만** 둔다. 파일, 저장소, 메모, 채팅에 적지 않는다. 영문·숫자만으로 20자 이상을 권한다
(Bubblewrap이 비밀번호를 따옴표로 감싸 서명 도구에 넘기므로 `"`, `$`, `%`, `` ` `` 같은 기호는 빌드를 깨뜨릴 수 있다).
JDK 17의 기본 키 저장소 형식(PKCS12)은 키 비밀번호와 저장소 비밀번호가 같아야 하므로 두 변수에 같은 값을 넣는다.

```powershell
$sec = Read-Host "업로드 키 비밀번호" -AsSecureString
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
$env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD

New-Item -ItemType Directory -Force C:\Users\force\.docttak-keys | Out-Null
keytool -genkeypair -v -keystore C:\Users\force\.docttak-keys\docttak-upload.jks -alias upload `
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Docttak, C=KR" `
  -storepass:env BUBBLEWRAP_KEYSTORE_PASSWORD -keypass:env BUBBLEWRAP_KEY_PASSWORD
```

**백업**: `docttak-upload.jks` 파일과 비밀번호를 서로 다른 오프라인 장소 두 곳에 보관한다. 잃어버리면 Play Console에서 업로드 키
재설정을 요청해야 하고, 그동안 업데이트를 못 낸다 (Play 앱 서명 사용 시).

## 빌드 (업로드마다)

같은 터미널에서 (새 터미널이면 위의 `Read-Host` 세 줄을 다시 실행):

```powershell
npm run build                 # = bubblewrap build --skipPwaValidation → app-release-bundle.aab (서명됨)
keytool -printcert -jarfile app-release-bundle.aab   # SHA256 줄이 아래 지문과 같아야 함
```

- `--skipPwaValidation`: Bubblewrap의 온라인 PageSpeed 검사를 건너뛴다. 같은 검사를 저장소 CI의 Lighthouse가 매 배포마다 한다.
- 결과물 `*.aab`, `*.apk`, `*.idsig`는 `.gitignore` 대상이다. 저장소에 올리지 않는다.
- 빌드가 끝나면 터미널을 닫거나 `Remove-Item Env:BUBBLEWRAP_*` 로 변수를 지운다.

## Digital Asset Links (앱 주소창 없애기)

`assetlinks.json`은 지문이 비어 있는 채로 배포된다. 실제 인증서가 생긴 뒤에만 지문을 넣는다. 지문을 손으로 만들어 넣지 않는다.

1. **1단계 (업로드 키)** — 키를 만든 뒤, 비밀번호 변수가 있는 터미널에서:
   ```powershell
   npm run fingerprint            # keytool로 업로드 키 SHA-256을 읽어 assetlinks.json에 추가
   ```
2. **2단계 (Play 앱 서명 키)** — 첫 AAB 업로드 뒤 Play Console > 앱 무결성 > 앱 서명의 「앱 서명 키 인증서」 SHA-256을 복사해:
   ```powershell
   npm run fingerprint -- --add AB:CD:...(복사한 값)
   ```
   Play에서 설치한 앱은 이 키로 서명되므로, 이 단계를 빠뜨리면 앱에 주소창이 보인다.
3. 각 단계 뒤 `public/.well-known/assetlinks.json`을 커밋·배포하고 확인한다:
   ```powershell
   curl.exe -sI https://docttak.com/.well-known/assetlinks.json      # 200, Content-Type: application/json
   curl.exe -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://docttak.com&relation=delegate_permission/common.handle_all_urls"
   ```

`--dry-run`을 붙이면 파일을 쓰지 않고 결과만 보여 준다. 형식(대문자 콜론 16진수, 중복 없음, 패키지 일치)은
`tests/unit/assetlinks.test.ts`가 검사한다.

## 버전 규칙

- 업로드할 때마다 `twa-manifest.json`의 `appVersionCode`를 1 올린다. 한 번 쓴 번호는 다시 쓰지 않는다 (Play가 거부).
- `appVersionName`(과 같은 값의 `appVersion`)은 사람이 읽는 번호 (1.0.0 → 1.0.1 …).
- 고친 뒤 `npx bubblewrap update --skipVersionUpgrade`로 프로젝트를 다시 만들고 커밋한 다음 빌드한다.
- 웹 쪽 수정은 앱 업데이트가 필요 없다 (앱은 사이트를 그대로 연다). 앱 업데이트는 아이콘·이름·바로가기·색·targetSdk가 바뀔 때만.
- `bubblewrap update`는 app/ 폴더를 통째로 다시 만든다. targetSdk 등을 직접 고쳐야 했다면 update 뒤에 다시 적용한다
  (현재 템플릿 값 36으로 충분해 직접 고친 곳은 없다).

## 실제 폰 확인 목록 (내부 테스트 트랙 설치 후)

- [ ] 앱을 열면 주소창 없이 전체 화면 (주소창이 보이면 assetlinks 2단계 확인)
- [ ] 홈 화면 아이콘·이름 「문서딱」, 아이콘 길게 누르면 바로가기 4개, 각각 해당 도구가 열림
- [ ] 파일 고르기 → Android 파일 선택 창이 뜨고 PDF·사진·HWP를 고를 수 있음
- [ ] 결과 내려받기 → 다운로드 알림이 뜨고 「다운로드」 폴더에 파일이 있음
- [ ] 한 번 연 뒤 비행기 모드: 홈과 써 본 도구가 열리고 동작함. 열어 본 적 없는 페이지는 오프라인 안내 페이지
- [ ] 범위 밖 링크(외교부·정부24 등 출처 링크)는 위쪽 막대가 있는 Custom Tab으로 열리고, 닫으면 앱으로 돌아옴
- [ ] 뒤로 가기: 앱 안에서는 이전 페이지, 첫 화면에서는 앱 종료
- [ ] GA4 실시간 보고서에 소스/매체 `play / twa` 방문이 잡힘
