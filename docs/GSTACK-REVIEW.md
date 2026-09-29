# gstack 도입 검토 (garrytan/gstack v1.91.6.0, 2026-09-28)

- 검토일: 2026-09-29
- 방식: 읽기 전용 정적 분석. setup·설치·빌드는 하지 않았고 `~/.claude`도 건드리지 않았다.
- 검토한 사본: scratchpad의 `gstack` 클론 (커밋 `65bfb0c`, shallow clone)
- 대상 환경: Windows 11, Claude Code CLI, Git Bash/PowerShell, Node 22, Python. 기존 Three Man Team(architect/builder/reviewer + /sprint + deploy gate)을 쓰고 있고, 스킬은 code-review, simplify, security-review, run이 있다.

---

## 0. 결론 요약

**gstack 전체 설치(`./setup`)는 하지 않는다.** 대신 프롬프트 몇 가지만 기존 Three Man Team 파일로 옮겨 오고(ADAPT), `careful` 훅 하나만 벤더링을 선택 사항으로 둔다.
브라우저 도구가 필요한 문제는 gstack `browse`로 풀리지 않는다. 이미 쓰고 있는 9333 포트 Chrome에 붙는 얇은 Playwright CLI를 직접 만드는 쪽이 가장 싸고 안전하다(4장 참고).

이유:
1. **런타임이 무겁다.** Bun 필수, Windows에서는 Node도 필요하다. 약 58MB짜리 컴파일 바이너리를 빌드하고 Playwright Chromium을 다운로드하며, npm 의존성으로 `@ngrok/ngrok`, `@huggingface/transformers`(112MB ONNX 모델 지연 다운로드)가 딸려 온다. `/cso`는 여기에 VS 2022 Build Tools와 Docker 이미지까지 요구한다.
2. **전역 설정을 바꾼다.** 스킬 약 40개를 `~/.claude/skills/<짧은이름>/`에 복사하고(`/review`, `/ship`, `/health`, `/learn` 등), `~/.claude/settings.json`에 **Stop 훅을 기본값으로 등록**한다. 여기에 PreToolUse/PostToolUse 훅 등록 프롬프트, 팀 모드의 SessionStart 훅, 프로젝트 CLAUDE.md 라우팅 주입 제안(수락하면 커밋까지 한다)이 더해진다.
3. **변경 속도가 너무 빠르다.** CHANGELOG가 1.2MB이고 v1.91까지 왔다. 스킬을 쓸 때마다 GitHub 업데이트를 확인하고, 업그레이드 경로에 `git reset --hard origin/main`이 들어 있다. "유지보수 부담 최소"라는 우리 우선순위와 맞지 않는다.
4. **토큰 비용이 크다.** 거의 모든 스킬이 약 400줄(8~10k 토큰)짜리 공통 프리앰블을 가지고 있고, 호출 1회에 12k~33k 토큰이 든다. 우리 에이전트 3개와 sprint.md를 합쳐도 337줄이다.
5. **가드레일과 충돌한다.** `/ship`은 push와 PR 생성, `/land-and-deploy`는 머지·배포·자동 revert, `/qa`·`/design-review`는 수정 사항을 자동 커밋한다. 그리고 browse에는 봇 탐지 회피(stealth)가 항상 켜져 있다. 이는 AGI_AGENT의 "캡차 우회 금지, 공식 API나 사용자 세션만 사용" 원칙과 맞지 않는다.

---

## 1. gstack이 무엇인가

### 1.1 정체
Garry Tan(YC)이 만든 Claude Code용 "가상 엔지니어링 팀" 스킬 모음이다. MIT 라이선스이고 슬래시 커맨드 약 50개로 이루어져 있다. 역할 스킬(CEO, 엔지니어링 매니저, 디자이너, 리뷰어, QA, CSO, 릴리스 엔지니어)과 파워 툴(browse, careful, freeze 등), 그리고 자체 헤드리스 브라우저 데몬(`$B`)이 핵심이다. Codex, Cursor, OpenCode 등 10개 호스트를 지원한다.

