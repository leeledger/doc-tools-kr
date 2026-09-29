# 커스텀 도메인 연결 절차 (Polish P.19)

한 줄에 한 작업만 합니다. 각 작업 뒤의 "확인"을 통과해야 다음으로 넘어갑니다. 문제가 생기면 11번(되돌리기)을 따릅니다.

1. 영문(ASCII) 도메인을 정합니다. 한글 도메인(IDN)은 나중에 보조 주소로만 씁니다.
   - 확인: 등록기관 관리 화면에서 도메인 상태가 "사용 중"입니다.
2. Cloudflare Pages 프로젝트 `doc-tools-kr` → Custom domains에서 도메인을 추가합니다.
   - 확인: 도메인 상태가 "Active"이고 인증서가 발급되어 있습니다.
3. Settings → Environment variables에서 **Production에만** `PUBLIC_SITE_URL=https://도메인`을 넣고 다시 배포합니다. Preview는 pages.dev 그대로 둡니다.
   - 확인: `https://도메인/`의 페이지 소스에서 `<link rel="canonical" href="https://도메인/">`와 og:url, sitemap.xml, robots.txt, manifest.webmanifest에 pages.dev가 없습니다.
4. Cloudflare 계정의 Bulk Redirects에 `doc-tools-kr.pages.dev` → `https://도메인`을 추가합니다. 301, 경로 유지, 쿼리 유지를 켭니다.
   - 확인: 목록에 규칙이 "Enabled"로 보입니다.
5. 리다이렉트를 확인합니다: `curl -I https://doc-tools-kr.pages.dev/pdf-merge/?a=1`
   - 확인: `301`과 `location: https://도메인/pdf-merge/?a=1`이 나옵니다.
6. HSTS 헤더를 확인합니다: `curl -I https://도메인/`
   - 확인: `strict-transport-security: max-age=31536000`이 있고 `includeSubDomains`, `preload`는 없습니다. (`scripts/gen-headers.mjs`가 도메인이 pages.dev가 아닐 때만 넣습니다.)
7. `PUBLIC_NAVER_SITE_VERIFICATION`과 `PUBLIC_GOOGLE_SITE_VERIFICATION`을 Production에 넣고 다시 배포한 뒤, 네이버 서치어드바이저와 Google Search Console에서 소유 확인을 하고 `https://도메인/sitemap.xml`을 제출합니다.
   - 확인: 두 콘솔 모두 "소유 확인 완료"이고 사이트맵 상태가 "성공"입니다.
8. 카카오 공유 디버거(developers.kakao.com → 도구 → 공유 디버거)에서 `https://도메인/`의 캐시를 초기화합니다.
   - 확인: 미리보기에 "안올림" 제목과 새 OG 이미지(`/brand/og.png`)가 나옵니다.
9. 배포 자산을 점검합니다: `npm run smoke:assets -- https://도메인`
   - 확인: `smoke:assets: OK`가 나옵니다.
10. (나중에, 선택) 도메인이 몇 달 동안 문제없이 운영되면 HSTS에 `includeSubDomains; preload`를 더하고 hstspreload.org에 등록할지 운영자가 정합니다.
    - 경고: preload 목록에서 빠지는 데 수개월이 걸리고, 그동안 모든 하위 도메인이 HTTPS만 쓸 수 있습니다. 되돌리기 어렵습니다.
11. 되돌리기: **먼저** Bulk Redirect 규칙을 끄거나 지우고, 그다음 Production의 `PUBLIC_SITE_URL`을 지운 뒤 다시 배포합니다. (순서를 바꾸면 pages.dev가 noindex인 채로 도메인으로 보내지 못하는 구간이 생깁니다.)
    - 확인: `curl -I https://doc-tools-kr.pages.dev/`가 `200`이고 `x-robots-tag: noindex`가 없습니다.
