---
draft: true
title: 병무청 모집병 지원 사진 규격
query: 병무청 모집병 지원 사진
blockedBy: "The premise is unproven: no official page shows a photo upload in the 병무청 application; the official 16-step 통합지원서 walkthrough (사이버홍보관) has no photo step, and the application site (mwpt.mma.go.kr) is a script app."
tried:
  - url: https://www.mma.go.kr/board/boardList.do?gesipan_id=317&mc=mma0002306&searchCondition=gsgjemok_nmOrhmpggsgeul_cn&searchKeyword=%EC%82%AC%EC%A7%84
    result: 'HTTP 200, 166,440 bytes: FAQ search "사진" returns one item (입영 시 필수 준비물); no application photo spec.'
    date: '2026-10-02'
  - url: https://www.mma.go.kr/contents.do?mc=mma0000386
    result: 'HTTP 200, 173,098 bytes (안내 및 지원절차): no photo text apart from the site menu.'
    date: '2026-10-02'
  - url: https://www.mma.go.kr/board/boardList.do?gesipan_id=118&mc=usr0000155&searchCondition=gsgjemok_nmOrhmpggsgeul_cn&searchKeyword=%EC%82%AC%EC%A7%84
    result: 'HTTP 200: 육군 FAQ search "사진" has no results (also 해군 119, 해병대 120, 취업맞춤특기병 314; 공군 121 only 입영 준비물).'
    date: '2026-10-02'
  - url: https://mwpt.mma.go.kr/caisBMHS/index_mwps.jsp?menuNo=22041
    result: 'HTTP 200, 288,197 bytes of script, 4 characters of text; in chrome-cdp the tab stopped responding (closed via the DevTools endpoint).'
    date: '2026-10-02'
  - url: https://www.mma.go.kr/board/boardView.do?gesipan_id=284&gsgeul_no=1497726&mc=mma0001958
    result: '사이버홍보관 통합지원서 작성하기: the official 16-step walkthrough has no photo step.'
    date: '2026-10-30'
---