### 1.2 아키텍처
- **스킬**: `<skill>/SKILL.md.tmpl`에서 `bun run gen:skill-docs`로 `SKILL.md`를 생성한다. 각 SKILL.md는 (a) `gstack-skill-start` bash 프리앰블 실행, (b) AskUserQuestion 형식, 톤, "Boil the Ocean" 원칙, 텔레메트리 규칙 같은 약 400줄의 공통 블록, (c) 실제 방법론 본문, (d) `gstack-skill-end` 텔레메트리 호출로 구성된다.
- **bin/**: bash와 bun 스크립트 약 90개(config, telemetry, update-check, learnings, timeline, gbrain 동기화, egress 영수증 등).
- **상태 디렉터리**: `~/.gstack/`(config.yaml, analytics/, projects/<slug>/learnings·timeline, sessions/, models/, egress 영수증). 프로젝트별로는 `<repo>/.gstack/browse.json`(데몬 포트와 토큰)이 생긴다.
- **browse(`$B`)**: 컴파일된 CLI가 `127.0.0.1:<랜덤포트>`의 데몬에 Bearer 토큰을 붙여 HTTP POST를 보내고, 데몬이 Playwright로 Chromium(기본 헤드리스)을 조작한다. 첫 호출은 약 3초, 이후는 100~200ms이며 30분 동안 쓰지 않으면 종료된다. 스냅샷에 `@e3` 같은 ref를 붙여 클릭하는 방식이다. macOS에서는 Aside 브라우저(사용자의 실제 프로필)를 우선 쓰고, Windows에서는 항상 자체 Chromium으로 대체된다.
  - **Windows에서의 특이점**: Bun이 Chromium을 띄우지 못한다(oven-sh/bun#4253). 그래서 `browse/dist/server-node.mjs`를 Node로 실행하고, setup이 `npm install --no-save playwright @ngrok/ngrok`을 수행한다.
  - **기존 Chrome(9333)에 붙는 기능이 없다.** 문서에도 코드에도 `connectOverCDP(엔드포인트)` 경로가 없다. `$B connect`는 gstack이 직접 띄우는 "GStack Browser"(Playwright persistent context, 확장 프로그램, stealth 적용)다. 로그인은 `$B handoff`로 보이는 창을 연 뒤 사람이 로그인하고 `$B resume`하는 방식이다.
  - 문서가 명시하는 사항: Chrome 136 이상은 기본 user-data-dir에 대한 원격 디버깅을 차단한다. 우리 9333 Chrome도 별도 `--user-data-dir`을 써야 하는데, 지금 동작하고 있다면 이미 그렇게 하고 있는 것이다.

### 1.3 setup이 설치하는 것 (기본 `./setup`, host=claude)
| 대상 | 내용 |
|---|---|
| `~/.claude/skills/gstack/` | 저장소 클론 위치(README가 지정하는 설치 경로) |
| `~/.claude/skills/<name>/` | 스킬 약 40개. Windows에서는 심볼릭 링크 대신 **파일 복사**를 하므로 `git pull` 후 `./setup`을 다시 돌려야 한다. 기본값은 prefix 없는 짧은 이름이다(`/review`, `/ship`, `/health`, `/learn`, `/retro` 등). |
| `~/.claude/settings.json` | **Stop 훅(timeline-stop-hook, 기본 yes)**. plan-tune PreToolUse/PostToolUse 훅은 TTY에서 물어본 뒤 등록하고, `--team`이면 SessionStart 훅(자동 업데이트)을 등록한다. 수정 전에 `settings.json.bak.<ts>` 백업을 만든다. |
| `~/.gstack/` | config, analytics, learnings, timeline, 세션 마커 |
| 빌드 산출물 | `bun install`, `browse/dist/browse.exe`(약 58MB), `server-node.mjs`, Playwright Chromium 캐시 |
| 프로젝트 CLAUDE.md | 첫 스킬 실행 때 "Skill routing" 섹션 추가를 AskUserQuestion으로 묻는다. **수락하면 `git commit`까지 수행한다.** README 설치 문구도 CLAUDE.md에 "claude-in-chrome 사용 금지" 섹션을 추가하라고 지시한다. |

전역인가 프로젝트별인가: 기본은 **전역 설치**다(`--local`은 deprecated). `--team`은 레포에 `.claude/`와 CLAUDE.md 부트스트랩을 커밋하고, SessionStart 훅으로 매 세션 자동 업데이트를 건다.

### 1.4 업데이트 메커니즘
- 스킬을 시작할 때마다 `gstack-update-check`가 `raw.githubusercontent.com/garrytan/gstack/main/VERSION`과 `git ls-remote`를 조회한다. 한 시간에 한 번으로 스로틀되고, `update_check` 설정 기본값은 true다.
- 새 버전이 있으면 AskUserQuestion으로 4가지 선택지를 준다. `auto_upgrade: true`(기본 false)면 묻지 않고 업그레이드한다.
- `/gstack-upgrade`는 `git fetch`, `git pull --ff-only --autostash`를 시도하고 실패하면 `git reset --hard origin/main`을 한 뒤 `./setup`을 다시 실행한다.
- 결과적으로 **업스트림 main의 변경이 곧 에이전트가 따르는 지시문이 된다.** 공급망 관점에서 가장 큰 신뢰 가정이다.

---

## 2. 보안·프라이버시 감사

### 2.1 네트워크 송신 지점
| 지점 | 기본값 | 보내는 것 | 판단 |
|---|---|---|---|
| **텔레메트리** `gstack-telemetry-sync`에서 Supabase `frugpmstpnojnhfyimgv.supabase.co/functions/v1/telemetry-ingest`로 | `telemetry: off` | 스킬명, 소요 시간, 결과, 크래시. community 모드면 설치 ID도 보낸다. repo/branch는 전송 전에 제거한다. | 기본은 꺼져 있지만, 첫 사용 시 뜨는 동의 프롬프트의 **권장(recommended) 선택지가 "community"(고유 기기 ID 포함)**다. 반드시 off로 고정해야 한다. |
| **업데이트 확인** GitHub raw와 ls-remote | **on** | GET 요청만(IP 노출) | `update_check false`로 끄는 것을 권장한다. |
| **Codex 교차 리뷰** `/review`·`/ship`의 adversarial 단계, `/plan-*`, `/design-review` | `codex_reviews: enabled` | **diff와 코드를 OpenAI Codex로 전송**한다. codex CLI가 설치되어 있을 때만 해당한다. | 반드시 `codex_reviews disabled`로 설정한다. |
| **gbrain/artifacts sync** `gstack-brain-sync`가 원격 git으로 push | off(동의 게이트 있음) | 학습 내용, 타임라인 등 | 사용하지 않는다. |
| **/pair-agent** ngrok 터널 | off(동의 게이트 있음) | 로컬 브라우저를 원격 에이전트에 노출 | 절대 사용하지 않는다. |
| **보안 분류기** HuggingFace에서 112MB ONNX 모델 | 사이드바 PTY 사용 시 지연 로드 | 다운로드만 | 사이드바를 쓰지 않으면 발생하지 않는다. |
| **impeccable 엔진** design 스킬에서 1회 설치 제안 | 수락할 때만 | GitHub 릴리스 다운로드(체크섬 고정) | 거절한다. |
| **Aside 추천** | macOS만 해당 | 없음(제품 홍보 문구) | Windows에서는 무관하다. 다만 "Aside를 이름으로 추천하는 것만 예외"라는 문구가 스킬 전반에 박혀 있다. |

긍정적인 점: 송신 전에 `~/.gstack` 아래에 **egress 영수증**(페이로드 해시)을 먼저 기록한다(텔레메트리는 fail-closed). 텔레메트리에서 repo/branch 필드는 jq `del()`로 구조적으로 제거한다. `/cso`는 결과를 gbrain이나 텔레메트리로 보내지 않는다고 명시한다. **코드나 프롬프트 본문을 제3자에게 보내는 경로는 Codex 교차 리뷰뿐이다**(opt-out 방식이라는 점이 문제다).

### 2.2 자동 실행 훅
- **Stop 훅(timeline-stop-hook)**: setup 기본값으로 전역 `settings.json`에 등록되고, 매 세션 종료 시 실행된다. 로컬 기록만 하지만 **우리 모든 프로젝트의 모든 세션**에 걸린다. `--no-timeline-stop-hook`으로 막아야 한다.
- **plan-tune 훅(PreToolUse/PostToolUse, AskUserQuestion 가로채기)**: TTY에서 물어본다. `--no-plan-tune-hooks`로 막는다.
- **SessionStart 자동 업데이트 훅**: `--team`일 때만 걸린다. 사용하지 않는다.
- **스킬 frontmatter 훅**(careful/freeze/guard): 해당 스킬을 호출한 세션에서만 동작한다. 안전하다.
- **`gstack-skill-start` 프리앰블**: 스킬 호출 때마다 bash로 업데이트 확인, 세션 마커, gbrain 감지, `~/.claude.json` 읽기(gbrain MCP 탐지)를 수행한다. 프리앰블 출력에 담긴 `GSTACK_INSTRUCTION` 블록을 모델이 **지시로 따르도록** 설계되어 있다. SESSION_ID 대조와 sanitize로 위조를 막고는 있지만, 스크립트 출력이 모델 지시 채널이 된다는 구조 자체가 공격면이다.

### 2.3 curl|bash
저장소 코드가 `curl | bash`로 설치하는 경로는 발견하지 못했다. 설치는 `git clone && ./setup`이다. setup 안에서 `bunx playwright install chromium`, `npm install --no-save playwright @ngrok/ngrok`, (Linux에서) apk/apt 폰트 설치를 실행한다.

### 2.4 쿠키 가져오기 (`/setup-browser-cookies`, `$B cookie-import-browser`)
- 실제 브라우저의 쿠키 SQLite를 읽고 복호화한다. macOS는 Keychain, Linux는 libsecret, **Windows는 `Local State`의 os_crypt 키를 DPAPI로 풀고** AES-GCM으로 복호화한다.
- Windows의 Chrome, Edge, Brave는 대부분 **App-Bound Encryption(v20)**이라 gstack이 복호화하지 못한다. "native extraction"은 자격 검증 게이트 뒤에 비활성화되어 있다. 결국 Windows의 Chrome 계열에서는 **실효성이 낮고** `$B handoff`로 수동 로그인하라고 안내한다.
- 가져온 쿠키는 기본적으로 **데몬 메모리에만** 둔다. `BROWSE_PERSIST_STATE=1`(기본 off)이나 `$B state save`를 쓰면 쿠키가 **평문 JSON(0600)**으로 `<stateDir>/session-state.json`에 저장된다. Windows에서 0600 권한은 의미가 약하다.
- 판단: **SKIP.** 이 기능은 사람이 여는 브라우저 세션만 쓰고 토큰을 디스크에 저장하지 않는다는 원칙(AGI_AGENT CLAUDE.md)에 어긋난다. 필요 없는 에이전트가 브라우저 쿠키 DB 전체를 읽을 수 있는 권한을 갖게 되는 것 자체가 위험이다.

### 2.5 기타 우려
- **Stealth 항상 켜짐**: `navigator.webdriver` 마스킹, `window.chrome.runtime` 위조, `Function.prototype.toString` Proxy 등으로 Cloudflare나 DataDome 탐지를 회피한다. 원문에 "anti-bot-protected sites load cleanly"라고 되어 있다. **AGI_AGENT의 "캡차 우회 금지" 가드레일과 정면으로 충돌한다.** doc-tools-kr 자체 QA에는 필요 없는 기능이다.
- **자동 커밋과 push**: `/qa`·`/design-review`는 수정할 때마다 원자적으로 커밋하고, design-review는 테스트 프레임워크를 부트스트랩하면서 CLAUDE.md를 수정하고 커밋까지 한다. `/ship`은 `git push -u`와 PR 생성, `/land-and-deploy`는 머지·배포 대기·revert를 한다. `SESSION_KIND: spawned`면 "권장 선택지를 자동 선택"하는데, 파괴적인 선택지만 예외다. 즉 서브에이전트로 돌리면 사람 승인 게이트를 건너뛸 수 있는 구조다.
- **라이선스**: MIT(Copyright 2026 Garry Tan). 일부 파일은 Apache-2.0(impeccable, Google DESIGN.md) 파생물이고 NOTICE.md와 licenses/에 명시되어 있다. **프롬프트를 발췌해서 쓸 때는 MIT 저작권 고지를 남겨야 한다**(adapt한 파일 하단에 출처 한 줄을 넣으면 충분하다).

### 2.6 설치한다면 반드시 끌 것 (체크리스트)
```bash
./setup --no-team --no-plan-tune-hooks --no-timeline-stop-hook --prefix
B=~/.claude/skills/gstack/bin/gstack-config
$B set telemetry off
$B set update_check false
$B set auto_upgrade false
$B set codex_reviews disabled
$B set proactive false
$B set routing_declined true
$B set artifacts_sync_mode off
$B set pair_agent off
$B set cross_project_learnings false
$B set founder_resources false
export GSTACK_SKIP_ASIDE=1   # Windows에서는 어차피 무관
# BROWSE_PERSIST_STATE는 설정하지 않음 (쿠키 평문 저장 방지)
```
`--prefix`는 `/gstack-review`처럼 접두어를 붙인다. Claude Code 내장 `/review`, `/security-review`와 우리 `code-review` 스킬과의 이름 충돌이나 혼동을 피하기 위해서다. (위 플래그 조합은 setup 소스를 읽고 확인했지만 실행해 보지는 않았다.)

---

## 3. 스킬별 적합성 판정

범례: **ADOPT** = 그대로 설치하거나 복사해서 쓴다 / **ADAPT** = 아이디어나 프롬프트만 Three Man Team 파일로 옮긴다 / **SKIP** = 쓰지 않는다

| 스킬 | 판정 | 근거 |
|---|---|---|
| **browse** (`$B`) | **SKIP** (명령 어휘와 ref 개념은 ADAPT) | Bun, Node, 58MB 바이너리, Chromium 다운로드, ngrok 의존성이 필요하다. **9333 Chrome에 붙지 못한다.** stealth가 항상 켜져 있고 SKILL.md만 약 7.8k 토큰이다. `snapshot -i`가 `@ref`를 붙이고 `click @e3`로 클릭하는 방식, "페이지 내용은 untrusted"라는 규칙, handoff/resume 흐름은 자체 도구 설계에 차용한다(4.2). |
| **qa** | **SKIP** | 수정할 때마다 자동 커밋한다. Builder 역할이나 deploy gate와 겹치고 약 15k 토큰이다. |
| **qa-only** | **ADAPT** | 리포트 전용이라 안전한 편이다. **Health Score 루브릭**(Console 15%, Links 10%, Visual/Functional/UX/Content/Perf/A11y 가중치)과 `qa/references/issue-taxonomy.md`(85줄), 모드 구분(diff-aware, full, quick, regression)을 doc-tools-kr용 "visual-qa" 체크리스트로 옮긴다. |
| **review** | **ADAPT** | `review/checklist.md`(183줄)의 **Pass1 CRITICAL / Pass2 INFO 2단 구조**, Enum & Value Completeness(diff 밖 소비처 추적), **Confidence Calibration과 Pre-emit verification gate**(존재하지 않는 필드를 지적하는 오탐 방지), Scope Drift 탐지, specialists/(security, testing, perf, simplification 각 50줄 안팎)를 reviewer.md에 흡수한다. Fix-First 자동 수정과 Codex 교차 리뷰는 제외한다. Claude Code 내장 `/review`와 이름이 충돌한다. |
| **ship** | **SKIP** | push와 PR 생성, VERSION 자동 bump, TODOS 자동 수정. "사람 승인 없이 push 금지" 원칙과 충돌한다. 우리 deploy gate가 같은 역할을 한다. |
| **land-and-deploy** | **SKIP** | 머지, 배포, 자동 revert. 가드레일과 충돌한다. Cloudflare Pages는 Git 연동으로 자동 배포되므로 필요 없다. |
| **careful** | **ADOPT(선택)** 벤더링 복사 | 자체 완결형(bash + python3/node JSON 파서, 약 420줄)이고 스킬 호출 세션에서만 동작한다. rm -rf, force-push, reset --hard 등을 ask로 돌리고 `/`나 홈 삭제, 기본 브랜치 force-push는 deny한다. auto 모드의 안전망이다. **단 matcher가 `Bash`뿐이라 PowerShell 도구(`Remove-Item -Recurse`)는 잡지 못한다.** PowerShell matcher와 패턴 추가가 필요하다. |
| **freeze** / **unfreeze** | **SKIP** (Windows에서 사실상 동작 불가) | `check-freeze.sh`는 `/`로 시작하지 않는 경로를 상대 경로로 취급한다. Windows의 `C:\...` 또는 `C:/...` 경로는 `$(pwd)/C:\...`로 망가지고 `/c/...` 경계와 절대 일치하지 않는다. 결과적으로 **모든 Edit/Write가 deny된다**(fail-closed라 안전하지만 쓸 수 없다. 정적 분석 결과이며 실행 검증은 하지 않았다). 쓰려면 `cygpath -u` 정규화 패치가 필요하다. |
| **guard** | **SKIP** | careful + freeze 조합이다. freeze 문제를 그대로 물려받는다. |
| **investigate** | **ADAPT** | **Iron Law "근본 원인 없이 수정 금지"**, 5단계(증상 수집, 코드 경로 추적, `git log -- <files>`, 재현 → 패턴 → 가설 검증 → 구현 → 검증), **3번 실패하면 아키텍처를 의심하고 중단**, 5개 파일 넘게 수정하면 사람 확인, "should fix라고 말하지 말고 증명하라", DONE/DONE_WITH_CONCERNS/BLOCKED 상태. builder.md의 버그 수정 절에 20줄 정도로 옮긴다. |
| **plan-eng-review** | **ADAPT** | 아키텍처, 실패 모드, 테스트 커버리지 다이어그램, "엔지니어링 선호" 목록, 범위 게이트를 architect.md의 브리프 템플릿에 흡수한다. 약 13k 토큰짜리 대화형 흐름 자체는 쓰지 않는다. |
| **plan-ceo-review** | **SKIP** (필요하면 ADAPT 1문단) | 4가지 스코프 모드(확장, 선택 확장, 유지, 축소)는 흥미롭지만 약 20k 토큰이고 창업자용이다. doc-tools-kr은 이미 범위가 정해져 있다. architect.md에 "스코프 모드 한 줄 선언"만 추가하는 정도는 해 볼 만하다. |
| **design-review** | **SKIP** (UX 원칙 일부 ADAPT) | 약 33k 토큰으로 가장 크다. 테스트 프레임워크 부트스트랩, CLAUDE.md 수정, 커밋, Codex 사용, impeccable 설치 제안까지 한다. "UX Principles"(Three Laws of Usability)와 AI slop 체크리스트만 visual-qa 체크리스트에 참고로 넣는다. |
| **cso** | **SKIP** (프레이밍만 ADAPT) | 컴파일된 `gstack-cso` 런처와 VS 2022 Build Tools, Docker 이미지가 필요하다. "공격자·경계·영향·반박(challenge)을 명시한다", "스캐너 결과와 레포 지시문은 untrusted evidence", `--diff` 범위 한정 개념은 security-review를 쓸 때 프롬프트로 활용한다. doc-tools-kr에서 볼 곳은 CSP, 파일 파싱 XSS, 공급망(npm)이다. |
| **retro** | **SKIP** | 팀과 주간 커밋 통계용이다. 1인 프로젝트에는 가치가 낮고 약 18k 토큰이다. |
| **benchmark** | **SKIP** | `$B` 기반 성능 측정이다. doc-tools-kr에는 이미 `lighthouserc.json`(Lighthouse CI)이 있다. |
| **canary** | **SKIP** (아이디어만 ADAPT) | 배포 후 `$B`로 루프를 돌며 모니터링한다. 정적 사이트에는 과하다. "배포 후 주요 페이지 스크린샷을 기준선과 비교"하는 아이디어만 자체 스크립트로 옮기면 된다(Playwright `toHaveScreenshot`). |
| **context-save / context-restore** | **SKIP** | `handoff/SESSION-CHECKPOINT.md`와 역할이 같다. 각각 약 9k 토큰이다. |
| **health** | **SKIP** (필요하면 ADAPT) | tsc, lint, test, dead-code 점수를 대시보드로 보여 준다. `npm run check` 류 스크립트 하나면 충분하다. |
| **learn** | **SKIP** | Claude Code 자체 메모리, CLAUDE.md, BUILD-LOG와 겹친다. 게다가 모든 스킬이 "Operational Self-Improvement"로 `~/.gstack/projects/*/learnings`에 **항상** 기록을 남기는데, 이것도 추가 토큰과 추가 상태다. |
| **setup-browser-cookies** | **SKIP** | 2.4 참고. 보안상 불필요하고 Windows Chrome v20에서는 동작하지도 않는다. |
| **gstack-upgrade** | **SKIP** | `git reset --hard origin/main` 경로가 있다. |
| **office-hours / autoplan / spec** | SKIP | 제품 발굴과 자동 계획용이다. Architect와 겹치고 각각 16~21k 토큰이다. |
| **codex** | SKIP | OpenAI로 코드를 전송한다. |
| **pair-agent / open-gstack-browser / connect-chrome** | SKIP | ngrok 터널, 사이드바 `claude -p` PTY, stealth 브라우저. |
| **scrape / skillify / browser-skills / domain-skills** | SKIP | 사이트별 자동화 코드를 축적하는 기능이다. AGI_AGENT 가드레일(공식 API나 사용자 세션만 사용)과 맞지 않는다. |
| **setup-gbrain / sync-gbrain** | SKIP | 외부 메모리 서비스다. |
| **document-release / document-generate** | SKIP | 문서 자동 갱신 후 커밋한다. 필요할 때 수동으로 하면 된다. |
| **make-pdf / diagram** | SKIP | doc-tools-kr 제품 기능과 혼동될 수 있다. |
| **ios-\*, plan-devex-review, devex-review, plan-design-review, design-consultation/shotgun/html, landing-report, benchmark-models, plan-tune, deslop-shared-libs** | SKIP | 대상이 다르거나(iOS, DX), 토큰 대비 가치가 낮다. |

### 기존 구성과의 충돌 정리
- **이름 충돌**: gstack 기본 설치는 prefix가 없어서 `/review`가 Claude Code 내장 `/review`를 가린다. `/health`, `/learn`, `/retro`도 전역 네임스페이스를 차지한다.
- **역할 중복**: plan-eng-review와 Architect, review와 Reviewer(Richard) 및 code-review 스킬, qa와 Builder, ship·land-and-deploy와 deploy gate, context-save와 SESSION-CHECKPOINT, learn과 메모리가 겹친다.
- **가드레일 충돌**: ship(push), land-and-deploy(merge·deploy), qa·design-review(자동 커밋), spawned 모드의 자동 선택, stealth(탐지 회피), cookie import(세션 토큰을 디스크에 저장), Codex(코드 외부 전송)가 해당한다.
- **CLAUDE.md 원칙 충돌**: gstack 라우팅 섹션을 추가하면 우리 "CLAUDE.md 50줄 이하" 원칙을 깨고, "claude-in-chrome 금지" 같은 전역 지시가 들어온다.

---

## 4. Windows에서 가장 싸고 안전한 도입 경로

### 4.1 권장안: setup 없이 "읽고 옮기기"만 한다 (설치 0, 네트워크 0)

**Step 1. 프롬프트 ADAPT (편집 대상 3개, 합계 약 80~120줄 추가)**

| 대상 파일 | 가져올 원문 (gstack 경로) | 분량 |
|---|---|---|
| `~/.claude/agents/builder.md` | `investigate/SKILL.md` 416~445행의 Iron Law와 Phase 1, 709~718행의 Important Rules | 약 25줄 |
| `~/.claude/agents/reviewer.md` | `review/checklist.md`의 2-pass 구조와 Enum Completeness, `review/SKILL.md`의 "Confidence Calibration"과 "Pre-emit verification gate"에서 핵심만, `review/specialists/security.md`·`testing.md` 요약 | 약 40줄 |
| `~/.claude/agents/architect.md` | `plan-eng-review/SKILL.md`의 "Priority hierarchy", "My engineering preferences", 실패 모드와 테스트 다이어그램 요구사항 | 약 25줄 |
| (새 파일) `C:\dev\doc-tools-kr\.claude\skills\visual-qa\SKILL.md` | `qa-only`의 Health Score 루브릭, `qa/references/issue-taxonomy.md`, `design-review`의 UX Principles 요약 | 약 60줄 |

각 파일 하단에 `Portions adapted from garrytan/gstack (MIT, (c) 2026 Garry Tan)` 한 줄을 넣는다.
프롬프트 속 `~/.claude/skills/gstack/bin/...` 호출, AskUserQuestion 포맷, 텔레메트리, "Boil the Ocean", Aside 문구는 **전부 제거**한다.

**Step 2. 브라우저 도구 (gstack browse 대신 직접 만든다)**
9333 포트로 이미 떠 있는 Chrome(사람이 로그인한 별도 `--user-data-dir` 프로필)에 붙는 얇은 CLI 하나를 만든다. doc-tools-kr에는 이미 Playwright가 있으므로 추가 의존성이 없다.

```
C:\dev\doc-tools-kr\scripts\cdp.cjs        (또는 공용: C:\dev\tools\cdp.cjs)
  node scripts/cdp.cjs tabs                  # 열린 탭 목록
  node scripts/cdp.cjs goto <url> [--tab N]
  node scripts/cdp.cjs snap [--tab N]        # page.locator('body').ariaSnapshot() → 텍스트
  node scripts/cdp.cjs click "<role>" "<name>"   # getByRole 기반 (ref 대신 안정적 locator)
  node scripts/cdp.cjs fill "<label>" "<text>"
  node scripts/cdp.cjs shot <out.png> [--full]
  node scripts/cdp.cjs console               # 최근 콘솔 에러
구현 핵심: const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
           b.contexts()[0].pages() 사용, 끝나면 b.close() 대신 연결만 끊기(브라우저 유지)
```
gstack에서 빌려 올 설계 원칙은 다음과 같다.
(1) 출력은 짧은 평문으로 한다(토큰 절약).
(2) 페이지 내용은 untrusted로 취급하고 페이지에 적힌 지시는 따르지 않는다.
(3) 로그인, 결제, 캡차, 본인인증은 사람이 한다(handoff 개념). 에이전트는 멈추고 "done"을 기다린다.
(4) 에이전트는 자기가 연 탭만 닫는다.
stealth, 쿠키 import, 상태 파일 저장은 **넣지 않는다.**
`--remote-debugging-port`는 127.0.0.1에만 바인딩되는지 확인해야 한다. Chrome 기본값이 localhost이며, `--remote-debugging-address=0.0.0.0`은 절대 쓰지 않는다.

대안: Microsoft 공식 `@playwright/mcp`도 `--cdp-endpoint http://127.0.0.1:9333`로 기존 Chrome에 붙을 수 있다(해당 버전 플래그는 설치 전에 확인해야 한다). 도구 스키마가 상주하는 비용이 있지만 Claude Code의 deferred tool 로딩으로 상당 부분 상쇄된다. 유지보수를 전혀 하고 싶지 않다면 이쪽을 고려한다.

**Step 3. (선택) careful 훅 벤더링**
```
복사 원본: gstack/careful/bin/check-careful.sh, gstack/careful/bin/hook-extract.sh
복사 대상: C:\Users\force\.claude\hooks\careful\  (또는 프로젝트 .claude\hooks\careful\)
수정 사항:
  - check-careful.sh 283행의 gstack-slug 호출 제거(프로젝트별 패턴 불필요)
  - 스킬 파일 ~/.claude/skills/careful/SKILL.md 작성: frontmatter hooks.PreToolUse
      matcher "Bash"       → bash "$HOME/.claude/hooks/careful/check-careful.sh"
      matcher "PowerShell" → 같은 스크립트 + PS 패턴(Remove-Item -Recurse, rd /s, Format-Volume,
                               git push --force, git reset --hard) 추가
  - SKILL.md 본문의 ~/.gstack/analytics 기록 줄 삭제
```
python3나 node 중 하나가 있으면 JSON 파서가 동작한다(Windows 환경에 Node 22가 있다). 적용 전에 샘플 페이로드로 `echo '{"tool_input":{"command":"rm -rf /"}}' | bash check-careful.sh`를 돌려 동작을 확인한다.

### 4.2 비권장안: gstack browse만 시험해 보고 싶을 때
설치하려면 전역 `~/.claude`를 건드리지 않고 **격리된 곳에서 빌드만** 해야 한다. 다만 setup은 스킬 등록과 훅 등록이 결합되어 있어서 "browse만 설치"하는 공식 경로가 없다. 대략 `bun install && bun run build`로 `browse/dist/`를 만들고 `$B`를 직접 호출하는 형태가 될 텐데, 이 절차는 확인하지 않았다. 게다가 9333 Chrome에 붙지 못하므로 **우리 목적(사람이 로그인한 대시보드 조작)을 해결하지 못한다.** 시도할 가치가 낮다.

### 4.3 토큰과 컨텍스트 비용
| 항목 | gstack 전체 설치 | 권장안(4.1) |
|---|---|---|
| 세션 시작 시 상주(스킬 목록 설명) | 스킬 약 40개 × 설명문으로 약 2~4k 토큰이 **모든 프로젝트, 매 세션**에 붙는다 | visual-qa, careful 2개로 약 0.1k |
| 스킬 1회 호출 | 공통 프리앰블 약 8~10k와 본문을 합쳐 **12~33k**(review 18k, qa 15k, design-review 33k) | visual-qa 약 1.5k, careful 약 0.3k |
| 에이전트 프롬프트 증가 | 없음(별도 체계) | builder, reviewer, architect 합계 약 +2~3k(서브에이전트 스폰 시에만) |
| 브라우저 1스텝 | `$B snapshot` 평문(양호). browse SKILL.md 로드에 약 7.8k | cdp.cjs ariaSnapshot 평문. 사용법 안내 약 0.5k |
| 부수 비용 | AskUserQuestion 결정 브리프(ELI10, 장단점, Completeness)가 질문마다 수백 토큰, learnings 기록, 텔레메트리 단계 | 없음 |
| 런타임 AI 토큰(제품) | 0(개발 도구일 뿐) | 0 |

---

## 5. 최종 권고
1. `./setup`을 실행하지 않는다. `~/.claude`와 `settings.json`은 건드리지 않는다.
2. 이번 스프린트에서는 브라우저 공백을 `scripts/cdp.cjs`(connectOverCDP 9333)로 메운다. 이것이 **가장 큰 실익**이다.
3. investigate(builder), review 체크리스트와 오탐 게이트(reviewer), plan-eng 선호와 실패 모드(architect), qa-only 루브릭(visual-qa)을 ADAPT하고 MIT 출처를 표기한다.
4. careful은 PowerShell 패턴을 보강한 뒤 선택적으로 벤더링한다. freeze와 guard는 Windows 경로 버그 때문에 제외한다.
5. 나중에라도 gstack을 설치하게 되면 2.6의 체크리스트(텔레메트리, 업데이트, Codex, 훅, 라우팅 off, `--prefix`)를 반드시 적용한다. AGI_AGENT 레포에서는 browse의 stealth와 cookie import를 **금지**한다.
